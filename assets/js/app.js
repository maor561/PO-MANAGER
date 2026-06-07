
const DEFAULT_FIELDS = [
    { id: 'serialNumber',  name: '#',               required: false, type: 'auto'     },
    { id: 'partNumber',    name: 'P/N',              required: true,  type: 'text'     },
    { id: 'description',  name: 'Description',      required: false, type: 'text'     },
    { id: 'revision',      name: 'REV',              required: false, type: 'text'     },
    { id: 'quantity',      name: 'Qty',              required: false, type: 'number'   },
    { id: 'cost',          name: 'Cost',             required: false, type: 'number'   },
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
    timelineGranularity: 'month',
    viewMode: 'table',
    compactMode: false,
    hiddenColumns: new Set(),
    recvSort: { col: 'hslwhDate', dir: 'asc' },
    activeTab: 'table',
    currentUser: '',
    changelogUnlocked: false,
    _changelogCache: null,
    dashCurrency: 'ILS',
    exchangeRates: null,   // { USD: 0.273, EUR: 0.251 } — rates FROM ILS

    /* ── Init ─────────────────────────────────────────────── */
    async init() {
        this.loadSettings();
        this.initUser();
        await this.loadItems();
        this.setupEventListeners();
        this.renderParentHeader();
        this.renderItems();
        this.renderFieldsSettings();
        this.renderStagesSettings();
        this.setupTablePan();
        this.setupMobileUI();
        // SSE removed — polling handles real-time sync (see startAutoRefresh)
        this.startAutoRefresh();    // fallback polling (30s)
        document.getElementById('compactBtn')?.classList.toggle('vm-active', this.compactMode);
    },

    /* ── User identity ────────────────────────────────────── */
    initUser() {
        let name = localStorage.getItem('po_username') || '';
        if (!name) {
            name = prompt('שלום! מה שמך?\n(השם יוצג לצוות כשתערוך פריטים)', '') || 'Anonymous';
            localStorage.setItem('po_username', name);
        }
        this.currentUser = name;
        this._updateUserBadge();
    },

    changeUser() {
        const name = prompt('שנה שם:', this.currentUser) || this.currentUser;
        this.currentUser = name;
        localStorage.setItem('po_username', name);
        this._updateUserBadge();
    },

    _updateUserBadge() {
        const badge = document.getElementById('userBadge');
        if (badge) { badge.textContent = '👤 ' + this.currentUser; badge.style.display = ''; }
    },

    _renderCurrentTab() {
        if (this.activeTab === 'received') this.renderReceived();
        else if (this.activeTab === 'dashboard') this.renderDashboard();
        else if (this.activeTab === 'changelog') { /* changelog doesn't need re-render on item change */ }
        else this.renderItems();
    },

    /* ── Auto-Refresh (fallback polling) ─────────────────── */
    startAutoRefresh() {
        if (!this.useApi) return;
        this.refreshInterval = setInterval(async () => {
            try {
                const res = await fetch('/api/items');
                if (!res.ok) return;
                const fresh = await res.json();
                const byId = arr => JSON.stringify([...arr].sort((a,b) => a.id < b.id ? -1 : 1));
                if (byId(fresh) !== byId(this.items)) {
                    this.items = fresh;
                    this.applyCurrentSort();
                    this._renderCurrentTab();
                    this.showRefreshIndicator();
                }
            } catch (e) {}
        }, 30000);
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
        this.viewMode     = localStorage.getItem('po_viewMode')  || 'table';
        this.compactMode  = localStorage.getItem('po_compact')   === '1';
        this.hiddenColumns = new Set(JSON.parse(localStorage.getItem('po_hiddenCols') || '[]'));
        if (this.compactMode) document.querySelector('.app-shell')?.classList.add('compact');
    },

    /* ── Compact mode ─────────────────────────────────────── */
    toggleCompact() {
        this.compactMode = !this.compactMode;
        localStorage.setItem('po_compact', this.compactMode ? '1' : '0');
        document.querySelector('.app-shell').classList.toggle('compact', this.compactMode);
        document.getElementById('compactBtn')?.classList.toggle('vm-active', this.compactMode);
    },

    /* ── Column picker ────────────────────────────────────── */
    toggleColPicker() {
        const dd = document.getElementById('colPickerDropdown');
        if (!dd) return;
        const open = dd.style.display !== 'none';
        if (open) { dd.style.display = 'none'; return; }
        // Build checkboxes
        const allCols = [
            ...this.fields.filter(f => f.type !== 'auto').map(f => ({ id: f.id, name: f.name })),
            { id: '_quotDate', name: 'Quot. Date' },
            ...this.stages.map(s => ({ id: s.id, name: s.name }))
        ];
        dd.innerHTML = allCols.map(col =>
            `<label class="col-picker-item">
                <input type="checkbox" ${this.hiddenColumns.has(col.id) ? '' : 'checked'}
                    onchange="app.toggleColumnVisibility('${col.id}')">
                <span>${col.name}</span>
            </label>`
        ).join('');
        dd.style.display = '';
    },

    toggleColumnVisibility(colId) {
        if (this.hiddenColumns.has(colId)) this.hiddenColumns.delete(colId);
        else this.hiddenColumns.add(colId);
        localStorage.setItem('po_hiddenCols', JSON.stringify([...this.hiddenColumns]));
        this.renderParentHeader();
        this.renderItems();
    },

    setupEventListeners() {
        document.getElementById('addForm').addEventListener('submit', e => {
            e.preventDefault();
            this.saveNewItem();
        });
        document.addEventListener('click', e => {
            const wrap = document.getElementById('colPickerWrap');
            const dd   = document.getElementById('colPickerDropdown');
            if (dd && dd.style.display !== 'none' && wrap && !wrap.contains(e.target)) {
                dd.style.display = 'none';
            }
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

            if (field.id === 'cost') {
                group.appendChild(this._makeCostWrap('cost', 'currency', ''));
            } else if (field.type === 'date') {
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

    _makeCostWrap(costId, currencyId, item) {
        const wrap = document.createElement('div');
        wrap.className = 'cost-wrap';
        const sel = document.createElement('select');
        sel.id = currencyId; sel.className = 'currency-select';
        [['ILS','₪'], ['USD','$'], ['EUR','€']].forEach(([v, t]) => {
            const o = document.createElement('option');
            o.value = v; o.textContent = t;
            if (item && v === (item.currency || 'ILS')) o.selected = true;
            sel.appendChild(o);
        });
        const inp = document.createElement('input');
        inp.type = 'number'; inp.id = costId; inp.min = '0'; inp.step = '0.01';
        inp.placeholder = '0.00';
        if (item) inp.value = item.cost || '';
        wrap.appendChild(sel); wrap.appendChild(inp);

        const hint = document.createElement('span');
        hint.className = 'cost-hint';
        hint.textContent = 'per unit';
        const outer = document.createElement('div');
        outer.className = 'cost-field-wrap';
        outer.appendChild(wrap);
        outer.appendChild(hint);
        return outer;
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

            if (field.id === 'cost') {
                group.appendChild(this._makeCostWrap('edit_cost', 'edit_currency', item));
            } else if (field.type === 'date') {
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
            if (field.id === 'cost') {
                item.cost = parseFloat(value) || 0;
                const cur = document.getElementById('edit_currency');
                if (cur) item.currency = cur.value || 'ILS';
            } else {
                item[field.id] = field.type === 'number' ? (parseFloat(value) || 0)
                               : field.type === 'date'   ? (this.displayToIso(value) || value)
                               : value;
            }
        });

        if (!valid) { this.showMessage('Please fill in all required fields.', 'error'); return; }

        const originalUpdatedAt = item.updatedAt; // capture before mutating
        try {
            if (this.useApi) {
                await this.saveItemApi(item, originalUpdatedAt);
            } else {
                await this.saveItems();
            }
            this.renderItems();
            this.closeEditModal();
            this.showMessage('Item updated successfully!', 'success');
        } catch (err) {
            this.showMessage('⚠️ ' + err.message, 'error', 6000);
        }
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
            if (field.id === 'cost') {
                item.cost = parseFloat(value) || 0;
                const cur = document.getElementById('currency');
                if (cur) item.currency = cur.value || 'ILS';
            } else {
                item[field.id] = field.type === 'number' ? (parseFloat(value) || 0)
                               : field.type === 'date'   ? (this.displayToIso(value) || value)
                               : value;
            }
        });

        if (!valid) { this.showMessage('Please fill in all required fields.', 'error'); return; }

        this.stages.forEach(stage => {
            item[stage.key] = '';
            if (stage.completedKey) item[stage.completedKey] = false;
        });

        this.items.push(item);
        try {
            if (this.useApi) {
                await this.saveItemApi(item, null); // new item — no original timestamp
            } else {
                await this.saveItems();
            }
            this.renderItems();
            this.closeAddModal();
            this.showMessage('Item added successfully!', 'success');
        } catch (err) {
            this.items.pop(); // rollback local add on failure
            this.showMessage('⚠️ ' + err.message, 'error', 6000);
        }
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
        if (this.useApi) { try { await this.saveItemApi(item); } catch(e) {} }
        else await this.saveItems();
        this.renderItems();
    },

    async updateStageStatus(itemId, dateKey, completedKey, checked) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item[completedKey] = checked;
        if (this.useApi) { try { await this.saveItemApi(item); } catch(e) {} }
        else await this.saveItems();
        this.renderItems();
    },

    async updateTracingNumber(itemId, key, value) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;
        item[key] = value;
        if (this.useApi) { try { await this.saveItemApi(item); } catch(e) {} }
        else await this.saveItems();
        this.renderItems();
    },

    async duplicateItem(itemId) {
        const src = this.items.find(i => i.id === itemId);
        if (!src) return;
        const copy = {
            id: Date.now().toString(),
            partNumber:  src.partNumber,
            description: src.description,
            revision:    src.revision,
            quantity:    src.quantity,
            cost:        src.cost,
            currency:    src.currency,
            project:     src.project,
            pd:          src.pd,
            supplier:    src.supplier,
            wd:          src.wd,
            notes:       src.notes,
        };
        this.items.push(copy);
        if (this.useApi) { try { await this.saveItemApi(copy, null); } catch(e) {} }
        else await this.saveItems();
        this.renderItems();
        this.showMessage('Item duplicated', 'success');
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

    isMobile() {
        return window.innerWidth <= 480;
    },

    renderDesktopCards(items) {
        const wrap = document.getElementById('desktopCardsWrapper');
        if (!wrap) return;

        if (!items.length) {
            wrap.innerHTML = '<div class="dcard-empty">No items to display</div>';
            return;
        }

        const CURRENCY = { ILS: '₪', USD: '$', EUR: '€' };

        wrap.innerHTML = items.map((item, idx) => {
            const done    = !!item.hslwhDate;
            const delayed = this.isArrivalDelayed(item);
            const soon    = this.isArrivingSoon(item);
            const status  = done ? 'completed' : delayed ? 'delayed' : soon ? 'soon' : 'progress';
            const stLabel = done ? 'Completed'  : delayed ? 'Delayed'  : soon ? 'Due Soon' : 'In Progress';
            const stClass = done ? 'badge-success' : delayed ? 'badge-danger' : soon ? 'badge-warning' : 'badge-info';

            const sym     = CURRENCY[item.currency || 'ILS'] || '₪';
            const costStr = item.cost ? `${sym}${Number(item.cost).toLocaleString()}` : '—';

            // Stage pipeline
            const pipeline = this.stages.map(stage => {
                const isDone = stage.completedKey ? !!item[stage.completedKey] : !!item[stage.key];
                const lbl    = stage.name.replace(' Date','').replace(' #','#');
                return `<span class="dstage ${isDone ? 'dstage-done' : 'dstage-todo'}">
                    <span class="dstage-dot">${isDone ? '✓' : '○'}</span>
                    <span class="dstage-lbl">${lbl}</span>
                </span>`;
            }).join('<span class="dstage-arrow">›</span>');

            // Key dates
            const dates = [
                item.pd          ? ['PR Date', this.formatDate(item.pd)]            : null,
                item.po          ? ['PO Date', this.formatDate(item.po)]            : null,
                item.promiseDate ? ['Promise',  this.formatDate(item.promiseDate)]  : null,
                item.arrivalDate ? ['Arrival',  this.formatDate(item.arrivalDate)]  : null,
            ].filter(Boolean);

            const datesHtml = dates.map(([k,v]) =>
                `<div class="dcard-date-item">
                    <span class="dcard-dk">${k}</span>
                    <span class="dcard-dv">${v}</span>
                </div>`
            ).join('');

            const poNum = item.poNumber ? `<span class="dcard-po-badge">PO# ${item.poNumber}</span>` : '';

            // Arrival date color based on status
            const arrivalColor = delayed ? '#dc2626' : soon ? '#d97706' : done ? '#16a34a' : 'var(--gray-700)';
            const arrivalBg    = delayed ? '#fef2f2' : soon ? '#fffbeb' : done ? '#f0fdf4' : 'var(--gray-100)';

            // Dates line: Arrival prominent, others secondary
            const arrivalStr = item.arrivalDate
                ? `<span class="dcard-arrival" style="color:${arrivalColor};background:${arrivalBg}">📅 Arrival: <strong>${this.formatDate(item.arrivalDate)}</strong></span>`
                : `<span class="dcard-arrival" style="color:var(--gray-400)">📅 Arrival: —</span>`;

            const secDates = [
                item.po          ? `<span class="dcard-date-sec">PO: ${this.formatDate(item.po)}</span>`            : '',
                item.promiseDate ? `<span class="dcard-date-sec">Promise: ${this.formatDate(item.promiseDate)}</span>` : '',
                item.hslwhDate   ? `<span class="dcard-date-sec" style="color:#16a34a">HSL WH: ${this.formatDate(item.hslwhDate)}</span>` : '',
            ].filter(Boolean).join('<span class="dcard-date-dot">·</span>');

            return `
<div class="dcard dcard-${status}" ondblclick="app.openEditModal('${item.id}')">
    <div class="dcard-header">
        <span class="dcard-serial">#${idx + 1}</span>
        <div class="dcard-title-block">
            <span class="dcard-pn">${item.partNumber || '—'}</span>
            ${item.revision ? `<span class="dcard-rev">Rev.${item.revision}</span>` : ''}
        </div>
        <div class="dcard-header-right">
            ${poNum}
            <span class="badge ${stClass}">${stLabel}</span>
            <button class="dcard-icon-btn dcard-icon-btn-edit" title="Edit" onclick="event.stopPropagation();app.openEditModal('${item.id}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="dcard-icon-btn dcard-icon-btn-dup" title="Duplicate" onclick="event.stopPropagation();app.duplicateItem('${item.id}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
            <button class="dcard-icon-btn dcard-icon-btn-del" title="Delete" onclick="event.stopPropagation();app.deleteItem('${item.id}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
        </div>
    </div>

    <div class="dcard-meta-grid">
        ${item.project  ? `<div class="dcard-meta-item"><span class="dcard-mk">Project</span><span class="dcard-mv">${item.project}</span></div>` : ''}
        ${item.supplier ? `<div class="dcard-meta-item"><span class="dcard-mk">Supplier</span><span class="dcard-mv">${item.supplier}</span></div>` : ''}
        <div class="dcard-meta-item"><span class="dcard-mk">Qty</span><span class="dcard-mv">${item.quantity || '—'}</span></div>
        <div class="dcard-meta-item"><span class="dcard-mk">Cost</span><span class="dcard-mv dcard-cost">${costStr}</span></div>
        ${item.wd ? `<div class="dcard-meta-item"><span class="dcard-mk">Lead</span><span class="dcard-mv">${item.wd}d</span></div>` : ''}
        ${item.description ? `<div class="dcard-meta-item"><span class="dcard-mk">Note</span><span class="dcard-mv" style="color:var(--gray-500);font-style:italic;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.description}</span></div>` : ''}
    </div>

    <div class="dcard-dates-row">
        ${arrivalStr}
        ${secDates ? `<span class="dcard-date-dot">·</span>${secDates}` : ''}
    </div>

    <div class="dcard-pipeline">${pipeline}</div>
</div>`;
        }).join('');
    },

    renderItemCards(items) {
        const wrap = document.getElementById('cardsWrapper');
        if (!wrap) return;
        if (!items.length) {
            wrap.innerHTML = '<div class="cards-empty">No items to display</div>';
            return;
        }
        let html = '';
        items.forEach((item, idx) => {
            const done    = !!item.hslwhDate;
            const delayed = this.isArrivalDelayed(item);
            const soon    = this.isArrivingSoon(item);
            const cardCls = done ? 'card-completed' : delayed ? 'card-delayed' : soon ? 'card-soon' : '';
            const stCls   = done ? 'badge-success'  : delayed ? 'badge-danger'  : soon ? 'badge-warning' : 'badge-info';
            const stTxt   = done ? 'Completed'       : delayed ? 'Delayed'       : soon ? 'Due Soon'      : 'In Progress';

            const stagePills = this.stages.map(stage => {
                const isDone = stage.completedKey ? !!item[stage.completedKey] : !!item[stage.key];
                const name = stage.name.replace(' Date','').replace(' #','#');
                return `<span class="stage-pill ${isDone ? 'pill-done' : 'pill-pending'}">${isDone ? '✓' : '○'} ${name}</span>`;
            }).join('');

            const dets = [];
            if (item.poNumber)       dets.push(['PO #',    item.poNumber]);
            if (item.promiseDate)    dets.push(['Promise', this.isoToDisplay(item.promiseDate)]);
            if (item.po)             dets.push(['PO Date', this.isoToDisplay(item.po)]);
            if (item.arrivalDate)    dets.push(['Arrival', this.isoToDisplay(item.arrivalDate)]);
            if (item.trackingNumber) dets.push(['Track #', item.trackingNumber]);
            const detHtml = dets.map(([k,v]) =>
                `<div class="card-kv"><span class="card-k">${k}</span><span class="card-v">${v}</span></div>`
            ).join('');

            const costSym = { ILS: '₪', USD: '$', EUR: '€' }[item.currency || 'ILS'] || '₪';
            const costStr = item.cost != null && item.cost !== '' ? `${costSym}${Number(item.cost).toLocaleString()}` : '';
            const meta = [item.project, item.supplier, item.quantity ? 'Qty: '+item.quantity : '', costStr].filter(Boolean).join(' · ');
            html += `
<div class="po-card ${cardCls}">
  <div class="card-top">
    <span class="card-num">${idx+1}</span>
    <span class="card-pn">${item.partNumber || '—'}</span>
    <span class="card-badge ${stCls}">${stTxt}</span>
    <button class="card-edit-btn" onclick="app.openEditModal('${item.id}')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Edit
    </button>
  </div>
  <div class="card-mid">
    ${item.description ? `<div class="card-desc">${item.description}${item.revision ? ` <em>Rev.${item.revision}</em>` : ''}</div>` : ''}
    ${meta ? `<div class="card-meta">${meta}</div>` : ''}
  </div>
  ${detHtml ? `<div class="card-details">${detHtml}</div>` : ''}
  <div class="card-stages">${stagePills}</div>
</div>`;
        });
        wrap.innerHTML = html;
    },

    toggleMobileOverflow() {
        const menu = document.getElementById('mobileOverflowMenu');
        if (menu) menu.classList.toggle('show');
    },

    setupMobileUI() {
        document.addEventListener('click', e => {
            const menu = document.getElementById('mobileOverflowMenu');
            const btn  = document.getElementById('mobileOverflowBtn');
            if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target))
                menu.classList.remove('show');
        });
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.renderItems(), 200);
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
        const H = this.hiddenColumns;

        const visFields  = this.fields.filter(f => !H.has(f.id));
        const visStages  = this.stages.filter(s => !H.has(s.id));
        const itemCols   = visFields.length + (H.has('_quotDate') ? 0 : 1);
        const supplyCols = visStages.length + 1; // +1 Actions always visible

        parentRow.innerHTML =
            `<th colspan="${itemCols}"   class="parent-header-cell">Item Details</th>` +
            `<th colspan="${supplyCols}" class="parent-header-cell">Supply Chain</th>`;

        let ch = '';
        visFields.forEach((field, i) => {
            const sticky = i === 0 ? 'sticky-col sticky-col-1' : i === 1 ? 'sticky-col sticky-col-2' : '';
            ch += `<th class="sortable child-th ${sticky}" onclick="app.sortByColumn('${field.id}')">
                       ${field.name}${this.getSortIcon(field.id, false)}
                   </th>`;
        });
        if (!H.has('_quotDate')) ch += `<th class="child-th">Quot. Date</th>`;
        visStages.forEach(stage => {
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
        // Don't render the items table/cards if we're on another tab
        if (this.activeTab && this.activeTab !== 'table') {
            this.updateDashboard(); // still update header KPIs
            return;
        }
        this.updateDashboard();
        this.populateFilterDropdowns();

        const items = this.getDisplayItems();

        const rc = document.getElementById('filterResults');
        if (rc) rc.textContent = items.length === this.items.length
            ? `${this.items.length} items`
            : `${items.length} of ${this.items.length} items`;

        // Sync view-mode toggle buttons
        document.getElementById('vmTable')?.classList.toggle('vm-active', this.viewMode === 'table');
        document.getElementById('vmCards')?.classList.toggle('vm-active', this.viewMode === 'cards');

        const tableWrapper = document.querySelector('.table-wrapper');
        const dcWrapper    = document.getElementById('desktopCardsWrapper');

        if (this.isMobile()) {
            if (tableWrapper) tableWrapper.style.display = 'none';
            if (dcWrapper)    dcWrapper.style.display = 'none';
            this.renderItemCards(items);
            return;
        }

        if (this.viewMode === 'cards') {
            if (tableWrapper) tableWrapper.style.display = 'none';
            if (dcWrapper)    dcWrapper.style.display = '';
            this.renderDesktopCards(items);
            return;
        }

        // Table mode
        if (tableWrapper) tableWrapper.style.display = '';
        if (dcWrapper)    dcWrapper.style.display = 'none';

        const tbody = document.getElementById('itemsBody');
        tbody.innerHTML = '';

        items.forEach((item, rowIndex) => {
            const row = document.createElement('tr');
            if (item.hslwhDate)                   row.classList.add('row-completed');
            else if (this.isArrivalDelayed(item)) row.classList.add('row-delayed');
            else if (this.isArrivingSoon(item))   row.classList.add('row-due-soon');

            let html = '';
            const H = this.hiddenColumns;

            let visIdx = 0;
            this.fields.forEach(field => {
                if (H.has(field.id)) return;
                const sticky = visIdx === 0 ? 'sticky-col sticky-col-1' : visIdx === 1 ? 'sticky-col sticky-col-2' : '';
                visIdx++;

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

                } else if (field.id === 'cost') {
                    const sym = { ILS: '₪', USD: '$', EUR: '€' }[item.currency || 'ILS'] || '₪';
                    const val = item.cost ? `${sym}${Number(item.cost).toLocaleString()}` : '—';
                    html += `<td class="${sticky}">${val}</td>`;

                } else if (field.id === 'description') {
                    const desc = item.description || '';
                    const esc  = desc.replace(/"/g, '&quot;');
                    html += `<td class="${sticky} col-desc" title="${esc}">${desc}</td>`;

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
            if (!H.has('_quotDate')) html += `<td class="col-date">${this.formatDate(quotDate)}</td>`;

            // Stages
            this.stages.forEach(stage => {
                if (H.has(stage.id)) return;
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
                <button class="btn-icon-dupe" onclick="app.duplicateItem('${item.id}')" title="Duplicate item">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
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
            row.addEventListener('dblclick', e => {
                if (e.target.closest('input, button, a, select, textarea')) return;
                this.openEditModal(item.id);
            });
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
                this.fields.forEach(f => {
                    row[f.name] = item[f.id] ?? '';
                    if (f.id === 'cost') row['Currency'] = item.currency || 'ILS';
                });
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
                    this.fields.forEach(f => {
                        if (f.type !== 'auto') item[f.id] = row[f.name] || '';
                        if (f.id === 'cost') item.currency = row['Currency'] || 'ILS';
                    });
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
        const dashboard     = document.getElementById('dashboardSection');
        const received      = document.getElementById('receivedSection');
        const changelog     = document.getElementById('changelogSection');
        const filterBar     = document.querySelector('.filter-bar');
        const tableWrapper  = document.querySelector('.table-wrapper');
        const cardsWrapper  = document.getElementById('cardsWrapper');
        const dcWrapper     = document.getElementById('desktopCardsWrapper');
        const tableTab      = document.getElementById('tableTabBtn');
        const dashTab       = document.getElementById('dashboardTabBtn');
        const recvTab       = document.getElementById('receivedTabBtn');
        const clTab         = document.getElementById('changelogTabBtn');

        // Hide everything first
        dashboard.classList.add('hidden');
        received?.classList.add('hidden');
        changelog?.classList.add('hidden');
        filterBar.style.display = 'none';
        tableWrapper.style.display = 'none';
        if (cardsWrapper) cardsWrapper.style.setProperty('display', 'none', 'important');
        if (dcWrapper) dcWrapper.style.display = 'none';
        tableTab.classList.remove('active');
        dashTab.classList.remove('active');
        recvTab?.classList.remove('active');
        clTab?.classList.remove('active');

        if (view === 'dashboard') {
            this.activeTab = 'dashboard';
            dashboard.classList.remove('hidden');
            dashTab.classList.add('active');
            this.renderDashboard();
        } else if (view === 'received') {
            this.activeTab = 'received';
            received?.classList.remove('hidden');
            recvTab?.classList.add('active');
            this.renderReceived();
        } else if (view === 'changelog') {
            this.activeTab = 'changelog';
            changelog?.classList.remove('hidden');
            clTab?.classList.add('active');
            this._initChangelogView();
        } else {
            // table view
            this.activeTab = 'table';
            filterBar.style.display = '';
            if (cardsWrapper) cardsWrapper.style.removeProperty('display');
            tableTab.classList.add('active');
            this.renderItems();
        }
    },

    setViewMode(mode) {
        this.viewMode = mode;
        localStorage.setItem('po_viewMode', mode);
        document.getElementById('vmTable')?.classList.toggle('vm-active', mode === 'table');
        document.getElementById('vmCards')?.classList.toggle('vm-active', mode === 'cards');
        this.renderItems();
    },

    clearDashDateFilter() {
        document.getElementById('dashFromDate').value = '';
        document.getElementById('dashToDate').value = '';
        this.renderDashboard();
    },

    printDashboard() {
        document.body.classList.add('print-dashboard');
        window.print();
        document.body.classList.remove('print-dashboard');
    },

    /* ── Change Log ──────────────────────────────────────── */
    _initChangelogView() {
        // Check sessionStorage for unlock state
        this.changelogUnlocked = sessionStorage.getItem('cl_unlocked') === '1';
        const lock    = document.getElementById('changelogLock');
        const content = document.getElementById('changelogContent');
        if (this.changelogUnlocked) {
            lock.style.display    = 'none';
            content.style.display = 'flex';
            this.renderChangelog();
        } else {
            lock.style.display    = '';
            content.style.display = 'none';
            // Focus password field
            setTimeout(() => document.getElementById('changelogPasswordInput')?.focus(), 50);
        }
    },

    unlockChangelog() {
        const input = document.getElementById('changelogPasswordInput');
        const error = document.getElementById('changelogLockError');
        if (input.value === '3109') {
            sessionStorage.setItem('cl_unlocked', '1');
            this.changelogUnlocked = true;
            document.getElementById('changelogLock').style.display    = 'none';
            document.getElementById('changelogContent').style.display = 'flex';
            this.renderChangelog();
        } else {
            error.textContent = '❌ Incorrect password.';
            input.value = '';
            input.classList.add('error');
            setTimeout(() => { input.classList.remove('error'); error.textContent = ''; }, 2000);
        }
    },

    async refreshChangelog() {
        this._changelogCache = null;
        await this.renderChangelog();
    },

    clearChangelogFilter() {
        const uf = document.getElementById('clUserFilter');
        const af = document.getElementById('clActionFilter');
        if (uf) uf.value = '';
        if (af) af.value = '';
        this.renderChangelog();
    },

    async renderChangelog() {
        const timeline = document.getElementById('clTimeline');
        const empty    = document.getElementById('clEmpty');
        const summary  = document.getElementById('clSummary');
        if (!timeline) return;

        timeline.innerHTML = '<div class="cl-loading">Loading…</div>';
        if (empty) empty.style.display = 'none';

        try {
            // Fetch (with simple cache)
            if (!this._changelogCache) {
                const res = await fetch('/api/changelog?limit=500');
                if (!res.ok) throw new Error('Failed to load changelog');
                this._changelogCache = await res.json();
            }
            let entries = this._changelogCache;

            // Populate user filter
            const uf = document.getElementById('clUserFilter');
            if (uf) {
                const users = [...new Set(entries.map(e => e.user).filter(Boolean))].sort();
                const prev  = uf.value;
                uf.innerHTML = '<option value="">All Users</option>' +
                    users.map(u => `<option value="${this._esc(u)}" ${u === prev ? 'selected' : ''}>${this._esc(u)}</option>`).join('');
                if (prev) uf.value = prev;
            }

            // Apply filters
            const userFilter   = uf?.value || '';
            const actionFilter = document.getElementById('clActionFilter')?.value || '';
            if (userFilter)   entries = entries.filter(e => e.user === userFilter);
            if (actionFilter) entries = entries.filter(e => e.action === actionFilter);

            // Summary
            if (summary) {
                const counts = { created: 0, updated: 0, deleted: 0, imported: 0 };
                entries.forEach(e => { if (counts[e.action] !== undefined) counts[e.action]++; });
                summary.innerHTML =
                    `<span class="cl-badge badge-created">${counts.created} Created</span>` +
                    `<span class="cl-badge badge-updated">${counts.updated} Updated</span>` +
                    `<span class="cl-badge badge-deleted">${counts.deleted} Deleted</span>` +
                    `<span class="cl-badge badge-imported">${counts.imported} Imported</span>` +
                    `<span class="cl-badge badge-total">${entries.length} Total</span>`;
            }

            if (!entries.length) {
                timeline.innerHTML = '';
                if (empty) empty.style.display = '';
                return;
            }

            // Group entries by date
            const groups = {};
            entries.forEach(e => {
                const date = e.timestamp ? e.timestamp.slice(0, 10) : 'Unknown';
                if (!groups[date]) groups[date] = [];
                groups[date].push(e);
            });

            const actionIcons   = { created: '➕', updated: '✏️', deleted: '🗑️', imported: '📥' };
            const actionLabels  = { created: 'Created', updated: 'Updated', deleted: 'Deleted', imported: 'Imported' };

            let html = '';
            Object.keys(groups).sort((a, b) => b.localeCompare(a)).forEach(date => {
                const label = this._formatDateLabel(date);
                html += `<div class="cl-date-group"><div class="cl-date-label">${label}</div>`;
                groups[date].forEach(entry => {
                    const action  = entry.action || 'updated';
                    const icon    = actionIcons[action]  || '📝';
                    const badge   = actionLabels[action] || action;
                    const time    = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    const user    = this._esc(entry.user || 'Unknown');
                    const pn      = this._esc(entry.partNumber || '');
                    const proj    = this._esc(entry.project || '');

                    // Build field changes list
                    let changesHtml = '';
                    if (entry.changes && entry.changes.length) {
                        changesHtml = '<div class="cl-changes">' +
                            entry.changes.map(c =>
                                `<div class="cl-change-row">
                                    <span class="cl-field-name">${this._esc(c.field)}</span>
                                    <span class="cl-from">${this._esc(c.from) || '<em>empty</em>'}</span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                    <span class="cl-to">${this._esc(c.to) || '<em>empty</em>'}</span>
                                </div>`
                            ).join('') +
                        '</div>';
                    }

                    html += `
                        <div class="cl-entry cl-entry-${action}">
                            <div class="cl-entry-left">
                                <div class="cl-dot cl-dot-${action}"></div>
                                <div class="cl-line"></div>
                            </div>
                            <div class="cl-entry-body">
                                <div class="cl-entry-header">
                                    <span class="cl-action-badge badge-${action}">${icon} ${badge}</span>
                                    ${pn ? `<span class="cl-pn">${pn}</span>` : ''}
                                    ${proj ? `<span class="cl-proj">📁 ${proj}</span>` : ''}
                                    <span class="cl-spacer"></span>
                                    <span class="cl-user">👤 ${user}</span>
                                    <span class="cl-time">🕐 ${time}</span>
                                </div>
                                ${changesHtml}
                            </div>
                        </div>`;
                });
                html += '</div>';
            });

            timeline.innerHTML = html;

        } catch (err) {
            timeline.innerHTML = `<div class="cl-error">⚠️ ${this._esc(err.message)}</div>`;
        }
    },

    _formatDateLabel(dateStr) {
        if (!dateStr || dateStr === 'Unknown') return 'Unknown Date';
        const d = new Date(dateStr + 'T00:00:00');
        const today = new Date(); today.setHours(0,0,0,0);
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        if (d.getTime() === today.getTime()) return 'Today';
        if (d.getTime() === yesterday.getTime()) return 'Yesterday';
        return d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    },

    _esc(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },

    /* ── Received Report ─────────────────────────────────── */
    setRecvSort(col) {
        if (this.recvSort.col === col) {
            this.recvSort.dir = this.recvSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            this.recvSort = { col, dir: 'asc' };
        }
        this.renderReceived();
    },

    renderReceived() {
        const from    = document.getElementById('recvFromDate')?.value;
        const to      = document.getElementById('recvToDate')?.value;
        const body    = document.getElementById('recvBody');
        const empty   = document.getElementById('recvEmpty');
        const summary = document.getElementById('recvSummary');
        const thead   = document.getElementById('recvThead');
        if (!body) return;

        const { col: sortCol, dir: sortDir } = this.recvSort;

        // Filter: must have hslwhDate, within range
        let items = this.items.filter(i => !!i.hslwhDate);
        if (from) items = items.filter(i => i.hslwhDate >= from);
        if (to)   items = items.filter(i => i.hslwhDate <= to);

        // Sort by selected column
        const colKey = {
            'num':         (i, idx) => idx,
            'partNumber':  i => (i.partNumber  || '').toLowerCase(),
            'description': i => (i.description || '').toLowerCase(),
            'revision':    i => (i.revision    || '').toLowerCase(),
            'quantity':    i => parseFloat(i.quantity) || 0,
            'supplier':    i => (i.supplier    || '').toLowerCase(),
            'project':     i => (i.project     || '').toLowerCase(),
            'hslwhDate':   i => i.hslwhDate || '',
        };
        const keyFn = colKey[sortCol] || colKey['hslwhDate'];
        items = items.slice().sort((a, b) => {
            const av = keyFn(a), bv = keyFn(b);
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return sortDir === 'asc' ? cmp : -cmp;
        });

        // Render sortable header
        const arrow = col => {
            if (sortCol !== col) return '<span class="recv-sort-icon">⇅</span>';
            return `<span class="recv-sort-icon active">${sortDir === 'asc' ? '↑' : '↓'}</span>`;
        };
        if (thead) {
            thead.innerHTML = `<tr>
                <th class="recv-th" onclick="app.setRecvSort('num')">#${arrow('num')}</th>
                <th class="recv-th" onclick="app.setRecvSort('partNumber')">Part Number${arrow('partNumber')}</th>
                <th class="recv-th" onclick="app.setRecvSort('description')">Description${arrow('description')}</th>
                <th class="recv-th" onclick="app.setRecvSort('revision')">Rev${arrow('revision')}</th>
                <th class="recv-th" onclick="app.setRecvSort('quantity')">Qty${arrow('quantity')}</th>
                <th class="recv-th" onclick="app.setRecvSort('supplier')">Supplier${arrow('supplier')}</th>
                <th class="recv-th" onclick="app.setRecvSort('project')">Project${arrow('project')}</th>
                <th class="recv-th" onclick="app.setRecvSort('hslwhDate')">HSL WH Date${arrow('hslwhDate')}</th>
            </tr>`;
        }

        // Summary KPIs
        const totalQty  = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
        const suppliers = new Set(items.filter(i => i.supplier).map(i => i.supplier)).size;
        const rangeLabel = (from || to)
            ? `${from ? this.isoToDisplay(from) : '—'} → ${to ? this.isoToDisplay(to) : '—'}`
            : 'All time';

        summary.innerHTML = `
            <div class="recv-kpi"><span class="recv-kpi-label">Items Received</span><span class="recv-kpi-value">${items.length}</span></div>
            <div class="recv-kpi"><span class="recv-kpi-label">Total Qty</span><span class="recv-kpi-value">${totalQty || '—'}</span></div>
            <div class="recv-kpi"><span class="recv-kpi-label">Suppliers</span><span class="recv-kpi-value">${suppliers}</span></div>
            <div class="recv-kpi" style="flex:1;min-width:160px"><span class="recv-kpi-label">Period</span><span class="recv-kpi-value" style="font-size:14px;font-weight:700;color:var(--gray-600)">${rangeLabel}</span></div>
        `;

        if (!items.length) {
            body.innerHTML = '';
            empty.style.display = '';
            return;
        }
        empty.style.display = 'none';

        body.innerHTML = items.map((item, idx) => `<tr>
            <td class="recv-num">${idx + 1}</td>
            <td class="recv-pn">${item.partNumber || '—'}</td>
            <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(item.description||'').replace(/"/g,'&quot;')}">${item.description || '—'}</td>
            <td>${item.revision || '—'}</td>
            <td class="recv-qty">${item.quantity || '—'}</td>
            <td>${item.supplier || '—'}</td>
            <td>${item.project || '—'}</td>
            <td class="recv-date">${this.formatDate(item.hslwhDate)}</td>
        </tr>`).join('');
    },

    clearRecvFilter() {
        document.getElementById('recvFromDate').value = '';
        document.getElementById('recvToDate').value = '';
        this.renderReceived();
    },

    printReceived() {
        document.body.classList.add('print-received');
        window.print();
        document.body.classList.remove('print-received');
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
        // Fetch exchange rates once per session
        if (!this.exchangeRates) this.fetchExchangeRates();
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

        // Date range label in header
        const from = document.getElementById('dashFromDate')?.value;
        const to   = document.getElementById('dashToDate')?.value;
        const rangeEl = document.getElementById('dashDateRangeLabel');
        if (rangeEl) {
            if (from || to) {
                rangeEl.textContent = `${from ? this.formatDate(from) : '…'} – ${to ? this.formatDate(to) : '…'}`;
            } else {
                rangeEl.textContent = 'All time';
            }
        }

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
        this.renderPrPoKpi(items);
        this.renderCostByProject(items);
        this.renderAging(items);
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

    setTimelineGranularity(g) {
        this.timelineGranularity = g;
        document.querySelectorAll('.trend-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.g === g));
        this.renderTimelineChart(this.getDashItems());
    },

    _isoWeek(dateStr) {
        const d = new Date(dateStr);
        const thu = new Date(d);
        thu.setDate(d.getDate() - (d.getDay() + 6) % 7 + 3);
        const firstThu = new Date(thu.getFullYear(), 0, 4);
        firstThu.setDate(firstThu.getDate() - (firstThu.getDay() + 6) % 7 + 3);
        const week = Math.round((thu - firstThu) / 604800000) + 1;
        return `${thu.getFullYear()}-W${String(week).padStart(2, '0')}`;
    },

    renderTimelineChart(items) {
        const g = this.timelineGranularity || 'month';
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        const getKey = dateStr => {
            if (!dateStr) return null;
            if (g === 'day')   return dateStr.slice(0, 10);
            if (g === 'week')  return this._isoWeek(dateStr);
            if (g === 'month') return dateStr.slice(0, 7);
            if (g === 'year')  return dateStr.slice(0, 4);
        };

        const formatLabel = key => {
            if (g === 'day')   { const [y,m,d] = key.split('-'); return `${d}/${m}`; }
            if (g === 'week')  { const [yr, w] = key.split('-W'); return `W${w} '${yr.slice(2)}`; }
            if (g === 'month') { const [y,m] = key.split('-'); return `${MONTHS[+m-1]} '${y.slice(2)}`; }
            if (g === 'year')  return key;
        };

        const counts = {};
        items.filter(i => i.hslwhDate).forEach(i => {
            const k = getKey(i.hslwhDate);
            if (k) counts[k] = (counts[k] || 0) + 1;
        });

        const limits = { day: 30, week: 26, month: 12, year: 10 };
        const keys   = Object.keys(counts).sort().slice(-limits[g]);
        const labels = keys.map(formatLabel);
        const capG   = g.charAt(0).toUpperCase() + g.slice(1);

        const ctx = document.getElementById('timelineChart');
        if (!ctx) return;
        if (this.dashboardCharts.timeline) this.dashboardCharts.timeline.destroy();

        this.dashboardCharts.timeline = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{ label: `Deliveries per ${capG}`,
                    data: keys.map(k => counts[k] || 0),
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

    /* ── 1. PR → PO Average ─────────────────────────────── */
    renderPrPoKpi(items) {
        const el = document.getElementById('dashAvgPrPo');
        if (!el) return;
        const withBoth = items.filter(i => i.pd && i.po);
        if (!withBoth.length) { el.textContent = '—'; return; }
        const avg = withBoth.reduce((s, i) => s + (this.calculateDaysBetween(i.pd, i.po) || 0), 0) / withBoth.length;
        el.textContent = avg.toFixed(1) + 'd';
        el.style.color = avg <= 7 ? 'var(--success)' : avg <= 14 ? 'var(--warning)' : 'var(--danger)';
    },

    /* ── Exchange rates ──────────────────────────────────── */
    async fetchExchangeRates() {
        try {
            const res = await fetch('/api/rates');
            if (!res.ok) throw new Error('rate fetch failed');
            const data = await res.json();
            this.exchangeRates = { ...data.rates, ILS: 1, _date: data.date };
        } catch (e) {
            // Fallback rates if API is unavailable
            this.exchangeRates = { ILS: 1, USD: 0.273, EUR: 0.251, _date: 'offline' };
            console.warn('Exchange rate fetch failed, using fallback rates');
        }
        this._updateRatesDisplay();
    },

    // Convert amount from sourceCurrency to this.dashCurrency
    convertCurrency(amount, fromCurrency) {
        if (!this.exchangeRates) return amount;
        const from = fromCurrency || 'ILS';
        const to   = this.dashCurrency;
        if (from === to) return amount;
        // Convert: amount → ILS → target
        const toIls   = from === 'ILS' ? 1 : 1 / (this.exchangeRates[from] || 1);
        const fromIls = to   === 'ILS' ? 1 : (this.exchangeRates[to]   || 1);
        return amount * toIls * fromIls;
    },

    setCurrency(cur) {
        this.dashCurrency = cur;
        document.querySelectorAll('.cur-btn').forEach(b =>
            b.classList.toggle('cur-btn-active', b.dataset.cur === cur));
        this._updateRatesDisplay();
        this.renderCostByProject(this.getDashItems());
    },

    _updateRatesDisplay() {
        const el = document.getElementById('dashRatesInfo');
        if (!el || !this.exchangeRates) return;
        const r   = this.exchangeRates;
        const date = r._date === 'offline' ? '⚠️ offline rates' : `ECB · ${r._date}`;
        // Show 1 unit of each foreign currency in selected display currency
        const fmt = (from, to) => {
            const sym = { ILS: '₪', USD: '$', EUR: '€' };
            const val = this.convertCurrency(1, from);
            return `1 ${sym[from]} = ${sym[to]}${val.toFixed(3)}`;
        };
        const cur = this.dashCurrency;
        const others = ['ILS','USD','EUR'].filter(c => c !== cur);
        el.innerHTML =
            `<span>${fmt(others[0], cur)}</span>` +
            `<span>${fmt(others[1], cur)}</span>` +
            `<span class="rates-date">${date}</span>`;
    },

    /* ── 2. Cost by Project + Order Lines (dual-axis) ───── */
    renderCostByProject(items) {
        const ctx = document.getElementById('costProjectChart');
        if (!ctx) return;
        if (this.dashboardCharts.costProject) this.dashboardCharts.costProject.destroy();

        const sym    = { ILS: '₪', USD: '$', EUR: '€' };
        const curSym = sym[this.dashCurrency] || '₪';

        // Collect both metrics per project
        const data = {};
        items.forEach(i => {
            if (!i.project) return;
            if (!data[i.project]) data[i.project] = { cost: 0, lines: 0 };
            const raw   = (parseFloat(i.cost) || 0) * (parseFloat(i.quantity) || 1);
            data[i.project].cost  += this.exchangeRates ? this.convertCurrency(raw, i.currency || 'ILS') : raw;
            data[i.project].lines += 1;
        });

        // Sort by cost descending — same order for both metrics
        const sorted = Object.entries(data).sort((a, b) => b[1].cost - a[1].cost);
        if (!sorted.length) return;

        const labels = sorted.map(e => e[0]);
        const costs  = sorted.map(e => +e[1].cost.toFixed(2));
        const lines  = sorted.map(e => e[1].lines);

        this.dashboardCharts.costProject = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Total Spend',
                        data: costs,
                        backgroundColor: '#2563eb',
                        borderRadius: 6, barThickness: 22,
                        yAxisID: 'yCost',
                        order: 2,
                    },
                    {
                        label: 'Order Lines',
                        data: lines,
                        type: 'line',
                        borderColor: '#d97706',
                        backgroundColor: '#d9770622',
                        borderWidth: 2.5,
                        pointBackgroundColor: '#d97706',
                        pointRadius: 5, pointHoverRadius: 7,
                        tension: 0.3, fill: false,
                        yAxisID: 'yLines',
                        order: 1,
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true, position: 'top',
                        labels: { font: { size: 11 }, usePointStyle: true, boxWidth: 8 }
                    },
                    tooltip: {
                        callbacks: {
                            label: c => c.dataset.label === 'Total Spend'
                                ? `${c.dataset.label}: ${curSym}${c.raw.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                                : `${c.dataset.label}: ${c.raw}`
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                    yCost: {
                        position: 'left', beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { callback: v => curSym + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v), font: { size: 10 } },
                        title: { display: true, text: `Spend (${curSym})`, font: { size: 10 }, color: '#2563eb' }
                    },
                    yLines: {
                        position: 'right', beginAtZero: true,
                        grid: { drawOnChartArea: false },
                        ticks: { stepSize: 1, font: { size: 10 } },
                        title: { display: true, text: 'Order Lines', font: { size: 10 }, color: '#d97706' }
                    }
                }
            }
        });
    },

    /* ── 3. Aging Report ─────────────────────────────────── */
    renderAging(items) {
        const bandsEl = document.getElementById('dashAgingBands');
        const tbody   = document.getElementById('dashAgingBody');
        if (!tbody) return;

        const today = new Date(); today.setHours(0,0,0,0);

        // Open = has PO date, not yet in warehouse
        const open = items.filter(i => i.po && !i.hslwhDate);

        const bands = [
            { label: '0 – 30 days',  min: 0,  max: 30,  color: '#16a34a', bg: '#f0fdf4' },
            { label: '31 – 60 days', min: 31, max: 60,  color: '#d97706', bg: '#fffbeb' },
            { label: '61 – 90 days', min: 61, max: 90,  color: '#ea580c', bg: '#fff7ed' },
            { label: '90+ days',     min: 91, max: 9999, color: '#dc2626', bg: '#fef2f2' },
        ];

        // Band summary chips
        if (bandsEl) {
            bandsEl.innerHTML = bands.map(b => {
                const cnt = open.filter(i => {
                    const d = this.calculateDaysBetween(i.po, today.toISOString().slice(0,10));
                    return d !== null && d >= b.min && d <= b.max;
                }).length;
                return `<div class="aging-band" style="background:${b.bg};border-color:${b.color}">
                    <span class="aging-band-label" style="color:${b.color}">${b.label}</span>
                    <span class="aging-band-count" style="color:${b.color}">${cnt}</span>
                </div>`;
            }).join('');
        }

        // Detailed table — only orange & red (31+ days), sorted by waiting days desc
        const rows = open.map(i => {
            const days = this.calculateDaysBetween(i.po, today.toISOString().slice(0,10)) || 0;
            const band = bands.find(b => days >= b.min && days <= b.max) || bands[3];
            return { item: i, days, band };
        }).filter(r => r.days >= 31).sort((a, b) => b.days - a.days);

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--gray-400);padding:20px">✅ No orders over 30 days</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(({ item, days, band }) => `<tr>
            <td>${item.serialNumber || '—'}</td>
            <td><strong>${item.partNumber || '—'}</strong></td>
            <td>${item.project  || '—'}</td>
            <td>${item.supplier || '—'}</td>
            <td>${this.formatDate(item.po)}</td>
            <td><strong>${days}</strong></td>
            <td><span class="aging-badge" style="background:${band.bg};color:${band.color};border:1px solid ${band.color}44">${band.label}</span></td>
        </tr>`).join('');
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
    showMessage(text, type, duration = 3500) {
        const msg = document.getElementById('message');
        msg.textContent = text;
        msg.className = `message ${type}`;
        clearTimeout(this._msgTimer);
        this._msgTimer = setTimeout(() => { msg.className = 'message'; }, duration);
    },

    /* Save a single item to API with optimistic locking.
       Pass the original updatedAt so the server can detect conflicts. */
    async saveItemApi(item, originalUpdatedAt) {
        const payload = {
            ...item,
            lastModifiedBy: this.currentUser || 'Unknown',
            _clientUpdatedAt: originalUpdatedAt ?? item.updatedAt ?? null,
        };
        const res = await fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (res.status === 409) {
            const body = await res.json();
            // Conflict: update our local copy with server version, then alert user
            const idx = this.items.findIndex(i => i.id === item.id);
            if (idx !== -1 && body.serverItem) this.items[idx] = body.serverItem;
            this._renderCurrentTab();
            throw new Error(body.message || 'Conflict: item was modified by someone else.');
        }
        if (!res.ok) throw new Error(await res.text());

        const saved = await res.json();
        // Update local copy with server-stamped updatedAt
        const idx = this.items.findIndex(i => i.id === saved.id);
        if (idx !== -1) this.items[idx] = saved;
        return saved;
    },

    async saveItems() {
        if (this.useApi) {
            try {
                // Bulk PUT used for import — no locking needed
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
