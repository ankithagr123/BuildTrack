from flask import Flask, jsonify, request
import sqlite3
from pathlib import Path
from datetime import date, datetime

app = Flask(__name__)
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response

DATABASE = Path(__file__).parent / "buildtrack.db"


# DATABASE CONNECTION
def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


# ADD MISSING COLUMNS WITHOUT DELETING EXISTING DATA
def add_column(connection, table, column, definition):
    columns = [
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table})")
    ]

    if column not in columns:
        connection.execute(
            f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
        )


# DATABASE INITIALIZATION
def initialize_database():
    connection = get_db()

    connection.execute("""
        CREATE TABLE IF NOT EXISTS workers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT,
            daily_wage REAL DEFAULT 0,
            project_id TEXT
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            status TEXT NOT NULL,
            FOREIGN KEY(worker_id) REFERENCES workers(id),
            UNIQUE(worker_id, date)
        )
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            quantity REAL DEFAULT 0,
            unit TEXT,
            project_id TEXT
        )
    """)

    # Worker fields
    add_column(connection, "workers", "frontend_id", "TEXT")
    add_column(connection, "workers", "skill", "TEXT")
    add_column(connection, "workers", "phone", "TEXT")
    add_column(connection, "workers", "availability", "TEXT")
    add_column(connection, "workers", "status", "TEXT")

    # Material fields
    add_column(connection, "materials", "frontend_id", "TEXT")
    add_column(connection, "materials", "category", "TEXT")
    add_column(connection, "materials", "min_stock_level", "REAL DEFAULT 0")
    add_column(connection, "materials", "unit_price", "REAL DEFAULT 0")
    add_column(connection, "materials", "supplier", "TEXT")
    add_column(connection, "materials", "last_updated", "TEXT")

    # Assign IDs to existing records
    for worker in connection.execute(
        "SELECT id FROM workers WHERE frontend_id IS NULL"
    ).fetchall():
        connection.execute(
            "UPDATE workers SET frontend_id = ? WHERE id = ?",
            (f"WRK-{100 + worker['id']}", worker["id"])
        )

    for material in connection.execute(
        "SELECT id FROM materials WHERE frontend_id IS NULL"
    ).fetchall():
        connection.execute(
            "UPDATE materials SET frontend_id = ? WHERE id = ?",
            (f"MAT-{100 + material['id']}", material["id"])
        )

    connection.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_worker_frontend_id ON workers(frontend_id)
    """)

    connection.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_material_frontend_id ON materials(frontend_id)
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS material_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            material_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            quantity REAL NOT NULL,
            notes TEXT,
            project_id TEXT,
            transaction_date TEXT NOT NULL,
            FOREIGN KEY(material_id) REFERENCES materials(id)
        )
    """)

    connection.commit()
    connection.close()


# HELPER: FIND WORKER USING FRONTEND OR DATABASE ID
def find_worker(connection, worker_id):
    return connection.execute("""
        SELECT * FROM workers
        WHERE frontend_id = ? OR CAST(id AS TEXT) = ?
    """, (str(worker_id), str(worker_id))).fetchone()


# HELPER: FIND MATERIAL USING FRONTEND OR DATABASE ID
def find_material(connection, material_id):
    return connection.execute("""
        SELECT * FROM materials
        WHERE frontend_id = ? OR CAST(id AS TEXT) = ?
    """, (str(material_id), str(material_id))).fetchone()


# HOME
@app.route("/")
def home():
    return jsonify({"message": "BuildTrack Backend is Running!"})


# HEALTH CHECK
@app.route("/api/health")
def health():
    return jsonify({
        "status": "success",
        "message": "Backend connected"
    })


# -------------------------------
# LABOUR MANAGEMENT
# -------------------------------

