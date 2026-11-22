/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Dashboard Controller: Connected to Flask API & SQLite Database
 */

(function () {
  'use strict';

  const API = 'http://127.0.0.1:5000/api';
  const chartInstances = {};

  let projectsCache = [];
  let tasksCache = [];
  let workersCache = [];
  let attendanceCache = [];
  let materialsCache = [];
  let expensesCache = [];
  let progressCache = [];
  let risksCache = [];

  async function apiRequest(endpoint) {
    const response = await fetch(`${API}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Dashboard API request failed');
    }
    return result;
  }

  async function safeFetch(endpoint, fallback = []) {
    try {
      return await apiRequest(endpoint);
    } catch (_) {
      return fallback;
    }
  }

  function matchesSelectedProject(itemProjectId, selectedProjectId) {
    if (!selectedProjectId || selectedProjectId === 'all') return true;
    return String(itemProjectId) === String(selectedProjectId);
  }

  async function loadDashboardData() {
    try {
      const [projectsRes, financeRes, progressRes, risksRes, tasksRes, workersRes, attendanceRes, materialsRes] = await Promise.all([
        apiRequest('/projects'),
        apiRequest('/finance'),
        apiRequest('/progress'),
        apiRequest('/risks'),
        safeFetch('/tasks', []),
        safeFetch('/workers', []),
        safeFetch('/attendance', []),
        safeFetch('/materials', [])
      ]);

      projectsCache = Array.isArray(projectsRes) ? projectsRes : [];
      const rawTxns = Array.isArray(financeRes.transactions) ? financeRes.transactions : [];
      expensesCache = rawTxns
        .filter(t => (t.type || 'Expense').toLowerCase() === 'expense')
        .map(t => ({
          id: t.id,
          title: t.description || t.category || 'Site Expense',
          projectId: t.project_id,
          category: t.category || 'Other',
          amount: parseFloat(t.amount) || 0,
          date: t.date || ''
        }));

      progressCache = Array.isArray(progressRes) ? progressRes : [];
      risksCache = Array.isArray(risksRes) ? risksRes : [];
      tasksCache = Array.isArray(tasksRes) ? tasksRes : [];
      workersCache = Array.isArray(workersRes) ? workersRes : [];
      attendanceCache = Array.isArray(attendanceRes) ? attendanceRes : [];
      materialsCache = Array.isArray(materialsRes) ? materialsRes : [];

      renderDashboardAll();
    } catch (error) {
      console.error('Dashboard load error:', error);
    }
  }

  function renderDashboardAll() {
    renderKPIs();
    renderCharts();
    renderUpcomingDeadlines();
    renderOverdueTasks();
    renderRecentExpenses();
    renderLabourAvailability();
    renderLowStockAlerts();
    renderDailyProgressFeed();
    renderRiskWarningSummary();
  }

  // --- 1. RENDER 10 KPI SUMMARY CARDS ---
  function renderKPIs() {
    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const filteredProjects = projectsCache.filter(p => matchesSelectedProject(p.id, selectedProjectId));
    const filteredTasks = tasksCache.filter(t => matchesSelectedProject(t.project_id || t.projectId, selectedProjectId));
    const filteredLabour = workersCache.filter(w => matchesSelectedProject(w.assignedProjectId || w.project_id, selectedProjectId));
    const filteredMaterials = materialsCache.filter(m => matchesSelectedProject(m.assignedProjectId || m.project_id, selectedProjectId));
    const filteredExpenses = expensesCache.filter(e => matchesSelectedProject(e.projectId, selectedProjectId));

    const totalProjects = filteredProjects.length;
    const ongoingProjects = filteredProjects.filter(p => (p.status || '').toLowerCase() === 'ongoing').length;
    const completedProjects = filteredProjects.filter(p => (p.status || '').toLowerCase() === 'completed').length;
    const delayedProjects = filteredProjects.filter(p => (p.status || '').toLowerCase() === 'delayed').length;

    const totalBudget = filteredProjects.reduce((sum, p) => sum + (parseFloat(p.budget) || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const remainingBudget = totalBudget - totalExpenses;

    const todayStr = new Date().toISOString().split('T')[0];
    const todayAtt = {};
    attendanceCache.forEach(a => {
      if (a.date === todayStr) todayAtt[a.worker_id] = a.status;
    });

    let activeLabourers = 0;
    filteredLabour.forEach(w => {
      const st = todayAtt[w.id];
      const isPresent = st ? st === 'P' : (w.availability === 'On Site');
      if (isPresent) activeLabourers++;
    });

    const pendingTasks = filteredTasks.filter(t => t.status !== 'completed').length;
    const lowStockCount = filteredMaterials.filter(m => Number(m.quantity) <= Number(m.minStockLevel || m.min_stock_level || 0)).length;

    setElText('kpiTotalProjects', totalProjects);
    setElText('kpiOngoingProjects', ongoingProjects);
    setElText('kpiCompletedProjects', completedProjects);
    setElText('kpiDelayedProjects', delayedProjects);

    setElText('kpiTotalBudget', window.BuildTrack.formatINR(totalBudget));
    setElText('kpiTotalExpenses', window.BuildTrack.formatINR(totalExpenses));
    setElText('kpiRemainingBudget', window.BuildTrack.formatINR(remainingBudget));

    const remEl = document.getElementById('kpiRemainingBudget');
    if (remEl) {
      remEl.style.color = remainingBudget < 0 ? 'var(--accent-rose)' : 'var(--text-main)';
    }

    setElText('kpiActiveLabourers', `${activeLabourers} / ${filteredLabour.length}`);
    setElText('kpiPendingTasks', pendingTasks);
    setElText('kpiLowStockMaterials', lowStockCount);
  }

  function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // --- 2. RENDER 6 CHART.JS CHARTS ---
  function renderCharts() {
    if (typeof Chart === 'undefined') return;

    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.color = '#64748b';

    renderBudgetVsExpensesChart();
    renderMonthlyExpensesChart();
    renderProjectProgressChart();
    renderExpenseCategoryChart();
    renderLabourAttendanceChart();
    renderMaterialStockChart();
  }

  function renderBudgetVsExpensesChart() {
    const ctx = document.getElementById('chartBudgetVsExpenses');
    if (!ctx) return;
    if (chartInstances.budgetVsExpenses) chartInstances.budgetVsExpenses.destroy();

    const labels = projectsCache.map(p => p.name.length > 18 ? p.name.substring(0, 16) + '...' : p.name);
    const budgetsInLakhs = projectsCache.map(p => ((parseFloat(p.budget) || 0) / 100000).toFixed(2));
    const spentInLakhs = projectsCache.map(p => ((parseFloat(p.spent) || 0) / 100000).toFixed(2));

    chartInstances.budgetVsExpenses = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Approved Budget (₹ Lakhs)', data: budgetsInLakhs, backgroundColor: '#3b82f6', borderRadius: 6 },
          { label: 'Actual Spent (₹ Lakhs)', data: spentInLakhs, backgroundColor: '#f97316', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, weight: '600' } } },
          tooltip: { callbacks: { label: (item) => ` ${item.dataset.label}: ₹${item.raw} Lakhs` } }
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: '₹ in Lakhs', font: { size: 11 } }, grid: { color: '#f1f5f9' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function renderMonthlyExpensesChart() {
    const ctx = document.getElementById('chartMonthlyExpenses');
    if (!ctx) return;
    if (chartInstances.monthlyExpenses) chartInstances.monthlyExpenses.destroy();

    const monthTotals = {};
    expensesCache.forEach(e => {
      if (e.date && e.date.length >= 7) {
        const ym = e.date.substring(0, 7);
        monthTotals[ym] = (monthTotals[ym] || 0) + (e.amount / 100000);
      }
    });

    const sortedMonths = Object.keys(monthTotals).sort();
    const labels = sortedMonths.length > 0 ? sortedMonths : ['2026-08', '2026-09', '2026-10', '2026-11'];
    const data = sortedMonths.length > 0
      ? sortedMonths.map(m => monthTotals[m].toFixed(2))
      : [3.5, 5.8, 8.4, 12.2];

    chartInstances.monthlyExpenses = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Monthly Spend (₹ Lakhs)',
          data,
          borderColor: '#ea580c',
          backgroundColor: 'rgba(234, 88, 12, 0.1)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#ea580c',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (item) => ` Expense: ₹${item.raw} Lakhs` } }
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: '₹ in Lakhs', font: { size: 11 } }, grid: { color: '#f1f5f9' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function renderProjectProgressChart() {
    const ctx = document.getElementById('chartProjectProgress');
    if (!ctx) return;
    if (chartInstances.projectProgress) chartInstances.projectProgress.destroy();

    const labels = projectsCache.map(p => p.name.length > 20 ? p.name.substring(0, 18) + '...' : p.name);
    const progressData = projectsCache.map(p => parseInt(p.progress, 10) || 0);
    const bgColors = projectsCache.map(p => {
      const st = (p.status || '').toLowerCase();
      if (st === 'completed') return '#10b981';
      if (st === 'delayed') return '#ef4444';
      return '#f97316';
    });

    chartInstances.projectProgress = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ axis: 'y', label: 'Physical Completion %', data: progressData, backgroundColor: bgColors, borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (item) => ` Completion: ${item.raw}%` } }
        },
        scales: {
          x: { max: 100, beginAtZero: true, title: { display: true, text: 'Percentage (%)', font: { size: 11 } }, grid: { color: '#f1f5f9' } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  function renderExpenseCategoryChart() {
    const ctx = document.getElementById('chartExpenseCategory');
    if (!ctx) return;
    if (chartInstances.expenseCategory) chartInstances.expenseCategory.destroy();

    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const expenses = expensesCache.filter(e => matchesSelectedProject(e.projectId, selectedProjectId));

    const categories = { 'Materials': 0, 'Labour': 0, 'Equipment': 0, 'Transport': 0, 'Other': 0 };
    expenses.forEach(e => {
      const cat = e.category || 'Other';
      if (categories[cat] !== undefined) categories[cat] += e.amount;
      else categories['Other'] += e.amount;
    });

    chartInstances.expenseCategory = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(categories),
        datasets: [{
          data: Object.values(categories),
          backgroundColor: ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#64748b'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (item) => ` ${item.label}: ${window.BuildTrack.formatINR(item.raw)}` } }
        },
        cutout: '68%'
      }
    });
  }

  function renderLabourAttendanceChart() {
    const ctx = document.getElementById('chartLabourAttendance');
    if (!ctx) return;
    if (chartInstances.labourAttendance) chartInstances.labourAttendance.destroy();

    const todayStr = new Date().toISOString().split('T')[0];
    const todayAtt = {};
    attendanceCache.forEach(a => {
      if (a.date === todayStr) todayAtt[a.worker_id] = a.status;
    });

    let present = 0, absent = 0, onLeave = 0;
    workersCache.forEach(w => {
      const code = todayAtt[w.id];
      if (code === 'P' || (!code && w.availability === 'On Site')) present++;
      else if (code === 'L') onLeave++;
      else absent++;
    });

    chartInstances.labourAttendance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Present on Site', 'Absent', 'Approved Leave'],
        datasets: [{
          data: [present, absent, onLeave],
          backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }
      }
    });
  }

  function renderMaterialStockChart() {
    const ctx = document.getElementById('chartMaterialStock');
    if (!ctx) return;
    if (chartInstances.materialStock) chartInstances.materialStock.destroy();

    const materials = materialsCache.slice(0, 6);
    const labels = materials.map(m => m.name.split(' ')[0] + ' ' + (m.name.split(' ')[1] || ''));
    const currentStock = materials.map(m => Number(m.quantity) || 0);
    const minThreshold = materials.map(m => Number(m.minStockLevel || m.min_stock_level || 0));

    chartInstances.materialStock = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Current Stock', data: currentStock, backgroundColor: '#06b6d4', borderRadius: 4 },
          { label: 'Min Threshold', data: minThreshold, backgroundColor: '#cbd5e1', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
      }
    });
  }

  // --- 3. UPCOMING DEADLINES ---
  function renderUpcomingDeadlines() {
    const container = document.getElementById('dashboardDeadlinesList');
    if (!container) return;

    const sorted = [...projectsCache].sort(
      (a, b) => new Date(a.end_date || a.expectedCompletionDate) - new Date(b.end_date || b.expectedCompletionDate)
    );

    container.innerHTML = sorted.slice(0, 4).map(p => {
      const endDate = p.end_date || p.expectedCompletionDate || '';
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--border-color);">
          <div>
            <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-main);">${p.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);"><i class="fa-regular fa-calendar" style="color: var(--accent-orange); margin-right: 4px;"></i> Deadline: ${window.BuildTrack.formatDate ? window.BuildTrack.formatDate(endDate) : endDate}</div>
          </div>
          <span class="status-badge badge-${p.status}">${p.status}</span>
        </div>
      `;
    }).join('');
  }

  // --- 4. OVERDUE TASKS ---
  function renderOverdueTasks() {
    const container = document.getElementById('dashboardOverdueList');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const overdue = tasksCache.filter(t => {
      const due = t.due_date || t.dueDate;
      return t.status !== 'completed' && due && due < today;
    });

    if (overdue.length === 0) {
      container.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;"><i class="fa-solid fa-circle-check" style="color: var(--accent-emerald); margin-right: 6px;"></i> All scheduled tasks are on track!</div>`;
      return;
    }

    container.innerHTML = overdue.slice(0, 4).map(t => {
      const proj = projectsCache.find(p => String(p.id) === String(t.project_id || t.projectId));
      const due = t.due_date || t.dueDate || '';
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--border-color);">
          <div>
            <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-main);">${t.title}</div>
            <div style="font-size: 0.75rem; color: var(--accent-rose); font-weight: 500;">
              <i class="fa-solid fa-clock" style="margin-right: 4px;"></i> Due: ${window.BuildTrack.formatDate ? window.BuildTrack.formatDate(due) : due} (${proj ? proj.name.substring(0, 16) + '...' : ''})
            </div>
          </div>
          <span class="priority-badge priority-${t.priority}">${t.priority}</span>
        </div>
      `;
    }).join('');
  }

  // --- 5. RECENT EXPENSES & PAYMENTS TABLE ---
  function renderRecentExpenses() {
    const container = document.getElementById('dashboardRecentExpensesTable');
    if (!container) return;

    const expenses = expensesCache.slice(0, 5);
    container.innerHTML = expenses.map(e => {
      const proj = projectsCache.find(p => String(p.id) === String(e.projectId));
      return `
        <tr>
          <td style="font-weight: 600;">${e.title}</td>
          <td>${proj ? proj.name : 'All Projects'}</td>
          <td><span class="priority-badge priority-low">${e.category}</span></td>
          <td style="font-weight: 700; color: var(--text-main);">${window.BuildTrack.formatINR(e.amount)}</td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${window.BuildTrack.formatDate ? window.BuildTrack.formatDate(e.date) : e.date}</td>
        </tr>
      `;
    }).join('');
  }

  // --- 6. LABOUR AVAILABILITY SUMMARY ---
  function renderLabourAvailability() {
    const container = document.getElementById('dashboardLabourAvailability');
    if (!container) return;

    container.innerHTML = projectsCache.slice(0, 4).map(p => {
      const count = workersCache.filter(w => String(w.assignedProjectId || w.project_id) === String(p.id)).length;
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0; border-bottom: 1px dashed var(--border-color); font-size: 0.85rem;">
          <span style="font-weight: 500; color: var(--text-main);">${p.name.substring(0, 24)}...</span>
          <span style="font-weight: 700; color: var(--accent-blue); background-color: #dbeafe; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem;">
            ${count} Assigned Workers
          </span>
        </div>
      `;
    }).join('');
  }

  // --- 7. LOW-STOCK MATERIALS WARNING PANEL ---
  function renderLowStockAlerts() {
    const container = document.getElementById('dashboardLowStockAlerts');
    if (!container) return;

    const lowStock = materialsCache.filter(m => Number(m.quantity) <= Number(m.minStockLevel || m.min_stock_level || 0));

    if (lowStock.length === 0) {
      container.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;"><i class="fa-solid fa-box-check" style="color: var(--accent-emerald);"></i> Stock levels healthy.</div>`;
      return;
    }

    container.innerHTML = lowStock.map(m => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: var(--radius-md); margin-bottom: 0.5rem;">
        <div>
          <div style="font-size: 0.85rem; font-weight: 700; color: #991b1b;">${m.name}</div>
          <div style="font-size: 0.75rem; color: #b91c1c;">Stock: ${m.quantity} ${m.unit || 'units'} (Min Threshold: ${m.minStockLevel || m.min_stock_level})</div>
        </div>
        <button class="btn btn-sm btn-outline" style="background: #ffffff; color: var(--accent-rose); font-weight: 700;" onclick="BuildTrack.navigateTo('materials')">
          Restock
        </button>
      </div>
    `).join('');
  }

  // --- 8. DAILY PROGRESS UPDATES FEED ---
  function renderDailyProgressFeed() {
    const container = document.getElementById('dashboardDailyProgressFeed');
    if (!container) return;

    const reports = progressCache.slice(0, 3);
    container.innerHTML = reports.map(r => {
      const proj = projectsCache.find(p => String(p.id) === String(r.project_id));
      const dateStr = r.report_date || '';
      return `
        <div style="padding: 0.85rem; background-color: var(--bg-surface-alt); border-radius: var(--radius-md); border-left: 3px solid var(--accent-orange); margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-main);">${proj ? proj.name : 'Site Report'}</span>
            <span style="font-size: 0.72rem; color: var(--text-muted);">${window.BuildTrack.formatDate ? window.BuildTrack.formatDate(dateStr) : dateStr}</span>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-main); margin-bottom: 6px;">${r.summary || ''}</p>
          <div style="font-size: 0.72rem; color: var(--text-muted); display: flex; gap: 1rem;">
            <span><i class="fa-solid fa-users" style="color: var(--accent-blue); margin-right: 3px;"></i> ${r.workers_present || 0} Workers</span>
            <span><i class="fa-solid fa-chart-line" style="color: var(--accent-emerald); margin-right: 3px;"></i> Progress: ${r.completion_pct || 0}%</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- 9. EARLY WARNING RISK SUMMARY ---
  function renderRiskWarningSummary() {
    const container = document.getElementById('dashboardRiskSummaryBanner');
    if (!container) return;

    const activeRisks = risksCache.filter(r => (r.status || 'Open').toLowerCase() !== 'resolved');
    const highCount = activeRisks.filter(r => ['critical', 'high'].includes((r.severity || '').toLowerCase())).length;

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="width: 44px; height: 44px; border-radius: 10px; background-color: rgba(249, 115, 22, 0.2); display: flex; align-items: center; justify-content: center; color: var(--accent-orange); font-size: 1.3rem;">
            <i class="fa-solid fa-brain-circuit"></i>
          </div>
          <div>
            <div style="font-size: 0.95rem; font-weight: 700; color: #ffffff;">AI Risk Prediction Engine Active</div>
            <div style="font-size: 0.78rem; color: #94a3b8;">${activeRisks.length} active risks tracked (${highCount} High/Critical severity) across ${projectsCache.length} projects.</div>
          </div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="BuildTrack.navigateTo('risks')">
          View Risk Intelligence <i class="fa-solid fa-arrow-right" style="margin-left: 4px;"></i>
        </button>
      </div>
    `;
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'dashboard') {
        loadDashboardData();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'dashboard') {
        loadDashboardData();
      }
    });

    window.addEventListener('buildtrack:projectfilterchanged', () => {
      if (window.BuildTrack.currentView === 'dashboard') {
        renderDashboardAll();
      }
    });

    loadDashboardData();
  });

  window.DashboardController = {
    refresh: loadDashboardData
  };
})();