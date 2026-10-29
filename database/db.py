"""Small reusable SQLite access layer for BuildTrack's future API modules."""
from __future__ import annotations

import sqlite3
import math
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Mapping

DATABASE_PATH = Path(__file__).resolve().with_name("buildtrack.sqlite3")


class ProjectDeletionError(Exception):
    """Raised when a project is missing or still has dependent records."""

    def __init__(self, message: str, *, not_found: bool = False):
        super().__init__(message)
        self.not_found = not_found


# Fixed identifiers keep the shared CRUD helpers safe from SQL identifier
# injection. Values are still passed as SQLite parameters.
_RECORD_COLUMNS = {
    "projects": (
        "id", "name", "client", "location", "manager", "start_date",
        "expected_completion_date", "budget", "progress", "status", "description",
    ),
    "tasks": (
        "id", "project_id", "title", "description", "assigned_to", "start_date",
        "due_date", "priority", "status",
    ),
    "workers": (
        "id", "name", "skill", "phone", "assigned_project_id", "daily_wage",
        "availability", "status",
    ),
    "attendance": ("date", "worker_id", "status"),
    "materials": (
        "id", "name", "category", "unit", "quantity", "min_stock_level",
        "unit_price", "supplier", "assigned_project_id", "last_updated",
    ),
    "stock_transactions": (
        "id", "material_id", "date", "type", "quantity", "notes", "project_id",
    ),
    "expenses": (
        "id", "title", "project_id", "category", "amount", "date",
        "payment_method", "description",
    ),
    "payments": (
        "id", "payment_ref", "project_id", "recipient", "amount", "date",
        "status", "payment_method", "notes",
    ),
    "progress_reports": (
        "id", "project_id", "date", "work_completed", "progress_percentage",
        "workers_present", "materials_consumed", "issues_encountered",
        "delay_blockers", "next_day_plan", "reported_by",
    ),
    "company_settings": (
        "id", "company_name", "contractor_name", "email", "phone", "gstin",
        "license_number", "currency", "currency_symbol", "date_format", "theme",
        "budget_threshold", "overdue_tasks", "low_stock_alerts", "deadline_alerts_days",
    ),
    "user_profiles": ("id", "name", "role", "email", "avatar"),
}

_RECORD_ORDER = {
    "projects": "id",
    "tasks": "due_date, id",
    "workers": "id",
    "attendance": "date DESC, worker_id",
    "materials": "id",
    "stock_transactions": "date DESC, id DESC",
    "expenses": "date DESC, id",
    "payments": "date DESC, id",
    "progress_reports": "date DESC, id",
    "company_settings": "id",
    "user_profiles": "id",
}

_PROJECT_FILTER_COLUMN = {
    "projects": "id",
    "tasks": "project_id",
    "workers": "assigned_project_id",
    "materials": "assigned_project_id",
    "stock_transactions": "project_id",
    "expenses": "project_id",
    "payments": "project_id",
    "progress_reports": "project_id",
}

_DATE_FILTER_TABLES = {
    "attendance", "stock_transactions", "expenses", "payments", "progress_reports",
}

_SAVE_TABLES = {
    "projects", "tasks", "workers", "materials", "expenses", "payments",
    "company_settings", "user_profiles",
}

_DELETE_TABLES = {
    "tasks", "workers", "materials", "expenses", "payments", "progress_reports",
}

_SINGLETON_TABLES = {"company_settings"}


def _scope_project_id(project_id: str | None) -> str | None:
    """Convert the frontend's all/empty selector values to no project filter."""
    return project_id if project_id and project_id != "all" else None


def connect(path: str | Path | None = None) -> sqlite3.Connection:
    """Open a connection with row objects and foreign-key enforcement enabled."""
    connection = sqlite3.connect(str(path or DATABASE_PATH))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    enabled = connection.execute("PRAGMA foreign_keys").fetchone()[0]
    if enabled != 1:
        connection.close()
        raise RuntimeError("SQLite foreign-key enforcement could not be enabled")
    return connection


@contextmanager
def transaction(path: str | Path | None = None) -> Iterator[sqlite3.Connection]:
    """Yield a connection and commit on success, roll back on any failure."""
    connection = connect(path)
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def get_project_spending(project_id: str, path: str | Path | None = None) -> dict | None:
    """Return voucher-derived spending and remaining budget for one project."""
    with transaction(path) as connection:
        row = connection.execute(
            "SELECT project_id, budget, spent, remaining_budget "
            "FROM project_financial_summary WHERE project_id = ?",
            (project_id,),
        ).fetchone()
        return dict(row) if row else None


