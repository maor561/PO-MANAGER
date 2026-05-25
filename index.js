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
    const collection = database.collection('items');
    await collection.createIndex({ id: 1 });
    return collection;
}

// ── SSE broadcast ────────────────────────────────────────────────
const sseClients = new Set();

function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        try { client.write(msg); }
        catch (e) { sseClients.delete(client); }
    }
}

app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx compatibility
    res.flushHeaders();

    // Keep-alive ping every 25s to prevent proxy timeouts
    const ping = setInterval(() => {
        try { res.write(': ping\n\n'); }
        catch (e) { clearInterval(ping); }
    }, 25000);

    sseClients.add(res);
    console.log(`SSE client connected (${sseClients.size} total)`);

    req.on('close', () => {
        clearInterval(ping);
        sseClients.delete(res);
        console.log(`SSE client disconnected (${sseClients.size} total)`);
    });
});

// ── API Routes ───────────────────────────────────────────────────
app.get('/api/items', async (req, res) => {
    try {
        const collection = await getCollection();
        const items = await collection.find({}).sort({ createdAt: 1 }).toArray();
        res.json(items.map(({ _id, ...item }) => item));
    } catch (err) {
        console.error('GET /api/items error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST — create or update single item (with optimistic locking)
app.post('/api/items', async (req, res) => {
    try {
        const item = req.body;
        if (!item || !item.id) return res.status(400).json({ error: 'Missing item id' });

        const collection = await getCollection();

        // Optimistic locking: if client sent clientUpdatedAt, check it matches DB
        if (item._clientUpdatedAt !== undefined) {
            const existing = await collection.findOne({ id: item.id });
            if (existing && existing.updatedAt !== item._clientUpdatedAt) {
                return res.status(409).json({
                    error: 'conflict',
                    message: `This item was already modified by ${existing.lastModifiedBy || 'someone else'} at ${existing.updatedAt}. Reload to see the latest version.`,
                    serverItem: (({ _id, ...i }) => i)(existing)
                });
            }
            delete item._clientUpdatedAt;
        }

        // Stamp server-side timestamp
        item.updatedAt = new Date().toISOString();

        await collection.updateOne({ id: item.id }, { $set: item }, { upsert: true });
        res.json(item);

        // Broadcast to all other SSE clients
        broadcast('items-changed', { action: 'upsert', id: item.id, by: item.lastModifiedBy || '' });
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

        const collection = await getCollection();
        await collection.deleteMany({});
        if (stamped.length > 0) await collection.insertMany(stamped);

        res.json({ success: true, count: stamped.length });
        broadcast('items-changed', { action: 'bulk', count: stamped.length });
    } catch (err) {
        console.error('PUT /api/items error:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE — single item
app.delete('/api/items', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Missing id' });

        const collection = await getCollection();
        await collection.deleteOne({ id });
        res.json({ success: true });
        broadcast('items-changed', { action: 'delete', id });
    } catch (err) {
        console.error('DELETE /api/items error:', err);
        res.status(500).json({ error: err.message });
    }
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
});
