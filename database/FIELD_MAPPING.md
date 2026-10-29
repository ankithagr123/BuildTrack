# Frontend-to-database field mapping

This mapping was checked against the current `index.html` forms and the actual JavaScript controllers and `DataStore` in `js/`. The browser currently reads and writes LocalStorage; the SQLite schema is its backend data contract, not a live connection. Schema version 5 validates every persisted date as a real calendar date in canonical `YYYY-MM-DD` format and supports multiple stakeholder profile records. Existing rows are preserved during migration and are never silently rewritten.

## Stored records and fields

| Frontend record and fields | SQLite table and columns | Frontend options, defaults, and rules |
|---|---|---|
| Project: `id`, `name`, `client`, `location`, `manager`, `startDate`, `expectedCompletionDate`, `budget`, `progress`, `status`, `description` | `projects`: `id`, `name`, `client`, `location`, `manager`, `start_date`, `expected_completion_date`, `budget`, `progress`, `status`, `description` | Text ID such as `PRJ-01`; project statuses are `ongoing`, `planning`, `delayed`, `completed`. HTML budget is at least 10,000 with a 5,000 step. Start must not be later than completion (equal dates pass the JavaScript check). Progress is clamped to 0–100. Database `CHECK`s on fresh files enforce date validity, and version-4 triggers apply the same date rule to existing files. Earlier migrations also enforce project budget/date-order, wage, skill, and category rules. `spent` is not stored; see calculations. |
| Task: `id`, `projectId`, `title`, `description`, `assignedTo`, `startDate`, `dueDate`, `priority`, `status` | `tasks`: `id`, `project_id`, `title`, `description`, `assigned_to`, `start_date`, `due_date`, `priority`, `status` | Priority: `high`, `medium`, `low`; status: `todo`, `in-progress`, `completed`. Start is optional, due date required. Assignee is a free-text label, not a worker foreign key. No frontend check requires start date to precede due date, so the database does not add one. |
| Worker: `id`, `name`, `skill`, `phone`, `assignedProjectId`, `dailyWage`, `availability`, `status` | `workers`: `id`, `name`, `skill`, `phone`, `assigned_project_id`, `daily_wage`, `availability`, `status` | Worker IDs are text. Skill is restricted to the 12 exact form options. Wage input min is 300, step 50; database enforces it for new/changed values. Availability is exactly `On Site` or `Available`; worker record `status` is set to `active` by the form. No inactive toggle exists. |
| Attendance map `{date: {workerId: status}}` | `attendance`: `date`, `worker_id`, `status` | Converted from nested LocalStorage data to one row per date and worker; composite primary key `(date, worker_id)`. Status is `present`, `absent`, or `leave`. This is separate from worker availability. Deleting a worker removes that worker's attendance, matching the frontend worker delete message. |
| Material: `id`, `name`, `category`, `unit`, `quantity`, `minStockLevel`, `unitPrice`, `supplier`, `assignedProjectId`, `lastUpdated` | `materials`: `id`, `name`, `category`, `unit`, `quantity`, `min_stock_level`, `unit_price`, `supplier`, `assigned_project_id`, `last_updated` | Category is restricted to the eight frontend options: `Cement & Aggregates`, `Steel & Structural Metals`, `Bricks & Masonry`, `Electrical & Lighting`, `Plumbing & Sanitary`, `Finishes & Paints`, `Chemicals & Admixtures`, `Safety & Site Gear`. Text units are user-defined. Quantity, reorder level, and unit price allow fractional values and must be nonnegative. Blank project assignment means Global Central Yard. |
| Nested material `usageHistory[]`: `date`, `type`, `quantity`, `notes`, `projectId` | `stock_transactions`: `id`, `material_id`, `date`, `type`, `quantity`, `notes`, `project_id` | History is normalized to rows; type is `in`/`out`, quantity is positive. `stock_in()` and `stock_out()` atomically change `materials.quantity` and append the history row. Stock-out cannot exceed balance. The frontend defaults the movement project to the assigned project when no project is chosen. |
| Expense: `id`, `title`, `projectId`, `category`, `amount`, `date`, `paymentMethod`, `description` | `expenses`: `id`, `title`, `project_id`, `category`, `amount`, `date`, `payment_method`, `description` | Category: `Materials`, `Labour`, `Equipment`, `Transport`, `Other`. Amount must be positive in JavaScript. Payment method is stored as text because seed data includes values with cheque details beyond the form list. Missing date in the JavaScript handler defaults to today. |
| Payment: `id`, `paymentRef`, `projectId`, `recipient`, `amount`, `date`, `status`, `paymentMethod`, `notes` | `payments`: `id`, `payment_ref`, `project_id`, `recipient`, `amount`, `date`, `status`, `payment_method`, `notes` | Payment reference is generated when absent (`PAY-<year>-<random>`). Status: `Paid`, `Pending`, `Failed`; the ledger can toggle Paid/Pending. Amount is positive. Form payment methods include RTGS, NEFT, Cheque, UPI; seeded methods can contain descriptive suffixes, so the column remains text. Payments are disbursements, not expenses. |
| Daily progress report: `id`, `projectId`, `date`, `workCompleted`, `progressPercentage`, `workersPresent`, `materialsConsumed`, `issuesEncountered`, `delayBlockers`, `nextDayPlan`, `reportedBy` | `progress_reports`: matching snake_case columns (`project_id`, `work_completed`, `progress_percentage`, `workers_present`, `materials_consumed`, `issues_encountered`, `delay_blockers`, `next_day_plan`, `reported_by`) plus `id` and `date` | Project/date required by form; numeric progress 0–100 and turnout nonnegative. Empty narrative values are replaced in the frontend with defaults such as `None` and `Proceed as per plan`. `save_progress_report()` writes the DPR and project progress in one transaction; at 100 it sets project status to completed, below 100 it preserves status. The frontend's `DataStore` skips project synchronization when progress is exactly zero because it uses a truthiness check; this edge case is documented in `DATABASE_AUDIT.md`. |
| Company settings: `companyName`, `contractorName`, `email`, `phone`, `gstin`, `licenseNumber`, `currency`, `currencySymbol`, `dateFormat`, `theme`, `notifications.budgetThreshold`, `notifications.overdueTasks`, `notifications.lowStockAlerts`, `notifications.deadlineAlertsDays` | Singleton `company_settings` (`id=1`): matching snake_case fields, with notification fields stored as `budget_threshold`, `overdue_tasks`, `low_stock_alerts`, `deadline_alerts_days` | The visible form edits company name/contact/tax/license fields and `budgetThreshold` (50–100); theme changes in the UI but is not saved by its change handler. Currency is fixed/disabled; date format and the remaining notification values exist only in seeded settings. Theme choices are `light`/`dark`. |
| Stakeholder profile: `id`, `name`, `role`, `email`, `avatar` | `user_profiles`: integer auto ID, name, role, case-insensitive unique email, avatar | Multiple profiles; role is constrained to Contractor / Admin, Site Engineer / Supervisor, Storekeeper, or Client / Project Owner. These are profile records, not authentication credentials, registration verification, or sessions. The frontend role choice is prototype-only and keeps the active display profile in `buildtrack_current_user`. |

