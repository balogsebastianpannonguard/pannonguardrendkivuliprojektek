import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";

/**
 * - `admin`: az Elosztóból meghívott projektadminisztrátor; projekteket hozhat létre, mindet látja és kezeli.
 * - `tag`: egy projektmeghívóval érkezett közreműködő; csak azokat a projekteket látja, amelyekbe meghívták.
 */
export type UserKind = "admin" | "tag";

export type UserDocument = {
  _id: ObjectId;
  email: string;
  name: string;
  kind: UserKind;
  passwordHash: string;
  /** Csak az adminnál: az Elosztó meghívója (a hozzáférés visszavonását onnan olvassuk). */
  invitationId?: ObjectId;
  invitedBy: string;
  createdAt: Date;
  lastLoginAt?: Date;
  /** A projektadmin által letiltott tag. */
  disabledAt?: Date;
  /** Helyi jelszó-visszaállító link (tagoknak); csak a hash-e tárolt. */
  resetTokenHash?: string;
  resetExpiresAt?: Date;
};

export const users = async () => (await getDb()).collection<UserDocument>("users");

export async function findUserById(id: ObjectId) {
  return (await users()).findOne({ _id: id });
}

export async function findUserByEmail(email: string) {
  return (await users()).findOne({ email: email.toLowerCase() });
}

export async function findUsersByIds(ids: ObjectId[]) {
  if (!ids.length) return [];
  return (await users()).find({ _id: { $in: ids } }, { projection: { name: 1, email: 1, kind: 1 } }).toArray();
}
