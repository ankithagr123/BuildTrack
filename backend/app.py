
import os
import uuid
import sqlite3
from datetime import timedelta
from functools import wraps

from flask import Flask, request, jsonify, session, g
from werkzeug.security import generate_password_hash, check_password_hash

from database import db
from database.db import ProjectDeletionError


app = Flask(__name__)

app.config["SECRET_KEY"] = os.environ.get(
    "BUILDTRACK_SECRET_KEY",
    "development-key-change-before-deployment"
)
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = False  # Local development only


ROLES = [
    "Contractor / Admin",
    "Site Engineer / Supervisor",
    "Storekeeper",
    "Client / Project Owner"
]

PROJECT_READ_ROLES = [
    "Contractor / Admin",
    "Site Engineer / Supervisor",
    "Client / Project Owner"
]

TASK_READ_ROLES = [
    "Contractor / Admin",
    "Site Engineer / Supervisor"
]

TASK_WRITE_ROLES = [
    "Contractor / Admin",
    "Site Engineer / Supervisor"
]

PROJECT_FIELDS = {
    "name", "client", "location", "manager",
    "start_date", "expected_completion_date",
    "budget", "progress", "status", "description"
}

TASK_FIELDS = {
    "project_id", "title", "description", "assigned_to",
    "start_date", "due_date", "priority", "status"
}


# --------------------------------------------------
# DATABASE AND AUTHENTICATION SETUP
# --------------------------------------------------

def get_connection():
    return db.connect()


