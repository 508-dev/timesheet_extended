// Copyright (c) 2024, Samuael Ketema and contributors
// For license information, please see license.txt

/**
 * Extended Purchase Invoice Timesheet functionality
 * Groups timesheets by employee/engineer and creates separate line items per employee
 * Uses costing_rate instead of billing_rate for purchase invoices
 */

frappe.provide("timesheet_extended.purchase_invoice");

// Override the add_timesheet_data function
timesheet_extended.purchase_invoice.add_timesheet_data = function(frm, kwargs) {
	if (kwargs === "Purchase Invoice") {
		kwargs = {};
	}

	if (!Object.prototype.hasOwnProperty.call(kwargs, "project") && frm.doc.project) {
		kwargs.project = frm.doc.project;
	}

	// Use custom function that includes employee data and costing rates
	frappe.call({
		method: "timesheet_extended.timesheet_extended.timesheet_utils.get_projectwise_timesheet_data_for_purchase_invoice",
		args: kwargs,
		freeze: true,
		callback: function(r) {
			if (!r.exc && r.message && r.message.length > 0) {
				const timesheets = r.message;
				
				// Get project from timesheets (priority: kwargs.project > timesheet.project > frm.doc.project)
				let projectToSet = kwargs.project || null;
				if (!projectToSet && timesheets.length > 0) {
					// Get project from first timesheet (all should be from same project)
					projectToSet = timesheets[0].project || null;
				}
				
				// Set project on Purchase Invoice if we have a value
				if (projectToSet && projectToSet !== frm.doc.project) {
					frm.set_value("project", projectToSet);
				}
				
				// Store project for use in item rows
				timesheet_extended.purchase_invoice._currentProject = projectToSet || frm.doc.project;
				
				// Store timesheet names for linking
				const timesheet_names = timesheets.map(function(ts) {
					return ts.time_sheet;
				}).filter(function(name, index, self) {
					return self.indexOf(name) === index; // Get unique values
				});
				timesheet_extended.purchase_invoice._currentTimesheets = timesheet_names;
				
				const groupedByEmployee = timesheet_extended.purchase_invoice.group_timesheets_by_employee(timesheets);
				if (kwargs.item_code) {
					timesheet_extended.purchase_invoice.add_timesheet_items_by_employee(frm, kwargs.item_code, groupedByEmployee);
				}
			
				timesheet_extended.purchase_invoice.set_timesheet_data(frm, timesheets);
				
				// Link timesheets to Purchase Invoice and update status
				timesheet_extended.purchase_invoice.link_timesheets_to_purchase_invoice(frm, timesheet_names);
			} else {
				// Show message when no matching timesheets found
				frappe.msgprint({
					title: __("No Timesheets Found"),
					message: __("There are no matching timesheets or all timesheets have already been created for purchase invoices. Please select a different date range or project."),
					indicator: "orange"
				});
			}
		}
	});
};

// Group timesheets by employee
timesheet_extended.purchase_invoice.group_timesheets_by_employee = function(timesheets) {
	const grouped = {};
	
	timesheets.forEach(function(timesheet) {
		const employee = timesheet.employee || "No Employee";
		const employeeName = timesheet.employee_name || "No Employee";
		
		if (!grouped[employee]) {
			grouped[employee] = {
				employee: employee,
				employee_name: employeeName,
				timesheets: [],
				total_hours: 0,
				total_costing_amount: 0,
				costing_rate: null,
				weighted_rate_sum: 0,
				weighted_hours_sum: 0
			};
		}
		
		grouped[employee].timesheets.push(timesheet);
		grouped[employee].total_hours += flt(timesheet.hours || 0);
		grouped[employee].total_costing_amount += flt(timesheet.costing_amount || 0);
		
		// Calculate weighted average rate
		// If costing_rate is available, use it; otherwise calculate from costing_amount/hours
		let rate = 0;
		if (timesheet.costing_rate && timesheet.costing_rate > 0) {
			rate = flt(timesheet.costing_rate);
		} else if (timesheet.hours && timesheet.hours > 0 && timesheet.costing_amount) {
			rate = flt(timesheet.costing_amount) / flt(timesheet.hours);
		}
		
		if (rate > 0 && timesheet.hours > 0) {
			grouped[employee].weighted_rate_sum += rate * flt(timesheet.hours);
			grouped[employee].weighted_hours_sum += flt(timesheet.hours);
		}
	});
	
	// Calculate weighted average rate for each employee
	Object.keys(grouped).forEach(function(employee) {
		const group = grouped[employee];
		if (group.weighted_hours_sum > 0) {
			// Use weighted average rate
			group.costing_rate = group.weighted_rate_sum / group.weighted_hours_sum;
		} else if (group.total_hours > 0 && group.total_costing_amount > 0) {
			// Fallback: calculate from total amount / total hours
			group.costing_rate = group.total_costing_amount / group.total_hours;
		}
	});
	
	return grouped;
};

