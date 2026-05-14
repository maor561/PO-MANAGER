
const DEFAULT_FIELDS = [
    { id: 'serialNumber', name: '#', required: false, type: 'auto' },
    { id: 'partNumber', name: 'P/N', required: true, type: 'text' },
    { id: 'revision', name: 'REV', required: false, type: 'text' },
    { id: 'quantity', name: 'Qty', required: false, type: 'number' },
    { id: 'project', name: 'Project', required: true, type: 'text' },
    { id: 'pd', name: 'Purchase Req.', required: false, type: 'date' },
    { id: 'poNumber', name: 'PO #', required: false, type: 'text' },
    { id: 'po', name: 'PO Date', required: false, type: 'date' },
    { id: 'supplier', name: 'Supplier', required: false, type: 'text' },
    { id: 'wd', name: 'Working Days', required: false, type: 'number' },
    { id: 'notes', name: 'Notes', required: false, type: 'textarea' }
];

const DEFAULT_STAGES = [
    { id: 'eq', name: 'EQ', key: 'eqDate', completedKey: 'eqCompleted' },
    { id: 'coc', name: 'COC', key: 'cocDate', completedKey: 'cocCompleted' },
    { id: 'arrival', name: 'Arrival Date', key: 'arrivalDate', completedKey: 'arrivalCompleted' },
    { id: 'tracing', name: 'Tracing #', key: 'tracingNumber', type: 'text' },
    { id: 'hslwh', name: 'HSL WH', key: 'hslwhDate', completedKey: 'hslwhCompleted' }
];

