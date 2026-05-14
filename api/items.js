const { sql, ensureTable } = require('./db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        await ensureTable();

        if (req.method === 'GET') {
            const { rows } = await sql`SELECT data FROM po_items ORDER BY created_at ASC`;
            return res.json(rows.map(r => r.data));
        }

        if (req.method === 'POST') {
            const item = req.body;
            if (!item || !item.id) return res.status(400).json({ error: 'Missing item id' });
            await sql`INSERT INTO po_items (id, data) VALUES (${item.id}, ${JSON.stringify(item)}) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
            return res.json(item);
        }

        // PUT replaces the entire items array
        if (req.method === 'PUT') {
            const items = req.body;
            if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });

            // Rebuild table: delete all then insert
            await sql`DELETE FROM po_items`;
            for (const item of items) {
                await sql`INSERT INTO po_items (id, data) VALUES (${item.id}, ${JSON.stringify(item)})`;
            }
            return res.json({ success: true, count: items.length });
        }

        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Missing id' });
            await sql`DELETE FROM po_items WHERE id = ${id}`;
            return res.json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('API error:', err);
        return res.status(500).json({ error: err.message });
    }
};
