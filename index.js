const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// MongoDB connection
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

// API Routes
app.get('/api/items', async (req, res) => {
    try {
        const collection = await getCollection();
        const items = await collection.find({}).sort({ createdAt: 1 }).toArray();
        res.json(items.map(doc => {
            const { _id, ...item } = doc;
            return item;
        }));
    } catch (err) {
        console.error('GET /api/items error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/items', async (req, res) => {
    try {
        const item = req.body;
        if (!item || !item.id) {
            return res.status(400).json({ error: 'Missing item id' });
        }

        const collection = await getCollection();
        await collection.updateOne(
            { id: item.id },
            { $set: item },
            { upsert: true }
        );
        res.json(item);
    } catch (err) {
        console.error('POST /api/items error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/items', async (req, res) => {
    try {
        const items = req.body;
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Expected array' });
        }

        const collection = await getCollection();
        await collection.deleteMany({});
        if (items.length > 0) {
            await collection.insertMany(items);
        }
        res.json({ success: true, count: items.length });
    } catch (err) {
        console.error('PUT /api/items error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/items', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({ error: 'Missing id' });
        }

        const collection = await getCollection();
        await collection.deleteOne({ id });
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/items error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
});
