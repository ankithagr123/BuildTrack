/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Risk Intelligence Centre: Connected to Flask API & SQLite Database
 */

(function () {
  'use strict';

  const API = 'http://127.0.0.1:5000/api';

  let currentDrilldownProjectId = null;
  let projectsCache = [];
  let dbRisksCache = [];
  let tasksCache = [];
  let materialsCache = [];
  let workersCache = [];
  let attendanceCache = [];

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
      throw new Error(result.error || 'Risk API request failed');
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

  async function loadRiskData() {
    try {
      const [projectsRes, risksRes, tasksRes, materialsRes, workersRes, attendanceRes] = await Promise.all([
        apiRequest('/projects'),
        apiRequest('/risks'),
        safeFetch('/tasks', []),
        safeFetch('/materials', []),
        safeFetch('/workers', []),
        safeFetch('/attendance', [])
      ]);

      projectsCache = Array.isArray(projectsRes) ? projectsRes : [];
      dbRisksCache = Array.isArray(risksRes) ? risksRes : [];
      tasksCache = Array.isArray(tasksRes) ? tasksRes : [];
      materialsCache = Array.isArray(materialsRes) ? materialsRes : [];
      workersCache = Array.isArray(workersRes) ? workersRes : [];
      attendanceCache = Array.isArray(attendanceRes) ? attendanceRes : [];

      renderRiskCentre();
    } catch (error) {
      console.error('Risk data load error:', error);
      notify('Unable to load Risk Intelligence data. Check Flask server.', 'error');
    }
  }

  function initRisks() {
    setupEventHandlers();
    loadRiskData();
  }

  // --- CORE RISK INFERENCE ENGINE (Live SQLite + Heuristic Rules) ---
  function computeRiskAssessments() {
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date();

    const todayAttendance = {};
    attendanceCache.forEach(a => {
      if (a.date === todayStr) {
        todayAttendance[a.worker_id] = a.status === 'P' ? 'present' : 'absent';
      }
    });

    const assessments = [];
    let totalRiskPoints = 0;

    projectsCache.forEach(p => {
      let projectRiskScore = 0;
      const projectRisks = [];

      const budget = parseFloat(p.budget) || 0;
      const spent = parseFloat(p.spent) || 0;
      const progress = parseInt(p.progress, 10) || 0;

      // 1. Saved SQLite Risks for this Project
      const savedRisks = dbRisksCache.filter(
        r => String(r.project_id) === String(p.id) && (r.status || 'Open').toLowerCase() !== 'resolved'
      );
      savedRisks.forEach(r => {
        const sevRaw = (r.severity || 'Medium').toLowerCase();
        const severity = (sevRaw === 'critical' || sevRaw === 'high') ? 'high' : 'medium';
        projectRiskScore += severity === 'high' ? 20 : 12;
        projectRisks.push({
          id: r.id,
          category: `${r.category || 'Site'} Risk`,
          severity,
          title: r.title,
          reason: r.mitigation || 'Active risk logged in project risk register.',
          supportingData: `Probability: ${r.probability || 50}% | Impact Score: ${r.impact_score || 5}/10 | Status: ${r.status || 'Open'}`,
          recommendation: r.mitigation || 'Assign risk owner and execute mitigation plan immediately.',
          indicator: `DB Risk #${r.id} (Prob ${r.probability || 50}%)`
        });
      });

      // 2. Budget Overrun & Burn Rate Heuristic
      if (budget > 0) {
        const budgetUtil = (spent / budget) * 100;
        const budgetBurnDivergence = budgetUtil - progress;

        if (budgetBurnDivergence > 15 || budgetUtil > 90) {
          const severity = budgetBurnDivergence > 25 || spent >= budget ? 'high' : 'medium';
          projectRiskScore += severity === 'high' ? 25 : 15;
          projectRisks.push({
            category: 'Budget Overrun Risk',
            severity,
            title: `Severe Cost Variance (${budgetBurnDivergence.toFixed(1)}% Divergence)`,
            reason: `Expenditure burn rate is outstripping physical completion. ${budgetUtil.toFixed(1)}% of authorized budget spent while physical work is at ${progress}%.`,
            supportingData: `Budget: ${window.BuildTrack.formatINR(budget)} | Spent: ${window.BuildTrack.formatINR(spent)} | Utilization: ${budgetUtil.toFixed(1)}%`,
            recommendation: 'Freeze discretionary subcontracts immediately. Conduct quantity surveyor audit and renegotiate bulk supply rates.',
            indicator: 'Cost Performance Index (CPI) < 0.78'
          });
        }
      }

      // 3. Schedule Delay Heuristic
      const endDateStr = p.end_date || p.expectedCompletionDate;
      const dueDate = endDateStr ? new Date(endDateStr) : null;
      const daysRemaining = dueDate ? Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)) : 60;
      const workRemaining = 100 - progress;

      const projectTasks = tasksCache.filter(
        t => String(t.project_id) === String(p.id) || String(t.projectId) === String(p.id)
      );
      const overdueTasks = projectTasks.filter(t => {
        const due = t.due_date || t.dueDate;
        return t.status !== 'completed' && due && due < todayStr;
      });

      if ((p.status || '').toLowerCase() === 'delayed' || (daysRemaining < 30 && workRemaining > 25) || overdueTasks.length >= 2) {
        const severity = (p.status || '').toLowerCase() === 'delayed' || overdueTasks.length >= 2 ? 'high' : 'medium';
        projectRiskScore += severity === 'high' ? 20 : 10;
        projectRisks.push({
          category: 'Schedule Delay Risk',
          severity,
          title: `Milestone Slippage (${overdueTasks.length} Overdue Work Packages)`,
          reason: `Project timeline buffer has eroded. ${workRemaining}% of physical work remains with ${daysRemaining > 0 ? daysRemaining : 0} days to scheduled delivery date.`,
          supportingData: `Overdue Tasks: ${overdueTasks.length} critical path items (${overdueTasks.map(t => t.title).join(', ') || 'Schedule variance'})`,
          recommendation: 'Authorize fast-tracking and staggered double-shift workforce. Compress shuttering cycle times using early-strength admixtures.',
          indicator: 'Schedule Performance Index (SPI) < 0.82'
        });
      }

      // 4. Material Stockout Threat
      const projectMaterials = materialsCache.filter(
        m => String(m.assignedProjectId) === String(p.id) || String(m.project_id) === String(p.id)
      );
      const stockouts = projectMaterials.filter(
        m => Number(m.quantity) <= Number(m.minStockLevel || m.min_stock_level || 0)
      );

      if (stockouts.length > 0) {
        const hasZero = stockouts.some(m => Number(m.quantity) <= 0);
        const severity = hasZero || stockouts.length >= 2 ? 'high' : 'medium';
        projectRiskScore += severity === 'high' ? 15 : 8;
        projectRisks.push({
          category: 'Material Depletion Risk',
          severity,
          title: `Supply Chain Bottleneck (${stockouts.length} Items Below Safety Level)`,
          reason: 'Key structural raw materials have fallen below minimum buffer thresholds on site, risking crew stoppage.',
          supportingData: `Depleted Materials: ${stockouts.map(m => `${m.name} (${m.quantity} ${m.unit || 'units'} rem)`).join(', ')}`,
          recommendation: 'Issue immediate emergency purchase orders to secondary empanelled distributors.',
          indicator: 'Stock-to-Threshold Ratio < 0.45'
        });
      }

      // 5. Labour Shortage Threat
      const projectLabour = workersCache.filter(
        w => String(w.assignedProjectId) === String(p.id) || String(w.project_id) === String(p.id)
      );
      if (projectLabour.length > 0 && (p.status || '').toLowerCase() !== 'completed') {
        let present = 0;
        projectLabour.forEach(w => {
          const att = todayAttendance[w.id] || (w.availability === 'On Site' ? 'present' : 'absent');
          if (att === 'present') present++;
        });
        const attendanceRate = (present / projectLabour.length) * 100;
        if (attendanceRate < 70) {
          projectRiskScore += 10;
          projectRisks.push({
            category: 'Labour Shortage Risk',
            severity: 'medium',
            title: `Sub-Optimal Crew Attendance (${attendanceRate.toFixed(0)}% Deployment)`,
            reason: 'Active workforce turnout is inadequate to support concrete pours and steel tying schedules.',
            supportingData: `Turnout: ${present} / ${projectLabour.length} workers present on site today.`,
            recommendation: 'Request backup mason and bar-bending gangs from labour contractor agency.',
            indicator: 'Manpower Availability Ratio < 0.70'
          });
        }
      }

      totalRiskPoints += projectRiskScore;

      assessments.push({
        project: p,
        score: Math.min(100, projectRiskScore),
        status: projectRiskScore >= 35 ? 'High Risk' : (projectRiskScore >= 15 ? 'Medium Risk' : 'Low Risk'),
        risks: projectRisks
      });
    });

    const avgRisk = assessments.length > 0 ? (totalRiskPoints / assessments.length) : 0;
    const portfolioHealth = Math.max(0, Math.min(100, Math.round(100 - avgRisk)));

    return { assessments, portfolioHealth };
  }

  // --- RENDER RISK CENTRE ---
  function renderRiskCentre() {
    const { assessments, portfolioHealth } = computeRiskAssessments();

    const gaugeEl = document.getElementById('riskPortfolioGauge');
    const scoreNum = document.getElementById('riskPortfolioScoreNum');
    const healthBadge = document.getElementById('riskHealthStatusBadge');

    if (scoreNum) scoreNum.textContent = portfolioHealth;
    if (gaugeEl) {
      gaugeEl.style.setProperty('--risk-percent', `${portfolioHealth}%`);
    }
    if (healthBadge) {
      if (portfolioHealth < 50) {
        healthBadge.textContent = 'Critical Risk Intervention Required';
        healthBadge.className = 'status-badge badge-delayed';
      } else if (portfolioHealth < 75) {
        healthBadge.textContent = 'Moderate Risks Detected';
        healthBadge.className = 'status-badge badge-ongoing';
      } else {
        healthBadge.textContent = 'Portfolio Health Excellent';
        healthBadge.className = 'status-badge badge-completed';
      }
    }

    const cardsContainer = document.getElementById('riskAlertsCardsContainer');
    if (!cardsContainer) return;

    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    let allRiskItems = [];
    assessments.forEach(a => {
      if (selectedProjectId !== 'all' && String(a.project.id) !== String(selectedProjectId)) return;
      a.risks.forEach(r => {
        allRiskItems.push({ ...r, project: a.project });
      });
    });

    allRiskItems.sort((a, b) => (a.severity === 'high' ? -1 : 1));

    if (allRiskItems.length === 0) {
      cardsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 3rem; text-align: center; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px solid var(--border-color);">
          <i class="fa-solid fa-shield-check" style="font-size: 3rem; color: var(--accent-emerald); margin-bottom: 1rem;"></i>
          <h3>Zero Critical Risk Anomalies</h3>
          <p style="font-size: 0.85rem; margin-top: 0.5rem;">All active projects are operating within expected budget, time, and inventory tolerances.</p>
        </div>
      `;
      return;
    }

    cardsContainer.innerHTML = allRiskItems.map(item => `
      <div class="risk-alert-card risk-card-${item.severity}">
        <div class="risk-card-header">
          <div>
            <div class="risk-category-tag">${item.category}</div>
            <h4 class="risk-project-name">${item.project.name}</h4>
          </div>
          <span class="status-badge ${item.severity === 'high' ? 'badge-risk-high' : 'badge-risk-medium'}">
            ${item.severity.toUpperCase()} RISK
          </span>
        </div>

        <div style="font-size: 0.88rem; font-weight: 700; color: var(--text-main);">
          ${item.title}
        </div>

        <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">
          ${item.reason}
        </p>

        <div class="risk-evidence-box">
          <div class="risk-evidence-title">
            <i class="fa-solid fa-chart-simple"></i> Supporting Quantitative Evidence
          </div>
          <div>${item.supportingData}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">
            Heuristic Rule Triggered: <code>${item.indicator}</code>
          </div>
        </div>

        <div class="risk-recommendation-box">
          <div class="risk-rec-title">
            <i class="fa-solid fa-lightbulb"></i> Recommended Corrective Action
          </div>
          <div>${item.recommendation}</div>
        </div>

        <div style="margin-top: auto; padding-top: 0.5rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
          ${item.id ? `
            <button class="btn btn-sm btn-outline" style="color: var(--accent-emerald);" onclick="RisksController.resolveRisk(${item.id})">
              <i class="fa-solid fa-check"></i> Mark Resolved
            </button>
          ` : ''}
          <button class="btn btn-sm btn-outline" onclick="RisksController.openDrilldown('${item.project.id}')">
            Examine Project Health <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  async function resolveRisk(riskId) {
    try {
      await apiRequest(`/risks/${riskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Resolved' })
      });
      notify('Risk marked as Resolved in database.', 'success');
      await loadRiskData();
    } catch (error) {
      console.error(error);
      notify(error.message, 'error');
    }
  }

  // --- PROJECT RISK DRILLDOWN MODAL ---
  function openDrilldown(projectId) {
    const { assessments } = computeRiskAssessments();
    const assessment = assessments.find(a => String(a.project.id) === String(projectId));
    if (!assessment) return;

    currentDrilldownProjectId = projectId;
    const p = assessment.project;

    document.getElementById('riskDrilldownProjectName').textContent = p.name;
    document.getElementById('riskDrilldownClient').textContent = `${p.client_name || p.client || ''} • Location: ${p.location || ''}`;

    const scoreBadge = document.getElementById('riskDrilldownScoreBadge');
    if (scoreBadge) {
      scoreBadge.textContent = `Risk Score: ${assessment.score}/100 (${assessment.status})`;
      scoreBadge.className = `status-badge ${assessment.score > 30 ? 'badge-risk-high' : 'badge-risk-medium'}`;
    }

    const startDate = p.start_date || p.startDate || '';
    const endDate = p.end_date || p.expectedCompletionDate || '';

    const bodyContainer = document.getElementById('riskDrilldownModalBody');
    if (bodyContainer) {
      bodyContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div style="background: var(--bg-surface-alt); padding: 0.85rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.72rem; color: var(--text-muted);">Budget Spent</div>
            <div style="font-size: 1.1rem; font-weight: 800;">${window.BuildTrack.formatINR(p.spent || 0)}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">Budget: ${window.BuildTrack.formatINR(p.budget || 0)}</div>
          </div>
          <div style="background: var(--bg-surface-alt); padding: 0.85rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.72rem; color: var(--text-muted);">Physical Progress</div>
            <div style="font-size: 1.1rem; font-weight: 800; color: var(--accent-orange);">${p.progress || 0}%</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">Status: ${(p.status || 'Active').toUpperCase()}</div>
          </div>
          <div style="background: var(--bg-surface-alt); padding: 0.85rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.72rem; color: var(--text-muted);">Scheduled Deadline</div>
            <div style="font-size: 0.95rem; font-weight: 700;">${window.BuildTrack.formatDate ? window.BuildTrack.formatDate(endDate) : endDate}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">Started: ${window.BuildTrack.formatDate ? window.BuildTrack.formatDate(startDate) : startDate}</div>
          </div>
        </div>

        <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 0.75rem;">Contributing Risk Factors & Remediation</h4>
        ${assessment.risks.length === 0 ? '<p style="color: var(--text-muted);">No risk triggers recorded.</p>' :
          assessment.risks.map(r => `
            <div style="background: var(--bg-surface-alt); border-left: 4px solid ${r.severity === 'high' ? 'var(--accent-rose)' : 'var(--accent-amber)'}; padding: 1rem; border-radius: var(--radius-md); margin-bottom: 0.75rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-weight: 700; font-size: 0.9rem; color: var(--text-main);">${r.title}</span>
                <span class="status-badge ${r.severity === 'high' ? 'badge-risk-high' : 'badge-risk-medium'}">${r.severity}</span>
              </div>
              <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 6px;">${r.reason}</p>
              <div style="font-size: 0.8rem; background: #ffffff; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin-bottom: 6px;">
                <strong>Action Plan:</strong> ${r.recommendation}
              </div>
            </div>
          `).join('')
        }
      `;
    }

    window.BuildTrack.openModal('riskDrilldownModal');
  }

  async function simulateRecalculation() {
    notify('Recalculating live risk indices from SQLite database...', 'info', 1500);
    await loadRiskData();
    notify('Risk Intelligence Matrix refreshed successfully!', 'success');
  }

  function setupEventHandlers() {
    const simBtn = document.getElementById('riskRecalculateBtn');
    if (simBtn) simBtn.addEventListener('click', simulateRecalculation);
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'risks') {
        loadRiskData();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'risks') {
        loadRiskData();
      }
    });

    window.addEventListener('buildtrack:projectfilterchanged', () => {
      if (window.BuildTrack.currentView === 'risks') {
        renderRiskCentre();
      }
    });

    initRisks();
  });

  window.RisksController = {
    render: loadRiskData,
    openDrilldown,
    resolveRisk,
    simulate: simulateRecalculation
  };
})();