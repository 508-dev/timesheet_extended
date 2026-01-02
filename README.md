### Timesheet Extended

An app that modifies the current flow of createing slaes invoice from timehseet. It allows more control and configuration.

### Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

Get the app
```
bench get-app https://github.com/lijsamuael/timesheet_extended --branch develop
```
Install into your site
```
bench --site [site name] install-app timesheet_extended
```
Clear the cache to see the effect
```
bench clear cache
```
Restart the bench
```
bench restart
```

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/timesheet_extended
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### License

mit
