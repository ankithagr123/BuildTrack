/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Labour Controller: Worker Directory, Daily Attendance Marking, Wage Cost Calculation & History
 */

(function () {
  'use strict';

  let selectedAttendanceDate = new Date().toISOString().split('T')[0];

  function initLabour() {
    setupAttendanceDateInput();
    renderLabourView();
    setupEventHandlers();
  }

  function setupAttendanceDateInput() {
    const dateInput = document.getElementById('attendanceDatePicker');
    if (dateInput) {
      dateInput.value = selectedAttendanceDate;
      dateInput.addEventListener('change', function () {
        selectedAttendanceDate = this.value;
        renderLabourView();
      });
    }
  }

  function renderLabourView() {
    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const labour = window.DataStore.getLabour(selectedProjectId);
    const projects = window.DataStore.getProjects();
    const attendance = window.DataStore.getAttendance(selectedAttendanceDate);

    const searchInput = document.getElementById('labourSearchInput');
    const skillFilter = document.getElementById('labourSkillFilter');

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const skill = skillFilter ? skillFilter.value : 'all';

    // Filter
    const filtered = labour.filter(w => {
      const matchQuery = (w.name && w.name.toLowerCase().includes(query)) ||
                         (w.id && w.id.toLowerCase().includes(query)) ||
                         (w.phone && w.phone.includes(query));
      const matchSkill = (skill === 'all') || (w.skill === skill);
      return matchQuery && matchSkill;
    });

    // 1. Calculate Attendance Statistics & Daily Wage Payout
    let presentCount = 0, absentCount = 0, leaveCount = 0;
    let estimatedCost = 0;

    labour.forEach(w => {
      const status = attendance[w.id] || (w.availability === 'On Site' ? 'present' : 'absent');
      if (status === 'present') {
        presentCount++;
        estimatedCost += (parseFloat(w.dailyWage) || 0);
      } else if (status === 'leave') {
        leaveCount++;
      } else {
        absentCount++;
      }
    });

    // Update Attendance Summary Box
    setElText('attTotalWorkers', labour.length);
    setElText('attPresentWorkers', presentCount);
    setElText('attAbsentWorkers', absentCount);
    setElText('attLeaveWorkers', leaveCount);
    setElText('attDailyWagePayout', window.BuildTrack.formatINR(estimatedCost));

    // 2. Render Workers Table
    const tbody = document.getElementById('labourTableBody');
    if (tbody) {
      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No workers found matching your filter criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(w => {
        const proj = projects.find(p => p.id === w.assignedProjectId);
        const currentAtt = attendance[w.id] || (w.availability === 'On Site' ? 'present' : 'absent');

        return `
          <tr>
            <td style="font-weight: 700;">${w.id}</td>
            <td>
              <div style="font-weight: 700; color: var(--text-main);">${w.name}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${w.phone || 'No Phone'}</div>
            </td>
            <td><span class="meta-pill-item">${w.skill}</span></td>
            <td>${proj ? proj.name : '<span style="color: var(--text-muted);">Unassigned</span>'}</td>
            <td style="font-weight: 700; color: var(--text-main);">${window.BuildTrack.formatINR(w.dailyWage)}</td>
            <td>
              <!-- Attendance Quick Toggle Button Group -->
              <div style="display: inline-flex; border: 1px solid var(--border-color); border-radius: var(--radius-sm); overflow: hidden;">
                <button type="button" 
                  class="btn btn-sm ${currentAtt === 'present' ? 'btn-primary' : 'btn-outline'}" 
                  style="${currentAtt === 'present' ? 'background-color: var(--accent-emerald); border-color: var(--accent-emerald); color: #fff;' : ''}"
                  onclick="LabourController.setAttendance('${w.id}', 'present')">
                  P
                </button>
                <button type="button" 
                  class="btn btn-sm ${currentAtt === 'absent' ? 'btn-primary' : 'btn-outline'}" 
                  style="${currentAtt === 'absent' ? 'background-color: var(--accent-rose); border-color: var(--accent-rose); color: #fff;' : ''}"
                  onclick="LabourController.setAttendance('${w.id}', 'absent')">
                  A
                </button>
                <button type="button" 
                  class="btn btn-sm ${currentAtt === 'leave' ? 'btn-primary' : 'btn-outline'}" 
                  style="${currentAtt === 'leave' ? 'background-color: var(--accent-amber); border-color: var(--accent-amber); color: #fff;' : ''}"
                  onclick="LabourController.setAttendance('${w.id}', 'leave')">
                  L
                </button>
              </div>
            </td>
            <td>
              <div class="table-actions-cell">
                <button class="btn btn-icon-only btn-outline" onclick="LabourController.openEditModal('${w.id}')" title="Edit Worker">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-icon-only btn-outline" style="color: var(--accent-rose);" onclick="LabourController.confirmDelete('${w.id}')" title="Remove Worker">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setAttendance(workerId, status) {
    const attendance = window.DataStore.getAttendance(selectedAttendanceDate);
    attendance[workerId] = status;
    window.DataStore.saveAttendance(selectedAttendanceDate, attendance);
    renderLabourView();
  }

  function markAllPresent() {
    const labour = window.DataStore.getLabour();
    const attendance = window.DataStore.getAttendance(selectedAttendanceDate);
    labour.forEach(w => {
      attendance[w.id] = 'present';
    });
    window.DataStore.saveAttendance(selectedAttendanceDate, attendance);
    window.BuildTrack.showToast(`Marked all ${labour.length} workers as Present for ${selectedAttendanceDate}`, 'success');
    renderLabourView();
  }

  function setupEventHandlers() {
    const searchInput = document.getElementById('labourSearchInput');
    const skillFilter = document.getElementById('labourSkillFilter');
    const workerForm = document.getElementById('workerAddEditForm');
    const markAllBtn = document.getElementById('markAllPresentBtn');

    if (searchInput) searchInput.addEventListener('input', renderLabourView);
    if (skillFilter) skillFilter.addEventListener('change', renderLabourView);
    if (markAllBtn) markAllBtn.addEventListener('click', markAllPresent);

    if (workerForm) {
      workerForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const id = document.getElementById('workerFormId').value;
        const name = document.getElementById('workerFormName').value.trim();
        const skill = document.getElementById('workerFormSkill').value;
        const phone = document.getElementById('workerFormPhone').value.trim();
        const projectId = document.getElementById('workerFormProject').value;
        const dailyWage = parseFloat(document.getElementById('workerFormWage').value) || 0;
        const availability = document.getElementById('workerFormAvailability').value;

        if (!name || dailyWage <= 0) {
          window.BuildTrack.showToast('Please enter a valid worker name and daily wage.', 'error');
          return;
        }

        const workerData = {
          id: id || undefined,
          name,
          skill,
          phone: phone || '+91 90000 00000',
          assignedProjectId: projectId,
          dailyWage,
          availability,
          status: 'active'
        };

        window.DataStore.saveWorker(workerData);
        window.BuildTrack.closeModal('workerModal');
        window.BuildTrack.showToast(`Worker "${name}" profile saved!`, 'success');
        renderLabourView();
      });
    }
  }

  function openAddModal() {
    const form = document.getElementById('workerAddEditForm');
    if (form) form.reset();

    document.getElementById('workerModalTitle').textContent = 'Add Worker / Craftsman';
    document.getElementById('workerFormId').value = '';
    
    populateWorkerProjectDropdown();
    window.BuildTrack.openModal('workerModal');
  }

  function openEditModal(workerId) {
    const w = window.DataStore.getWorker(workerId);
    if (!w) return;

    populateWorkerProjectDropdown();
    document.getElementById('workerModalTitle').textContent = 'Edit Worker Profile';
    document.getElementById('workerFormId').value = w.id;
    document.getElementById('workerFormName').value = w.name;
    document.getElementById('workerFormSkill').value = w.skill;
    document.getElementById('workerFormPhone').value = w.phone;
    document.getElementById('workerFormProject').value = w.assignedProjectId;
    document.getElementById('workerFormWage').value = w.dailyWage;
    document.getElementById('workerFormAvailability').value = w.availability;

    window.BuildTrack.openModal('workerModal');
  }

  function populateWorkerProjectDropdown() {
    const dropdown = document.getElementById('workerFormProject');
    if (!dropdown) return;

    const projects = window.DataStore.getProjects();
    dropdown.innerHTML = projects.map(p => `
      <option value="${p.id}">${p.name}</option>
    `).join('');

    if (window.BuildTrack.currentProjectId && window.BuildTrack.currentProjectId !== 'all') {
      dropdown.value = window.BuildTrack.currentProjectId;
    }
  }

  function confirmDelete(workerId) {
    const w = window.DataStore.getWorker(workerId);
    if (!w) return;

    window.BuildTrack.showConfirm({
      title: `Remove Worker "${w.name}"?`,
      message: 'Worker details and attendance history for this employee will be removed.',
      confirmText: 'Remove Worker',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.DataStore.deleteWorker(workerId);
        window.BuildTrack.showToast(`Worker "${w.name}" removed.`, 'info');
        renderLabourView();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'labour') {
        renderLabourView();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'labour') {
        renderLabourView();
      }
    });

    window.addEventListener('buildtrack:projectfilterchanged', () => {
      if (window.BuildTrack.currentView === 'labour') {
        renderLabourView();
      }
    });

    initLabour();
  });

  window.LabourController = {
    render: renderLabourView,
    openAddModal: openAddModal,
    openEditModal: openEditModal,
    setAttendance: setAttendance,
    markAllPresent: markAllPresent,
    confirmDelete: confirmDelete
  };
})();
