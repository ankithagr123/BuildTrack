from datetime import date, datetime
import random
from flask import Blueprint, jsonify, request
from db import query_all, execute_write

team3_bp = Blueprint("team3", __name__)


# ==============================================================================
# HELPER: Recalculate Project Spending after Expense Create/Update/Delete
# ==============================================================================
def recalculate_project_spent(project_id):
    if not project_id:
        return
    rows = query_all(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE project_id = ?",
        (project_id,),
    )
    total = float(rows[0]["total"]) if rows else 0.0
    execute_write("UPDATE projects SET spent = ? WHERE id = ?", (total, project_id))


# ==============================================================================
# 1. FINANCE MODULE (Expenses, Payments, Budget Summary)
# ==============================================================================
@team3_bp.route("/finance/expenses", methods=["GET"])
def get_expenses():
    project_id = request.args.get("projectId", "all")
    if project_id and project_id != "all":
        rows = query_all(
            """
            SELECT id, title, project_id AS projectId, category, amount,
                   CONVERT(VARCHAR(10), expense_date, 23) AS date,
                   payment_method AS paymentMethod, description
            FROM expenses
            WHERE project_id = ?
            ORDER BY expense_date DESC
            """,
            (project_id,),
        )
    else:
        rows = query_all(
            """
            SELECT id, title, project_id AS projectId, category, amount,
                   CONVERT(VARCHAR(10), expense_date, 23) AS date,
                   payment_method AS paymentMethod, description
            FROM expenses
            ORDER BY expense_date DESC
            """
        )
    return jsonify(rows), 200


