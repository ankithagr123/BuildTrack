/**
 * BuildTrack - Labour Management
 * Connected to Flask API and SQLite Database
 */

(function () {
  'use strict';

  const API = 'http://127.0.0.1:5000/api';

  let selectedAttendanceDate = new Date().toISOString().split('T')[0];
  let workers = [];
  let attendance = {};
  let projects = [];
  let requestVersion = 0;

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
      throw new Error(result.error || 'API request failed');
    }

    return result;
  }

  function statusFromAPI(status) {
    return { P: 'present', A: 'absent', L: 'leave' }[status] || null;
  }

  function statusToAPI(status) {
    return { present: 'P', absent: 'A', leave: 'L' }[status];
  }

  async function loadLabourData() {
    const version = ++requestVersion;

    try {
      const [workerData, attendanceData] = await Promise.all([
        apiRequest('/workers'),
        apiRequest('/attendance')
      ]);

      if (version !== requestVersion) return;

      workers = workerData;

      attendance = {};

      attendanceData.forEach(record => {
        if (record.date === selectedAttendanceDate) {
          attendance[record.worker_id] =
            statusFromAPI(record.status);
        }
      });

      projects = window.DataStore.getProjects();

      renderLabourView();

    } catch (error) {
      console.error('Labour loading error:', error);
      notify('Unable to load Labour data. Check Flask server.', 'error');
    }
  }

  function initLabour() {
    setupAttendanceDateInput();
    setupEventHandlers();
    loadLabourData();
  }

  function setupAttendanceDateInput() {
    const dateInput = document.getElementById('attendanceDatePicker');

    if (dateInput) {
      dateInput.value = selectedAttendanceDate;

      dateInput.addEventListener('change', function () {
        selectedAttendanceDate = this.value;
        loadLabourData();
      });
    }
  }

  function getCurrentAttendance(worker) {
    return attendance[worker.id] ||
      (worker.availability === 'On Site' ? 'present' : 'absent');
  }

  function renderLabourView() {
    const selectedProjectId =
      window.BuildTrack.currentProjectId || 'all';

    const labour = workers.filter(worker =>
      selectedProjectId === 'all' ||
      worker.assignedProjectId === selectedProjectId
    );

    const searchInput = document.getElementById('labourSearchInput');
    const skillFilter = document.getElementById('labourSkillFilter');

    const query = searchInput
      ? searchInput.value.toLowerCase().trim()
      : '';

    const skill = skillFilter ? skillFilter.value : 'all';

    const filtered = labour.filter(worker => {
      const matchQuery =
        (worker.name || '').toLowerCase().includes(query) ||
        (worker.id || '').toLowerCase().includes(query) ||
        (worker.phone || '').includes(query);

      const matchSkill =
        skill === 'all' || worker.skill === skill;

      return matchQuery && matchSkill;
    });

    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let estimatedCost = 0;

    labour.forEach(worker => {
      const status = getCurrentAttendance(worker);

      if (status === 'present') {
        presentCount++;
        estimatedCost += Number(worker.dailyWage) || 0;
      } else if (status === 'leave') {
        leaveCount++;
      } else {
        absentCount++;
      }
    });

    setElText('attTotalWorkers', labour.length);
    setElText('attPresentWorkers', presentCount);
    setElText('attAbsentWorkers', absentCount);
    setElText('attLeaveWorkers', leaveCount);

    setElText(
      'attDailyWagePayout',
      window.BuildTrack.formatINR(estimatedCost)
    );

    const tbody = document.getElementById('labourTableBody');

    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:2rem;">
            No workers found matching your filter criteria.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(worker => {
      const project = projects.find(
        p => p.id === worker.assignedProjectId
      );

      const currentAtt = getCurrentAttendance(worker);

      return `
        <tr>
          <td style="font-weight:700;">${worker.id}</td>

          <td>
            <div style="font-weight:700;color:var(--text-main);">
              ${worker.name}
            </div>
            <div style="font-size:.75rem;color:var(--text-muted);">
              ${worker.phone || 'No Phone'}
            </div>
          </td>

          <td>
            <span class="meta-pill-item">
              ${worker.skill || worker.role || 'Not specified'}
            </span>
          </td>

          <td>
            ${project ? project.name :
              '<span style="color:var(--text-muted);">Unassigned</span>'}
          </td>

          <td style="font-weight:700;color:var(--text-main);">
            ${window.BuildTrack.formatINR(worker.dailyWage)}
          </td>

          <td>
            <div style="display:inline-flex;border:1px solid var(--border-color);border-radius:var(--radius-sm);overflow:hidden;">

              <button type="button"
                class="btn btn-sm ${currentAtt === 'present' ? 'btn-primary' : 'btn-outline'}"
                style="${currentAtt === 'present' ? 'background-color:var(--accent-emerald);border-color:var(--accent-emerald);color:#fff;' : ''}"
                onclick="LabourController.setAttendance('${worker.id}','present')">
                P
              </button>

              <button type="button"
                class="btn btn-sm ${currentAtt === 'absent' ? 'btn-primary' : 'btn-outline'}"
                style="${currentAtt === 'absent' ? 'background-color:var(--accent-rose);border-color:var(--accent-rose);color:#fff;' : ''}"
                onclick="LabourController.setAttendance('${worker.id}','absent')">
                A
              </button>

              <button type="button"
                class="btn btn-sm ${currentAtt === 'leave' ? 'btn-primary' : 'btn-outline'}"
                style="${currentAtt === 'leave' ? 'background-color:var(--accent-amber);border-color:var(--accent-amber);color:#fff;' : ''}"
                onclick="LabourController.setAttendance('${worker.id}','leave')">
                L
              </button>

            </div>
          </td>

          <td>
            <div class="table-actions-cell">

              <button class="btn btn-icon-only btn-outline"
                onclick="LabourController.openEditModal('${worker.id}')"
                title="Edit Worker">
                <i class="fa-solid fa-pen"></i>
              </button>

              <button class="btn btn-icon-only btn-outline"
                style="color:var(--accent-rose);"
                onclick="LabourController.confirmDelete('${worker.id}')"
                title="Remove Worker">
                <i class="fa-solid fa-trash"></i>
              </button>

            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function setElText(id, text) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = text;
    }
  }

  async function setAttendance(workerId, status) {
    try {
      await apiRequest('/attendance', {
        method: 'POST',
        body: JSON.stringify({
          worker_id: workerId,
          status: statusToAPI(status),
          date: selectedAttendanceDate
        })
      });

      attendance[workerId] = status;

      notify('Attendance saved successfully!');
      renderLabourView();

    } catch (error) {
      console.error(error);
      notify(error.message, 'error');
    }
  }

  async function markAllPresent() {
    try {
      await Promise.all(workers.map(worker =>
        apiRequest('/attendance', {
          method: 'POST',
          body: JSON.stringify({
            worker_id: worker.id,
            status: 'P',
            date: selectedAttendanceDate
          })
        })
      ));

      workers.forEach(worker => {
        attendance[worker.id] = 'present';
      });

      notify(`Marked all ${workers.length} workers as Present.`);
      renderLabourView();

    } catch (error) {
      console.error(error);
      notify('Unable to save all attendance records.', 'error');
      await loadLabourData();
    }
  }

  function setupEventHandlers() {
    const searchInput = document.getElementById('labourSearchInput');
    const skillFilter = document.getElementById('labourSkillFilter');
    const workerForm = document.getElementById('workerAddEditForm');
    const markAllBtn = document.getElementById('markAllPresentBtn');

    if (searchInput) {
      searchInput.addEventListener('input', renderLabourView);
    }

    if (skillFilter) {
      skillFilter.addEventListener('change', renderLabourView);
    }

    if (markAllBtn) {
      markAllBtn.addEventListener('click', markAllPresent);
    }

    if (workerForm) {
      workerForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        const id = document.getElementById('workerFormId').value;
        const name = document.getElementById('workerFormName').value.trim();
        const skill = document.getElementById('workerFormSkill').value;
        const phone = document.getElementById('workerFormPhone').value.trim();
        const projectId = document.getElementById('workerFormProject').value;
        const dailyWage = Number(document.getElementById('workerFormWage').value);
        const availability = document.getElementById('workerFormAvailability').value;

        if (!name || !Number.isFinite(dailyWage) || dailyWage <= 0) {
          notify('Enter a valid worker name and daily wage.', 'error');
          return;
        }

        const workerData = {
          name,
          skill,
          role: skill,
          phone,
          assignedProjectId: projectId,
          dailyWage,
          availability,
          status: 'active'
        };

        try {
          if (id) {
            await apiRequest(`/workers/${encodeURIComponent(id)}`, {
              method: 'PUT',
              body: JSON.stringify(workerData)
            });
          } else {
            await apiRequest('/workers', {
              method: 'POST',
              body: JSON.stringify(workerData)
            });
          }

          window.BuildTrack.closeModal('workerModal');

          notify(`Worker "${name}" saved successfully!`);

          await loadLabourData();

        } catch (error) {
          console.error(error);
          notify(error.message, 'error');
        }
      });
    }
  }

  function openAddModal() {
    const form = document.getElementById('workerAddEditForm');

    if (form) form.reset();

    document.getElementById('workerModalTitle').textContent =
      'Add Worker / Craftsman';

    document.getElementById('workerFormId').value = '';

    populateWorkerProjectDropdown();

    window.BuildTrack.openModal('workerModal');
  }

  function openEditModal(workerId) {
    const worker = workers.find(w => w.id === workerId);

    if (!worker) return;

    populateWorkerProjectDropdown();

    document.getElementById('workerModalTitle').textContent =
      'Edit Worker Profile';

    document.getElementById('workerFormId').value = worker.id;
    document.getElementById('workerFormName').value = worker.name;
    document.getElementById('workerFormSkill').value =
      worker.skill || worker.role || '';
    document.getElementById('workerFormPhone').value =
      worker.phone || '';
    document.getElementById('workerFormProject').value =
      worker.assignedProjectId || '';
    document.getElementById('workerFormWage').value =
      worker.dailyWage;
    document.getElementById('workerFormAvailability').value =
      worker.availability || 'On Site';

    window.BuildTrack.openModal('workerModal');
  }

  function populateWorkerProjectDropdown() {
    const dropdown = document.getElementById('workerFormProject');

    if (!dropdown) return;

    projects = window.DataStore.getProjects();

    dropdown.innerHTML = projects.map(project => `
      <option value="${project.id}">
        ${project.name}
      </option>
    `).join('');

    const currentProject = window.BuildTrack.currentProjectId;

    if (currentProject && currentProject !== 'all') {
      dropdown.value = currentProject;
    }
  }

  function confirmDelete(workerId) {
    const worker = workers.find(w => w.id === workerId);

    if (!worker) return;

    window.BuildTrack.showConfirm({
      title: `Remove Worker "${worker.name}"?`,
      message: 'Worker details and attendance history for this employee will be removed.',
      confirmText: 'Remove Worker',
      confirmClass: 'btn-danger',

      onConfirm: async () => {
        try {
          await apiRequest(`/workers/${encodeURIComponent(workerId)}`, {
            method: 'DELETE'
          });

          notify(`Worker "${worker.name}" removed.`, 'info');

          await loadLabourData();

        } catch (error) {
          console.error(error);
          notify(error.message, 'error');
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {

    window.addEventListener('buildtrack:viewchanged', event => {
      if (event.detail.view === 'labour') {
        loadLabourData();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'labour') {
        loadLabourData();
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
    render: loadLabourData,
    openAddModal,
    openEditModal,
    setAttendance,
    markAllPresent,
    confirmDelete
  };

})();