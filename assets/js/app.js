
const DEFAULT_FIELDS = [
    { id: 'serialNumber',  name: '#',               required: false, type: 'auto'     },
    { id: 'partNumber',    name: 'P/N',              required: true,  type: 'text'     },
    { id: 'description',  name: 'Description',      required: false, type: 'text'     },
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
    { id: 'tracking',   name: 'Tracking #',     key: 'trackingNumber', type: 'text'                    },
    { id: 'arrival',    name: 'Arrival Date',   key: 'arrivalDate',   completedKey: 'arrivalCompleted' },
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
    dashboardCharts: {},
    refreshInterval: null,

    /* ── Init ─────────────────────────────────────────────── */
    async init() {
        this.loadSettings();
        await this.loadItems();
        this.setupEventListeners();
        this.renderParentHeader();
        this.renderItems();
        this.renderFieldsSettings();
        this.renderStagesSettings();
        this.setupTablePan();
        this.startAutoRefresh();
    },

    /* ── Auto-Refresh ─────────────────────────────────────── */
    startAutoRefresh() {
        if (!this.useApi) return;
        this.refreshInterval = setInterval(async () => {
            try {
                const res = await fetch('/api/items');
                if (!res.ok) return;
                const fresh = await res.json();
                const byId = arr => JSON.stringify([...arr].sort((a,b) => a.id < b.id ? -1 : 1));
                const changed = byId(fresh) !== byId(this.items);
                if (changed) {
                    this.items = fresh;
                    this.applyCurrentSort();
                    this.renderItems();
                    this.showRefreshIndicator();
                }
            } catch (e) {}
        }, 30000); // every 30 seconds
    },

    showRefreshIndicator() {
        const el = document.getElementById('refreshIndicator');
        if (!el) return;
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 2000);
    },

    /* ── Print ────────────────────────────────────────────── */
    printView() { window.print(); },

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

            if (field.type === 'date') {
                group.appendChild(this._makeDateFieldWrap(field.id, '', field.required));
            } else {
                let input;
                if (field.type === 'textarea') {
                    input = document.createElement('textarea');
                    input.rows = 2;
                } else {
                    input = document.createElement('input');
                    input.type = field.type === 'number' ? 'number' : 'text';
                    if (field.type === 'number') input.min = '0';
                }
                input.id = field.id;
                if (field.required) input.required = true;
                group.appendChild(input);
            }
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

            if (field.type === 'date') {
                group.appendChild(this._makeDateFieldWrap('edit_' + field.id, item[field.id] ?? '', field.required));
            } else {
                let input;
                if (field.type === 'textarea') {
                    input = document.createElement('textarea');
                    input.rows = 2;
                } else {
                    input = document.createElement('input');
                    input.type = field.type === 'number' ? 'number' : 'text';
                    if (field.type === 'number') input.min = '0';
                }
                input.id = 'edit_' + field.id;
                input.value = item[field.id] ?? '';
                if (field.required) input.required = true;
                group.appendChild(input);
            }
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
            item[field.id] = field.type === 'number' ? (parseFloat(value) || 0)
                           : field.type === 'date'   ? (this.displayToIso(value) || value)
                           : value;
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
            item[field.id] = field.type === 'number' ? (parseFloat(value) || 0)
                           : field.type === 'date'   ? (this.displayToIso(value) || value)
                           : value;
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
    confirmClearPromiseDate(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        const currentDate = this.formatDate(item.promiseDate);
        const historyCount = item.promiseDateHistory ? item.promiseDateHistory.length : 0;
        const confirmed = confirm(
            `Clear Promise Date?\n\nCurrent date: ${currentDate}\nHistory entries: ${historyCount}\n\nThis will also erase the entire date history.\nAre you sure?`
        );
        if (confirmed) {
            this.updateStageDate(itemId, 'promiseDate', '');
        }
    },

    async updateStageDate(itemId, stageKey, dateValue) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;

        // Track Promise Date history
        if (stageKey === 'promiseDate') {
            if (dateValue && item.promiseDate !== dateValue) {
                // User changed the date - add to history
                if (!item.promiseDateHistory) item.promiseDateHistory = [];
                if (item.promiseDate) {
                    item.promiseDateHistory.push({
                        date: item.promiseDate,
                        changedAt: new Date().toISOString()
                    });
                }
            } else if (!dateValue) {
                // User cleared the date - clear history
                item.promiseDateHistory = [];
            }
        }

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
        this.renderItems();
    },

    async deleteItem(itemId) {
        const item = this.items.find(i => i.id === itemId);
        const label = item ? `P/N: ${item.partNumber || '?'} | Project: ${item.project || '?'}` : '';
        if (!confirm(`Delete this item permanently?\n\n${label}\n\nThis cannot be undone.`)) return;
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
        return this.isoToDisplay(dateStr) || dateStr;
    },

    isoToDisplay(iso) {
        if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
    },

    displayToIso(display) {
        if (!display) return '';
        const match = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!match) return '';
        return `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
    },

    openDatePicker(textInput) {
        const hidden = textInput.nextElementSibling;
        if (hidden && hidden.type === 'date') {
            try { hidden.showPicker(); } catch(e) {}
        }
    },

    onHiddenDateChange(hiddenInput) {
        const textInput = hiddenInput.previousElementSibling;
        if (textInput) {
            textInput.value = this.isoToDisplay(hiddenInput.value);
            textInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    },

    _makeDateFieldWrap(id, isoValue, required) {
        const wrap = document.createElement('span');
        wrap.className = 'date-field-wrap';
        const text = document.createElement('input');
        text.type = 'text'; text.id = id;
        text.value = this.isoToDisplay(isoValue || '');
        text.placeholder = 'DD/MM/YYYY'; text.maxLength = 10;
        text.setAttribute('onclick', 'app.openDatePicker(this)');
        if (required) text.required = true;
        const hidden = document.createElement('input');
        hidden.type = 'date'; hidden.className = 'date-picker-hidden';
        hidden.value = isoValue || '';
        hidden.setAttribute('onchange', 'app.onHiddenDateChange(this)');
        hidden.tabIndex = -1;
        wrap.appendChild(text); wrap.appendChild(hidden);
        return wrap;
    },

    autoResizeInput(input) {
        const len = Math.max((input.value || '').length + 1, 4);
        input.style.width = len + 'ch';
    },

    setupTablePan() {
        const wrapper = document.querySelector('.table-wrapper');
        if (!wrapper) return;
        let isDown = false, isPanning = false, startX, scrollLeft;
        wrapper.addEventListener('mousedown', e => {
            if (e.target.closest('input, button, a, select, textarea, label')) return;
            isDown = true;
            isPanning = false;
            startX = e.pageX - wrapper.offsetLeft;
            scrollLeft = wrapper.scrollLeft;
        });
        wrapper.addEventListener('mouseleave', () => { isDown = false; isPanning = false; wrapper.classList.remove('is-panning'); });
        wrapper.addEventListener('mouseup', () => { isDown = false; isPanning = false; wrapper.classList.remove('is-panning'); });
        wrapper.addEventListener('mousemove', e => {
            if (!isDown) return;
            const x = e.pageX - wrapper.offsetLeft;
            const dx = x - startX;
            if (!isPanning && Math.abs(dx) < 5) return;
            isPanning = true;
            wrapper.classList.add('is-panning');
            e.preventDefault();
            wrapper.scrollLeft = scrollLeft - dx;
        });
    },

    getPromiseDateHistory(item) {
        if (!item.promiseDateHistory || item.promiseDateHistory.length === 0) return '';
        let history = 'Promise Date History:\n';
        item.promiseDateHistory.forEach((h, i) => {
            const changeDate = new Date(h.changedAt);
            history += `${i + 1}. Changed to ${this.formatDate(h.date)} (${changeDate.toLocaleDateString('en-GB')} ${changeDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})\n`;
        });
        if (item.promiseDate) {
            history += `Current: ${this.formatDate(item.promiseDate)}`;
        }
        return history;
    },

    isArrivalDelayed(item) {
        if (!item.arrivalDate || item.hslwhDate) return false;
        const today = new Date(); today.setHours(0,0,0,0);
        const arrival = new Date(item.arrivalDate); arrival.setHours(0,0,0,0);
        return today > arrival;
    },

    isArrivingSoon(item, days = 7) {
        if (!item.arrivalDate || item.hslwhDate) return false;
        const today = new Date(); today.setHours(0,0,0,0);
        const arrival = new Date(item.arrivalDate); arrival.setHours(0,0,0,0);
        const diff = (arrival - today) / 86400000;
        return diff >= 0 && diff <= days;
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
            if (status === 'delayed'   && !this.isArrivalDelayed(item)) return false;
            if (status === 'due-soon'  && !this.isArrivingSoon(item))  return false;
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
    applyCurrentSort() {
        const { col, dir, isStage } = this.currentSort;
        if (!col) return;
        const asc = dir === 'asc';
        if (isStage) {
            this.items.sort((a, b) => {
                const ad = a[col] || '', bd = b[col] || '';
                if (!ad && bd) return asc ? 1 : -1;
                if (ad && !bd) return asc ? -1 : 1;
                if (!ad && !bd) return 0;
                const diff = new Date(ad) - new Date(bd);
                return asc ? diff : -diff;
            });
        } else {
            this.items.sort((a, b) => {
                let av = a[col] ?? '', bv = b[col] ?? '';
                if (/^\d{4}-\d{2}-\d{2}$/.test(String(av))) {
                    av = new Date(av).getTime() || 0;
                    bv = new Date(bv).getTime() || 0;
                    return asc ? av - bv : bv - av;
                }
                av = String(av).toLowerCase();
                bv = String(bv).toLowerCase();
                return asc ? av.localeCompare(bv) : bv.localeCompare(av);
            });
        }
    },

    sortByColumn(col) {
        const isAsc = !(this.currentSort.col === col && !this.currentSort.isStage && this.currentSort.dir === 'asc');
        this.currentSort = { col, dir: isAsc ? 'asc' : 'desc', isStage: false };
        this.applyCurrentSort();
        this.renderParentHeader();
        this.renderItems();
    },

    sortByStageKey(stageKey) {
        const isAsc = !(this.currentSort.col === stageKey && this.currentSort.isStage && this.currentSort.dir === 'asc');
        this.currentSort = { col: stageKey, dir: isAsc ? 'asc' : 'desc', isStage: true };
        this.applyCurrentSort();
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

        items.forEach((item, rowIndex) => {
            const row = document.createElement('tr');
            if (item.hslwhDate)                   row.classList.add('row-completed');
            else if (this.isArrivalDelayed(item)) row.classList.add('row-delayed');
            else if (this.isArrivingSoon(item))   row.classList.add('row-due-soon');

            let html = '';

            this.fields.forEach((field, i) => {
                const sticky = i === 0 ? 'sticky-col sticky-col-1' : i === 1 ? 'sticky-col sticky-col-2' : '';

                if (field.id === 'serialNumber') {
                    html += `<td class="${sticky} col-serial">${rowIndex + 1}</td>`;

                } else if (field.id === 'pd') {
                    html += `<td class="${sticky}">${this.formatDate(item.pd)}</td>`;

                } else if (field.id === 'po') {
                    const d = this.calculateDaysBetween(item.pd, item.po);
                    html += `<td class="${sticky}">
                        <div class="date-with-badge">
                            <span>${this.formatDate(item.po)}</span>
                            ${d !== null ? `<span class="days-badge${d > 5 ? ' days-badge-warning' : ''}">${d}d from PR</span>` : ''}
                        </div></td>`;

                } else if (field.id === 'notes') {
                    const note = item.notes || '';
                    const short = note.length > 20 ? note.slice(0, 20) + '…' : note;
                    const escaped = note.replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
                    html += `<td class="${sticky}" title="${escaped}" style="cursor:${note ? 'help' : 'default'}">
                        <span class="notes-cell">${short}</span></td>`;
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
                    const isCompleted = val ? true : false;
                    const completedClass = isCompleted ? 'stage-cell stage-done' : 'stage-cell';
                    html += `<td>
                        <div class="${completedClass}">
                            <input type="text" class="tracing-input" value="${val}" placeholder="—"
                                 style="width:${Math.max((val||'').length + 1, 6)}ch"
                                 oninput="app.autoResizeInput(this)"
                                 onchange="app.updateTracingNumber('${item.id}','${stage.key}',this.value)">
                        </div></td>`;
                } else if (stage.type === 'date') {
                    const dateVal = item[stage.key] || '';
                    const isCompleted = dateVal ? true : false;
                    let badge = '';
                    let historyIndicator = '';
                    let tooltip = '';

                    if (stage.id === 'poDate') {
                        const d = this.calculateDaysBetween(item.pd, dateVal);
                        badge = d !== null ? `<span class="days-badge${d > 5 ? ' days-badge-warning' : ''}">${d}d from PR</span>` : '';
                    } else if (stage.id === 'promiseDate') {
                        if (item.promiseDateHistory && item.promiseDateHistory.length > 0) {
                            const changeCount = item.promiseDateHistory.length;
                            tooltip = this.getPromiseDateHistory(item).replace(/\n/g, '&#10;');
                            historyIndicator = `<span class="history-badge" title="${tooltip}">[${changeCount}]</span>`;
                        }
                    }

                    const completedClass = isCompleted ? 'stage-cell stage-done' : 'stage-cell';
                    let clearBtn = '';
                    if (stage.id === 'promiseDate' && item.promiseDateHistory && item.promiseDateHistory.length > 0) {
                        clearBtn = `<button class="btn-clear" onclick="app.confirmClearPromiseDate('${item.id}')">✕</button>`;
                    }

                    html += `<td>
                        <div class="${completedClass}">
                            <span class="date-field-wrap">
                                <input type="text" class="stage-date-input" value="${this.isoToDisplay(dateVal)}"
                                    placeholder="DD/MM/YYYY" maxlength="10"
                                    onclick="app.openDatePicker(this)"
                                    onchange="app.updateStageDate('${item.id}','${stage.key}',app.displayToIso(this.value))">
                                <input type="date" class="date-picker-hidden" value="${dateVal}"
                                    onchange="app.onHiddenDateChange(this)" tabindex="-1">
                            </span>
                            ${clearBtn}
                            ${badge}${historyIndicator}
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
                            <span class="date-field-wrap">
                                <input type="text" class="stage-date-input" value="${this.isoToDisplay(dateVal)}"
                                    placeholder="DD/MM/YYYY" maxlength="10"
                                    onclick="app.openDatePicker(this)"
                                    onchange="app.updateStageDate('${item.id}','${stage.key}',app.displayToIso(this.value))">
                                <input type="date" class="date-picker-hidden" value="${dateVal}"
                                    onchange="app.onHiddenDateChange(this)" tabindex="-1">
                            </span>
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

        // Update dashboard if visible
        const dashboardSection = document.getElementById('dashboardSection');
        if (dashboardSection && !dashboardSection.classList.contains('hidden')) {
            this.renderDashboard();
        }
    },

    /* ── Export / Import ──────────────────────────────────── */
    exportToExcel() {
        try {
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

            // Try XLSX if available, fallback to JSON
            if (typeof XLSX !== 'undefined') {
                const ws = XLSX.utils.json_to_sheet(data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Items');
                XLSX.writeFile(wb, `PO_Items_${new Date().toISOString().split('T')[0]}.xlsx`);
                this.showMessage('Excel exported successfully!', 'success');
            } else {
                // Fallback: export as JSON
                const json = JSON.stringify(data, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `PO_Items_${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                this.showMessage('Exported as JSON (Excel library unavailable)', 'success');
            }
        } catch (err) {
            this.showMessage('Error exporting: ' + err.message, 'error');
            console.error('Export error:', err);
        }
    },

    importFromExcel(event) {
        const file = event.target.files[0];
        if (!file) return;

        const isJson = file.name.endsWith('.json');
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');

        const reader = new FileReader();
        reader.onload = async e => {
            try {
                let data;

                if (isJson) {
                    // Parse JSON file
                    const jsonText = e.target.result;
                    data = JSON.parse(jsonText);
                    if (!Array.isArray(data)) {
                        throw new Error('JSON file must contain an array of items');
                    }
                } else if (isExcel) {
                    // Parse Excel/CSV file
                    if (typeof XLSX === 'undefined') {
                        this.showMessage('Excel library unavailable. Try exporting as JSON and re-importing, or refresh the page.', 'error');
                        return;
                    }
                    const wb = XLSX.read(e.target.result, { type: 'binary' });
                    data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                } else {
                    throw new Error('Unsupported file format. Use .xlsx, .xls, .csv, or .json');
                }

                this.items = []; // Clear all existing items
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
                this.showMessage(`${data.length} item(s) imported (replaced all data)!`, 'success');
                event.target.value = '';
            } catch (err) {
                this.showMessage('Error importing file: ' + err.message, 'error');
                console.error('Import error:', err);
            }
        };

        if (isJson) {
            reader.readAsText(file);
        } else {
            reader.readAsBinaryString(file);
        }
    },

    /* ── Dashboard ─────────────────────────────────────── */
    switchView(view) {
        const dashboard = document.getElementById('dashboardSection');
        const filterBar = document.querySelector('.filter-bar');
        const tableWrapper = document.querySelector('.table-wrapper');
        const tableTab = document.getElementById('tableTabBtn');
        const dashTab = document.getElementById('dashboardTabBtn');

        if (view === 'dashboard') {
            dashboard.classList.remove('hidden');
            filterBar.style.display = 'none';
            tableWrapper.style.display = 'none';
            tableTab.classList.remove('active');
            dashTab.classList.add('active');
            this.renderDashboard();
        } else {
            dashboard.classList.add('hidden');
            filterBar.style.display = 'flex';
            tableWrapper.style.display = 'block';
            tableTab.classList.add('active');
            dashTab.classList.remove('active');
        }
    },

    clearDashDateFilter() {
        document.getElementById('dashFromDate').value = '';
        document.getElementById('dashToDate').value = '';
        this.renderDashboard();
    },

    getDashItems() {
        const from = document.getElementById('dashFromDate')?.value;
        const to   = document.getElementById('dashToDate')?.value;
        if (!from && !to) return this.items;
        return this.items.filter(item => {
            const d = item.po || item.pd;
            if (!d) return true;
            if (from && d < from) return false;
            if (to   && d > to)   return false;
            return true;
        });
    },

    renderDashboard() {
        const items = this.getDashItems();
        const total    = items.length;
        const completed = items.filter(i => i.hslwhDate).length;
        const atRisk   = items.filter(i => this.isArrivalDelayed(i)).length;

        // On-Time: completed and NOT delayed at arrival
        const onTimeCount = items.filter(i => {
            if (!i.hslwhDate) return false;
            if (!i.arrivalDate) return true;
            return new Date(i.hslwhDate) <= new Date(i.arrivalDate);
        }).length;
        const onTimePct = completed > 0 ? Math.round((onTimeCount / completed) * 100) : 0;

        // Avg Lead Time: PO Date → HSL WH
        const withLead = items.filter(i => i.po && i.hslwhDate);
        const avgLead  = withLead.length > 0
            ? (withLead.reduce((s, i) => s + (this.calculateDaysBetween(i.po, i.hslwhDate) || 0), 0) / withLead.length).toFixed(1)
            : null;

        // Top Supplier (most orders)
        const supplierCount = {};
        items.forEach(i => { if (i.supplier) supplierCount[i.supplier] = (supplierCount[i.supplier] || 0) + 1; });
        const topSupplier = Object.entries(supplierCount).sort((a, b) => b[1] - a[1])[0];

        // Update KPI cards
        document.getElementById('dashTotalOrders').textContent = total;
        document.getElementById('dashOnTime').textContent      = onTimePct + '%';
        document.getElementById('dashAvgLead').textContent     = avgLead ? avgLead + 'd' : '—';
        document.getElementById('dashAtRisk').textContent      = atRisk;
        document.getElementById('dashTopSupplier').textContent = topSupplier ? topSupplier[0] : '—';

        this.renderSupplierChart(items);
        this.renderOnTimePie(onTimeCount, completed - onTimeCount);
        this.renderTimelineChart(items);
        this.renderAtRiskTable(items);
    },

    renderSupplierChart(items) {
        const supplierData = {};
        items.forEach(i => {
            if (!i.supplier) return;
            if (!supplierData[i.supplier]) supplierData[i.supplier] = { count: 0, totalDays: 0, withDays: 0 };
            supplierData[i.supplier].count++;
            if (i.po && i.hslwhDate) {
                const d = this.calculateDaysBetween(i.po, i.hslwhDate);
                if (d !== null) { supplierData[i.supplier].totalDays += d; supplierData[i.supplier].withDays++; }
            }
        });

        const byOrders = Object.entries(supplierData).sort((a,b) => b[1].count - a[1].count);
        const byLead   = Object.entries(supplierData)
            .filter(e => e[1].withDays > 0)
            .sort((a,b) => b[1].totalDays/b[1].withDays - a[1].totalDays/a[1].withDays);

        const rowH = 28;
        const minH = 120;

        const makeHBar = (canvasId, wrapId, labels, data, colors, fmt) => {
            const ctx = document.getElementById(canvasId);
            const wrap = document.getElementById(wrapId);
            if (!ctx || !wrap) return null;
            const h = Math.max(minH, labels.length * rowH);
            wrap.style.height = h + 'px';
            return new Chart(ctx, {
                type: 'bar',
                data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4, barThickness: 18 }] },
                options: {
                    indexAxis: 'y',
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } }
                    },
                    scales: {
                        x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
                        y: { ticks: { font: { size: 11 } }, grid: { display: false } }
                    }
                }
            });
        };

        if (this.dashboardCharts.supplierOrders) this.dashboardCharts.supplierOrders.destroy();
        if (this.dashboardCharts.supplierLead)   this.dashboardCharts.supplierLead.destroy();

        this.dashboardCharts.supplierOrders = makeHBar(
            'supplierOrdersChart', 'supplierOrdersWrap',
            byOrders.map(e => e[0]),
            byOrders.map(e => e[1].count),
            byOrders.map(() => '#2563eb'),
            v => v + ' orders'
        );

        const leadColors = byLead.map(e => {
            const d = e[1].totalDays / e[1].withDays;
            return d <= 30 ? '#16a34a' : d <= 60 ? '#f59e0b' : '#dc2626';
        });
        this.dashboardCharts.supplierLead = makeHBar(
            'supplierLeadChart', 'supplierLeadWrap',
            byLead.map(e => e[0]),
            byLead.map(e => +(e[1].totalDays / e[1].withDays).toFixed(1)),
            leadColors,
            v => v + ' days'
        );
    },

    renderOnTimePie(onTime, late) {
        const ctx = document.getElementById('onTimePieChart');
        if (!ctx) return;
        if (this.dashboardCharts.pie) this.dashboardCharts.pie.destroy();

        this.dashboardCharts.pie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['On-Time', 'Late'],
                datasets: [{ data: [onTime, late],
                    backgroundColor: ['#16a34a', '#dc2626'],
                    borderColor: 'white', borderWidth: 3 }]
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }
            }
        });
    },

    renderTimelineChart(items) {
        const byMonth = {};
        items.filter(i => i.hslwhDate).forEach(i => {
            const m = i.hslwhDate.slice(0, 7);
            byMonth[m] = (byMonth[m] || 0) + 1;
        });
        const months = Object.keys(byMonth).sort().slice(-12);

        const ctx = document.getElementById('timelineChart');
        if (!ctx) return;
        if (this.dashboardCharts.timeline) this.dashboardCharts.timeline.destroy();

        this.dashboardCharts.timeline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{ label: 'Deliveries per Month',
                    data: months.map(m => byMonth[m] || 0),
                    borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)',
                    borderWidth: 2.5, tension: 0.4, fill: true,
                    pointBackgroundColor: '#2563eb', pointRadius: 5, pointHoverRadius: 7 }]
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: { legend: { display: true } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    },

    renderAtRiskTable(items) {
        const tbody = document.getElementById('dashAtRiskBody');
        if (!tbody) return;
        const atRisk = items.filter(i => this.isArrivalDelayed(i));

        if (atRisk.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:20px">✅ No at-risk orders</td></tr>`;
            return;
        }

        const today = new Date(); today.setHours(0,0,0,0);
        tbody.innerHTML = atRisk.map(item => {
            const arrival = new Date(item.arrivalDate);
            const overdue = Math.ceil((today - arrival) / 86400000);
            return `<tr>
                <td>${item.serialNumber || '—'}</td>
                <td><strong>${item.partNumber || '—'}</strong></td>
                <td>${item.project || '—'}</td>
                <td>${item.supplier || '—'}</td>
                <td>${this.formatDate(item.arrivalDate)}</td>
                <td><span class="overdue-badge">+${overdue} days</span></td>
            </tr>`;
        }).join('');
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
        try {
            const res = await fetch('/api/items');
            if (res.ok) {
                this.items = await res.json();
                this.useApi = true;
                return;
            } else if (res.status === 503) {
                console.warn('Database unavailable (503), using localStorage');
            } else {
                console.warn('API error: ' + res.status);
            }
        } catch (e) {
            console.warn('Failed to reach API:', e.message);
        }
        // Fallback to localStorage
        const data = localStorage.getItem('po_items_v2');
        this.items = data ? JSON.parse(data) : [];
        this.useApi = false;
    }
};

document.addEventListener('DOMContentLoaded', () => { app.init(); });
