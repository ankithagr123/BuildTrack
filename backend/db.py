import os
import pyodbc

DB_SERVER = os.getenv("DB_SERVER", "localhost\\SQLEXPRESS")
DB_NAME = os.getenv("DB_NAME", "BuildTrackDB")
DB_USER = os.getenv("DB_USER", "")          # Leave blank for Windows Authentication
DB_PASSWORD = os.getenv("DB_PASSWORD", "")  # Leave blank for Windows Authentication


def get_db_connection():
    """Returns a pyodbc connection to SQL Server."""
    if DB_USER and DB_PASSWORD:
        conn_str = (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={DB_SERVER};"
            f"DATABASE={DB_NAME};"
            f"UID={DB_USER};"
            f"PWD={DB_PASSWORD};"
            f"TrustServerCertificate=yes;"
        )
    else:
        conn_str = (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={DB_SERVER};"
            f"DATABASE={DB_NAME};"
            f"Trusted_Connection=yes;"
            f"TrustServerCertificate=yes;"
        )
    return pyodbc.connect(conn_str)


def query_all(sql, params=()):
    """Executes a SELECT query and returns a list of dicts."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    finally:
        conn.close()


def execute_write(sql, params=()):
    """Executes an INSERT, UPDATE, or DELETE query and commits."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()