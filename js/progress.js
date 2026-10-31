/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Daily Progress Controller: Site Diary, Timeline Stream, Progress Sync & Blocker Logs
 */

(function () {
  'use strict';

  function initProgress() {
    renderProgressView();
    setupEventHandlers();
  }

  function renderProgressView() {
    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const reports = window.BuildTrack.filterClientRecords(
      window.DataStore.getProgressReports(selectedProjectId),
      selectedProjectId,
      'projectId'
    );
    const projects = window.BuildTrack.getVisibleProjects();

    const searchInput = document.getElementById('progressSearchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filtered = reports.filter(r => {
      return (r.workCompleted && r.workCompleted.toLowerCase().includes(query)) ||
             (r.issuesEncountered && r.issuesEncountered.toLowerCase().includes(query)) ||
             (r.reportedBy && r.reportedBy.toLowerCase().includes(query));
    });

    // Summary counters
    const totalReports = reports.length;
    const reportsWithIssues = reports.filter(r => r.issuesEncountered && r.issuesEncountered !== 'None' && r.issuesEncountered.length > 5).length;

    setElText('dprTotalLogs', totalReports);
    setElText('dprIssuesFlagged', reportsWithIssues);

    const streamContainer = document.getElementById('progressTimelineStream');
    if (!streamContainer) return;

    if (filtered.length === 0) {
      streamContainer.innerHTML = `
        <div style="padding: 3rem; text-align: center; color: var(--text-muted);">
          <i class="fa-solid fa-clipboard-list" style="font-size: 2.5rem; margin-bottom: 1rem; opacity: 0.5;"></i>
          <h3>No daily site logs found</h3>
          <p style="font-size: 0.85rem; margin-top: 0.5rem;">Click "+ Add Daily Report" to log today's construction activity.</p>
        </div>
      `;
      return;
    }

    streamContainer.innerHTML = filtered.map(r => {
      const proj = projects.find(p => p.id === r.projectId);
      const hasIssues = r.issuesEncountered && r.issuesEncountered.toLowerCase() !== 'none' && r.issuesEncountered.trim() !== '';
      const hasDelay = r.delayBlockers && r.delayBlockers.toLowerCase() !== 'none' && r.delayBlockers.trim() !== '';

      return `
        <div class="timeline-entry-item">
          <div class="timeline-node-dot">
            <i class="fa-solid fa-hard-hat"></i>
          </div>
          <div class="timeline-bubble-card">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0.6rem; flex-wrap: wrap; gap: 0.5rem;">
              <div>
                <span class="kanban-project-pill">${proj ? proj.name : 'Site'}</span>
                <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-main); margin-left: 6px;">
                  ${window.BuildTrack.formatDate(r.date)}
                </span>
                <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 8px;">
                  Logged by: <strong>${r.reportedBy || 'Site Engineer'}</strong>
                </span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.82rem; font-weight: 700; color: var(--accent-orange); background: var(--accent-orange-light); padding: 2px 8px; border-radius: var(--radius-sm);">
                  Progress: ${r.progressPercentage}%
                </span>
                <button class="btn btn-icon-only btn-outline" style="color: var(--accent-rose); width: 26px; height: 26px;" onclick="ProgressController.confirmDelete('${r.id}')" title="Delete Log">
                  <i class="fa-solid fa-trash" style="font-size: 0.75rem;"></i>
                </button>
              </div>
            </div>

            <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.6rem; line-height: 1.4;">
              ${r.workCompleted}
            </div>

            <!-- Site Resources Grid -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.6rem; background-color: var(--bg-surface-alt); padding: 0.65rem; border-radius: var(--radius-md); font-size: 0.78rem; margin-bottom: 0.6rem;">
              <div>
                <span style="color: var(--text-muted);"><i class="fa-solid fa-users" style="color: var(--accent-blue);"></i> Workforce:</span>
                <strong style="color: var(--text-main); margin-left: 4px;">${r.workersPresent} Workers on duty</strong>
              </div>
              <div>
                <span style="color: var(--text-muted);"><i class="fa-solid fa-cubes" style="color: var(--accent-amber);"></i> Materials:</span>
                <span style="color: var(--text-main); margin-left: 4px;">${r.materialsConsumed || 'Standard consumption'}</span>
              </div>
            </div>

            <!-- Issues & Tomorrow Plan -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: 0.78rem;">
              <div style="background-color: ${hasIssues ? '#fef2f2' : 'var(--bg-surface-alt)'}; padding: 0.6rem; border-radius: var(--radius-sm); border-left: 3px solid ${hasIssues ? 'var(--accent-rose)' : 'var(--accent-emerald)'};">
                <div style="font-weight: 700; color: ${hasIssues ? '#991b1b' : 'var(--text-muted)'}; margin-bottom: 2px;">
                  <i class="fa-solid fa-triangle-exclamation"></i> Issues & Constraints
                </div>
                <div style="color: ${hasIssues ? '#b91c1c' : 'var(--text-muted)'};">${r.issuesEncountered || 'No site impediments reported.'}</div>
              </div>

              <div style="background-color: var(--bg-surface-alt); padding: 0.6rem; border-radius: var(--radius-sm); border-left: 3px solid var(--accent-blue);">
                <div style="font-weight: 700; color: var(--accent-blue); margin-bottom: 2px;">
                  <i class="fa-solid fa-calendar-day"></i> Tomorrow's Target
                </div>
                <div style="color: var(--text-main);">${r.nextDayPlan || 'Continue scheduled execution.'}</div>
              </div>
            </div>

            ${hasDelay ? `
              <div style="margin-top: 0.6rem; padding: 0.5rem 0.75rem; background-color: #fff1f2; border: 1px dashed #f43f5e; border-radius: var(--radius-sm); font-size: 0.75rem; color: #be123c;">
                <strong><i class="fa-solid fa-circle-exclamation"></i> Critical Schedule Delay Risk:</strong> ${r.delayBlockers}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setupEventHandlers() {
    const searchInput = document.getElementById('progressSearchInput');
    const form = document.getElementById('dailyProgressForm');

    if (searchInput) searchInput.addEventListener('input', renderProgressView);

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();

        const projectId = document.getElementById('dprFormProject').value;
        const date = document.getElementById('dprFormDate').value;
        const workCompleted = document.getElementById('dprFormWork').value.trim();
        const progressPercentage = parseInt(document.getElementById('dprFormProgress').value, 10) || 0;
        const workersPresent = parseInt(document.getElementById('dprFormWorkers').value, 10) || 0;
        const materialsConsumed = document.getElementById('dprFormMaterials').value.trim();
        const issuesEncountered = document.getElementById('dprFormIssues').value.trim();
        const delayBlockers = document.getElementById('dprFormBlockers').value.trim();
        const nextDayPlan = document.getElementById('dprFormNextDay').value.trim();
        const reportedBy = document.getElementById('dprFormReporter').value.trim();

        if (!projectId || !workCompleted) {
          window.BuildTrack.showToast('Please select project and enter description of work completed.', 'error');
          return;
        }

        const reportData = {
          projectId,
          date: date || new Date().toISOString().split('T')[0],
          workCompleted,
          progressPercentage,
          workersPresent,
          materialsConsumed: materialsConsumed || 'None recorded',
          issuesEncountered: issuesEncountered || 'None',
          delayBlockers: delayBlockers || 'None',
          nextDayPlan: nextDayPlan || 'Proceed as per plan',
          reportedBy: reportedBy || 'Site Engineer'
        };

        window.DataStore.saveProgressReport(reportData);
        window.BuildTrack.closeModal('dailyProgressModal');
        window.BuildTrack.showToast('Daily Site Diary logged & Project completion synchronized!', 'success');
        renderProgressView();
      });
    }
  }

  function openAddModal() {
    const form = document.getElementById('dailyProgressForm');
    if (form) form.reset();

    document.getElementById('dprFormDate').value = new Date().toISOString().split('T')[0];
    
    // Autofill current user name as reporter
    const user = window.DataStore.getUser();
    if (user && user.name) {
      document.getElementById('dprFormReporter').value = user.name;
    }

    populateDPRProjectDropdown();
    window.BuildTrack.openModal('dailyProgressModal');
  }

  function populateDPRProjectDropdown() {
    const dropdown = document.getElementById('dprFormProject');
    if (!dropdown) return;

    const projects = window.DataStore.getProjects();
    dropdown.innerHTML = projects.map(p => `
      <option value="${p.id}" data-current="${p.progress}">${p.name} (Current: ${p.progress}%)</option>
    `).join('');

    if (window.BuildTrack.currentProjectId && window.BuildTrack.currentProjectId !== 'all') {
      dropdown.value = window.BuildTrack.currentProjectId;
    }

    // Set default progress to current project progress
    const selected = dropdown.options[dropdown.selectedIndex];
    if (selected) {
      document.getElementById('dprFormProgress').value = selected.getAttribute('data-current') || 50;
    }

    dropdown.addEventListener('change', function () {
      const opt = this.options[this.selectedIndex];
      if (opt) {
        document.getElementById('dprFormProgress').value = opt.getAttribute('data-current') || 50;
      }
    });
  }

  function confirmDelete(reportId) {
    window.BuildTrack.showConfirm({
      title: 'Delete Progress Entry?',
      message: 'This daily log report will be removed from site history.',
      confirmText: 'Delete Log',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.DataStore.deleteProgressReport(reportId);
        window.BuildTrack.showToast('Progress log removed.', 'info');
        renderProgressView();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'progress') {
        renderProgressView();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'progress') {
        renderProgressView();
      }
    });

    window.addEventListener('buildtrack:projectfilterchanged', () => {
      if (window.BuildTrack.currentView === 'progress') {
        renderProgressView();
      }
    });

    window.addEventListener('buildtrack:clientchanged', () => {
      if (window.BuildTrack.currentView === 'progress') renderProgressView();
    });

    initProgress();
  });

  window.ProgressController = {
    render: renderProgressView,
    openAddModal: openAddModal,
    confirmDelete: confirmDelete
  };
})();
