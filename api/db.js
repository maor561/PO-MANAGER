const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function connect() {
    if (client) return db;

    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI environment variable not set');

    client = new MongoClient(uri);
    await client.connect();
    db = client.db('po_manager');
    return db;
}

async function ensureCollection() {
    const database = await connect();
    const collection = database.collection('items');

    // Create index on id for faster lookups
    await collection.createIndex({ id: 1 });

    return collection;
}

module.exports = { connect, ensureCollection };
