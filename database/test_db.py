"""Isolated tests for the BuildTrack SQLite schema and access layer."""
from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from .db import (
    ProjectDeletionError,
    delete_project,
    delete_record,
    get_attendance_for_date,
    get_attendance_summary,
    get_dashboard_summary,
    get_expense_chart_data,
    get_financial_summary,
    get_inventory_summary,
    get_project,
    get_project_chart_data,
    get_record,
    get_report_records,
    list_projects,
    list_records,
    get_project_spending,
    save_progress_report,
    save_attendance_for_date,
    save_record,
    stock_in,
    stock_out,
    transaction,
)
from .init_db import SCHEMA_PATH, initialize_database

EXPECTED_COLUMNS = {
    "projects": {"id", "name", "client", "location", "manager", "start_date", "expected_completion_date", "budget", "progress", "status", "description"},
    "tasks": {"id", "project_id", "title", "description", "assigned_to", "start_date", "due_date", "priority", "status"},
    "workers": {"id", "name", "skill", "phone", "assigned_project_id", "daily_wage", "availability", "status"},
    "attendance": {"date", "worker_id", "status"},
    "materials": {"id", "name", "category", "unit", "quantity", "min_stock_level", "unit_price", "supplier", "assigned_project_id", "last_updated"},
    "stock_transactions": {"id", "material_id", "date", "type", "quantity", "notes", "project_id"},
    "expenses": {"id", "title", "project_id", "category", "amount", "date", "payment_method", "description"},
    "payments": {"id", "payment_ref", "project_id", "recipient", "amount", "date", "status", "payment_method", "notes"},
    "progress_reports": {"id", "project_id", "date", "work_completed", "progress_percentage", "workers_present", "materials_consumed", "issues_encountered", "delay_blockers", "next_day_plan", "reported_by"},
    "company_settings": {"id", "company_name", "contractor_name", "email", "phone", "gstin", "license_number", "currency", "currency_symbol", "date_format", "theme", "budget_threshold", "overdue_tasks", "low_stock_alerts", "deadline_alerts_days"},
    "user_profiles": {"id", "name", "role", "email", "avatar"},
}


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        # Keep test files under the workspace because some managed Windows
        # environments restrict the system TEMP directory.
        self.temp_dir = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.path = Path(self.temp_dir.name) / "test.sqlite3"
        initialize_database(self.path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_initialization_tables_columns_and_foreign_keys(self):
        with transaction(self.path) as connection:
            self.assertEqual(connection.execute("PRAGMA foreign_keys").fetchone()[0], 1)
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 5)
            tables = {r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            self.assertTrue(set(EXPECTED_COLUMNS).issubset(tables))
            for table, expected in EXPECTED_COLUMNS.items():
                actual = {r[1] for r in connection.execute(f"PRAGMA table_info({table})")}
                self.assertEqual(actual, expected, table)

    def test_user_profiles_support_multiple_unique_emails_and_agreed_roles(self):
        first = save_record("user_profiles", {
            "name": "Admin", "role": "Contractor / Admin",
            "email": "admin@example.test",
        }, self.path)
        second = save_record("user_profiles", {
            "name": "Store Team", "role": "Storekeeper",
            "email": "store@example.test",
        }, self.path)
        third = save_record("user_profiles", {
            "id": None, "name": "Engineer", "role": "Site Engineer / Supervisor",
            "email": "engineer@example.test",
        }, self.path)
        fourth = save_record("user_profiles", {
            "name": "Client", "role": "Client / Project Owner",
            "email": "client@example.test",
        }, self.path)
        self.assertEqual((first["id"], second["id"], third["id"], fourth["id"]), (1, 2, 3, 4))

        updated = save_record("user_profiles", {
            "name": "Updated Admin", "role": "Contractor / Admin",
            "email": "ADMIN@example.test",
        }, self.path)
        self.assertEqual(updated["id"], first["id"])
        self.assertEqual(len(list_records("user_profiles", path=self.path)), 4)

        with transaction(self.path) as connection:
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO user_profiles(name,role,email) VALUES (?,?,?)",
                    ("Bad Role", "Engineer", "bad-role@example.test"),
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO user_profiles(name,role,email) VALUES (?,?,?)",
                    ("Duplicate Email", "Storekeeper", "admin@EXAMPLE.test"),
                )

    def test_foreign_key_rejects_orphan_and_restricts_project_delete(self):
        with transaction(self.path) as connection:
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute("INSERT INTO tasks(id, project_id, title, due_date, priority, status) VALUES (?, ?, ?, ?, ?, ?)",
                                   ("T1", "missing", "Orphan", "2026-01-01", "low", "todo"))
            connection.execute("INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) VALUES ('P1','Site','Client','Here','Manager','2026-01-01','2026-12-31',10000,'planning')")
            connection.execute("INSERT INTO tasks(id,project_id,title,due_date,priority,status) VALUES ('T1','P1','Task','2026-01-02','high','todo')")
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute("DELETE FROM projects WHERE id='P1'")
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM tasks WHERE project_id='P1'").fetchone()[0], 1)

    def test_frontend_project_status_budget_and_date_rules(self):
        with transaction(self.path) as connection:
            for number, status in enumerate(("ongoing", "planning", "delayed", "completed")):
                connection.execute(
                    "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                    "VALUES (?,?,?,?,?,?,?,?,?)",
                    (f"P{number}", "Site", "Client", "Here", "Manager", "2026-01-01", "2026-12-31", 10000, status),
                )
            invalid_projects = (
                ("LOW", 9999, "2026-01-01", "2026-12-31"),
                ("OFF_STEP", 10500, "2026-01-01", "2026-12-31"),
                ("REVERSED_DATES", 10000, "2026-12-31", "2026-01-01"),
            )
            for project_id, budget, start, end in invalid_projects:
                with self.subTest(project_id=project_id), self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                        "VALUES (?,?,?,?,?,?,?,?, 'planning')",
                        (project_id, "Site", "Client", "Here", "Manager", start, end, budget),
                    )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute("UPDATE projects SET status='invalid' WHERE id='P0'")

    def test_date_columns_accept_real_leap_dates_and_reject_invalid_values(self):
        leap_day = "2024-02-29"
        with transaction(self.path) as connection:
            connection.execute(
                "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                "VALUES ('P1','Site','Client','Here','Manager',?,?,10000,'planning')",
                (leap_day, leap_day),
            )
            connection.execute(
                "INSERT INTO tasks(id,project_id,title,start_date,due_date,priority,status) "
                "VALUES ('T1','P1','Task',?,?, 'high','todo')",
                (leap_day, leap_day),
            )
            connection.execute(
                "INSERT INTO workers(id,name,skill,assigned_project_id,daily_wage,availability,status) "
                "VALUES ('W1','Worker','Head Mason','P1',300,'On Site','active')"
            )
            connection.execute("INSERT INTO attendance(date,worker_id,status) VALUES (?, 'W1','present')", (leap_day,))
            connection.execute(
                "INSERT INTO materials(id,name,category,unit,quantity,min_stock_level,unit_price,last_updated) "
                "VALUES ('M1','Cement','Cement & Aggregates','Bag',1,0,2,?)", (leap_day,)
            )
            connection.execute(
                "INSERT INTO stock_transactions(material_id,date,type,quantity) VALUES ('M1',?,'in',1)",
                (leap_day,),
            )
            connection.execute(
                "INSERT INTO expenses(id,title,project_id,category,amount,date,payment_method) "
                "VALUES ('E1','Expense','P1','Materials',1,?,'Cash')", (leap_day,)
            )
            connection.execute(
                "INSERT INTO payments(id,payment_ref,project_id,recipient,amount,date,status,payment_method) "
                "VALUES ('PAY1','REF1','P1','Vendor',1,?,'Paid','UPI')", (leap_day,)
            )
            connection.execute(
                "INSERT INTO progress_reports(id,project_id,date,work_completed,progress_percentage) "
                "VALUES ('DPR1','P1',?,'Work',10)", (leap_day,)
            )

            date_columns = (
                ("projects", "start_date", "id='P1'"),
                ("projects", "expected_completion_date", "id='P1'"),
                ("tasks", "start_date", "id='T1'"),
                ("tasks", "due_date", "id='T1'"),
                ("attendance", "date", "worker_id='W1'"),
                ("materials", "last_updated", "id='M1'"),
                ("stock_transactions", "date", "material_id='M1'"),
                ("expenses", "date", "id='E1'"),
                ("payments", "date", "id='PAY1'"),
                ("progress_reports", "date", "id='DPR1'"),
            )
            bad_values = ("2026-02-30", "2024-2-09", "2026-13-01", "02/28/2026")
            for table, column, where in date_columns:
                for invalid_date in bad_values:
                    with self.subTest(table=table, column=column, value=invalid_date):
                        with self.assertRaises(sqlite3.IntegrityError):
                            connection.execute(
                                f"UPDATE {table} SET {column}=? WHERE {where}",
                                (invalid_date,),
                            )

            # Optional date columns continue to accept NULL.
            connection.execute("UPDATE tasks SET start_date=NULL WHERE id='T1'")
            connection.execute("UPDATE materials SET last_updated=NULL WHERE id='M1'")

    def test_version_4_profile_migration_preserves_profile_and_allows_multiple_users(self):
        legacy_path = Path(self.temp_dir.name) / "version4_profiles.sqlite3"
        legacy = sqlite3.connect(legacy_path)
        try:
            legacy.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
            legacy.execute("DROP TABLE user_profiles")
            legacy.execute(
                "CREATE TABLE user_profiles ("
                "id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT NOT NULL, "
                "role TEXT NOT NULL, email TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '')"
            )
            legacy.execute(
                "INSERT INTO user_profiles(id,name,role,email,avatar) "
                "VALUES (1,'Legacy Profile','Senior Civil Engineer','legacy@example.test','legacy.svg')"
            )
            legacy.execute(
                "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                "VALUES ('P1','Keep Project','Client','Here','Manager','2026-01-01','2026-12-31',10000,'planning')"
            )
            legacy.execute("PRAGMA user_version = 4")
            legacy.commit()
        finally:
            legacy.close()

        initialize_database(legacy_path)
        initialize_database(legacy_path)
        with transaction(legacy_path) as connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 5)
            profile = connection.execute("SELECT * FROM user_profiles").fetchone()
            self.assertEqual(tuple(profile), (
                1, "Legacy Profile", "Site Engineer / Supervisor",
                "legacy@example.test", "legacy.svg",
            ))
            self.assertEqual(connection.execute("SELECT name FROM projects WHERE id='P1'").fetchone()[0], "Keep Project")
            connection.execute(
                "INSERT INTO user_profiles(name,role,email) VALUES ('Client','Client / Project Owner','client@example.test')"
            )
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM user_profiles").fetchone()[0], 2)

    def test_version_3_date_migration_preserves_rows_and_adds_strict_triggers(self):
        legacy_path = Path(self.temp_dir.name) / "version3.sqlite3"
        sql = SCHEMA_PATH.read_text(encoding="utf-8")
        # Recreate the version-3 date checks to demonstrate the exact legacy
        # case: SQLite's date() normalizes an impossible day instead of rejecting it.
        sql = sql.replace(
            "length(start_date) = 10 AND date(start_date) IS start_date",
            "date(start_date) IS NOT NULL",
        ).replace(
            "length(expected_completion_date) = 10 AND\n        date(expected_completion_date) IS expected_completion_date AND\n        start_date <= expected_completion_date",
            "date(expected_completion_date) IS NOT NULL AND start_date <= expected_completion_date",
        ).replace(
            "start_date IS NULL OR (length(start_date) = 10 AND date(start_date) IS start_date)",
            "start_date IS NULL OR date(start_date) IS NOT NULL",
        ).replace(
            "length(due_date) = 10 AND date(due_date) IS due_date",
            "date(due_date) IS NOT NULL",
        ).replace(
            "last_updated IS NULL OR (length(last_updated) = 10 AND date(last_updated) IS last_updated)",
            "last_updated IS NULL OR date(last_updated) IS NOT NULL",
        ).replace(
            "length(date) = 10 AND date(date) IS date",
            "date(date) IS NOT NULL",
        )
        legacy = sqlite3.connect(legacy_path)
        try:
            legacy.executescript(sql + "\nPRAGMA user_version = 3;")
            legacy.execute(
                "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                "VALUES ('P1','Legacy','Client','Here','Manager','2026-02-30','2026-12-01',10000,'planning')"
            )
            legacy.execute(
                "INSERT INTO tasks(id,project_id,title,due_date,priority,status) "
                "VALUES ('T1','P1','Keep linked','2026-03-01','high','todo')"
            )
            legacy.commit()
        finally:
            legacy.close()

        with self.assertWarnsRegex(UserWarning, r"projects\.start_date.*2026-02-30"):
            initialize_database(legacy_path)
        initialize_database(legacy_path)
        with transaction(legacy_path) as connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 5)
            self.assertEqual(
                connection.execute("SELECT start_date FROM projects WHERE id='P1'").fetchone()[0],
                "2026-02-30",
            )
            self.assertEqual(
                connection.execute("SELECT project_id FROM tasks WHERE id='T1'").fetchone()[0],
                "P1",
            )
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
            trigger_count = connection.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'strict_date_%'"
            ).fetchone()[0]
            self.assertEqual(trigger_count, 20)
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute("UPDATE projects SET start_date='2026-02-30' WHERE id='P1'")
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                    "VALUES ('P2','Bad date','Client','Here','Manager','2026-02-30','2026-12-01',10000,'planning')"
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO tasks(id,project_id,title,due_date,priority,status) "
                    "VALUES ('T2','P1','Bad date','2024-2-09','high','todo')"
                )
            connection.execute("UPDATE projects SET start_date='2024-02-29' WHERE id='P1'")

    def test_worker_wage_frontend_rules(self):
        self._add_project_and_material()
        with transaction(self.path) as connection:
            for worker_id, wage in (("W300", 300), ("W350", 350)):
                connection.execute(
                    "INSERT INTO workers(id,name,skill,assigned_project_id,daily_wage,availability,status) "
                    "VALUES (?,?,?,?,?,'Available','active')",
                    (worker_id, "Worker", "Head Mason", "P1", wage),
                )
            for worker_id, wage in (("WLOW", 299), ("WOFF", 325)):
                with self.subTest(worker_id=worker_id), self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "INSERT INTO workers(id,name,skill,assigned_project_id,daily_wage,availability,status) "
                        "VALUES (?,?,?,?,?,'Available','active')",
                        (worker_id, "Worker", "Head Mason", "P1", wage),
                    )

            skills = (
                "Head Mason", "Brickwork Mason", "Shuttering Carpenter",
                "Lead Bar Bender / Rebar", "Licensed Electrician", "Senior Plumber",
                "Civil Site Supervisor", "Concrete Pump Operator",
                "Structural Welder & Fabricator", "Specialist Tile & Paint Finisher",
                "Waterproofing Applicator", "General Civil Helper",
            )
            for index, skill in enumerate(skills):
                connection.execute(
                    "INSERT INTO workers(id,name,skill,assigned_project_id,daily_wage,availability,status) "
                    "VALUES (?,?,?,'P1',300,'Available','active')",
                    (f"WS{index}", "Worker", skill),
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO workers(id,name,skill,assigned_project_id,daily_wage,availability,status) "
                    "VALUES ('W_BAD_SKILL','Worker','Mason','P1',300,'Available','active')"
                )

            categories = (
                "Cement & Aggregates", "Steel & Structural Metals", "Bricks & Masonry",
                "Electrical & Lighting", "Plumbing & Sanitary", "Finishes & Paints",
                "Chemicals & Admixtures", "Safety & Site Gear",
            )
            for index, category in enumerate(categories):
                connection.execute(
                    "INSERT INTO materials(id,name,category,unit,quantity,min_stock_level,unit_price) "
                    "VALUES (?,?,?,'units',0,0,0)",
                    (f"MC{index}", "Material", category),
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO materials(id,name,category,unit,quantity,min_stock_level,unit_price) "
                    "VALUES ('M_BAD_CATEGORY','Material','Unlisted','units',0,0,0)"
                )

    def test_frontend_dropdown_values_for_tasks_finance_attendance_and_settings(self):
        self._add_project_and_material()
        with transaction(self.path) as connection:
            connection.execute(
                "INSERT INTO workers(id,name,skill,assigned_project_id,daily_wage,availability,status) "
                "VALUES ('W1','Worker','Head Mason','P1',300,'On Site','active')"
            )

            index = 0
            for priority in ("high", "medium", "low"):
                for status in ("todo", "in-progress", "completed"):
                    connection.execute(
                        "INSERT INTO tasks(id,project_id,title,due_date,priority,status) VALUES (?,?,?,?,?,?)",
                        (f"T{index}", "P1", "Task", "2026-12-31", priority, status),
                    )
                    index += 1
            for priority, status in (("urgent", "todo"), ("low", "blocked")):
                with self.subTest(priority=priority, status=status), self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "INSERT INTO tasks(id,project_id,title,due_date,priority,status) VALUES (?,?,?,?,?,?)",
                        (f"TB{index}", "P1", "Task", "2026-12-31", priority, status),
                    )
                    index += 1

            for index, status in enumerate(("present", "absent", "leave")):
                connection.execute(
                    "INSERT INTO attendance(date,worker_id,status) VALUES (?,?,?)",
                    (f"2026-03-0{index + 1}", "W1", status),
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO attendance(date,worker_id,status) VALUES ('2026-03-04','W1','On Site')"
                )

            for index, category in enumerate(("Materials", "Labour", "Equipment", "Transport", "Other")):
                connection.execute(
                    "INSERT INTO expenses(id,title,project_id,category,amount,date,payment_method) "
                    "VALUES (?,?,?,?,1,'2026-03-01','UPI')",
                    (f"E{index}", "Expense", "P1", category),
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO expenses(id,title,project_id,category,amount,date,payment_method) "
                    "VALUES ('EBAD','Expense','P1','Utilities',1,'2026-03-01','UPI')"
                )

            for index, status in enumerate(("Paid", "Pending", "Failed")):
                connection.execute(
                    "INSERT INTO payments(id,payment_ref,project_id,recipient,amount,date,status,payment_method) "
                    "VALUES (?,?, 'P1','Vendor',1,'2026-03-01',?,'UPI')",
                    (f"PAY{index}", f"REF{index}", status),
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO payments(id,payment_ref,project_id,recipient,amount,date,status,payment_method) "
                    "VALUES ('PAYBAD','REFBAD','P1','Vendor',1,'2026-03-01','Processing','UPI')"
                )

            for index, movement_type in enumerate(("in", "out")):
                connection.execute(
                    "INSERT INTO stock_transactions(material_id,date,type,quantity) VALUES ('M1',?,?,1)",
                    (f"2026-03-0{index + 1}", movement_type),
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO stock_transactions(material_id,date,type,quantity) "
                    "VALUES ('M1','2026-03-03','transfer',1)"
                )

            connection.execute(
                "INSERT INTO company_settings(id,theme) VALUES (1,'light')"
            )
            connection.execute("UPDATE company_settings SET theme='dark' WHERE id=1")
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute("UPDATE company_settings SET theme='system' WHERE id=1")

    def test_representative_crud_and_voucher_spending(self):
        with transaction(self.path) as connection:
            connection.execute("INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) VALUES (?,?,?,?,?,?,?,?,?)", ("P1", "Site", "Client", "Here", "Manager", "2026-01-01", "2026-12-31", 10000, "planning"))
            connection.execute("INSERT INTO tasks(id,project_id,title,due_date,priority,status) VALUES (?,?,?,?,?,?)", ("T1", "P1", "Task", "2026-01-02", "high", "todo"))
            connection.execute("UPDATE tasks SET status=? WHERE id=?", ("completed", "T1"))
            self.assertEqual(connection.execute("SELECT status FROM tasks WHERE id=?", ("T1",)).fetchone()[0], "completed")
            connection.execute("INSERT INTO expenses(id,title,project_id,category,amount,date,payment_method) VALUES (?,?,?,?,?,?,?)", ("E1", "Concrete", "P1", "Materials", 1250.5, "2026-02-01", "UPI"))
            connection.execute("INSERT INTO expenses(id,title,project_id,category,amount,date,payment_method) VALUES (?,?,?,?,?,?,?)", ("E2", "Wages", "P1", "Labour", 500, "2026-02-02", "Cash"))
        self.assertEqual(get_project_spending("P1", self.path), {"project_id": "P1", "budget": 10000.0, "spent": 1750.5, "remaining_budget": 8249.5})
        with transaction(self.path) as connection:
            connection.execute("DELETE FROM tasks WHERE id=?", ("T1",))
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM tasks").fetchone()[0], 0)

    def test_schema_is_idempotent_and_preserves_existing_rows(self):
        with transaction(self.path) as connection:
            connection.execute("INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) VALUES ('P1','Keep','Client','Here','Manager','2026-01-01','2026-12-31',10000,'planning')")
        initialize_database(self.path)
        with transaction(self.path) as connection:
            self.assertEqual(connection.execute("SELECT name FROM projects WHERE id='P1'").fetchone()[0], "Keep")

    def _add_project_and_material(self, status="planning", quantity=10):
        with transaction(self.path) as connection:
            connection.execute(
                "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                "VALUES ('P1','Site','Client','Here','Manager','2026-01-01','2026-12-31',10000,?)",
                (status,),
            )
            connection.execute(
                "INSERT INTO materials(id,name,category,unit,quantity,min_stock_level,unit_price,assigned_project_id) "
                "VALUES ('M1','Cement','Cement & Aggregates','Bags',?,2,10,'P1')",
                (quantity,),
            )

    def test_shared_crud_helpers_cover_frontend_records_and_cascades(self):
        project = save_record("projects", {
            "id": "P1", "name": "Site", "client": "Client", "location": "Here",
            "manager": "Manager", "start_date": "2026-01-01",
            "expected_completion_date": "2026-12-31", "budget": 10000,
            "progress": 0, "status": "planning", "description": "",
        }, self.path)
        self.assertEqual(project["id"], "P1")

        task = save_record("tasks", {
            "id": "T1", "project_id": "P1", "title": "Task",
            "due_date": "2026-04-01", "priority": "high", "status": "todo",
        }, self.path)
        task = save_record("tasks", {"id": "T1", "status": "in-progress"}, self.path)
        self.assertEqual(task["title"], "Task")
        self.assertEqual(get_record("tasks", "T1", self.path)["status"], "in-progress")
        self.assertEqual(len(list_records("tasks", project_id="P1", path=self.path)), 1)
        with self.assertRaisesRegex(ValueError, "Unknown projects fields"):
            save_record("projects", {"id": "P1", "spent": 99}, self.path)

        save_record("workers", {
            "id": "W1", "name": "Worker", "skill": "Head Mason",
            "assigned_project_id": "P1", "daily_wage": 300,
            "availability": "On Site", "status": "active",
        }, self.path)
        save_attendance_for_date("2026-03-01", {"W1": "present"}, self.path)
        save_record("materials", {
            "id": "M1", "name": "Cement", "category": "Cement & Aggregates",
            "unit": "Bags", "quantity": 5, "min_stock_level": 2,
            "unit_price": 10, "assigned_project_id": "P1",
        }, self.path)
        stock_in("M1", 2, path=self.path, movement_date="2026-03-01")
        with transaction(self.path) as connection:
            movement = connection.execute(
                "SELECT project_id FROM stock_transactions WHERE material_id='M1'"
            ).fetchone()
        self.assertEqual(movement["project_id"], "P1")
        self.assertEqual(get_project("P1", self.path)["spent"], 0)

        save_record("expenses", {
            "id": "E1", "title": "Cost", "project_id": "P1",
            "category": "Materials", "amount": 120,
            "date": "2026-03-01", "payment_method": "UPI",
        }, self.path)
        save_record("payments", {
            "id": "PAY1", "payment_ref": "REF1", "project_id": "P1",
            "recipient": "Vendor", "amount": 50, "date": "2026-03-01",
            "status": "Pending", "payment_method": "UPI",
        }, self.path)
        report = save_progress_report({
            "id": "DPR1", "project_id": "P1", "date": "2026-03-01",
            "work_completed": "Work", "progress_percentage": 25,
        }, self.path)
        self.assertEqual(get_record("progress_reports", "DPR1", self.path)["id"], report["id"])
        self.assertEqual(get_project("P1", self.path)["spent"], 120)

        settings = save_record("company_settings", {
            "company_name": "BuildTrack", "budget_threshold": 90,
        }, self.path)
        self.assertEqual(settings["id"], 1)
        profile = save_record("user_profiles", {
            "name": "Engineer", "role": "Site Engineer / Supervisor", "email": "site@example.test",
        }, self.path)
        self.assertEqual(profile["id"], 1)
        self.assertEqual(get_record("company_settings", 1, self.path)["budget_threshold"], 90)
        self.assertEqual(get_record("user_profiles", 1, self.path)["name"], "Engineer")
        self.assertEqual(list_projects(self.path)[0]["spent"], 120)

        for table, row_id in (
            ("tasks", "T1"), ("expenses", "E1"), ("payments", "PAY1"),
            ("progress_reports", "DPR1"),
        ):
            self.assertTrue(delete_record(table, row_id, self.path))
        self.assertTrue(delete_record("workers", "W1", self.path))
        self.assertTrue(delete_record("materials", "M1", self.path))
        with transaction(self.path) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM attendance").fetchone()[0], 0)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM stock_transactions").fetchone()[0], 0)
        self.assertTrue(delete_record("projects", "P1", self.path))

    def test_attendance_helpers_replace_maps_atomically_and_read_back(self):
        self._add_project_and_material()
        with transaction(self.path) as connection:
            connection.execute(
                "INSERT INTO workers(id,name,skill,assigned_project_id,daily_wage,availability,status) "
                "VALUES ('W1','Worker','Head Mason','P1',300,'On Site','active')"
            )
        day = "2026-03-01"
        save_attendance_for_date(day, {"W1": "present"}, self.path)
        self.assertEqual(get_attendance_for_date(day, self.path), {"W1": "present"})
        with self.assertRaises(ValueError):
            save_attendance_for_date(day, {"W1": "On Site"}, self.path)
        self.assertEqual(get_attendance_for_date(day, self.path), {"W1": "present"})
        with self.assertRaises(sqlite3.IntegrityError):
            save_attendance_for_date(day, {"MISSING": "absent"}, self.path)
        self.assertEqual(get_attendance_for_date(day, self.path), {"W1": "present"})
        save_attendance_for_date(day, {"W1": "leave"}, self.path)
        self.assertEqual(get_attendance_for_date(day, self.path), {"W1": "leave"})

    def test_dashboard_charts_finance_inventory_and_report_queries_use_saved_rows(self):
        save_record("projects", {
            "id": "P1", "name": "Site One", "client": "Client",
            "location": "Here", "manager": "Manager", "start_date": "2026-01-01",
            "expected_completion_date": "2026-12-31", "budget": 10000,
            "progress": 40, "status": "delayed",
        }, self.path)
        save_record("projects", {
            "id": "P2", "name": "Site Two", "client": "Client",
            "location": "There", "manager": "Manager", "start_date": "2026-01-01",
            "expected_completion_date": "2026-12-31", "budget": 15000,
            "progress": 100, "status": "completed",
        }, self.path)
        save_record("tasks", {
            "id": "T1", "project_id": "P1", "title": "Overdue",
            "due_date": "2026-03-01", "priority": "high", "status": "in-progress",
        }, self.path)
        save_record("tasks", {
            "id": "T2", "project_id": "P2", "title": "Done",
            "due_date": "2026-03-01", "priority": "low", "status": "completed",
        }, self.path)
        save_record("workers", {
            "id": "W1", "name": "Worker", "skill": "Head Mason",
            "assigned_project_id": "P1", "daily_wage": 350,
            "availability": "On Site", "status": "active",
        }, self.path)
        save_attendance_for_date("2026-03-02", {"W1": "absent"}, self.path)
        save_record("materials", {
            "id": "M1", "name": "Cement", "category": "Cement & Aggregates",
            "unit": "Bags", "quantity": 4, "min_stock_level": 5,
            "unit_price": 10, "assigned_project_id": "P1",
        }, self.path)
        save_record("materials", {
            "id": "M2", "name": "Gloves", "category": "Safety & Site Gear",
            "unit": "Pairs", "quantity": 0, "min_stock_level": 5,
            "unit_price": 50,
        }, self.path)
        for expense in (
            {"id": "E1", "title": "Materials", "project_id": "P1",
             "category": "Materials", "amount": 500, "date": "2026-03-01",
             "payment_method": "UPI"},
            {"id": "E2", "title": "Labour", "project_id": "P2",
             "category": "Labour", "amount": 200, "date": "2026-02-01",
             "payment_method": "Cash"},
        ):
            save_record("expenses", expense, self.path)
        for payment in (
            {"id": "PAY1", "payment_ref": "REF1", "project_id": "P1",
             "recipient": "Vendor", "amount": 80, "date": "2026-03-01",
             "status": "Paid", "payment_method": "UPI"},
            {"id": "PAY2", "payment_ref": "REF2", "project_id": "P1",
             "recipient": "Vendor", "amount": 20, "date": "2026-03-01",
             "status": "Pending", "payment_method": "UPI"},
        ):
            save_record("payments", payment, self.path)

        finance = get_financial_summary("P1", self.path)
        self.assertEqual(finance["budget"], 10000)
        self.assertEqual(finance["spent"], 500)
        self.assertEqual(finance["remaining_budget"], 9500)
        self.assertEqual(finance["paid_payments"], 80)
        self.assertEqual(finance["pending_payments"], 20)

        inventory = get_inventory_summary("P1", self.path)
        self.assertEqual(inventory["item_count"], 2)  # includes the global-yard item
        self.assertEqual(inventory["valuation"], 40)
        self.assertEqual(inventory["low_stock_count"], 2)
        self.assertEqual(inventory["low_stock_positive_count"], 1)
        self.assertEqual(inventory["out_of_stock_count"], 1)

        attendance = get_attendance_summary("2026-03-02", "P1", self.path)
        self.assertEqual(attendance, {
            "worker_count": 1, "present": 0, "absent": 1, "leave": 0,
            "daily_wage_burn": 0,
        })
        dashboard = get_dashboard_summary("P1", "2026-03-02", self.path)
        self.assertEqual(dashboard["delayed_projects"], 1)
        self.assertEqual(dashboard["total_budget"], 10000)
        self.assertEqual(dashboard["total_expenses"], 500)
        self.assertEqual(dashboard["pending_tasks"], 1)
        self.assertEqual(dashboard["low_stock_materials"], 2)
        self.assertEqual(dashboard["active_workers_present"], 0)

        chart = get_expense_chart_data(start_date="2026-02-01", path=self.path)
        self.assertEqual(chart["by_category"]["Materials"], 500)
        self.assertEqual(chart["by_category"]["Labour"], 200)
        self.assertEqual(chart["by_month"], [
            {"month": "2026-02", "amount": 200},
            {"month": "2026-03", "amount": 500},
        ])
        project_charts = {row["id"]: row for row in get_project_chart_data(self.path)}
        self.assertEqual(project_charts["P1"]["spent"], 500)
        self.assertEqual(project_charts["P2"]["progress"], 100)
        self.assertEqual([task["id"] for task in get_report_records(
            "tasks", "P1", "2026-03-02", self.path
        )], ["T1"])
        self.assertEqual(get_report_records("labour", "P1", "2026-03-02", self.path)[0][
            "attendance_status"
        ], "absent")
        self.assertEqual(get_report_records("materials", "P1", path=self.path)[1][
            "inventory_value"
        ], 0)
        self.assertEqual(len(get_report_records("finance", "P1", path=self.path)), 1)

    def test_stock_in_and_stock_out_update_balance_and_history(self):
        self._add_project_and_material()
        stock_in("M1", 2.5, "delivery", "P1", self.path, "2026-03-01")
        stock_out("M1", 4, "used on site", "P1", self.path, "2026-03-02")
        with transaction(self.path) as connection:
            material = connection.execute("SELECT quantity,last_updated FROM materials WHERE id='M1'").fetchone()
            movements = connection.execute(
                "SELECT type,quantity,notes,project_id FROM stock_transactions ORDER BY id"
            ).fetchall()
        self.assertEqual(tuple(material), (8.5, "2026-03-02"))
        self.assertEqual([tuple(row) for row in movements], [
            ("in", 2.5, "delivery", "P1"),
            ("out", 4.0, "used on site", "P1"),
        ])

    def test_stock_out_rejects_insufficient_and_invalid_quantities(self):
        self._add_project_and_material(quantity=3)
        with self.assertRaisesRegex(ValueError, "Insufficient stock"):
            stock_out("M1", 3.1, path=self.path)
        for quantity in (0, -1, float("nan"), float("inf"), "not-a-number"):
            with self.subTest(quantity=quantity), self.assertRaises(ValueError):
                stock_in("M1", quantity, path=self.path)
        with transaction(self.path) as connection:
            self.assertEqual(connection.execute("SELECT quantity FROM materials WHERE id='M1'").fetchone()[0], 3)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM stock_transactions").fetchone()[0], 0)

    def test_stock_movement_rolls_back_balance_when_history_insert_fails(self):
        self._add_project_and_material(quantity=5)
        with transaction(self.path) as connection:
            connection.execute(
                "CREATE TRIGGER fail_stock_history BEFORE INSERT ON stock_transactions "
                "BEGIN SELECT RAISE(ABORT, 'injected stock history failure'); END"
            )
        with self.assertRaisesRegex(sqlite3.IntegrityError, "injected stock history failure"):
            stock_in("M1", 2, path=self.path)
        with transaction(self.path) as connection:
            self.assertEqual(connection.execute("SELECT quantity FROM materials WHERE id='M1'").fetchone()[0], 5)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM stock_transactions").fetchone()[0], 0)

    def test_progress_report_and_project_progress_commit_together(self):
        self._add_project_and_material(status="delayed")
        report = {
            "id": "DPR1", "project_id": "P1", "date": "2026-03-03",
            "work_completed": "Foundation pour", "progress_percentage": 100,
            "workers_present": 8,
        }
        saved = save_progress_report(report, self.path)
        self.assertEqual(saved["progress_percentage"], 100)
        with transaction(self.path) as connection:
            project = connection.execute("SELECT progress,status FROM projects WHERE id='P1'").fetchone()
        self.assertEqual(tuple(project), (100, "completed"))

    def test_progress_below_100_preserves_existing_project_status(self):
        self._add_project_and_material(status="delayed")
        save_progress_report({
            "id": "DPR1", "project_id": "P1", "date": "2026-03-03",
            "work_completed": "More work", "progress_percentage": 72,
        }, self.path)
        with transaction(self.path) as connection:
            project = connection.execute("SELECT progress,status FROM projects WHERE id='P1'").fetchone()
        self.assertEqual(tuple(project), (72, "delayed"))

    def test_progress_report_rolls_back_when_project_update_fails(self):
        self._add_project_and_material()
        with transaction(self.path) as connection:
            connection.execute(
                "CREATE TRIGGER fail_project_progress BEFORE UPDATE OF progress ON projects "
                "BEGIN SELECT RAISE(ABORT, 'injected project update failure'); END"
            )
        with self.assertRaisesRegex(sqlite3.IntegrityError, "injected project update failure"):
            save_progress_report({
                "id": "DPR1", "project_id": "P1", "date": "2026-03-03",
                "work_completed": "Work", "progress_percentage": 80,
            }, self.path)
        with transaction(self.path) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM progress_reports").fetchone()[0], 0)
            self.assertEqual(tuple(connection.execute("SELECT progress,status FROM projects WHERE id='P1'").fetchone()), (0, "planning"))

    def test_worker_availability_and_attendance_values_are_separate(self):
        self._add_project_and_material()
        with transaction(self.path) as connection:
            connection.execute(
                "INSERT INTO workers(id,name,skill,assigned_project_id,daily_wage,availability,status) "
                "VALUES ('W1','Worker','Head Mason','P1',300,'On Site','active')"
            )
            connection.execute(
                "INSERT INTO attendance(date,worker_id,status) VALUES ('2026-03-01','W1','leave')"
            )
            for availability in ("On Leave", "Unavailable", "present"):
                with self.subTest(availability=availability), self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "UPDATE workers SET availability=? WHERE id='W1'", (availability,)
                    )
            self.assertEqual(connection.execute("SELECT status FROM attendance WHERE worker_id='W1'").fetchone()[0], "leave")

    def test_existing_database_migrates_once_and_keeps_rows(self):
        legacy_path = Path(self.temp_dir.name) / "legacy.sqlite3"
        legacy = sqlite3.connect(legacy_path)
        try:
            legacy_sql = SCHEMA_PATH.read_text(encoding="utf-8")
            legacy_sql = legacy_sql.replace(
                "availability IN ('On Site', 'Available')",
                "availability IN ('On Site', 'Available', 'On Leave')",
            )
            # Recreate the previous version's delete actions for a realistic
            # upgrade fixture; version 1 used CASCADE/SET NULL.
            legacy_sql = legacy_sql.replace(
                "project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT",
                "project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE",
            ).replace(
                "assigned_project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT",
                "assigned_project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE SET NULL",
            ).replace(
                "project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT",
                "project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE SET NULL",
            )
            legacy.execute("PRAGMA foreign_keys = ON")
            legacy.executescript(legacy_sql)
            legacy.execute("PRAGMA user_version = 0")
            legacy.execute(
                "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                "VALUES ('P1','Keep','Client','Here','Manager','2026-01-01','2026-12-31',10000,'planning')"
            )
            legacy.execute(
                "INSERT INTO workers(id,name,skill,assigned_project_id,daily_wage,availability,status) "
                "VALUES ('W1','Legacy Worker','Head Mason','P1',300,'On Leave','active')"
            )
            legacy.execute("INSERT INTO attendance VALUES ('2026-03-01','W1','leave')")
            legacy.execute(
                "INSERT INTO materials(id,name,category,unit,quantity,min_stock_level,unit_price,assigned_project_id) "
                "VALUES ('M1','Cement','Cement & Aggregates','Bags',4,1,10,'P1')"
            )
            legacy.execute(
                "INSERT INTO stock_transactions(id,material_id,date,type,quantity,project_id) "
                "VALUES (15,'M1','2026-03-01','in',4,'P1')"
            )
            legacy.execute(
                "INSERT INTO tasks(id,project_id,title,due_date,priority,status) "
                "VALUES ('T1','P1','Task','2026-04-01','high','todo')"
            )
            legacy.execute(
                "INSERT INTO expenses(id,title,project_id,category,amount,date,payment_method) "
                "VALUES ('E1','Cost','P1','Materials',20,'2026-03-01','UPI')"
            )
            legacy.execute(
                "INSERT INTO payments(id,payment_ref,project_id,recipient,amount,date,status,payment_method) "
                "VALUES ('PAY1','REF1','P1','Vendor',20,'2026-03-01','Paid','UPI')"
            )
            legacy.execute(
                "INSERT INTO progress_reports(id,project_id,date,work_completed,progress_percentage) "
                "VALUES ('DPR1','P1','2026-03-01','Work',10)"
            )
            legacy.commit()
        finally:
            legacy.close()

        # A version-0 database from the earlier initializer is upgraded in place.
        initialize_database(legacy_path)
        with transaction(legacy_path) as connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 5)
            self.assertEqual(connection.execute("SELECT name FROM projects WHERE id='P1'").fetchone()[0], "Keep")
            self.assertEqual(connection.execute("SELECT availability FROM workers WHERE id='W1'").fetchone()[0], "On Leave")
            self.assertEqual(connection.execute("SELECT status FROM attendance WHERE worker_id='W1'").fetchone()[0], "leave")
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM stock_transactions WHERE id=15 AND project_id='P1'").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM tasks WHERE id='T1' AND project_id='P1'").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM expenses WHERE id='E1'").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM payments WHERE id='PAY1'").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM progress_reports WHERE id='DPR1'").fetchone()[0], 1)
            self.assertEqual(connection.execute("PRAGMA foreign_keys").fetchone()[0], 1)
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute("DELETE FROM projects WHERE id='P1'")
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM projects WHERE id='P1'").fetchone()[0], 1)
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO workers(id,name,skill,daily_wage,availability,status) "
                    "VALUES ('W2','New Worker','Head Mason',300,'On Leave','active')"
                )
            trigger_count = connection.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'workers_availability_%'"
            ).fetchone()[0]
        self.assertEqual(trigger_count, 2)
        initialize_database(legacy_path)
        with transaction(legacy_path) as connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 5)
            self.assertEqual(connection.execute("SELECT availability FROM workers WHERE id='W1'").fetchone()[0], "On Leave")
            self.assertEqual(connection.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'workers_availability_%'"
            ).fetchone()[0], 2)

    def test_version_2_migration_preserves_legacy_values_and_adds_rules_once(self):
        legacy_path = Path(self.temp_dir.name) / "version2.sqlite3"
        sql = SCHEMA_PATH.read_text(encoding="utf-8")
        sql = sql.replace(
            "expected_completion_date TEXT NOT NULL CHECK (\n"
            "        date(expected_completion_date) IS NOT NULL AND start_date <= expected_completion_date\n"
            "    ),",
            "expected_completion_date TEXT NOT NULL CHECK (date(expected_completion_date) IS NOT NULL),",
        ).replace(
            "budget REAL NOT NULL CHECK (\n"
            "        budget >= 10000 AND\n"
            "        abs((budget - 10000) / 5000 - round((budget - 10000) / 5000)) < 0.000001\n"
            "    ),",
            "budget REAL NOT NULL CHECK (budget >= 0),",
        ).replace(
            "daily_wage REAL NOT NULL CHECK (\n"
            "        daily_wage >= 300 AND\n"
            "        abs((daily_wage - 300) / 50 - round((daily_wage - 300) / 50)) < 0.000001\n"
            "    ),",
            "daily_wage REAL NOT NULL CHECK (daily_wage >= 0),",
        ).replace(
            "skill TEXT NOT NULL CHECK (skill IN (\n"
            "        'Head Mason', 'Brickwork Mason', 'Shuttering Carpenter',\n"
            "        'Lead Bar Bender / Rebar', 'Licensed Electrician', 'Senior Plumber',\n"
            "        'Civil Site Supervisor', 'Concrete Pump Operator',\n"
            "        'Structural Welder & Fabricator', 'Specialist Tile & Paint Finisher',\n"
            "        'Waterproofing Applicator', 'General Civil Helper'\n"
            "    )),",
            "skill TEXT NOT NULL,",
        ).replace(
            "category TEXT NOT NULL CHECK (category IN (\n"
            "        'Cement & Aggregates', 'Steel & Structural Metals', 'Bricks & Masonry',\n"
            "        'Electrical & Lighting', 'Plumbing & Sanitary', 'Finishes & Paints',\n"
            "        'Chemicals & Admixtures', 'Safety & Site Gear'\n"
            "    )),",
            "category TEXT NOT NULL,",
        )
        legacy = sqlite3.connect(legacy_path)
        try:
            legacy.executescript(sql + "\nPRAGMA user_version = 2;")
            legacy.execute(
                "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                "VALUES ('P1','Legacy','Client','Here','Manager','2026-01-01','2026-12-31',5000,'planning')"
            )
            legacy.execute(
                "INSERT INTO workers(id,name,skill,assigned_project_id,daily_wage,availability,status) "
                "VALUES ('W1','Legacy Worker','Head Mason','P1',100,'On Site','active')"
            )
            legacy.commit()
        finally:
            legacy.close()

        initialize_database(legacy_path)
        initialize_database(legacy_path)
        with transaction(legacy_path) as connection:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 5)
            self.assertEqual(connection.execute("SELECT budget FROM projects WHERE id='P1'").fetchone()[0], 5000)
            self.assertEqual(connection.execute("SELECT daily_wage FROM workers WHERE id='W1'").fetchone()[0], 100)
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                    "VALUES ('P2','New','Client','Here','Manager','2026-01-01','2026-12-31',5000,'planning')"
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "UPDATE workers SET daily_wage=100 WHERE id='W1'"
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO workers(id,name,skill,daily_wage,availability,status) "
                    "VALUES ('W2','New Worker','Mason',300,'Available','active')"
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO materials(id,name,category,unit,quantity,min_stock_level,unit_price) "
                    "VALUES ('M2','New Material','Unlisted','units',0,0,0)"
                )
            trigger_count = connection.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name IN "
                "('projects_form_rules_insert','projects_form_rules_update',"
                "'workers_wage_form_rules_insert','workers_wage_form_rules_update',"
                "'workers_skill_options_insert','workers_skill_options_update',"
                "'materials_category_options_insert','materials_category_options_update')"
            ).fetchone()[0]
        self.assertEqual(trigger_count, 8)

    def test_delete_project_without_related_records_succeeds(self):
        with transaction(self.path) as connection:
            connection.execute(
                "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                "VALUES ('P1','Empty','Client','Here','Manager','2026-01-01','2026-12-31',10000,'planning')"
            )
        self.assertTrue(delete_project("P1", self.path))
        with transaction(self.path) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM projects WHERE id='P1'").fetchone()[0], 0)

    def test_delete_project_with_tasks_is_rejected_without_deleting_data(self):
        self._add_project_and_material()
        with transaction(self.path) as connection:
            connection.execute(
                "INSERT INTO tasks(id,project_id,title,due_date,priority,status) "
                "VALUES ('T1','P1','Task','2026-04-01','high','todo')"
            )
        with self.assertRaisesRegex(ProjectDeletionError, "tasks: 1"):
            delete_project("P1", self.path)
        with transaction(self.path) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM projects WHERE id='P1'").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM tasks WHERE id='T1' AND project_id='P1'").fetchone()[0], 1)

    def test_delete_project_with_expense_or_payment_is_rejected(self):
        with transaction(self.path) as connection:
            for project_id in ("P1", "P2"):
                connection.execute(
                    "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                    "VALUES (?,?,'Client','Here','Manager','2026-01-01','2026-12-31',10000,'planning')",
                    (project_id, project_id),
                )
            connection.execute(
                "INSERT INTO expenses(id,title,project_id,category,amount,date,payment_method) "
                "VALUES ('E1','Cost','P1','Materials',50,'2026-03-01','UPI')"
            )
            connection.execute(
                "INSERT INTO payments(id,payment_ref,project_id,recipient,amount,date,status,payment_method) "
                "VALUES ('PAY1','R1','P2','Vendor',50,'2026-03-01','Pending','UPI')"
            )
        with self.assertRaisesRegex(ProjectDeletionError, "expenses: 1"):
            delete_project("P1", self.path)
        with self.assertRaisesRegex(ProjectDeletionError, "payments: 1"):
            delete_project("P2", self.path)
        with transaction(self.path) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM projects").fetchone()[0], 2)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM expenses WHERE id='E1'").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM payments WHERE id='PAY1'").fetchone()[0], 1)

    def test_delete_project_with_assigned_worker_or_material_is_rejected(self):
        with transaction(self.path) as connection:
            for project_id in ("P1", "P2"):
                connection.execute(
                    "INSERT INTO projects(id,name,client,location,manager,start_date,expected_completion_date,budget,status) "
                    "VALUES (?,?,'Client','Here','Manager','2026-01-01','2026-12-31',10000,'planning')",
                    (project_id, project_id),
                )
            connection.execute(
                "INSERT INTO workers(id,name,skill,assigned_project_id,daily_wage,availability,status) "
                "VALUES ('W1','Worker','Head Mason','P1',300,'On Site','active')"
            )
            connection.execute(
                "INSERT INTO materials(id,name,category,unit,quantity,min_stock_level,unit_price,assigned_project_id) "
                "VALUES ('M1','Cement','Cement & Aggregates','Bags',4,1,10,'P2')"
            )
        with self.assertRaisesRegex(ProjectDeletionError, "assigned workers: 1"):
            delete_project("P1", self.path)
        with self.assertRaisesRegex(ProjectDeletionError, "assigned materials: 1"):
            delete_project("P2", self.path)
        with transaction(self.path) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM projects").fetchone()[0], 2)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM workers WHERE assigned_project_id='P1'").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM materials WHERE assigned_project_id='P2'").fetchone()[0], 1)

    def test_database_restricts_direct_delete_for_every_project_relationship(self):
        self._add_project_and_material()
        with transaction(self.path) as connection:
            connection.execute("INSERT INTO tasks(id,project_id,title,due_date,priority,status) VALUES ('T1','P1','Task','2026-04-01','high','todo')")
            connection.execute("INSERT INTO stock_transactions(material_id,date,type,quantity,project_id) VALUES ('M1','2026-03-01','in',1,'P1')")
            for table in ("tasks", "workers", "materials", "stock_transactions", "expenses", "payments", "progress_reports"):
                foreign_keys = connection.execute(f"PRAGMA foreign_key_list({table})").fetchall()
                project_links = [row for row in foreign_keys if row[2] == "projects"]
                self.assertTrue(project_links, table)
                self.assertTrue(all(row[6].upper() == "RESTRICT" for row in project_links), table)
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute("DELETE FROM projects WHERE id='P1'")
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM projects WHERE id='P1'").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM tasks WHERE project_id='P1'").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM stock_transactions WHERE project_id='P1'").fetchone()[0], 1)

    def test_delete_project_with_progress_or_stock_reference_is_rejected(self):
        self._add_project_and_material()
        with transaction(self.path) as connection:
            connection.execute(
                "INSERT INTO progress_reports(id,project_id,date,work_completed,progress_percentage) "
                "VALUES ('DPR1','P1','2026-03-01','Work',10)"
            )
            connection.execute(
                "INSERT INTO stock_transactions(material_id,date,type,quantity,project_id) "
                "VALUES ('M1','2026-03-01','in',1,'P1')"
            )
        with self.assertRaisesRegex(ProjectDeletionError, "progress reports: 1.*stock transactions: 1"):
            delete_project("P1", self.path)
        with transaction(self.path) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM projects WHERE id='P1'").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM progress_reports WHERE id='DPR1'").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM stock_transactions WHERE project_id='P1'").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