// Add item lines per employee
timesheet_extended.purchase_invoice.add_timesheet_items_by_employee = function(frm, item_code, groupedByEmployee) {
	const employeeKeys = Object.keys(groupedByEmployee);
	let index = 0;
	
	function addNextItem() {
		if (index >= employeeKeys.length) {
			frm.refresh_field("items");
			return;
		}
		
		const employee = employeeKeys[index];
		const group = groupedByEmployee[employee];
		index++;
		
		if (group.total_hours > 0 && group.costing_rate > 0) {
			const row = frm.add_child("items");
			const rowName = row.name;
			const rowDoctype = row.doctype;
			const customRate = group.costing_rate;
			const description = `${item_code} - ${group.employee_name || employee}`;
			
			frm.refresh_field("items");
			
			function checkRowReady() {
				const currentRow = frappe.get_doc(rowDoctype, rowName);
				if (!currentRow || !currentRow.parent || currentRow.parent !== frm.docname) {
					setTimeout(checkRowReady, 100);
					return;
				}
				
				currentRow._timesheet_extended_rate = customRate;
				
				currentRow.description = description;
				
				// Get project to set on item row
				const projectToSet = timesheet_extended.purchase_invoice._currentProject || frm.doc.project;
				
				frappe.model.set_value(rowDoctype, rowName, "qty", group.total_hours)
					.then(function() {
						// Set project on item row if available
						if (projectToSet) {
							return frappe.model.set_value(rowDoctype, rowName, "project", projectToSet);
						}
						return Promise.resolve();
					})
					.then(function() {
						return frappe.model.set_value(rowDoctype, rowName, "item_code", item_code);
					})
					.then(function() {
						frappe.model.set_value(rowDoctype, rowName, {
							rate: customRate,
							price_list_rate: customRate
						});
						
						setTimeout(function() {
							const finalRow = frappe.get_doc(rowDoctype, rowName);
							if (finalRow && finalRow._timesheet_extended_rate) {
								frappe.model.set_value(rowDoctype, rowName, {
									rate: finalRow._timesheet_extended_rate,
									price_list_rate: finalRow._timesheet_extended_rate
								});
								
								setTimeout(function() {
									const finalRow2 = frappe.get_doc(rowDoctype, rowName);
									if (finalRow2 && finalRow2._timesheet_extended_rate) {
										frappe.model.set_value(rowDoctype, rowName, {
											rate: finalRow2._timesheet_extended_rate,
											price_list_rate: finalRow2._timesheet_extended_rate
										}).then(function() {
											addNextItem();
										}).catch(function() {
											addNextItem();
										});
									} else {
										addNextItem();
									}
								}, 500);
							} else {
								addNextItem();
							}
						}, 400);
					})
					.catch(function(err) {
						console.error("Error adding item:", err);
						addNextItem();
					});
			}
			
			setTimeout(checkRowReady, 200);
		} else {
			addNextItem();
		}
	}
	
	addNextItem();
};

timesheet_extended.purchase_invoice.set_timesheet_data = function(frm, timesheets) {
	// Note: Purchase Invoice doesn't have a timesheets child table like Sales Invoice
	// So we just ensure items are created properly
	frm.refresh_field("items");
};

// Link timesheets to Purchase Invoice and update their status
timesheet_extended.purchase_invoice.link_timesheets_to_purchase_invoice = function(frm, timesheet_names) {
	if (!timesheet_names || timesheet_names.length === 0) {
		return;
	}
	
	// Only link if Purchase Invoice is saved (has a name)
	if (!frm.doc.name || frm.doc.__islocal) {
		// Purchase Invoice not saved yet, store for linking after save
		timesheet_extended.purchase_invoice._pendingTimesheets = timesheet_names;
	} else {
		// Purchase Invoice already has a name, link immediately
		frappe.call({
			method: "timesheet_extended.timesheet_extended.timesheet_utils.link_timesheets_to_purchase_invoice",
			args: {
				purchase_invoice_name: frm.doc.name,
				timesheet_names: timesheet_names
			},
			callback: function(r) {
				if (!r.exc) {
					frappe.show_alert({
						message: __("Linked {0} timesheet(s) to Purchase Invoice", [r.message.linked_count || timesheet_names.length]),
						indicator: "green"
					});
				}
			}
		});
	}
};

