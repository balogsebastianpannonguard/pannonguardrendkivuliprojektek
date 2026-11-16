import "server-only";
import type { Document, ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

/**
 * Minden könyvelő saját, elkülönített adatteret kap. A modulok adatai
 * mindig `ownerId`-vel kerülnek mentésre, és csak ezen a szűrőn át olvashatók,
 * így egy munkatárs sem látja a másik adatait.
 */
export type WorkspaceDocument = { _id: ObjectId; createdAt: Date };

/** A felhasználó adattere (a felhasználó azonosítójával); első belépéskor jön létre. */
export async function ensureWorkspace(userId: ObjectId) {
  const doc = await (await getDb())
    .collection<WorkspaceDocument>("workspaces")
    .findOneAndUpdate({ _id: userId }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true, returnDocument: "after" });
  return doc!;
}

/** Egy modul-gyűjtemény a saját adattérre szűkítve. Új modult csak ezen keresztül szabad bekötni. */
export async function ownedCollection<T extends Document>(name: string, ownerId: ObjectId) {
  const collection = (await getDb()).collection<T & { ownerId: ObjectId }>(name);
  const scope = { ownerId } as Partial<T & { ownerId: ObjectId }>;
  return {
    find: (filter: Document = {}) => collection.find({ ...filter, ...scope }),
    findOne: (filter: Document = {}) => collection.findOne({ ...filter, ...scope }),
    countDocuments: (filter: Document = {}) => collection.countDocuments({ ...filter, ...scope }),
    insertOne: (doc: T) => collection.insertOne({ ...doc, ownerId } as never),
    updateOne: (filter: Document, update: Document) => collection.updateOne({ ...filter, ...scope }, update),
    deleteOne: (filter: Document) => collection.deleteOne({ ...filter, ...scope }),
  };
}
