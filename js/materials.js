/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Materials Controller: Inventory Catalog, Stock In / Out Log, Negative Stock Prevention & Valuation
 */

(function () {
  'use strict';

  let activeMaterialHistoryId = null;

  function initMaterials() {
    renderMaterialsView();
    setupEventHandlers();
  }

  function renderMaterialsView() {
    const selectedProjectId = window.BuildTrack.currentProjectId || 'all';
    const materials = window.DataStore.getMaterials(selectedProjectId);
    const projects = window.DataStore.getProjects();

    const searchInput = document.getElementById('materialSearchInput');
    const categoryFilter = document.getElementById('materialCategoryFilter');
    const statusFilter = document.getElementById('materialStockStatusFilter');

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const category = categoryFilter ? categoryFilter.value : 'all';
    const stockStatus = statusFilter ? statusFilter.value : 'all';

    // Filter
    const filtered = materials.filter(m => {
      const matchQuery = (m.name && m.name.toLowerCase().includes(query)) ||
                         (m.supplier && m.supplier.toLowerCase().includes(query));
      const matchCat = (category === 'all') || (m.category === category);
      
      let matchStatus = true;
      if (stockStatus === 'low') {
        matchStatus = m.quantity > 0 && m.quantity <= m.minStockLevel;
      } else if (stockStatus === 'out') {
        matchStatus = m.quantity <= 0;
      } else if (stockStatus === 'healthy') {
        matchStatus = m.quantity > m.minStockLevel;
      }

      return matchQuery && matchCat && matchStatus;
    });

    // Summary KPIs
    const totalItems = materials.length;
    let totalValuation = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    materials.forEach(m => {
      totalValuation += (m.quantity * (parseFloat(m.unitPrice) || 0));
      if (m.quantity <= 0) outOfStockCount++;
      else if (m.quantity <= m.minStockLevel) lowStockCount++;
    });

    setElText('matTotalItems', totalItems);
    setElText('matTotalValuation', window.BuildTrack.formatINR(totalValuation));
    setElText('matLowStockCount', lowStockCount);
    setElText('matOutOfStockCount', outOfStockCount);

    // Render Table
    const tbody = document.getElementById('materialsTableBody');
    if (tbody) {
      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No construction materials matching filters.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(m => {
        const proj = projects.find(p => p.id === m.assignedProjectId);
        const isOutOfStock = m.quantity <= 0;
        const isLowStock = !isOutOfStock && m.quantity <= m.minStockLevel;
        const totalValue = m.quantity * m.unitPrice;

        let statusBadge = '<span class="status-badge badge-completed">In Stock</span>';
        if (isOutOfStock) {
          statusBadge = '<span class="status-badge badge-delayed">Out of Stock</span>';
        } else if (isLowStock) {
          statusBadge = '<span class="status-badge" style="background: #fef3c7; color: #92400e;">Low Stock</span>';
        }

        return `
          <tr>
            <td>
              <div style="font-weight: 700; color: var(--text-main);">${m.name}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${m.id} • ${m.supplier}</div>
            </td>
            <td><span class="meta-pill-item">${m.category}</span></td>
            <td>
              <div style="font-size: 0.95rem; font-weight: 800; color: ${isOutOfStock ? 'var(--accent-rose)' : (isLowStock ? 'var(--accent-amber)' : 'var(--text-main)')};">
                ${m.quantity} ${m.unit}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">Min Threshold: ${m.minStockLevel} ${m.unit}</div>
            </td>
            <td>${statusBadge}</td>
            <td style="font-weight: 600;">${window.BuildTrack.formatINR(m.unitPrice)}</td>
            <td style="font-weight: 700;">${window.BuildTrack.formatINR(totalValue)}</td>
            <td>${proj ? proj.name.substring(0, 16) + '...' : 'Global Yard'}</td>
            <td>
              <div class="table-actions-cell">
                <!-- Stock In / Out Operations -->
                <button class="btn btn-sm btn-outline" style="color: var(--accent-emerald);" onclick="MaterialsController.openStockActionModal('${m.id}', 'in')" title="Receive Inbound Stock">
                  <i class="fa-solid fa-arrow-down"></i> In
                </button>
                <button class="btn btn-sm btn-outline" style="color: var(--accent-orange);" onclick="MaterialsController.openStockActionModal('${m.id}', 'out')" title="Consume / Issue Stock">
                  <i class="fa-solid fa-arrow-up"></i> Out
                </button>
                <button class="btn btn-icon-only btn-outline" onclick="MaterialsController.viewHistory('${m.id}')" title="Usage Log">
                  <i class="fa-solid fa-clock-rotate-left"></i>
                </button>
                <button class="btn btn-icon-only btn-outline" onclick="MaterialsController.openEditModal('${m.id}')" title="Edit">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-icon-only btn-outline" style="color: var(--accent-rose);" onclick="MaterialsController.confirmDelete('${m.id}')" title="Delete">
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

  function setupEventHandlers() {
    const searchInput = document.getElementById('materialSearchInput');
    const categoryFilter = document.getElementById('materialCategoryFilter');
    const statusFilter = document.getElementById('materialStockStatusFilter');
    const materialForm = document.getElementById('materialAddEditForm');
    const stockActionForm = document.getElementById('materialStockActionForm');

    if (searchInput) searchInput.addEventListener('input', renderMaterialsView);
    if (categoryFilter) categoryFilter.addEventListener('change', renderMaterialsView);
    if (statusFilter) statusFilter.addEventListener('change', renderMaterialsView);

    // Add / Edit Material submit
    if (materialForm) {
      materialForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const id = document.getElementById('matFormId').value;
        const name = document.getElementById('matFormName').value.trim();
        const category = document.getElementById('matFormCategory').value;
        const unit = document.getElementById('matFormUnit').value.trim();
        const quantity = parseFloat(document.getElementById('matFormQuantity').value) || 0;
        const minStockLevel = parseFloat(document.getElementById('matFormMinStock').value) || 0;
        const unitPrice = parseFloat(document.getElementById('matFormUnitPrice').value) || 0;
        const supplier = document.getElementById('matFormSupplier').value.trim();
        const projectId = document.getElementById('matFormProject').value;

        if (!name || quantity < 0 || minStockLevel < 0 || unitPrice < 0) {
          window.BuildTrack.showToast('Please provide valid material details with positive quantities/prices.', 'error');
          return;
        }

        const materialData = {
          id: id || undefined,
          name,
          category,
          unit: unit || 'Units',
          quantity,
          minStockLevel,
          unitPrice,
          supplier: supplier || 'Authorized Supplier',
          assignedProjectId: projectId,
          lastUpdated: new Date().toISOString().split('T')[0]
        };

        window.DataStore.saveMaterial(materialData);
        window.BuildTrack.closeModal('materialModal');
        window.BuildTrack.showToast(`Material "${name}" inventory updated!`, 'success');
        renderMaterialsView();
      });
    }

    // Stock Action (In / Out) Submit
    if (stockActionForm) {
      stockActionForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const materialId = document.getElementById('stockActionMaterialId').value;
        const type = document.getElementById('stockActionType').value;
        const quantity = parseFloat(document.getElementById('stockActionQuantity').value);
        const projectId = document.getElementById('stockActionProject').value;
        const notes = document.getElementById('stockActionNotes').value.trim();

        if (isNaN(quantity) || quantity <= 0) {
          window.BuildTrack.showToast('Please enter a valid positive quantity.', 'error');
          return;
        }

        const res = window.DataStore.recordMaterialStock(materialId, type, quantity, notes, projectId);
        if (!res.success) {
          window.BuildTrack.showToast(res.message, 'error');
          return;
        }

        window.BuildTrack.closeModal('materialStockActionModal');
        window.BuildTrack.showToast(
          type === 'in' ? `Received +${quantity} units to inventory!` : `Issued -${quantity} units to site consumption.`,
          'success'
        );
        renderMaterialsView();
      });
    }
  }

  function openStockActionModal(materialId, type) {
    const m = window.DataStore.getMaterial(materialId);
    if (!m) return;

    document.getElementById('stockActionMaterialId').value = m.id;
    document.getElementById('stockActionType').value = type;
    document.getElementById('stockActionModalTitle').textContent = type === 'in' ? 
      `Inbound Stock Supply: ${m.name}` : `Site Material Consumption: ${m.name}`;
    document.getElementById('stockActionUnitLabel').textContent = m.unit;
    document.getElementById('stockActionQuantity').value = '';
    document.getElementById('stockActionNotes').value = '';

    // Populate project dropdown
    const projDropdown = document.getElementById('stockActionProject');
    if (projDropdown) {
      const projects = window.DataStore.getProjects();
      projDropdown.innerHTML = projects.map(p => `
        <option value="${p.id}" ${p.id === m.assignedProjectId ? 'selected' : ''}>${p.name}</option>
      `).join('');
    }

    window.BuildTrack.openModal('materialStockActionModal');
  }

  function viewHistory(materialId) {
    const m = window.DataStore.getMaterial(materialId);
    if (!m) return;

    activeMaterialHistoryId = materialId;
    document.getElementById('historyMaterialName').textContent = m.name;
    const listContainer = document.getElementById('materialHistoryList');

    if (!m.usageHistory || m.usageHistory.length === 0) {
      listContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No transaction logs recorded for this item yet.</p>`;
    } else {
      listContainer.innerHTML = m.usageHistory.map(h => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--border-color);">
          <div>
            <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main);">${h.notes}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${window.BuildTrack.formatDate(h.date)}</div>
          </div>
          <span style="font-weight: 700; font-size: 0.9rem; color: ${h.type === 'in' ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
            ${h.type === 'in' ? '+' : '-'}${h.quantity} ${m.unit}
          </span>
        </div>
      `).join('');
    }

    window.BuildTrack.openModal('materialHistoryModal');
  }

  function openAddModal() {
    const form = document.getElementById('materialAddEditForm');
    if (form) form.reset();

    document.getElementById('materialModalTitle').textContent = 'Add Construction Material';
    document.getElementById('matFormId').value = '';
    
    populateMaterialProjectDropdown();
    window.BuildTrack.openModal('materialModal');
  }

  function openEditModal(materialId) {
    const m = window.DataStore.getMaterial(materialId);
    if (!m) return;

    populateMaterialProjectDropdown();
    document.getElementById('materialModalTitle').textContent = 'Edit Material Specs';
    document.getElementById('matFormId').value = m.id;
    document.getElementById('matFormName').value = m.name;
    document.getElementById('matFormCategory').value = m.category;
    document.getElementById('matFormUnit').value = m.unit;
    document.getElementById('matFormQuantity').value = m.quantity;
    document.getElementById('matFormMinStock').value = m.minStockLevel;
    document.getElementById('matFormUnitPrice').value = m.unitPrice;
    document.getElementById('matFormSupplier').value = m.supplier;
    document.getElementById('matFormProject').value = m.assignedProjectId || '';

    window.BuildTrack.openModal('materialModal');
  }

  function populateMaterialProjectDropdown() {
    const dropdown = document.getElementById('matFormProject');
    if (!dropdown) return;

    const projects = window.DataStore.getProjects();
    dropdown.innerHTML = '<option value="">Global Central Yard</option>' + projects.map(p => `
      <option value="${p.id}">${p.name}</option>
    `).join('');

    if (window.BuildTrack.currentProjectId && window.BuildTrack.currentProjectId !== 'all') {
      dropdown.value = window.BuildTrack.currentProjectId;
    }
  }

  function confirmDelete(materialId) {
    const m = window.DataStore.getMaterial(materialId);
    if (!m) return;

    window.BuildTrack.showConfirm({
      title: `Delete Material "${m.name}"?`,
      message: 'This material will be removed from site inventory calculations.',
      confirmText: 'Delete Item',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        window.DataStore.deleteMaterial(materialId);
        window.BuildTrack.showToast(`Material "${m.name}" deleted.`, 'info');
        renderMaterialsView();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('buildtrack:viewchanged', (e) => {
      if (e.detail.view === 'materials') {
        renderMaterialsView();
      }
    });

    window.addEventListener('buildtrack:datachanged', () => {
      if (window.BuildTrack.currentView === 'materials') {
        renderMaterialsView();
      }
    });

    window.addEventListener('buildtrack:projectfilterchanged', () => {
      if (window.BuildTrack.currentView === 'materials') {
        renderMaterialsView();
      }
    });

    initMaterials();
  });

  window.MaterialsController = {
    render: renderMaterialsView,
    openAddModal: openAddModal,
    openEditModal: openEditModal,
    openStockActionModal: openStockActionModal,
    viewHistory: viewHistory,
    confirmDelete: confirmDelete
  };
})();
