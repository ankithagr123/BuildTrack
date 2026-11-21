import sqlite3

DB_PATH = "backend/buildtrack.db"

workers = [
    ("WRK-101", "Ramesh Patel", "Head Mason", "+91 98452 31102", "PRJ-01", 950),
    ("WRK-102", "Suresh Verma", "Shuttering Carpenter", "+91 97110 44290", "PRJ-01", 900),
    ("WRK-103", "Manjunath Gowda", "Lead Bar Bender / Rebar", "+91 94481 88320", "PRJ-03", 1050),
    ("WRK-104", "Abdul Karim", "Licensed Electrician", "+91 98205 66712", "PRJ-02", 1100),
    ("WRK-105", "Murugan K.", "Senior Plumber", "+91 94432 99180", "PRJ-02", 1050),
    ("WRK-106", "Dinesh Kumar", "Civil Site Supervisor", "+91 99160 22345", "PRJ-01", 1500),
    ("WRK-107", "Santosh Yadav", "Concrete Pump Operator", "+91 98920 11983", "PRJ-03", 1200),
    ("WRK-108", "Govind Shinde", "Structural Welder & Fabricator", "+91 97632 77410", "PRJ-03", 1150),
    ("WRK-109", "Bablu Paswan", "General Civil Helper", "+91 88720 55109", "PRJ-04", 650),
    ("WRK-110", "Rakesh Das", "Brickwork Mason", "+91 81045 99201", "PRJ-04", 950),
    ("WRK-111", "Lakshmi Narayana", "Specialist Tile & Paint Finisher", "+91 99401 22894", "PRJ-02", 900),
    ("WRK-112", "Chotelal Maurya", "Waterproofing Applicator", "+91 93214 77809", "PRJ-01", 850),
]

connection = sqlite3.connect(DB_PATH)

try:
    cursor = connection.cursor()

    for worker in workers:
        worker_id, name, skill, phone, project_id, wage = worker

        cursor.execute("""
            INSERT INTO workers
            (frontend_id, name, role, skill, phone, project_id,
             daily_wage, availability, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(frontend_id) DO UPDATE SET
                name = excluded.name,
                role = excluded.role,
                skill = excluded.skill,
                phone = excluded.phone,
                project_id = excluded.project_id,
                daily_wage = excluded.daily_wage,
                availability = excluded.availability,
                status = excluded.status
        """, (
            worker_id, name, skill, skill, phone,
            project_id, wage, "On Site", "active"
        ))

    connection.commit()
    print("Successfully imported all 12 workers!")

except Exception:
    connection.rollback()
    raise

finally:
    connection.close()