def list_projects(path: str | Path | None = None) -> list[dict]:
    """List projects with expense-derived spent for frontend-compatible reads."""
    with transaction(path) as connection:
        rows = connection.execute(
            "SELECT p.*, COALESCE(s.spent, 0) AS spent "
            "FROM projects AS p LEFT JOIN project_financial_summary AS s "
            "ON s.project_id = p.id ORDER BY p.id"
        ).fetchall()
        return [dict(row) for row in rows]


def get_project(project_id: str, path: str | Path | None = None) -> dict | None:
    """Return one project with calculated spending, or None if absent."""
    with transaction(path) as connection:
        row = connection.execute(
            "SELECT p.*, COALESCE(s.spent, 0) AS spent "
            "FROM projects AS p LEFT JOIN project_financial_summary AS s "
            "ON s.project_id = p.id WHERE p.id = ?",
            (project_id,),
        ).fetchone()
        return dict(row) if row else None


def list_records(
    table: str,
    project_id: str | None = None,
    date_filter: str | None = None,
    path: str | Path | None = None,
) -> list[dict]:
    """List persisted records using optional frontend project/date filters.

    Materials assigned to the selected project include global-yard items.
    Attendance project filtering selects workers assigned to that project.
    """
    if table not in _RECORD_COLUMNS:
        raise ValueError(f"Unknown BuildTrack table: {table!r}")
    if project_id is not None and table not in _PROJECT_FILTER_COLUMN and table != "attendance":
        raise ValueError(f"Project filtering is not supported for {table!r}")
    if date_filter is not None and table not in _DATE_FILTER_TABLES:
        raise ValueError(f"Date filtering is not supported for {table!r}")

    with transaction(path) as connection:
        if table == "attendance" and project_id is not None:
            sql = (
                "SELECT a.* FROM attendance AS a JOIN workers AS w ON w.id = a.worker_id "
                "WHERE w.assigned_project_id = ?"
            )
            params: list[object] = [project_id]
            if date_filter is not None:
                sql += " AND a.date = ?"
                params.append(date_filter)
            sql += " ORDER BY a.date DESC, a.worker_id"
        else:
            sql = f"SELECT * FROM {table}"
            clauses: list[str] = []
            params = []
            if project_id is not None:
                if table == "materials":
                    clauses.append("(assigned_project_id = ? OR assigned_project_id IS NULL)")
                else:
                    clauses.append(f"{_PROJECT_FILTER_COLUMN[table]} = ?")
                params.append(project_id)
            if date_filter is not None:
                clauses.append("date = ?")
                params.append(date_filter)
            if clauses:
                sql += " WHERE " + " AND ".join(clauses)
            sql += f" ORDER BY {_RECORD_ORDER[table]}"
        rows = connection.execute(sql, params).fetchall()
        return [dict(row) for row in rows]


def get_record(
    table: str, record_id: object, path: str | Path | None = None
) -> dict | None:
    """Fetch a row by its single-column primary key."""
    if table not in _RECORD_COLUMNS:
        raise ValueError(f"Unknown BuildTrack table: {table!r}")
    if table == "attendance":
        raise ValueError("Use get_attendance_for_date() for composite-key attendance rows")
    with transaction(path) as connection:
        row = connection.execute(
            f"SELECT * FROM {table} WHERE id = ?", (record_id,)
        ).fetchone()
        return dict(row) if row else None


