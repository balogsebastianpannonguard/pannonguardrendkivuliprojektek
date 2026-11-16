"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import type { BriefingItem, ChatMessage, Proposal } from "@/components/pajzsi/api";
import { aiAvailable, AiError } from "@/lib/ai";
import { buildSystemPrompt, loadBriefing, takeQuota } from "@/lib/assistant";
import { GeminiError } from "@/lib/gemini";
import { geminiAgent } from "@/lib/gemini-agent";
import { PAJZSI_TOOLS, createToolbox } from "@/lib/pajzsi-tools";
import { requireUser } from "@/lib/session";
import { addCommentOp, createTaskOp, inviteOp, updateTaskOp } from "@/lib/task-ops";

export type AssistantState = { reply?: string; proposals?: Proposal[]; error?: string };

const MAX_TURNS = 12;
const MAX_CHARS = 2000;

function cleanTurns(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const turns = input
    .filter(
      (turn): turn is ChatMessage =>
        typeof turn === "object" &&
        turn !== null &&
        (turn.role === "user" || turn.role === "assistant") &&
        typeof turn.content === "string" &&
        turn.content.trim().length > 0,
    )
    .map((turn) => ({ role: turn.role, content: turn.content.trim().slice(0, MAX_CHARS) }))
    .slice(-MAX_TURNS);
  // A beszélgetésnek felhasználói üzenettel kell kezdődnie, és azzal is kell végződnie.
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") return [];
  return turns;
}

export async function assistantBriefing(): Promise<BriefingItem[]> {
  return loadBriefing(await requireUser());
}

export async function askAssistant(history: ChatMessage[]): Promise<AssistantState> {
  const user = await requireUser();
  if (!aiAvailable()) return { error: "A csevegés még nincs bekapcsolva (hiányzik a GEMINI_API_KEY)." };
  const turns = cleanTurns(history);
  if (!turns.length) return { error: "Írj be egy kérdést." };
  if (!(await takeQuota(user.id, "chat", 40))) return { error: "Elfogyott az óránkénti keret (40 kérdés). Próbáld újra később." };

  try {
    const toolbox = createToolbox(user);
    const reply = await geminiAgent({
      system: await buildSystemPrompt(user, new Date()),
      turns: turns.map((turn) => ({ role: turn.role === "assistant" ? "model" : "user", text: turn.content })),
      tools: PAJZSI_TOOLS,
      runTool: toolbox.run,
    });
    return { reply, ...(toolbox.proposals.length && { proposals: toolbox.proposals }) };
  } catch (error) {
    if (error instanceof AiError || error instanceof GeminiError) return { error: error.message };
    console.error("Asszisztens hiba:", (error as Error).name);
    return { error: "Váratlan hiba történt, próbáld újra." };
  }
}

/* ---------- Jóváhagyott javaslat végrehajtása ---------- */

const createArgs = z.object({
  projectId: z.string().regex(/^[0-9a-f]{24}$/i),
  title: z.string().max(160),
  description: z.string().max(4000).default(""),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().max(10).optional(),
  priority: z.string().max(20).default("normal"),
  status: z.string().max(20).default("teendo"),
});
const updateArgs = z.object({ taskId: z.string().regex(/^[0-9a-f]{24}$/i), patch: z.record(z.string(), z.unknown()) });
const commentArgs = z.object({ taskId: z.string().regex(/^[0-9a-f]{24}$/i), text: z.string().max(2000) });
const inviteArgs = z.object({ projectId: z.string().regex(/^[0-9a-f]{24}$/i), email: z.string().max(254), role: z.string().max(20), note: z.string().max(500).default("") });

/**
 * A felhasználó által jóváhagyott javaslat végrehajtása. A javaslat adatait a kliens küldi vissza, ezért semmit nem
 * tekintünk megbízhatónak: ugyanaz az ellenőrzés fut, mint az űrlapoknál (jogosultság, tagság, érvényesség).
 */
export async function applyProposal(proposal: Pick<Proposal, "kind" | "args">): Promise<{ ok?: boolean; message?: string; error?: string; href?: string }> {
  const user = await requireUser();
  try {
    if (proposal.kind === "create_task") {
      const args = createArgs.parse(proposal.args);
      const result = await createTaskOp(user, args.projectId, { ...args, assigneeId: args.assigneeId || null }, true);
      if (!result.ok) return { error: result.error };
      revalidatePath(`/projektek/${args.projectId}`);
      revalidatePath("/feladataim");
      revalidatePath("/");
      return { ok: true, message: "Feladat felvéve.", href: `/projektek/${args.projectId}/feladat/${result.id}` };
    }
    if (proposal.kind === "update_task") {
      const args = updateArgs.parse(proposal.args);
      const result = await updateTaskOp(user, args.taskId, args.patch, true);
      if (!result.ok) return { error: result.error };
      revalidatePath(`/projektek/${result.projectId}`);
      revalidatePath("/feladataim");
      revalidatePath("/");
      return { ok: true, message: "Módosítva.", href: `/projektek/${result.projectId}/feladat/${args.taskId}` };
    }
    if (proposal.kind === "comment") {
      const args = commentArgs.parse(proposal.args);
      const result = await addCommentOp(user, args.taskId, args.text, true);
      if (!result.ok) return { error: result.error };
      return { ok: true, message: "Megjegyzés hozzáadva." };
    }
    if (proposal.kind === "invite") {
      const args = inviteArgs.parse(proposal.args);
      const list = await headers();
      const host = list.get("x-forwarded-host") ?? list.get("host");
      const origin = host ? `${list.get("x-forwarded-proto") ?? "https"}://${host}` : undefined;
      const result = await inviteOp(user, args.projectId, args.email, args.role as never, args.note, origin, true);
      if (!result.ok) return { error: result.error };
      revalidatePath(`/projektek/${args.projectId}`);
      return { ok: true, message: result.emailed ? "Meghívó elküldve." : "A meghívó létrejött, de a levél nem ment el; a Tagok fülön másolhatod a linket." };
    }
    return { error: "Ismeretlen javaslat." };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "A javaslat adatai hibásak." };
    console.error("Javaslat-végrehajtási hiba:", (error as Error).name);
    return { error: "A művelet átmenetileg nem érhető el." };
  }
}
