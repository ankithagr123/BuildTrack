/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Reports & Analytics Controller: Connected to Flask API & SQLite Database
 */

(function () {
  'use strict';

  const API = 'http://127.0.0.1:5000/api';
  let currentReportType = 'progress';

  let projectsCache = [];
  let expensesCache = [];
  let paymentsCache = [];
  let workersCache = [];
  let attendanceCache = [];
  let materialsCache = [];
  let tasksCache = [];

  async function apiRequest(endpoint) {
    const response = await fetch(`${API}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Reports API request failed');
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

  function matchesProject(itemProjectId, filterId) {
    if (!filterId || filterId === 'all') return true;
    return String(itemProjectId) === String(filterId);
  }

  async function loadReportsData() {
    try {
      const [projectsRes, financeRes, workersRes, attendanceRes, materialsRes, tasksRes] = await Promise.all([
        apiRequest('/projects'),
        apiRequest('/finance'),
        safeFetch('/workers', []),
        safeFetch('/attendance', []),
        safeFetch('/materials', []),
        safeFetch('/tasks', [])
      ]);

      projectsCache = Array.isArray(projectsRes) ? projectsRes : [];
      const rawTxns = Array.isArray(financeRes.transactions) ? financeRes.transactions : [];
      expensesCache = rawTxns
        .filter(t => (t.type || 'Expense').toLowerCase() === 'expense')
        .map(t => ({
          id: `EXP-${100 + Number(t.id)}`,
          title: t.description || t.category || 'Site Expense',
          projectId: t.project_id,
          category: t.category || 'Other',
          amount: parseFloat(t.amount) || 0,
          date: t.date || '',
          paymentMethod: 'Bank Transfer'
        }));

      const rawPayments = Array.isArray(financeRes.payments) ? financeRes.payments : [];
      paymentsCache = rawPayments.map(p => ({
        paymentRef: `PAY-${200 + Number(p.id)}`,
        projectId: p.project_id,
        recipient: p.payee || 'Vendor',
        amount: parseFloat(p.amount) || 0,
        date: p.payment_date || '',
        status: p.status || 'Paid',
        paymentMethod: p.payment_method || 'Bank Transfer'
      }));

      workersCache = Array.isArray(workersRes) ? workersRes : [];
      attendanceCache = Array.isArray(attendanceRes) ? attendanceRes : [];
      materialsCache = Array.isArray(materialsRes) ? materialsRes : [];
      tasksCache = Array.isArray(tasksRes) ? tasksRes : [];

      populateReportProjectFilter();
      generateActiveReport();
    } catch (error) {
      console.error('Reports load error:', error);
    }
  }

  function initReports() {
    setupReportControls();
    loadReportsData();
  }

  function setupReportControls() {
    const reportSelect = document.getElementById('reportTypeSelect');
    const projectSelect = document.getElementById('reportProjectFilter');
    const printBtn = document.getElementById('printReportBtn');
    const exportBtn = document.getElementById('exportReportCsvBtn');

    if (reportSelect) {
      reportSelect.addEventListener('change', function () {
        currentReportType = this.value;
        generateActiveReport();
      });
    }

    if (projectSelect) {
      projectSelect.addEventListener('change', generateActiveReport);
    }

    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', exportActiveReportToCSV);
    }
  }

  function populateReportProjectFilter() {
    const selector = document.getElementById('reportProjectFilter');
    if (!selector) return;

    const currentVal = selector.value || 'all';
    selector.innerHTML = '<option value="all">All Projects Combined</option>' + projectsCache.map(p => `
      <option value="${p.id}">${p.name}</option>
    `).join('');
    selector.value = currentVal;
  }

  function generateActiveReport() {
    const projectFilter = document.getElementById('reportProjectFilter')?.value || 'all';
    const titleEl = document.getElementById('reportDisplayTitle');
    const subtitleEl = document.getElementById('reportDisplaySubtitle');
    const statsContainer = document.getElementById('reportSummaryStats');
    const tableContainer = document.getElementById('reportDynamicTableWrapper');

    if (!tableContainer) return;

    let headers = [];
    let rows = [];
    let stats = [];

    const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    if (currentReportType === 'progress') {
      if (titleEl) titleEl.textContent = 'Project Progress & Milestone Delivery Audit';
      if (subtitleEl) subtitleEl.textContent = `Generated on ${now} • Physical Completion & Schedule Tracking`;

      const projects = projectsCache.filter(p => matchesProject(p.id, projectFilter));
      headers = ['Project ID', 'Project Name', 'Client', 'Manager', 'Deadline', 'Status', 'Physical Progress %'];
      rows = projects.map(p => {
        const endDate = p.end_date || p.expectedCompletionDate || '';
        return [
          `PRJ-${p.id}`,
          p.name,
          p.client_name || p.client || 'N/A',
          p.manager || 'Site Lead',
          window.BuildTrack.formatDate ? window.BuildTrack.formatDate(endDate) : endDate,
          (p.status || 'Active').toUpperCase(),
          `${p.progress || 0}%`
        ];
      });

      const avgProgress = projects.length > 0
        ? (projects.reduce((s, p) => s + (parseInt(p.progress, 10) || 0), 0) / projects.length).toFixed(1)
        : 0;
      stats = [
        { label: 'Audited Projects', val: projects.length },
        { label: 'Avg Portfolio Progress', val: `${avgProgress}%` },
        { label: 'Delayed Sites', val: projects.filter(p => (p.status || '').toLowerCase() === 'delayed').length }
      ];
    } else if (currentReportType === 'finance') {
      if (titleEl) titleEl.textContent = 'Budget vs Actual Construction Expenditure Report';
      if (subtitleEl) subtitleEl.textContent = `Generated on ${now} • Cost Audit & Spending Variance`;

      const expenses = expensesCache.filter(e => matchesProject(e.projectId, projectFilter));
      headers = ['Voucher ID', 'Expense Title', 'Category', 'Date', 'Payment Mode', 'Amount (INR)'];
      rows = expenses.map(e => [
        e.id,
        e.title,
        e.category,
        window.BuildTrack.formatDate ? window.BuildTrack.formatDate(e.date) : e.date,
        e.paymentMethod,
        window.BuildTrack.formatINR(e.amount)
      ]);

      const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
      stats = [
        { label: 'Total Expense Vouchers', val: expenses.length },
        { label: 'Total Incurred Spend', val: window.BuildTrack.formatINR(totalSpent) },
        { label: 'Largest Category', val: 'Materials' }
      ];
    } else if (currentReportType === 'labour') {
      if (titleEl) titleEl.textContent = 'Workforce Attendance & Wage Payout Audit';
      if (subtitleEl) subtitleEl.textContent = `Generated on ${now} • Daily Craftsmen Attendance & Labour Costing`;

      const labour = workersCache.filter(w => matchesProject(w.assignedProjectId || w.project_id, projectFilter));
      const today = new Date().toISOString().split('T')[0];
      const att = {};
      attendanceCache.forEach(a => {
        if (a.date === today) att[a.worker_id] = a.status === 'P' ? 'present' : (a.status === 'L' ? 'leave' : 'absent');
      });

      headers = ['Worker ID', 'Name', 'Skill Trade', 'Phone', 'Daily Wage', 'Today Status'];
      rows = labour.map(w => [
        w.id,
        w.name,
        w.skill || w.role || 'General',
        w.phone || 'N/A',
        window.BuildTrack.formatINR(w.dailyWage || 0),
        (att[w.id] || (w.availability === 'On Site' ? 'present' : 'absent')).toUpperCase()
      ]);

      const present = labour.filter(w => (att[w.id] || (w.availability === 'On Site' ? 'present' : 'absent')) === 'present').length;
      const totalDailyCost = labour.reduce((sum, w) => {
        const isPres = (att[w.id] || (w.availability === 'On Site' ? 'present' : 'absent')) === 'present';
        return isPres ? sum + (parseFloat(w.dailyWage) || 0) : sum;
      }, 0);

      stats = [
        { label: 'Enrolled Workers', val: labour.length },
        { label: 'Present Today', val: present },
        { label: 'Daily Wage Burn', val: window.BuildTrack.formatINR(totalDailyCost) }
      ];
    } else if (currentReportType === 'materials') {
      if (titleEl) titleEl.textContent = 'Material Inventory Stock & Valuation Audit';
      if (subtitleEl) subtitleEl.textContent = `Generated on ${now} • Stock Levels, Threshold Alerts & Valuation`;

      const materials = materialsCache.filter(m => matchesProject(m.assignedProjectId || m.project_id, projectFilter));
      headers = ['Material Code', 'Material Name', 'Category', 'Stock Qty', 'Min Level', 'Unit Rate', 'Inventory Value'];
      rows = materials.map(m => {
        const qty = Number(m.quantity) || 0;
        const rate = Number(m.unitPrice || m.unit_price) || 0;
        const minLvl = Number(m.minStockLevel || m.min_stock_level) || 0;
        return [
          m.id,
          m.name,
          m.category || 'General',
          `${qty} ${m.unit || 'units'}`,
          `${minLvl} ${m.unit || 'units'}`,
          window.BuildTrack.formatINR(rate),
          window.BuildTrack.formatINR(qty * rate)
        ];
      });

      const totalValuation = materials.reduce((s, m) => s + ((Number(m.quantity) || 0) * (Number(m.unitPrice || m.unit_price) || 0)), 0);
      const lowStock = materials.filter(m => Number(m.quantity) <= Number(m.minStockLevel || m.min_stock_level || 0)).length;

      stats = [
        { label: 'Catalogued Materials', val: materials.length },
        { label: 'Total Valuation', val: window.BuildTrack.formatINR(totalValuation) },
        { label: 'Depleted Items', val: lowStock }
      ];
    } else if (currentReportType === 'payments') {
      if (titleEl) titleEl.textContent = 'Vendor & Subcontractor Disbursements Ledger';
      if (subtitleEl) subtitleEl.textContent = `Generated on ${now} • Cash Flow Audit & Payment Clearance`;

      const payments = paymentsCache.filter(p => matchesProject(p.projectId, projectFilter));
      headers = ['Payment Ref', 'Recipient / Supplier', 'Date', 'Payment Mode', 'Status', 'Disbursed Amount'];
      rows = payments.map(p => [
        p.paymentRef,
        p.recipient,
        window.BuildTrack.formatDate ? window.BuildTrack.formatDate(p.date) : p.date,
        p.paymentMethod,
        p.status,
        window.BuildTrack.formatINR(p.amount)
      ]);

      const totalPaid = payments.filter(p => p.status === 'Paid').reduce((s, p) => s + p.amount, 0);
      const totalPending = payments.filter(p => p.status === 'Pending').reduce((s, p) => s + p.amount, 0);

      stats = [
        { label: 'Disbursement Count', val: payments.length },
        { label: 'Cleared Payments', val: window.BuildTrack.formatINR(totalPaid) },
        { label: 'Pending Dues', val: window.BuildTrack.formatINR(totalPending) }
      ];
    } else if (currentReportType === 'tasks') {
      if (titleEl) titleEl.textContent = 'Delayed Work Packages & Overdue Tasks Register';
      if (subtitleEl) subtitleEl.textContent = `Generated on ${now} • Critical Schedule Bottlenecks`;

      const tasks = tasksCache.filter(t => matchesProject(t.project_id || t.projectId, projectFilter));
      const today = new Date().toISOString().split('T')[0];
      const overdue = tasks.filter(t => {
        const due = t.due_date || t.dueDate;
        return t.status !== 'completed' && due && due < today;
      });

      headers = ['Task ID', 'Task Title', 'Assigned Team', 'Due Date', 'Priority', 'Current Status'];
      rows = overdue.map(t => {
        const due = t.due_date || t.dueDate || '';
        return [
          t.id,
          t.title,
          t.assignedTo || t.assigned_to || 'Site Crew',
          window.BuildTrack.formatDate ? window.BuildTrack.formatDate(due) : due,
          (t.priority || 'medium').toUpperCase(),
          (t.status || 'pending').toUpperCase()
        ];
      });

      stats = [
        { label: 'Total Overdue Tasks', val: overdue.length },
        { label: 'High Priority Overdue', val: overdue.filter(t => t.priority === 'high').length },
        { label: 'Status', val: overdue.length > 0 ? 'Action Required' : 'On Track' }
      ];
    }

    if (statsContainer) {
      statsContainer.innerHTML = stats.map(s => `
        <div style="background-color: var(--bg-surface-alt); padding: 0.85rem 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); flex: 1; min-width: 160px;">
          <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">${s.label}</div>
          <div style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin-top: 2px;">${s.val}</div>
        </div>
      `).join('');
    }

    tableContainer.innerHTML = `
      <div class="table-responsive-wrapper">
        <table class="data-table-custom" id="reportActiveDataTable">
          <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? `<tr><td colspan="${headers.length}" style="text-align: center; color: var(--text-muted); padding: 2rem;">No data available for this report criteria.</td></tr>` :
              rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;

    window._lastGeneratedReport = {
      title: titleEl ? titleEl.textContent : 'BuildTrack_Report',
      headers,
      rows
    };
  }

  function exportActiveReportToCSV() {
    const data = window._lastGeneratedReport;
    if (!data || !data.headers || data.rows.length === 0) {
      window.BuildTrack.showToast('No report data available to export.', 'warning');
      return;
    }

    const escapeCsv = (str) => {
      const stringified = String(str).replace(/"/g, '""');
      return `"${stringified}"`;
    };

    let csvContent = '\uFEFF';
    csvContent += data.headers.map(escapeCsv).join(',') + '\r\n';

    data.rows.forEach(row => {
      csvContent += row.map(escapeCsv).join(',') + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BuildTrack_${currentReportType}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    window.BuildTrack.showToast('Report CSV file downloaded successfully!', 'success');
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'reports') {
        loadReportsData();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'reports') {
        loadReportsData();
      }
    });

    initReports();
  });

  window.ReportsController = {
    generate: loadReportsData,
    exportCSV: exportActiveReportToCSV
  };
})();