const { sql } = require('@vercel/postgres');

async function ensureTable() {
    await sql`
        CREATE TABLE IF NOT EXISTS po_items (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;
}

module.exports = { sql, ensureTable };
