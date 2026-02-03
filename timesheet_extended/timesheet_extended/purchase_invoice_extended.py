# Copyright (c) 2024, Samuael Ketema and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def update_timesheet_from_purchase_invoice(doc, method=None):
    """
    Update Timesheet when Purchase Invoice is submitted.
    Links Purchase Invoice to Timesheet and updates status.
    Handles both single timesheet (via timesheet field) and multiple timesheets (via purchase_invoice field).
    """
    if not doc:
        return

    # Handle single timesheet linked via timesheet field
    if hasattr(doc, "timesheet") and doc.timesheet:
        try:
            timesheet = frappe.get_doc("Timesheet", doc.timesheet)
            timesheet.purchase_invoice = doc.name
            timesheet.purchase_invoice_status = "Billed"
            timesheet.flags.ignore_validate_update_after_submit = True
            timesheet.save(ignore_permissions=True)
        except Exception as e:
            frappe.log_error(
                f"Error updating timesheet from purchase invoice: {str(e)}")

    # Handle multiple timesheets linked via purchase_invoice field
    # Find all timesheets that have this Purchase Invoice linked but status is still "Created"
    try:
        timesheets = frappe.get_all(
            "Timesheet",
            filters={"purchase_invoice": doc.name,
                     "purchase_invoice_status": "Created"},
            pluck="name",
        )

        for timesheet_name in timesheets:
            try:
                timesheet = frappe.get_doc("Timesheet", timesheet_name)
                timesheet.purchase_invoice_status = "Billed"
                timesheet.flags.ignore_validate_update_after_submit = True
                timesheet.save(ignore_permissions=True)
            except Exception as e:
                frappe.log_error(
                    f"Error updating timesheet {timesheet_name} from purchase invoice {doc.name}: {str(e)}"
                )
    except Exception as e:
        frappe.log_error(f"Error fetching timesheets for purchase invoice {doc.name}: {str(e)}")


def unlink_timesheet_from_purchase_invoice(doc, method=None):
    """
    Unlink Timesheet when Purchase Invoice is cancelled.
    Handles both single timesheet (via timesheet field) and multiple timesheets (via purchase_invoice field).
    """
    if not doc:
        return

    # Handle single timesheet linked via timesheet field
    if hasattr(doc, "timesheet") and doc.timesheet:
        try:
            timesheet = frappe.get_doc("Timesheet", doc.timesheet)
            timesheet.purchase_invoice = None
            timesheet.purchase_invoice_status = "Not Created"
            timesheet.flags.ignore_validate_update_after_submit = True
            timesheet.save(ignore_permissions=True)
        except Exception as e:
            frappe.log_error(
                f"Error unlinking timesheet from purchase invoice: {str(e)}")

    # Handle multiple timesheets linked via purchase_invoice field
    # Find all timesheets that have this Purchase Invoice linked
    try:
        timesheets = frappe.get_all(
            "Timesheet", filters={"purchase_invoice": doc.name}, pluck="name")

        for timesheet_name in timesheets:
            try:
                timesheet = frappe.get_doc("Timesheet", timesheet_name)
                timesheet.purchase_invoice = None
                timesheet.purchase_invoice_status = "Not Created"
                timesheet.flags.ignore_validate_update_after_submit = True
                timesheet.save(ignore_permissions=True)
            except Exception as e:
                frappe.log_error(
                    f"Error unlinking timesheet {timesheet_name} from purchase invoice {doc.name}: {str(e)}"
                )
    except Exception as e:
        frappe.log_error(f"Error fetching timesheets for purchase invoice {doc.name}: {str(e)}")
