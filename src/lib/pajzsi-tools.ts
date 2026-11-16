import "server-only";
import { randomUUID } from "node:crypto";
import type { ObjectId } from "mongodb";
import { formatShortDate } from "@/lib/dates";
import type { AgentTool } from "@/lib/gemini-agent";
import {
  MEMBER_ROLES,
  PROJECT_STATUS,
  TASK_PRIORITY,
  TASK_STATUS,
  can,
  commentsCol,
  isOverdue,
  listMembers,
  listProjects,
  parseId,
  projectAccess,
  tasksCol,
  todayKey,
  type MemberRole,
  type ProjectSummary,
  type TaskDocument,
} from "@/lib/projects";
import type { CurrentUser } from "@/lib/session";
import { addDays } from "@/lib/dates";

export type ProposalKind = "create_task" | "update_task" | "comment" | "invite";
export type Proposal = { id: string; kind: ProposalKind; label: string; args: Record<string, unknown> };

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const str = (value: unknown, max = 500) => (typeof value === "string" ? value.slice(0, max) : undefined);

const STATUS_KEYS = Object.keys(TASK_STATUS);
const PRIORITY_KEYS = Object.keys(TASK_PRIORITY);
const ROLE_KEYS = Object.keys(MEMBER_ROLES);

export const PAJZSI_TOOLS: AgentTool[] = [
  {
    name: "list_projects",
    description: "A felhasználó projektjei összesítővel (állapot, szerep, feladatszámok, késő feladatok). Mindig ezzel kezdd, ha nem tudod a projekt azonosítóját.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "project_overview",
    description: "Egy projekt részletes állapota: tagok és szerepek, feladatok állapot szerint, késő és közelgő határidők, felelős nélküli feladatok, terhelés tagonként.",
    parameters: { type: "OBJECT", properties: { project: { type: "STRING", description: "A projekt neve vagy azonosítója." } }, required: ["project"] },
  },
  {
    name: "list_tasks",
    description: "Feladatok keresése és szűrése. Mind szűrő nem kötelező. Legfeljebb 25 találatot ad.",
    parameters: {
      type: "OBJECT",
      properties: {
        project: { type: "STRING", description: "Projekt neve vagy azonosítója; ha hiányzik, az összes projektben keres." },
        assignee: { type: "STRING", description: "Felelős neve, vagy „én” a felhasználóra." },
        status: { type: "STRING", enum: STATUS_KEYS },
        overdue_only: { type: "BOOLEAN" },
        due_within_days: { type: "INTEGER", description: "Ennyi napon belül esedékes (a ma is beleszámít)." },
        include_done: { type: "BOOLEAN", description: "Alapból a kész feladatok kimaradnak." },
        query: { type: "STRING", description: "Szöveg a címben vagy a leírásban." },
      },
    },
  },
  {
    name: "get_task",
    description: "Egy feladat teljes adata leírással és a legutóbbi megjegyzésekkel.",
    parameters: { type: "OBJECT", properties: { task_id: { type: "STRING" } }, required: ["task_id"] },
  },
  {
    name: "workload",
    description: "Ki mennyi nyitott és késő feladattal rendelkezik, projektenként vagy az összes projektben.",
    parameters: { type: "OBJECT", properties: { project: { type: "STRING", description: "Nem kötelező; a projekt neve vagy azonosítója." } } },
  },
  {
    name: "propose_create_task",
    description:
      "Új feladat felvételének JAVASLATA. Nem hajtódik végre azonnal: a felhasználó jóváhagyása kell hozzá. Több feladat esetén hívd többször. A határidő ÉÉÉÉ-HH-NN.",
    parameters: {
      type: "OBJECT",
      properties: {
        project: { type: "STRING" },
        title: { type: "STRING" },
        description: { type: "STRING" },
        assignee: { type: "STRING", description: "Név vagy „én”; csak a projekt tagja lehet." },
        due_date: { type: "STRING" },
        priority: { type: "STRING", enum: PRIORITY_KEYS },
        status: { type: "STRING", enum: STATUS_KEYS },
      },
      required: ["project", "title"],
    },
  },
  {
    name: "propose_update_task",
    description: "Meglévő feladat módosításának JAVASLATA (állapot, felelős, határidő, prioritás, cím). Jóváhagyás kell hozzá. A felelős null-lal törölhető (assignee: \"nincs\").",
    parameters: {
      type: "OBJECT",
      properties: {
        task_id: { type: "STRING" },
        status: { type: "STRING", enum: STATUS_KEYS },
        assignee: { type: "STRING" },
        due_date: { type: "STRING", description: "ÉÉÉÉ-HH-NN, vagy „nincs” a törléshez." },
        priority: { type: "STRING", enum: PRIORITY_KEYS },
        title: { type: "STRING" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "propose_comment",
    description: "Megjegyzés hozzáadásának JAVASLATA egy feladathoz. Jóváhagyás kell hozzá.",
    parameters: { type: "OBJECT", properties: { task_id: { type: "STRING" }, text: { type: "STRING" } }, required: ["task_id", "text"] },
  },
  {
    name: "propose_invite",
    description: "Egy ember meghívásának JAVASLATA egy projektbe (csak projektvezető vagy admin). Jóváhagyás kell hozzá.",
    parameters: {
      type: "OBJECT",
      properties: { project: { type: "STRING" }, email: { type: "STRING" }, role: { type: "STRING", enum: ROLE_KEYS }, note: { type: "STRING" } },
      required: ["project", "email"],
    },
  },
];

/** A felhasználóhoz kötött eszköztár: minden olvasás és javaslat a felhasználó saját jogosultságán belül marad. */
export function createToolbox(user: CurrentUser) {
  const proposals: Proposal[] = [];
  let cache: ProjectSummary[] | undefined;
  const projects = async () => (cache ??= await listProjects(user));

  async function findProject(ref: unknown): Promise<{ summary: ProjectSummary } | { error: string }> {
    const list = await projects();
    const text = str(ref, 120)?.trim();
    if (!text) {
      return list.length === 1 ? { summary: list[0] } : { error: "Add meg, melyik projektről van szó (név vagy azonosító)." };
    }
    const byId = list.find((item) => String(item.project._id) === text);
    if (byId) return { summary: byId };
    const wanted = norm(text);
    const exact = list.filter((item) => norm(item.project.name) === wanted);
    const partial = exact.length ? exact : list.filter((item) => norm(item.project.name).includes(wanted) || wanted.includes(norm(item.project.name)));
    if (partial.length === 1) return { summary: partial[0] };
    if (partial.length > 1) return { error: `Több projekt is egyezik: ${partial.map((item) => item.project.name).join(", ")}. Kérdezz rá pontosabban.` };
    return { error: `Nem találok ilyen projektet: ${text}. Elérhető: ${list.map((item) => item.project.name).join(", ") || "(nincs)"}.` };
  }

  async function findPerson(projectId: ObjectId, ref: unknown): Promise<{ id: string; name: string } | null | "none" | { error: string }> {
    const text = str(ref, 120)?.trim();
    if (!text) return null;
    if (["nincs", "senki", "none"].includes(norm(text))) return "none";
    const access = await projectAccess(user, projectId);
    if (!access) return { error: "Nincs hozzáférésed a projekthez." };
    const members = (await listMembers(access.project)).filter((member) => member.role !== "megtekinto");
    if (["en", "magam", "me", "engem"].includes(norm(text))) {
      const me = members.find((member) => member.userId === user.id);
      return me ? { id: me.userId, name: me.name } : { error: "Te nem vagy feladat-felelős lehetséges tagja ennek a projektnek." };
    }
    const wanted = norm(text);
    const hits = members.filter((member) => norm(member.name).includes(wanted) || norm(member.email) === wanted);
    if (hits.length === 1) return { id: hits[0].userId, name: hits[0].name };
    if (hits.length > 1) return { error: `Több tag is egyezik: ${hits.map((hit) => hit.name).join(", ")}.` };
    return { error: `Nincs ilyen tag a projektben: ${text}. Tagok: ${members.map((member) => member.name).join(", ")}.` };
  }

  const taskRow = (task: TaskDocument, projectName: string, names: Map<string, string>) => ({
    id: String(task._id),
    projekt: projectName,
    cim: task.title,
    allapot: TASK_STATUS[task.status].label,
    prioritas: TASK_PRIORITY[task.priority].label,
    felelos: task.assigneeId ? (names.get(String(task.assigneeId)) ?? "?") : "nincs",
    hatarido: task.dueDate ?? null,
    keso: isOverdue(task),
  });

  async function namesFor(projectIds: ObjectId[]) {
    const names = new Map<string, string>();
    for (const id of projectIds) {
      const access = await projectAccess(user, id);
      if (!access) continue;
      for (const member of await listMembers(access.project)) names.set(member.userId, member.name);
    }
    return names;
  }

  async function run(name: string, args: Record<string, unknown>): Promise<unknown> {
    const today = todayKey();

    if (name === "list_projects") {
      return (await projects()).map(({ project, role, memberCount, total, done, overdue, mine }) => ({
        id: String(project._id),
        nev: project.name,
        allapot: PROJECT_STATUS[project.status].label,
        szerepem: MEMBER_ROLES[role].label,
        hatarido: project.dueDate ?? null,
        tagok: memberCount,
        feladat_osszesen: total,
        kesz: done,
        keso: overdue,
        nekem_nyitott: mine,
      }));
    }

    if (name === "project_overview") {
      const found = await findProject(args.project);
      if ("error" in found) return found;
      const { project } = found.summary;
      const [members, tasks] = await Promise.all([listMembers(project), (await tasksCol()).find({ projectId: project._id }).toArray()]);
      const names = new Map(members.map((member) => [member.userId, member.name]));
      const open = tasks.filter((task) => task.status !== "kesz");
      const soon = open.filter((task) => task.dueDate && task.dueDate >= today && task.dueDate <= addDays(today, 7));
      return {
        id: String(project._id),
        nev: project.name,
        leiras: project.description.slice(0, 600),
        allapot: PROJECT_STATUS[project.status].label,
        hatarido: project.dueDate ?? null,
        tagok: members.map((member) => ({ id: member.userId, nev: member.name, szerep: MEMBER_ROLES[member.role].label })),
        feladatok_allapot_szerint: Object.fromEntries(Object.entries(TASK_STATUS).map(([key, { label }]) => [label, tasks.filter((task) => task.status === key).length])),
        keso: open.filter((task) => isOverdue(task, today)).slice(0, 10).map((task) => taskRow(task, project.name, names)),
        kozelgo_7_napon_belul: soon.slice(0, 10).map((task) => taskRow(task, project.name, names)),
        felelos_nelkul: open.filter((task) => !task.assigneeId).length,
        terheles: members.map((member) => ({
          nev: member.name,
          nyitott: open.filter((task) => String(task.assigneeId) === member.userId).length,
          keso: open.filter((task) => String(task.assigneeId) === member.userId && isOverdue(task, today)).length,
        })),
      };
    }

    if (name === "list_tasks") {
      let scope = await projects();
      if (str(args.project)) {
        const found = await findProject(args.project);
        if ("error" in found) return found;
        scope = [found.summary];
      }
      const ids = scope.map((item) => item.project._id);
      if (!ids.length) return [];
      const filter: Record<string, unknown> = { projectId: { $in: ids } };
      if (typeof args.status === "string" && STATUS_KEYS.includes(args.status)) filter.status = args.status;
      else if (args.include_done !== true) filter.status = { $ne: "kesz" };
      let tasks = await (await tasksCol()).find(filter).toArray();
      const names = await namesFor(ids);
      if (str(args.assignee)) {
        const who = norm(str(args.assignee)!);
        const isMe = ["en", "magam", "me", "engem"].includes(who);
        tasks = tasks.filter((task) => task.assigneeId && (isMe ? task.assigneeId.equals(user.oid) : norm(names.get(String(task.assigneeId)) ?? "").includes(who)));
      }
      if (args.overdue_only === true) tasks = tasks.filter((task) => isOverdue(task, today));
      if (typeof args.due_within_days === "number") {
        const end = addDays(today, Math.max(0, Math.min(365, Math.floor(args.due_within_days))));
        tasks = tasks.filter((task) => task.dueDate && task.dueDate <= end);
      }
      if (str(args.query)) {
        const q = norm(str(args.query)!);
        tasks = tasks.filter((task) => norm(`${task.title} ${task.description}`).includes(q));
      }
      const projectName = new Map(scope.map((item) => [String(item.project._id), item.project.name]));
      tasks.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || TASK_PRIORITY[b.priority].rank - TASK_PRIORITY[a.priority].rank);
      return { osszesen: tasks.length, feladatok: tasks.slice(0, 25).map((task) => taskRow(task, projectName.get(String(task.projectId)) ?? "?", names)) };
    }

    if (name === "get_task") {
      const id = parseId(str(args.task_id, 40) ?? "");
      const task = id ? await (await tasksCol()).findOne({ _id: id }) : null;
      const access = task ? await projectAccess(user, task.projectId) : null;
      if (!task || !access) return { error: "A feladat nem található, vagy nincs hozzáférésed." };
      const names = await namesFor([task.projectId]);
      const comments = await (await commentsCol()).find({ taskId: task._id }).sort({ createdAt: -1 }).limit(10).toArray();
      return {
        ...taskRow(task, access.project.name, names),
        leiras: task.description.slice(0, 1500),
        megjegyzesek: comments.reverse().map((comment) => ({ szerzo: names.get(String(comment.authorId)) ?? "?", szoveg: comment.text.slice(0, 400) })),
      };
    }

    if (name === "workload") {
      let scope = await projects();
      if (str(args.project)) {
        const found = await findProject(args.project);
        if ("error" in found) return found;
        scope = [found.summary];
      }
      const ids = scope.map((item) => item.project._id);
      const tasks = ids.length ? await (await tasksCol()).find({ projectId: { $in: ids }, status: { $ne: "kesz" } }).toArray() : [];
      const names = await namesFor(ids);
      const rows = new Map<string, { nev: string; nyitott: number; keso: number; magas_prioritas: number }>();
      let unassigned = 0;
      for (const task of tasks) {
        if (!task.assigneeId) {
          unassigned++;
          continue;
        }
        const key = String(task.assigneeId);
        const row = rows.get(key) ?? { nev: names.get(key) ?? "?", nyitott: 0, keso: 0, magas_prioritas: 0 };
        row.nyitott++;
        if (isOverdue(task, today)) row.keso++;
        if (task.priority === "surgos" || task.priority === "magas") row.magas_prioritas++;
        rows.set(key, row);
      }
      return { felelos_nelkul: unassigned, emberek: [...rows.values()].sort((a, b) => b.nyitott - a.nyitott) };
    }

    const propose = (kind: ProposalKind, label: string, payload: Record<string, unknown>) => {
      if (proposals.length >= 12) return { error: "Egyszerre legfeljebb 12 javaslatot tehetsz." };
      const proposal: Proposal = { id: randomUUID(), kind, label, args: payload };
      proposals.push(proposal);
      return { status: "A javaslat rögzítve; a felhasználó jóváhagyására vár, még nem hajtódott végre.", javaslat_id: proposal.id };
    };

    if (name === "propose_create_task") {
      const found = await findProject(args.project);
      if ("error" in found) return found;
      const { project, role } = found.summary;
      if (!can.contribute(role) || project.status === "lezart") return { error: "Ebben a projektben nem vehetsz fel feladatot (nincs jogosultság vagy lezárt)." };
      const title = str(args.title, 160)?.trim();
      if (!title || title.length < 2) return { error: "Hiányzik a feladat címe." };
      const person = await findPerson(project._id, args.assignee);
      if (person && typeof person === "object" && "error" in person) return person;
      const due = str(args.due_date, 10);
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: "A határidő formátuma ÉÉÉÉ-HH-NN legyen." };
      const priority = PRIORITY_KEYS.includes(String(args.priority)) ? String(args.priority) : "normal";
      const status = STATUS_KEYS.includes(String(args.status)) ? String(args.status) : "teendo";
      const who = person && person !== "none" ? person : undefined;
      return propose(
        "create_task",
        `Új feladat a(z) ${project.name} projektben: „${title}”${who ? ` · felelős: ${who.name}` : ""}${due ? ` · határidő: ${formatShortDate(due)}` : ""}${priority !== "normal" ? ` · ${TASK_PRIORITY[priority as keyof typeof TASK_PRIORITY].label}` : ""}`,
        { projectId: String(project._id), title, description: str(args.description, 4000) ?? "", assigneeId: who?.id ?? null, dueDate: due ?? "", priority, status },
      );
    }

    if (name === "propose_update_task") {
      const id = parseId(str(args.task_id, 40) ?? "");
      const task = id ? await (await tasksCol()).findOne({ _id: id }) : null;
      const access = task ? await projectAccess(user, task.projectId) : null;
      if (!task || !access) return { error: "A feladat nem található, vagy nincs hozzáférésed." };
      if (!can.contribute(access.role) || access.project.status === "lezart") return { error: "Ezt a feladatot nem módosíthatod." };
      const patch: Record<string, unknown> = {};
      const parts: string[] = [];
      if (STATUS_KEYS.includes(String(args.status))) {
        patch.status = args.status;
        parts.push(`állapot → ${TASK_STATUS[args.status as keyof typeof TASK_STATUS].label}`);
      }
      if (PRIORITY_KEYS.includes(String(args.priority))) {
        patch.priority = args.priority;
        parts.push(`prioritás → ${TASK_PRIORITY[args.priority as keyof typeof TASK_PRIORITY].label}`);
      }
      if (str(args.title, 160)?.trim()) {
        patch.title = str(args.title, 160)!.trim();
        parts.push(`új cím: ${patch.title}`);
      }
      if (args.due_date !== undefined) {
        const due = str(args.due_date, 10) ?? "";
        if (norm(due) === "nincs") {
          patch.dueDate = "";
          parts.push("határidő törlése");
        }
        else if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
          patch.dueDate = due;
          parts.push(`határidő → ${formatShortDate(due)}`);
        }
        else return { error: "A határidő formátuma ÉÉÉÉ-HH-NN legyen." };
      }
      if (args.assignee !== undefined) {
        const person = await findPerson(task.projectId, args.assignee);
        if (person && typeof person === "object" && "error" in person) return person;
        if (person === "none") {
          patch.assigneeId = null;
          parts.push("felelős törlése");
        }
        else if (person) {
          patch.assigneeId = person.id;
          parts.push(`felelős → ${person.name}`);
        }
      }
      if (!parts.length) return { error: "Nincs mit módosítani." };
      return propose("update_task", `„${task.title}”: ${parts.join(", ")}`, { taskId: String(task._id), patch });
    }

    if (name === "propose_comment") {
      const id = parseId(str(args.task_id, 40) ?? "");
      const task = id ? await (await tasksCol()).findOne({ _id: id }) : null;
      const access = task ? await projectAccess(user, task.projectId) : null;
      const text = str(args.text, 2000)?.trim();
      if (!task || !access) return { error: "A feladat nem található, vagy nincs hozzáférésed." };
      if (!can.contribute(access.role)) return { error: "Ehhez a feladathoz nem kommentelhetsz." };
      if (!text) return { error: "Hiányzik a megjegyzés szövege." };
      return propose("comment", `Megjegyzés a(z) „${task.title}” feladathoz: ${text.slice(0, 140)}${text.length > 140 ? "…" : ""}`, { taskId: String(task._id), text });
    }

    if (name === "propose_invite") {
      const found = await findProject(args.project);
      if ("error" in found) return found;
      if (!can.manage(found.summary.role)) return { error: "Meghívni csak a projektvezető vagy az adminisztrátor tud." };
      const email = str(args.email, 254)?.trim().toLowerCase();
      if (!email || !/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/.test(email)) return { error: "Érvénytelen e-mail-cím." };
      const role = ROLE_KEYS.includes(String(args.role)) ? (String(args.role) as MemberRole) : "tag";
      return propose("invite", `Meghívó a(z) ${found.summary.project.name} projektbe: ${email} (${MEMBER_ROLES[role].label})`, {
        projectId: String(found.summary.project._id),
        email,
        role,
        note: str(args.note, 500) ?? "",
      });
    }

    return { error: `Ismeretlen eszköz: ${name}` };
  }

  return { run, proposals };
}
