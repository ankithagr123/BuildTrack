"""API tests use disposable SQLite files and never touch the shared database."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.app import app, initialize_auth_table
from database import db
from database.init_db import initialize_database


class BuildTrackApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_dir.name) / "api-test.sqlite3"
        initialize_database(self.database_path)
        initialize_auth_table(self.database_path)
        self.original_database_path = app.config["DATABASE_PATH"]
        app.config.update(TESTING=True, SECRET_KEY="test-secret", DATABASE_PATH=str(self.database_path))
        self.client = app.test_client()

    def tearDown(self):
        app.config["DATABASE_PATH"] = self.original_database_path
        self.temp_dir.cleanup()

    def register(self, email="admin@example.com", role="Contractor / Admin", name="Test User", **extra):
        return self.client.post("/api/auth/register", json={
            "name": name, "email": email, "password": "password123", "role": role, **extra
        })

    def create_project(self, name="Test Project"):
        return self.client.post("/api/projects", json={
            "name": name, "client": "Example Client", "location": "Bengaluru",
            "manager": "Test Manager", "startDate": "2026-01-01",
            "expectedCompletionDate": "2026-12-31", "budget": 10000,
            "progress": 0, "status": "planning", "description": "API test"
        })

    def test_registration_login_logout_and_role_permissions(self):
        first = self.register()
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.json["user"]["role"], "Contractor / Admin")
        self.client.post("/api/auth/logout")

        login = self.client.post("/api/auth/login", json={
            "email": "ADMIN@example.com", "password": "password123"
        })
        self.assertEqual(login.status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)
        self.assertEqual(self.create_project().status_code, 201)

        self.assertEqual(self.register(email="store@example.com", role="Storekeeper").status_code, 201)
        self.client.post("/api/auth/logout")
        self.client.post("/api/auth/login", json={"email": "store@example.com", "password": "password123"})
        self.assertEqual(self.client.get("/api/projects").status_code, 403)
        self.assertEqual(self.client.get("/api/tasks").status_code, 403)
        self.assertEqual(self.client.post("/api/projects", json={}).status_code, 403)
        self.assertEqual(self.client.post("/api/auth/logout").status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

    def test_project_and_task_create_read_update_delete(self):
        self.assertEqual(self.register().status_code, 201)
        self.client.post("/api/auth/login", json={"email": "admin@example.com", "password": "password123"})
        created_project = self.create_project()
        self.assertEqual(created_project.status_code, 201)
        project = created_project.json
        self.assertIn("startDate", project)
        self.assertNotIn("start_date", project)
        self.assertEqual(self.client.get("/api/projects").json[0]["id"], project["id"])
        self.assertEqual(self.client.get(f"/api/projects/{project['id']}").status_code, 200)

        updated_project = self.client.put(f"/api/projects/{project['id']}", json={"manager": "Updated Manager"})
        self.assertEqual(updated_project.json["manager"], "Updated Manager")

        created_task = self.client.post("/api/tasks", json={
            "projectId": project["id"], "title": "Pour slab", "assignedTo": "Crew A",
            "startDate": "2026-02-01", "dueDate": "2026-02-10",
            "priority": "high", "status": "todo", "description": "Test task"
        })
        self.assertEqual(created_task.status_code, 201)
        task = created_task.json
        self.assertEqual(task["projectId"], project["id"])
        self.assertNotIn("project_id", task)
        self.assertEqual(self.client.get("/api/tasks?projectId=" + project["id"]).json[0]["id"], task["id"])
        self.assertEqual(self.client.get(f"/api/tasks/{task['id']}").status_code, 200)
        updated_task = self.client.put(f"/api/tasks/{task['id']}", json={"status": "completed"})
        self.assertEqual(updated_task.json["status"], "completed")

        self.assertEqual(self.client.delete(f"/api/projects/{project['id']}").status_code, 409)
        self.assertEqual(self.client.delete(f"/api/tasks/{task['id']}").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/projects/{project['id']}").status_code, 200)

    def test_engineer_and_client_role_permissions(self):
        self.assertEqual(self.register().status_code, 201)
        self.client.post("/api/auth/login", json={"email": "admin@example.com", "password": "password123"})
        project = self.create_project().json
        self.assertEqual(self.register(email="engineer@example.com", role="Site Engineer / Supervisor").status_code, 201)
        self.client.post("/api/auth/logout")
        self.client.post("/api/auth/login", json={"email": "engineer@example.com", "password": "password123"})
        self.assertEqual(self.client.get("/api/projects").status_code, 200)
        self.assertEqual(self.client.get("/api/tasks").status_code, 200)
        self.assertEqual(self.client.post("/api/projects", json={}).status_code, 403)
        task = self.client.post("/api/tasks", json={
            "projectId": project["id"], "title": "Engineer task", "dueDate": "2026-05-01",
            "priority": "medium", "status": "todo"
        })
        self.assertEqual(task.status_code, 201)

        self.client.post("/api/auth/logout")
        self.client.post("/api/auth/login", json={"email": "admin@example.com", "password": "password123"})
        self.assertEqual(self.register(email="client@example.com", role="Client / Project Owner", client_name="Example Client").status_code, 201)
        self.client.post("/api/auth/logout")
        self.client.post("/api/auth/login", json={"email": "client@example.com", "password": "password123"})
        self.assertEqual([row["id"] for row in self.client.get("/api/projects").json], [project["id"]])
        self.assertEqual(self.client.get("/api/tasks").status_code, 403)

    def test_frontend_module_uses_api_and_production_path_is_shared_file(self):
        root = Path(__file__).resolve().parents[1]
        data_js = (root / "js" / "data.js").read_text(encoding="utf-8")
        self.assertIn("readAllowedData('/projects')", data_js)
        self.assertIn("readAllowedData('/tasks')", data_js)
        self.assertIn("apiRequest('/auth/login'", data_js)
        self.assertIn("apiRequest('/auth/logout'", data_js)
        self.assertNotIn("saveToStorage(STORAGE_KEYS.PROJECTS", data_js)
        self.assertNotIn("saveToStorage(STORAGE_KEYS.TASKS", data_js)
        projects_js = (root / "js" / "projects.js").read_text(encoding="utf-8")
        tasks_js = (root / "js" / "tasks.js").read_text(encoding="utf-8")
        self.assertIn("await window.DataStore.saveProject", projects_js)
        self.assertIn("await window.DataStore.saveTask", tasks_js)
        self.assertEqual(db.DATABASE_PATH.resolve(), (root / "database" / "buildtrack.sqlite3").resolve())


if __name__ == "__main__":
    unittest.main()
