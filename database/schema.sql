-- BuildTrack SQLite schema. IDs retain the string values used by the frontend.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client TEXT NOT NULL,
    location TEXT NOT NULL,
    manager TEXT NOT NULL,
    start_date TEXT NOT NULL CHECK (length(start_date) = 10 AND date(start_date) IS start_date),
    expected_completion_date TEXT NOT NULL CHECK (
        length(expected_completion_date) = 10 AND
        date(expected_completion_date) IS expected_completion_date AND
        start_date <= expected_completion_date
    ),
    budget REAL NOT NULL CHECK (
        budget >= 10000 AND
        abs((budget - 10000) / 5000 - round((budget - 10000) / 5000)) < 0.000001
    ),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    status TEXT NOT NULL CHECK (status IN ('ongoing', 'planning', 'delayed', 'completed')),
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    assigned_to TEXT NOT NULL DEFAULT '',
    start_date TEXT CHECK (
        start_date IS NULL OR (length(start_date) = 10 AND date(start_date) IS start_date)
    ),
    due_date TEXT NOT NULL CHECK (length(due_date) = 10 AND date(due_date) IS due_date),
    priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
    status TEXT NOT NULL CHECK (status IN ('todo', 'in-progress', 'completed'))
);

CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    skill TEXT NOT NULL CHECK (skill IN (
        'Head Mason', 'Brickwork Mason', 'Shuttering Carpenter',
        'Lead Bar Bender / Rebar', 'Licensed Electrician', 'Senior Plumber',
        'Civil Site Supervisor', 'Concrete Pump Operator',
        'Structural Welder & Fabricator', 'Specialist Tile & Paint Finisher',
        'Waterproofing Applicator', 'General Civil Helper'
    )),
    phone TEXT NOT NULL DEFAULT '',
    assigned_project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    daily_wage REAL NOT NULL CHECK (
        daily_wage >= 300 AND
        abs((daily_wage - 300) / 50 - round((daily_wage - 300) / 50)) < 0.000001
    ),
    availability TEXT NOT NULL CHECK (availability IN ('On Site', 'Available')),
    status TEXT NOT NULL CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE IF NOT EXISTS attendance (
    date TEXT NOT NULL CHECK (length(date) = 10 AND date(date) IS date),
    worker_id TEXT NOT NULL REFERENCES workers(id) ON UPDATE CASCADE ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'leave')),
    PRIMARY KEY (date, worker_id)
);

CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'Cement & Aggregates', 'Steel & Structural Metals', 'Bricks & Masonry',
        'Electrical & Lighting', 'Plumbing & Sanitary', 'Finishes & Paints',
        'Chemicals & Admixtures', 'Safety & Site Gear'
    )),
    unit TEXT NOT NULL,
    quantity REAL NOT NULL CHECK (quantity >= 0),
    min_stock_level REAL NOT NULL CHECK (min_stock_level >= 0),
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    supplier TEXT NOT NULL DEFAULT '',
    assigned_project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    last_updated TEXT CHECK (
        last_updated IS NULL OR (length(last_updated) = 10 AND date(last_updated) IS last_updated)
    )
);

CREATE TABLE IF NOT EXISTS stock_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id TEXT NOT NULL REFERENCES materials(id) ON UPDATE CASCADE ON DELETE CASCADE,
    date TEXT NOT NULL CHECK (length(date) = 10 AND date(date) IS date),
    type TEXT NOT NULL CHECK (type IN ('in', 'out')),
    quantity REAL NOT NULL CHECK (quantity > 0),
    notes TEXT NOT NULL DEFAULT '',
    project_id TEXT REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    category TEXT NOT NULL CHECK (category IN ('Materials', 'Labour', 'Equipment', 'Transport', 'Other')),
    amount REAL NOT NULL CHECK (amount > 0),
    date TEXT NOT NULL CHECK (length(date) = 10 AND date(date) IS date),
    payment_method TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    payment_ref TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    recipient TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    date TEXT NOT NULL CHECK (length(date) = 10 AND date(date) IS date),
    status TEXT NOT NULL CHECK (status IN ('Paid', 'Pending', 'Failed')),
    payment_method TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS progress_reports (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    date TEXT NOT NULL CHECK (length(date) = 10 AND date(date) IS date),
    work_completed TEXT NOT NULL,
    progress_percentage INTEGER NOT NULL CHECK (progress_percentage BETWEEN 0 AND 100),
    workers_present INTEGER NOT NULL DEFAULT 0 CHECK (workers_present >= 0),
    materials_consumed TEXT NOT NULL DEFAULT '',
    issues_encountered TEXT NOT NULL DEFAULT '',
    delay_blockers TEXT NOT NULL DEFAULT '',
    next_day_plan TEXT NOT NULL DEFAULT '',
    reported_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS company_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    company_name TEXT NOT NULL DEFAULT '',
    contractor_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    gstin TEXT NOT NULL DEFAULT '',
    license_number TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'INR',
    currency_symbol TEXT NOT NULL DEFAULT '₹',
    date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
    budget_threshold INTEGER NOT NULL DEFAULT 85 CHECK (budget_threshold BETWEEN 50 AND 100),
    overdue_tasks INTEGER NOT NULL DEFAULT 1 CHECK (overdue_tasks IN (0, 1)),
    low_stock_alerts INTEGER NOT NULL DEFAULT 1 CHECK (low_stock_alerts IN (0, 1)),
    deadline_alerts_days INTEGER NOT NULL DEFAULT 14 CHECK (deadline_alerts_days >= 0)
);

-- Frontend profile only; demo login credentials/sessions are deliberately not stored here.
CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_deadline ON projects(expected_completion_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_workers_project ON workers(assigned_project_id);
CREATE INDEX IF NOT EXISTS idx_attendance_worker ON attendance(worker_id);
CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(assigned_project_id);
CREATE INDEX IF NOT EXISTS idx_stock_material_date ON stock_transactions(material_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_project_date ON expenses(project_id, date);
CREATE INDEX IF NOT EXISTS idx_payments_project_status ON payments(project_id, status);
CREATE INDEX IF NOT EXISTS idx_progress_project_date ON progress_reports(project_id, date);

-- Expense vouchers are the source of truth for incurred project spending.
CREATE VIEW IF NOT EXISTS project_financial_summary AS
SELECT p.id AS project_id, p.budget,
       COALESCE(SUM(e.amount), 0) AS spent,
       p.budget - COALESCE(SUM(e.amount), 0) AS remaining_budget
FROM projects AS p LEFT JOIN expenses AS e ON e.project_id = p.id
GROUP BY p.id, p.budget;