// Override item_code handler to preserve timesheet-extended rate
frappe.ui.form.on("Purchase Invoice Item", {
	item_code: function(frm, cdt, cdn) {
		const row = frappe.get_doc(cdt, cdn);
		if (row._timesheet_extended_rate && row._timesheet_extended_rate > 0) {
			frappe.model.set_value(cdt, cdn, {
				rate: row._timesheet_extended_rate,
				price_list_rate: row._timesheet_extended_rate
			});
			
			setTimeout(function() {
				const currentRow = frappe.get_doc(cdt, cdn);
				if (currentRow && currentRow._timesheet_extended_rate) {
					frappe.model.set_value(cdt, cdn, {
						rate: currentRow._timesheet_extended_rate,
						price_list_rate: currentRow._timesheet_extended_rate
					});
				}
			}, 200);
			
			setTimeout(function() {
				const currentRow = frappe.get_doc(cdt, cdn);
				if (currentRow && currentRow._timesheet_extended_rate) {
					frappe.model.set_value(cdt, cdn, {
						rate: currentRow._timesheet_extended_rate,
						price_list_rate: currentRow._timesheet_extended_rate
					});
				}
			}, 600);
		}
	},
	
	rate: function(frm, cdt, cdn) {
		const row = frappe.get_doc(cdt, cdn);
		if (row._timesheet_extended_rate && row._timesheet_extended_rate > 0) {
			const currentRate = flt(row.rate);
			const expectedRate = flt(row._timesheet_extended_rate);
			if (Math.abs(currentRate - expectedRate) > 0.01) {
				setTimeout(function() {
					const currentRow = frappe.get_doc(cdt, cdn);
					if (currentRow && currentRow._timesheet_extended_rate) {
						frappe.model.set_value(cdt, cdn, {
							rate: currentRow._timesheet_extended_rate,
							price_list_rate: currentRow._timesheet_extended_rate
						});
					}
				}, 100);
			}
		}
	}
});

// Override the refresh function to add timesheet button
frappe.ui.form.on("Purchase Invoice", {
	onload: function(frm) {
		// Initialize timesheet tracking
		timesheet_extended.purchase_invoice._pendingTimesheets = null;
	},
	
	after_save: function(frm) {
		// Link pending timesheets after Purchase Invoice is saved
		if (timesheet_extended.purchase_invoice._pendingTimesheets && frm.doc.name) {
			const timesheet_names = timesheet_extended.purchase_invoice._pendingTimesheets;
			timesheet_extended.purchase_invoice._pendingTimesheets = null;
			
			frappe.call({
				method: "timesheet_extended.timesheet_extended.timesheet_utils.link_timesheets_to_purchase_invoice",
				args: {
					purchase_invoice_name: frm.doc.name,
					timesheet_names: timesheet_names
				},
				callback: function(r) {
					if (!r.exc) {
						frappe.show_alert({
							message: __("Linked {0} timesheet(s) to Purchase Invoice", [r.message.linked_count || timesheet_names.length]),
							indicator: "green"
						});
					}
				}
			});
		}
	},
	
	refresh: function(frm) {
		if (frm.doc.docstatus === 0 && !frm.doc.is_return) {
			setTimeout(function() {
				frm.add_custom_button(
					__("Timesheet"),
					function () {
						let d = new frappe.ui.Dialog({
							title: __("Fetch Timesheet (Extended)"),
							fields: [
								{
									label: __("From"),
									fieldname: "from_time",
									fieldtype: "Date",
									reqd: 1,
								},
								{
									label: __("Item Code"),
									fieldname: "item_code",
									fieldtype: "Link",
									options: "Item",
									reqd: 1,
									get_query: () => {
										return {
											query: "erpnext.controllers.queries.item_query",
											filters: {
												is_purchase_item: 1,
												supplier: frm.doc.supplier,
												has_variants: 0,
											},
										};
									},
								},
								{
									fieldtype: "Column Break",
									fieldname: "col_break_1",
								},
								{
									label: __("To"),
									fieldname: "to_time",
									fieldtype: "Date",
									reqd: 1,
								},
								{
									label: __("Project"),
									fieldname: "project",
									fieldtype: "Link",
									options: "Project",
									default: frm.doc.project,
								},
							],
							primary_action: function () {
								const data = d.get_values();
								if (!data.item_code) {
									frappe.msgprint(__("Please select an Item Code"));
									return;
								}
								timesheet_extended.purchase_invoice.add_timesheet_data(frm, {
									from_time: data.from_time,
									to_time: data.to_time,
									project: data.project,
									item_code: data.item_code,
								});
								d.hide();
							},
							primary_action_label: __("Get Timesheets"),
						});
						d.show();
					},
					__("Get Items From")
				);
			}, 100);
		}
	}
});

