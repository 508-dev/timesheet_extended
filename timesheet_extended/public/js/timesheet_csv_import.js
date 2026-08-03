// Copyright (c) 2024, Samuael Ketema and contributors
// For license information, please see license.txt

/**
 * Bulk CSV import for Timesheet time logs.
 *
 * Adds an "Add rows from CSV" button to the Time Logs grid toolbar, just
 * after "Add row" -- the place rows are entered by hand today.
 *
 * The dialog splits the work the way the data does: the fields that are
 * constant across an import (project, activity type, billable) are picked
 * once as normal Link selects, and only the per-row time data comes from
 * the CSV.
 *
 * Input is validated as it is typed and the import button stays disabled
 * until every row is good. Imported rows are appended to the grid for
 * review; the form is deliberately NOT saved.
 *
 * Everything lives inside an IIFE. Frappe concatenates every doctype_js
 * file for a DocType into a single script (see Meta._add_code), so this
 * file shares one top-level scope with erpnext/timesheet.js and any other
 * app's Timesheet script. A `const` collision there is a SyntaxError that
 * would take out the whole form, so nothing is declared globally.
 */

frappe.provide("timesheet_extended.csv_import");

(function () {
	"use strict";

	const CHILD_TABLE = "time_logs";
	const BUTTON_LABEL = "Add rows from CSV";

	frappe.ui.form.on("Timesheet", {
		refresh: function (frm) {
			add_csv_import_button(frm);
		},

		onload_post_render: function (frm) {
			add_csv_import_button(frm);
		},
	});

	/**
	 * Attach the button to the child-table grid toolbar, in `.grid-buttons` --
	 * the same container as "Add row".
	 *
	 * Call this on every refresh. Grid.add_custom_button() keys off the label
	 * and is idempotent, so repeat calls do not stack up duplicates; and since
	 * Grid.clear_custom_buttons() only *hides* custom buttons, re-calling is
	 * what brings ours back after a refresh that cleared it. Guarding against
	 * repeat calls would leave the button hidden.
	 *
	 * Only meaningful on a draft: the grid footer is hidden outright once the
	 * timesheet is submitted.
	 */
	function add_csv_import_button(frm) {
		if (frm.doc.docstatus !== 0) return;

		const grid = frm.fields_dict[CHILD_TABLE] && frm.fields_dict[CHILD_TABLE].grid;
		if (!grid || !grid.add_custom_button) return;

		const $btn = grid.add_custom_button(__(BUTTON_LABEL), function () {
			show_csv_import_dialog(frm);
		});

		// add_custom_button() prepends, which would push "Add row" along. Put
		// ours after it instead so "Add row" keeps its position. Re-running this
		// is harmless: the button is simply moved to where it already is.
		const $add_row = grid.wrapper.find(".grid-add-row");
		if ($btn && $add_row.length) {
			$btn.insertAfter($add_row);
		}
	}

	function show_csv_import_dialog(frm) {
		// ERPNext lets time-log overlap validation be switched off per site, in
		// Projects Settings. If both switches are on the server accepts
		// overlapping logs happily, so our pre-flight check must not end up
		// stricter than the ERP itself.
		frappe.db
			.get_doc("Projects Settings")
			.then(function (settings) {
				build_dialog(
					frm,
					Boolean(settings.ignore_user_time_overlap) &&
						Boolean(settings.ignore_employee_time_overlap)
				);
			})
			.catch(function () {
				// No read access to the Single -- stay conservative and check.
				build_dialog(frm, false);
			});
	}

	function build_dialog(frm, overlap_allowed) {
		const sample = moment("2026-08-03 09:00:00", "YYYY-MM-DD HH:mm:ss").format(
			datetime_format()
		);

		const dialog = new frappe.ui.Dialog({
			title: __("Add Rows from CSV"),
			size: "large",
			fields: [
				{
					fieldtype: "Link",
					fieldname: "project",
					label: __("Project"),
					options: "Project",
					reqd: 1,
					default: frm.doc.parent_project || "",
					onchange: revalidate,
				},
				{
					fieldtype: "Link",
					fieldname: "activity_type",
					label: __("Activity Type"),
					options: "Activity Type",
					reqd: 1,
					onchange: revalidate,
				},
				{
					fieldtype: "Check",
					fieldname: "is_billable",
					label: __("Billable"),
					default: 1,
				},
				{ fieldtype: "Section Break" },
				{
					fieldtype: "Small Text",
					fieldname: "csv_text",
					label: __("Paste CSV"),
					reqd: 1,
					// Header names the Timesheet Detail grid columns these map to,
					// using the doctype's own labels, then one example row.
					description:
						`<b>${__("From Time")}, ${__("Hrs")}, ${__("Description")} (${__(
							"optional"
						)})</b><br><code>${sample}, 2, Morning standup</code>`,
					onchange: revalidate,
				},
				{ fieldtype: "HTML", fieldname: "feedback" },
			],
			primary_action_label: __("Add Rows"),
			primary_action: function () {
				// The button is disabled unless this passes, but re-check anyway:
				// Frappe's disable_primary_action() only styles the button, it
				// does not stop a click reaching the handler.
				const state = validate(dialog, frm, overlap_allowed);
				if (!state.ok) return;

				const args = dialog.get_values();
				if (!args) return;

				// Rates are per employee + activity type, so every imported row
				// shares one. Resolve it once here rather than letting each row
				// fire its own lookup.
				//
				// This matters for more than efficiency: frm.add_child() does not
				// fire the Timesheet Detail "activity_type" handler, so without
				// this the rows would sit at zero rate and zero amount until the
				// document is saved -- and billing totals are meant to be checked
				// *before* saving.
				frappe.call({
					method: "erpnext.projects.doctype.timesheet.timesheet.get_activity_cost",
					args: {
						employee: frm.doc.employee,
						activity_type: args.activity_type,
						currency: frm.doc.currency,
					},
					freeze: true,
					callback: function (r) {
						const rates = r.message || {};

						append_rows(frm, args, state.rows, rates);
						dialog.hide();

						frappe.show_alert({
							message: __("Added {0} time log(s). Review them, then save.", [
								state.rows.length,
							]),
							indicator: "green",
						});

						warn_if_unrated(args, rates);
					},
					error: function () {
						// Leave the dialog open with the CSV intact so the import
						// can be retried. Importing at a zero rate instead would
						// quietly produce zero-value invoice lines.
						frappe.msgprint({
							title: __("Could not fetch the billing rate"),
							indicator: "red",
							message: __(
								"No rows were added because the billing rate lookup failed. Try again, and if it keeps failing check that the Activity Type and Employee are valid."
							),
						});
					},
				});
			},
		});

		// Live validation: re-run on every keystroke as well as on change, so the
		// button state tracks what is actually in the box.
		function revalidate() {
			render_feedback(dialog, validate(dialog, frm, overlap_allowed));
		}

		dialog.show();
		dialog.fields_dict.csv_text.$input.on("input", revalidate);
		revalidate();
	}

	/**
	 * Validate everything the import needs, returning both the verdict and the
	 * parsed rows so the primary action does not have to parse twice.
	 */
	function validate(dialog, frm, overlap_allowed) {
		const problems = [];
		const text = dialog.get_value("csv_text");

		if (!dialog.get_value("project")) problems.push(__("Select a Project."));
		if (!dialog.get_value("activity_type")) problems.push(__("Select an Activity Type."));

		if (!frm.doc.employee) {
			problems.push(
				__("Set the Employee on the timesheet first -- billing rates depend on it.")
			);
		}

		if (!text || !text.trim()) {
			return { ok: false, rows: [], problems: problems, empty: !problems.length };
		}

		const parsed = parse_csv(text);
		problems.push(...parsed.errors);

		if (parsed.rows.length && !overlap_allowed) {
			problems.push(...find_overlaps(frm, parsed.rows));
		}

		if (!parsed.rows.length && !parsed.errors.length) {
			problems.push(__("No data rows found."));
		}

		return { ok: !problems.length, rows: parsed.rows, problems: problems };
	}

	/** Paint the validation verdict below the CSV box. */
	function render_feedback(dialog, state) {
		const $area = dialog.fields_dict.feedback.$wrapper;

		if (state.empty) {
			$area.empty();
			dialog.disable_primary_action();
			return;
		}

		if (state.ok) {
			const hours = state.rows.reduce(function (sum, r) {
				return sum + r.hours;
			}, 0);

			$area.html(
				`<div class="text-success small">${__("{0} row(s) ready, {1} hours total.", [
					state.rows.length,
					format_number(hours, null, 2),
				])}</div>`
			);
			dialog.enable_primary_action();
			return;
		}

		$area.html(
			`<div class="text-danger small"><ul class="mb-0 pl-3"><li>${state.problems.join(
				"</li><li>"
			)}</li></ul></div>`
		);
		dialog.disable_primary_action();
	}

	/** The datetime format this site's pickers produce, e.g. "YYYY-MM-DD HH:mm:ss". */
	function datetime_format() {
		return (
			frappe.datetime.get_user_date_fmt().toUpperCase() +
			" " +
			frappe.datetime.get_user_time_fmt()
		);
	}

	/**
	 * Parse pasted CSV into {from_time, hours, description} rows.
	 *
	 * Returns every problem found rather than stopping at the first, so a
	 * messy paste can be fixed in one pass instead of one line at a time.
	 * Import is all-or-nothing: any error means no rows are added.
	 */
	function parse_csv(text) {
		const rows = [];
		const errors = [];

		const lines = (text || "")
			.replace(/^﻿/, "") // strip BOM
			.split(/\r\n|\r|\n/)
			.map(function (line, index) {
				return { text: line.trim(), number: index + 1 };
			})
			.filter(function (line) {
				return line.text !== "";
			});

		lines.forEach(function (line, index) {
			const cells = split_csv_line(line.text);
			const raw_time = (cells[0] || "").trim();
			const raw_hours = (cells[1] || "").trim();
			const description = (cells[2] || "").trim();

			const from_time = normalize_datetime(raw_time);

			// Number() rather than parseFloat(): parseFloat("2h") is 2, which
			// would import an hour count the user never wrote. Number("") is 0,
			// so the empty case is excluded first.
			const hours = raw_hours === "" ? NaN : Number(raw_hours);

			// A first line that parses as neither a datetime nor a number is a header.
			if (index === 0 && !from_time && isNaN(hours)) return;

			if (!from_time) {
				errors.push(
					__("Line {0}: {1} is not a valid date and time. Expected {2}.", [
						line.number,
						frappe.utils.escape_html(raw_time || "(empty)"),
						datetime_format(),
					])
				);
				return;
			}
			if (isNaN(hours) || hours <= 0) {
				errors.push(
					__("Line {0}: hours must be a positive number, got {1}.", [
						line.number,
						frappe.utils.escape_html(raw_hours || "(empty)"),
					])
				);
				return;
			}

			rows.push({
				line_number: line.number,
				from_time: from_time,
				to_time: moment(from_time)
					.add(Math.round(hours * 3600), "seconds")
					.format("YYYY-MM-DD HH:mm:ss"),
				hours: hours,
				description: description,
			});
		});

		return { rows: rows, errors: errors };
	}

	/** Split one CSV line, honouring double-quoted fields that contain commas. */
	function split_csv_line(line) {
		const cells = [];
		let current = "";
		let in_quotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];

			if (char === '"') {
				if (in_quotes && line[i + 1] === '"') {
					current += '"'; // escaped quote
					i++;
				} else {
					in_quotes = !in_quotes;
				}
			} else if (char === "," && !in_quotes) {
				cells.push(current);
				current = "";
			} else {
				current += char;
			}
		}
		cells.push(current);

		return cells;
	}

	/**
	 * Read a timestamp in this site's own datetime format -- whatever the
	 * Datetime pickers on the form already produce -- and return it in the
	 * format the Frappe model stores. Deliberately does not guess at other
	 * formats: an ambiguous date silently read the wrong way round would put
	 * hours on the wrong day, and these rows become invoices.
	 *
	 * Seconds are treated as optional in both directions, since spreadsheets
	 * routinely add or drop a trailing :00.
	 */
	function normalize_datetime(value) {
		if (!value) return null;

		const full = datetime_format();
		const formats = [full];

		if (full.indexOf(":ss") !== -1) {
			formats.push(full.replace(":ss", ""));
		} else if (full.indexOf(":mm") !== -1) {
			formats.push(full + ":ss");
		}

		const parsed = moment(value, formats, true); // strict
		if (!parsed.isValid()) return null;

		return parsed.format("YYYY-MM-DD HH:mm:ss");
	}

	/**
	 * ERPNext rejects overlapping time logs on save, but reports them one at a
	 * time and only after a round trip. Catch them here instead.
	 *
	 * Only incoming rows are judged -- each against every existing row and
	 * against the incoming rows before it. Two existing rows are never compared
	 * with each other: that overlap cannot be fixed from this dialog, and
	 * reporting it would disable the import button with no way out.
	 */
	function find_overlaps(frm, rows) {
		const problems = [];

		const existing = (frm.doc[CHILD_TABLE] || [])
			.filter(function (row) {
				return row.from_time && row.to_time;
			})
			.map(function (row) {
				return {
					label: __("existing row {0}", [row.idx]),
					from: moment(row.from_time),
					to: moment(row.to_time),
				};
			});

		const incoming = rows.map(function (row) {
			return {
				label: __("line {0}", [row.line_number]),
				from: moment(row.from_time),
				to: moment(row.to_time),
			};
		});

		incoming.forEach(function (b, index) {
			existing.concat(incoming.slice(0, index)).forEach(function (a) {
				// Half-open intervals: touching end-to-start is fine.
				if (a.from.isBefore(b.to) && b.from.isBefore(a.to)) {
					problems.push(__("{0} overlaps {1}.", [b.label, a.label]));
				}
			});
		});

		return problems;
	}

	/** Append parsed rows to the grid. Deliberately does not save the form. */
	function append_rows(frm, args, rows, rates) {
		const added = rows.map(function (row) {
			const child = frm.add_child(CHILD_TABLE, {
				activity_type: args.activity_type,
				project: args.project,
				is_billable: args.is_billable ? 1 : 0,
				from_time: row.from_time,
				to_time: row.to_time,
				hours: row.hours,
				// Stand in for the "activity_type" handler that add_child skips.
				billing_rate: args.is_billable ? flt(rates.billing_rate) : 0,
				costing_rate: flt(rates.costing_rate),
			});

			if (row.description) {
				child.description = row.description;
			}

			return child;
		});

		frm.refresh_field(CHILD_TABLE);

		// Fire ERPNext's own "Timesheet Detail.hours" handler for each new row.
		// That is the one handler that chains end-time, billing hours, billing /
		// costing amounts and the header totals, so imported rows end up in
		// exactly the state a hand-entered row would.
		//
		// Note this is a client-side convenience only -- Timesheet.validate()
		// recalculates all of it server-side on save regardless, so the stored
		// figures are correct even if this trigger does nothing.
		added.forEach(function (child) {
			frm.script_manager.trigger("hours", child.doctype, child.name);
		});
	}

	/**
	 * A billable row with no rate produces a zero-value invoice line, which is
	 * the expensive kind of mistake here -- invoices are generated straight off
	 * this data. Say so loudly rather than letting it pass as a quiet zero.
	 */
	function warn_if_unrated(args, rates) {
		if (!args.is_billable) return;
		if (flt(rates.billing_rate) > 0) return;

		frappe.msgprint({
			title: __("No billing rate found"),
			indicator: "orange",
			message: __(
				"These rows were imported as billable, but no Activity Cost is set for this employee and activity type, so the billing rate is 0. Check the Billing Details totals before saving, and confirm the Activity Type is the right one for this project."
			),
		});
	}

	// Exposed for tests. Everything else stays private to this scope.
	Object.assign(timesheet_extended.csv_import, {
		parse_csv: parse_csv,
		split_csv_line: split_csv_line,
		normalize_datetime: normalize_datetime,
		find_overlaps: find_overlaps,
	});
})();
