
const DEFAULT_FIELDS = [
    { id: 'serialNumber',  name: '#',               required: false, type: 'auto'     },
    { id: 'partNumber',    name: 'P/N',              required: true,  type: 'text'     },
    { id: 'revision',      name: 'REV',              required: false, type: 'text'     },
    { id: 'quantity',      name: 'Qty',              required: false, type: 'number'   },
    { id: 'project',       name: 'Project',          required: true,  type: 'text'     },
    { id: 'pd',            name: 'Purchase Req.',    required: false, type: 'date'     },
    { id: 'supplier',      name: 'Supplier',         required: false, type: 'text'     },
    { id: 'wd',            name: 'Working Days',     required: false, type: 'number'   },
    { id: 'notes',         name: 'Notes',            required: false, type: 'textarea' }
];

const DEFAULT_STAGES = [
    { id: 'poNumber',   name: 'PO #',           key: 'poNumber',      type: 'text'                    },
    { id: 'poDate',     name: 'PO Date',        key: 'po',            type: 'date'                    },
    { id: 'promiseDate',name: 'Promise Date',   key: 'promiseDate',   type: 'date'                    },
    { id: 'eq',         name: 'EQ',             key: 'eqDate',        completedKey: 'eqCompleted'      },
    { id: 'coc',        name: 'COC',            key: 'cocDate',       completedKey: 'cocCompleted'     },
    { id: 'arrival',    name: 'Arrival Date',   key: 'arrivalDate',   completedKey: 'arrivalCompleted' },
    { id: 'tracing',    name: 'Tracing #',      key: 'tracingNumber', type: 'text'                    },
    { id: 'hslwh',      name: 'HSL WH',         key: 'hslwhDate',     completedKey: 'hslwhCompleted'  }
];

