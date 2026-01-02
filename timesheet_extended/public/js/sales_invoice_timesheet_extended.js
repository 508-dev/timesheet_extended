// Copyright (c) 2024, Samuael Ketema and contributors
// For license information, please see license.txt

/**
 * Extended Sales Invoice Timesheet functionality
 * Groups timesheets by employee/engineer and creates separate line items per employee
 */

frappe.provide("timesheet_extended.sales_invoice");

// Override the add_timesheet_data function
timesheet_extended.sales_invoice.add_timesheet_data = function(frm, kwargs) {
	if (kwargs === "Sales Invoice") {
		kwargs = {};
	}

	if (!Object.prototype.hasOwnProperty.call(kwargs, "project") && frm.doc.project) {
		kwargs.project = frm.doc.project;
	}

	// Use custom function that includes employee data
	frappe.call({
		method: "timesheet_extended.timesheet_extended.timesheet_utils.get_projectwise_timesheet_data_with_employee",
		args: kwargs,
		freeze: true,
		callback: function(r) {
			if (!r.exc && r.message && r.message.length > 0) {

				const timesheets = r.message;
				const groupedByEmployee = timesheet_extended.sales_invoice.group_timesheets_by_employee(timesheets);
				if (kwargs.item_code) {
					timesheet_extended.sales_invoice.add_timesheet_items_by_employee(frm, kwargs.item_code, groupedByEmployee);
				}
			
				timesheet_extended.sales_invoice.set_timesheet_data(frm, timesheets);
			} else {
				frappe.show_alert({
					message: __("No timesheets found for the selected criteria"),
					indicator: "orange"
				});
			}
		}
	});
};

// Group timesheets by employee
timesheet_extended.sales_invoice.group_timesheets_by_employee = function(timesheets) {
	const grouped = {};
	
	timesheets.forEach(function(timesheet) {
		const employee = timesheet.employee || "No Employee";
		const employeeName = timesheet.employee_name || "No Employee";
		
		if (!grouped[employee]) {
			grouped[employee] = {
				employee: employee,
				employee_name: employeeName,
				timesheets: [],
				total_billing_hours: 0,
				total_billing_amount: 0,
				billing_rate: null,
				weighted_rate_sum: 0,
				weighted_hours_sum: 0
			};
		}
		
		grouped[employee].timesheets.push(timesheet);
		grouped[employee].total_billing_hours += flt(timesheet.billing_hours || 0);
		grouped[employee].total_billing_amount += flt(timesheet.billing_amount || 0);
		
		let rate = 0;
		if (timesheet.billing_rate && timesheet.billing_rate > 0) {
			rate = flt(timesheet.billing_rate);
		} else if (timesheet.billing_hours && timesheet.billing_hours > 0 && timesheet.billing_amount) {
			rate = flt(timesheet.billing_amount) / flt(timesheet.billing_hours);
		}
		
		if (rate > 0 && timesheet.billing_hours > 0) {
			grouped[employee].weighted_rate_sum += rate * flt(timesheet.billing_hours);
			grouped[employee].weighted_hours_sum += flt(timesheet.billing_hours);
		}
	});
	
	Object.keys(grouped).forEach(function(employee) {
		const group = grouped[employee];
		if (group.weighted_hours_sum > 0) {
			group.billing_rate = group.weighted_rate_sum / group.weighted_hours_sum;
		} else if (group.total_billing_hours > 0 && group.total_billing_amount > 0) {
			group.billing_rate = group.total_billing_amount / group.total_billing_hours;
		}
	});
	
	return grouped;
};

// Add item lines per employee
timesheet_extended.sales_invoice.add_timesheet_items_by_employee = function(frm, item_code, groupedByEmployee) {
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
		
		if (group.total_billing_hours > 0 && group.billing_rate > 0) {
			const row = frm.add_child("items");
			const rowName = row.name;
			const rowDoctype = row.doctype;
			const customRate = group.billing_rate;
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
				
				frappe.model.set_value(rowDoctype, rowName, "qty", group.total_billing_hours)
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

timesheet_extended.sales_invoice.set_timesheet_data = function(frm, timesheets) {
	frm.clear_table("timesheets");
	
	let processed = 0;
	const total = timesheets.length;
	
	if (total === 0) {
		frm.trigger("calculate_timesheet_totals");
		frm.refresh();
		return;
	}
	
	timesheets.forEach(function(timesheet) {
		if (frm.doc.currency != timesheet.currency) {
			timesheet_extended.sales_invoice.get_exchange_rate(
				frm,
				timesheet.currency,
				frm.doc.currency
			).then(function(exchange_rate) {
				timesheet_extended.sales_invoice.append_time_log(frm, timesheet, exchange_rate);
				processed++;
				if (processed === total) {
					frm.trigger("calculate_timesheet_totals");
					frm.refresh();
				}
			});
		} else {
			timesheet_extended.sales_invoice.append_time_log(frm, timesheet, 1.0);
			processed++;
			if (processed === total) {
				frm.trigger("calculate_timesheet_totals");
				frm.refresh();
			}
		}
	});
};

// Get exchange rate
timesheet_extended.sales_invoice.get_exchange_rate = function(frm, from_currency, to_currency) {
	return new Promise(function(resolve) {
		if (
			frm.exchange_rates &&
			frm.exchange_rates[from_currency] &&
			frm.exchange_rates[from_currency][to_currency]
		) {
			resolve(frm.exchange_rates[from_currency][to_currency]);
			return;
		}

		frappe.call({
			method: "erpnext.setup.utils.get_exchange_rate",
			args: {
				from_currency: from_currency,
				to_currency: to_currency,
			},
			callback: function(r) {
				if (r.message) {
					frm.exchange_rates = frm.exchange_rates || {};
					frm.exchange_rates[from_currency] = frm.exchange_rates[from_currency] || {};
					frm.exchange_rates[from_currency][to_currency] = r.message;
				}
				resolve(r.message || 1.0);
			},
		});
	});
};

timesheet_extended.sales_invoice.append_time_log = function(frm, time_log, exchange_rate) {
	const row = frm.add_child("timesheets");
	row.activity_type = time_log.activity_type;
	row.description = time_log.description;
	row.time_sheet = time_log.time_sheet;
	row.from_time = time_log.from_time;
	row.to_time = time_log.to_time;
	row.billing_hours = time_log.billing_hours;
	row.billing_amount = flt(time_log.billing_amount) * flt(exchange_rate);
	row.timesheet_detail = time_log.name;
	row.project_name = time_log.project_name;
};

frappe.ui.form.on("Sales Invoice Item", {
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

// Override the refresh function to replace the timesheet button with our custom one
frappe.ui.form.on("Sales Invoice", {
	refresh: function(frm) {
		if (frm.doc.docstatus === 0 && !frm.doc.is_return) {
			setTimeout(function() {
				frm.page.remove_inner_button(__("Timesheet"), __("Get Items From"));
				
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
												is_sales_item: 1,
												customer: frm.doc.customer,
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
								timesheet_extended.sales_invoice.add_timesheet_data(frm, {
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

