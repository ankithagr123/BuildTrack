# BuildTrack: Construction Project Management and Risk Prediction System

BuildTrack is a construction project management application for contractors, project engineers, and site teams. Its HTML, CSS, and JavaScript frontend supports project tracking, schedule tasks, workforce attendance, material inventory, expense accounting, vendor payments, progress diaries, and rule-based risk alerts. SQLite schema and helper functions are provided separately. Risk alerts use fixed checks over current project records; the project does not implement AI or machine learning.

---

## 🚀 Quick Start / How to Run Locally

Because BuildTrack is built with standard HTML5, CSS3, and modern Vanilla JavaScript, **no complex build steps, package managers, or compilers are required**.

### Option 1: Direct Browser Launch (Simplest)
1. Navigate to the `Buildtrackk` folder.
2. Double-click `index.html` to open it in **Google Chrome**, **Microsoft Edge**, **Mozilla Firefox**, or **Brave**.
3. The BuildTrack sign-in prototype will appear.

### Option 2: Live Server in VS Code (Recommended for Development)
1. Open the `Buildtrackk` folder in **Visual Studio Code**.
2. Right-click on `index.html` and select **"Open with Live Server"** (or press `Alt + L, Alt + O`).
3. Your browser will launch `http://127.0.0.1:5500/index.html` and show the BuildTrack sign-in page before the dashboard.

### Option 3: Python Built-In Web Server
Open PowerShell or Terminal in the `Buildtrackk` folder and run:
```bash
python -m http.server 8000
```
Then visit `http://localhost:8000` in your browser.

### Install BuildTrack and use it offline
PWAs require a secure context, so open the app through `http://localhost` / `http://127.0.0.1` during development or through HTTPS after deployment. Opening `index.html` directly with `file://` still shows the website, but browsers do not allow the service worker to run there.

In a supported browser, use the **Install app** control when it appears, or choose the browser's **Install app** / **Add to Home Screen** command. The service worker keeps the app shell available offline after its first successful load. BuildTrack records remain in that browser's LocalStorage; offline edits do not synchronize with the separate SQLite database.

---

## 🔑 Sign-In Prototype

The sign-in screen is a frontend prototype; no authentication API is connected. Enter a valid email and any password of at least six characters, then choose a role to continue. The password is checked in memory and is never saved. “Remember my email” stores only the email address in browser LocalStorage. Role selection is a UI demonstration and does not verify identity or provide security.

### Prototype role access

| Role | Available modules | Prototype actions |
|---|---|---|
| Contractor / Admin | All existing modules | All current dashboard actions |
| Site Engineer / Supervisor | Projects, Tasks, Labour, Progress Diary, Reports | Create/update tasks, mark attendance, add daily reports; project details and reports are read-only |
| Storekeeper | Materials | Manage inventory and record stock in/out using existing workflows |
| Client / Project Owner | Projects, Progress Diary, Reports | Read-only; create, edit, and delete controls are hidden or blocked in the UI |

These role filters are frontend-only and can be bypassed by a user with browser developer tools. A backend must verify credentials, hash passwords, issue authenticated sessions, enforce roles server-side, and reject unauthorized writes before deployment.

To try each role locally, sign in with a valid email and a password of at least six characters, select a role, and inspect its sidebar and available actions. Use the dashboard sign-out control to return to the role selector, then choose another role. Reloading always returns to sign-in; an older saved display profile does not bypass it.

---

## 📁 Project Architecture & File Structure

```
Buildtrackk/
├── index.html               # Main semantic HTML5 markup containing all 10 page views & modals
├── manifest.json            # Install name, display mode, colors, and app icons
├── service-worker.js        # Cached app shell and offline request handling
├── css/
│   └── style.css            # Responsive CSS3 styles, Navy/Orange theme, Kanban, & @media print
├── js/
│   ├── data.js              # Seed database (5 realistic Indian projects) & LocalStorage store
│   ├── app.js               # Global router, toast notifications, modals, INR currency, & auth
│   ├── dashboard.js         # 10 KPI cards, 6 Chart.js charts, deadlines & overdue feeds
│   ├── projects.js          # Project cards/table views, filter/sort, & 6-tab deep-dive modal
│   ├── tasks.js             # Tasks table & Kanban board with status toggles & overdue flags
│   ├── labour.js            # Workers directory, muster attendance & daily wage cost calculator
│   ├── materials.js         # Material inventory, stock-in/out logs & negative stock prevention
│   ├── finance.js           # Budget vs actuals, expenses log, payments & accounting ledger
│   ├── progress.js          # Daily Site Progress Diary (DPR), blockers, & progress sync
│   ├── risks.js             # Rule-based risk checks and explanations
│   ├── reports.js           # Multi-domain audit reports, summary statistics, print & CSV export
│   ├── settings.js          # Contractor firm profile, preferences, & demo data reset
│   └── pwa.js               # Service worker registration, install prompt, and connectivity notice
└── assets/
    ├── logo.svg             # Safety helmet & modern architectural skyline logo
    ├── avatar.svg           # Vector avatar for site engineers
    ├── icon-192.png         # Install and Apple touch icon
    └── icon-512.png         # Install and maskable icon
```

---

## 🌟 Key Functional Modules