# GET ALL WORKERS
@app.route("/api/workers", methods=["GET"])
def get_workers():
    connection = get_db()

    workers = connection.execute("""
        SELECT
            frontend_id AS id,
            name,
            role,
            skill,
            phone,
            daily_wage AS dailyWage,
            project_id AS assignedProjectId,
            availability,
            status
        FROM workers
    """).fetchall()

    connection.close()
    return jsonify([dict(worker) for worker in workers])


# ADD WORKER
@app.route("/api/workers", methods=["POST"])
def add_worker():
    data = request.get_json(silent=True) or {}

    name = data.get("name")

    if not isinstance(name, str) or not name.strip():
        return jsonify({"error": "Worker name is required"}), 400

    try:
        wage = float(data.get("daily_wage", data.get("dailyWage", 0)))
        if wage < 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid daily wage"}), 400

    connection = get_db()

    frontend_id = data.get("id")

    if not frontend_id:
        frontend_id = f"WRK-{100 + connection.execute(
            'SELECT COALESCE(MAX(id), 0) + 1 FROM workers'
        ).fetchone()[0]}"

    try:
        connection.execute("""
            INSERT INTO workers
            (frontend_id, name, role, skill, phone, daily_wage,
             project_id, availability, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            frontend_id,
            name.strip(),
            data.get("role", data.get("skill", "")),
            data.get("skill", ""),
            data.get("phone", ""),
            wage,
            data.get("project_id", data.get("assignedProjectId", "")),
            data.get("availability", ""),
            data.get("status", "active")
        ))

        connection.commit()

    except sqlite3.IntegrityError:
        connection.close()
        return jsonify({"error": "Worker ID already exists"}), 409

    connection.close()

    return jsonify({
        "message": "Worker added successfully",
        "worker_id": frontend_id
    }), 201


# UPDATE WORKER
@app.route("/api/workers/<worker_id>", methods=["PUT"])
def update_worker(worker_id):
    data = request.get_json(silent=True) or {}

    connection = get_db()
    worker = find_worker(connection, worker_id)

    if worker is None:
        connection.close()
        return jsonify({"error": "Worker not found"}), 404

    try:
        wage = float(data.get("daily_wage",
                              data.get("dailyWage", worker["daily_wage"] or 0)))
        if wage < 0:
            raise ValueError
    except (TypeError, ValueError):
        connection.close()
        return jsonify({"error": "Invalid daily wage"}), 400

    connection.execute("""
        UPDATE workers
        SET name = ?, role = ?, skill = ?, phone = ?,
            daily_wage = ?, project_id = ?, availability = ?, status = ?
        WHERE id = ?
    """, (
        data.get("name", worker["name"]),
        data.get("role", worker["role"]),
        data.get("skill", worker["skill"]),
        data.get("phone", worker["phone"]),
        wage,
        data.get("project_id", data.get(
            "assignedProjectId", worker["project_id"]
        )),
        data.get("availability", worker["availability"]),
        data.get("status", worker["status"]),
        worker["id"]
    ))

    connection.commit()
    connection.close()

    return jsonify({"message": "Worker updated successfully"})


# DELETE WORKER
@app.route("/api/workers/<worker_id>", methods=["DELETE"])
def delete_worker(worker_id):
    connection = get_db()
    worker = find_worker(connection, worker_id)

    if worker is None:
        connection.close()
        return jsonify({"error": "Worker not found"}), 404

    connection.execute(
        "DELETE FROM attendance WHERE worker_id = ?",
        (worker["id"],)
    )

    connection.execute(
        "DELETE FROM workers WHERE id = ?",
        (worker["id"],)
    )

    connection.commit()
    connection.close()

    return jsonify({"message": "Worker deleted successfully"})


# -------------------------------
# ATTENDANCE MANAGEMENT
# -------------------------------

# MARK ATTENDANCE
@app.route("/api/attendance", methods=["POST"])
def mark_attendance():
    data = request.get_json(silent=True) or {}

    worker_id = data.get("worker_id")
    status = str(data.get("status", "")).upper()
    attendance_date = data.get("date", date.today().isoformat())

    if not worker_id:
        return jsonify({"error": "Worker ID is required"}), 400

    if status not in ["P", "A", "L"]:
        return jsonify({"error": "Status must be P, A or L"}), 400

    try:
        datetime.strptime(attendance_date, "%Y-%m-%d")
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid date format"}), 400

    connection = get_db()
    worker = find_worker(connection, worker_id)

    if worker is None:
        connection.close()
        return jsonify({"error": "Worker not found"}), 404

    connection.execute("""
        INSERT INTO attendance (worker_id, date, status)
        VALUES (?, ?, ?)
        ON CONFLICT(worker_id, date)
        DO UPDATE SET status = excluded.status
    """, (worker["id"], attendance_date, status))

    connection.commit()
    connection.close()

    return jsonify({
        "message": "Attendance marked successfully",
        "worker_id": worker["frontend_id"],
        "date": attendance_date,
        "status": status
    })


# GET ATTENDANCE
@app.route("/api/attendance", methods=["GET"])
def get_attendance():
    connection = get_db()

    records = connection.execute("""
        SELECT
            workers.frontend_id AS worker_id,
            workers.name,
            attendance.date,
            attendance.status
        FROM attendance
        JOIN workers ON attendance.worker_id = workers.id
        ORDER BY attendance.date DESC
    """).fetchall()

    connection.close()
    return jsonify([dict(record) for record in records])


# -------------------------------
# MATERIAL MANAGEMENT
# -------------------------------

# GET MATERIALS
@app.route("/api/materials", methods=["GET"])
def get_materials():
    connection = get_db()

    materials = connection.execute("""
        SELECT
            frontend_id AS id,
            name,
            category,
            quantity,
            unit,
            min_stock_level AS minStockLevel,
            unit_price AS unitPrice,
            supplier,
            project_id AS assignedProjectId,
            last_updated AS lastUpdated
        FROM materials
    """).fetchall()

    connection.close()
    return jsonify([dict(material) for material in materials])


# ADD MATERIAL
@app.route("/api/materials", methods=["POST"])
def add_material():
    data = request.get_json(silent=True) or {}

    name = data.get("name")

    if not isinstance(name, str) or not name.strip():
        return jsonify({"error": "Material name is required"}), 400

    try:
        quantity = float(data.get("quantity", 0))
        minimum = float(data.get("minStockLevel", 0))
        price = float(data.get("unitPrice", 0))

        if min(quantity, minimum, price) < 0:
            raise ValueError

    except (TypeError, ValueError):
        return jsonify({"error": "Invalid material values"}), 400

    connection = get_db()
    frontend_id = data.get("id")

    if not frontend_id:
        next_id = connection.execute(
            "SELECT COALESCE(MAX(id), 0) + 1 FROM materials"
        ).fetchone()[0]
        frontend_id = f"MAT-{100 + next_id}"

    try:
        connection.execute("""
            INSERT INTO materials
            (frontend_id, name, category, quantity, unit,
             min_stock_level, unit_price, supplier,
             project_id, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            frontend_id,
            name.strip(),
            data.get("category", ""),
            quantity,
            data.get("unit", "Units"),
            minimum,
            price,
            data.get("supplier", ""),
            data.get("assignedProjectId", data.get("project_id", "")),
            data.get("lastUpdated", date.today().isoformat())
        ))

        connection.commit()

    except sqlite3.IntegrityError:
        connection.close()
        return jsonify({"error": "Material ID already exists"}), 409

    connection.close()

    return jsonify({
        "message": "Material added successfully",
        "material_id": frontend_id
    }), 201


