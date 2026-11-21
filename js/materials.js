/**
 * BuildTrack - Materials Controller
 * Flask API + SQLite Integration
 */

(function () {
    'use strict';

    const API = 'http://127.0.0.1:5000/api/materials';

    let materialsCache = [];
    let activeMaterialHistoryId = null;

    // API REQUEST HELPER
    async function apiRequest(url, method = 'GET', data = null) {
        const options = { method };

        if (data) {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Request failed');
        }

        return result;
    }

    // LOAD MATERIALS FROM SQLITE
    async function loadMaterials() {
        try {
            materialsCache = await apiRequest(API);
            renderMaterialsView();
        } catch (error) {
            console.error(error);
            window.BuildTrack.showToast(
                'Unable to load materials. Check backend connection.',
                'error'
            );
        }
    }

    function initMaterials() {
        setupEventHandlers();
        loadMaterials();
    }

    // RENDER MATERIALS
    function renderMaterialsView() {
        const selectedProjectId =
            window.BuildTrack.currentProjectId || 'all';

        const projects = window.DataStore.getProjects();

        const searchInput =
            document.getElementById('materialSearchInput');

        const categoryFilter =
            document.getElementById('materialCategoryFilter');

        const statusFilter =
            document.getElementById('materialStockStatusFilter');

        const query = searchInput
            ? searchInput.value.toLowerCase().trim()
            : '';

        const category = categoryFilter
            ? categoryFilter.value
            : 'all';

        const stockStatus = statusFilter
            ? statusFilter.value
            : 'all';

        const materials = materialsCache.filter(m =>
            selectedProjectId === 'all' ||
            m.assignedProjectId === selectedProjectId
        );

        const filtered = materials.filter(m => {
            const matchQuery =
                (m.name || '').toLowerCase().includes(query) ||
                (m.supplier || '').toLowerCase().includes(query);

            const matchCat =
                category === 'all' || m.category === category;

            let matchStatus = true;

            if (stockStatus === 'low') {
                matchStatus =
                    m.quantity > 0 &&
                    m.quantity <= m.minStockLevel;
            } else if (stockStatus === 'out') {
                matchStatus = m.quantity <= 0;
            } else if (stockStatus === 'healthy') {
                matchStatus = m.quantity > m.minStockLevel;
            }

            return matchQuery && matchCat && matchStatus;
        });

        // SUMMARY
        let totalValuation = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;

        materials.forEach(m => {
            totalValuation +=
                m.quantity * (parseFloat(m.unitPrice) || 0);

            if (m.quantity <= 0) {
                outOfStockCount++;
            } else if (m.quantity <= m.minStockLevel) {
                lowStockCount++;
            }
        });

        setElText('matTotalItems', materials.length);

        setElText(
            'matTotalValuation',
            window.BuildTrack.formatINR(totalValuation)
        );

        setElText('matLowStockCount', lowStockCount);
        setElText('matOutOfStockCount', outOfStockCount);

        // TABLE
        const tbody = document.getElementById('materialsTableBody');

        if (!tbody) return;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:2rem;">
                        No construction materials matching filters.
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(m => {
            const proj = projects.find(
                p => p.id === m.assignedProjectId
            );

            const isOut = m.quantity <= 0;

            const isLow =
                !isOut && m.quantity <= m.minStockLevel;

            const totalValue = m.quantity * m.unitPrice;

            let badge =
                '<span class="status-badge badge-completed">In Stock</span>';

            if (isOut) {
                badge =
                    '<span class="status-badge badge-delayed">Out of Stock</span>';
            } else if (isLow) {
                badge =
                    '<span class="status-badge" style="background:#fef3c7;color:#92400e;">Low Stock</span>';
            }

            return `
                <tr>
                    <td>
                        <div style="font-weight:700;">
                            ${m.name}
                        </div>
                        <div style="font-size:.75rem;color:var(--text-muted);">
                            ${m.id} • ${m.supplier || ''}
                        </div>
                    </td>

                    <td>
                        <span class="meta-pill-item">
                            ${m.category || ''}
                        </span>
                    </td>

                    <td>
                        <div style="font-weight:800;">
                            ${m.quantity} ${m.unit}
                        </div>
                        <div style="font-size:.72rem;color:var(--text-muted);">
                            Min Threshold: ${m.minStockLevel} ${m.unit}
                        </div>
                    </td>

                    <td>${badge}</td>

                    <td>
                        ${window.BuildTrack.formatINR(m.unitPrice)}
                    </td>

                    <td>
                        ${window.BuildTrack.formatINR(totalValue)}
                    </td>

                    <td>
                        ${proj ? proj.name : 'Global Yard'}
                    </td>

                    <td>
                        <div class="table-actions-cell">

                            <button class="btn btn-sm btn-outline"
                                style="color:var(--accent-emerald);"
                                onclick="MaterialsController.openStockActionModal('${m.id}','in')">
                                In
                            </button>

                            <button class="btn btn-sm btn-outline"
                                style="color:var(--accent-orange);"
                                onclick="MaterialsController.openStockActionModal('${m.id}','out')">
                                Out
                            </button>

                            <button class="btn btn-icon-only btn-outline"
                                onclick="MaterialsController.viewHistory('${m.id}')">
                                <i class="fa-solid fa-clock-rotate-left"></i>
                            </button>

                            <button class="btn btn-icon-only btn-outline"
                                onclick="MaterialsController.openEditModal('${m.id}')">
                                <i class="fa-solid fa-pen"></i>
                            </button>

                            <button class="btn btn-icon-only btn-outline"
                                style="color:var(--accent-rose);"
                                onclick="MaterialsController.confirmDelete('${m.id}')">
                                <i class="fa-solid fa-trash"></i>
                            </button>

                        </div>
                    </td>
                </tr>`;
        }).join('');
    }

    function setElText(id, value) {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = value;
        }
    }

    // EVENT HANDLERS
    function setupEventHandlers() {
        const searchInput =
            document.getElementById('materialSearchInput');

        const categoryFilter =
            document.getElementById('materialCategoryFilter');

        const statusFilter =
            document.getElementById('materialStockStatusFilter');

        const materialForm =
            document.getElementById('materialAddEditForm');

        const stockForm =
            document.getElementById('materialStockActionForm');

        if (searchInput) {
            searchInput.addEventListener('input', renderMaterialsView);
        }

        if (categoryFilter) {
            categoryFilter.addEventListener('change', renderMaterialsView);
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', renderMaterialsView);
        }

        // ADD / EDIT MATERIAL
        if (materialForm) {
            materialForm.addEventListener('submit', async function (e) {
                e.preventDefault();

                const id =
                    document.getElementById('matFormId').value;

                const material = {
                    name: document.getElementById('matFormName').value.trim(),
                    category: document.getElementById('matFormCategory').value,
                    unit: document.getElementById('matFormUnit').value.trim(),
                    quantity: Number(document.getElementById('matFormQuantity').value),
                    minStockLevel: Number(document.getElementById('matFormMinStock').value),
                    unitPrice: Number(document.getElementById('matFormUnitPrice').value),
                    supplier: document.getElementById('matFormSupplier').value.trim(),
                    assignedProjectId: document.getElementById('matFormProject').value
                };

                if (
                    !material.name ||
                    !Number.isFinite(material.quantity) ||
                    !Number.isFinite(material.minStockLevel) ||
                    !Number.isFinite(material.unitPrice) ||
                    material.quantity < 0 ||
                    material.minStockLevel < 0 ||
                    material.unitPrice < 0
                ) {
                    window.BuildTrack.showToast(
                        'Please enter valid material details.',
                        'error'
                    );
                    return;
                }

                try {
                    if (id) {
                        await apiRequest(
                            `${API}/${encodeURIComponent(id)}`,
                            'PUT',
                            material
                        );
                    } else {
                        await apiRequest(API, 'POST', material);
                    }

                    window.BuildTrack.closeModal('materialModal');

                    window.BuildTrack.showToast(
                        'Material saved successfully!',
                        'success'
                    );

                    await loadMaterials();

                } catch (error) {
                    window.BuildTrack.showToast(error.message, 'error');
                }
            });
        }

        // STOCK IN / OUT
        if (stockForm) {
            stockForm.addEventListener('submit', async function (e) {
                e.preventDefault();

                const materialId =
                    document.getElementById('stockActionMaterialId').value;

                const type =
                    document.getElementById('stockActionType').value;

                const quantity =
                    Number(document.getElementById('stockActionQuantity').value);

                const projectId =
                    document.getElementById('stockActionProject').value;

                const notes =
                    document.getElementById('stockActionNotes').value.trim();

                if (!Number.isFinite(quantity) || quantity <= 0) {
                    window.BuildTrack.showToast(
                        'Enter a valid positive quantity.',
                        'error'
                    );
                    return;
                }

                try {
                    await apiRequest(
                        `${API}/${encodeURIComponent(materialId)}/stock`,
                        'POST',
                        {
                            action: type,
                            quantity,
                            notes,
                            project_id: projectId
                        }
                    );

                    window.BuildTrack.closeModal(
                        'materialStockActionModal'
                    );

                    window.BuildTrack.showToast(
                        'Stock updated successfully!',
                        'success'
                    );

                    await loadMaterials();

                } catch (error) {
                    window.BuildTrack.showToast(error.message, 'error');
                }
            });
        }
    }

    // FIND MATERIAL
    function getMaterial(id) {
        return materialsCache.find(m => String(m.id) === String(id));
    }

    // OPEN STOCK MODAL
    function openStockActionModal(materialId, type) {
        const m = getMaterial(materialId);

        if (!m) return;

        document.getElementById('stockActionMaterialId').value = m.id;
        document.getElementById('stockActionType').value = type;

        document.getElementById('stockActionModalTitle').textContent =
            type === 'in'
                ? `Inbound Stock Supply: ${m.name}`
                : `Site Material Consumption: ${m.name}`;

        document.getElementById('stockActionUnitLabel').textContent = m.unit;

        document.getElementById('stockActionQuantity').value = '';
        document.getElementById('stockActionNotes').value = '';

        const dropdown =
            document.getElementById('stockActionProject');

        if (dropdown) {
            const projects = window.DataStore.getProjects();

            dropdown.innerHTML = projects.map(p => `
                <option value="${p.id}"
                    ${p.id === m.assignedProjectId ? 'selected' : ''}>
                    ${p.name}
                </option>
            `).join('');
        }

        window.BuildTrack.openModal('materialStockActionModal');
    }

    // VIEW DATABASE HISTORY
    async function viewHistory(materialId) {
        const m = getMaterial(materialId);

        if (!m) return;

        activeMaterialHistoryId = materialId;

        document.getElementById('historyMaterialName').textContent = m.name;

        const container =
            document.getElementById('materialHistoryList');

        container.innerHTML = '<p>Loading transaction history...</p>';

        window.BuildTrack.openModal('materialHistoryModal');

        try {
            const history = await apiRequest(
                `${API}/${encodeURIComponent(materialId)}/history`
            );

            if (!history.length) {
                container.innerHTML = `
                    <p style="text-align:center;padding:1.5rem;">
                        No transaction logs recorded for this item yet.
                    </p>`;
                return;
            }

            container.innerHTML = history.map(h => `
                <div style="display:flex;justify-content:space-between;padding:.75rem 0;border-bottom:1px solid var(--border-color);">
                    <div>
                        <div style="font-weight:600;">
                            ${h.notes || 'Stock transaction'}
                        </div>
                        <div style="font-size:.72rem;color:var(--text-muted);">
                            ${window.BuildTrack.formatDate(h.date)}
                        </div>
                    </div>

                    <span style="font-weight:700;color:${h.type === 'in' ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
                        ${h.type === 'in' ? '+' : '-'}${h.quantity} ${m.unit}
                    </span>
                </div>
            `).join('');

        } catch (error) {
            container.textContent = error.message;
        }
    }

    // ADD MATERIAL MODAL
    function openAddModal() {
        const form =
            document.getElementById('materialAddEditForm');

        if (form) form.reset();

        document.getElementById('materialModalTitle').textContent =
            'Add Construction Material';

        document.getElementById('matFormId').value = '';

        populateMaterialProjectDropdown();

        window.BuildTrack.openModal('materialModal');
    }

    // EDIT MATERIAL MODAL
    function openEditModal(materialId) {
        const m = getMaterial(materialId);

        if (!m) return;

        populateMaterialProjectDropdown();

        document.getElementById('materialModalTitle').textContent =
            'Edit Material Specs';

        document.getElementById('matFormId').value = m.id;
        document.getElementById('matFormName').value = m.name;
        document.getElementById('matFormCategory').value = m.category;
        document.getElementById('matFormUnit').value = m.unit;
        document.getElementById('matFormQuantity').value = m.quantity;
        document.getElementById('matFormMinStock').value = m.minStockLevel;
        document.getElementById('matFormUnitPrice').value = m.unitPrice;
        document.getElementById('matFormSupplier').value = m.supplier;
        document.getElementById('matFormProject').value =
            m.assignedProjectId || '';

        window.BuildTrack.openModal('materialModal');
    }

    // PROJECT DROPDOWN
    function populateMaterialProjectDropdown() {
        const dropdown =
            document.getElementById('matFormProject');

        if (!dropdown) return;

        const projects = window.DataStore.getProjects();

        dropdown.innerHTML =
            '<option value="">Global Central Yard</option>' +
            projects.map(p => `
                <option value="${p.id}">${p.name}</option>
            `).join('');

        if (
            window.BuildTrack.currentProjectId &&
            window.BuildTrack.currentProjectId !== 'all'
        ) {
            dropdown.value = window.BuildTrack.currentProjectId;
        }
    }

    // DELETE MATERIAL
    function confirmDelete(materialId) {
        const m = getMaterial(materialId);

        if (!m) return;

        window.BuildTrack.showConfirm({
            title: `Delete Material "${m.name}"?`,
            message: 'This material will be removed from site inventory calculations.',
            confirmText: 'Delete Item',
            confirmClass: 'btn-danger',

            onConfirm: async () => {
                try {
                    await apiRequest(
                        `${API}/${encodeURIComponent(materialId)}`,
                        'DELETE'
                    );

                    window.BuildTrack.showToast(
                        `Material "${m.name}" deleted.`,
                        'info'
                    );

                    await loadMaterials();

                } catch (error) {
                    window.BuildTrack.showToast(error.message, 'error');
                }
            }
        });
    }

    // PAGE EVENTS
    document.addEventListener('DOMContentLoaded', () => {

        window.addEventListener('buildtrack:viewchanged', e => {
            if (e.detail.view === 'materials') {
                loadMaterials();
            }
        });

        window.addEventListener('buildtrack:datachanged', () => {
            if (window.BuildTrack.currentView === 'materials') {
                loadMaterials();
            }
        });

        window.addEventListener('buildtrack:projectfilterchanged', () => {
            if (window.BuildTrack.currentView === 'materials') {
                renderMaterialsView();
            }
        });

        initMaterials();
    });

    // PUBLIC CONTROLLER
    window.MaterialsController = {
        render: renderMaterialsView,
        openAddModal,
        openEditModal,
        openStockActionModal,
        viewHistory,
        confirmDelete
    };

})();