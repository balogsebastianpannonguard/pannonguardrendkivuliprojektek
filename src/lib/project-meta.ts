// Címkék és felsorolások, amelyeket a böngészőben futó komponensek is használnak (nincs szerveroldali függőség).

/* ---------- Típusok és címkék ---------- */

export const PROJECT_STATUS = {
  aktiv: { label: "Aktív", tone: "ok" },
  szunetel: { label: "Szünetel", tone: "warning" },
  lezart: { label: "Lezárt", tone: "muted" },
} as const;
export type ProjectStatus = keyof typeof PROJECT_STATUS;

export const MEMBER_ROLES = {
  vezeto: { label: "Projektvezető", hint: "Kezeli a projektet, meghív és feladatokat oszt" },
  tag: { label: "Közreműködő", hint: "Feladatokat hoz létre, szerkeszt és kommentel" },
  megtekinto: { label: "Megtekintő", hint: "Csak olvashat" },
} as const;
export type MemberRole = keyof typeof MEMBER_ROLES;

export const TASK_STATUS = {
  teendo: { label: "Teendő", tone: "muted", dot: "bg-white/40" },
  folyamatban: { label: "Folyamatban", tone: "info", dot: "bg-azure" },
  ellenorzes: { label: "Ellenőrzésre vár", tone: "warning", dot: "bg-amber-300" },
  kesz: { label: "Kész", tone: "ok", dot: "bg-volt" },
} as const;
export type TaskStatus = keyof typeof TASK_STATUS;
export const TASK_STATUS_ORDER = Object.keys(TASK_STATUS) as TaskStatus[];

export const TASK_PRIORITY = {
  alacsony: { label: "Alacsony", rank: 0, tone: "muted" },
  normal: { label: "Normál", rank: 1, tone: "info" },
  magas: { label: "Magas", rank: 2, tone: "warning" },
  surgos: { label: "Sürgős", rank: 3, tone: "error" },
} as const;
export type TaskPriority = keyof typeof TASK_PRIORITY;

export const isProjectStatus = (value: string): value is ProjectStatus => value in PROJECT_STATUS;
export const isMemberRole = (value: string): value is MemberRole => value in MEMBER_ROLES;
export const isTaskStatus = (value: string): value is TaskStatus => value in TASK_STATUS;
export const isTaskPriority = (value: string): value is TaskPriority => value in TASK_PRIORITY;

