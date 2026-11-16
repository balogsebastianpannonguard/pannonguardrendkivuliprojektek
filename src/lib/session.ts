import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAccessState } from "@/lib/invitations";
import { adminAllowed, isPortal } from "@/lib/mode";
import { getDb } from "@/lib/mongodb";
import { type UserDocument, type UserKind } from "@/lib/users";

import { SESSION_COOKIE } from "@/lib/session-cookie";

const production = process.env.NODE_ENV === "production";

export { SESSION_COOKIE };

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

/** A munkamenet és a felhasználó egyetlen adatbázis-kérésben (a `users` összekapcsolásával). */
async function sessionWithUser(token?: string) {
  if (!token) return null;
  const id = hashToken(token);
  const [row] = await (await sessions())
    .aggregate<SessionDocument & { user?: UserDocument }>([
      { $match: { _id: id } },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
      { $set: { user: { $first: "$user" } } },
    ])
    .toArray();
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  const idleFor = Date.now() - row.lastSeenAt.getTime();
  if (idleFor > IDLE_TTL_MS) {
    await (await sessions()).deleteOne({ _id: id });
    return null;
  }
  if (idleFor > TOUCH_INTERVAL_MS) {
    // A „látta” időbélyeg frissítése nem tartja fel a választ.
    void (await sessions()).updateOne({ _id: id }, { $set: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return { id, userId: row.userId, user: row.user };
}

/** Az Elosztó hozzáférés-állapotát rövid ideig megjegyezzük, hogy ne minden kérés kérdezze le (a visszavonás legfeljebb fél percet késik). */
const accessCache = new Map<string, { revoked: boolean; until: number }>();
async function adminRevoked(invitationId: ObjectId) {
  const key = String(invitationId);
  const hit = accessCache.get(key);
  if (hit && hit.until > Date.now()) return hit.revoked;
  const { revoked } = await getAccessState(invitationId);
  accessCache.set(key, { revoked, until: Date.now() + 30_000 });
  return revoked;
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

/**
 * A védett oldalak és műveletek belépési pontja: élő munkamenetet és élő hozzáférést követel.
 * Kérésenként egyszer fut le (React `cache`), így az elrendezés és az oldal komponensei ugyanazt az eredményt kapják.
 */
export const requireUser = cache(async (): Promise<CurrentUser & { session: Session }> => {
  await connection();
  const found = await sessionWithUser((await cookies()).get(SESSION_COOKIE)?.value);
  if (!found || !found.user) redirect("/login");
  const user = found.user;
  // Az admin felületre csak a jogosult admin, a portálra csak a meghívott tagok léphetnek be.
  const wrongPlace = isPortal ? user.kind !== "tag" : user.kind !== "admin" || !adminAllowed(user.email);
  let revoked = Boolean(user.disabledAt) || wrongPlace;
  if (!revoked && user.kind === "admin" && user.invitationId) revoked = await adminRevoked(user.invitationId);
  if (revoked) {
    await (await sessions()).deleteOne({ _id: found.id });
    redirect("/login?ok=visszavonva");
  }
  return {
    session: { id: found.id, userId: found.userId },
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
});

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
