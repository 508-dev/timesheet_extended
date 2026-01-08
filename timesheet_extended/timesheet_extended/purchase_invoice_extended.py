# Copyright (c) 2024, Samuael Ketema and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def update_timesheet_from_purchase_invoice(doc, method=None):
	"""
	Update Timesheet when Purchase Invoice is submitted.
	Links Purchase Invoice to Timesheet and updates status.
	"""
	if not doc or not hasattr(doc, 'timesheet') or not doc.timesheet:
		return
	
	try:
		timesheet = frappe.get_doc("Timesheet", doc.timesheet)
		timesheet.purchase_invoice = doc.name
		timesheet.purchase_invoice_status = "Billed"
		timesheet.flags.ignore_validate_update_after_submit = True
		timesheet.save(ignore_permissions=True)
	except Exception as e:
		frappe.log_error(f"Error updating timesheet from purchase invoice: {str(e)}")


def unlink_timesheet_from_purchase_invoice(doc, method=None):
	"""
	Unlink Timesheet when Purchase Invoice is cancelled.
	"""
	if not doc or not hasattr(doc, 'timesheet') or not doc.timesheet:
		return
	
	try:
		timesheet = frappe.get_doc("Timesheet", doc.timesheet)
		timesheet.purchase_invoice = None
		timesheet.purchase_invoice_status = "Not Created"
		timesheet.flags.ignore_validate_update_after_submit = True
		timesheet.save(ignore_permissions=True)
	except Exception as e:
		frappe.log_error(f"Error unlinking timesheet from purchase invoice: {str(e)}")

