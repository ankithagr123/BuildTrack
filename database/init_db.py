"""Initialize the BuildTrack SQLite database without replacing existing data."""
from __future__ import annotations

import sqlite3
import warnings
from pathlib import Path

from .db import DATABASE_PATH, connect

SCHEMA_PATH = Path(__file__).resolve().with_name("schema.sql")
SCHEMA_VERSION = 4


def _migration_1(connection: sqlite3.Connection) -> None:
    """Narrow legacy worker availability validation to the current UI options."""
    connection.execute(
        "CREATE TRIGGER IF NOT EXISTS workers_availability_insert_check "
        "BEFORE INSERT ON workers "
        "WHEN NEW.availability NOT IN ('On Site', 'Available') "
        "BEGIN SELECT RAISE(ABORT, 'availability must be On Site or Available'); END"
    )
    connection.execute(
        "CREATE TRIGGER IF NOT EXISTS workers_availability_update_check "
        "BEFORE UPDATE OF availability ON workers "
        "WHEN NEW.availability NOT IN ('On Site', 'Available') "
        "BEGIN SELECT RAISE(ABORT, 'availability must be On Site or Available'); END"
    )


def _migration_2(connection: sqlite3.Connection) -> None:
    """Rebuild project-dependent tables with ON DELETE RESTRICT."""
    # SQLite cannot alter a foreign-key action in place. The initializer turns
    # FK enforcement off before this migration starts, then verifies all links
    # after enforcement is restored.
    # The view references expenses, which is briefly renamed during the
    # rebuild. Drop it transactionally; schema initialization recreates it.
    connection.execute("DROP VIEW IF EXISTS project_financial_summary")

    definitions = {
        "tasks": (
            "id, project_id, title, description, assigned_to, start_date, due_date, priority, status",
            """CREATE TABLE tasks__migration_v2 (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                assigned_to TEXT NOT NULL DEFAULT '',
                start_date TEXT CHECK (start_date IS NULL OR date(start_date) IS NOT NULL),
                due_date TEXT NOT NULL CHECK (date(due_date) IS NOT NULL),
                priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
                status TEXT NOT NULL CHECK (status IN ('todo', 'in-progress', 'completed'))
            )""",
        ),
        "workers": (
            "id, name, skill, phone, assigned_project_id, daily_wage, availability, status",
            """CREATE TABLE workers__migration_v2 (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                skill TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                assigned_project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
                daily_wage REAL NOT NULL CHECK (daily_wage >= 0),
                availability TEXT NOT NULL CHECK (availability IN ('On Site', 'Available', 'On Leave')),
                status TEXT NOT NULL CHECK (status IN ('active', 'inactive'))
            )""",
        ),
        "materials": (
            "id, name, category, unit, quantity, min_stock_level, unit_price, supplier, assigned_project_id, last_updated",
            """CREATE TABLE materials__migration_v2 (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                unit TEXT NOT NULL,
                quantity REAL NOT NULL CHECK (quantity >= 0),
                min_stock_level REAL NOT NULL CHECK (min_stock_level >= 0),
                unit_price REAL NOT NULL CHECK (unit_price >= 0),
                supplier TEXT NOT NULL DEFAULT '',
                assigned_project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
                last_updated TEXT CHECK (last_updated IS NULL OR date(last_updated) IS NOT NULL)
            )""",
        ),
        "stock_transactions": (
            "id, material_id, date, type, quantity, notes, project_id",
            """CREATE TABLE stock_transactions__migration_v2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                material_id TEXT NOT NULL REFERENCES materials(id) ON UPDATE CASCADE ON DELETE CASCADE,
                date TEXT NOT NULL CHECK (date(date) IS NOT NULL),
                type TEXT NOT NULL CHECK (type IN ('in', 'out')),
                quantity REAL NOT NULL CHECK (quantity > 0),
                notes TEXT NOT NULL DEFAULT '',
                project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT
            )""",
        ),
        "expenses": (
            "id, title, project_id, category, amount, date, payment_method, description",
            """CREATE TABLE expenses__migration_v2 (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
                category TEXT NOT NULL CHECK (category IN ('Materials', 'Labour', 'Equipment', 'Transport', 'Other')),
                amount REAL NOT NULL CHECK (amount > 0),
                date TEXT NOT NULL CHECK (date(date) IS NOT NULL),
                payment_method TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT ''
            )""",
        ),
        "payments": (
            "id, payment_ref, project_id, recipient, amount, date, status, payment_method, notes",
            """CREATE TABLE payments__migration_v2 (
                id TEXT PRIMARY KEY,
                payment_ref TEXT NOT NULL UNIQUE,
                project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
                recipient TEXT NOT NULL,
                amount REAL NOT NULL CHECK (amount > 0),
                date TEXT NOT NULL CHECK (date(date) IS NOT NULL),
                status TEXT NOT NULL CHECK (status IN ('Paid', 'Pending', 'Failed')),
                payment_method TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT ''
            )""",
        ),
        "progress_reports": (
            "id, project_id, date, work_completed, progress_percentage, workers_present, materials_consumed, issues_encountered, delay_blockers, next_day_plan, reported_by",
            """CREATE TABLE progress_reports__migration_v2 (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
                date TEXT NOT NULL CHECK (date(date) IS NOT NULL),
                work_completed TEXT NOT NULL,
                progress_percentage INTEGER NOT NULL CHECK (progress_percentage BETWEEN 0 AND 100),
                workers_present INTEGER NOT NULL DEFAULT 0 CHECK (workers_present >= 0),
                materials_consumed TEXT NOT NULL DEFAULT '',
                issues_encountered TEXT NOT NULL DEFAULT '',
                delay_blockers TEXT NOT NULL DEFAULT '',
                next_day_plan TEXT NOT NULL DEFAULT '',
                reported_by TEXT NOT NULL DEFAULT ''
            )""",
        ),
    }

    for table, (columns, create_sql) in definitions.items():
        staging_table = f"{table}__migration_v2"
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
        if exists is None:
            raise sqlite3.OperationalError(
                f"Cannot apply migration 2: expected table {table!r} is missing"
            )
        connection.execute(create_sql)
        connection.execute(
            f"INSERT INTO {staging_table} ({columns}) SELECT {columns} FROM {table}"
        )
        connection.execute(f"DROP TABLE {table}")
        connection.execute(f"ALTER TABLE {staging_table} RENAME TO {table}")

    # Rebuilding workers drops its version-1 validation triggers, so restore them.
    _migration_1(connection)