const app = {
    items: [],
    filteredItems: [],
    currentSort: null,
    fields: [],
    stages: [],
    hideCompleted: false,
    useApi: false,

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

    openSettings() {
        this.renderFieldsSettings();
        this.renderStagesSettings();
        document.getElementById('settingsModal').classList.add('show');
    },

    closeSettings() {
        document.getElementById('settingsModal').classList.remove('show');
    },

    switchSettingsTab(tab) {
        document.querySelectorAll('.settings-tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.settings-tab-btn').forEach(el => el.classList.remove('active'));
        document.getElementById(tab + 'Tab').classList.add('active');
        event.target.classList.add('active');
    },

    renderFieldsSettings() {
        const tbody = document.getElementById('fieldsTableBody');
        tbody.innerHTML = '';
        this.fields.forEach(field => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${field.name}</td>
                <td>${field.id}</td>
                <td>${field.required ? '✓' : '—'}</td>
            `;
            tbody.appendChild(row);
        });
    },

    renderStagesSettings() {
        const tbody = document.getElementById('stagesTableBody');
        tbody.innerHTML = '';
        this.stages.forEach(stage => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${stage.name}</td>
                <td>${stage.id}</td>
            `;
            tbody.appendChild(row);
        });
    },

    setupEventListeners() {
        document.getElementById('addForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveNewItem();
        });
    },

    addNewItem() {
        this.generateAddItemForm();
        document.getElementById('addForm').reset();
        document.getElementById('addModal').classList.add('show');
    },

    generateAddItemForm() {
        const container = document.getElementById('formFields');
        container.innerHTML = '';

        this.fields.forEach(field => {
            if (field.type === 'auto') return; // serial number is auto, skip

            const group = document.createElement('div');
            group.className = 'form-group';

            const label = document.createElement('label');
            label.textContent = field.name + (field.required ? ' *' : '');
            group.appendChild(label);

            let input;
            if (field.type === 'textarea') {
                input = document.createElement('textarea');
                input.id = field.id;
                input.rows = 2;
            } else {
                input = document.createElement('input');
                input.type = field.type === 'number' ? 'number' : (field.type === 'date' ? 'date' : 'text');
                input.id = field.id;
                if (field.type === 'number') input.min = '0';
            }

            if (field.required) input.required = true;
            group.appendChild(input);
            container.appendChild(group);
        });
    },

    closeAddModal() {
        document.getElementById('addModal').classList.remove('show');
    },

    getNextSerial() {
        if (this.items.length === 0) return 1;
        const maxSerial = Math.max(...this.items.map(i => parseInt(i.serialNumber) || 0));
        return maxSerial + 1;
    },

    async saveNewItem() {
        const item = {
            id: String(Date.now()),
            serialNumber: this.getNextSerial(),
            createdAt: new Date().toISOString()
        };

        let isValid = true;
        this.fields.forEach(field => {
            if (field.type === 'auto') return;
            const input = document.getElementById(field.id);
            if (!input) return;
            const value = input.value.trim();
            if (field.required && !value) {
                input.classList.add('error');
                isValid = false;
            } else {
                input.classList.remove('error');
                item[field.id] = field.type === 'number' ? (parseFloat(value) || 0) : value;
            }
        });

        if (!isValid) {
            this.showMessage('Please fill in all required fields.', 'error');
            return;
        }

        this.stages.forEach(stage => {
            if (stage.type === 'text') {
                item[stage.key] = '';
            } else {
                item[stage.key] = '';
                item[stage.completedKey] = false;
            }
        });

        this.items.push(item);
        await this.saveItems();
        this.renderItems();
        this.closeAddModal();
        this.showMessage('Item added successfully!', 'success');
    },

    async updateStageDate(itemId, stageKey, dateValue) {
        const item = this.items.find(i => i.id === itemId);
        if (item) {
            item[stageKey] = dateValue;
            await this.saveItems();
            this.renderItems();
        }
    },

    async updateStageStatus(itemId, dateKey, completedKey, checked) {
        const item = this.items.find(i => i.id === itemId);
        if (item) {
            item[completedKey] = checked;
            item[dateKey] = checked ? new Date().toISOString().split('T')[0] : '';
            await this.saveItems();
            this.renderItems();
        }
    },

    async updateTracingNumber(itemId, key, value) {
        const item = this.items.find(i => i.id === itemId);
        if (item) {
            item[key] = value;
            await this.saveItems();
        }
    },

    async deleteItem(itemId) {
        if (confirm('Delete this item?')) {
            if (this.useApi) {
                try {
                    await fetch(`/api/items?id=${itemId}`, { method: 'DELETE' });
                } catch (e) { /* fall through to local delete */ }
            }
            this.items = this.items.filter(i => i.id !== itemId);
            await this.saveItems();
            this.renderItems();
            this.showMessage('Item deleted.', 'success');
        }
    },

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

    formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('en-GB'); // DD/MM/YYYY
    },

    calculateDaysBetween(d1, d2) {
        if (!d1 || !d2) return null;
        const a = new Date(d1); a.setHours(0, 0, 0, 0);
        const b = new Date(d2); b.setHours(0, 0, 0, 0);
        if (isNaN(a) || isNaN(b)) return null;
        return Math.round((b - a) / 86400000);
    },

    isArrivalDelayed(item) {
        if (!item.arrivalDate || item.hslwhCompleted) return false;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const arrival = new Date(item.arrivalDate); arrival.setHours(0, 0, 0, 0);
        return today > arrival;
    },

    renderItems() {
        this.updateDashboard();
        const tbody = document.getElementById('itemsBody');
        tbody.innerHTML = '';

        const itemsToRender = this.filteredItems.length > 0 ? this.filteredItems : [...this.items];

        itemsToRender.forEach(item => {
            const row = document.createElement('tr');
            if (this.isArrivalDelayed(item)) row.classList.add('row-delayed');

            let html = '';

            // Item detail fields
            this.fields.forEach((field, index) => {
                const sticky = index === 0 ? 'sticky-col sticky-col-1' : index === 1 ? 'sticky-col sticky-col-2' : '';

                if (field.id === 'serialNumber') {
                    html += `<td class="${sticky}"><strong>${item.serialNumber || ''}</strong></td>`;

                } else if (field.id === 'pd') {
                    html += `<td class="${sticky}">${this.formatDate(item.pd)}</td>`;

                } else if (field.id === 'po') {
                    // Show PO date + days elapsed from Purchase Req.
                    const daysToPO = this.calculateDaysBetween(item.pd, item.po);
                    const badge = daysToPO !== null
                        ? `<span class="days-badge">${daysToPO}d from PR</span>`
                        : '';
                    html += `<td class="${sticky}">
                        <div class="date-with-badge">${this.formatDate(item.po)}${badge}</div>
                    </td>`;

                } else {
                    html += `<td class="${sticky}">${item[field.id] ?? ''}</td>`;
                }
            });

            // Calculated Quotation Date column
            const quotDate = this.calculateQuotationDate(item.po, item.wd);
            html += `<td>${this.formatDate(quotDate)}</td>`;

            // Stage columns
            this.stages.forEach(stage => {
                if (stage.type === 'text') {
                    const val = item[stage.key] || '';
                    html += `
                        <td>
                            <input type="text" class="tracing-input"
                                value="${val.replace(/"/g, '&quot;')}"
                                placeholder="—"
                                onchange="app.updateTracingNumber('${item.id}', '${stage.key}', this.value)">
                        </td>`;
                } else {
                    const dateVal = item[stage.key] || '';
                    const isCompleted = item[stage.completedKey] || false;

                    // HSL WH: also show days from PO to receipt
                    let extraBadge = '';
                    if (stage.id === 'hslwh') {
                        const daysFromPO = this.calculateDaysBetween(item.po, dateVal);
                        if (daysFromPO !== null) {
                            extraBadge = `<span class="days-badge">${daysFromPO}d from PO</span>`;
                        }
                    }

                    html += `
                        <td>
                            <div class="stage-cell">
                                <input type="checkbox" class="stage-checkbox"
                                    ${isCompleted ? 'checked' : ''}
                                    onchange="app.updateStageStatus('${item.id}', '${stage.key}', '${stage.completedKey}', this.checked)">
                                <input type="date" class="stage-date-input"
                                    value="${dateVal}"
                                    onchange="app.updateStageDate('${item.id}', '${stage.key}', this.value)">
                                ${extraBadge}
                            </div>
                        </td>`;
                }
            });

            // Actions
            html += `
                <td class="action-buttons">
                    <button class="btn-danger" onclick="app.deleteItem('${item.id}')" title="Delete">🗑️</button>
                </td>`;

            row.innerHTML = html;
            tbody.appendChild(row);
        });
    },

    updateDashboard() {
        const total = this.items.length;
        const completed = this.items.filter(i => i.hslwhCompleted).length;
        const delayed = this.items.filter(i => this.isArrivalDelayed(i)).length;
        const inProgress = total - completed;

        document.getElementById('totalItems').textContent = total;
        document.getElementById('completedItems').textContent = completed;
        document.getElementById('delayedItems').textContent = delayed;
        document.getElementById('inProgressItems').textContent = inProgress;
    },

    filterItems() {
        const searchText = document.getElementById('searchBox').value.toLowerCase();
        this.filteredItems = this.items.filter(item => {
            if (this.hideCompleted && item.hslwhCompleted) return false;
            if (!searchText) return true;
            return this.fields.some(field => {
                const val = item[field.id];
                return val && String(val).toLowerCase().includes(searchText);
            });
        });
        this.renderItems();
    },

    toggleHideCompleted() {
        this.hideCompleted = !this.hideCompleted;
        const btn = document.getElementById('toggleCompletedBtn');
        if (this.hideCompleted) {
            btn.classList.add('active');
            btn.textContent = '👁 Show Completed';
        } else {
            btn.classList.remove('active');
            btn.textContent = '👁 Hide Completed';
        }
        this.filterItems();
    },

    sortByColumn(column) {
        const isAsc = this.currentSort !== `${column}-asc`;
        this.currentSort = isAsc ? `${column}-asc` : `${column}-desc`;

        this.items.sort((a, b) => {
            let aVal = a[column] || '';
            let bVal = b[column] || '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(aVal)) {
                aVal = new Date(aVal).getTime() || 0;
                bVal = new Date(bVal).getTime() || 0;
            } else if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = (bVal || '').toLowerCase();
            }
            return isAsc ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
        });

        this.filteredItems = [];
        this.renderItems();
    },

    sortByStageKey(stageKey) {
        const isAsc = this.currentSort !== `stage-${stageKey}-asc`;
        this.currentSort = isAsc ? `stage-${stageKey}-asc` : `stage-${stageKey}-desc`;

        this.items.sort((a, b) => {
            const aDate = a[stageKey] || '';
            const bDate = b[stageKey] || '';
            if (!aDate && bDate) return isAsc ? 1 : -1;
            if (aDate && !bDate) return isAsc ? -1 : 1;
            if (!aDate && !bDate) return 0;
            const diff = new Date(aDate) - new Date(bDate);
            return isAsc ? diff : -diff;
        });

        this.filteredItems = [];
        this.renderItems();
    },

    renderParentHeader() {
        const parentRow = document.getElementById('parentHeader');
        const childRow = document.getElementById('childHeader');

        // fields.length columns + 1 calculated Quotation Date column
        const itemColCount = this.fields.length + 1;
        // stages + 1 actions column
        const supplyColCount = this.stages.length + 1;

        parentRow.innerHTML =
            `<th colspan="${itemColCount}" class="parent-header-cell">Item Details</th>` +
            `<th colspan="${supplyColCount}" class="parent-header-cell">Supply Chain</th>`;

        let childHtml = '';
        this.fields.forEach((field, index) => {
            const sticky = index === 0 ? 'sticky-col sticky-col-1' : index === 1 ? 'sticky-col sticky-col-2' : '';
            childHtml += `<th class="sortable child-th ${sticky}" onclick="app.sortByColumn('${field.id}')">${field.name}</th>`;
        });
        // Calculated column
        childHtml += `<th class="child-th">Quot. Date</th>`;

        this.stages.forEach(stage => {
            const sortKey = stage.type === 'text' ? stage.key : stage.key;
            childHtml += `<th class="sortable stage-header child-th" onclick="app.sortByStageKey('${sortKey}')">${stage.name}</th>`;
        });
        childHtml += `<th class="child-th">Actions</th>`;
        childRow.innerHTML = childHtml;

        requestAnimationFrame(() => {
            const parentHeight = parentRow.getBoundingClientRect().height;
            childRow.querySelectorAll('th').forEach(th => {
                th.style.top = parentHeight + 'px';
            });
        });
    },

    exportToExcel() {
        const data = this.items.map(item => {
            const row = {};
            this.fields.forEach(field => {
                row[field.name] = item[field.id] ?? '';
            });
            row['Quot. Date'] = this.calculateQuotationDate(item.po, item.wd);
            this.stages.forEach(stage => {
                row[stage.name] = item[stage.key] || '';
                if (stage.completedKey) {
                    row[stage.name + ' (Done)'] = item[stage.completedKey] ? 'Yes' : 'No';
                }
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
        reader.onload = async (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'binary' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(sheet);

                data.forEach(row => {
                    const item = {
                        id: String(Date.now() + Math.random()),
                        serialNumber: this.getNextSerial(),
                        createdAt: new Date().toISOString()
                    };
                    this.fields.forEach(field => {
                        if (field.type !== 'auto') {
                            item[field.id] = row[field.name] || '';
                        }
                    });
                    this.stages.forEach(stage => {
                        item[stage.key] = row[stage.name] || '';
                        if (stage.completedKey) {
                            item[stage.completedKey] = row[stage.name + ' (Done)'] === 'Yes';
                        }
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

    showMessage(text, type) {
        const msg = document.getElementById('message');
        msg.textContent = text;
        msg.className = `message ${type}`;
        setTimeout(() => { msg.className = 'message'; }, 3000);
    },

    async saveItems() {
        if (this.useApi) {
            try {
                await fetch('/api/items', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.items)
                });
                return;
            } catch (e) {
                console.warn('API save failed, using localStorage', e);
            }
        }
        localStorage.setItem('po_items_v2', JSON.stringify(this.items));
    },

    async loadItems() {
        if (window.location.protocol !== 'file:') {
            try {
                const res = await fetch('/api/items');
                if (res.ok) {
                    this.items = await res.json();
                    this.useApi = true;
                    return;
                }
            } catch (e) {
                console.warn('API not available, using localStorage', e);
            }
        }
        const data = localStorage.getItem('po_items_v2');
        this.items = data ? JSON.parse(data) : [];
    }
};

document.addEventListener('DOMContentLoaded', () => { app.init(); });
