const { ensureCollection } = require('./db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const collection = await ensureCollection();

        if (req.method === 'GET') {
            const items = await collection.find({}).sort({ createdAt: 1 }).toArray();
            return res.json(items.map(doc => {
                const { _id, ...item } = doc;
                return item;
            }));
        }

        if (req.method === 'POST') {
            const item = req.body;
            if (!item || !item.id) return res.status(400).json({ error: 'Missing item id' });

            await collection.updateOne(
                { id: item.id },
                { $set: item },
                { upsert: true }
            );
            return res.json(item);
        }

        // PUT replaces the entire items array
        if (req.method === 'PUT') {
            const items = req.body;
            if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });

            // Clear and rebuild collection
            await collection.deleteMany({});
            if (items.length > 0) {
                await collection.insertMany(items);
            }
            return res.json({ success: true, count: items.length });
        }

        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Missing id' });
            await collection.deleteOne({ id });
            return res.json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('API error:', err);
        return res.status(500).json({ error: err.message });
    }
};