# UPDATE MATERIAL
@app.route("/api/materials/<material_id>", methods=["PUT"])
def update_material(material_id):
    data = request.get_json(silent=True) or {}

    connection = get_db()
    material = find_material(connection, material_id)

    if material is None:
        connection.close()
        return jsonify({"error": "Material not found"}), 404

    try:
        quantity = float(data.get("quantity", material["quantity"] or 0))
        minimum = float(data.get(
            "minStockLevel", material["min_stock_level"] or 0
        ))
        price = float(data.get("unitPrice", material["unit_price"] or 0))

        if min(quantity, minimum, price) < 0:
            raise ValueError

    except (TypeError, ValueError):
        connection.close()
        return jsonify({"error": "Invalid material values"}), 400

    connection.execute("""
        UPDATE materials
        SET name = ?, category = ?, quantity = ?, unit = ?,
            min_stock_level = ?, unit_price = ?, supplier = ?,
            project_id = ?, last_updated = ?
        WHERE id = ?
    """, (
        data.get("name", material["name"]),
        data.get("category", material["category"]),
        quantity,
        data.get("unit", material["unit"]),
        minimum,
        price,
        data.get("supplier", material["supplier"]),
        data.get("assignedProjectId", material["project_id"]),
        date.today().isoformat(),
        material["id"]
    ))

    connection.commit()
    connection.close()

    return jsonify({"message": "Material updated successfully"})


