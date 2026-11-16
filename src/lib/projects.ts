import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { findUsersByIds, type UserKind } from "@/lib/users";
import type { CurrentUser } from "@/lib/session";

export * from "@/lib/project-meta";
import { type MemberRole, type ProjectStatus, type TaskPriority, type TaskStatus } from "@/lib/project-meta";

export type ProjectDocument = {
  _id: ObjectId;
  name: string;
  description: string;
  status: ProjectStatus;
  /** Opcionális cél- vagy határidő (ÉÉÉÉ-HH-NN). */
  dueDate?: string;
  /** Egy kis jelkép (emoji) a kártyára. */
  emoji: string;
  ownerId: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type MemberDocument = {
  _id: ObjectId;
  projectId: ObjectId;
  userId: ObjectId;
  role: MemberRole;
  addedBy: ObjectId;
  addedAt: Date;
};

export type TaskDocument = {
  _id: ObjectId;
  projectId: ObjectId;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: ObjectId;
  dueDate?: string;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  doneAt?: Date;
};

export type CommentDocument = {
  _id: ObjectId;
  projectId: ObjectId;
  taskId: ObjectId;
  authorId: ObjectId;
  text: string;
  createdAt: Date;
};

export type ActivityDocument = {
  _id: ObjectId;
  projectId: ObjectId;
  userId?: ObjectId;
  /** Ha a változtatást Pajzsi hajtotta végre a felhasználó jóváhagyásával. */
  viaPajzsi?: boolean;
  text: string;
  at: Date;
};

export type InviteDocument = {
  _id: ObjectId;
  projectId: ObjectId;
  email: string;
  role: MemberRole;
  invitedBy: ObjectId;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
};

const db = async () => getDb();
export const projectsCol = async () => (await db()).collection<ProjectDocument>("projects");
export const membersCol = async () => (await db()).collection<MemberDocument>("members");
export const tasksCol = async () => (await db()).collection<TaskDocument>("tasks");
export const commentsCol = async () => (await db()).collection<CommentDocument>("comments");
export const activityCol = async () => (await db()).collection<ActivityDocument>("activity");
export const invitesCol = async () => (await db()).collection<InviteDocument>("project_invites");

export async function ensureIndexes() {
  const database = await db();
  await Promise.all([
    database.collection("members").createIndex({ projectId: 1, userId: 1 }, { unique: true }),
    database.collection("members").createIndex({ userId: 1 }),
    database.collection("tasks").createIndex({ projectId: 1, status: 1 }),
    database.collection("tasks").createIndex({ assigneeId: 1 }),
    database.collection("comments").createIndex({ taskId: 1, createdAt: 1 }),
    database.collection("activity").createIndex({ projectId: 1, at: -1 }),
    database.collection("project_invites").createIndex({ tokenHash: 1 }),
    database.collection("project_invites").createIndex({ projectId: 1 }),
    database.collection("project_invites").createIndex({ email: 1 }),
  ]);
}

export function parseId(value: string) {
  return /^[0-9a-f]{24}$/i.test(value) ? new ObjectId(value) : null;
}

/* ---------- Jogosultság ---------- */

/** A jogosultság központi szabályai; minden oldal és szerverművelet ezen át dönt. */
export const can = {
  view: (role: MemberRole | null) => role !== null,
  /** Feladat létrehozása, szerkesztése, kommentelés. */
  contribute: (role: MemberRole | null) => role === "vezeto" || role === "tag",
  /** Projekt módosítása, tagok kezelése, meghívás, feladat törlése. */
  manage: (role: MemberRole | null) => role === "vezeto",
};

export type Access = { project: ProjectDocument; role: MemberRole };

/** A felhasználó szerepe a projektben. Az adminisztrátor minden projektben vezető. */
export async function projectAccess(user: Pick<CurrentUser, "oid" | "isAdmin">, projectId: string | ObjectId): Promise<Access | null> {
  const id = typeof projectId === "string" ? parseId(projectId) : projectId;
  if (!id) return null;
  const project = await (await projectsCol()).findOne({ _id: id });
  if (!project) return null;
  if (user.isAdmin) return { project, role: "vezeto" };
  const member = await (await membersCol()).findOne({ projectId: id, userId: user.oid });
  return member ? { project, role: member.role } : null;
}

export type ProjectSummary = {
  project: ProjectDocument;
  role: MemberRole;
  memberCount: number;
  total: number;
  done: number;
  overdue: number;
  mine: number;
};

/** Az `ÉÉÉÉ-HH-NN` mai napja budapesti idő szerint. */
export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(now);
}

