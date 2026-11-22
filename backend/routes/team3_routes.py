import os
import sqlite3
from datetime import datetime
from flask import Blueprint, jsonify, request

team3_bp = Blueprint("team3", __name__, url_prefix="/api")

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "buildtrack.db"))


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_team3_tables():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            client_name TEXT,
            location TEXT,
            budget REAL DEFAULT 0,
            spent REAL DEFAULT 0,
            progress INTEGER DEFAULT 0,
            status TEXT DEFAULT 'Active',
            start_date TEXT,
            end_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            title TEXT NOT NULL,
            assigned_to TEXT,
            status TEXT DEFAULT 'Pending',
            priority TEXT DEFAULT 'Medium',
            due_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS finance_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            type TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            status TEXT DEFAULT 'Completed',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            payee TEXT NOT NULL,
            role_or_vendor TEXT,
            amount REAL NOT NULL,
            payment_method TEXT DEFAULT 'Bank Transfer',
            status TEXT DEFAULT 'Paid',
            payment_date TEXT NOT NULL,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS daily_progress_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            report_date TEXT NOT NULL,
            work_completed TEXT NOT NULL,
            workers_present INTEGER DEFAULT 0,
            weather TEXT DEFAULT 'Clear',
            completion_percentage INTEGER DEFAULT 0,
            issues TEXT,
            reported_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS project_risks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            title TEXT NOT NULL,
            category TEXT DEFAULT 'Operational',
            severity TEXT DEFAULT 'Medium',
            probability TEXT DEFAULT 'Medium',
            impact TEXT,
            mitigation_plan TEXT,
            status TEXT DEFAULT 'Open',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
    """)

    existing = cur.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
    if existing == 0:
        cur.execute("""
            INSERT INTO projects (name, client_name, location, budget, spent, progress, status, start_date, end_date)
            VALUES
            ('Skyline Commercial Tower', 'Apex Infrastructure Ltd', 'Bengaluru', 5000000, 3150000, 65, 'Active', '2026-01-15', '2026-12-20'),
            ('Greenwood Residential Villas', 'Emerald Estates', 'Hyderabad', 3200000, 1440000, 45, 'Active', '2026-03-01', '2027-02-28')
        """)

    if cur.execute("SELECT COUNT(*) FROM finance_transactions").fetchone()[0] == 0:
        cur.execute("""
            INSERT INTO finance_transactions (project_id, type, category, description, amount, date, status)
            VALUES
            (1, 'Income', 'Client Milestone', 'Phase 2 Structural Completion Payment', 2000000, '2026-11-10', 'Completed'),
            (1, 'Expense', 'Materials', 'Reinforced Steel & Ready-Mix Concrete', 650000, '2026-11-15', 'Completed'),
            (2, 'Expense', 'Equipment Rental', 'Tower Crane & Excavator Monthly Lease', 240000, '2026-11-18', 'Completed')
        """)

    if cur.execute("SELECT COUNT(*) FROM payments").fetchone()[0] == 0:
        cur.execute("""
            INSERT INTO payments (project_id, payee, role_or_vendor, amount, payment_method, status, payment_date, notes)
            VALUES
            (1, 'UltraTech Concrete Supply', 'Material Vendor', 420000, 'Bank Transfer', 'Paid', '2026-11-16', 'Invoice #UT-884'),
            (2, 'Site Masonry Crew (Batch A)', 'Subcontractor', 185000, 'UPI / NEFT', 'Paid', '2026-11-20', 'Weekly payroll payout')
        """)

    if cur.execute("SELECT COUNT(*) FROM daily_progress_reports").fetchone()[0] == 0:
        cur.execute("""
            INSERT INTO daily_progress_reports
            (project_id, report_date, work_completed, workers_present, weather, completion_percentage, issues, reported_by)
            VALUES
            (1, '2026-11-21', 'Completed 8th-floor slab shuttering and electrical conduit laying', 42, 'Clear', 65, 'None', 'Rohan Verma (Site Engineer)'),
            (2, '2026-11-21', 'Foundation curing for Villas 4-6 and boundary wall brickwork', 28, 'Partly Cloudy', 45, 'Minor delay in sand delivery', 'Ananya Nair (Project Lead)')
        """)

    if cur.execute("SELECT COUNT(*) FROM project_risks").fetchone()[0] == 0:
        cur.execute("""
            INSERT INTO project_risks (project_id, title, category, severity, probability, impact, mitigation_plan, status)
            VALUES
            (1, 'Steel Price Escalation', 'Financial', 'High', 'Medium', 'May increase structural budget by 8%', 'Lock in bulk vendor rate for Q1 2027 supply', 'Open'),
            (2, 'Monsoon Drainage Waterlogging', 'Environmental', 'Medium', 'High', 'Could halt excavation work for 4-5 days', 'Install two high-capacity dewatering pumps on east perimeter', 'Open')
        """)

    conn.commit()
    conn.close()


# ==========================================
# 1. PROJECTS & TASKS
# ==========================================
@team3_bp.route("/projects", methods=["GET", "POST"])
def handle_projects():
    conn = get_db()
    if request.method == "GET":
        rows = conn.execute("SELECT * FROM projects ORDER BY id DESC").fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])

    data = request.get_json() or {}
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO projects (name, client_name, location, budget, spent, progress, status, start_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.get("name", "Untitled Project"),
            data.get("client_name", ""),
            data.get("location", ""),
            float(data.get("budget", 0)),
            float(data.get("spent", 0)),
            int(data.get("progress", 0)),
            data.get("status", "Active"),
            data.get("start_date", datetime.now().strftime("%Y-%m-%d")),
            data.get("end_date", ""),
        ),
    )
    conn.commit()
    new_id = cur.lastrowid
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (new_id,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@team3_bp.route("/projects/<int:project_id>", methods=["PUT", "PATCH", "DELETE"])
def update_delete_project(project_id):
    conn = get_db()
    if request.method == "DELETE":
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Project deleted"})

    data = request.get_json() or {}
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Project not found"}), 404

    current = dict(row)
    conn.execute(
        """
        UPDATE projects
        SET name=?, client_name=?, location=?, budget=?, spent=?, progress=?, status=?, start_date=?, end_date=?
        WHERE id=?
        """,
        (
            data.get("name", current["name"]),
            data.get("client_name", current["client_name"]),
            data.get("location", current["location"]),
            float(data.get("budget", current["budget"])),
            float(data.get("spent", current["spent"])),
            int(data.get("progress", current["progress"])),
            data.get("status", current["status"]),
            data.get("start_date", current["start_date"]),
            data.get("end_date", current["end_date"]),
            project_id,
        ),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()
    return jsonify(dict(updated))


@team3_bp.route("/tasks", methods=["GET", "POST"])
def handle_tasks():
    conn = get_db()
    if request.method == "GET":
        project_id = request.args.get("project_id")
        if project_id:
            rows = conn.execute("SELECT * FROM tasks WHERE project_id = ? ORDER BY id DESC", (project_id,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM tasks ORDER BY id DESC").fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])

    data = request.get_json() or {}
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO tasks (project_id, title, assigned_to, status, priority, due_date)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            data.get("project_id"),
            data.get("title", "New Task"),
            data.get("assigned_to", ""),
            data.get("status", "Pending"),
            data.get("priority", "Medium"),
            data.get("due_date", ""),
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


# ==========================================
# 2. FINANCE MANAGEMENT & PAYMENTS
# ==========================================
@team3_bp.route("/finance", methods=["GET", "POST"])
def handle_finance():
    conn = get_db()
    if request.method == "GET":
        txns = [dict(r) for r in conn.execute("SELECT * FROM finance_transactions ORDER BY date DESC, id DESC").fetchall()]
        payments = [dict(r) for r in conn.execute("SELECT * FROM payments ORDER BY payment_date DESC, id DESC").fetchall()]

        total_income = sum(t["amount"] for t in txns if t["type"].lower() == "income")
        total_expense = sum(t["amount"] for t in txns if t["type"].lower() == "expense")
        total_payments = sum(p["amount"] for p in payments if p["status"].lower() == "paid")

        conn.close()
        return jsonify({
            "transactions": txns,
            "payments": payments,
            "summary": {
                "total_income": total_income,
                "total_expense": total_expense,
                "total_payments": total_payments,
                "net_balance": total_income - (total_expense + total_payments),
            },
        })

    data = request.get_json() or {}
    cur = conn.cursor()
    amount = float(data.get("amount", 0))
    tx_type = data.get("type", "Expense")
    project_id = data.get("project_id")

    cur.execute(
        """
        INSERT INTO finance_transactions (project_id, type, category, description, amount, date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            project_id,
            tx_type,
            data.get("category", "General"),
            data.get("description", ""),
            amount,
            data.get("date", datetime.now().strftime("%Y-%m-%d")),
            data.get("status", "Completed"),
        ),
    )

    if project_id and tx_type.lower() == "expense":
        cur.execute("UPDATE projects SET spent = spent + ? WHERE id = ?", (amount, project_id))

    conn.commit()
    row = conn.execute("SELECT * FROM finance_transactions WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@team3_bp.route("/finance/<int:tx_id>", methods=["DELETE"])
def delete_finance_transaction(tx_id):
    conn = get_db()
    conn.execute("DELETE FROM finance_transactions WHERE id = ?", (tx_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Transaction deleted"})


@team3_bp.route("/payments", methods=["GET", "POST"])
def handle_payments():
    conn = get_db()
    if request.method == "GET":
        rows = conn.execute("SELECT * FROM payments ORDER BY payment_date DESC, id DESC").fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])

    data = request.get_json() or {}
    cur = conn.cursor()
    amount = float(data.get("amount", 0))
    project_id = data.get("project_id")

    cur.execute(
        """
        INSERT INTO payments (project_id, payee, role_or_vendor, amount, payment_method, status, payment_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            project_id,
            data.get("payee", "Vendor/Worker"),
            data.get("role_or_vendor", "Contractor"),
            amount,
            data.get("payment_method", "Bank Transfer"),
            data.get("status", "Paid"),
            data.get("payment_date", datetime.now().strftime("%Y-%m-%d")),
            data.get("notes", ""),
        ),
    )

    if project_id and data.get("status", "Paid").lower() == "paid":
        cur.execute("UPDATE projects SET spent = spent + ? WHERE id = ?", (amount, project_id))

    conn.commit()
    row = conn.execute("SELECT * FROM payments WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


# ==========================================
# 3. DAILY PROGRESS REPORTS
# ==========================================
@team3_bp.route("/progress", methods=["GET", "POST"])
def handle_progress():
    conn = get_db()
    if request.method == "GET":
        rows = conn.execute("""
            SELECT dpr.*, p.name AS project_name
            FROM daily_progress_reports dpr
            LEFT JOIN projects p ON dpr.project_id = p.id
            ORDER BY dpr.report_date DESC, dpr.id DESC
        """).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])

    data = request.get_json() or {}
    cur = conn.cursor()
    project_id = data.get("project_id")
    completion = int(data.get("completion_percentage", 0))

    cur.execute(
        """
        INSERT INTO daily_progress_reports
        (project_id, report_date, work_completed, workers_present, weather, completion_percentage, issues, reported_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            project_id,
            data.get("report_date", datetime.now().strftime("%Y-%m-%d")),
            data.get("work_completed", ""),
            int(data.get("workers_present", 0)),
            data.get("weather", "Clear"),
            completion,
            data.get("issues", "None"),
            data.get("reported_by", "Site Engineer"),
        ),
    )

    if project_id and completion > 0:
        cur.execute("UPDATE projects SET progress = ? WHERE id = ?", (min(completion, 100), project_id))

    conn.commit()
    row = conn.execute("SELECT * FROM daily_progress_reports WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@team3_bp.route("/progress/<int:report_id>", methods=["DELETE"])
def delete_progress(report_id):
    conn = get_db()
    conn.execute("DELETE FROM daily_progress_reports WHERE id = ?", (report_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Progress report deleted"})


# ==========================================
# 4. RISK INTELLIGENCE
# ==========================================
@team3_bp.route("/risks", methods=["GET", "POST"])
def handle_risks():
    conn = get_db()
    if request.method == "GET":
        rows = conn.execute("""
            SELECT r.*, p.name AS project_name
            FROM project_risks r
            LEFT JOIN projects p ON r.project_id = p.id
            ORDER BY r.id DESC
        """).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])

    data = request.get_json() or {}
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO project_risks (project_id, title, category, severity, probability, impact, mitigation_plan, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.get("project_id"),
            data.get("title", "Site Risk"),
            data.get("category", "Operational"),
            data.get("severity", "Medium"),
            data.get("probability", "Medium"),
            data.get("impact", ""),
            data.get("mitigation_plan", ""),
            data.get("status", "Open"),
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM project_risks WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@team3_bp.route("/risks/<int:risk_id>", methods=["PUT", "PATCH", "DELETE"])
def update_delete_risk(risk_id):
    conn = get_db()
    if request.method == "DELETE":
        conn.execute("DELETE FROM project_risks WHERE id = ?", (risk_id,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Risk deleted"})

    data = request.get_json() or {}
    row = conn.execute("SELECT * FROM project_risks WHERE id = ?", (risk_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Risk not found"}), 404

    current = dict(row)
    conn.execute(
        """
        UPDATE project_risks
        SET title=?, category=?, severity=?, probability=?, impact=?, mitigation_plan=?, status=?
        WHERE id=?
        """,
        (
            data.get("title", current["title"]),
            data.get("category", current["category"]),
            data.get("severity", current["severity"]),
            data.get("probability", current["probability"]),
            data.get("impact", current["impact"]),
            data.get("mitigation_plan", current["mitigation_plan"]),
            data.get("status", current["status"]),
            risk_id,
        ),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM project_risks WHERE id = ?", (risk_id,)).fetchone()
    conn.close()
    return jsonify(dict(updated))


# ==========================================
# 5. DASHBOARD & ANALYTICS REPORTS (INTEGRATED)
# ==========================================
@team3_bp.route("/dashboard", methods=["GET"])
def get_dashboard():
    conn = get_db()
    projects = [dict(r) for r in conn.execute("SELECT * FROM projects").fetchall()]
    risks = [dict(r) for r in conn.execute("SELECT * FROM project_risks WHERE status != 'Resolved'").fetchall()]
    txns = [dict(r) for r in conn.execute("SELECT * FROM finance_transactions").fetchall()]

    tables = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}

    total_workers = conn.execute("SELECT COUNT(*) FROM workers").fetchone()[0] if "workers" in tables else 0
    low_stock_materials = (
        conn.execute("SELECT COUNT(*) FROM materials WHERE quantity <= min_stock_level").fetchone()[0]
        if "materials" in tables
        else 0
    )

    total_budget = sum(p.get("budget", 0) for p in projects)
    total_spent = sum(p.get("spent", 0) for p in projects)
    avg_progress = round(sum(p.get("progress", 0) for p in projects) / len(projects), 1) if projects else 0
    high_risks = sum(1 for r in risks if r.get("severity", "").lower() in ("high", "critical"))

    conn.close()
    return jsonify({
        "kpis": {
            "active_projects": len([p for p in projects if p.get("status") == "Active"]),
            "total_projects": len(projects),
            "total_budget": total_budget,
            "total_spent": total_spent,
            "budget_utilization": round((total_spent / total_budget) * 100, 1) if total_budget > 0 else 0,
            "average_progress": avg_progress,
            "open_risks": len(risks),
            "high_severity_risks": high_risks,
            "total_workers": total_workers,
            "low_stock_materials": low_stock_materials,
        },
        "projects": projects,
        "recent_transactions": txns[:5],
        "active_risks": risks[:5],
    })


@team3_bp.route("/reports", methods=["GET"])
def get_reports():
    conn = get_db()
    projects = [dict(r) for r in conn.execute("SELECT * FROM projects").fetchall()]
    txns = [dict(r) for r in conn.execute("SELECT * FROM finance_transactions").fetchall()]
    progress_logs = [dict(r) for r in conn.execute("SELECT * FROM daily_progress_reports ORDER BY report_date DESC").fetchall()]
    risks = [dict(r) for r in conn.execute("SELECT * FROM project_risks").fetchall()]

    tables = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    workers = [dict(r) for r in conn.execute("SELECT * FROM workers").fetchall()] if "workers" in tables else []
    materials = [dict(r) for r in conn.execute("SELECT * FROM materials").fetchall()] if "materials" in tables else []

    conn.close()
    return jsonify({
        "generated_at": datetime.now().isoformat(),
        "projects_summary": projects,
        "finance_summary": {
            "transactions_count": len(txns),
            "total_income": sum(t["amount"] for t in txns if t["type"].lower() == "income"),
            "total_expense": sum(t["amount"] for t in txns if t["type"].lower() == "expense"),
        },
        "progress_reports": progress_logs,
        "risk_summary": {
            "total": len(risks),
            "open": sum(1 for r in risks if r["status"] == "Open"),
            "resolved": sum(1 for r in risks if r["status"] == "Resolved"),
            "items": risks,
        },
        "workforce_count": len(workers),
        "materials_count": len(materials),
    })