## Values that are calculated or temporary

| Frontend value/operation | Source of truth / database treatment |
|---|---|
| Project `spent`, remaining budget, utilization | `project_financial_summary` calculates `SUM(expenses.amount)` and `budget - spent`. Do not store duplicate totals. Demo `spent` seed values disagree with the limited demo expense ledger; after expense edits the frontend recalculates from expense rows. |
| Dashboard KPI cards and charts | Calculated from project, expense, payment, task, material, worker, attendance, and progress records. Counts, totals, category slices, monthly series, overdue flags, wage estimates, stock valuation, and progress averages are not separate stored entities. |
| Reports and CSV export | `js/reports.js` builds six report types (progress, finance, labour, materials, payments, tasks) from the same records and exports a temporary CSV in the browser. No report snapshot/export table is present. |
| Risk alerts | `js/risks.js` computes rules-based budget, schedule, stock, and attendance risks on demand. They are not persisted. The UI's AI language is not evidence of a stored prediction/history feature. |
| Search, filters, selected project, tabs, chart series, modal state, toast/notification display | Temporary UI state; not database fields. |
| `buildtrack_initialized_v2` | LocalStorage seed marker only; do not store as business data. |

## Relationships and deletion rules

- `tasks.project_id`, `expenses.project_id`, `payments.project_id`, and `progress_reports.project_id` each require one project.
- `workers.assigned_project_id` and `materials.assigned_project_id` are nullable; material forms explicitly include Global Central Yard. The worker form presents only project choices and marks the selector required, but an empty project list makes a no-assignment worker possible; this relationship remains nullable for now.
- `stock_transactions.material_id` requires a material; `stock_transactions.project_id` is optional.
- All project foreign keys use `ON DELETE RESTRICT`; `delete_project()` reports blockers and never deletes or detaches child rows. The frontend currently removes a project from its LocalStorage array without cleaning children. The database deliberately protects history instead.
- Attendance and stock history use `ON DELETE CASCADE` from their owner worker/material. The frontend explicitly says worker deletion removes attendance; material history is nested and the UI removes it with the material.

