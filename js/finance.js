/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Finance Controller: Budgets vs Actuals, Expenses Tracker, Vendor Payments & Ledger Distinction
 */

(function () {
  'use strict';

  let currentFinanceTab = 'budgets'; // 'budgets', 'expenses', 'payments'
  let financeChartInstance = null;

  function initFinance() {
    renderFinanceView();
    setupEventHandlers();
  }

  function renderFinanceView() {
    renderFinancialOverviewKPIs();
    renderBudgetsTable();
    renderExpensesTable();
    renderPaymentsTable();
    renderFinanceCategoryChart();
  }

  // 1. FINANCIAL SUMMARY KPIS
  function renderFinancialOverviewKPIs() {
    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const projects = window.DataStore.getProjects();
    const expenses = window.DataStore.getExpenses(selectedProjectId);
    const payments = window.DataStore.getPayments(selectedProjectId);

    let filteredProjects = projects;
    if (selectedProjectId !== 'all') {
      filteredProjects = projects.filter(p => p.id === selectedProjectId);
    }

    const totalBudget = filteredProjects.reduce((sum, p) => sum + (parseFloat(p.budget) || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const remaining = totalBudget - totalExpenses;
    const totalDisbursed = payments.filter(p => p.status === 'Paid').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalPending = payments.filter(p => p.status === 'Pending').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    setElText('finTotalBudget', window.BuildTrack.formatINR(totalBudget));
    setElText('finTotalExpenses', window.BuildTrack.formatINR(totalExpenses));
    setElText('finRemainingBudget', window.BuildTrack.formatINR(remaining));
    setElText('finTotalDisbursed', window.BuildTrack.formatINR(totalDisbursed));
    setElText('finPendingPayables', window.BuildTrack.formatINR(totalPending));
  }

  function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // 2. BUDGETS TAB TABLE
  function renderBudgetsTable() {
    const tbody = document.getElementById('finBudgetsTableBody');
    if (!tbody) return;

    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    let projects = window.DataStore.getProjects();
    if (selectedProjectId !== 'all') {
      projects = projects.filter(p => p.id === selectedProjectId);
    }

    tbody.innerHTML = projects.map(p => {
      const utilPercent = ((p.spent / p.budget) * 100).toFixed(1);
      const isOverrun = p.spent > p.budget;
      const variance = p.budget - p.spent;

      let alertPill = '<span class="status-badge badge-completed">Healthy</span>';
      if (isOverrun) {
        alertPill = '<span class="status-badge badge-delayed">Critical Overrun</span>';
      } else if (utilPercent > 85) {
        alertPill = '<span class="status-badge" style="background:#fef3c7; color:#92400e;">Warning (>85%)</span>';
      }

      return `
        <tr>
          <td>
            <div style="font-weight: 700; color: var(--text-main);">${p.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${p.client}</div>
          </td>
          <td style="font-weight: 700;">${window.BuildTrack.formatINR(p.budget)}</td>
          <td style="font-weight: 700; color: ${isOverrun ? 'var(--accent-rose)' : 'var(--text-main)'};">
            ${window.BuildTrack.formatINR(p.spent)}
          </td>
          <td style="font-weight: 600; color: ${variance < 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)'};">
            ${window.BuildTrack.formatINR(variance)}
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="progress-bar-track" style="width: 80px;">
                <div class="progress-bar-fill ${isOverrun ? 'progress-fill-rose' : (utilPercent > 80 ? 'progress-fill-orange' : 'progress-fill-blue')}" style="width: ${Math.min(100, utilPercent)}%;"></div>
              </div>
              <span style="font-size: 0.75rem; font-weight: 700;">${utilPercent}%</span>
            </div>
          </td>
          <td>${alertPill}</td>
        </tr>
      `;
    }).join('');
  }

  // 3. EXPENSES TAB TABLE
  function renderExpensesTable() {
    const tbody = document.getElementById('finExpensesTableBody');
    if (!tbody) return;

    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const expenses = window.DataStore.getExpenses(selectedProjectId);
    const projects = window.DataStore.getProjects();
    const categoryFilter = document.getElementById('expenseCategoryFilter');
    const cat = categoryFilter ? categoryFilter.value : 'all';

    const filtered = expenses.filter(e => {
      return (cat === 'all') || (e.category === cat);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No expense vouchers found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(e => {
      const proj = projects.find(p => p.id === e.projectId);
      return `
        <tr>
          <td style="font-weight: 700;">${e.id}</td>
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${e.title}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${e.description || ''}</div>
          </td>
          <td>${proj ? proj.name : 'All Projects'}</td>
          <td><span class="meta-pill-item">${e.category}</span></td>
          <td style="font-weight: 800; color: var(--text-main);">${window.BuildTrack.formatINR(e.amount)}</td>
          <td>${window.BuildTrack.formatDate(e.date)}</td>
          <td>
            <div class="table-actions-cell">
              <button class="btn btn-icon-only btn-outline" onclick="FinanceController.openEditExpenseModal('${e.id}')" title="Edit">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn btn-icon-only btn-outline" style="color: var(--accent-rose);" onclick="FinanceController.confirmDeleteExpense('${e.id}')" title="Delete">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 4. PAYMENTS TAB TABLE
  function renderPaymentsTable() {
    const tbody = document.getElementById('finPaymentsTableBody');
    if (!tbody) return;

    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const payments = window.DataStore.getPayments(selectedProjectId);
    const projects = window.DataStore.getProjects();

    if (payments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No disbursement records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = payments.map(p => {
      const proj = projects.find(prj => prj.id === p.projectId);
      return `
        <tr>
          <td style="font-weight: 700;">${p.paymentRef}</td>
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${p.recipient}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${p.notes || ''}</div>
          </td>
          <td>${proj ? proj.name : 'Central'}</td>
          <td style="font-weight: 800; color: var(--text-main);">${window.BuildTrack.formatINR(p.amount)}</td>
          <td>${window.BuildTrack.formatDate(p.date)}</td>
          <td>
            <span class="status-badge ${p.status === 'Paid' ? 'badge-completed' : (p.status === 'Pending' ? 'badge-ongoing' : 'badge-delayed')}">
              ${p.status}
            </span>
          </td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${p.paymentMethod}</td>
          <td>
            <div class="table-actions-cell">
              <button class="btn btn-sm btn-outline" onclick="FinanceController.togglePaymentStatus('${p.id}')" title="Toggle Status">
                <i class="fa-solid fa-rotate"></i>
              </button>
              <button class="btn btn-icon-only btn-outline" style="color: var(--accent-rose);" onclick="FinanceController.confirmDeletePayment('${p.id}')" title="Delete">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 5. FINANCE EXPENSE CATEGORY CHART
  function renderFinanceCategoryChart() {
    const ctx = document.getElementById('financeCategoryChart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (financeChartInstance) financeChartInstance.destroy();

    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const expenses = window.DataStore.getExpenses(selectedProjectId);

    const categories = { 'Materials': 0, 'Labour': 0, 'Equipment': 0, 'Transport': 0, 'Other': 0 };
    expenses.forEach(e => {
      const cat = e.category || 'Other';
      if (categories[cat] !== undefined) categories[cat] += parseFloat(e.amount) || 0;
      else categories['Other'] += parseFloat(e.amount) || 0;
    });

    financeChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(categories),
        datasets: [{
          data: Object.values(categories),
          backgroundColor: ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#64748b'],
          borderColor: '#ffffff',
          borderWidth: 2
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
        cutout: '65%'
      }
    });
  }

  // 6. EVENT HANDLERS & TABS
  function setupEventHandlers() {
    // Finance Subtabs toggle
    document.querySelectorAll('.finance-nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.finance-nav-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.finance-subtab-pane').forEach(p => p.style.display = 'none');

        this.classList.add('active');
        const tab = this.getAttribute('data-fintab');
        const pane = document.getElementById(`fintab-${tab}`);
        if (pane) pane.style.display = 'block';
        currentFinanceTab = tab;
      });
    });

    const categoryFilter = document.getElementById('expenseCategoryFilter');
    if (categoryFilter) categoryFilter.addEventListener('change', renderExpensesTable);

    // Expense Form Submit
    const expenseForm = document.getElementById('expenseAddEditForm');
    if (expenseForm) {
      expenseForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const id = document.getElementById('expenseFormId').value;
        const title = document.getElementById('expenseFormTitle').value.trim();
        const projectId = document.getElementById('expenseFormProject').value;
        const category = document.getElementById('expenseFormCategory').value;
        const amount = parseFloat(document.getElementById('expenseFormAmount').value) || 0;
        const date = document.getElementById('expenseFormDate').value;
        const paymentMethod = document.getElementById('expenseFormMethod').value;
        const description = document.getElementById('expenseFormDesc').value.trim();

        if (!title || !projectId || amount <= 0) {
          window.BuildTrack.showToast('Please fill valid expense title, project, and positive amount.', 'error');
          return;
        }

        const expenseData = {
          id: id || undefined,
          title,
          projectId,
          category,
          amount,
          date: date || new Date().toISOString().split('T')[0],
          paymentMethod,
          description
        };

        window.DataStore.saveExpense(expenseData);
        window.BuildTrack.closeModal('expenseModal');
        window.BuildTrack.showToast(`Expense "${title}" saved successfully!`, 'success');
        renderFinanceView();
      });
    }

    // Payment Form Submit
    const paymentForm = document.getElementById('paymentAddEditForm');
    if (paymentForm) {
      paymentForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const id = document.getElementById('paymentFormId').value;
        const recipient = document.getElementById('paymentFormRecipient').value.trim();
        const projectId = document.getElementById('paymentFormProject').value;
        const amount = parseFloat(document.getElementById('paymentFormAmount').value) || 0;
        const date = document.getElementById('paymentFormDate').value;
        const status = document.getElementById('paymentFormStatus').value;
        const paymentMethod = document.getElementById('paymentFormMethod').value;
        const notes = document.getElementById('paymentFormNotes').value.trim();

        if (!recipient || !projectId || amount <= 0) {
          window.BuildTrack.showToast('Please provide valid recipient, project, and payment amount.', 'error');
          return;
        }

        const paymentData = {
          id: id || undefined,
          recipient,
          projectId,
          amount,
          date: date || new Date().toISOString().split('T')[0],
          status,
          paymentMethod,
          notes
        };

        window.DataStore.savePayment(paymentData);
        window.BuildTrack.closeModal('paymentModal');
        window.BuildTrack.showToast(`Disbursement to "${recipient}" saved!`, 'success');
        renderFinanceView();
      });
    }
  }

  function togglePaymentStatus(paymentId) {
    const payment = window.DataStore.getPayment(paymentId);
    if (!payment) return;

    payment.status = payment.status === 'Paid' ? 'Pending' : 'Paid';
    window.DataStore.savePayment(payment);
    window.BuildTrack.showToast(`Payment ${payment.paymentRef} marked as ${payment.status}`, 'info');
    renderFinanceView();
  }

  function openAddExpenseModal() {
    const form = document.getElementById('expenseAddEditForm');
    if (form) form.reset();

    document.getElementById('expenseModalTitle').textContent = 'Record Site Expense';
    document.getElementById('expenseFormId').value = '';
    document.getElementById('expenseFormDate').value = new Date().toISOString().split('T')[0];

    populateExpenseProjectDropdown();
    window.BuildTrack.openModal('expenseModal');
  }

  function openEditExpenseModal(expenseId) {
    const e = window.DataStore.getExpense(expenseId);
    if (!e) return;

    populateExpenseProjectDropdown();
    document.getElementById('expenseModalTitle').textContent = 'Edit Site Expense';
    document.getElementById('expenseFormId').value = e.id;
    document.getElementById('expenseFormTitle').value = e.title;
    document.getElementById('expenseFormProject').value = e.projectId;
    document.getElementById('expenseFormCategory').value = e.category;
    document.getElementById('expenseFormAmount').value = e.amount;
    document.getElementById('expenseFormDate').value = e.date;
    document.getElementById('expenseFormMethod').value = e.paymentMethod;
    document.getElementById('expenseFormDesc').value = e.description || '';

    window.BuildTrack.openModal('expenseModal');
  }

  function populateExpenseProjectDropdown() {
    const dropdown = document.getElementById('expenseFormProject');
    if (!dropdown) return;

    const projects = window.DataStore.getProjects();
    dropdown.innerHTML = projects.map(p => `
      <option value="${p.id}">${p.name}</option>
    `).join('');

    if (window.BuildTrack.currentProjectId && window.BuildTrack.currentProjectId !== 'all') {
      dropdown.value = window.BuildTrack.currentProjectId;
    }
  }

  function confirmDeleteExpense(expenseId) {
    const e = window.DataStore.getExpense(expenseId);
    if (!e) return;

    window.BuildTrack.showConfirm({
      title: `Delete Expense "${e.title}"?`,
      message: 'This expense entry will be removed and project spending totals will be updated.',
      confirmText: 'Delete Expense',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.DataStore.deleteExpense(expenseId);
        window.BuildTrack.showToast(`Expense "${e.title}" deleted.`, 'info');
        renderFinanceView();
      }
    });
  }

  function openAddPaymentModal() {
    const form = document.getElementById('paymentAddEditForm');
    if (form) form.reset();

    document.getElementById('paymentModalTitle').textContent = 'Issue Vendor Payment';
    document.getElementById('paymentFormId').value = '';
    document.getElementById('paymentFormDate').value = new Date().toISOString().split('T')[0];

    populatePaymentProjectDropdown();
    window.BuildTrack.openModal('paymentModal');
  }

  function populatePaymentProjectDropdown() {
    const dropdown = document.getElementById('paymentFormProject');
    if (!dropdown) return;

    const projects = window.DataStore.getProjects();
    dropdown.innerHTML = projects.map(p => `
      <option value="${p.id}">${p.name}</option>
    `).join('');

    if (window.BuildTrack.currentProjectId && window.BuildTrack.currentProjectId !== 'all') {
      dropdown.value = window.BuildTrack.currentProjectId;
    }
  }

  function confirmDeletePayment(paymentId) {
    const p = window.DataStore.getPayment(paymentId);
    if (!p) return;

    window.BuildTrack.showConfirm({
      title: `Delete Payment ${p.paymentRef}?`,
      message: 'This disbursement record will be removed from the ledger.',
      confirmText: 'Delete Payment',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.DataStore.deletePayment(paymentId);
        window.BuildTrack.showToast(`Payment ${p.paymentRef} deleted.`, 'info');
        renderFinanceView();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'finance') {
        renderFinanceView();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'finance') {
        renderFinanceView();
      }
    });

    window.addEventListener('buildtrack:projectfilterchanged', () => {
      if (window.BuildTrack.currentView === 'finance') {
        renderFinanceView();
      }
    });

    initFinance();
  });

  window.FinanceController = {
    render: renderFinanceView,
    openAddExpenseModal: openAddExpenseModal,
    openEditExpenseModal: openEditExpenseModal,
    confirmDeleteExpense: confirmDeleteExpense,
    openAddPaymentModal: openAddPaymentModal,
    togglePaymentStatus: togglePaymentStatus,
    confirmDeletePayment: confirmDeletePayment
  };
})();