export const isOverdue = (task: Pick<TaskDocument, "dueDate" | "status">, today = todayKey()) =>
  Boolean(task.dueDate && task.status !== "kesz" && task.dueDate < today);

/** A felhasználó számára látható projektek összesítővel. */
export async function listProjects(user: Pick<CurrentUser, "oid" | "isAdmin">): Promise<ProjectSummary[]> {
  const projects = await (await projectsCol()).find(
    user.isAdmin
      ? {}
      : { _id: { $in: (await (await membersCol()).find({ userId: user.oid }).toArray()).map((member) => member.projectId) } },
  ).sort({ updatedAt: -1 }).toArray();
  if (!projects.length) return [];

  const ids = projects.map((project) => project._id);
  const [members, tasks, myMembers] = await Promise.all([
    (await membersCol()).find({ projectId: { $in: ids } }, { projection: { projectId: 1 } }).toArray(),
    (await tasksCol()).find({ projectId: { $in: ids } }, { projection: { projectId: 1, status: 1, dueDate: 1, assigneeId: 1 } }).toArray(),
    (await membersCol()).find({ projectId: { $in: ids }, userId: user.oid }).toArray(),
  ]);
  const today = todayKey();
  const roleOf = new Map(myMembers.map((member) => [String(member.projectId), member.role]));

  return projects.map((project) => {
    const own = tasks.filter((task) => task.projectId.equals(project._id));
    return {
      project,
      role: user.isAdmin ? "vezeto" : (roleOf.get(String(project._id)) ?? "megtekinto"),
      memberCount: members.filter((member) => member.projectId.equals(project._id)).length,
      total: own.length,
      done: own.filter((task) => task.status === "kesz").length,
      overdue: own.filter((task) => isOverdue(task as TaskDocument, today)).length,
      mine: own.filter((task) => task.status !== "kesz" && task.assigneeId?.equals(user.oid)).length,
    };
  });
}

export type MemberView = { userId: string; name: string; email: string; role: MemberRole; kind: UserKind; isOwner: boolean };

export async function listMembers(project: ProjectDocument): Promise<MemberView[]> {
  const members = await (await membersCol()).find({ projectId: project._id }).sort({ addedAt: 1 }).toArray();
  const people = await findUsersByIds(members.map((member) => member.userId));
  const byId = new Map(people.map((person) => [String(person._id), person]));
  return members
    .map((member) => {
      const person = byId.get(String(member.userId));
      return person
        ? { userId: String(member.userId), name: person.name, email: person.email, role: member.role, kind: person.kind, isOwner: member.userId.equals(project.ownerId) }
        : null;
    })
    .filter((member): member is MemberView => member !== null);
}

/** Tevékenységnapló-bejegyzés; a naplózás hibája nem akaszthat meg semmit. */
export async function logActivity(projectId: ObjectId, userId: ObjectId | undefined, text: string, viaPajzsi = false) {
  try {
    await (await activityCol()).insertOne({ _id: new ObjectId(), projectId, userId, text: text.slice(0, 300), at: new Date(), ...(viaPajzsi && { viaPajzsi }) });
  } catch (error) {
    console.error("Tevékenységnapló hiba:", (error as Error).name);
  }
}

/** A projektben hozzárendelhető emberek (azonosító → név). */
export async function memberNames(projectId: ObjectId) {
  const members = await (await membersCol()).find({ projectId }, { projection: { userId: 1 } }).toArray();
  const people = await findUsersByIds(members.map((member) => member.userId));
  return new Map(people.map((person) => [String(person._id), person.name]));
}