# DELETE MATERIAL
@app.route("/api/materials/<material_id>", methods=["DELETE"])
def delete_material(material_id):
    connection = get_db()
    material = find_material(connection, material_id)

    if material is None:
        connection.close()
        return jsonify({"error": "Material not found"}), 404

    connection.execute(
        "DELETE FROM material_history WHERE material_id = ?",
        (material["id"],)
    )

    connection.execute(
        "DELETE FROM materials WHERE id = ?",
        (material["id"],)
    )

    connection.commit()
    connection.close()

    return jsonify({"message": "Material deleted successfully"})


# STOCK IN / STOCK OUT
@app.route("/api/materials/<material_id>/stock", methods=["POST"])
def update_stock(material_id):
    data = request.get_json(silent=True) or {}

    action = str(data.get("action", "")).lower()
    notes = data.get("notes", "")
    project_id = data.get("project_id", "")

    try:
        quantity = float(data.get("quantity", 0))
        if quantity <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "Quantity must be greater than zero"}), 400

    if action not in ["in", "out"]:
        return jsonify({"error": "Action must be in or out"}), 400

    connection = get_db()
    material = find_material(connection, material_id)

    if material is None:
        connection.close()
        return jsonify({"error": "Material not found"}), 404

    current = material["quantity"] or 0

    if action == "out" and quantity > current:
        connection.close()
        return jsonify({
            "error": "Insufficient stock",
            "available_quantity": current
        }), 400

    new_quantity = current + quantity if action == "in" else current - quantity

    connection.execute("""
        UPDATE materials
        SET quantity = ?, last_updated = ?
        WHERE id = ?
    """, (new_quantity, date.today().isoformat(), material["id"]))

    connection.execute("""
        INSERT INTO material_history
        (material_id, action, quantity, notes, project_id, transaction_date)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        material["id"],
        action,
        quantity,
        notes,
        project_id,
        date.today().isoformat()
    ))

    connection.commit()
    connection.close()

    return jsonify({
        "message": "Stock updated successfully",
        "material_id": material["frontend_id"],
        "previous_quantity": current,
        "new_quantity": new_quantity
    })


# GET MATERIAL HISTORY
@app.route("/api/materials/<material_id>/history", methods=["GET"])
def get_material_history(material_id):
    connection = get_db()
    material = find_material(connection, material_id)

    if material is None:
        connection.close()
        return jsonify({"error": "Material not found"}), 404

    history = connection.execute("""
        SELECT
            action AS type,
            quantity,
            notes,
            project_id,
            transaction_date AS date
        FROM material_history
        WHERE material_id = ?
        ORDER BY id DESC
    """, (material["id"],)).fetchall()

    connection.close()
    return jsonify([dict(record) for record in history])


# RUN APPLICATION
if __name__ == "__main__":
    initialize_database()
    app.run(debug=True)