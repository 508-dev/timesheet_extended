# Copyright (c) 2024, Samuael Ketema and contributors
# For license information, please see license.txt

import frappe
from frappe import _


@frappe.whitelist()
def get_projectwise_timesheet_data_with_employee(project=None, parent=None, from_time=None, to_time=None):
	"""
	Extended version of get_projectwise_timesheet_data that includes employee information
	and billing_rate for grouping by employee/engineer.
	"""
	condition = ""
	if project:
		condition += "AND tsd.project = %(project)s "
	if parent:
		condition += "AND tsd.parent = %(parent)s "
	if from_time and to_time:
		condition += "AND CAST(tsd.from_time as DATE) BETWEEN %(from_time)s AND %(to_time)s"

	query = f"""
		SELECT
			tsd.name as name,
			tsd.parent as time_sheet,
			tsd.from_time as from_time,
			tsd.to_time as to_time,
			tsd.billing_hours as billing_hours,
			tsd.billing_amount as billing_amount,
			tsd.billing_rate as billing_rate,
			tsd.activity_type as activity_type,
			tsd.description as description,
			ts.currency as currency,
			tsd.project as project,
			tsd.project_name as project_name,
			ts.employee as employee,
			ts.employee_name as employee_name
		FROM `tabTimesheet Detail` tsd
			INNER JOIN `tabTimesheet` ts
			ON ts.name = tsd.parent
		WHERE
			tsd.parenttype = 'Timesheet'
			AND tsd.docstatus = 1
			AND tsd.is_billable = 1
			AND tsd.sales_invoice is NULL
			{condition}
		ORDER BY ts.employee ASC, tsd.from_time ASC
	"""

	filters = {"project": project, "parent": parent, "from_time": from_time, "to_time": to_time}

	return frappe.db.sql(query, filters, as_dict=1)


@frappe.whitelist()
def get_projectwise_timesheet_data_for_purchase_invoice(project=None, parent=None, from_time=None, to_time=None):
	"""
	Extended version for Purchase Invoice that includes employee information
	and costing_rate for grouping by employee/engineer.
	Only fetches timesheets with status "Not Created" (not "Created" or "Billed").
	"""
	condition = ""
	if project:
		condition += "AND tsd.project = %(project)s "
	if parent:
		condition += "AND tsd.parent = %(parent)s "
	if from_time and to_time:
		condition += "AND CAST(tsd.from_time as DATE) BETWEEN %(from_time)s AND %(to_time)s"

	query = f"""
		SELECT
			tsd.name as name,
			tsd.parent as time_sheet,
			tsd.from_time as from_time,
			tsd.to_time as to_time,
			tsd.hours as hours,
			tsd.costing_amount as costing_amount,
			tsd.costing_rate as costing_rate,
			tsd.activity_type as activity_type,
			tsd.description as description,
			ts.currency as currency,
			tsd.project as project,
			tsd.project_name as project_name,
			ts.employee as employee,
			ts.employee_name as employee_name
		FROM `tabTimesheet Detail` tsd
			INNER JOIN `tabTimesheet` ts
			ON ts.name = tsd.parent
		WHERE
			tsd.parenttype = 'Timesheet'
			AND tsd.docstatus = 1
			AND (ts.purchase_invoice_status IS NULL OR ts.purchase_invoice_status = '' OR ts.purchase_invoice_status = 'Not Created')
			{condition}
		ORDER BY ts.employee ASC, tsd.from_time ASC
	"""

	filters = {"project": project, "parent": parent, "from_time": from_time, "to_time": to_time}

	return frappe.db.sql(query, filters, as_dict=1)


@frappe.whitelist()
def link_timesheets_to_purchase_invoice(purchase_invoice_name, timesheet_names):
	"""
	Link multiple timesheets to a Purchase Invoice and update their status to "Created".
	"""
	if not purchase_invoice_name or not timesheet_names:
		return
	
	if isinstance(timesheet_names, str):
		timesheet_names = frappe.parse_json(timesheet_names)
	
	if not isinstance(timesheet_names, list):
		timesheet_names = [timesheet_names]
	
	# Get unique timesheet names (in case of duplicates)
	unique_timesheet_names = list(set(timesheet_names))
	
	for timesheet_name in unique_timesheet_names:
		try:
			timesheet = frappe.get_doc("Timesheet", timesheet_name)
			timesheet.purchase_invoice = purchase_invoice_name
			timesheet.purchase_invoice_status = "Created"
			timesheet.flags.ignore_validate_update_after_submit = True
			timesheet.save(ignore_permissions=True)
		except Exception as e:
			frappe.log_error(f"Error linking timesheet {timesheet_name} to purchase invoice {purchase_invoice_name}: {str(e)}")
	
	return {"status": "success", "linked_count": len(unique_timesheet_names)}


@frappe.whitelist()
def make_purchase_invoice(source_name, item_code=None, supplier=None, currency=None):
	"""
	Create Purchase Invoice from Timesheet using costing rates.
	Similar to make_sales_invoice but for internal costing.
	"""
	from frappe.utils import flt
	
	target = frappe.new_doc("Purchase Invoice")
	timesheet = frappe.get_doc("Timesheet", source_name)

	if not timesheet.total_hours:
		frappe.throw(_("Invoice can't be made for zero hours"))

	hours = flt(timesheet.total_hours)
	costing_amount = flt(timesheet.total_costing_amount)
	costing_rate = costing_amount / hours if hours > 0 else 0

	target.company = timesheet.company
	target.project = timesheet.parent_project
	if supplier:
		target.supplier = supplier
		default_price_list = frappe.get_value("Supplier", supplier, "default_price_list")
		if default_price_list:
			target.buying_price_list = default_price_list

	if currency:
		target.currency = currency

	if item_code:
		target.append("items", {"item_code": item_code, "qty": hours, "rate": costing_rate})

	# Note: Purchase Invoice doesn't have a timesheets child table like Sales Invoice
	# So we just create the item line with the total hours and costing rate

	target.run_method("set_missing_values")
	
	# Link Purchase Invoice back to Timesheet (will be linked when submitted)
	target.timesheet = source_name
	
	# Update timesheet status to "Created" (will be updated to "Billed" when Purchase Invoice is submitted)
	timesheet.purchase_invoice_status = "Created"
	timesheet.purchase_invoice = None  # Will be set when Purchase Invoice is submitted
	timesheet.flags.ignore_validate_update_after_submit = True
	timesheet.save(ignore_permissions=True)

	return target
