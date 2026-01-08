# Copyright (c) 2024, Samuael Ketema and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def get_data(data=None):
	"""
	Override dashboard data for Timesheet to include Purchase Invoice in references.
	"""
	if data is None:
		data = frappe._dict()
	
	# Ensure fieldname is set (used for linking documents)
	if not data.fieldname:
		data.fieldname = "time_sheet"
	
	# Set non_standard_fieldnames for Purchase Invoice (uses 'timesheet' instead of 'time_sheet')
	if not data.non_standard_fieldnames:
		data.non_standard_fieldnames = {}
	
	data.non_standard_fieldnames["Purchase Invoice"] = "timesheet"
	
	# Ensure transactions list exists
	if not data.transactions:
		data.transactions = []
	
	# Find or create the References transaction group
	references_group = None
	for transaction in data.transactions:
		if transaction.get("label") == _("References"):
			references_group = transaction
			break
	
	if references_group:
		# Add Purchase Invoice if not already present
		if "Purchase Invoice" not in references_group.get("items", []):
			references_group["items"].append("Purchase Invoice")
	else:
		# Create new References group with both Sales Invoice and Purchase Invoice
		data.transactions.append({
			"label": _("References"),
			"items": ["Sales Invoice", "Purchase Invoice"]
		})
	
	return data