## Storage keys and CRUD operations

`js/data.js` uses these browser keys: `buildtrack_projects`, `buildtrack_tasks`, `buildtrack_labour`, `buildtrack_materials`, `buildtrack_expenses`, `buildtrack_payments`, `buildtrack_progress`, `buildtrack_settings`, `buildtrack_current_user`, `buildtrack_attendance`, and `buildtrack_initialized_v2`.

Projects, tasks, workers, materials, expenses, payments, and progress reports have save/delete operations. Tasks can also update status directly. Attendance saves/replaces the worker-status map for one day. Payments can be marked Paid/Pending. Company settings are a singleton; profiles can be saved by ID or upserted by email. The prototype reset replaces all seed collections in LocalStorage; there is no SQLite reset/import path.

Date columns are validated as canonical calendar dates, not only values that SQLite can parse. The guarded fields are project `start_date` and `expected_completion_date`; task `start_date` and `due_date`; attendance, stock transaction, expense, payment, and progress-report `date`; and material `last_updated`. Optional dates may remain `NULL`. Existing invalid historical values, if present, remain untouched by migration 4 and must be explicitly reviewed.

The full module-by-module evidence, current differences, and open questions are in [`DATABASE_AUDIT.md`](DATABASE_AUDIT.md). Schema migration history is documented in [`README.md`](README.md#schema-migrations).

## Database helper functions

The shared helpers in `database/db.py` cover the frontend's current database operations without defining HTTP routes:

| Frontend operation | Database helper |
|---|---|
| List/view projects with spending shown | `list_projects()`, `get_project(id)` (includes derived `spent`) |
| List/filter records and get a row by ID | `list_records(table, project_id=None, date_filter=None)`, `get_record(table, id)` |
| Create/edit ordinary projects, tasks, workers, materials, expenses, payments, settings, profile | `save_record(table, fields)` using database column names |
| Delete ordinary child records | `delete_record(table, id)`; project deletion delegates to `delete_project()` |
| Read/replace one date's attendance map | `get_attendance_for_date(date)`, `save_attendance_for_date(date, map)` |
| Receive/issue material and maintain balance/history | `stock_in()`, `stock_out()` |
| Save DPR and synchronize project progress | `save_progress_report()` |
| Dashboard, finance, attendance, stock, chart and report queries | `get_dashboard_summary()`, `get_financial_summary()`, `get_attendance_summary()`, `get_inventory_summary()`, `get_expense_chart_data()`, `get_project_chart_data()`, `get_report_records()` |

`save_record()` rejects columns that do not exist in the schema, including the frontend's derived `spent` property. Stock transactions and progress reports must use their specialized atomic helpers. Report helpers return raw database rows plus documented calculated fields; the backend can format values and convert database snake_case fields to frontend camelCase in its response layer.