### 1. Executive Dashboard
- **10 Summary KPI Cards**: Total Projects, Ongoing, Completed, Delayed, Total Budget (₹), Total Incurred Expenses (₹), Remaining Budget (₹), Active Labourers on duty, Pending Tasks, and Low-Stock Materials.
- **6 Interactive Chart.js Visualizations**:
  1. *Project Budget vs Actual Expenses* (Grouped Bar Chart)
  2. *Monthly Construction Expenses Trend* (Area Line Chart)
  3. *Physical Completion % by Project* (Horizontal Bar Chart)
  4. *Expense Distribution by Category* (Doughnut Chart: Materials, Labour, Equipment, Transport, Other)
  5. *Labour Attendance Distribution* (Pie Chart: Present, Absent, On Leave)
  6. *Material Stock vs Safety Threshold* (Bar Chart)
- **Operational Feeds**: Upcoming deadlines, critical overdue tasks, depleted inventory alerts, labour allocation, recent expense vouchers, and live site diary updates.
- **Global Project Filter**: Switch the topbar filter to inspect a specific site or view all sites combined.

### 2. Construction Projects Directory
- Switch between **Card View** and **Table View**.
- Filter by status (`Ongoing`, `Planning`, `Delayed`, `Completed`) and sort by Name, Budget, Deadline, or Progress.
- **Project Deep-Dive Modal**: Click *"View Full Details"* on any project to access 6 dedicated sub-tabs: *Overview*, *Tasks*, *Expenses*, *Labour*, *Materials*, *Vendor Payments*, and *Daily Progress*.

### 3. Schedule & Work Packages (Kanban + Table)
- **Kanban Board**: Drag/cycle tasks through *To Do*, *In Progress*, and *Completed*.
- **Table View**: Directly update task status via inline dropdowns.
- Automatic **Overdue Highlighting** for tasks past their due dates.
- Filter by project, priority (`High`, `Medium`, `Low`), and stage.

### 4. Labour & Workforce Management
- Complete worker roster with trade skills (Head Mason, Shuttering Carpenter, Bar Bender, Electrician, Plumber, Supervisor, etc.).
- **Muster Attendance Interface**: Select any date, toggle individual worker attendance (`P` / `A` / `L`), or click *"Mark All Present"*.
- **Automated Daily Wage Calculator**: Automatically calculates total daily wage cost (`₹XX,XXX`) from present workers' daily rates.

### 5. Materials & Inventory Management
- Real-time catalog of construction materials (UltraTech Cement, Tata Tiscon TMT Rebar, Bricks, M-Sand, Ready-Mix Concrete, PVC pipes, etc.).
- **Stock-In Action**: Record incoming delivery consignments from distributors.
- **Stock-Out Action**: Issue materials to specific projects with **strict validation preventing negative stock**.
- Inventory valuation tracker and complete transaction audit history.

### 6. Finance, Expenses & Vendor Payments
- **Clear Accounting Separation**:
  - *Expenses*: Cost commitments accrued for materials, labour, equipment, and transport.
  - *Payments*: Actual cash disbursements settled to vendors and subcontractors.
- Reconciles expenses against authorized project budgets with overrun alerts.
- Toggle payment status (`Paid` / `Pending`).

### 7. Daily Site Progress Diary (DPR)
- Contractors file daily site logs tracking: work completed today, updated completion percentage (which **automatically syncs back to the project's progress bar**), workforce turnout, materials consumed, site issues/blockers, and next day targets.
- Presented in a clean site timeline stream.

### 8. Rule-Based Risk Alerts
- Checks for unusually high expenditure compared with project progress, delayed projects or overdue tasks, materials at or below their minimum stock level, and low workforce attendance.
- Calculates a portfolio health score from the triggered conditions.
- Each alert displays the condition, supporting project data, and a suggested corrective action.
- These are transparent JavaScript rules over current LocalStorage records. No AI or machine learning model or prediction service is implemented.

### 9. Reports & Site Analytics
- Generates 6 audit reports: *Project Progress*, *Budget vs Expenses*, *Labour Wages*, *Material Inventory*, *Vendor Payments*, and *Overdue Tasks*.
- Real **CSV Download**: Generates and downloads real `.csv` files for Excel.
- Clean **Print-Friendly Format**: Formatted with `@media print` for paper or PDF generation.

### 10. System Settings & Demo Reset
- Configure company details (GSTIN, PWD License, contact).
- Switch between Light Mode and Dark Navy Mode.
- **"Reset Demo Data" Button**: Restores the pristine initial database at any time.

---

## 🎓 Academic / Viva Presentation Tips

When presenting BuildTrack to professors or external examiners:
1. **Highlight the Unified Workflow**: Show how recording a *Daily Progress Report* updates the *Project Progress Bar*, which updates the *Executive Dashboard* and can change rule-based risk alerts.
2. **Explain the Risk Checks**: Describe how fixed conditions flag expenditure variance, overdue work, low stock, and attendance concerns. The project does not use AI or machine learning.
3. **Demonstrate Financial Integrity**: Explain how *Expenses* (accrued liabilities) and *Payments* (cash disbursements) are modeled separately to eliminate double counting.
4. **Show LocalStorage Persistence**: Add a new task or worker, refresh the browser, and demonstrate that all changes persist in the browser storage.
