/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Tasks Controller: Table & Kanban Views, Status Quick-Toggles, Filters & CRUD
 */

(function () {
  'use strict';

  let currentTaskView = 'kanban'; // 'kanban' or 'table'

  function initTasks() {
    renderTasksView();
    setupEventHandlers();
  }

  function renderTasksView() {
    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const tasks = window.DataStore.getTasks(selectedProjectId);
    const projects = window.DataStore.getProjects();
    const today = new Date().toISOString().split('T')[0];

    const searchInput = document.getElementById('taskSearchInput');
    const statusFilter = document.getElementById('taskStatusFilter');
    const priorityFilter = document.getElementById('taskPriorityFilter');
    const overdueFilter = document.getElementById('taskOverdueCheckbox');

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const status = statusFilter ? statusFilter.value : 'all';
    const priority = priorityFilter ? priorityFilter.value : 'all';
    const showOnlyOverdue = overdueFilter ? overdueFilter.checked : false;

    // Filter
    const filtered = tasks.filter(t => {
      const matchQuery = (t.title && t.title.toLowerCase().includes(query)) ||
        (t.description && t.description.toLowerCase().includes(query)) ||
        (t.assignedTo && t.assignedTo.toLowerCase().includes(query));
      const matchStatus = (status === 'all') || (t.status === status);
      const matchPriority = (priority === 'all') || (t.priority === priority);
      const isOverdue = t.status !== 'completed' && t.dueDate < today;
      const matchOverdue = !showOnlyOverdue || isOverdue;

      return matchQuery && matchStatus && matchPriority && matchOverdue;
    });

    // Summary calculations
    const totalCount = tasks.length;
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const overdueCount = tasks.filter(t => t.status !== 'completed' && t.dueDate < today).length;

    // Render stats
    const statsBadge = document.getElementById('tasksCompletionStats');
    if (statsBadge) {
      statsBadge.innerHTML = `
        <span style="font-weight: 700; color: var(--accent-orange);">${completedCount}/${totalCount} Done (${completionRate}%)</span>
        ${overdueCount > 0 ? `• <span style="color: var(--accent-rose); font-weight: 700;">${overdueCount} Overdue</span>` : ''}
      `;
    }

    // Render Kanban View
    renderKanbanColumns(filtered, projects, today);

    // Render Table View
    renderTasksTable(filtered, projects, today);
  }

  function renderKanbanColumns(tasks, projects, today) {
    const colTodo = document.getElementById('kanbanStackTodo');
    const colProgress = document.getElementById('kanbanStackProgress');
    const colCompleted = document.getElementById('kanbanStackCompleted');

    if (!colTodo || !colProgress || !colCompleted) return;

    const todos = tasks.filter(t => t.status === 'todo');
    const inProgress = tasks.filter(t => t.status === 'in-progress');
    const completed = tasks.filter(t => t.status === 'completed');

    document.getElementById('kanbanCountTodo').textContent = todos.length;
    document.getElementById('kanbanCountProgress').textContent = inProgress.length;
    document.getElementById('kanbanCountCompleted').textContent = completed.length;

    colTodo.innerHTML = todos.length === 0 ? getEmptyKanbanMsg() : todos.map(t => createKanbanCard(t, projects, today)).join('');
    colProgress.innerHTML = inProgress.length === 0 ? getEmptyKanbanMsg() : inProgress.map(t => createKanbanCard(t, projects, today)).join('');
    colCompleted.innerHTML = completed.length === 0 ? getEmptyKanbanMsg() : completed.map(t => createKanbanCard(t, projects, today)).join('');
  }

  function getEmptyKanbanMsg() {
    return `<div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; border: 1px dashed var(--border-color); border-radius: var(--radius-md);">No tasks in this stage</div>`;
  }

  function createKanbanCard(task, projects, today) {
    const proj = projects.find(p => p.id === task.projectId);
    const isOverdue = task.status !== 'completed' && task.dueDate < today;

    return `
      <div class="kanban-card-item">
        <div class="kanban-card-header">
          <span class="kanban-project-pill">${proj ? proj.name.substring(0, 18) + '...' : 'Project'}</span>
          <span class="priority-badge priority-${task.priority}">${task.priority}</span>
        </div>
        <div class="kanban-card-title">${task.title}</div>
        <div class="kanban-card-desc">${task.description || ''}</div>
        
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 4px;">
          <i class="fa-solid fa-user-helmet-safety" style="color: var(--accent-orange);"></i> ${task.assignedTo || 'Unassigned'}
        </div>

        <div class="kanban-card-footer">
          <span class="kanban-due-date ${isOverdue ? 'overdue' : ''}">
            <i class="fa-regular fa-calendar-clock"></i> ${window.BuildTrack.formatDate(task.dueDate)}
            ${isOverdue ? '<strong style="margin-left: 2px;">(Overdue)</strong>' : ''}
          </span>
          <div style="display: flex; gap: 4px;">
            <!-- Quick Status Cycle Button -->
            <button class="btn btn-sm btn-outline" onclick="TasksController.cycleStatus('${task.id}')" title="Move to Next Status">
              <i class="fa-solid fa-arrow-right-arrow-left"></i>
            </button>
            <button class="btn btn-sm btn-outline" onclick="TasksController.openEditModal('${task.id}')" title="Edit">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-sm btn-outline" style="color: var(--accent-rose);" onclick="TasksController.confirmDelete('${task.id}')" title="Delete">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderTasksTable(tasks, projects, today) {
    const tbody = document.getElementById('tasksTableBody');
    if (!tbody) return;

    if (tasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching tasks found.</td></tr>`;
      return;
    }

    tbody.innerHTML = tasks.map(t => {
      const proj = projects.find(p => p.id === t.projectId);
      const isOverdue = t.status !== 'completed' && t.dueDate < today;

      return `
        <tr>
          <td style="font-weight: 700;">${t.id}</td>
          <td>
            <div style="font-weight: 600; color: var(--text-main);">${t.title}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${t.description ? t.description.substring(0, 50) + '...' : ''}</div>
          </td>
          <td>${proj ? proj.name : 'General'}</td>
          <td>${t.assignedTo}</td>
          <td>
            <span style="${isOverdue ? 'color: var(--accent-rose); font-weight: 700;' : ''}">
              ${window.BuildTrack.formatDate(t.dueDate)}
              ${isOverdue ? ' (Overdue)' : ''}
            </span>
          </td>
          <td><span class="priority-badge priority-${t.priority}">${t.priority}</span></td>
          <td>
            <select class="filter-pill-select" style="font-size: 0.78rem; padding: 2px 6px;" onchange="TasksController.updateStatusDirect('${t.id}', this.value)">
              <option value="todo" ${t.status === 'todo' ? 'selected' : ''}>To Do</option>
              <option value="in-progress" ${t.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
              <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>Completed</option>
            </select>
          </td>
          <td>
            <div class="table-actions-cell">
              <button class="btn btn-icon-only btn-outline" onclick="TasksController.openEditModal('${t.id}')" title="Edit">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn btn-icon-only btn-outline" style="color: var(--accent-rose);" onclick="TasksController.confirmDelete('${t.id}')" title="Delete">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function setupEventHandlers() {
    const searchInput = document.getElementById('taskSearchInput');
    const statusFilter = document.getElementById('taskStatusFilter');
    const priorityFilter = document.getElementById('taskPriorityFilter');
    const overdueFilter = document.getElementById('taskOverdueCheckbox');
    const viewKanbanBtn = document.getElementById('tasksViewKanbanBtn');
    const viewTableBtn = document.getElementById('tasksViewTableBtn');
    const taskForm = document.getElementById('taskAddEditForm');

    if (searchInput) searchInput.addEventListener('input', renderTasksView);
    if (statusFilter) statusFilter.addEventListener('change', renderTasksView);
    if (priorityFilter) priorityFilter.addEventListener('change', renderTasksView);
    if (overdueFilter) overdueFilter.addEventListener('change', renderTasksView);

    if (viewKanbanBtn && viewTableBtn) {
      viewKanbanBtn.addEventListener('click', () => {
        currentTaskView = 'kanban';
        viewKanbanBtn.classList.add('active');
        viewTableBtn.classList.remove('active');
        document.getElementById('tasksKanbanContainer').style.display = 'grid';
        document.getElementById('tasksTableContainer').style.display = 'none';
      });

      viewTableBtn.addEventListener('click', () => {
        currentTaskView = 'table';
        viewTableBtn.classList.add('active');
        viewKanbanBtn.classList.remove('active');
        document.getElementById('tasksKanbanContainer').style.display = 'none';
        document.getElementById('tasksTableContainer').style.display = 'block';
      });
    }

    if (taskForm) {
      taskForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const id = document.getElementById('taskFormId').value;
        const title = document.getElementById('taskFormTitle').value.trim();
        const projectId = document.getElementById('taskFormProject').value;
        const assignedTo = document.getElementById('taskFormAssignee').value.trim();
        const startDate = document.getElementById('taskFormStartDate').value;
        const dueDate = document.getElementById('taskFormDueDate').value;
        const priority = document.getElementById('taskFormPriority').value;
        const status = document.getElementById('taskFormStatus').value;
        const description = document.getElementById('taskFormDesc').value.trim();

        if (!title || !projectId) {
          window.BuildTrack.showToast('Please enter task title and select a project.', 'error');
          return;
        }

        const taskData = {
          id: id || undefined,
          title,
          projectId,
          assignedTo: assignedTo || 'Site Crew',
          startDate,
          dueDate,
          priority,
          status,
          description
        };

        window.DataStore.saveTask(taskData);
        window.BuildTrack.closeModal('taskModal');
        window.BuildTrack.showToast(`Task "${title}" saved successfully!`, 'success');
        renderTasksView();
      });
    }
  }

  function cycleStatus(taskId) {
    const task = window.DataStore.getTask(taskId);
    if (!task) return;

    const cycle = { 'todo': 'in-progress', 'in-progress': 'completed', 'completed': 'todo' };
    task.status = cycle[task.status] || 'todo';
    window.DataStore.saveTask(task);
    window.BuildTrack.showToast(`Task updated to "${task.status.toUpperCase()}"`, 'info', 1500);
    renderTasksView();
  }

  function updateStatusDirect(taskId, newStatus) {
    const task = window.DataStore.getTask(taskId);
    if (!task) return;
    task.status = newStatus;
    window.DataStore.saveTask(task);
    window.BuildTrack.showToast(`Task status updated to ${newStatus}`, 'info', 1500);
    renderTasksView();
  }

  function openAddModal() {
    const form = document.getElementById('taskAddEditForm');
    if (form) form.reset();

    document.getElementById('taskModalTitle').textContent = 'Add Construction Task';
    document.getElementById('taskFormId').value = '';

    // Populate project dropdown
    populateTaskProjectDropdown();
    window.BuildTrack.openModal('taskModal');
  }

  function openEditModal(taskId) {
    const t = window.DataStore.getTask(taskId);
    if (!t) return;

    populateTaskProjectDropdown();
    document.getElementById('taskModalTitle').textContent = 'Edit Task';
    document.getElementById('taskFormId').value = t.id;
    document.getElementById('taskFormTitle').value = t.title;
    document.getElementById('taskFormProject').value = t.projectId;
    document.getElementById('taskFormAssignee').value = t.assignedTo;
    document.getElementById('taskFormStartDate').value = t.startDate || '';
    document.getElementById('taskFormDueDate').value = t.dueDate || '';
    document.getElementById('taskFormPriority').value = t.priority;
    document.getElementById('taskFormStatus').value = t.status;
    document.getElementById('taskFormDesc').value = t.description || '';

    window.BuildTrack.openModal('taskModal');
  }

  function populateTaskProjectDropdown() {
    const dropdown = document.getElementById('taskFormProject');
    if (!dropdown) return;

    const projects = window.DataStore.getProjects();
    dropdown.innerHTML = projects.map(p => `
      <option value="${p.id}">${p.name}</option>
    `).join('');

    if (window.BuildTrack.currentProjectId && window.BuildTrack.currentProjectId !== 'all') {
      dropdown.value = window.BuildTrack.currentProjectId;
    }
  }

  function confirmDelete(taskId) {
    const t = window.DataStore.getTask(taskId);
    if (!t) return;

    window.BuildTrack.showConfirm({
      title: `Delete Task "${t.title}"?`,
      message: 'This task will be removed permanently.',
      confirmText: 'Delete Task',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.DataStore.deleteTask(taskId);
        window.BuildTrack.showToast(`Task "${t.title}" deleted.`, 'info');
        renderTasksView();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'tasks') {
        renderTasksView();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'tasks') {
        renderTasksView();
      }
    });

    window.addEventListener('buildtrack:projectfilterchanged', () => {
      if (window.BuildTrack.currentView === 'tasks') {
        renderTasksView();
      }
    });

    initTasks();
  });

  window.TasksController = {
    render: renderTasksView,
    openAddModal: openAddModal,
    openEditModal: openEditModal,
    cycleStatus: cycleStatus,
    updateStatusDirect: updateStatusDirect,
    confirmDelete: confirmDelete
  };
})();
