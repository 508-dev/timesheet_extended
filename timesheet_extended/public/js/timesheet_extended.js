// Copyright (c) 2024, Samuael Ketema and contributors
// For license information, please see license.txt

/**
 * Extended Timesheet functionality
 * Adds "Create Purchase Invoice" button similar to "Create Sales Invoice"
 */

frappe.ui.form.on("Timesheet", {
	refresh: function (frm) {
		if (frm.doc.docstatus == 1) {
			// Add Create Purchase Invoice button if timesheet has hours and purchase invoice not created/billed
			if (
				frm.doc.total_hours && 
				frm.doc.total_hours > 0 &&
				frm.doc.purchase_invoice_status !== "Created" &&
				frm.doc.purchase_invoice_status !== "Billed"
			) {
				frm.add_custom_button(__("Create Purchase Invoice"), function () {
					frm.trigger("make_purchase_invoice");
				});
			}
			
			// Add link to Purchase Invoice if it exists (similar to Sales Invoice)
			if (frm.doc.purchase_invoice) {
				frm.add_custom_button(__("Purchase Invoice"), function () {
					frappe.set_route("Form", "Purchase Invoice", frm.doc.purchase_invoice);
				}, __("References"));
			}
		}
	},

	make_purchase_invoice: function (frm) {
		let fields = [
			{
				fieldtype: "Link",
				label: __("Item Code"),
				fieldname: "item_code",
				options: "Item",
				reqd: 1,
			},
			{
				fieldtype: "Link",
				label: __("Supplier"),
				fieldname: "supplier",
				options: "Supplier",
				reqd: 1,
			},
		];

		let dialog = new frappe.ui.Dialog({
			title: __("Create Purchase Invoice"),
			fields: fields,
		});

		dialog.set_primary_action(__("Create Purchase Invoice"), () => {
			var args = dialog.get_values();
			if (!args) return;
			if (!args.item_code) {
				frappe.msgprint(__("Please select an Item Code"));
				return;
			}
			if (!args.supplier) {
				frappe.msgprint(__("Please select a Supplier"));
				return;
			}
			dialog.hide();
			return frappe.call({
				type: "GET",
				method: "timesheet_extended.timesheet_extended.timesheet_utils.make_purchase_invoice",
				args: {
					source_name: frm.doc.name,
					item_code: args.item_code,
					supplier: args.supplier,
					currency: frm.doc.currency,
				},
				freeze: true,
				callback: function (r) {
					if (!r.exc) {
						frappe.model.sync(r.message);
						frappe.set_route("Form", r.message.doctype, r.message.name);
					}
				},
			});
		});
		dialog.show();
	},
});