def save_record(
    table: str, record: Mapping[str, object], path: str | Path | None = None
) -> dict:
    """Insert or update one ordinary record using database column names.

    Stock movements must use stock_in/stock_out. Progress reports must use
    save_progress_report so project progress remains synchronized atomically.
    """
    if table not in _SAVE_TABLES:
        raise ValueError(f"Use the specialized helper to save {table!r} records")
    if not isinstance(record, Mapping):
        raise ValueError("Record data must be a mapping of database columns to values")
    if any(not isinstance(column, str) for column in record):
        raise ValueError("Record field names must be strings")
    unknown = set(record) - set(_RECORD_COLUMNS[table])
    if unknown:
        raise ValueError(f"Unknown {table} fields: {', '.join(sorted(unknown))}")
    values = dict(record)
    if table in _SINGLETON_TABLES:
        values.setdefault("id", 1)
    if table == "user_profiles" and values.get("id") is None:
        values.pop("id", None)
    if table != "user_profiles" and ("id" not in values or values["id"] is None):
        raise ValueError(f"{table} records require an id")
    if len(values) == 1 and "id" in values:
        raise ValueError(f"Provide at least one field to save for {table}")

    with transaction(path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        # Preserve the old profile upsert behavior for callers that omit IDs:
        # an existing email is updated, while a new email gets an auto ID.
        if table == "user_profiles" and "id" not in values and values.get("email"):
            existing = connection.execute(
                "SELECT id FROM user_profiles WHERE email = ? COLLATE NOCASE",
                (values["email"],),
            ).fetchone()
            if existing is not None:
                values["id"] = existing["id"]

        current = None
        if "id" in values:
            current = connection.execute(
                f"SELECT * FROM {table} WHERE id = ?", (values["id"],)
            ).fetchone()
        if current is None:
            columns = tuple(values)
            cursor = connection.execute(
                f"INSERT INTO {table} ({', '.join(columns)}) "
                f"VALUES ({', '.join('?' for _ in columns)})",
                tuple(values[column] for column in columns),
            )
            if table == "user_profiles" and "id" not in values:
                values["id"] = cursor.lastrowid
        else:
            merged = dict(current)
            merged.update(values)
            columns = tuple(column for column in merged if column != "id")
            connection.execute(
                f"UPDATE {table} SET "
                + ", ".join(f"{column} = ?" for column in columns)
                + " WHERE id = ?",
                tuple(merged[column] for column in columns) + (values["id"],),
            )
        saved = connection.execute(
            f"SELECT * FROM {table} WHERE id = ?", (values["id"],)
        ).fetchone()
        return dict(saved)


def delete_record(
    table: str, record_id: object, path: str | Path | None = None
) -> bool:
    """Delete a UI-managed row; project deletion always uses delete_project()."""
    if table == "projects":
        return delete_project(str(record_id), path)
    if table not in _DELETE_TABLES:
        raise ValueError(f"Deletion is not supported for {table!r}")
    with transaction(path) as connection:
        cursor = connection.execute(
            f"DELETE FROM {table} WHERE id = ?", (record_id,)
        )
        return cursor.rowcount > 0


def get_attendance_for_date(
    attendance_date: str, path: str | Path | None = None
) -> dict[str, str]:
    """Return the frontend's worker-ID to attendance-status map for one day."""
    rows = list_records("attendance", date_filter=attendance_date, path=path)
    return {row["worker_id"]: row["status"] for row in rows}


def save_attendance_for_date(
    attendance_date: str,
    records: Mapping[str, str],
    path: str | Path | None = None,
) -> dict[str, str]:
    """Replace one day's attendance map atomically, matching the UI save flow."""
    if not isinstance(records, Mapping):
        raise ValueError("Attendance records must map worker IDs to statuses")
    allowed = {"present", "absent", "leave"}
    if any(not isinstance(status, str) or status not in allowed for status in records.values()):
        raise ValueError("Attendance status must be present, absent, or leave")
    with transaction(path) as connection:
        connection.execute("DELETE FROM attendance WHERE date = ?", (attendance_date,))
        connection.executemany(
            "INSERT INTO attendance(date, worker_id, status) VALUES (?, ?, ?)",
            [(attendance_date, worker_id, status) for worker_id, status in records.items()],
        )
    return dict(records)


def get_financial_summary(
    project_id: str | None = None, path: str | Path | None = None
) -> dict:
    """Calculate budgets, voucher spending, and payment totals from saved rows."""
    scoped_project = _scope_project_id(project_id)
    projects = list_projects(path)
    if scoped_project:
        projects = [project for project in projects if project["id"] == scoped_project]
    expenses = list_records("expenses", project_id=scoped_project, path=path)
    payments = list_records("payments", project_id=scoped_project, path=path)
    budget = sum(float(project["budget"]) for project in projects)
    spent = sum(float(expense["amount"]) for expense in expenses)
    return {
        "project_count": len(projects),
        "budget": budget,
        "spent": spent,
        "remaining_budget": budget - spent,
        "expense_count": len(expenses),
        "paid_payments": sum(
            float(payment["amount"]) for payment in payments if payment["status"] == "Paid"
        ),
        "pending_payments": sum(
            float(payment["amount"]) for payment in payments if payment["status"] == "Pending"
        ),
        "payment_count": len(payments),
    }


def get_inventory_summary(
    project_id: str | None = None, path: str | Path | None = None
) -> dict:
    """Calculate inventory value and stock alerts from current material balances."""
    materials = list_records(
        "materials", project_id=_scope_project_id(project_id), path=path
    )
    return {
        "item_count": len(materials),
        "valuation": sum(
            float(material["quantity"]) * float(material["unit_price"])
            for material in materials
        ),
        "low_stock_count": sum(
            material["quantity"] <= material["min_stock_level"] for material in materials
        ),
        "low_stock_positive_count": sum(
            0 < material["quantity"] <= material["min_stock_level"]
            for material in materials
        ),
        "out_of_stock_count": sum(material["quantity"] <= 0 for material in materials),
    }


def get_attendance_summary(
    attendance_date: str,
    project_id: str | None = None,
    path: str | Path | None = None,
) -> dict:
    """Calculate worker turnout and wage burn using the UI's availability fallback."""
    scoped_project = _scope_project_id(project_id)
    workers = list_records("workers", project_id=scoped_project, path=path)
    attendance = get_attendance_for_date(attendance_date, path)
    counts = {"present": 0, "absent": 0, "leave": 0}
    daily_wage_burn = 0.0
    for worker in workers:
        status = attendance.get(
            worker["id"], "present" if worker["availability"] == "On Site" else "absent"
        )
        counts[status] += 1
        if status == "present":
            daily_wage_burn += float(worker["daily_wage"])
    return {
        "worker_count": len(workers),
        "present": counts["present"],
        "absent": counts["absent"],
        "leave": counts["leave"],
        "daily_wage_burn": daily_wage_burn,
    }


def get_dashboard_summary(
    project_id: str | None = None,
    as_of_date: str | None = None,
    path: str | Path | None = None,
) -> dict:
    """Return persisted-record KPIs used by the frontend's dashboard cards."""
    scoped_project = _scope_project_id(project_id)
    projects = list_projects(path)
    if scoped_project:
        projects = [project for project in projects if project["id"] == scoped_project]
    tasks = list_records("tasks", project_id=scoped_project, path=path)
    expenses = list_records(
        "expenses", project_id=_scope_project_id(project_id), path=path
    )
    materials = list_records("materials", project_id=scoped_project, path=path)
    workers = list_records("workers", project_id=scoped_project, path=path)
    day = as_of_date or datetime.now(timezone.utc).date().isoformat()
    attendance = get_attendance_summary(day, scoped_project, path)
    budget = sum(float(project["budget"]) for project in projects)
    spent = sum(float(expense["amount"]) for expense in expenses)
    return {
        "total_projects": len(projects),
        "ongoing_projects": sum(project["status"] == "ongoing" for project in projects),
        "completed_projects": sum(project["status"] == "completed" for project in projects),
        "delayed_projects": sum(project["status"] == "delayed" for project in projects),
        "total_budget": budget,
        "total_expenses": spent,
        "remaining_budget": budget - spent,
        "active_workers_present": attendance["present"],
        "worker_count": len(workers),
        "pending_tasks": sum(task["status"] != "completed" for task in tasks),
        "low_stock_materials": sum(
            material["quantity"] <= material["min_stock_level"] for material in materials
        ),
    }


def get_expense_chart_data(
    project_id: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    path: str | Path | None = None,
) -> dict:
    """Group saved expense vouchers for monthly and category charts."""
    scoped_project = _scope_project_id(project_id)
    expenses = list_records("expenses", project_id=scoped_project, path=path)
    if start_date:
        expenses = [expense for expense in expenses if expense["date"] >= start_date]
    if end_date:
        expenses = [expense for expense in expenses if expense["date"] <= end_date]
    categories = ("Materials", "Labour", "Equipment", "Transport", "Other")
    by_category = {category: 0.0 for category in categories}
    by_month: dict[str, float] = {}
    for expense in expenses:
        amount = float(expense["amount"])
        category = expense["category"]
        if category in by_category:
            by_category[category] += amount
        month = expense["date"][:7]
        by_month[month] = by_month.get(month, 0.0) + amount
    return {
        "by_category": by_category,
        "by_month": [
            {"month": month, "amount": by_month[month]} for month in sorted(by_month)
        ],
    }


def get_project_chart_data(path: str | Path | None = None) -> list[dict]:
    """Return persisted project progress and derived spending for chart series."""
    return [
        {
            "id": project["id"],
            "name": project["name"],
            "budget": project["budget"],
            "spent": project["spent"],
            "progress": project["progress"],
            "status": project["status"],
        }
        for project in list_projects(path)
    ]


def get_report_records(
    report_type: str,
    project_id: str | None = None,
    as_of_date: str | None = None,
    path: str | Path | None = None,
) -> list[dict]:
    """Return the saved rows for one of the six frontend report datasets."""
    scoped_project = project_id if project_id != "all" else None
    if report_type == "progress":
        return list_projects(path) if scoped_project is None else [
            project for project in list_projects(path) if project["id"] == scoped_project
        ]
    table_by_report = {
        "finance": "expenses",
        "labour": "workers",
        "materials": "materials",
        "payments": "payments",
        "tasks": "tasks",
    }
    if report_type not in table_by_report:
        raise ValueError(f"Unknown frontend report type: {report_type!r}")
    records = list_records(table_by_report[report_type], project_id=scoped_project, path=path)
    if report_type == "tasks":
        cutoff = as_of_date or datetime.now(timezone.utc).date().isoformat()
        records = [
            task for task in records
            if task["status"] != "completed" and task["due_date"] < cutoff
        ]
    elif report_type == "materials":
        for material in records:
            material["inventory_value"] = (
                float(material["quantity"]) * float(material["unit_price"])
            )
    elif report_type == "labour":
        day = as_of_date or datetime.now(timezone.utc).date().isoformat()
        attendance = get_attendance_for_date(day, path)
        for worker in records:
            worker["attendance_status"] = attendance.get(
                worker["id"],
                "present" if worker["availability"] == "On Site" else "absent",
            )
    return records


def _positive_quantity(value: float) -> float:
    if isinstance(value, bool):
        raise ValueError("Quantity must be a positive number")
    try:
        quantity = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Quantity must be a positive number") from exc
    if not math.isfinite(quantity) or quantity <= 0:
        raise ValueError("Quantity must be a positive number")
    return quantity


def _record_stock_movement(
    material_id: str,
    movement_type: str,
    quantity: float,
    notes: str = "",
    project_id: str | None = None,
    path: str | Path | None = None,
    movement_date: str | None = None,
) -> dict:
    amount = _positive_quantity(quantity)
    if movement_type not in ("in", "out"):
        raise ValueError("Stock movement type must be 'in' or 'out'")
    day = movement_date or datetime.now(timezone.utc).date().isoformat()

    with transaction(path) as connection:
        existing = connection.execute(
            "SELECT quantity, assigned_project_id FROM materials WHERE id = ?",
            (material_id,),
        ).fetchone()
        if existing is None:
            raise LookupError(f"Material {material_id!r} was not found")
        # The frontend uses an explicitly selected project when present and
        # otherwise records the material's assigned project, if any.
        project_id = project_id or existing["assigned_project_id"]
        if movement_type == "in":
            cursor = connection.execute(
                "UPDATE materials SET quantity = quantity + ?, last_updated = ? WHERE id = ?",
                (amount, day, material_id),
            )
        else:
            cursor = connection.execute(
                "UPDATE materials SET quantity = quantity - ?, last_updated = ? "
                "WHERE id = ? AND quantity >= ?",
                (amount, day, material_id, amount),
            )
        if cursor.rowcount == 0:
            raise ValueError(
                f"Insufficient stock: available {existing['quantity']}, requested {amount}"
            )

        transaction_cursor = connection.execute(
            "INSERT INTO stock_transactions "
            "(material_id, date, type, quantity, notes, project_id) VALUES (?, ?, ?, ?, ?, ?)",
            (material_id, day, movement_type, amount, notes or "", project_id),
        )
        material = connection.execute(
            "SELECT id, quantity, last_updated FROM materials WHERE id = ?",
            (material_id,),
        ).fetchone()
        return {
            "transaction_id": transaction_cursor.lastrowid,
            "material_id": material["id"],
            "quantity": material["quantity"],
            "last_updated": material["last_updated"],
        }


def stock_in(
    material_id: str,
    quantity: float,
    notes: str = "",
    project_id: str | None = None,
    path: str | Path | None = None,
    movement_date: str | None = None,
) -> dict:
    """Add stock and its audit row atomically."""
    return _record_stock_movement(
        material_id, "in", quantity, notes, project_id, path, movement_date
    )


def stock_out(
    material_id: str,
    quantity: float,
    notes: str = "",
    project_id: str | None = None,
    path: str | Path | None = None,
    movement_date: str | None = None,
) -> dict:
    """Issue stock without allowing a negative balance; record atomically."""
    return _record_stock_movement(
        material_id, "out", quantity, notes, project_id, path, movement_date
    )


def save_progress_report(
    report: Mapping[str, object], path: str | Path | None = None
) -> dict:
    """Save/upsert a DPR and synchronize project progress in one transaction.

    Reaching 100% marks the project completed. Below 100%, the project's
    current status is preserved, matching the frontend's behavior.
    """
    required = ("id", "project_id", "date", "work_completed", "progress_percentage")
    missing = [field for field in required if field not in report]
    if missing:
        raise ValueError(f"Missing progress report fields: {', '.join(missing)}")
    percentage = report["progress_percentage"]
    if isinstance(percentage, bool):
        raise ValueError("Progress percentage must be an integer from 0 to 100")
    try:
        numeric_percentage = int(percentage)
    except (TypeError, ValueError) as exc:
        raise ValueError("Progress percentage must be an integer from 0 to 100") from exc
    if numeric_percentage != percentage or not 0 <= numeric_percentage <= 100:
        raise ValueError("Progress percentage must be an integer from 0 to 100")

    columns = (
        "id", "project_id", "date", "work_completed", "progress_percentage",
        "workers_present", "materials_consumed", "issues_encountered",
        "delay_blockers", "next_day_plan", "reported_by",
    )
    values = {
        "id": report["id"],
        "project_id": report["project_id"],
        "date": report["date"],
        "work_completed": report["work_completed"],
        "progress_percentage": numeric_percentage,
        "workers_present": report.get("workers_present", 0),
        "materials_consumed": report.get("materials_consumed", ""),
        "issues_encountered": report.get("issues_encountered", ""),
        "delay_blockers": report.get("delay_blockers", ""),
        "next_day_plan": report.get("next_day_plan", ""),
        "reported_by": report.get("reported_by", ""),
    }
    placeholders = ", ".join("?" for _ in columns)
    updates = ", ".join(
        f"{column} = excluded.{column}" for column in columns if column != "id"
    )
    with transaction(path) as connection:
        connection.execute(
            f"INSERT INTO progress_reports ({', '.join(columns)}) VALUES ({placeholders}) "
            f"ON CONFLICT(id) DO UPDATE SET {updates}",
            tuple(values[column] for column in columns),
        )
        connection.execute(
            "UPDATE projects SET progress = ?, "
            "status = CASE WHEN ? = 100 THEN 'completed' ELSE status END "
            "WHERE id = ?",
            (numeric_percentage, numeric_percentage, report["project_id"]),
        )
        saved = connection.execute(
            "SELECT * FROM progress_reports WHERE id = ?", (report["id"],)
        ).fetchone()
        return dict(saved)


def delete_project(project_id: str, path: str | Path | None = None) -> bool:
    """Delete an unreferenced project, or raise a readable restriction error.

    SQLite RESTRICT constraints provide the final guarantee even if callers
    bypass this helper and issue DELETE directly.
    """
    related_counts = (
        ("tasks", "project_id", "tasks"),
        ("expenses", "project_id", "expenses"),
        ("payments", "project_id", "payments"),
        ("progress_reports", "project_id", "progress reports"),
        ("workers", "assigned_project_id", "assigned workers"),
        ("materials", "assigned_project_id", "assigned materials"),
        ("stock_transactions", "project_id", "stock transactions"),
    )
    try:
        with transaction(path) as connection:
            # Hold SQLite's write lock while checking and deleting, so another
            # connection cannot insert a dependent row between those steps.
            connection.execute("BEGIN IMMEDIATE")
            if connection.execute(
                "SELECT 1 FROM projects WHERE id = ?", (project_id,)
            ).fetchone() is None:
                raise ProjectDeletionError(
                    f"Project {project_id!r} was not found.", not_found=True
                )

            counts = {}
            for table, column, label in related_counts:
                counts[label] = connection.execute(
                    f"SELECT COUNT(*) FROM {table} WHERE {column} = ?",
                    (project_id,),
                ).fetchone()[0]

            blockers = [f"{label}: {count}" for label, count in counts.items() if count]
            if blockers:
                raise ProjectDeletionError(
                    f"Cannot delete project {project_id!r}; related records exist "
                    f"({', '.join(blockers)}). Remove those records first."
                )

            connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    except sqlite3.IntegrityError as exc:
        raise ProjectDeletionError(
            f"Cannot delete project {project_id!r} because related records reference it. "
            "Remove those records first."
        ) from exc
    return True
