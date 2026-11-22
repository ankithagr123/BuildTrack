/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Finance Controller: Connected to Flask API & SQLite Database
 */

(function () {
  'use strict';

  const API = 'http://127.0.0.1:5000/api';

  let currentFinanceTab = 'budgets';
  let financeChartInstance = null;
  let projectsCache = [];
  let expensesCache = [];
  let paymentsCache = [];

  function notify(message, type = 'success') {
    if (window.BuildTrack && window.BuildTrack.showToast) {
      window.BuildTrack.showToast(message, type);
    }
  }

  async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Finance API request failed');
    }
    return result;
  }

  function normalizeProjectId(rawId) {
    if (rawId === null || rawId === undefined || rawId === '' || rawId === 'all') return null;
    const num = Number(String(rawId).replace(/\D/g, ''));
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  function matchesSelectedProject(itemProjectId, selectedProjectId) {
    if (!selectedProjectId || selectedProjectId === 'all') return true;
    return String(itemProjectId) === String(selectedProjectId) ||
           normalizeProjectId(itemProjectId) === normalizeProjectId(selectedProjectId);
  }

  async function loadFinanceData() {
    try {
      const [financeRes, projectsRes] = await Promise.all([
        apiRequest('/finance'),
        apiRequest('/projects')
      ]);

      projectsCache = Array.isArray(projectsRes) ? projectsRes : [];

      const rawTxns = Array.isArray(financeRes.transactions) ? financeRes.transactions : [];
      expensesCache = rawTxns
        .filter(t => (t.type || 'Expense').toLowerCase() === 'expense')
        .map(t => ({
          id: t.id,
          displayId: `EXP-${100 + Number(t.id)}`,
          title: t.description || t.category || 'Site Expense',
          projectId: t.project_id,
          category: t.category || 'Other',
          amount: parseFloat(t.amount) || 0,
          date: t.date || '',
          paymentMethod: 'Bank Transfer',
          description: t.description || ''
        }));

      const rawPayments = Array.isArray(financeRes.payments) ? financeRes.payments : [];
      paymentsCache = rawPayments.map(p => ({
        id: p.id,
        paymentRef: `PAY-${200 + Number(p.id)}`,
        projectId: p.project_id,
        recipient: p.payee || 'Vendor',
        amount: parseFloat(p.amount) || 0,
        date: p.payment_date || '',
        status: p.status || 'Paid',
        paymentMethod: p.payment_method || 'Bank Transfer',
        notes: p.notes || ''
      }));

      renderFinanceView();
    } catch (error) {
      console.error('Finance load error:', error);
      notify('Unable to load Finance data. Check Flask server.', 'error');
    }
  }

  function initFinance() {
    setupEventHandlers();
    loadFinanceData();
  }

  function renderFinanceView() {
    renderFinancialOverviewKPIs();
    renderBudgetsTable();
    renderExpensesTable();
    renderPaymentsTable();
    renderFinanceCategoryChart();
  }

  function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderFinancialOverviewKPIs() {
    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';

    const filteredProjects = projectsCache.filter(p => matchesSelectedProject(p.id, selectedProjectId));
    const filteredExpenses = expensesCache.filter(e => matchesSelectedProject(e.projectId, selectedProjectId));
    const filteredPayments = paymentsCache.filter(p => matchesSelectedProject(p.projectId, selectedProjectId));

    const totalBudget = filteredProjects.reduce((sum, p) => sum + (parseFloat(p.budget) || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const remaining = totalBudget - totalExpenses;
    const totalDisbursed = filteredPayments
      .filter(p => p.status === 'Paid')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalPending = filteredPayments
      .filter(p => p.status === 'Pending')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    setElText('finTotalBudget', window.BuildTrack.formatINR(totalBudget));
    setElText('finTotalExpenses', window.BuildTrack.formatINR(totalExpenses));
    setElText('finRemainingBudget', window.BuildTrack.formatINR(remaining));
    setElText('finTotalDisbursed', window.BuildTrack.formatINR(totalDisbursed));
    setElText('finPendingPayables', window.BuildTrack.formatINR(totalPending));
  }

  function renderBudgetsTable() {
    const tbody = document.getElementById('finBudgetsTableBody');
    if (!tbody) return;

    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const projects = projectsCache.filter(p => matchesSelectedProject(p.id, selectedProjectId));

    if (projects.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No projects found.</td></tr>`;
      return;
    }

    tbody.innerHTML = projects.map(p => {
      const budget = parseFloat(p.budget) || 0;
      const spent = parseFloat(p.spent) || 0;
      const utilPercent = budget > 0 ? ((spent / budget) * 100).toFixed(1) : '0.0';
      const isOverrun = spent > budget;
      const variance = budget - spent;

      let alertPill = '<span class="status-badge badge-completed">Healthy</span>';
      if (isOverrun) {
        alertPill = '<span class="status-badge badge-delayed">Critical Overrun</span>';
      } else if (parseFloat(utilPercent) > 85) {
        alertPill = '<span class="status-badge" style="background:#fef3c7; color:#92400e;">Warning (>85%)</span>';
      }

      return `
        <tr>
          <td>
            <div style="font-weight: 700; color: var(--text-main);">${p.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${p.client_name || p.client || ''}</div>
          </td>
          <td style="font-weight: 700;">${window.BuildTrack.formatINR(budget)}</td>
          <td style="font-weight: 700; color: ${isOverrun ? 'var(--accent-rose)' : 'var(--text-main)'};">
            ${window.BuildTrack.formatINR(spent)}
          </td>
          <td style="font-weight: 600; color: ${variance < 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)'};">
            ${window.BuildTrack.formatINR(variance)}
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="progress-bar-track" style="width: 80px;">
                <div class="progress-bar-fill ${isOverrun ? 'progress-fill-rose' : (parseFloat(utilPercent) > 80 ? 'progress-fill-orange' : 'progress-fill-blue')}" style="width: ${Math.min(100, parseFloat(utilPercent))}%;"></div>
              </div>
              <span style="font-size: 0.75rem; font-weight: 700;">${utilPercent}%</span>
            </div>
          </td>
          <td>${alertPill}</td>
        </tr>
      `;
    }).join('');
  }

  function renderExpensesTable() {
    const tbody = document.getElementById('finExpensesTableBody');
    if (!tbody) return;

    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const categoryFilter = document.getElementById('expenseCategoryFilter');
    const cat = categoryFilter ? categoryFilter.value : 'all';

    const filtered = expensesCache.filter(e => {
      const matchProj = matchesSelectedProject(e.projectId, selectedProjectId);
      const matchCat = (cat === 'all') || (e.category === cat);
      return matchProj && matchCat;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No expense vouchers found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(e => {
      const proj = projectsCache.find(p => String(p.id) === String(e.projectId));
      return `
        <tr>
          <td style="font-weight: 700;">${e.displayId}</td>
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${e.title}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${e.description || ''}</div>
          </td>
          <td>${proj ? proj.name : 'All Projects'}</td>
          <td><span class="meta-pill-item">${e.category}</span></td>
          <td style="font-weight: 800; color: var(--text-main);">${window.BuildTrack.formatINR(e.amount)}</td>
          <td>${window.BuildTrack.formatDate ? window.BuildTrack.formatDate(e.date) : e.date}</td>
          <td>
            <div class="table-actions-cell">
              <button class="btn btn-icon-only btn-outline" onclick="FinanceController.openEditExpenseModal(${e.id})" title="Edit">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn btn-icon-only btn-outline" style="color: var(--accent-rose);" onclick="FinanceController.confirmDeleteExpense(${e.id})" title="Delete">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderPaymentsTable() {
    const tbody = document.getElementById('finPaymentsTableBody');
    if (!tbody) return;

    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const payments = paymentsCache.filter(p => matchesSelectedProject(p.projectId, selectedProjectId));

    if (payments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No disbursement records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = payments.map(p => {
      const proj = projectsCache.find(prj => String(prj.id) === String(p.projectId));
      return `
        <tr>
          <td style="font-weight: 700;">${p.paymentRef}</td>
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${p.recipient}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${p.notes || ''}</div>
          </td>
          <td>${proj ? proj.name : 'Central'}</td>
          <td style="font-weight: 800; color: var(--text-main);">${window.BuildTrack.formatINR(p.amount)}</td>
          <td>${window.BuildTrack.formatDate ? window.BuildTrack.formatDate(p.date) : p.date}</td>
          <td>
            <span class="status-badge ${p.status === 'Paid' ? 'badge-completed' : (p.status === 'Pending' ? 'badge-ongoing' : 'badge-delayed')}">
              ${p.status}
            </span>
          </td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${p.paymentMethod}</td>
          <td>
            <div class="table-actions-cell">
              <button class="btn btn-sm btn-outline" onclick="FinanceController.togglePaymentStatus(${p.id})" title="Toggle Status">
                <i class="fa-solid fa-rotate"></i>
              </button>
              <button class="btn btn-icon-only btn-outline" style="color: var(--accent-rose);" onclick="FinanceController.confirmDeletePayment(${p.id})" title="Delete">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderFinanceCategoryChart() {
    const ctx = document.getElementById('financeCategoryChart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (financeChartInstance) financeChartInstance.destroy();

    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const expenses = expensesCache.filter(e => matchesSelectedProject(e.projectId, selectedProjectId));

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

  function setupEventHandlers() {
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

    const expenseForm = document.getElementById('expenseAddEditForm');
    if (expenseForm) {
      expenseForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const id = document.getElementById('expenseFormId').value;
        const title = document.getElementById('expenseFormTitle').value.trim();
        const projectId = normalizeProjectId(document.getElementById('expenseFormProject').value);
        const category = document.getElementById('expenseFormCategory').value;
        const amount = parseFloat(document.getElementById('expenseFormAmount').value) || 0;
        const date = document.getElementById('expenseFormDate').value;
        const description = document.getElementById('expenseFormDesc').value.trim();

        if (!title || amount <= 0) {
          notify('Please fill valid expense title and positive amount.', 'error');
          return;
        }

        const payload = {
          project_id: projectId,
          type: 'Expense',
          category,
          description: description ? `${title} - ${description}` : title,
          amount,
          date: date || new Date().toISOString().split('T')[0],
          status: 'Completed'
        };

        try {
          if (id) {
            await apiRequest(`/finance/${id}`, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
          } else {
            await apiRequest('/finance', {
              method: 'POST',
              body: JSON.stringify(payload)
            });
          }

          window.BuildTrack.closeModal('expenseModal');
          notify(`Expense "${title}" saved successfully!`, 'success');
          await loadFinanceData();
        } catch (error) {
          console.error(error);
          notify(error.message, 'error');
        }
      });
    }

    const paymentForm = document.getElementById('paymentAddEditForm');
    if (paymentForm) {
      paymentForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const id = document.getElementById('paymentFormId').value;
        const recipient = document.getElementById('paymentFormRecipient').value.trim();
        const projectId = normalizeProjectId(document.getElementById('paymentFormProject').value);
        const amount = parseFloat(document.getElementById('paymentFormAmount').value) || 0;
        const date = document.getElementById('paymentFormDate').value;
        const status = document.getElementById('paymentFormStatus').value;
        const paymentMethod = document.getElementById('paymentFormMethod').value;
        const notes = document.getElementById('paymentFormNotes').value.trim();

        if (!recipient || amount <= 0) {
          notify('Please provide valid recipient and payment amount.', 'error');
          return;
        }

        const payload = {
          project_id: projectId,
          payee: recipient,
          role_or_vendor: 'Vendor / Contractor',
          amount,
          payment_method: paymentMethod,
          status,
          payment_date: date || new Date().toISOString().split('T')[0],
          notes
        };

        try {
          if (id) {
            await apiRequest(`/payments/${id}`, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
          } else {
            await apiRequest('/payments', {
              method: 'POST',
              body: JSON.stringify(payload)
            });
          }

          window.BuildTrack.closeModal('paymentModal');
          notify(`Disbursement to "${recipient}" saved!`, 'success');
          await loadFinanceData();
        } catch (error) {
          console.error(error);
          notify(error.message, 'error');
        }
      });
    }
  }

  async function togglePaymentStatus(paymentId) {
    const payment = paymentsCache.find(p => Number(p.id) === Number(paymentId));
    if (!payment) return;

    const nextStatus = payment.status === 'Paid' ? 'Pending' : 'Paid';
    try {
      await apiRequest(`/payments/${paymentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      });
      notify(`Payment ${payment.paymentRef} marked as ${nextStatus}`, 'info');
      await loadFinanceData();
    } catch (error) {
      console.error(error);
      notify(error.message, 'error');
    }
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
    const e = expensesCache.find(item => Number(item.id) === Number(expenseId));
    if (!e) return;

    populateExpenseProjectDropdown();
    document.getElementById('expenseModalTitle').textContent = 'Edit Site Expense';
    document.getElementById('expenseFormId').value = e.id;
    document.getElementById('expenseFormTitle').value = e.title;
    document.getElementById('expenseFormProject').value = e.projectId || '';
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

    dropdown.innerHTML = projectsCache.map(p => `
      <option value="${p.id}">${p.name}</option>
    `).join('');

    const selected = normalizeProjectId(window.BuildTrack.currentProjectId);
    if (selected) dropdown.value = selected;
  }

  function confirmDeleteExpense(expenseId) {
    const e = expensesCache.find(item => Number(item.id) === Number(expenseId));
    if (!e) return;

    window.BuildTrack.showConfirm({
      title: `Delete Expense "${e.title}"?`,
      message: 'This expense entry will be removed from the database.',
      confirmText: 'Delete Expense',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await apiRequest(`/finance/${expenseId}`, { method: 'DELETE' });
          notify(`Expense "${e.title}" deleted.`, 'info');
          await loadFinanceData();
        } catch (error) {
          console.error(error);
          notify(error.message, 'error');
        }
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

    dropdown.innerHTML = projectsCache.map(p => `
      <option value="${p.id}">${p.name}</option>
    `).join('');

    const selected = normalizeProjectId(window.BuildTrack.currentProjectId);
    if (selected) dropdown.value = selected;
  }

  function confirmDeletePayment(paymentId) {
    const p = paymentsCache.find(item => Number(item.id) === Number(paymentId));
    if (!p) return;

    window.BuildTrack.showConfirm({
      title: `Delete Payment ${p.paymentRef}?`,
      message: 'This disbursement record will be removed from the ledger.',
      confirmText: 'Delete Payment',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await apiRequest(`/payments/${paymentId}`, { method: 'DELETE' });
          notify(`Payment ${p.paymentRef} deleted.`, 'info');
          await loadFinanceData();
        } catch (error) {
          console.error(error);
          notify(error.message, 'error');
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'finance') {
        loadFinanceData();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'finance') {
        loadFinanceData();
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
    render: loadFinanceData,
    openAddExpenseModal,
    openEditExpenseModal,
    confirmDeleteExpense,
    openAddPaymentModal,
    togglePaymentStatus,
    confirmDeletePayment
  };
})();