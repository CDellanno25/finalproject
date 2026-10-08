require("dotenv").config();

const { MongoClient } = require("mongodb");

async function setupDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error("Add MONGODB_URI to your .env file.");
  }

  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();

    const db = client.db(
      process.env.MONGODB_DB || "shopping_runs"
    );

    const collectionNames = [
      "users",
      "stores",
      "events",
      "event_shoppers",
      "orders",
      "items",
    ];

    const existing = new Set(
      (await db.listCollections().toArray()).map(
        collection => collection.name
      )
    );

    for (const name of collectionNames) {
      if (!existing.has(name)) {
        await db.createCollection(name);
      }
    }

    // Prevent duplicate Google accounts.
    await db.collection("users").createIndex(
      { google_sub: 1 },
      { unique: true }
    );

    // A shopper can only be assigned once per event.
    await db.collection("event_shoppers").createIndex(
      { event_id: 1, user_id: 1 },
      { unique: true }
    );

    // Each buyer gets one order per event.
    await db.collection("orders").createIndex(
      { event_id: 1, buyer_id: 1 },
      { unique: true }
    );

    await db.collection("items").createIndex({ order_id: 1 });
    await db.collection("events").createIndex({ open_at: -1 });

    console.log(`Database ready: ${db.databaseName}`);
  } finally {
    await client.close();
  }
}

setupDatabase().catch(error => {
  console.error("Database setup failed:", error.message);
  process.exitCode = 1;
});