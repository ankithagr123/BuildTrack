/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Settings Controller: Contractor Profile, INR Currency Preferences, Notifications & Data Reset
 */

(function () {
  'use strict';

  function initSettings() {
    loadSettingsData();
    setupEventHandlers();
  }

  function loadSettingsData() {
    const settings = window.DataStore.getSettings();
    const user = window.DataStore.getUser();

    // Populate Company Profile
    setVal('settingsCompanyName', settings.companyName);
    setVal('settingsContractorName', settings.contractorName);
    setVal('settingsEmail', settings.email);
    setVal('settingsPhone', settings.phone);
    setVal('settingsGstin', settings.gstin);
    setVal('settingsLicense', settings.licenseNumber);

    // Populate User Profile
    setVal('profileUserName', user.name);
    setVal('profileUserEmail', user.email);
    setVal('profileUserRole', user.role);

    // Populate Preferences
    const themeSelect = document.getElementById('settingsThemeSelect');
    if (themeSelect) themeSelect.value = settings.theme || 'light';

    const notifThreshold = document.getElementById('settingsBudgetThreshold');
    if (notifThreshold) notifThreshold.value = settings.notifications?.budgetThreshold || 85;
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.value = val;
  }

  function setupEventHandlers() {
    const companyForm = document.getElementById('companySettingsForm');
    const profileForm = document.getElementById('userProfileForm');
    const resetDataBtn = document.getElementById('resetDemoDataBtn');
    const themeSelect = document.getElementById('settingsThemeSelect');

    if (companyForm) {
      companyForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const settings = window.DataStore.getSettings();
        settings.companyName = document.getElementById('settingsCompanyName').value.trim();
        settings.contractorName = document.getElementById('settingsContractorName').value.trim();
        settings.email = document.getElementById('settingsEmail').value.trim();
        settings.phone = document.getElementById('settingsPhone').value.trim();
        settings.gstin = document.getElementById('settingsGstin').value.trim();
        settings.licenseNumber = document.getElementById('settingsLicense').value.trim();
        settings.notifications.budgetThreshold = parseInt(document.getElementById('settingsBudgetThreshold').value, 10) || 85;

        window.DataStore.saveSettings(settings);
        window.BuildTrack.showToast('Contractor firm profile updated successfully!', 'success');
      });
    }

    if (profileForm) {
      profileForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const user = window.DataStore.getUser();
        user.name = document.getElementById('profileUserName').value.trim();
        user.email = document.getElementById('profileUserEmail').value.trim();
        user.role = document.getElementById('profileUserRole').value.trim();

        window.DataStore.saveUser(user);
        
        // Update UI names
        document.querySelectorAll('.user-display-name, .topbar-user-name').forEach(el => el.textContent = user.name);
        document.querySelectorAll('.user-role-badge').forEach(el => el.textContent = user.role);

        window.BuildTrack.showToast('User credentials & title updated!', 'success');
      });
    }

    if (themeSelect) {
      themeSelect.addEventListener('change', function () {
        if (this.value === 'dark') {
          document.body.classList.add('theme-dark');
        } else {
          document.body.classList.remove('theme-dark');
        }
        window.BuildTrack.showToast(`Theme switched to ${this.value} mode.`, 'info');
      });
    }

    if (resetDataBtn) {
      resetDataBtn.addEventListener('click', () => {
        window.BuildTrack.showConfirm({
          title: 'Reset All Demo Data to Defaults?',
          message: 'This will erase all custom additions and restore the pristine 5 construction projects, tasks, labour rosters, inventory, and expense ledgers.',
          confirmText: 'Reset Demo Data',
          confirmClass: 'btn-danger',
          onConfirm: () => {
            window.DataStore.resetToDefault();
            window.BuildTrack.showToast('All sample projects & records restored to initial state!', 'success');
            loadSettingsData();
            window.BuildTrack.navigateTo('dashboard');
          }
        });
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'settings') {
        loadSettingsData();
      }
    });

    initSettings();
  });

  window.SettingsController = {
    load: loadSettingsData
  };
})();
