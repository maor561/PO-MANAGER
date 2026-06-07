const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ── MongoDB ──────────────────────────────────────────────────────
let db = null;
let mongoClient = null;

async function connectMongo() {
    if (mongoClient) return db;
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI environment variable not set');
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    db = mongoClient.db('po_manager');
    console.log('✓ Connected to MongoDB');
    return db;
}

async function getCollection() {
    const database = await connectMongo();
    const col = database.collection('items');
    await col.createIndex({ id: 1 });
    return col;
}

async function getChangelog() {
    const database = await connectMongo();
    const col = database.collection('changelog');
    await col.createIndex({ timestamp: -1 });
    return col;
}

// ── Change logger ────────────────────────────────────────────────
const TRACKED_FIELDS = [
    { key: 'partNumber',     label: 'Part Number'  },
    { key: 'description',   label: 'Description'  },
    { key: 'revision',      label: 'Revision'      },
    { key: 'quantity',      label: 'Qty'           },
    { key: 'cost',          label: 'Cost'          },
    { key: 'currency',      label: 'Currency'      },
    { key: 'supplier',      label: 'Supplier'      },
    { key: 'project',       label: 'Project'       },
    { key: 'pd',            label: 'PR Date'       },
    { key: 'po',            label: 'PO Date'       },
    { key: 'poNumber',      label: 'PO#'           },
    { key: 'promiseDate',   label: 'Promise Date'  },
    { key: 'arrivalDate',   label: 'Arrival Date'  },
    { key: 'hslwhDate',     label: 'HSL WH Date'   },
    { key: 'eqDate',        label: 'EQ Date'       },
    { key: 'cocDate',       label: 'COC Date'      },
    { key: 'trackingNumber',label: 'Tracking#'     },
    { key: 'wd',            label: 'Working Days'  },
    { key: 'notes',         label: 'Notes'         },
];

async function logChange({ action, item, oldItem, user }) {
    try {
        const cl = await getChangelog();
        const entry = {
            timestamp:  new Date().toISOString(),
            user:       user || 'Unknown',
            action,                        // 'created' | 'updated' | 'deleted' | 'imported'
            itemId:     item?.id || '',
            partNumber: item?.partNumber || oldItem?.partNumber || '',
            project:    item?.project    || oldItem?.project    || '',
            changes:    [],
        };

        if (action === 'updated' && oldItem && item) {
            TRACKED_FIELDS.forEach(({ key, label }) => {
                const from = String(oldItem[key] ?? '');
                const to   = String(item[key]    ?? '');
                if (from !== to) {
                    entry.changes.push({ field: label, from, to });
                }
            });
            // Skip log if nothing actually changed
            if (entry.changes.length === 0) return;
        }

        await cl.insertOne(entry);
    } catch (e) {
        console.warn('Changelog write error:', e.message);
    }
}

// ── Items API ────────────────────────────────────────────────────
app.get('/api/items', async (req, res) => {
    try {
        const col = await getCollection();
        const items = await col.find({}).sort({ createdAt: 1 }).toArray();
        res.json(items.map(({ _id, ...item }) => item));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST — upsert single item (with optimistic locking)
app.post('/api/items', async (req, res) => {
    try {
        const item = req.body;
        if (!item || !item.id) return res.status(400).json({ error: 'Missing item id' });

        const col = await getCollection();
        const existing = await col.findOne({ id: item.id });

        // Optimistic locking
        if (item._clientUpdatedAt !== undefined && existing) {
            if (existing.updatedAt !== item._clientUpdatedAt) {
                return res.status(409).json({
                    error: 'conflict',
                    message: `This item was already modified by ${existing.lastModifiedBy || 'someone else'} at ${existing.updatedAt}. Reload to see the latest version.`,
                    serverItem: (({ _id, ...i }) => i)(existing),
                });
            }
        }
        delete item._clientUpdatedAt;
        item.updatedAt = new Date().toISOString();

        await col.updateOne({ id: item.id }, { $set: item }, { upsert: true });
        res.json(item);

        // Log change
        const action = existing ? 'updated' : 'created';
        await logChange({ action, item, oldItem: existing ? (({ _id, ...i }) => i)(existing) : null, user: item.lastModifiedBy });
    } catch (err) {
        console.error('POST /api/items error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT — bulk replace (import)
app.put('/api/items', async (req, res) => {
    try {
        const items = req.body;
        if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });

        const now = new Date().toISOString();
        const stamped = items.map(i => ({ ...i, updatedAt: now }));

        const col = await getCollection();
        await col.deleteMany({});
        if (stamped.length > 0) await col.insertMany(stamped);

        res.json({ success: true, count: stamped.length });

        await logChange({ action: 'imported', item: { id: 'bulk', partNumber: `${stamped.length} items` }, user: items[0]?.lastModifiedBy || 'Unknown' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE — single item
app.delete('/api/items', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Missing id' });

        const col = await getCollection();
        const existing = await col.findOne({ id });
        await col.deleteOne({ id });
        res.json({ success: true });

        await logChange({ action: 'deleted', item: existing ? (({ _id, ...i }) => i)(existing) : { id }, user: req.query.user || 'Unknown' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Changelog API ────────────────────────────────────────────────
app.get('/api/changelog', async (req, res) => {
    try {
        const cl = await getChangelog();
        const limit = parseInt(req.query.limit) || 500;
        const entries = await cl.find({}).sort({ timestamp: -1 }).limit(limit).toArray();
        res.json(entries.map(({ _id, ...e }) => e));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Exchange Rates proxy ─────────────────────────────────────────
app.get('/api/rates', (req, res) => {
    const https = require('https');
    https.get('https://api.frankfurter.app/latest?from=ILS&to=USD,EUR', (upstream) => {
        let raw = '';
        upstream.on('data', chunk => raw += chunk);
        upstream.on('end', () => {
            try {
                const data = JSON.parse(raw);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                res.json(data);
            } catch (e) {
                res.status(502).json({ error: 'parse error' });
            }
        });
    }).on('error', err => {
        res.status(502).json({ error: err.message });
    });
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
});