@team3_bp.route("/finance/expenses", methods=["POST"])
def save_expense():
    data = request.get_json(force=True)
    expense_id = data.get("id")
    project_id = data.get("projectId")
    title = data.get("title", "").strip()
    category = data.get("category", "Other")
    amount = float(data.get("amount", 0))
    exp_date = data.get("date") or date.today().isoformat()
    payment_method = data.get("paymentMethod", "Bank Transfer (NEFT)")
    description = data.get("description", "")

    if not title or not project_id or amount <= 0:
        return jsonify({"error": "Valid title, projectId, and positive amount required"}), 400

    existing = query_all("SELECT id FROM expenses WHERE id = ?", (expense_id,)) if expense_id else []
    if existing:
        execute_write(
            """
            UPDATE expenses
            SET title = ?, project_id = ?, category = ?, amount = ?,
                expense_date = ?, payment_method = ?, description = ?
            WHERE id = ?
            """,
            (title, project_id, category, amount, exp_date, payment_method, description, expense_id),
        )
    else:
        expense_id = expense_id or f"EXP-{random.randint(300, 999)}"
        execute_write(
            """
            INSERT INTO expenses (id, title, project_id, category, amount, expense_date, payment_method, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (expense_id, title, project_id, category, amount, exp_date, payment_method, description),
        )

    recalculate_project_spent(project_id)
    data["id"] = expense_id
    return jsonify(data), 201


@team3_bp.route("/finance/expenses/<expense_id>", methods=["DELETE"])
def delete_expense(expense_id):
    rows = query_all("SELECT project_id FROM expenses WHERE id = ?", (expense_id,))
    project_id = rows[0]["project_id"] if rows else None
    execute_write("DELETE FROM expenses WHERE id = ?", (expense_id,))
    if project_id:
        recalculate_project_spent(project_id)
    return jsonify({"deleted": True, "id": expense_id}), 200


@team3_bp.route("/finance/payments", methods=["GET"])
def get_payments():
    project_id = request.args.get("projectId", "all")
    if project_id and project_id != "all":
        rows = query_all(
            """
            SELECT id, payment_ref AS paymentRef, project_id AS projectId, recipient,
                   amount, CONVERT(VARCHAR(10), payment_date, 23) AS date,
                   status, payment_method AS paymentMethod, notes
            FROM payments
            WHERE project_id = ?
            ORDER BY payment_date DESC
            """,
            (project_id,),
        )
    else:
        rows = query_all(
            """
            SELECT id, payment_ref AS paymentRef, project_id AS projectId, recipient,
                   amount, CONVERT(VARCHAR(10), payment_date, 23) AS date,
                   status, payment_method AS paymentMethod, notes
            FROM payments
            ORDER BY payment_date DESC
            """
        )
    return jsonify(rows), 200


@team3_bp.route("/finance/payments", methods=["POST"])
def save_payment():
    data = request.get_json(force=True)
    payment_id = data.get("id")
    payment_ref = data.get("paymentRef") or f"PAY-{date.today().year}-{random.randint(100, 999)}"
    project_id = data.get("projectId")
    recipient = data.get("recipient", "").strip()
    amount = float(data.get("amount", 0))
    pay_date = data.get("date") or date.today().isoformat()
    status = data.get("status", "Pending")
    payment_method = data.get("paymentMethod", "Bank Transfer (RTGS)")
    notes = data.get("notes", "")

    if not recipient or not project_id or amount <= 0:
        return jsonify({"error": "Valid recipient, projectId, and positive amount required"}), 400

    existing = query_all("SELECT id FROM payments WHERE id = ?", (payment_id,)) if payment_id else []
    if existing:
        execute_write(
            """
            UPDATE payments
            SET payment_ref = ?, project_id = ?, recipient = ?, amount = ?,
                payment_date = ?, status = ?, payment_method = ?, notes = ?
            WHERE id = ?
            """,
            (payment_ref, project_id, recipient, amount, pay_date, status, payment_method, notes, payment_id),
        )
    else:
        payment_id = payment_id or f"PAY-{random.randint(400, 999)}"
        execute_write(
            """
            INSERT INTO payments (id, payment_ref, project_id, recipient, amount, payment_date, status, payment_method, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (payment_id, payment_ref, project_id, recipient, amount, pay_date, status, payment_method, notes),
        )

    data["id"] = payment_id
    data["paymentRef"] = payment_ref
    return jsonify(data), 201


@team3_bp.route("/finance/payments/<payment_id>/toggle", methods=["PATCH"])
def toggle_payment_status(payment_id):
    rows = query_all("SELECT status FROM payments WHERE id = ?", (payment_id,))
    if not rows:
        return jsonify({"error": "Payment not found"}), 404
    new_status = "Pending" if rows[0]["status"] == "Paid" else "Paid"
    execute_write("UPDATE payments SET status = ? WHERE id = ?", (new_status, payment_id))
    return jsonify({"id": payment_id, "status": new_status}), 200


@team3_bp.route("/finance/payments/<payment_id>", methods=["DELETE"])
def delete_payment(payment_id):
    execute_write("DELETE FROM payments WHERE id = ?", (payment_id,))
    return jsonify({"deleted": True, "id": payment_id}), 200


# ==============================================================================
# 2. PROGRESS REPORTS MODULE (Daily Site Diary & Project % Sync)
# ==============================================================================
@team3_bp.route("/progress", methods=["GET"])
def get_progress_reports():
    project_id = request.args.get("projectId", "all")
    if project_id and project_id != "all":
        rows = query_all(
            """
            SELECT id, project_id AS projectId, CONVERT(VARCHAR(10), report_date, 23) AS date,
                   work_completed AS workCompleted, progress_percentage AS progressPercentage,
                   workers_present AS workersPresent, materials_consumed AS materialsConsumed,
                   issues_encountered AS issuesEncountered, delay_blockers AS delayBlockers,
                   next_day_plan AS nextDayPlan, reported_by AS reportedBy
            FROM daily_progress_reports
            WHERE project_id = ?
            ORDER BY report_date DESC
            """,
            (project_id,),
        )
    else:
        rows = query_all(
            """
            SELECT id, project_id AS projectId, CONVERT(VARCHAR(10), report_date, 23) AS date,
                   work_completed AS workCompleted, progress_percentage AS progressPercentage,
                   workers_present AS workersPresent, materials_consumed AS materialsConsumed,
                   issues_encountered AS issuesEncountered, delay_blockers AS delayBlockers,
                   next_day_plan AS nextDayPlan, reported_by AS reportedBy
            FROM daily_progress_reports
            ORDER BY report_date DESC
            """
        )
    return jsonify(rows), 200


@team3_bp.route("/progress", methods=["POST"])
def save_progress_report():
    data = request.get_json(force=True)
    report_id = data.get("id") or f"DPR-{random.randint(500, 999)}"
    project_id = data.get("projectId")
    rep_date = data.get("date") or date.today().isoformat()
    work_completed = data.get("workCompleted", "").strip()
    progress_pct = min(100, max(0, int(data.get("progressPercentage", 0))))
    workers_present = int(data.get("workersPresent", 0))
    materials_consumed = data.get("materialsConsumed", "None recorded")
    issues_encountered = data.get("issuesEncountered", "None")
    delay_blockers = data.get("delayBlockers", "None")
    next_day_plan = data.get("nextDayPlan", "Proceed as per plan")
    reported_by = data.get("reportedBy", "Site Engineer")

    if not project_id or not work_completed:
        return jsonify({"error": "projectId and workCompleted are required"}), 400

    execute_write(
        """
        INSERT INTO daily_progress_reports
            (id, project_id, report_date, work_completed, progress_percentage,
             workers_present, materials_consumed, issues_encountered,
             delay_blockers, next_day_plan, reported_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            report_id, project_id, rep_date, work_completed, progress_pct,
            workers_present, materials_consumed, issues_encountered,
            delay_blockers, next_day_plan, reported_by,
        ),
    )

    # Sync project progress percentage & completion status
    if progress_pct >= 100:
        execute_write(
            "UPDATE projects SET progress = 100, status = 'completed' WHERE id = ?",
            (project_id,),
        )
    elif progress_pct > 0:
        execute_write(
            "UPDATE projects SET progress = ? WHERE id = ?",
            (progress_pct, project_id),
        )

    data["id"] = report_id
    return jsonify(data), 201


@team3_bp.route("/progress/<report_id>", methods=["DELETE"])
def delete_progress_report(report_id):
    execute_write("DELETE FROM daily_progress_reports WHERE id = ?", (report_id,))
    return jsonify({"deleted": True, "id": report_id}), 200


# ==============================================================================
# 3. RISK INTELLIGENCE MODULE (Matches /api/v1/predict-risk in risks.js)
# ==============================================================================
@team3_bp.route("/predict-risk", methods=["GET", "POST"])
def predict_risk():
    projects = query_all(
        """
        SELECT id, name, client, location, manager,
               CONVERT(VARCHAR(10), start_date, 23) AS startDate,
               CONVERT(VARCHAR(10), expected_completion_date, 23) AS expectedCompletionDate,
               budget, spent, progress, status
        FROM projects
        """
    )
    tasks = query_all(
        """
        SELECT id, project_id AS projectId, title,
               CONVERT(VARCHAR(10), due_date, 23) AS dueDate,
               priority, status
        FROM tasks
        """
    )
    materials = query_all(
        """
        SELECT id, name, unit, quantity, min_stock_level AS minStockLevel,
               assigned_project_id AS assignedProjectId
        FROM materials
        """
    )
    labour = query_all(
        "SELECT id, assigned_project_id AS assignedProjectId, availability FROM labour"
    )

    today = date.today()
    today_str = today.isoformat()
    assessments = []
    total_risk_points = 0

    for p in projects:
        score = 0
        risks = []
        budget = float(p["budget"] or 1)
        spent = float(p["spent"] or 0)
        progress = int(p["progress"] or 0)

        # Rule 1: Budget Overrun & Burn Divergence
        budget_util = (spent / budget) * 100
        divergence = budget_util - progress
        if divergence > 15 or budget_util > 90:
            sev = "high" if (divergence > 25 or spent >= budget) else "medium"
            score += 25 if sev == "high" else 15
            risks.append({
                "category": "Budget Overrun Risk",
                "severity": sev,
                "title": f"Severe Cost Variance ({divergence:.1f}% Divergence)",
                "reason": f"Expenditure burn rate is outstripping physical site completion ({budget_util:.1f}% spent vs {progress}% progress).",
                "supportingData": f"Budget: ₹{budget:,.0f} | Spent: ₹{spent:,.0f} | Utilization: {budget_util:.1f}%",
                "recommendation": "Freeze discretionary subcontracts immediately and conduct quantity surveyor audit.",
                "indicator": "Cost Performance Index (CPI) < 0.78",
            })

        # Rule 2: Schedule Delay & Overdue Tasks
        due_dt = datetime.strptime(p["expectedCompletionDate"], "%Y-%m-%d").date()
        days_remaining = (due_dt - today).days
        work_remaining = 100 - progress
        overdue_tasks = [
            t for t in tasks
            if t["projectId"] == p["id"] and t["status"] != "completed" and t["dueDate"] < today_str
        ]
        if p["status"] == "delayed" or (days_remaining < 30 and work_remaining > 25) or len(overdue_tasks) >= 2:
            sev = "high" if (p["status"] == "delayed" or len(overdue_tasks) >= 2) else "medium"
            score += 20 if sev == "high" else 10
            risks.append({
                "category": "Schedule Delay Risk",
                "severity": sev,
                "title": f"Milestone Slippage ({len(overdue_tasks)} Overdue Work Packages)",
                "reason": f"{work_remaining}% of physical work remains with {max(0, days_remaining)} days to scheduled delivery.",
                "supportingData": f"Overdue Tasks: {', '.join(t['title'] for t in overdue_tasks) or 'Timeline compression'}",
                "recommendation": "Authorize staggered double-shift workforce and compress shuttering cycle times.",
                "indicator": "Schedule Performance Index (SPI) < 0.82",
            })

        # Rule 3: Material Stockout Threat
        stockouts = [
            m for m in materials
            if (m["assignedProjectId"] == p["id"] or not m["assignedProjectId"])
            and float(m["quantity"]) <= float(m["minStockLevel"])
        ]
        if stockouts:
            has_zero = any(float(m["quantity"]) <= 0 for m in stockouts)
            sev = "high" if (has_zero or len(stockouts) >= 2) else "medium"
            score += 15 if sev == "high" else 8
            risks.append({
                "category": "Material Depletion Risk",
                "severity": sev,
                "title": f"Supply Chain Bottleneck ({len(stockouts)} Items Below Safety Level)",
                "reason": "Key structural raw materials have fallen below minimum buffer thresholds on site.",
                "supportingData": "Depleted: " + ", ".join(f"{m['name']} ({m['quantity']} {m['unit']})" for m in stockouts),
                "recommendation": "Issue immediate emergency purchase orders to secondary empanelled distributors.",
                "indicator": "Stock-to-Threshold Ratio < 0.45",
            })

        # Rule 4: Labour Shortage Threat
        proj_labour = [w for w in labour if w["assignedProjectId"] == p["id"]]
        if proj_labour and p["status"] != "completed":
            present = sum(1 for w in proj_labour if w.get("availability") == "On Site")
            rate = (present / len(proj_labour)) * 100
            if rate < 70:
                score += 10
                risks.append({
                    "category": "Labour Shortage Risk",
                    "severity": "medium",
                    "title": f"Sub-Optimal Crew Attendance ({rate:.0f}% Deployment)",
                    "reason": "Active workforce turnout is inadequate to support concrete pours and steel tying.",
                    "supportingData": f"Turnout: {present} / {len(proj_labour)} workers on site.",
                    "recommendation": "Request backup mason and bar-bending gangs from labour contractor agency.",
                    "indicator": "Manpower Availability Ratio < 0.70",
                })

        total_risk_points += score
        status_label = "High Risk" if score >= 35 else ("Medium Risk" if score >= 15 else "Low Risk")
        assessments.append({
            "project": p,
            "score": min(100, score),
            "status": status_label,
            "risks": risks,
        })

    avg_risk = (total_risk_points / len(assessments)) if assessments else 0
    portfolio_health = max(0, min(100, round(100 - avg_risk)))
    return jsonify({"assessments": assessments, "portfolioHealth": portfolio_health}), 200


# ==============================================================================
# 4. DASHBOARD AGGREGATION ENDPOINT
# ==============================================================================
@team3_bp.route("/dashboard/summary", methods=["GET"])
def dashboard_summary():
    project_id = request.args.get("projectId", "all")
    proj_filter = "" if project_id == "all" else " WHERE id = ?"
    proj_params = () if project_id == "all" else (project_id,)

    projects = query_all(f"SELECT * FROM projects{proj_filter}", proj_params)
    exp_filter = "" if project_id == "all" else " WHERE project_id = ?"
    expenses = query_all(f"SELECT * FROM expenses{exp_filter}", proj_params)
    tasks = query_all(
        f"SELECT * FROM tasks{'' if project_id == 'all' else ' WHERE project_id = ?'}",
        proj_params,
    )
    materials = query_all(
        f"SELECT * FROM materials{'' if project_id == 'all' else ' WHERE assigned_project_id = ?'}",
        proj_params,
    )
    labour = query_all(
        f"SELECT * FROM labour{'' if project_id == 'all' else ' WHERE assigned_project_id = ?'}",
        proj_params,
    )

    total_budget = sum(float(p["budget"] or 0) for p in projects)
    total_expenses = sum(float(e["amount"] or 0) for e in expenses)
    active_labour = sum(1 for w in labour if w.get("availability") == "On Site")
    pending_tasks = sum(1 for t in tasks if t["status"] != "completed")
    low_stock = sum(1 for m in materials if float(m["quantity"]) <= float(m["min_stock_level"]))

    return jsonify({
        "kpis": {
            "totalProjects": len(projects),
            "ongoingProjects": sum(1 for p in projects if p["status"] == "ongoing"),
            "completedProjects": sum(1 for p in projects if p["status"] == "completed"),
            "delayedProjects": sum(1 for p in projects if p["status"] == "delayed"),
            "totalBudget": total_budget,
            "totalExpenses": total_expenses,
            "remainingBudget": total_budget - total_expenses,
            "activeLabourers": active_labour,
            "totalLabourers": len(labour),
            "pendingTasks": pending_tasks,
            "lowStockMaterials": low_stock,
        }
    }), 200


# ==============================================================================
# 5. REPORTS ENDPOINT (Multi-Domain Audit Data for reports.js)
# ==============================================================================
@team3_bp.route("/reports/<report_type>", methods=["GET"])
def generate_report(report_type):
    project_id = request.args.get("projectId", "all")
    params = () if project_id == "all" else (project_id,)

    if report_type == "progress":
        where = "" if project_id == "all" else " WHERE id = ?"
        data = query_all(
            f"""
            SELECT id, name, client, manager,
                   CONVERT(VARCHAR(10), expected_completion_date, 23) AS expectedCompletionDate,
                   status, progress
            FROM projects{where}
            """,
            params,
        )
    elif report_type == "finance":
        where = "" if project_id == "all" else " WHERE project_id = ?"
        data = query_all(
            f"""
            SELECT id, title, category,
                   CONVERT(VARCHAR(10), expense_date, 23) AS date,
                   payment_method AS paymentMethod, amount
            FROM expenses{where}
            ORDER BY expense_date DESC
            """,
            params,
        )
    elif report_type == "payments":
        where = "" if project_id == "all" else " WHERE project_id = ?"
        data = query_all(
            f"""
            SELECT payment_ref AS paymentRef, recipient,
                   CONVERT(VARCHAR(10), payment_date, 23) AS date,
                   payment_method AS paymentMethod, status, amount
            FROM payments{where}
            ORDER BY payment_date DESC
            """,
            params,
        )
    elif report_type == "labour":
        where = "" if project_id == "all" else " WHERE assigned_project_id = ?"
        data = query_all(
            f"SELECT id, name, skill, phone, daily_wage AS dailyWage, availability FROM labour{where}",
            params,
        )
    elif report_type == "materials":
        where = "" if project_id == "all" else " WHERE assigned_project_id = ?"
        data = query_all(
            f"""
            SELECT id, name, category, quantity, unit,
                   min_stock_level AS minStockLevel, unit_price AS unitPrice
            FROM materials{where}
            """,
            params,
        )
    elif report_type == "tasks":
        where = " WHERE status <> 'completed' AND due_date < CAST(GETDATE() AS DATE)"
        if project_id != "all":
            where += " AND project_id = ?"
        data = query_all(
            f"""
            SELECT id, title, assigned_to AS assignedTo,
                   CONVERT(VARCHAR(10), due_date, 23) AS dueDate,
                   priority, status
            FROM tasks{where}
            """,
            params,
        )
    else:
        return jsonify({"error": f"Unknown report type: {report_type}"}), 400

    return jsonify({"reportType": report_type, "records": data}), 200