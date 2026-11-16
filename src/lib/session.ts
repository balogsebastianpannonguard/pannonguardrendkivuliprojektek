import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAccessState } from "@/lib/invitations";
import { adminAllowed, isPortal } from "@/lib/mode";
import { getDb } from "@/lib/mongodb";
import { findUserById, type UserKind } from "@/lib/users";

const production = process.env.NODE_ENV === "production";

export const SESSION_COOKIE = production ? "__Host-pg_rendkivuli_session" : "pg_rendkivuli_session";

/** Ez az alrendszer nem kér második faktort: a jelszavas belépés teljes értékű munkamenetet ad. */
const TTL_MS = 12 * 60 * 60 * 1000;
const IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

type SessionDocument = {
  _id: string;
  userId: ObjectId;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

export type Session = { id: string; userId: ObjectId };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const sessions = async () => (await getDb()).collection<SessionDocument>("sessions");

export async function createSession(userId: ObjectId) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const store = await cookies();

  // Az előző munkamenet ezen a böngészőn megszűnik.
  const previous = store.get(SESSION_COOKIE)?.value;
  if (previous) await (await sessions()).deleteOne({ _id: hashToken(previous) });

  await (await sessions()).insertOne({
    _id: hashToken(token),
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + TTL_MS),
  });

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: production,
    // Lax, hogy a levelekből érkező meghívó-linkek is belépett állapotban nyíljanak meg.
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  });
}

export async function validateSessionToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  const collection = await sessions();
  const id = hashToken(token);
  const session = await collection.findOne({ _id: id });
  const now = Date.now();
  if (!session || session.expiresAt.getTime() <= now) return null;

  const idleFor = now - session.lastSeenAt.getTime();
  if (idleFor > IDLE_TTL_MS) {
    await collection.deleteOne({ _id: id });
    return null;
  }
  if (idleFor > TOUCH_INTERVAL_MS) {
    await collection.updateOne({ _id: id }, { $set: { lastSeenAt: new Date(now) } });
  }
  return { id, userId: session.userId };
}

export async function getSession() {
  // A lejárat ellenőrzése időfüggő, ezért csak kérésidőben futhat.
  await connection();
  return validateSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export type CurrentUser = {
  id: string;
  oid: ObjectId;
  email: string;
  name: string;
  firstName: string;
  kind: UserKind;
  isAdmin: boolean;
  invitedBy: string;
  lastLoginAt?: Date;
  createdAt: Date;
};

/** A védett oldalak és műveletek belépési pontja: élő munkamenetet és élő hozzáférést követel. */
export async function requireUser(): Promise<CurrentUser & { session: Session }> {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await findUserById(session.userId);
  // Az admin felületre csak a jogosult admin, a portálra csak a meghívott tagok léphetnek be.
  const wrongPlace = user ? (isPortal ? user.kind !== "tag" : user.kind !== "admin" || !adminAllowed(user.email)) : false;
  let revoked = !user || Boolean(user.disabledAt) || wrongPlace;
  if (user && user.kind === "admin" && user.invitationId) {
    revoked = revoked || (await getAccessState(user.invitationId)).revoked;
  }
  if (!user || revoked) {
    await (await sessions()).deleteOne({ _id: session.id });
    redirect("/login?ok=visszavonva");
  }
  return {
    session,
    id: String(user._id),
    oid: user._id,
    email: user.email,
    name: user.name,
    // Magyar névsorrend: a vezetéknév után az első keresztnév.
    firstName: user.name.trim().split(/\s+/)[1] ?? user.name,
    kind: user.kind,
    isAdmin: user.kind === "admin",
    invitedBy: user.invitedBy,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await (await sessions()).deleteOne({ _id: hashToken(token) });
  store.delete({ name: SESSION_COOKIE, path: "/", secure: production });
}

export async function destroyAllSessions(userId: ObjectId) {
  await (await sessions()).deleteMany({ userId });
}

export async function countActiveSessions(userId: ObjectId) {
  return (await sessions()).countDocuments({
    userId,
    expiresAt: { $gt: new Date() },
    lastSeenAt: { $gt: new Date(Date.now() - IDLE_TTL_MS) },
  });
}

export function toObjectId(id: string) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}