const app = {
    items: [],
    fields: [],
    stages: [],
    hideCompleted: false,
    useApi: false,
    currentSort: { col: null, dir: 'asc', isStage: false },
    editingItemId: null,

    /* ── Init ─────────────────────────────────────────────── */
    async init() {
        this.loadSettings();
        await this.loadItems();
        this.setupEventListeners();
        this.renderParentHeader();
        this.renderItems();
        this.renderFieldsSettings();
        this.renderStagesSettings();
    },

    loadSettings() {
        this.fields = JSON.parse(JSON.stringify(DEFAULT_FIELDS));
        this.stages = JSON.parse(JSON.stringify(DEFAULT_STAGES));
    },

    setupEventListeners() {
        document.getElementById('addForm').addEventListener('submit', e => {
            e.preventDefault();
            this.saveNewItem();
        });
    },

    /* ── Settings ─────────────────────────────────────────── */
    openSettings() {
        this.renderFieldsSettings();
        this.renderStagesSettings();
        document.getElementById('settingsModal').classList.add('show');
    },
    closeSettings() { document.getElementById('settingsModal').classList.remove('show'); },

    openSupplierStats() {
        const tbody = document.getElementById('supplierStatsBody');
        tbody.innerHTML = '';

        // Get unique suppliers
        const suppliers = [...new Set(this.items.map(i => i.supplier).filter(Boolean))].sort();

        suppliers.forEach(supplier => {
            const supplierItems = this.items.filter(i => i.supplier === supplier);
            const completedItems = supplierItems.filter(i => i.hslwhDate);

            let avgDays = '—';
            if (completedItems.length > 0) {
                const itemsWithBothDates = completedItems.filter(i => i.po && i.hslwhDate);
                if (itemsWithBothDates.length > 0) {
                    const totalDays = itemsWithBothDates.reduce((sum, item) => {
                        const d = this.calculateDaysBetween(item.po, item.hslwhDate);
                        return sum + (d !== null ? d : 0);
                    }, 0);
                    avgDays = (totalDays / itemsWithBothDates.length).toFixed(1) + ' days';
                }
            }

            const row = `<tr>
                <td>${supplier}</td>
                <td>${supplierItems.length}</td>
                <td>${completedItems.length}</td>
                <td><strong>${avgDays}</strong></td>
            </tr>`;
            tbody.innerHTML += row;
        });

        document.getElementById('supplierStatsModal').classList.add('show');
    },

    closeSupplierStats() { document.getElementById('supplierStatsModal').classList.remove('show'); },

    switchSettingsTab(tab) {
        document.querySelectorAll('.settings-tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.settings-tab-btn').forEach(el => el.classList.remove('active'));
        document.getElementById(tab + 'Tab').classList.add('active');
        event.target.classList.add('active');
    },

    renderFieldsSettings() {
        const tbody = document.getElementById('fieldsTableBody');
        tbody.innerHTML = this.fields.map(f =>
            `<tr><td>${f.name}</td><td>${f.id}</td><td>${f.required ? '✓' : '—'}</td></tr>`
        ).join('');
    },

    renderStagesSettings() {
        const tbody = document.getElementById('stagesTableBody');
        tbody.innerHTML = this.stages.map(s =>
            `<tr><td>${s.name}</td><td>${s.id}</td></tr>`
        ).join('');
    },

    /* ── Add Item ─────────────────────────────────────────── */
    addNewItem() {
        this.generateAddItemForm();
        document.getElementById('addForm').reset();
        document.getElementById('addModal').classList.add('show');
    },

    generateAddItemForm() {
        const container = document.getElementById('formFields');
        container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'form-grid';

        this.fields.forEach(field => {
            if (field.type === 'auto') return;
            const group = document.createElement('div');
            group.className = field.type === 'textarea' ? 'form-group form-group-full' : 'form-group';

            const label = document.createElement('label');
            label.textContent = field.name + (field.required ? ' *' : '');
            group.appendChild(label);

            let input;
            if (field.type === 'textarea') {
                input = document.createElement('textarea');
                input.rows = 2;
            } else {
                input = document.createElement('input');
                input.type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
                if (field.type === 'number') input.min = '0';
            }
            input.id = field.id;
            if (field.required) input.required = true;
            group.appendChild(input);
            grid.appendChild(group);
        });

        container.appendChild(grid);
    },

    closeAddModal() { document.getElementById('addModal').classList.remove('show'); },

    /* ── Edit Item ────────────────────────────────────────── */
    openEditModal(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        this.editingItemId = itemId;
        this.generateEditForm(item);
        document.getElementById('editModal').classList.add('show');
    },

    generateEditForm(item) {
        const container = document.getElementById('editFormFields');
        container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'form-grid';

        this.fields.forEach(field => {
            if (field.type === 'auto') return;
            const group = document.createElement('div');
            group.className = field.type === 'textarea' ? 'form-group form-group-full' : 'form-group';

            const label = document.createElement('label');
            label.textContent = field.name + (field.required ? ' *' : '');
            group.appendChild(label);

            let input;
            if (field.type === 'textarea') {
                input = document.createElement('textarea');
                input.rows = 2;
            } else {
                input = document.createElement('input');
                input.type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
                if (field.type === 'number') input.min = '0';
            }
            input.id = 'edit_' + field.id;
            input.value = item[field.id] ?? '';
            if (field.required) input.required = true;
            group.appendChild(input);
            grid.appendChild(group);
        });

        container.appendChild(grid);
    },

    closeEditModal() {
        document.getElementById('editModal').classList.remove('show');
        this.editingItemId = null;
    },

    async saveEditedItem() {
        const item = this.items.find(i => i.id === this.editingItemId);
        if (!item) return;

        let valid = true;
        this.fields.forEach(field => {
            if (field.type === 'auto') return;
            const input = document.getElementById('edit_' + field.id);
            if (!input) return;
            const value = input.value.trim();
            if (field.required && !value) { input.classList.add('error'); valid = false; return; }
            input.classList.remove('error');
            item[field.id] = field.type === 'number' ? (parseFloat(value) || 0) : value;
        });

        if (!valid) { this.showMessage('Please fill in all required fields.', 'error'); return; }

        await this.saveItems();
        this.renderItems();
        this.closeEditModal();
        this.showMessage('Item updated successfully!', 'success');
    },

    getNextSerial() {
        if (!this.items.length) return 1;
        return Math.max(...this.items.map(i => parseInt(i.serialNumber) || 0)) + 1;
    },

    async saveNewItem() {
        const item = { id: String(Date.now()), serialNumber: this.getNextSerial(), createdAt: new Date().toISOString() };
        let valid = true;

        this.fields.forEach(field => {
            if (field.type === 'auto') return;
            const input = document.getElementById(field.id);
            if (!input) return;
            const value = input.value.trim();
            if (field.required && !value) { input.classList.add('error'); valid = false; return; }
            input.classList.remove('error');
            item[field.id] = field.type === 'number' ? (parseFloat(value) || 0) : value;
        });

        if (!valid) { this.showMessage('Please fill in all required fields.', 'error'); return; }

        this.stages.forEach(stage => {
            item[stage.key] = '';
            if (stage.completedKey) item[stage.completedKey] = false;
        });

        this.items.push(item);
        await this.saveItems();
        this.renderItems();
        this.closeAddModal();
        this.showMessage('Item added successfully!', 'success');
    },

    /* ── Update ───────────────────────────────────────────── */
    async updateStageDate(itemId, stageKey, dateValue) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item[stageKey] = dateValue;
        const stage = this.stages.find(s => s.key === stageKey);
        if (stage && stage.completedKey) {
            item[stage.completedKey] = dateValue ? true : false;
        }
        await this.saveItems();
        this.renderItems();
    },

    async updateStageStatus(itemId, dateKey, completedKey, checked) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item[completedKey] = checked;
        // never touch the date — user controls it independently
        await this.saveItems();
        this.renderItems();
    },

    async updateTracingNumber(itemId, key, value) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item[key] = value;
        await this.saveItems();
    },

    async deleteItem(itemId) {
        if (!confirm('Permanently delete this item?')) return;
        if (this.useApi) {
            try { await fetch(`/api/items?id=${itemId}`, { method: 'DELETE' }); } catch (e) {}
        }
        this.items = this.items.filter(i => i.id !== itemId);
        await this.saveItems();
        this.renderItems();
        this.showMessage('Item deleted.', 'success');
    },

    /* ── Calculations ─────────────────────────────────────── */
    calculateQuotationDate(poDate, wd) {
        if (!poDate || !wd || isNaN(parseInt(wd))) return '';
        const date = new Date(poDate);
        let days = parseInt(wd);
        while (days > 0) {
            date.setDate(date.getDate() + 1);
            if (date.getDay() !== 0 && date.getDay() !== 6) days--;
        }
        return date.toISOString().split('T')[0];
    },

    calculateDaysBetween(d1, d2) {
        if (!d1 || !d2) return null;
        const a = new Date(d1); a.setHours(0,0,0,0);
        const b = new Date(d2); b.setHours(0,0,0,0);
        if (isNaN(a) || isNaN(b)) return null;
        return Math.round((b - a) / 86400000);
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return isNaN(d) ? dateStr : d.toLocaleDateString('en-GB');
    },

    isArrivalDelayed(item) {
        if (!item.arrivalDate || item.arrivalCompleted) return false;
        const today = new Date(); today.setHours(0,0,0,0);
        const arrival = new Date(item.arrivalDate); arrival.setHours(0,0,0,0);
        return today > arrival;
    },

    /* ── Filtering ────────────────────────────────────────── */
    getDisplayItems() {
        const search   = (document.getElementById('searchBox')?.value   || '').toLowerCase().trim();
        const status   = document.getElementById('statusFilter')?.value   || '';
        const project  = document.getElementById('projectFilter')?.value  || '';
        const supplier = document.getElementById('supplierFilter')?.value || '';

        return this.items.filter(item => {
            if (this.hideCompleted && item.hslwhDate) return false;
            if (status === 'completed'  && !item.hslwhDate)            return false;
            if (status === 'in-progress' && item.hslwhDate)            return false;
            if (status === 'delayed'    && !this.isArrivalDelayed(item))    return false;
            if (project  && item.project  !== project)                      return false;
            if (supplier && item.supplier !== supplier)                     return false;
            if (search) {
                const hit = this.fields.some(f => {
                    const v = item[f.id];
                    return v && String(v).toLowerCase().includes(search);
                }) || this.stages.some(s => {
                    const v = item[s.key];
                    return v && String(v).toLowerCase().includes(search);
                });
                if (!hit) return false;
            }
            return true;
        });
    },

    applyFilters() { this.renderItems(); },

    clearFilters() {
        document.getElementById('searchBox').value    = '';
        document.getElementById('statusFilter').value   = '';
        document.getElementById('projectFilter').value  = '';
        document.getElementById('supplierFilter').value = '';
        this.hideCompleted = false;
        const btn = document.getElementById('toggleCompletedBtn');
        btn.classList.remove('active');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Hide Completed';
        this.renderItems();
    },

    populateFilterDropdowns() {
        const projects  = [...new Set(this.items.map(i => i.project).filter(Boolean))].sort();
        const suppliers = [...new Set(this.items.map(i => i.supplier).filter(Boolean))].sort();

        const pSel = document.getElementById('projectFilter');
        const sSel = document.getElementById('supplierFilter');
        if (!pSel || !sSel) return;

        const pVal = pSel.value;
        const sVal = sSel.value;

        pSel.innerHTML = '<option value="">All Projects</option>' +
            projects.map(p => `<option value="${p}"${p === pVal ? ' selected' : ''}>${p}</option>`).join('');
        sSel.innerHTML = '<option value="">All Suppliers</option>' +
            suppliers.map(s => `<option value="${s}"${s === sVal ? ' selected' : ''}>${s}</option>`).join('');
    },

    toggleHideCompleted() {
        this.hideCompleted = !this.hideCompleted;
        const btn = document.getElementById('toggleCompletedBtn');
        const eyeIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        if (this.hideCompleted) {
            btn.classList.add('active');
            btn.innerHTML = `${eyeIcon} Show Completed`;
        } else {
            btn.classList.remove('active');
            btn.innerHTML = `${eyeIcon} Hide Completed`;
        }
        this.renderItems();
    },

    /* ── Sort ─────────────────────────────────────────────── */
    sortByColumn(col) {
        const isAsc = !(this.currentSort.col === col && !this.currentSort.isStage && this.currentSort.dir === 'asc');
        this.currentSort = { col, dir: isAsc ? 'asc' : 'desc', isStage: false };

        this.items.sort((a, b) => {
            let av = a[col] ?? '', bv = b[col] ?? '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(String(av))) {
                av = new Date(av).getTime() || 0;
                bv = new Date(bv).getTime() || 0;
                return isAsc ? av - bv : bv - av;
            }
            av = String(av).toLowerCase();
            bv = String(bv).toLowerCase();
            return isAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        });

        this.renderParentHeader();
        this.renderItems();
    },

    sortByStageKey(stageKey) {
        const isAsc = !(this.currentSort.col === stageKey && this.currentSort.isStage && this.currentSort.dir === 'asc');
        this.currentSort = { col: stageKey, dir: isAsc ? 'asc' : 'desc', isStage: true };

        this.items.sort((a, b) => {
            const ad = a[stageKey] || '', bd = b[stageKey] || '';
            if (!ad && bd) return isAsc ? 1 : -1;
            if (ad && !bd) return isAsc ? -1 : 1;
            if (!ad && !bd) return 0;
            const diff = new Date(ad) - new Date(bd);
            return isAsc ? diff : -diff;
        });

        this.renderParentHeader();
        this.renderItems();
    },

    getSortIcon(col, isStage) {
        const active = this.currentSort.col === col && this.currentSort.isStage === isStage;
        if (!active) return '<span class="sort-icon">↕</span>';
        return `<span class="sort-icon active">${this.currentSort.dir === 'asc' ? '↑' : '↓'}</span>`;
    },

    /* ── Render Header ────────────────────────────────────── */
    renderParentHeader() {
        const parentRow = document.getElementById('parentHeader');
        const childRow  = document.getElementById('childHeader');

        const itemCols   = this.fields.length + 1; // +1 Quot. Date
        const supplyCols = this.stages.length + 1; // +1 Actions

        parentRow.innerHTML =
            `<th colspan="${itemCols}"   class="parent-header-cell">Item Details</th>` +
            `<th colspan="${supplyCols}" class="parent-header-cell">Supply Chain</th>`;

        let ch = '';
        this.fields.forEach((field, i) => {
            const sticky = i === 0 ? 'sticky-col sticky-col-1' : i === 1 ? 'sticky-col sticky-col-2' : '';
            ch += `<th class="sortable child-th ${sticky}" onclick="app.sortByColumn('${field.id}')">
                       ${field.name}${this.getSortIcon(field.id, false)}
                   </th>`;
        });
        ch += `<th class="child-th">Quot. Date</th>`;
        this.stages.forEach(stage => {
            ch += `<th class="sortable stage-header child-th" onclick="app.sortByStageKey('${stage.key}')">
                       ${stage.name}${this.getSortIcon(stage.key, true)}
                   </th>`;
        });
        ch += `<th class="child-th actions-th">Actions</th>`;
        childRow.innerHTML = ch;

        requestAnimationFrame(() => {
            const ph = parentRow.getBoundingClientRect().height;
            childRow.querySelectorAll('th').forEach(th => { th.style.top = ph + 'px'; });
        });
    },

    /* ── Render Items ─────────────────────────────────────── */
    renderItems() {
        this.updateDashboard();
        this.populateFilterDropdowns();

        const tbody = document.getElementById('itemsBody');
        tbody.innerHTML = '';

        const items = this.getDisplayItems();

        // Results count
        const rc = document.getElementById('filterResults');
        if (rc) rc.textContent = items.length === this.items.length
            ? `${this.items.length} items`
            : `${items.length} of ${this.items.length} items`;

        items.forEach(item => {
            const row = document.createElement('tr');
            if (this.isArrivalDelayed(item)) row.classList.add('row-delayed');
            if (item.hslwhDate)          row.classList.add('row-completed');

            let html = '';

            this.fields.forEach((field, i) => {
                const sticky = i === 0 ? 'sticky-col sticky-col-1' : i === 1 ? 'sticky-col sticky-col-2' : '';

                if (field.id === 'serialNumber') {
                    html += `<td class="${sticky} col-serial">${item.serialNumber || ''}</td>`;

                } else if (field.id === 'pd') {
                    html += `<td class="${sticky}">${this.formatDate(item.pd)}</td>`;

                } else if (field.id === 'po') {
                    const d = this.calculateDaysBetween(item.pd, item.po);
                    html += `<td class="${sticky}">
                        <div class="date-with-badge">
                            <span>${this.formatDate(item.po)}</span>
                            ${d !== null ? `<span class="days-badge${d > 5 ? ' days-badge-warning' : ''}">${d}d from PR</span>` : ''}
                        </div></td>`;

                } else {
                    html += `<td class="${sticky}">${item[field.id] ?? ''}</td>`;
                }
            });

            // Quot. Date
            const quotDate = this.calculateQuotationDate(item.po, item.wd);
            html += `<td class="col-date">${this.formatDate(quotDate)}</td>`;

            // Stages
            this.stages.forEach(stage => {
                if (stage.type === 'text') {
                    const val = (item[stage.key] || '').replace(/"/g, '&quot;');
                    html += `<td><input type="text" class="tracing-input" value="${val}" placeholder="—"
                                 onchange="app.updateTracingNumber('${item.id}','${stage.key}',this.value)"></td>`;
                } else if (stage.type === 'date') {
                    const dateVal = item[stage.key] || '';
                    const isCompleted = dateVal ? true : false;
                    let badge = '';
                    if (stage.id === 'poDate') {
                        const d = this.calculateDaysBetween(item.pd, dateVal);
                        badge = d !== null ? `<span class="days-badge${d > 5 ? ' days-badge-warning' : ''}">${d}d from PR</span>` : '';
                    }
                    const completedClass = isCompleted ? 'stage-cell stage-done' : 'stage-cell';
                    html += `<td>
                        <div class="${completedClass}">
                            <input type="date" class="stage-date-input" value="${dateVal}"
                                onchange="app.updateStageDate('${item.id}','${stage.key}',this.value)">
                            ${badge}
                        </div></td>`;
                } else {
                    const dateVal    = item[stage.key] || '';
                    const isCompleted = dateVal ? true : false;
                    let badge = '';
                    if (stage.id === 'hslwh') {
                        const d = this.calculateDaysBetween(item.po, dateVal);
                        if (d !== null) badge = `<span class="days-badge">${d}d from PO</span>`;
                    }
                    const completedClass = isCompleted ? 'stage-cell stage-done' : 'stage-cell';
                    html += `<td>
                        <div class="${completedClass}">
                            <input type="date" class="stage-date-input" value="${dateVal}"
                                onchange="app.updateStageDate('${item.id}','${stage.key}',this.value)">
                            ${badge}
                        </div></td>`;
                }
            });

            html += `<td class="action-col">
                <button class="btn-icon-edit" onclick="app.openEditModal('${item.id}')" title="Edit item">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="btn-icon-danger" onclick="app.deleteItem('${item.id}')" title="Delete item">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                        <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                </button>
            </td>`;

            row.innerHTML = html;
            tbody.appendChild(row);
        });
    },

    /* ── Dashboard ────────────────────────────────────────── */
    updateDashboard() {
        const total     = this.items.length;
        const completed = this.items.filter(i => i.hslwhDate).length;
        const delayed   = this.items.filter(i => this.isArrivalDelayed(i)).length;
        const inProgress = total - completed;

        document.getElementById('totalItems').textContent    = total;
        document.getElementById('completedItems').textContent = completed;
        document.getElementById('delayedItems').textContent   = delayed;
        document.getElementById('inProgressItems').textContent = inProgress;
    },

    /* ── Export / Import ──────────────────────────────────── */
    exportToExcel() {
        const data = this.items.map(item => {
            const row = {};
            this.fields.forEach(f => { row[f.name] = item[f.id] ?? ''; });
            row['Quot. Date'] = this.calculateQuotationDate(item.po, item.wd);
            this.stages.forEach(s => {
                row[s.name] = item[s.key] || '';
                if (s.completedKey) row[s.name + ' Done'] = item[s.completedKey] ? 'Yes' : 'No';
            });
            return row;
        });
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Items');
        XLSX.writeFile(wb, `PO_Items_${new Date().toISOString().split('T')[0]}.xlsx`);
        this.showMessage('Excel exported successfully!', 'success');
    },

    importFromExcel(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async e => {
            try {
                const wb   = XLSX.read(e.target.result, { type: 'binary' });
                const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                data.forEach(row => {
                    const item = { id: String(Date.now() + Math.random()), serialNumber: this.getNextSerial(), createdAt: new Date().toISOString() };
                    this.fields.forEach(f => { if (f.type !== 'auto') item[f.id] = row[f.name] || ''; });
                    this.stages.forEach(s => {
                        item[s.key] = row[s.name] || '';
                        if (s.completedKey) item[s.completedKey] = row[s.name + ' Done'] === 'Yes';
                    });
                    this.items.push(item);
                });
                await this.saveItems();
                this.renderItems();
                this.showMessage(`${data.length} item(s) imported!`, 'success');
                event.target.value = '';
            } catch (err) {
                this.showMessage('Error importing file!', 'error');
                console.error(err);
            }
        };
        reader.readAsBinaryString(file);
    },

    /* ── Persistence ──────────────────────────────────────── */
    showMessage(text, type) {
        const msg = document.getElementById('message');
        msg.textContent = text;
        msg.className = `message ${type}`;
        setTimeout(() => { msg.className = 'message'; }, 3500);
    },

    async saveItems() {
        if (this.useApi) {
            try {
                await fetch('/api/items', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.items) });
                return;
            } catch (e) { console.warn('API save failed, using localStorage', e); }
        }
        localStorage.setItem('po_items_v2', JSON.stringify(this.items));
    },

    async loadItems() {
        if (window.location.protocol !== 'file:') {
            try {
                const res = await fetch('/api/items');
                if (res.ok) { this.items = await res.json(); this.useApi = true; return; }
            } catch (e) { console.warn('API unavailable, using localStorage'); }
        }
        const data = localStorage.getItem('po_items_v2');
        this.items = data ? JSON.parse(data) : [];
    }
};

document.addEventListener('DOMContentLoaded', () => { app.init(); });
