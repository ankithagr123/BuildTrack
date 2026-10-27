/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Core App Coordinator, Router, Utilities, Toast, Confirmation, & Auth Management
 */

(function () {
  'use strict';

  // Master Global BuildTrack Object
  window.BuildTrack = {
    currentView: 'dashboard',
    currentProjectId: 'all',
    
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

      // Close mobile sidebar if open
      const sidebar = document.getElementById('mainSidebar');
      if (sidebar && sidebar.classList.contains('mobile-open')) {
        sidebar.classList.remove('mobile-open');
      }

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
      const projects = window.DataStore.getProjects();

      let html = '<option value="all">📁 All Projects (Overview)</option>';
      projects.forEach(p => {
        html += `<option value="${p.id}">${p.name}</option>`;
      });

      selector.innerHTML = html;
      selector.value = currentVal;
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
    // 1. Check Auth
    const currentUser = window.DataStore.getUser();
    const authOverlay = document.getElementById('authOverlay');
    
    if (window.DataStore.isLoggedIn()) {
      authOverlay.classList.add('hidden');
      updateUserProfileUI(currentUser);
    } else {
      authOverlay.classList.remove('hidden');
    }

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

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }

    if (mobileMenuBtn && sidebar) {
      mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
      });
    }

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

    // 12. Quick Autofill Demo Credentials
    setupDemoCredentials();
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
    const registerForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('tabAuthLogin');
    const tabRegister = document.getElementById('tabAuthRegister');
    const authOverlay = document.getElementById('authOverlay');

    // Switch between Login and Register tabs
    if (tabLogin && tabRegister) {
      tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        if (loginForm) loginForm.style.display = 'block';
        if (registerForm) registerForm.style.display = 'none';
      });

      tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'block';
      });
    }

    // Show/Hide Password
    document.querySelectorAll('.password-toggle-eye').forEach(eye => {
      eye.addEventListener('click', function () {
        const input = this.previousElementSibling;
        if (input && input.type === 'password') {
          input.type = 'text';
          this.classList.remove('fa-eye');
          this.classList.add('fa-eye-slash');
        } else if (input) {
          input.type = 'password';
          this.classList.remove('fa-eye-slash');
          this.classList.add('fa-eye');
        }
      });
    });

    // Login Form Submit
    if (loginForm) {
      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;

        const res = window.DataStore.login(email, pass);
        if (res.success) {
          authOverlay.classList.add('hidden');
          updateUserProfileUI(res.user);
          window.BuildTrack.showToast(`Welcome back, ${res.user.name}!`, 'success');
          window.BuildTrack.navigateTo('dashboard');
        } else {
          window.BuildTrack.showToast(res.message, 'error');
        }
      });
    }

    // Register Form Submit
    if (registerForm) {
      registerForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const name = document.getElementById('regName').value;
        const email = document.getElementById('regEmail').value;
        const role = document.getElementById('regRole').value;
        const pass = document.getElementById('regPassword').value;

        if (!name || !email || pass.length < 6) {
          window.BuildTrack.showToast('Please provide valid details (Password min 6 characters).', 'warning');
          return;
        }

        const user = { name, email, role, avatar: 'assets/avatar.png' };
        window.DataStore.saveUser(user);
        authOverlay.classList.add('hidden');
        updateUserProfileUI(user);
        window.BuildTrack.showToast(`Account created successfully! Welcome to BuildTrack.`, 'success');
        window.BuildTrack.navigateTo('dashboard');
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
            authOverlay.classList.remove('hidden');
            window.BuildTrack.showToast('You have been logged out safely.', 'info');
          }
        });
      });
    });
  }

  // Quick Demo Credentials Autofill
  function setupDemoCredentials() {
    const fillAdminBtn = document.getElementById('fillAdminCreds');
    const fillEngBtn = document.getElementById('fillEngineerCreds');

    if (fillAdminBtn) {
      fillAdminBtn.addEventListener('click', () => {
        document.getElementById('loginEmail').value = 'admin@buildtrack.com';
        document.getElementById('loginPassword').value = 'admin123';
        window.BuildTrack.showToast('Admin demo credentials populated!', 'info', 1500);
      });
    }

    if (fillEngBtn) {
      fillEngBtn.addEventListener('click', () => {
        document.getElementById('loginEmail').value = 'engineer@buildtrack.com';
        document.getElementById('loginPassword').value = 'build2026';
        window.BuildTrack.showToast('Site Engineer credentials populated!', 'info', 1500);
      });
    }
  }

})();
