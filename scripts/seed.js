// Simulation: 100 diverse PO items
// Run: node scripts/seed.js

const API_URL = process.argv[2] || 'https://po-manager-iota.vercel.app';

const suppliers = ['Alpha Components', 'Beta Tech', 'Delta Systems', 'Omega Parts', 'Sigma Electronics'];
const projects  = ['Project Phoenix', 'Project Atlas', 'Project Nova', 'Project Titan'];
const partPrefixes = ['PCB', 'MTR', 'CAB', 'SEN', 'PSU', 'CON', 'FAN', 'MEM', 'CPU', 'PWR'];
const revisions = ['A', 'B', 'C', 'D', '-'];

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function isoDate(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
}

function makeId() {
    return Date.now().toString() + Math.random().toString(36).slice(2, 8);
}

const items = [];

for (let i = 1; i <= 100; i++) {
    const supplier = rnd(suppliers);
    const project  = rnd(projects);
    const partNum  = `${rnd(partPrefixes)}-${rndInt(1000,9999)}`;
    const qty      = rndInt(1, 200);
    const wd       = rndInt(10, 90);

    // PR date: 2-8 months ago
    const pdOffset   = -rndInt(60, 240);
    const pd         = isoDate(pdOffset);

    // PO date: a few days after PR
    const poOffset   = pdOffset + rndInt(1, 10);
    const po         = isoDate(poOffset);
    const poNumber   = `PO-2025-${String(i).padStart(4,'0')}`;

    // Determine scenario
    const scenario = rndInt(1, 7);

    let promiseDate = null, promiseDateHistory = [];
    let trackingNumber = null, arrivalDate = null, hslwhDate = null;
    let arrivalCompleted = false, hslwhCompleted = false;

    // Promise date: 2-6 weeks after PO
    const initialPromise = isoDate(poOffset + rndInt(14, 42));

    if (scenario === 1) {
        // ✅ Completed on time
        promiseDate = initialPromise;
        trackingNumber = `TRK-${rndInt(100000,999999)}`;
        arrivalDate = isoDate(poOffset + rndInt(20, 35));
        hslwhDate = arrivalDate;
        arrivalCompleted = hslwhCompleted = true;

    } else if (scenario === 2) {
        // ✅ Completed but late (arrived after promise)
        const originalPromise = isoDate(poOffset + rndInt(14, 25));
        const actualArrival   = isoDate(poOffset + rndInt(30, 55));
        promiseDateHistory = [{ date: originalPromise, changedAt: new Date(addDays(po, rndInt(5,15))).toISOString() }];
        promiseDate = actualArrival;
        trackingNumber = `TRK-${rndInt(100000,999999)}`;
        arrivalDate = isoDate(poOffset + rndInt(35, 60));
        hslwhDate = arrivalDate;
        arrivalCompleted = hslwhCompleted = true;

    } else if (scenario === 3) {
        // ⚠️ Delayed - arrival passed, not received
        promiseDate = isoDate(poOffset + rndInt(14, 25));
        trackingNumber = `TRK-${rndInt(100000,999999)}`;
        arrivalDate = isoDate(poOffset + rndInt(20, 30)); // in the past
        arrivalCompleted = false;

    } else if (scenario === 4) {
        // 📅 Date changed multiple times
        const p1 = isoDate(poOffset + rndInt(14, 20));
        const p2 = isoDate(poOffset + rndInt(21, 30));
        promiseDateHistory = [
            { date: p1, changedAt: new Date(addDays(po, rndInt(3, 8))).toISOString() },
            { date: p2, changedAt: new Date(addDays(po, rndInt(9, 15))).toISOString() },
        ];
        promiseDate = isoDate(poOffset + rndInt(31, 45));

    } else if (scenario === 5) {
        // 🟡 Due soon (arriving in 1-7 days)
        promiseDate = isoDate(rndInt(1, 7));
        trackingNumber = `TRK-${rndInt(100000,999999)}`;
        arrivalDate = isoDate(rndInt(1, 6));

    } else if (scenario === 6) {
        // 🔵 In progress - early stage
        promiseDate = isoDate(rndInt(10, 40));

    } else {
        // 🔵 In progress - no action yet
        promiseDate = isoDate(rndInt(15, 60));
    }

    items.push({
        id:               makeId(),
        serialNumber:     i,
        partNumber:       partNum,
        revision:         rnd(revisions),
        quantity:         qty,
        project,
        pd,
        supplier,
        wd:               String(wd),
        notes:            rndInt(1,4) === 1 ? `Note for item #${i} - requires special handling` : '',
        poNumber,
        po,
        promiseDate,
        promiseDateHistory,
        trackingNumber,
        arrivalDate,      arrivalCompleted,
        hslwhDate,        hslwhCompleted,
        createdAt:        new Date(addDays(pd, 1)).toISOString(),
    });
}

// Summary
const completed = items.filter(i => i.hslwhDate).length;
const delayed   = items.filter(i => !i.hslwhDate && i.arrivalDate && new Date(i.arrivalDate) < new Date()).length;
const dueSoon   = items.filter(i => !i.hslwhDate && i.arrivalDate && (() => { const d = (new Date(i.arrivalDate) - new Date()) / 86400000; return d >= 0 && d <= 7; })()).length;
const changed   = items.filter(i => i.promiseDateHistory && i.promiseDateHistory.length > 0).length;

console.log(`\n📦 Simulation Summary:`);
console.log(`  Total:     ${items.length}`);
console.log(`  ✅ Completed:  ${completed}`);
console.log(`  ⚠️  Delayed:    ${delayed}`);
console.log(`  🟡 Due Soon:   ${dueSoon}`);
console.log(`  📅 Date Changed: ${changed}`);
console.log(`  🔵 In Progress: ${items.length - completed - delayed - dueSoon}`);
console.log(`\n⬆️  Sending to ${API_URL}/api/items ...`);

fetch(`${API_URL}/api/items`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(items)
})
.then(r => r.json())
.then(d => console.log(`✅ Done! ${d.count} items saved to MongoDB.\n`))
.catch(e => console.error('❌ Error:', e.message));