def _migration_3(connection: sqlite3.Connection) -> None:
    """Apply frontend project and wage rules to an already-created schema.

    Triggers avoid rebuilding tables, so rows and foreign-key relationships stay
    in place. Existing legacy values are preserved; checks apply to new values.
    """
    rules = (
        (
            "projects_form_rules_insert",
            "BEFORE INSERT ON projects",
            "NEW.start_date > NEW.expected_completion_date OR NEW.budget < 10000 "
            "OR abs((NEW.budget - 10000) / 5000 - round((NEW.budget - 10000) / 5000)) >= 0.000001",
            "project dates or budget do not match the frontend form rules",
        ),
        (
            "projects_form_rules_update",
            "BEFORE UPDATE OF start_date, expected_completion_date, budget ON projects",
            "NEW.start_date > NEW.expected_completion_date OR NEW.budget < 10000 "
            "OR abs((NEW.budget - 10000) / 5000 - round((NEW.budget - 10000) / 5000)) >= 0.000001",
            "project dates or budget do not match the frontend form rules",
        ),
        (
            "workers_wage_form_rules_insert",
            "BEFORE INSERT ON workers",
            "NEW.daily_wage < 300 "
            "OR abs((NEW.daily_wage - 300) / 50 - round((NEW.daily_wage - 300) / 50)) >= 0.000001",
            "daily wage does not match the frontend form rules",
        ),
        (
            "workers_wage_form_rules_update",
            "BEFORE UPDATE OF daily_wage ON workers",
            "NEW.daily_wage < 300 "
            "OR abs((NEW.daily_wage - 300) / 50 - round((NEW.daily_wage - 300) / 50)) >= 0.000001",
            "daily wage does not match the frontend form rules",
        ),
        (
            "workers_skill_options_insert",
            "BEFORE INSERT ON workers",
            "NEW.skill NOT IN ('Head Mason','Brickwork Mason','Shuttering Carpenter',"
            "'Lead Bar Bender / Rebar','Licensed Electrician','Senior Plumber',"
            "'Civil Site Supervisor','Concrete Pump Operator','Structural Welder & Fabricator',"
            "'Specialist Tile & Paint Finisher','Waterproofing Applicator','General Civil Helper')",
            "worker skill must match a frontend option",
        ),
        (
            "workers_skill_options_update",
            "BEFORE UPDATE OF skill ON workers",
            "NEW.skill NOT IN ('Head Mason','Brickwork Mason','Shuttering Carpenter',"
            "'Lead Bar Bender / Rebar','Licensed Electrician','Senior Plumber',"
            "'Civil Site Supervisor','Concrete Pump Operator','Structural Welder & Fabricator',"
            "'Specialist Tile & Paint Finisher','Waterproofing Applicator','General Civil Helper')",
            "worker skill must match a frontend option",
        ),
        (
            "materials_category_options_insert",
            "BEFORE INSERT ON materials",
            "NEW.category NOT IN ('Cement & Aggregates','Steel & Structural Metals',"
            "'Bricks & Masonry','Electrical & Lighting','Plumbing & Sanitary',"
            "'Finishes & Paints','Chemicals & Admixtures','Safety & Site Gear')",
            "material category must match a frontend option",
        ),
        (
            "materials_category_options_update",
            "BEFORE UPDATE OF category ON materials",
            "NEW.category NOT IN ('Cement & Aggregates','Steel & Structural Metals',"
            "'Bricks & Masonry','Electrical & Lighting','Plumbing & Sanitary',"
            "'Finishes & Paints','Chemicals & Admixtures','Safety & Site Gear')",
            "material category must match a frontend option",
        ),
    )
    for name, timing, condition, message in rules:
        connection.execute(
            f"CREATE TRIGGER IF NOT EXISTS {name} {timing} "
            f"WHEN {condition} BEGIN SELECT RAISE(ABORT, '{message}'); END"
        )


