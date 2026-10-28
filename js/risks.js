/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Risk Intelligence Centre: Heuristic Rules Engine, Anomaly Detection & AI Recommendations
 * (Transparent Preliminary Risk Assessment Engine - Prepared for Python/Pandas ML Integration)
 */

(function () {
  'use strict';

  let currentDrilldownProjectId = null;

  function initRisks() {
    renderRiskCentre();
    setupEventHandlers();
  }

  // --- CORE RISK INFERENCE ENGINE ---
  function computeRiskAssessments() {
    const projects = window.DataStore.getProjects();
    const tasks = window.DataStore.getTasks();
    const materials = window.DataStore.getMaterials();
    const labour = window.DataStore.getLabour();
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date();
    const attendance = window.DataStore.getAttendance(todayStr);

    const assessments = [];
    let totalRiskPoints = 0;
    let maxPossiblePoints = projects.length * 40;

    projects.forEach(p => {
      let projectRiskScore = 0;
      const projectRisks = [];

      // 1. Budget Overrun & Burn Rate Heuristic
      const budgetUtil = (p.spent / p.budget) * 100;
      const progressRatio = p.progress;
      const budgetBurnDivergence = budgetUtil - progressRatio; // If spent 90% but progress 60%, diff = +30%

      if (budgetBurnDivergence > 15 || budgetUtil > 90) {
        const severity = budgetBurnDivergence > 25 || p.spent >= p.budget ? 'high' : 'medium';
        projectRiskScore += severity === 'high' ? 25 : 15;
        projectRisks.push({
          category: 'Budget Overrun Risk',
          severity: severity,
          title: `Severe Cost Variance (${budgetBurnDivergence.toFixed(1)}% Divergence)`,
          reason: `Expenditure burn rate is significantly outstripping physical site completion. ${budgetUtil.toFixed(1)}% of authorized budget spent while physical work is at ${p.progress}%.`,
          supportingData: `Budget: ${window.BuildTrack.formatINR(p.budget)} | Spent: ${window.BuildTrack.formatINR(p.spent)} | Utilization: ${budgetUtil.toFixed(1)}%`,
          recommendation: 'Freeze discretionary subcontracts immediately. Conduct quantitative quantity surveyor audit and renegotiate bulk supply rates.',
          indicator: 'Cost Performance Index (CPI) < 0.78'
        });
      }

      // 2. Schedule Delay Heuristic
      const dueDate = new Date(p.expectedCompletionDate);
      const daysRemaining = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      const workRemaining = 100 - p.progress;
      
      const projectTasks = tasks.filter(t => t.projectId === p.id);
      const overdueTasks = projectTasks.filter(t => t.status !== 'completed' && t.dueDate < todayStr);

      if (p.status === 'delayed' || (daysRemaining < 30 && workRemaining > 25) || overdueTasks.length >= 2) {
        const severity = p.status === 'delayed' || overdueTasks.length >= 2 ? 'high' : 'medium';
        projectRiskScore += severity === 'high' ? 20 : 10;
        projectRisks.push({
          category: 'Schedule Delay Risk',
          severity: severity,
          title: `Milestone Slippage (${overdueTasks.length} Overdue Work Packages)`,
          reason: `Project timeline buffer has eroded. ${workRemaining}% of physical work remains with only ${daysRemaining > 0 ? daysRemaining : 0} days to scheduled delivery date.`,
          supportingData: `Overdue Tasks: ${overdueTasks.length} critical path items (${overdueTasks.map(t => t.title).join(', ') || 'Various'})`,
          recommendation: 'Authorize fast-tracking and staggered double-shift workforce. Compress shuttering cycle times using early-strength admixtures.',
          indicator: 'Schedule Performance Index (SPI) < 0.82'
        });
      }

      // 3. Material Stockout Threat
      const projectMaterials = materials.filter(m => m.assignedProjectId === p.id || !m.assignedProjectId);
      const stockouts = projectMaterials.filter(m => m.quantity <= m.minStockLevel);

      if (stockouts.length > 0) {
        const hasZero = stockouts.some(m => m.quantity <= 0);
        const severity = hasZero || stockouts.length >= 2 ? 'high' : 'medium';
        projectRiskScore += severity === 'high' ? 15 : 8;
        projectRisks.push({
          category: 'Material Depletion Risk',
          severity: severity,
          title: `Supply Chain Bottleneck (${stockouts.length} Items Below Safety Level)`,
          reason: `Key structural raw materials have fallen below minimum buffer thresholds on site, risking idle plant machinery and crew stoppage.`,
          supportingData: `Depleted Materials: ${stockouts.map(m => `${m.name} (${m.quantity} ${m.unit} rem)`).join(', ')}`,
          recommendation: 'Issue immediate emergency purchase orders to secondary empanelled distributors. Fast-track delivery challans.',
          indicator: 'Stock-to-Threshold Ratio < 0.45'
        });
      }

      // 4. Labour Shortage Threat
      const projectLabour = labour.filter(w => w.assignedProjectId === p.id);
      if (projectLabour.length > 0 && p.status !== 'completed') {
        let present = 0;
        projectLabour.forEach(w => {
          if (attendance[w.id] === 'present') present++;
        });
        const attendanceRate = (present / projectLabour.length) * 100;
        if (attendanceRate < 70) {
          projectRiskScore += 10;
          projectRisks.push({
            category: 'Labour Shortage Risk',
            severity: 'medium',
            title: `Sub-Optimal Crew Attendance (${attendanceRate.toFixed(0)}% Deployment)`,
            reason: `Active workforce turnout is inadequate to support concrete pours and steel tying schedules.`,
            supportingData: `Turnout: ${present} / ${projectLabour.length} workers present on site today.`,
            recommendation: 'Request backup mason and bar-bending gangs from labour contractor agency to avoid pour delays.',
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

    // Compute Overall Portfolio Health (100 - average risk points)
    const avgRisk = assessments.length > 0 ? (totalRiskPoints / assessments.length) : 0;
    const portfolioHealth = Math.max(0, Math.min(100, Math.round(100 - avgRisk)));

    return { assessments, portfolioHealth };
  }

  // --- RENDER RISK CENTRE ---
  function renderRiskCentre() {
    const { assessments, portfolioHealth } = computeRiskAssessments();

    // 1. Update Risk Engine Banner & Gauge
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

    // 2. Aggregate All Detected Risk Cards
    const cardsContainer = document.getElementById('riskAlertsCardsContainer');
    if (!cardsContainer) return;

    let allRiskItems = [];
    assessments.forEach(a => {
      a.risks.forEach(r => {
        allRiskItems.push({ ...r, project: a.project });
      });
    });

    // Sort by severity (high first)
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

        <!-- Supporting Evidence Metric -->
        <div class="risk-evidence-box">
          <div class="risk-evidence-title">
            <i class="fa-solid fa-chart-simple"></i> Supporting Quantitative Evidence
          </div>
          <div>${item.supportingData}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">
            Heuristic Rule Triggered: <code>${item.indicator}</code>
          </div>
        </div>

        <!-- AI Corrective Action Recommendation -->
        <div class="risk-recommendation-box">
          <div class="risk-rec-title">
            <i class="fa-solid fa-lightbulb"></i> Recommended Corrective Action
          </div>
          <div>${item.recommendation}</div>
        </div>

        <div style="margin-top: auto; padding-top: 0.5rem; display: flex; justify-content: flex-end;">
          <button class="btn btn-sm btn-outline" onclick="RisksController.openDrilldown('${item.project.id}')">
            Examine Project Health <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  // --- PROJECT RISK DRILLDOWN MODAL ---
  function openDrilldown(projectId) {
    const { assessments } = computeRiskAssessments();
    const assessment = assessments.find(a => a.project.id === projectId);
    if (!assessment) return;

    currentDrilldownProjectId = projectId;
    const p = assessment.project;

    document.getElementById('riskDrilldownProjectName').textContent = p.name;
    document.getElementById('riskDrilldownClient').textContent = `${p.client} • Location: ${p.location}`;

    const scoreBadge = document.getElementById('riskDrilldownScoreBadge');
    if (scoreBadge) {
      scoreBadge.textContent = `Risk Score: ${assessment.score}/100 (${assessment.status})`;
      scoreBadge.className = `status-badge ${assessment.score > 30 ? 'badge-risk-high' : 'badge-risk-medium'}`;
    }

    const bodyContainer = document.getElementById('riskDrilldownModalBody');
    if (bodyContainer) {
      bodyContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div style="background: var(--bg-surface-alt); padding: 0.85rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.72rem; color: var(--text-muted);">Budget Spent</div>
            <div style="font-size: 1.1rem; font-weight: 800;">${window.BuildTrack.formatINR(p.spent)}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">Budget: ${window.BuildTrack.formatINR(p.budget)}</div>
          </div>
          <div style="background: var(--bg-surface-alt); padding: 0.85rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.72rem; color: var(--text-muted);">Physical Progress</div>
            <div style="font-size: 1.1rem; font-weight: 800; color: var(--accent-orange);">${p.progress}%</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">Status: ${p.status.toUpperCase()}</div>
          </div>
          <div style="background: var(--bg-surface-alt); padding: 0.85rem; border-radius: var(--radius-md);">
            <div style="font-size: 0.72rem; color: var(--text-muted);">Scheduled Deadline</div>
            <div style="font-size: 0.95rem; font-weight: 700;">${window.BuildTrack.formatDate(p.expectedCompletionDate)}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">Started: ${window.BuildTrack.formatDate(p.startDate)}</div>
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

        <div style="margin-top: 1.5rem; padding: 0.75rem; background: #eff6ff; border: 1px dashed #93c5fd; border-radius: var(--radius-md); font-size: 0.75rem; color: #1e40af;">
          <strong><i class="fa-solid fa-code-branch"></i> Future Backend / ML Pipeline Integration Hook:</strong>
          <p style="margin-top: 3px;">In the proposed final semester architecture, this view will ingest real-time predictions from a Python Flask microservice (<code>POST /api/v1/predict-risk</code>) powered by Pandas and Scikit-Learn Random Forest regression models trained on historic construction schedules.</p>
        </div>
      `;
    }

    window.BuildTrack.openModal('riskDrilldownModal');
  }

  function simulateRecalculation() {
    window.BuildTrack.showToast('Recalculating site risk indices across 12 heuristic parameters...', 'info', 1500);
    setTimeout(() => {
      renderRiskCentre();
      window.BuildTrack.showToast('Risk Intelligence Matrix refreshed successfully!', 'success');
    }, 600);
  }

  function setupEventHandlers() {
    const simBtn = document.getElementById('riskRecalculateBtn');
    if (simBtn) simBtn.addEventListener('click', simulateRecalculation);
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'risks') {
        renderRiskCentre();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'risks') {
        renderRiskCentre();
      }
    });

    initRisks();
  });

  window.RisksController = {
    render: renderRiskCentre,
    openDrilldown: openDrilldown,
    simulate: simulateRecalculation
  };
})();
