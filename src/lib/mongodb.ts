import "server-only";
import { MongoClient } from "mongodb";

// A globális tárolás megakadályozza, hogy a dev szerver minden frissítésnél új kapcsolatot nyisson.
const store = globalThis as typeof globalThis & {
  pannonRendkivuliMongo?: Promise<MongoClient>;
};

function isConfigured(uri?: string): uri is string {
  return Boolean(uri) && !uri?.includes("<db_");
}

async function connect(uri: string) {
  const client = await new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 20,
    maxIdleTimeMS: 60_000,
    tls: true,
  }).connect();

  const db = client.db(process.env.MONGODB_DB);
  // Az indexek létrehozása nem tartja fel a kéréseket (hidegindításnál ez sok időt vinne el); hibája nem végzetes.
  void Promise.all([
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("sessions").createIndex({ userId: 1 }),
    db.collection("login_throttle").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("audit_log").createIndex({ userId: 1, at: -1 }),
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("members").createIndex({ projectId: 1, userId: 1 }, { unique: true }),
    db.collection("members").createIndex({ userId: 1 }),
    db.collection("tasks").createIndex({ projectId: 1, status: 1 }),
    db.collection("tasks").createIndex({ assigneeId: 1 }),
    db.collection("comments").createIndex({ taskId: 1, createdAt: 1 }),
    db.collection("activity").createIndex({ projectId: 1, at: -1 }),
    db.collection("project_invites").createIndex({ tokenHash: 1 }),
    db.collection("project_invites").createIndex({ projectId: 1 }),
    db.collection("project_invites").createIndex({ email: 1 }),
  ]).catch((error) => console.error("Indexek:", (error as Error).name));
  return client;
}

function getClient() {
  const uri = process.env.MONGODB_URI;
  if (!isConfigured(uri)) {
    throw new Error("A MONGODB_URI nincs kitöltve.");
  }

  store.pannonRendkivuliMongo ??= connect(uri).catch((error) => {
    store.pannonRendkivuliMongo = undefined;
    throw error;
  });
  return store.pannonRendkivuliMongo;
}

/** Az alrendszer saját adatbázisa. */
export async function getDb() {
  return (await getClient()).db(process.env.MONGODB_DB);
}

/** Az elosztó adatbázisa, ahol a meghívók vannak. */
export async function getInvitesDb() {
  const name = process.env.INVITES_DB;
  if (!name) throw new Error("Az INVITES_DB nincs kitöltve.");
  return (await getClient()).db(name);
}
