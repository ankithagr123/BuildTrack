/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Core App Coordinator, Router, Utilities, Toast, Confirmation, & Auth Management
 */

(function () {
  'use strict';

  const ROLE_ACCESS = Object.freeze({
    'Contractor / Admin': {
      landingView: 'dashboard',
      views: ['dashboard', 'projects', 'tasks', 'labour', 'materials', 'finance', 'progress', 'risks', 'reports', 'settings'],
      capabilities: ['*']
    },
    'Site Engineer / Supervisor': {
      landingView: 'tasks',
      views: ['projects', 'tasks', 'labour', 'progress', 'reports'],
      capabilities: ['tasks.write', 'labour.attendance', 'progress.write']
    },
    'Storekeeper': {
      landingView: 'materials',
      views: ['materials'],
      capabilities: ['materials.write']
    },
    'Client / Project Owner': {
      landingView: 'dashboard',
      views: ['dashboard', 'projects', 'progress', 'reports'],
      capabilities: []
    }
  });

  const FORM_CAPABILITIES = Object.freeze({
    projectAddEditForm: 'projects.write',
    taskAddEditForm: 'tasks.write',
    workerAddEditForm: 'labour.write',
    materialAddEditForm: 'materials.write',
    materialStockActionForm: 'materials.write',
    expenseAddEditForm: 'finance.write',
    paymentAddEditForm: 'finance.write',
    dailyProgressForm: 'progress.write',
    companySettingsForm: 'settings.write',
    userProfileForm: 'settings.write'
  });

  // Client assignments are derived from the actual project records. No client
  // IDs or project fields are invented for this frontend-only prototype.
  function getClientProjectAssignments() {
    const assignments = Object.create(null);
    const projects = window.DataStore ? window.DataStore.getProjects() : [];
    projects.forEach(project => {
      const clientName = (project.client || '').trim();
      if (!clientName || !project.id) return;
      if (!assignments[clientName]) assignments[clientName] = [];
      assignments[clientName].push(project.id);
    });
    return assignments;
  }

  function hasRoleCapability(capability) {
    const access = ROLE_ACCESS[window.BuildTrack.currentRole];
    return !!access && (access.capabilities.includes('*') || access.capabilities.includes(capability));
  }

  function actionCapability(element) {
    const inlineAction = `${element.getAttribute('onclick') || ''} ${element.getAttribute('onchange') || ''}`;
    if (/ProjectsController\.(openAddModal|openEditModal|confirmDelete)\(/.test(inlineAction)) return 'projects.write';
    if (/TasksController\./.test(inlineAction)) return 'tasks.write';
    if (/LabourController\.setAttendance|markAllPresent/.test(inlineAction)) return 'labour.attendance';
    if (/LabourController\./.test(inlineAction)) return 'labour.write';
    if (/MaterialsController\.(openAddModal|openEditModal|confirmDelete|openStockActionModal)\(/.test(inlineAction)) return 'materials.write';
    if (/FinanceController\./.test(inlineAction)) return 'finance.write';
    if (/ProgressController\.(openAddModal|confirmDelete)\(/.test(inlineAction)) return 'progress.write';
    if (element.id === 'markAllPresentBtn') return 'labour.attendance';
    const form = element.closest('form');
    return form ? FORM_CAPABILITIES[form.id] || null : null;
  }

  function applyRoleAccess() {
    const role = window.BuildTrack.currentRole;
    const access = ROLE_ACCESS[role];
    if (!access) return;

    document.querySelectorAll('.nav-item-link[data-view]').forEach(link => {
      const restricted = !access.views.includes(link.dataset.view);
      link.classList.toggle('role-access-hidden', restricted);
      link.closest('li')?.classList.toggle('role-access-hidden', restricted);
    });
    document.querySelectorAll('.nav-section-title').forEach(title => {
      const navList = title.nextElementSibling;
      if (navList && navList.classList.contains('sidebar-nav-list')) {
        title.classList.toggle('role-access-hidden', !navList.querySelector('.nav-item-link:not(.role-access-hidden)'));
      }
    });

    const quickCreate = document.querySelector('.quick-action-dropdown-wrap');
    if (quickCreate) quickCreate.classList.toggle('role-access-hidden', !hasRoleCapability('admin.utilities'));
    const notifications = document.getElementById('topbarNotifBtn')?.parentElement;
    if (notifications) notifications.classList.toggle('role-access-hidden', !hasRoleCapability('admin.utilities'));
    const globalSearch = document.querySelector('.global-search-bar');
    if (globalSearch) globalSearch.classList.toggle('role-access-hidden', !hasRoleCapability('admin.utilities'));

    document.querySelectorAll('.app-layout [onclick], .app-layout [onchange]').forEach(element => {
      const capability = actionCapability(element);
      if (capability) element.classList.toggle('role-access-hidden', !hasRoleCapability(capability));
    });
    Object.keys(FORM_CAPABILITIES).forEach(formId => {
      const form = document.getElementById(formId);
      if (!form) return;
      const restricted = !hasRoleCapability(FORM_CAPABILITIES[formId]);
      form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(button => {
        button.classList.toggle('role-access-hidden', restricted);
      });
    });
  }

  function setMobileNavOpen(isOpen) {
    const sidebar = document.getElementById('mainSidebar');
    const menuButton = document.getElementById('mobileMenuBtn');
    if (!sidebar) return;
    sidebar.classList.toggle('mobile-open', isOpen);
    document.body.classList.toggle('mobile-nav-open', isOpen);
    if (menuButton) {
      menuButton.setAttribute('aria-expanded', String(isOpen));
      menuButton.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    }
  }

  // Master Global BuildTrack Object
  window.BuildTrack = {
    currentView: 'dashboard',
    currentProjectId: 'all',
    currentRole: null,
    currentClientIdentity: null,
    isClientRole: function () {
      return this.currentRole === 'Client / Project Owner';
    },
    getClientProjectAssignments: getClientProjectAssignments,
    getClientIdentities: function () {
      return Object.keys(getClientProjectAssignments()).sort((a, b) => a.localeCompare(b));
    },
    getClientProjectIds: function (clientName = this.currentClientIdentity) {
      return getClientProjectAssignments()[clientName] || [];
    },
    getVisibleProjects: function () {
      const projects = window.DataStore.getProjects();
      if (!this.isClientRole()) return projects;
      const assignedIds = new Set(this.getClientProjectIds());
      return projects.filter(project => assignedIds.has(project.id));
    },
    filterClientRecords: function (records, projectFilter = 'all', projectIdField = 'projectId', includeUnassigned = false) {
      if (!this.isClientRole()) return records;
      const assignedIds = new Set(this.getClientProjectIds());
      if (projectFilter !== 'all' && !assignedIds.has(projectFilter)) return [];
      return records.filter(record => {
        const projectId = record[projectIdField];
        if (includeUnassigned && !projectId) return true;
        return assignedIds.has(projectId) && (projectFilter === 'all' || projectId === projectFilter);
      });
    },
    canAccessProject: function (projectId) {
      return !this.isClientRole() || this.getClientProjectIds().includes(projectId);
    },
    isSupportedRole: function (role) {
      return Object.prototype.hasOwnProperty.call(ROLE_ACCESS, role);
    },
    
    // Format number to Indian Rupee (₹)
    formatINR: function (val) {
      const num = parseFloat(val);
      if (isNaN(num)) return '₹0';
      
      const isNegative = num < 0;
      const absoluteNum = Math.abs(num);
      
      // Indian numbering grouping format (e.g., 12,50,000)
      const parts = absoluteNum.toFixed(0).split('.');
      let lastThree = parts[0].substring(parts[0].length - 3);
      const otherNumbers = parts[0].substring(0, parts[0].length - 3);
      if (otherNumbers !== '') {
        lastThree = ',' + lastThree;
      }
      const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
      return (isNegative ? '-₹' : '₹') + formatted;
    },

    // Format ISO date (YYYY-MM-DD) to friendly format (e.g. 27 Oct 2026)
    formatDate: function (dateStr) {
      if (!dateStr) return 'N/A';
      try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const date = new Date(parts[0], parts[1] - 1, parts[2]);
          return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        return dateStr;
      } catch (e) {
        return dateStr;
      }
    },

    // Navigation Switcher
    navigateTo: function (viewId) {
      const access = ROLE_ACCESS[this.currentRole];
      if (access && !access.views.includes(viewId)) {
        this.showToast('This prototype role does not have access to that module.', 'warning');
        viewId = access.landingView;
      }
      const targetView = document.getElementById('view-' + viewId);
      if (!targetView) return;

      // Update active view DOM
      document.querySelectorAll('.view-page').forEach(page => page.classList.remove('active'));
      targetView.classList.add('active');

      // Update sidebar active link
      document.querySelectorAll('.nav-item-link').forEach(link => {
        if (link.getAttribute('data-view') === viewId) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });

      this.currentView = viewId;
      window.location.hash = viewId;
      applyRoleAccess();

      // Close mobile sidebar if open
      const sidebar = document.getElementById('mainSidebar');
      if (sidebar && sidebar.classList.contains('mobile-open')) setMobileNavOpen(false);

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Trigger view-activated hook
      window.dispatchEvent(new CustomEvent('buildtrack:viewchanged', { detail: { view: viewId } }));
    },

    // Toast Notifications System
    showToast: function (message, type = 'info', duration = 3500) {
      const container = document.getElementById('toastContainer');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast-message-pill toast-${type}`;
      
      const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-triangle-exclamation',
        info: 'fa-info-circle'
      };

      toast.innerHTML = `
        <div class="toast-icon-wrap"><i class="fa-solid ${icons[type] || 'fa-info-circle'}"></i></div>
        <div class="toast-body-text">${message}</div>
      `;

      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },

    // Modal Manager
    openModal: function (modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return;
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    },

    closeModal: function (modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return;
      modal.classList.remove('active');
      document.body.style.overflow = '';
      
      // Reset forms inside modal if any
      const form = modal.querySelector('form');
      if (form) form.reset();
    },

    // Universal Confirmation Dialog
    showConfirm: function (options) {
      const {
        title = 'Are you sure?',
        message = 'This action cannot be undone.',
        confirmText = 'Confirm Delete',
        confirmClass = 'btn-danger',
        onConfirm = () => {}
      } = options;

      const modal = document.getElementById('confirmActionModal');
      if (!modal) return;

      document.getElementById('confirmModalTitle').textContent = title;
      document.getElementById('confirmModalDesc').textContent = message;
      
      const confirmBtn = document.getElementById('confirmModalActionBtn');
      confirmBtn.textContent = confirmText;
      confirmBtn.className = `btn ${confirmClass}`;

      // Clean old event listeners
      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

      newConfirmBtn.addEventListener('click', () => {
        this.closeModal('confirmActionModal');
        onConfirm();
      });

      this.openModal('confirmActionModal');
    },

    // Refresh Topbar Project Selector
    updateProjectSelector: function () {
      const selector = document.getElementById('globalProjectSelect');
      if (!selector) return;

      const currentVal = selector.value || this.currentProjectId || 'all';
      const projects = this.getVisibleProjects();

      const allLabel = this.isClientRole() ? '📁 All Assigned Projects' : '📁 All Projects (Overview)';
      let html = `<option value="all">${allLabel}</option>`;
      projects.forEach(p => {
        html += `<option value="${p.id}">${p.name}</option>`;
      });

      selector.innerHTML = html;
      selector.value = [...selector.options].some(option => option.value === currentVal) ? currentVal : 'all';

      const projectsBadge = document.getElementById('sidebarProjectsBadge');
      if (projectsBadge) projectsBadge.textContent = projects.length;
    },

    // Refresh Dynamic Notification Center
    updateNotifications: function () {
      const container = document.getElementById('notifItemsList');
      const badge = document.getElementById('topbarNotifBadge');
      if (!container || !badge) return;

      const tasks = window.DataStore.getTasks();
      const materials = window.DataStore.getMaterials();
      const projects = window.DataStore.getProjects();
      const today = new Date().toISOString().split('T')[0];

      const alerts = [];

      // Check overdue tasks
      tasks.forEach(t => {
        if (t.status !== 'completed' && t.dueDate < today) {
          alerts.push({
            id: 'notif-' + t.id,
            type: 'critical',
            icon: 'fa-triangle-exclamation text-rose',
            title: `Overdue Task: ${t.title}`,
            time: `Due on ${this.formatDate(t.dueDate)}`,
            view: 'tasks'
          });
        }
      });

      // Check low stock materials
      materials.forEach(m => {
        if (m.quantity <= m.minStockLevel) {
          alerts.push({
            id: 'notif-' + m.id,
            type: 'warning',
            icon: 'fa-box-open text-amber',
            title: `Low Stock: ${m.name}`,
            time: `Stock: ${m.quantity} ${m.unit} (Min: ${m.minStockLevel})`,
            view: 'materials'
          });
        }
      });

      // Check budget overrun projects
      projects.forEach(p => {
        const util = (p.spent / p.budget) * 100;
        if (util > 90 && p.progress < 75) {
          alerts.push({
            id: 'notif-' + p.id,
            type: 'critical',
            icon: 'fa-chart-pie text-rose',
            title: `Budget Risk: ${p.name}`,
            time: `${util.toFixed(1)}% spent with ${p.progress}% progress`,
            view: 'risks'
          });
        }
      });

      badge.textContent = alerts.length;
      badge.style.display = alerts.length > 0 ? 'flex' : 'none';

      if (alerts.length === 0) {
        container.innerHTML = `
          <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
            <i class="fa-solid fa-bell-slash" style="font-size: 1.5rem; margin-bottom: 0.5rem; opacity: 0.5;"></i>
            <p>No critical warnings. All systems operational.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = alerts.map(a => `
        <div class="notif-item-row unread" onclick="BuildTrack.navigateTo('${a.view}'); document.getElementById('notifDropdownPanel').classList.remove('show');">
          <div style="font-size: 1.1rem; padding-top: 2px;">
            <i class="fa-solid ${a.icon}"></i>
          </div>
          <div style="flex: 1;">
            <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-main); line-height: 1.3;">${a.title}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">${a.time}</div>
          </div>
        </div>
      `).join('');
    }
  };

  // Initialization & Event Bindings
  document.addEventListener('DOMContentLoaded', function () {
    // 1. Always start at sign-in. LocalStorage can contain a profile from an
    // earlier prototype login, but it is not proof of an active session.
    const authOverlay = document.getElementById('authOverlay');
    const appLayout = document.querySelector('.app-layout');
    authOverlay.classList.remove('hidden');
    if (appLayout) appLayout.classList.add('auth-locked');

    // Reapply role visibility as existing controllers replace dynamic lists.
    if (appLayout && window.MutationObserver) {
      const roleObserver = new MutationObserver(applyRoleAccess);
      roleObserver.observe(appLayout, { childList: true, subtree: true });
    }

    document.addEventListener('click', function (event) {
      const action = event.target.closest('[onclick], #markAllPresentBtn');
      const capability = action && actionCapability(action);
      if (capability && !hasRoleCapability(capability)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.BuildTrack.showToast('This action is unavailable for the selected prototype role.', 'warning');
      }
    }, true);

    document.addEventListener('change', function (event) {
      const action = event.target.closest('[onchange]');
      const capability = action && actionCapability(action);
      if (capability && !hasRoleCapability(capability)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.BuildTrack.showToast('This action is unavailable for the selected prototype role.', 'warning');
      }
    }, true);

    document.addEventListener('submit', function (event) {
      const capability = FORM_CAPABILITIES[event.target.id];
      if (capability && !hasRoleCapability(capability)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.BuildTrack.showToast('This action is unavailable for the selected prototype role.', 'warning');
      }
    }, true);

    // 2. Initialize Topbar Selectors
    window.BuildTrack.updateProjectSelector();
    window.BuildTrack.updateNotifications();

    // 3. Setup Hash Route
    const initialHash = window.location.hash.replace('#', '') || 'dashboard';
    window.BuildTrack.navigateTo(initialHash);

    // 4. Global Navigation Clicks
    document.querySelectorAll('.nav-item-link').forEach(link => {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        const view = this.getAttribute('data-view');
        if (view) window.BuildTrack.navigateTo(view);
      });
    });

    // 5. Sidebar Toggle (Desktop Collapse & Mobile Open)
    const sidebar = document.getElementById('mainSidebar');
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }

    if (mobileMenuBtn && sidebar) {
      mobileMenuBtn.addEventListener('click', () => {
        setMobileNavOpen(!sidebar.classList.contains('mobile-open'));
      });
    }
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', () => setMobileNavOpen(false));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && sidebar?.classList.contains('mobile-open')) setMobileNavOpen(false);
    });
    sidebar?.querySelector('.brand-link')?.addEventListener('click', () => setMobileNavOpen(false));

    // 6. Global Project Filter Change
    const projectSelect = document.getElementById('globalProjectSelect');
    if (projectSelect) {
      projectSelect.addEventListener('change', function () {
        window.BuildTrack.currentProjectId = this.value;
        window.dispatchEvent(new CustomEvent('buildtrack:projectfilterchanged', {
          detail: { projectId: this.value }
        }));
        window.BuildTrack.showToast(`Active project filter set to: ${this.options[this.selectedIndex].text}`, 'info', 2000);
      });
    }

    // 7. Quick Create Action Dropdown
    const quickCreateBtn = document.getElementById('quickCreateBtn');
    const quickMenu = document.getElementById('quickCreateDropdownMenu');
    if (quickCreateBtn && quickMenu) {
      quickCreateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        quickMenu.classList.toggle('show');
      });
    }

    // 8. Notification Bell Dropdown
    const notifBtn = document.getElementById('topbarNotifBtn');
    const notifPanel = document.getElementById('notifDropdownPanel');
    if (notifBtn && notifPanel) {
      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifPanel.classList.toggle('show');
      });
    }

    // Close open dropdowns on document click
    document.addEventListener('click', () => {
      if (quickMenu) quickMenu.classList.remove('show');
      if (notifPanel) notifPanel.classList.remove('show');
    });

    // 9. Global Modal Backdrop & Close Handlers
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', function (e) {
        if (e.target === this) {
          window.BuildTrack.closeModal(this.id);
        }
      });

      const closeBtns = modal.querySelectorAll('.modal-close-x, [data-close-modal]');
      closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          window.BuildTrack.closeModal(modal.id);
        });
      });
    });

    // 10. Listen to Data Changes to refresh common components
    window.addEventListener('buildtrack:datachanged', function () {
      window.BuildTrack.updateProjectSelector();
      window.BuildTrack.updateNotifications();
    });

    // 11. Auth Form Handling
    setupAuthListeners();

    // Restore only the remembered email address; never persist the password.
    const rememberedEmail = localStorage.getItem('buildtrack_remembered_email');
    const emailInput = document.getElementById('loginEmail');
    const rememberMe = document.getElementById('rememberMe');
    if (rememberedEmail && emailInput && rememberMe) {
      emailInput.value = rememberedEmail;
      rememberMe.checked = true;
    }
  });

  // UI User Profile updater
  function updateUserProfileUI(user) {
    if (!user) return;
    const nameEls = document.querySelectorAll('.user-display-name, .topbar-user-name');
    const roleEls = document.querySelectorAll('.user-role-badge');
    const avatarEls = document.querySelectorAll('.user-avatar-circle, .topbar-avatar');

    nameEls.forEach(el => el.textContent = user.name);
    roleEls.forEach(el => el.textContent = user.role);
    
    // Initials
    const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'BT';
    avatarEls.forEach(el => el.textContent = initials);
  }

  // Setup Authentication Listeners
  function setupAuthListeners() {
    const loginForm = document.getElementById('loginForm');
    const authOverlay = document.getElementById('authOverlay');
    const roleSelector = document.getElementById('loginRole');
    const clientIdentityGroup = document.getElementById('clientIdentityGroup');
    const clientIdentitySelector = document.getElementById('loginClientIdentity');

    function refreshClientIdentityOptions() {
      if (!clientIdentitySelector) return;
      const currentIdentity = clientIdentitySelector.value;
      const identities = window.BuildTrack.getClientIdentities();
      clientIdentitySelector.innerHTML = '<option value="">Select a client</option>' + identities.map(name =>
        `<option value="${name}">${name}</option>`
      ).join('');
      if (identities.includes(currentIdentity)) clientIdentitySelector.value = currentIdentity;
    }

    function updateClientIdentityField() {
      const isClient = roleSelector?.value === 'Client / Project Owner';
      if (clientIdentityGroup) clientIdentityGroup.hidden = !isClient;
      if (clientIdentitySelector) {
        clientIdentitySelector.required = !!isClient;
        if (!isClient) clientIdentitySelector.value = '';
      }
    }

    refreshClientIdentityOptions();
    updateClientIdentityField();
    roleSelector?.addEventListener('change', updateClientIdentityField);

    // Show/Hide Password
    document.querySelectorAll('.password-toggle-eye').forEach(eye => {
      eye.addEventListener('click', function () {
        const input = this.previousElementSibling;
        const icon = this.querySelector('i');
        if (input && input.type === 'password') {
          input.type = 'text';
          this.setAttribute('aria-label', 'Hide password');
          this.setAttribute('aria-pressed', 'true');
          if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
        } else if (input) {
          input.type = 'password';
          this.setAttribute('aria-label', 'Show password');
          this.setAttribute('aria-pressed', 'false');
          if (icon) { icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
        }
      });
    });

    // Login Form Submit
    if (loginForm) {
      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;
        const role = document.getElementById('loginRole').value;
        const rememberEmail = document.getElementById('rememberMe').checked;
        const clientIdentity = clientIdentitySelector?.value || '';

        if (role === 'Client / Project Owner' && !window.BuildTrack.getClientProjectIds(clientIdentity).length) {
          window.BuildTrack.showToast('Choose a client with an assigned project to continue.', 'error');
          return;
        }

        const res = window.DataStore.login(email, pass, role);
        if (res.success) {
          if (rememberEmail) localStorage.setItem('buildtrack_remembered_email', email.trim());
          else localStorage.removeItem('buildtrack_remembered_email');
          window.BuildTrack.currentRole = res.user.role;
          window.BuildTrack.currentClientIdentity = role === 'Client / Project Owner' ? clientIdentity : null;
          window.BuildTrack.currentProjectId = 'all';
          applyRoleAccess();
          window.BuildTrack.updateProjectSelector();
          window.dispatchEvent(new CustomEvent('buildtrack:clientchanged', {
            detail: { clientName: window.BuildTrack.currentClientIdentity }
          }));
          authOverlay.classList.add('hidden');
          document.querySelector('.app-layout')?.classList.remove('auth-locked');
          const displayUser = role === 'Client / Project Owner'
            ? { ...res.user, name: clientIdentity }
            : res.user;
          updateUserProfileUI(displayUser);
          window.BuildTrack.showToast(`Welcome back, ${displayUser.name}!`, 'success');
          window.BuildTrack.navigateTo(ROLE_ACCESS[res.user.role].landingView);
        } else {
          window.BuildTrack.showToast(res.message, 'error');
        }
      });
    }

    // Logout Action
    document.querySelectorAll('.user-logout-quick-btn, #logoutActionBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.BuildTrack.showConfirm({
          title: 'Sign Out of BuildTrack?',
          message: 'Are you sure you want to log out of the construction management portal?',
          confirmText: 'Log Out',
          confirmClass: 'btn-outline',
          onConfirm: () => {
            window.DataStore.logout();
            window.BuildTrack.currentRole = null;
            window.BuildTrack.currentClientIdentity = null;
            window.BuildTrack.currentProjectId = 'all';
            window.BuildTrack.updateProjectSelector();
            document.querySelector('.app-layout')?.classList.add('auth-locked');
            document.getElementById('loginPassword').value = '';
            authOverlay.classList.remove('hidden');
            window.BuildTrack.showToast('You have been logged out safely.', 'info');
          }
        });
      });
    });
  }

})();
