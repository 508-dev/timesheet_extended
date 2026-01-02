app_name = "timesheet_extended"
app_title = "Timesheet Extended"
app_publisher = "Samuael Ketema"
app_description = "An app that modifies the current flow of createing slaes invoice from timehseet. It allows more control and configuration."
app_email = "lijsamuael@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "timesheet_extended",
# 		"logo": "/assets/timesheet_extended/logo.png",
# 		"title": "Timesheet Extended",
# 		"route": "/timesheet_extended",
# 		"has_permission": "timesheet_extended.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/timesheet_extended/css/timesheet_extended.css"
# app_include_js = "/assets/timesheet_extended/js/timesheet_extended.js"

# include js, css files in header of web template
# web_include_css = "/assets/timesheet_extended/css/timesheet_extended.css"
# web_include_js = "/assets/timesheet_extended/js/timesheet_extended.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "timesheet_extended/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {"Sales Invoice" : "public/js/sales_invoice_timesheet_extended.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "timesheet_extended/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "timesheet_extended.utils.jinja_methods",
# 	"filters": "timesheet_extended.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "timesheet_extended.install.before_install"
# after_install = "timesheet_extended.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "timesheet_extended.uninstall.before_uninstall"
# after_uninstall = "timesheet_extended.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "timesheet_extended.utils.before_app_install"
# after_app_install = "timesheet_extended.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "timesheet_extended.utils.before_app_uninstall"
# after_app_uninstall = "timesheet_extended.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "timesheet_extended.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"timesheet_extended.tasks.all"
# 	],
# 	"daily": [
# 		"timesheet_extended.tasks.daily"
# 	],
# 	"hourly": [
# 		"timesheet_extended.tasks.hourly"
# 	],
# 	"weekly": [
# 		"timesheet_extended.tasks.weekly"
# 	],
# 	"monthly": [
# 		"timesheet_extended.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "timesheet_extended.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "timesheet_extended.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "timesheet_extended.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "timesheet_extended.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["timesheet_extended.utils.before_request"]
# after_request = ["timesheet_extended.utils.after_request"]

# Job Events
# ----------
# before_job = ["timesheet_extended.utils.before_job"]
# after_job = ["timesheet_extended.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"timesheet_extended.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

