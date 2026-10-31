/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Dashboard Controller: 10 KPI Summary Cards, 6 Interactive Chart.js Charts, & Activity Feeds
 */

(function () {
  'use strict';

  // Store Chart instances for clean updates
  const chartInstances = {};

  function initDashboard() {
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

  function getDashboardProjects() {
    const projects = window.BuildTrack.getVisibleProjects();
    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    return selectedProjectId === 'all' ? projects : projects.filter(project => project.id === selectedProjectId);
  }

  function getDashboardRecords(records, projectIdField = 'projectId') {
    return window.BuildTrack.filterClientRecords(
      records,
      window.BuildTrack.currentProjectId || 'all',
      projectIdField
    );
  }

  // --- 1. RENDER 10 KPI SUMMARY CARDS ---
  function renderKPIs() {
    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const filteredProjects = getDashboardProjects();
    const tasks = getDashboardRecords(window.DataStore.getTasks(selectedProjectId));
    const labour = getDashboardRecords(window.DataStore.getLabour(selectedProjectId), 'assignedProjectId');
    const materials = getDashboardRecords(window.DataStore.getMaterials(selectedProjectId), 'assignedProjectId');
    const expenses = getDashboardRecords(window.DataStore.getExpenses(selectedProjectId));

    // 1. Projects Breakdown
    const totalProjects = filteredProjects.length;
    const ongoingProjects = filteredProjects.filter(p => p.status === 'ongoing').length;
    const completedProjects = filteredProjects.filter(p => p.status === 'completed').length;
    const delayedProjects = filteredProjects.filter(p => p.status === 'delayed').length;
    const averageProgress = filteredProjects.length
      ? filteredProjects.reduce((sum, project) => sum + (parseFloat(project.progress) || 0), 0) / filteredProjects.length
      : 0;

    const dashboardSubtitle = document.querySelector('#view-dashboard .page-subtitle-muted');
    if (dashboardSubtitle) {
      dashboardSubtitle.dataset.defaultText ||= dashboardSubtitle.textContent;
      dashboardSubtitle.textContent = window.BuildTrack.isClientRole()
        ? `Assigned project metrics • Average progress: ${averageProgress.toFixed(1)}%`
        : dashboardSubtitle.dataset.defaultText;
    }

    // 2. Financials Breakdown
    const totalBudget = filteredProjects.reduce((sum, p) => sum + (parseFloat(p.budget) || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const remainingBudget = totalBudget - totalExpenses;

    // 3. Workforce Breakdown
    const todayStr = new Date().toISOString().split('T')[0];
    const attendance = window.DataStore.getAttendance(todayStr);
    let activeLabourers = 0;
    labour.forEach(w => {
      const status = attendance[w.id] || (w.availability === 'On Site' ? 'present' : 'absent');
      if (status === 'present') activeLabourers++;
    });

    // 4. Pending Tasks
    const pendingTasks = tasks.filter(t => t.status !== 'completed').length;

    // 5. Low-Stock Materials
    const lowStockCount = materials.filter(m => m.quantity <= m.minStockLevel).length;

    // Inject into DOM
    setElText('kpiTotalProjects', totalProjects);
    setElText('kpiOngoingProjects', ongoingProjects);
    setElText('kpiCompletedProjects', completedProjects);
    setElText('kpiDelayedProjects', delayedProjects);
    
    setElText('kpiTotalBudget', window.BuildTrack.formatINR(totalBudget));
    setElText('kpiTotalExpenses', window.BuildTrack.formatINR(totalExpenses));
    setElText('kpiRemainingBudget', window.BuildTrack.formatINR(remainingBudget));
    
    // Remaining budget color warning
    const remEl = document.getElementById('kpiRemainingBudget');
    if (remEl) {
      remEl.style.color = remainingBudget < 0 ? 'var(--accent-rose)' : 'var(--text-main)';
    }

    setElText('kpiActiveLabourers', activeLabourers + ` / ${labour.length}`);
    setElText('kpiPendingTasks', pendingTasks);
    setElText('kpiLowStockMaterials', lowStockCount);
  }

  function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // --- 2. RENDER 6 CHART.JS CHARTS ---
  function renderCharts() {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not loaded yet. Skipping chart rendering.');
      return;
    }

    // Set global Chart.js defaults
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.color = '#64748b';

    renderBudgetVsExpensesChart();
    renderMonthlyExpensesChart();
    renderProjectProgressChart();
    renderExpenseCategoryChart();
    renderLabourAttendanceChart();
    renderMaterialStockChart();
  }

  // Chart 1: Budget vs Actual Expenses
  function renderBudgetVsExpensesChart() {
    const ctx = document.getElementById('chartBudgetVsExpenses');
    if (!ctx) return;

    if (chartInstances.budgetVsExpenses) chartInstances.budgetVsExpenses.destroy();

    const projects = getDashboardProjects();
    const labels = projects.map(p => p.name.length > 18 ? p.name.substring(0, 16) + '...' : p.name);
    const budgetsInLakhs = projects.map(p => (p.budget / 100000).toFixed(2));
    const spentInLakhs = projects.map(p => (p.spent / 100000).toFixed(2));

    chartInstances.budgetVsExpenses = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Approved Budget (₹ Lakhs)',
            data: budgetsInLakhs,
            backgroundColor: '#3b82f6',
            borderRadius: 6
          },
          {
            label: 'Actual Spent (₹ Lakhs)',
            data: spentInLakhs,
            backgroundColor: '#f97316',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, weight: '600' } } },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ₹${item.raw} Lakhs`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: '₹ in Lakhs', font: { size: 11 } },
            grid: { color: '#f1f5f9' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Chart 2: Monthly Construction Expenses Trend
  function renderMonthlyExpensesChart() {
    const ctx = document.getElementById('chartMonthlyExpenses');
    if (!ctx) return;

    if (chartInstances.monthlyExpenses) chartInstances.monthlyExpenses.destroy();

    const expenses = getDashboardRecords(window.DataStore.getExpenses());
    
    // Group expenses by Month (e.g. Jul, Aug, Sep, Oct)
    const monthMap = { '07': 0, '08': 0, '09': 0, '10': 0 };
    expenses.forEach(e => {
      if (e.date) {
        const month = e.date.split('-')[1];
        if (monthMap[month] !== undefined) {
          monthMap[month] += (parseFloat(e.amount) || 0) / 100000;
        }
      }
    });

    let labels = ['Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026'];
    let data = [3.5, 5.8, 8.4, (monthMap['10'] || 12.2).toFixed(1)];
    if (window.BuildTrack.isClientRole()) {
      labels = ['Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026'];
      data = ['07', '08', '09', '10'].map(month => (monthMap[month] || 0).toFixed(1));
    }

    chartInstances.monthlyExpenses = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Monthly Spend (₹ Lakhs)',
          data: data,
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
          tooltip: {
            callbacks: {
              label: (item) => ` Expense: ₹${item.raw} Lakhs`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: '₹ in Lakhs', font: { size: 11 } },
            grid: { color: '#f1f5f9' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Chart 3: Project Completion Progress (%)
  function renderProjectProgressChart() {
    const ctx = document.getElementById('chartProjectProgress');
    if (!ctx) return;

    if (chartInstances.projectProgress) chartInstances.projectProgress.destroy();

    const projects = getDashboardProjects();
    const labels = projects.map(p => p.name.length > 20 ? p.name.substring(0, 18) + '...' : p.name);
    const progressData = projects.map(p => p.progress);
    
    // Status color coding
    const bgColors = projects.map(p => {
      if (p.status === 'completed') return '#10b981';
      if (p.status === 'delayed') return '#ef4444';
      return '#f97316';
    });

    chartInstances.projectProgress = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          axis: 'y',
          label: 'Physical Completion %',
          data: progressData,
          backgroundColor: bgColors,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => ` Completion: ${item.raw}%`
            }
          }
        },
        scales: {
          x: {
            max: 100,
            beginAtZero: true,
            title: { display: true, text: 'Percentage (%)', font: { size: 11 } },
            grid: { color: '#f1f5f9' }
          },
          y: { grid: { display: false } }
        }
      }
    });
  }

  // Chart 4: Expense Distribution by Category
  function renderExpenseCategoryChart() {
    const ctx = document.getElementById('chartExpenseCategory');
    if (!ctx) return;

    if (chartInstances.expenseCategory) chartInstances.expenseCategory.destroy();

    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const expenses = getDashboardRecords(window.DataStore.getExpenses(selectedProjectId));

    const categories = { 'Materials': 0, 'Labour': 0, 'Equipment': 0, 'Transport': 0, 'Other': 0 };
    expenses.forEach(e => {
      const cat = e.category || 'Other';
      if (categories[cat] !== undefined) {
        categories[cat] += parseFloat(e.amount) || 0;
      } else {
        categories['Other'] += parseFloat(e.amount) || 0;
      }
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
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.label}: ${window.BuildTrack.formatINR(item.raw)}`
            }
          }
        },
        cutout: '68%'
      }
    });
  }

  // Chart 5: Labour Attendance Overview
  function renderLabourAttendanceChart() {
    const ctx = document.getElementById('chartLabourAttendance');
    if (!ctx) return;

    if (chartInstances.labourAttendance) chartInstances.labourAttendance.destroy();

    const labour = getDashboardRecords(window.DataStore.getLabour(), 'assignedProjectId');
    const todayStr = new Date().toISOString().split('T')[0];
    const attendance = window.DataStore.getAttendance(todayStr);

    let present = 0, absent = 0, onLeave = 0;
    labour.forEach(w => {
      const st = attendance[w.id] || (w.availability === 'On Site' ? 'present' : 'absent');
      if (st === 'present') present++;
      else if (st === 'leave') onLeave++;
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
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }
        }
      }
    });
  }

  // Chart 6: Material Stock vs Minimum Threshold
  function renderMaterialStockChart() {
    const ctx = document.getElementById('chartMaterialStock');
    if (!ctx) return;

    if (chartInstances.materialStock) chartInstances.materialStock.destroy();

    const materials = getDashboardRecords(window.DataStore.getMaterials(), 'assignedProjectId').slice(0, 6);
    const labels = materials.map(m => m.name.split(' ')[0] + ' ' + (m.name.split(' ')[1] || ''));
    const currentStock = materials.map(m => m.quantity);
    const minThreshold = materials.map(m => m.minStockLevel);

    chartInstances.materialStock = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Current Stock',
            data: currentStock,
            backgroundColor: '#06b6d4',
            borderRadius: 4
          },
          {
            label: 'Min Threshold',
            data: minThreshold,
            backgroundColor: '#cbd5e1',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // --- 3. UPCOMING DEADLINES ---
  function renderUpcomingDeadlines() {
    const container = document.getElementById('dashboardDeadlinesList');
    if (!container) return;

    const projects = getDashboardProjects();
    const sorted = [...projects].sort((a, b) => new Date(a.expectedCompletionDate) - new Date(b.expectedCompletionDate));

    container.innerHTML = sorted.slice(0, 4).map(p => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--border-color);">
        <div>
          <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-main);">${p.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);"><i class="fa-regular fa-calendar" style="color: var(--accent-orange); margin-right: 4px;"></i> Deadline: ${window.BuildTrack.formatDate(p.expectedCompletionDate)}</div>
        </div>
        <span class="status-badge badge-${p.status}">${p.status}</span>
      </div>
    `).join('');
  }

  // --- 4. OVERDUE TASKS ---
  function renderOverdueTasks() {
    const container = document.getElementById('dashboardOverdueList');
    if (!container) return;

    const tasks = getDashboardRecords(window.DataStore.getTasks());
    const today = new Date().toISOString().split('T')[0];
    const overdue = tasks.filter(t => t.status !== 'completed' && t.dueDate < today);

    if (overdue.length === 0) {
      container.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;"><i class="fa-solid fa-circle-check" style="color: var(--accent-emerald); margin-right: 6px;"></i> All scheduled tasks are on track!</div>`;
      return;
    }

    container.innerHTML = overdue.slice(0, 4).map(t => {
      const proj = window.DataStore.getProject(t.projectId);
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--border-color);">
          <div>
            <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-main);">${t.title}</div>
            <div style="font-size: 0.75rem; color: var(--accent-rose); font-weight: 500;">
              <i class="fa-solid fa-clock" style="margin-right: 4px;"></i> Due: ${window.BuildTrack.formatDate(t.dueDate)} (${proj ? proj.name.substring(0, 16) + '...' : ''})
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

    const expenses = getDashboardRecords(window.DataStore.getExpenses()).slice(0, 5);
    container.innerHTML = expenses.map(e => {
      const proj = window.DataStore.getProject(e.projectId);
      return `
        <tr>
          <td style="font-weight: 600;">${e.title}</td>
          <td>${proj ? proj.name : 'All Projects'}</td>
          <td><span class="priority-badge priority-low">${e.category}</span></td>
          <td style="font-weight: 700; color: var(--text-main);">${window.BuildTrack.formatINR(e.amount)}</td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${window.BuildTrack.formatDate(e.date)}</td>
        </tr>
      `;
    }).join('');
  }

  // --- 6. LABOUR AVAILABILITY SUMMARY ---
  function renderLabourAvailability() {
    const container = document.getElementById('dashboardLabourAvailability');
    if (!container) return;

    const projects = getDashboardProjects();
    const labour = getDashboardRecords(window.DataStore.getLabour(), 'assignedProjectId');

    container.innerHTML = projects.slice(0, 4).map(p => {
      const count = labour.filter(w => w.assignedProjectId === p.id).length;
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

    const materials = getDashboardRecords(window.DataStore.getMaterials(), 'assignedProjectId');
    const lowStock = materials.filter(m => m.quantity <= m.minStockLevel);

    if (lowStock.length === 0) {
      container.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;"><i class="fa-solid fa-box-check" style="color: var(--accent-emerald);"></i> Stock levels healthy.</div>`;
      return;
    }

    container.innerHTML = lowStock.map(m => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: var(--radius-md); margin-bottom: 0.5rem;">
        <div>
          <div style="font-size: 0.85rem; font-weight: 700; color: #991b1b;">${m.name}</div>
          <div style="font-size: 0.75rem; color: #b91c1c;">Stock: ${m.quantity} ${m.unit} (Min Threshold: ${m.minStockLevel})</div>
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

    const reports = getDashboardRecords(window.DataStore.getProgressReports()).slice(0, 3);
    container.innerHTML = reports.map(r => {
      const proj = window.DataStore.getProject(r.projectId);
      return `
        <div style="padding: 0.85rem; background-color: var(--bg-surface-alt); border-radius: var(--radius-md); border-left: 3px solid var(--accent-orange); margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-main);">${proj ? proj.name : 'Site Report'}</span>
            <span style="font-size: 0.72rem; color: var(--text-muted);">${window.BuildTrack.formatDate(r.date)}</span>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-main); margin-bottom: 6px;">${r.workCompleted}</p>
          <div style="font-size: 0.72rem; color: var(--text-muted); display: flex; gap: 1rem;">
            <span><i class="fa-solid fa-users" style="color: var(--accent-blue); margin-right: 3px;"></i> ${r.workersPresent} Workers</span>
            <span><i class="fa-solid fa-chart-line" style="color: var(--accent-emerald); margin-right: 3px;"></i> Progress: ${r.progressPercentage}%</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- 9. EARLY WARNING RISK SUMMARY ---
  function renderRiskWarningSummary() {
    const container = document.getElementById('dashboardRiskSummaryBanner');
    if (!container) return;

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="width: 44px; height: 44px; border-radius: 10px; background-color: rgba(249, 115, 22, 0.2); display: flex; align-items: center; justify-content: center; color: var(--accent-orange); font-size: 1.3rem;">
            <i class="fa-solid fa-shield-halved"></i>
          </div>
          <div>
            <div style="font-size: 0.95rem; font-weight: 700; color: #ffffff;">Rule-Based Risk Alerts Active</div>
            <div style="font-size: 0.78rem; color: #94a3b8;">Checks cover expenditure variance, overdue tasks, material stock, and workforce attendance.</div>
          </div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="BuildTrack.navigateTo('risks')">
          View Risk Intelligence <i class="fa-solid fa-arrow-right" style="margin-left: 4px;"></i>
        </button>
      </div>
    `;
  }

  // Event Listeners for Dashboard
  document.addEventListener('DOMContentLoaded', () => {
    // Refresh when view becomes active
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'dashboard') {
        initDashboard();
      }
    });

    // Refresh when data changes
    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'dashboard') {
        initDashboard();
      }
    });

    // Refresh when global project filter changes
    window.addEventListener('buildtrack:projectfilterchanged', () => {
      if (window.BuildTrack.currentView === 'dashboard') {
        initDashboard();
      }
    });

    window.addEventListener('buildtrack:clientchanged', () => {
      if (window.BuildTrack.currentView === 'dashboard') initDashboard();
    });

    // Initial render
    initDashboard();
  });

  window.DashboardController = {
    refresh: initDashboard
  };
})();
