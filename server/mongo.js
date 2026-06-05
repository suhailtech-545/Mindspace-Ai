import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || "mindspace_ai";

let client;
let db;

export async function getDb() {
  if (!MONGODB_URI) return null;
  if (db) return db;

  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);

  await db.collection("mood_assessments").createIndex({ createdAt: -1 });
  await db.collection("chat_messages").createIndex({ createdAt: -1 });
  await db.collection("chat_messages").createIndex({ chatId: 1 });

  console.log(`✅ MongoDB connected: ${DB_NAME}`);
  return db;
}

export async function saveMoodAssessment(payload) {
  const database = await getDb();
  if (!database) return { skipped: true, reason: "MONGODB_URI belum diisi" };

  const doc = {
    ...payload,
    createdAt: new Date(),
  };
  const result = await database.collection("mood_assessments").insertOne(doc);
  return { insertedId: result.insertedId };
}

export async function saveChatMessage(payload) {
  const database = await getDb();
  if (!database) return { skipped: true, reason: "MONGODB_URI belum diisi" };

  const doc = {
    ...payload,
    createdAt: new Date(),
  };
  const result = await database.collection("chat_messages").insertOne(doc);
  return { insertedId: result.insertedId };
}

export async function getRecentMoodStats(limit = 100) {
  const database = await getDb();
  if (!database) return null;

  const assessments = await database
    .collection("mood_assessments")
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  const labelCounts = assessments.reduce((acc, item) => {
    const label = item.label || item.classifier?.label || "UNKNOWN";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  return {
    total: assessments.length,
    labelCounts,
    latest: assessments.slice(0, 10),
  };
}