def _migration_4(connection: sqlite3.Connection) -> None:
    """Require new and changed dates to be real canonical ISO calendar dates.

    This trigger-only migration preserves every existing row, including legacy
    date values that might fail the new rule. Such rows are not rewritten.
    """
    date_columns = {
        "projects": ("start_date", "expected_completion_date"),
        "tasks": ("start_date", "due_date"),
        "attendance": ("date",),
        "materials": ("last_updated",),
        "stock_transactions": ("date",),
        "expenses": ("date",),
        "payments": ("date",),
        "progress_reports": ("date",),
    }
    legacy_invalid = []
    for table, columns in date_columns.items():
        for column in columns:
            rows = connection.execute(
                f"SELECT rowid, {column} FROM {table} WHERE {column} IS NOT NULL "
                f"AND (typeof({column}) <> 'text' OR length({column}) <> 10 "
                f"OR date({column}) IS NOT {column})"
            ).fetchall()
            legacy_invalid.extend(
                f"{table}.{column} rowid={row[0]} value={row[1]!r}" for row in rows
            )
    if legacy_invalid:
        warnings.warn(
            "Migration 4 found legacy invalid dates and preserved them unchanged: "
            + "; ".join(legacy_invalid)
            + ". Review and correct these values explicitly with the data owner.",
            UserWarning,
            stacklevel=2,
        )

    for table, columns in date_columns.items():
        for column in columns:
            invalid = (
                f"NEW.{column} IS NOT NULL AND ("
                f"typeof(NEW.{column}) <> 'text' OR length(NEW.{column}) <> 10 "
                f"OR date(NEW.{column}) IS NOT NEW.{column})"
            )
            for operation, timing in (
                ("insert", f"BEFORE INSERT ON {table}"),
                ("update", f"BEFORE UPDATE OF {column} ON {table}"),
            ):
                name = f"strict_date_{table}_{column}_{operation}"
                connection.execute(
                    f"CREATE TRIGGER IF NOT EXISTS {name} {timing} "
                    f"WHEN {invalid} BEGIN "
                    "SELECT RAISE(ABORT, 'date must be a real YYYY-MM-DD calendar date'); "
                    "END"
                )


MIGRATIONS = {
    1: _migration_1,
    2: _migration_2,
    3: _migration_3,
    4: _migration_4,
}
MIGRATIONS_REQUIRING_FOREIGN_KEYS_OFF = {2}


def _has_user_tables(connection: sqlite3.Connection) -> bool:
    return connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' "
        "AND name NOT LIKE 'sqlite_%' LIMIT 1"
    ).fetchone() is not None


def initialize_database(database_path: str | Path = DATABASE_PATH) -> Path:
    path = Path(database_path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        connection = connect(path)
        try:
            schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
            if not _has_user_tables(connection):
                # Build a fresh database directly at the latest schema version.
                connection.executescript(
                    "BEGIN IMMEDIATE;\n"
                    + schema_sql
                    + f"\nPRAGMA user_version = {SCHEMA_VERSION};\nCOMMIT;"
                )
            else:
                version = connection.execute("PRAGMA user_version").fetchone()[0]
                if version > SCHEMA_VERSION:
                    raise RuntimeError(
                        f"Database schema version {version} is newer than this code "
                        f"(version {SCHEMA_VERSION})"
                    )
                for target_version in range(version + 1, SCHEMA_VERSION + 1):
                    migration = MIGRATIONS.get(target_version)
                    if migration is None:
                        raise RuntimeError(
                            f"No database migration is defined for version {target_version}"
                        )
                    foreign_keys_disabled = target_version in MIGRATIONS_REQUIRING_FOREIGN_KEYS_OFF
                    if foreign_keys_disabled:
                        connection.execute("PRAGMA foreign_keys = OFF")
                    try:
                        connection.execute("BEGIN IMMEDIATE")
                        migration(connection)
                        connection.execute(f"PRAGMA user_version = {target_version}")
                        connection.commit()
                    except Exception:
                        if connection.in_transaction:
                            connection.rollback()
                        raise
                    finally:
                        if foreign_keys_disabled:
                            connection.execute("PRAGMA foreign_keys = ON")
                # Create any missing indexes/views without replacing existing rows.
                connection.executescript(schema_sql)
            result = connection.execute("PRAGMA foreign_key_check").fetchall()
            if result:
                raise sqlite3.IntegrityError("Foreign-key check found inconsistent rows")
        finally:
            connection.close()
    except (OSError, sqlite3.Error, RuntimeError) as exc:
        raise RuntimeError(f"Could not initialize BuildTrack database at {path}: {exc}") from exc
    return path


if __name__ == "__main__":
    try:
        print(f"BuildTrack database ready: {initialize_database()}")
    except RuntimeError as error:
        raise SystemExit(str(error)) from error
