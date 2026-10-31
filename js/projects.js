/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Projects Controller: Cards & Table Views, Filter/Sort, CRUD, & Comprehensive Deep-Dive Modal
 */

(function () {
  'use strict';

  let currentViewMode = 'cards'; // 'cards' or 'table'
  let activeDetailsProjectId = null;

  function initProjects() {
    renderProjectsList();
    setupEventHandlers();
  }

  // --- RENDER PROJECTS (CARDS & TABLE) ---
  function renderProjectsList() {
    const projects = window.BuildTrack.getVisibleProjects();
    const searchInput = document.getElementById('projectSearchInput');
    const statusFilter = document.getElementById('projectStatusFilter');
    const sortFilter = document.getElementById('projectSortFilter');

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const status = statusFilter ? statusFilter.value : 'all';
    const sortBy = sortFilter ? sortFilter.value : 'name';

    // Filter
    let filtered = projects.filter(p => {
      const matchQuery = (p.name && p.name.toLowerCase().includes(query)) ||
                         (p.client && p.client.toLowerCase().includes(query)) ||
                         (p.location && p.location.toLowerCase().includes(query)) ||
                         (p.manager && p.manager.toLowerCase().includes(query));
      const matchStatus = (status === 'all') || (p.status === status);
      return matchQuery && matchStatus;
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'budget') return (b.budget || 0) - (a.budget || 0);
      if (sortBy === 'deadline') return new Date(a.expectedCompletionDate) - new Date(b.expectedCompletionDate);
      if (sortBy === 'progress') return (b.progress || 0) - (a.progress || 0);
      return 0;
    });

    const cardsContainer = document.getElementById('projectsCardsContainer');
    const tableContainer = document.getElementById('projectsTableContainer');
    const countBadge = document.getElementById('projectsCountBadge');

    if (countBadge) countBadge.textContent = `${filtered.length} Projects`;

    // Render Cards View
    if (cardsContainer) {
      if (filtered.length === 0) {
        cardsContainer.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 3rem; text-align: center; color: var(--text-muted);">
            <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 1rem; opacity: 0.5;"></i>
            <h3>No projects found</h3>
            <p style="font-size: 0.85rem; margin-top: 0.5rem;">Try adjusting your search query or status filter.</p>
          </div>
        `;
      } else {
        cardsContainer.innerHTML = filtered.map(p => {
          const utilPercent = ((p.spent / p.budget) * 100).toFixed(1);
          const isOverrun = p.spent > p.budget;
          
          return `
            <div class="project-box-card">
              <div class="project-card-top">
                <div>
                  <span class="status-badge badge-${p.status}">${p.status}</span>
                  <h3 class="project-name-heading" style="margin-top: 0.4rem;">${p.name}</h3>
                </div>
                <div class="dropdown-wrap">
                  <button class="btn btn-icon-only btn-outline" onclick="ProjectsController.openEditModal('${p.id}')" title="Edit Project">
                    <i class="fa-solid fa-pen-to-square"></i>
                  </button>
                  <button class="btn btn-icon-only btn-outline" style="color: var(--accent-rose); margin-left: 4px;" onclick="ProjectsController.confirmDelete('${p.id}')" title="Delete Project">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>

              <div class="project-client-sub">
                <i class="fa-solid fa-building-columns" style="color: var(--accent-orange);"></i> ${p.client}
              </div>

              <div class="project-meta-pills">
                <span class="meta-pill-item"><i class="fa-solid fa-location-dot"></i> ${p.location}</span>
                <span class="meta-pill-item"><i class="fa-solid fa-user-tie"></i> ${p.manager}</span>
                <span class="meta-pill-item"><i class="fa-regular fa-calendar-check"></i> ${window.BuildTrack.formatDate(p.expectedCompletionDate)}</span>
              </div>

              <!-- Completion Progress Bar -->
              <div style="margin: 0.5rem 0;">
                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.3rem;">
                  <span>Construction Progress</span>
                  <span style="color: var(--accent-orange);">${p.progress}%</span>
                </div>
                <div class="progress-bar-track">
                  <div class="progress-bar-fill progress-fill-orange" style="width: ${p.progress}%;"></div>
                </div>
              </div>

              <!-- Financials Summary -->
              <div class="project-financials-summary">
                <div>
                  <div class="financial-metric-label">Approved Budget</div>
                  <div class="financial-metric-val">${window.BuildTrack.formatINR(p.budget)}</div>
                </div>
                <div>
                  <div class="financial-metric-label">Actual Spent (${utilPercent}%)</div>
                  <div class="financial-metric-val" style="color: ${isOverrun ? 'var(--accent-rose)' : 'var(--text-main)'};">
                    ${window.BuildTrack.formatINR(p.spent)}
                  </div>
                </div>
              </div>

              <div style="margin-top: auto; padding-top: 0.75rem; border-top: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 0.75rem; color: var(--text-muted);">
                  ${isOverrun ? '<span style="color: var(--accent-rose); font-weight: 700;"><i class="fa-solid fa-circle-exclamation"></i> Budget Overrun</span>' : '<span style="color: var(--accent-emerald);"><i class="fa-solid fa-circle-check"></i> On Budget</span>'}
                </span>
                <button class="btn btn-sm btn-outline" onclick="ProjectsController.openProjectDetails('${p.id}')">
                  View Full Details <i class="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Render Table View
    if (tableContainer) {
      const tbody = tableContainer.querySelector('tbody');
      if (tbody) {
        tbody.innerHTML = filtered.map(p => `
          <tr>
            <td style="font-weight: 700;">${p.id}</td>
            <td>
              <div style="font-weight: 700; color: var(--text-main);">${p.name}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${p.client} • ${p.location}</div>
            </td>
            <td><span class="status-badge badge-${p.status}">${p.status}</span></td>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div class="progress-bar-track" style="width: 70px;">
                  <div class="progress-bar-fill progress-fill-orange" style="width: ${p.progress}%;"></div>
                </div>
                <span style="font-size: 0.75rem; font-weight: 700;">${p.progress}%</span>
              </div>
            </td>
            <td style="font-weight: 700;">${window.BuildTrack.formatINR(p.budget)}</td>
            <td style="font-weight: 600;">${window.BuildTrack.formatINR(p.spent)}</td>
            <td style="font-size: 0.8rem; color: var(--text-muted);">${window.BuildTrack.formatDate(p.expectedCompletionDate)}</td>
            <td>
              <div class="table-actions-cell">
                <button class="btn btn-icon-only btn-outline" onclick="ProjectsController.openProjectDetails('${p.id}')" title="Details">
                  <i class="fa-solid fa-eye"></i>
                </button>
                <button class="btn btn-icon-only btn-outline" onclick="ProjectsController.openEditModal('${p.id}')" title="Edit">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-icon-only btn-outline" style="color: var(--accent-rose);" onclick="ProjectsController.confirmDelete('${p.id}')" title="Delete">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `).join('');
      }
    }
  }

  // --- SETUP EVENT LISTENERS & FILTER CONTROLS ---
  function setupEventHandlers() {
    const searchInput = document.getElementById('projectSearchInput');
    const statusFilter = document.getElementById('projectStatusFilter');
    const sortFilter = document.getElementById('projectSortFilter');
    const viewCardsBtn = document.getElementById('projectsViewCardsBtn');
    const viewTableBtn = document.getElementById('projectsViewTableBtn');
    const projectForm = document.getElementById('projectAddEditForm');

    if (searchInput) searchInput.addEventListener('input', renderProjectsList);
    if (statusFilter) statusFilter.addEventListener('change', renderProjectsList);
    if (sortFilter) sortFilter.addEventListener('change', renderProjectsList);

    // View switcher
    if (viewCardsBtn && viewTableBtn) {
      viewCardsBtn.addEventListener('click', () => {
        currentViewMode = 'cards';
        viewCardsBtn.classList.add('active');
        viewTableBtn.classList.remove('active');
        document.getElementById('projectsCardsContainer').style.display = 'grid';
        document.getElementById('projectsTableContainer').style.display = 'none';
      });

      viewTableBtn.addEventListener('click', () => {
        currentViewMode = 'table';
        viewTableBtn.classList.add('active');
        viewCardsBtn.classList.remove('active');
        document.getElementById('projectsCardsContainer').style.display = 'none';
        document.getElementById('projectsTableContainer').style.display = 'block';
      });
    }

    // Add / Edit Form submission
    if (projectForm) {
      projectForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const id = document.getElementById('projectFormId').value;
        const name = document.getElementById('projectFormName').value.trim();
        const client = document.getElementById('projectFormClient').value.trim();
        const location = document.getElementById('projectFormLocation').value.trim();
        const manager = document.getElementById('projectFormManager').value.trim();
        const startDate = document.getElementById('projectFormStartDate').value;
        const expectedCompletionDate = document.getElementById('projectFormEndDate').value;
        const budget = parseFloat(document.getElementById('projectFormBudget').value) || 0;
        const progress = parseInt(document.getElementById('projectFormProgress').value, 10) || 0;
        const status = document.getElementById('projectFormStatus').value;
        const description = document.getElementById('projectFormDesc').value.trim();

        if (budget <= 0) {
          window.BuildTrack.showToast('Please enter a valid authorized project budget.', 'error');
          return;
        }

        if (startDate && expectedCompletionDate && startDate > expectedCompletionDate) {
          window.BuildTrack.showToast('Completion date must be after the start date.', 'error');
          return;
        }

        const projectData = {
          id: id || undefined,
          name,
          client,
          location,
          manager,
          startDate,
          expectedCompletionDate,
          budget,
          progress: Math.min(100, Math.max(0, progress)),
          status,
          description,
          spent: id ? (window.DataStore.getProject(id)?.spent || 0) : 0
        };

        window.DataStore.saveProject(projectData);
        window.BuildTrack.closeModal('projectModal');
        window.BuildTrack.showToast(`Project "${name}" saved successfully!`, 'success');
        renderProjectsList();
      });
    }

    // Project Details Subtabs Navigation
    document.querySelectorAll('.project-subtab-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.project-subtab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.project-subtab-content').forEach(c => c.style.display = 'none');

        this.classList.add('active');
        const tab = this.getAttribute('data-subtab');
        const content = document.getElementById(`subtabContent-${tab}`);
        if (content) content.style.display = 'block';

        if (activeDetailsProjectId) {
          renderProjectSubtabContent(activeDetailsProjectId, tab);
        }
      });
    });
  }

  // --- PROJECT DETAILS DEEP DIVE MODAL ---
  function openProjectDetails(projectId) {
    if (!window.BuildTrack.canAccessProject(projectId)) {
      window.BuildTrack.showToast('This project is not assigned to the selected client.', 'warning');
      return;
    }
    const project = window.DataStore.getProject(projectId);
    if (!project) return;

    activeDetailsProjectId = projectId;
    document.getElementById('detailsProjectTitle').textContent = project.name;
    document.getElementById('detailsProjectClient').textContent = `${project.client} • ${project.location}`;

    // Reset to first tab
    const firstTabBtn = document.querySelector('.project-subtab-btn[data-subtab="overview"]');
    if (firstTabBtn) firstTabBtn.click();

    window.BuildTrack.openModal('projectDetailsModal');
  }

  function renderProjectSubtabContent(projectId, tab) {
    if (!window.BuildTrack.canAccessProject(projectId)) return;
    const project = window.DataStore.getProject(projectId);
    if (!project) return;

    if (tab === 'overview') {
      const utilPercent = ((project.spent / project.budget) * 100).toFixed(1);
      const rem = project.budget - project.spent;
      document.getElementById('subtabContent-overview').innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div style="background-color: var(--bg-surface-alt); padding: 1rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Project Manager</div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--text-main); margin-top: 2px;">${project.manager}</div>
          </div>
          <div style="background-color: var(--bg-surface-alt); padding: 1rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Duration Timeline</div>
            <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main); margin-top: 2px;">
              ${window.BuildTrack.formatDate(project.startDate)} → ${window.BuildTrack.formatDate(project.expectedCompletionDate)}
            </div>
          </div>
          <div style="background-color: var(--bg-surface-alt); padding: 1rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Budget Utilization</div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--accent-orange); margin-top: 2px;">${utilPercent}% Spent</div>
          </div>
          <div style="background-color: var(--bg-surface-alt); padding: 1rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Remaining Balance</div>
            <div style="font-size: 1rem; font-weight: 700; color: ${rem < 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)'}; margin-top: 2px;">
              ${window.BuildTrack.formatINR(rem)}
            </div>
          </div>
        </div>
        <div style="margin-bottom: 1.5rem;">
          <h4 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 0.4rem;">Project Scope & Engineering Specifications</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6;">${project.description}</p>
        </div>
      `;
    } else if (tab === 'tasks') {
      const tasks = window.DataStore.getTasks(projectId);
      document.getElementById('subtabContent-tasks').innerHTML = tasks.length === 0 ? 
        '<p style="color: var(--text-muted); padding: 1rem; text-align: center;">No tasks assigned to this project yet.</p>' :
        `<div class="table-responsive-wrapper"><table class="data-table-custom">
          <thead><tr><th>Task</th><th>Assignee</th><th>Due Date</th><th>Priority</th><th>Status</th></tr></thead>
          <tbody>${tasks.map(t => `
            <tr>
              <td style="font-weight: 600;">${t.title}</td>
              <td>${t.assignedTo}</td>
              <td>${window.BuildTrack.formatDate(t.dueDate)}</td>
              <td><span class="priority-badge priority-${t.priority}">${t.priority}</span></td>
              <td><span class="status-badge badge-${t.status === 'in-progress' ? 'ongoing' : t.status}">${t.status}</span></td>
            </tr>
          `).join('')}</tbody>
        </table></div>`;
    } else if (tab === 'expenses') {
      const expenses = window.DataStore.getExpenses(projectId);
      document.getElementById('subtabContent-expenses').innerHTML = expenses.length === 0 ?
        '<p style="color: var(--text-muted); padding: 1rem; text-align: center;">No expenses recorded yet.</p>' :
        `<div class="table-responsive-wrapper"><table class="data-table-custom">
          <thead><tr><th>Title</th><th>Category</th><th>Amount</th><th>Date</th><th>Mode</th></tr></thead>
          <tbody>${expenses.map(e => `
            <tr>
              <td style="font-weight: 600;">${e.title}</td>
              <td><span class="priority-badge priority-low">${e.category}</span></td>
              <td style="font-weight: 700;">${window.BuildTrack.formatINR(e.amount)}</td>
              <td>${window.BuildTrack.formatDate(e.date)}</td>
              <td style="font-size: 0.8rem; color: var(--text-muted);">${e.paymentMethod}</td>
            </tr>
          `).join('')}</tbody>
        </table></div>`;
    } else if (tab === 'labour') {
      const labour = window.DataStore.getLabour(projectId);
      document.getElementById('subtabContent-labour').innerHTML = labour.length === 0 ?
        '<p style="color: var(--text-muted); padding: 1rem; text-align: center;">No labourers assigned to this site.</p>' :
        `<div class="table-responsive-wrapper"><table class="data-table-custom">
          <thead><tr><th>ID</th><th>Name</th><th>Skill</th><th>Daily Wage</th><th>Phone</th><th>Status</th></tr></thead>
          <tbody>${labour.map(w => `
            <tr>
              <td style="font-weight: 700;">${w.id}</td>
              <td style="font-weight: 600;">${w.name}</td>
              <td>${w.skill}</td>
              <td style="font-weight: 700;">${window.BuildTrack.formatINR(w.dailyWage)}/day</td>
              <td>${w.phone}</td>
              <td><span class="status-badge badge-ongoing">${w.availability}</span></td>
            </tr>
          `).join('')}</tbody>
        </table></div>`;
    } else if (tab === 'materials') {
      const materials = window.DataStore.getMaterials(projectId);
      document.getElementById('subtabContent-materials').innerHTML = materials.length === 0 ?
        '<p style="color: var(--text-muted); padding: 1rem; text-align: center;">No materials assigned.</p>' :
        `<div class="table-responsive-wrapper"><table class="data-table-custom">
          <thead><tr><th>Material</th><th>Category</th><th>Available Stock</th><th>Unit Cost</th><th>Supplier</th></tr></thead>
          <tbody>${materials.map(m => `
            <tr>
              <td style="font-weight: 600;">${m.name}</td>
              <td>${m.category}</td>
              <td style="font-weight: 700;">${m.quantity} ${m.unit}</td>
              <td>${window.BuildTrack.formatINR(m.unitPrice)}</td>
              <td>${m.supplier}</td>
            </tr>
          `).join('')}</tbody>
        </table></div>`;
    } else if (tab === 'payments') {
      const payments = window.DataStore.getPayments(projectId);
      document.getElementById('subtabContent-payments').innerHTML = payments.length === 0 ?
        '<p style="color: var(--text-muted); padding: 1rem; text-align: center;">No payments recorded.</p>' :
        `<div class="table-responsive-wrapper"><table class="data-table-custom">
          <thead><tr><th>Ref</th><th>Recipient</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>${payments.map(p => `
            <tr>
              <td style="font-weight: 700;">${p.paymentRef}</td>
              <td>${p.recipient}</td>
              <td style="font-weight: 700;">${window.BuildTrack.formatINR(p.amount)}</td>
              <td>${window.BuildTrack.formatDate(p.date)}</td>
              <td><span class="status-badge ${p.status === 'Paid' ? 'badge-completed' : 'badge-delayed'}">${p.status}</span></td>
            </tr>
          `).join('')}</tbody>
        </table></div>`;
    } else if (tab === 'progress') {
      const reports = window.DataStore.getProgressReports(projectId);
      document.getElementById('subtabContent-progress').innerHTML = reports.length === 0 ?
        '<p style="color: var(--text-muted); padding: 1rem; text-align: center;">No daily progress logs filed for this project.</p>' :
        reports.map(r => `
          <div style="background-color: var(--bg-surface-alt); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 0.75rem; border-left: 3px solid var(--accent-orange);">
            <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 4px;">
              <span><strong>Reported by:</strong> ${r.reportedBy}</span>
              <span>${window.BuildTrack.formatDate(r.date)}</span>
            </div>
            <p style="font-size: 0.85rem; font-weight: 500; color: var(--text-main); margin-bottom: 6px;">${r.workCompleted}</p>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              <strong>Materials:</strong> ${r.materialsConsumed} | <strong>Workers:</strong> ${r.workersPresent}
            </div>
          </div>
        `).join('');
    }
  }

  // --- CRUD MODALS ---
  function openAddModal() {
    const form = document.getElementById('projectAddEditForm');
    if (form) form.reset();
    document.getElementById('projectModalTitle').textContent = 'Add New Construction Project';
    document.getElementById('projectFormId').value = '';
    window.BuildTrack.openModal('projectModal');
  }

  function openEditModal(projectId) {
    const p = window.DataStore.getProject(projectId);
    if (!p) return;

    document.getElementById('projectModalTitle').textContent = 'Edit Project Details';
    document.getElementById('projectFormId').value = p.id;
    document.getElementById('projectFormName').value = p.name;
    document.getElementById('projectFormClient').value = p.client;
    document.getElementById('projectFormLocation').value = p.location;
    document.getElementById('projectFormManager').value = p.manager;
    document.getElementById('projectFormStartDate').value = p.startDate;
    document.getElementById('projectFormEndDate').value = p.expectedCompletionDate;
    document.getElementById('projectFormBudget').value = p.budget;
    document.getElementById('projectFormProgress').value = p.progress;
    document.getElementById('projectFormStatus').value = p.status;
    document.getElementById('projectFormDesc').value = p.description || '';

    window.BuildTrack.openModal('projectModal');
  }

  function confirmDelete(projectId) {
    const p = window.DataStore.getProject(projectId);
    if (!p) return;

    window.BuildTrack.showConfirm({
      title: `Delete Project "${p.name}"?`,
      message: 'This will remove the project and its references from the local dashboard. This action cannot be reversed.',
      confirmText: 'Delete Project',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.DataStore.deleteProject(projectId);
        window.BuildTrack.showToast(`Project "${p.name}" deleted.`, 'info');
        renderProjectsList();
      }
    });
  }

  // Bind to lifecycle
  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'projects') {
        renderProjectsList();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'projects') {
        renderProjectsList();
      }
    });

    window.addEventListener('buildtrack:clientchanged', () => {
      if (window.BuildTrack.currentView === 'projects') renderProjectsList();
    });

    initProjects();
  });

  window.ProjectsController = {
    render: renderProjectsList,
    openAddModal: openAddModal,
    openEditModal: openEditModal,
    openProjectDetails: openProjectDetails,
    confirmDelete: confirmDelete
  };
})();
