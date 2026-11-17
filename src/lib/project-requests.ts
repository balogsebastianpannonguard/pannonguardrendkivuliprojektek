import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { RequestStatus } from "@/lib/project-meta";

/**
 * Projektindítási kérvény: a nem admin felhasználó kéri, hogy az adminisztrátor indítson neki projektet.
 * Jóváhagyáskor a kérelmező lesz a projekt vezetője (felettese), és ő hívhat meg másokat.
 */
export type ProjectRequestDocument = {
  _id: ObjectId;
  requesterId: ObjectId;
  name: string;
  description: string;
  emoji: string;
  dueDate?: string;
  status: RequestStatus;
  createdAt: Date;
  decidedAt?: Date;
  decidedBy?: ObjectId;
  decisionNote?: string;
  /** Jóváhagyás után a létrejött projekt. */
  projectId?: ObjectId;
};

/** Egy felhasználónak egyszerre legfeljebb ennyi elbírálatlan kérvénye lehet. */
export const MAX_PENDING_REQUESTS = 5;

export const requestsCol = async () => (await getDb()).collection<ProjectRequestDocument>("project_requests");

export async function ensureRequestIndexes() {
  const collection = await requestsCol();
  await Promise.all([collection.createIndex({ status: 1, createdAt: -1 }), collection.createIndex({ requesterId: 1, createdAt: -1 })]);
}

export async function countPendingRequests() {
  return (await requestsCol()).countDocuments({ status: "fuggo" });
}