def initialize_auth_table():
    connection = get_connection()

    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS auth_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                client_name TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                CHECK (role IN (
                    'Contractor / Admin',
                    'Site Engineer / Supervisor',
                    'Storekeeper',
                    'Client / Project Owner'
                ))
            )
        """)
        connection.commit()
    finally:
        connection.close()


def find_user(user_id):
    connection = get_connection()

    try:
        row = connection.execute("""
            SELECT a.id, a.email, a.password_hash, a.role,
                   a.client_name, p.name
            FROM auth_accounts AS a
            LEFT JOIN user_profiles AS p
                ON p.email = a.email COLLATE NOCASE
            WHERE a.id = ?
        """, (user_id,)).fetchone()

        return dict(row) if row else None
    finally:
        connection.close()


# --------------------------------------------------
# AUTHENTICATION AND ROLE DECORATORS
# --------------------------------------------------

def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        user_id = session.get("user_id")

        if not user_id:
            return jsonify({"error": "Please log in first"}), 401

        user = find_user(user_id)

        if not user:
            session.clear()
            return jsonify({"error": "Invalid session"}), 401

        g.current_user = user
        return function(*args, **kwargs)

    return wrapper


def roles_required(allowed_roles):
    def decorator(function):
        @wraps(function)
        @login_required
        def wrapper(*args, **kwargs):
            if g.current_user["role"] not in allowed_roles:
                return jsonify({"error": "Permission denied"}), 403

            return function(*args, **kwargs)

        return wrapper

    return decorator


def client_can_access(project):
    user = g.current_user

    if user["role"] != "Client / Project Owner":
        return True

    return (
        project is not None
        and project["client"] == user["client_name"]
    )


def error_response(message, status=400):
    return jsonify({"error": str(message)}), status


# --------------------------------------------------
# BASIC ROUTE
# --------------------------------------------------

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "BuildTrack API is running",
        "status": "success"
    })


# --------------------------------------------------
# AUTHENTICATION ROUTES
# --------------------------------------------------

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    name = str(data.get("name", "")).strip()
    role = data.get("role")
    client_name = str(data.get("client_name", "")).strip()

    if not email or "@" not in email:
        return error_response("Enter a valid email")

    if len(password) < 8:
        return error_response("Password must contain at least 8 characters")

    if not name:
        return error_response("Name is required")

    connection = get_connection()

    try:
        account_count = connection.execute(
            "SELECT COUNT(*) FROM auth_accounts"
        ).fetchone()[0]
    finally:
        connection.close()

    # First account must be the initial administrator.
    if account_count == 0:
        role = "Contractor / Admin"
    else:
        user_id = session.get("user_id")
        current_user = find_user(user_id) if user_id else None

        if not current_user or current_user["role"] != "Contractor / Admin":
            return error_response(
                "Only an administrator can create accounts", 403
            )

        if role not in ROLES:
            return error_response("Select a valid role")

    if role == "Client / Project Owner":
        if not client_name:
            return error_response("Client name is required")

        connection = get_connection()
        try:
            exists = connection.execute(
                "SELECT 1 FROM projects WHERE client = ? LIMIT 1",
                (client_name,)
            ).fetchone()
        finally:
            connection.close()

        if not exists:
            return error_response("No project is assigned to this client")

    password_hash = generate_password_hash(password)

    connection = get_connection()

    try:
        cursor = connection.execute("""
            INSERT INTO auth_accounts
                (email, password_hash, role, client_name)
            VALUES (?, ?, ?, ?)
        """, (email, password_hash, role, client_name or None))

        account_id = cursor.lastrowid
        connection.commit()

    except sqlite3.IntegrityError:
        connection.rollback()
        return error_response("An account with this email already exists", 409)

    finally:
        connection.close()

    try:
        db.save_record("user_profiles", {
            "name": name,
            "role": role,
            "email": email,
            "avatar": "assets/avatar.svg"
        })
    except Exception:
        # Do not leave an account without its profile.
        connection = get_connection()
        try:
            connection.execute(
                "DELETE FROM auth_accounts WHERE id = ?", (account_id,)
            )
            connection.commit()
        finally:
            connection.close()

        return error_response("Could not create user profile", 500)

    return jsonify({
        "message": "Account created successfully",
        "user": {
            "id": account_id,
            "name": name,
            "email": email,
            "role": role
        }
    }), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not email or not password:
        return error_response("Email and password are required")

    connection = get_connection()

    try:
        user = connection.execute("""
            SELECT id, email, password_hash, role, client_name
            FROM auth_accounts
            WHERE email = ? COLLATE NOCASE
        """, (email,)).fetchone()
    finally:
        connection.close()

    if not user or not check_password_hash(
        user["password_hash"], password
    ):
        return error_response("Invalid email or password", 401)

    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]

    profile = find_user(user["id"])

    return jsonify({
        "message": "Login successful",
        "user": {
            "id": user["id"],
            "name": profile["name"] if profile else "",
            "email": user["email"],
            "role": user["role"],
            "client_name": user["client_name"]
        }
    })


@app.route("/api/auth/me", methods=["GET"])
@login_required
def get_current_user():
    return jsonify({
        "user": {
            "id": g.current_user["id"],
            "name": g.current_user["name"],
            "email": g.current_user["email"],
            "role": g.current_user["role"],
            "client_name": g.current_user["client_name"]
        }
    })


@app.route("/api/auth/logout", methods=["POST"])
@login_required
def logout():
    session.clear()
    return jsonify({"message": "Logout successful"})


# --------------------------------------------------
# PROJECT ROUTES
# --------------------------------------------------

@app.route("/api/projects", methods=["GET"])
@roles_required(PROJECT_READ_ROLES)
def get_projects():
    projects = db.list_projects()

    if g.current_user["role"] == "Client / Project Owner":
        projects = [
            project for project in projects
            if client_can_access(project)
        ]

    return jsonify(projects)


@app.route("/api/projects/<project_id>", methods=["GET"])
@roles_required(PROJECT_READ_ROLES)
def get_project_by_id(project_id):
    project = db.get_project(project_id)

    if not project:
        return error_response("Project not found", 404)

    if not client_can_access(project):
        return error_response("Permission denied", 403)

    return jsonify(project)


@app.route("/api/projects", methods=["POST"])
@roles_required(["Contractor / Admin"])
def create_project():
    data = request.get_json(silent=True) or {}

    if not data.get("name") or not data.get("client"):
        return error_response("Project name and client are required")

    project = {
        "id": "PRJ-" + uuid.uuid4().hex[:8].upper(),
        **{
            key: value
            for key, value in data.items()
            if key in PROJECT_FIELDS
        }
    }

    project.setdefault("progress", 0)
    project.setdefault("status", "planning")

    try:
        saved = db.save_record("projects", project)
        return jsonify(saved), 201
    except (ValueError, sqlite3.Error) as error:
        return error_response(error)


@app.route("/api/projects/<project_id>", methods=["PUT"])
@roles_required(["Contractor / Admin"])
def update_project(project_id):
    data = request.get_json(silent=True) or {}
    existing = db.get_project(project_id)

    if not existing:
        return error_response("Project not found", 404)

    updates = {
        key: value
        for key, value in data.items()
        if key in PROJECT_FIELDS
    }

    if not updates:
        return error_response("No valid project fields supplied")

    try:
        saved = db.save_record("projects", {
            "id": project_id,
            **updates
        })
        return jsonify(saved)
    except (ValueError, sqlite3.Error) as error:
        return error_response(error)


@app.route("/api/projects/<project_id>", methods=["DELETE"])
@roles_required(["Contractor / Admin"])
def remove_project(project_id):
    if not db.get_project(project_id):
        return error_response("Project not found", 404)

    try:
        db.delete_project(project_id)
        return jsonify({"message": "Project deleted successfully"})
    except ProjectDeletionError as error:
        return error_response(error, 409)
    except (ValueError, sqlite3.Error) as error:
        return error_response(error)


# --------------------------------------------------
# TASK ROUTES
# --------------------------------------------------

@app.route("/api/tasks", methods=["GET"])
@roles_required(TASK_READ_ROLES)
def get_tasks():
    project_id = request.args.get("project_id")
    tasks = db.list_records("tasks", project_id=project_id)

    return jsonify(tasks)


@app.route("/api/tasks/<task_id>", methods=["GET"])
@roles_required(TASK_READ_ROLES)
def get_task_by_id(task_id):
    task = db.get_record("tasks", task_id)

    if not task:
        return error_response("Task not found", 404)

    return jsonify(task)


@app.route("/api/tasks", methods=["POST"])
@roles_required(TASK_WRITE_ROLES)
def create_task():
    data = request.get_json(silent=True) or {}

    if not data.get("title") or not data.get("project_id"):
        return error_response("Task title and project ID are required")

    if not db.get_project(str(data["project_id"])):
        return error_response("The selected project does not exist")

    task = {
        "id": "TSK-" + uuid.uuid4().hex[:8].upper(),
        **{
            key: value
            for key, value in data.items()
            if key in TASK_FIELDS
        }
    }

    task.setdefault("assigned_to", "Site Crew")
    task.setdefault("priority", "medium")
    task.setdefault("status", "todo")

    try:
        saved = db.save_record("tasks", task)
        return jsonify(saved), 201
    except (ValueError, sqlite3.Error) as error:
        return error_response(error)


@app.route("/api/tasks/<task_id>", methods=["PUT"])
@roles_required(TASK_WRITE_ROLES)
def update_task(task_id):
    data = request.get_json(silent=True) or {}
    existing = db.get_record("tasks", task_id)

    if not existing:
        return error_response("Task not found", 404)

    updates = {
        key: value
        for key, value in data.items()
        if key in TASK_FIELDS
    }

    if not updates:
        return error_response("No valid task fields supplied")

    project_id = updates.get("project_id", existing["project_id"])

    if not db.get_project(str(project_id)):
        return error_response("The selected project does not exist")

    try:
        saved = db.save_record("tasks", {
            "id": task_id,
            **updates
        })
        return jsonify(saved)
    except (ValueError, sqlite3.Error) as error:
        return error_response(error)


@app.route("/api/tasks/<task_id>", methods=["DELETE"])
@roles_required(TASK_WRITE_ROLES)
def remove_task(task_id):
    if not db.get_record("tasks", task_id):
        return error_response("Task not found", 404)

    try:
        db.delete_record("tasks", task_id)
        return jsonify({"message": "Task deleted successfully"})
    except (ValueError, sqlite3.Error) as error:
        return error_response(error)


# --------------------------------------------------
# START SERVER
# --------------------------------------------------

initialize_auth_table()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
