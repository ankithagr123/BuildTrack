/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Reports & Analytics Controller: Multi-Domain Audits, Summary KPIs, CSV Export & Print
 */

(function () {
  'use strict';

  let currentReportType = 'progress';

  function initReports() {
    setupReportControls();
    generateActiveReport();
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
      populateReportProjectFilter();
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

    const projects = window.BuildTrack.getVisibleProjects();
    const allLabel = window.BuildTrack.isClientRole() ? 'All Assigned Projects' : 'All Projects Combined';
    const currentValue = selector.value;
    selector.innerHTML = `<option value="all">${allLabel}</option>` + projects.map(p => `
      <option value="${p.id}">${p.name}</option>
    `).join('');
    selector.value = [...selector.options].some(option => option.value === currentValue) ? currentValue : 'all';
  }

  function getReportProjects(projectFilter) {
    const projects = window.BuildTrack.getVisibleProjects();
    return projectFilter === 'all' ? projects : projects.filter(project => project.id === projectFilter);
  }

  // --- REPORT GENERATOR DISPATCHER ---
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

      const projects = getReportProjects(projectFilter);

      headers = ['Project ID', 'Project Name', 'Client', 'Manager', 'Deadline', 'Status', 'Physical Progress %'];
      rows = projects.map(p => [
        p.id,
        p.name,
        p.client,
        p.manager,
        window.BuildTrack.formatDate(p.expectedCompletionDate),
        p.status.toUpperCase(),
        `${p.progress}%`
      ]);

      const avgProgress = projects.length > 0 ? (projects.reduce((s, p) => s + p.progress, 0) / projects.length).toFixed(1) : 0;
      stats = [
        { label: window.BuildTrack.isClientRole() ? 'Assigned Projects' : 'Audited Projects', val: projects.length },
        { label: window.BuildTrack.isClientRole() ? 'Avg Assigned Project Progress' : 'Avg Portfolio Progress', val: `${avgProgress}%` },
        { label: window.BuildTrack.isClientRole() ? 'Delayed Assigned Projects' : 'Delayed Sites', val: projects.filter(p => p.status === 'delayed').length }
      ];
    } else if (currentReportType === 'finance') {
      if (titleEl) titleEl.textContent = 'Budget vs Actual Construction Expenditure Report';
      if (subtitleEl) subtitleEl.textContent = `Generated on ${now} • Cost Audit & Spending Variance`;

      let expenses = window.BuildTrack.filterClientRecords(
        window.DataStore.getExpenses(projectFilter), projectFilter, 'projectId'
      );
      headers = ['Voucher ID', 'Expense Title', 'Category', 'Date', 'Payment Mode', 'Amount (INR)'];
      rows = expenses.map(e => [
        e.id,
        e.title,
        e.category,
        window.BuildTrack.formatDate(e.date),
        e.paymentMethod,
        window.BuildTrack.formatINR(e.amount)
      ]);

      const totalSpent = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      const categoryTotals = expenses.reduce((totals, expense) => {
        totals[expense.category] = (totals[expense.category] || 0) + (parseFloat(expense.amount) || 0);
        return totals;
      }, {});
      const largestCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
      stats = [
        { label: 'Total Expense Vouchers', val: expenses.length },
        { label: 'Total Incurred Spend', val: window.BuildTrack.formatINR(totalSpent) },
        { label: 'Largest Category', val: largestCategory }
      ];
    } else if (currentReportType === 'labour') {
      if (titleEl) titleEl.textContent = 'Workforce Attendance & Wage Payout Audit';
      if (subtitleEl) subtitleEl.textContent = `Generated on ${now} • Daily Craftsmen Attendance & Labour Costing`;

      const labour = window.BuildTrack.filterClientRecords(
        window.DataStore.getLabour(projectFilter), projectFilter, 'assignedProjectId'
      );
      const today = new Date().toISOString().split('T')[0];
      const att = window.DataStore.getAttendance(today);

      headers = ['Worker ID', 'Name', 'Skill Trade', 'Phone', 'Daily Wage', 'Today Status'];
      rows = labour.map(w => [
        w.id,
        w.name,
        w.skill,
        w.phone,
        window.BuildTrack.formatINR(w.dailyWage),
        (att[w.id] || (w.availability === 'On Site' ? 'present' : 'absent')).toUpperCase()
      ]);

      const present = labour.filter(w => (att[w.id] || 'present') === 'present').length;
      const totalDailyCost = labour.reduce((sum, w) => {
        return (att[w.id] || 'present') === 'present' ? sum + (parseFloat(w.dailyWage) || 0) : sum;
      }, 0);

      stats = [
        { label: 'Enrolled Workers', val: labour.length },
        { label: 'Present Today', val: present },
        { label: 'Daily Wage Burn', val: window.BuildTrack.formatINR(totalDailyCost) }
      ];
    } else if (currentReportType === 'materials') {
      if (titleEl) titleEl.textContent = 'Material Inventory Stock & Valuation Audit';
      if (subtitleEl) subtitleEl.textContent = `Generated on ${now} • Stock Levels, Threshold Alerts & Valuation`;

      const materials = window.BuildTrack.filterClientRecords(
        window.DataStore.getMaterials(projectFilter), projectFilter, 'assignedProjectId'
      );
      headers = ['Material Code', 'Material Name', 'Category', 'Stock Qty', 'Min Level', 'Unit Rate', 'Inventory Value'];
      rows = materials.map(m => [
        m.id,
        m.name,
        m.category,
        `${m.quantity} ${m.unit}`,
        `${m.minStockLevel} ${m.unit}`,
        window.BuildTrack.formatINR(m.unitPrice),
        window.BuildTrack.formatINR(m.quantity * m.unitPrice)
      ]);

      const totalValuation = materials.reduce((s, m) => s + (m.quantity * m.unitPrice), 0);
      const lowStock = materials.filter(m => m.quantity <= m.minStockLevel).length;

      stats = [
        { label: 'Catalogued Materials', val: materials.length },
        { label: 'Total Valuation', val: window.BuildTrack.formatINR(totalValuation) },
        { label: 'Depleted Items', val: lowStock }
      ];
    } else if (currentReportType === 'payments') {
      if (titleEl) titleEl.textContent = 'Vendor & Subcontractor Disbursements Ledger';
      if (subtitleEl) subtitleEl.textContent = `Generated on ${now} • Cash Flow Audit & Payment Clearance`;

      const payments = window.BuildTrack.filterClientRecords(
        window.DataStore.getPayments(projectFilter), projectFilter, 'projectId'
      );
      headers = ['Payment Ref', 'Recipient / Supplier', 'Date', 'Payment Mode', 'Status', 'Disbursed Amount'];
      rows = payments.map(p => [
        p.paymentRef,
        p.recipient,
        window.BuildTrack.formatDate(p.date),
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

      const tasks = window.BuildTrack.filterClientRecords(
        window.DataStore.getTasks(projectFilter), projectFilter, 'projectId'
      );
      const today = new Date().toISOString().split('T')[0];
      const overdue = tasks.filter(t => t.status !== 'completed' && t.dueDate < today);

      headers = ['Task ID', 'Task Title', 'Assigned Team', 'Due Date', 'Priority', 'Current Status'];
      rows = overdue.map(t => [
        t.id,
        t.title,
        t.assignedTo,
        window.BuildTrack.formatDate(t.dueDate),
        t.priority.toUpperCase(),
        t.status.toUpperCase()
      ]);

      stats = [
        { label: 'Total Overdue Tasks', val: overdue.length },
        { label: 'High Priority Overdue', val: overdue.filter(t => t.priority === 'high').length },
        { label: 'Status', val: overdue.length > 0 ? 'Action Required' : 'On Track' }
      ];
    }

    if (currentReportType !== 'progress') {
      stats.unshift({
        label: window.BuildTrack.isClientRole() ? 'Assigned Projects' : 'Projects Included',
        val: getReportProjects(projectFilter).length
      });
    }

    // Render Stats Box
    if (statsContainer) {
      statsContainer.innerHTML = stats.map(s => `
        <div style="background-color: var(--bg-surface-alt); padding: 0.85rem 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); flex: 1; min-width: 160px;">
          <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">${s.label}</div>
          <div style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin-top: 2px;">${s.val}</div>
        </div>
      `).join('');
    }

    // Render Dynamic Table
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

    // Cache current report data for CSV export
    window._lastGeneratedReport = {
      title: titleEl ? titleEl.textContent : 'BuildTrack_Report',
      headers,
      rows
    };
  }

  // --- REAL CSV EXPORT FUNCTION ---
  function exportActiveReportToCSV() {
    const data = window._lastGeneratedReport;
    if (!data || !data.headers || data.rows.length === 0) {
      window.BuildTrack.showToast('No report data available to export.', 'warning');
      return;
    }

    // Clean strings and wrap in quotes for CSV compliance
    const escapeCsv = (str) => {
      const stringified = String(str).replace(/"/g, '""');
      return `"${stringified}"`;
    };

    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel compatibility
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
        populateReportProjectFilter();
        generateActiveReport();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'reports') {
        populateReportProjectFilter();
        generateActiveReport();
      }
    });

    window.addEventListener('buildtrack:clientchanged', () => {
      populateReportProjectFilter();
      generateActiveReport();
    });

    initReports();
  });

  window.ReportsController = {
    generate: generateActiveReport,
    exportCSV: exportActiveReportToCSV
  };
})();
