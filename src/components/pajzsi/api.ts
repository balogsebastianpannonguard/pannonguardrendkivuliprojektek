export type ChatMessage = { role: "user" | "assistant"; content: string };

export type BriefingItem = { tone: "ok" | "warn" | "bad" | "info"; text: string; href?: string };

/** Pajzsi által javasolt módosítás: csak a felhasználó jóváhagyása után hajtódik végre. */
export type Proposal = { id: string; kind: "create_task" | "update_task" | "comment" | "invite"; label: string; args: Record<string, unknown> };
export type ApplyResult = { ok?: boolean; message?: string; error?: string; href?: string };

export type TicketInput = { kind: string; priority: string; title: string; description: string; page: string; diagnostics?: string[] };
export type TicketResult = { ok?: boolean; number?: string; emailed?: boolean; error?: string };

/** A szerveroldali műveletek csomagja, amit a lebegő ablak használ. */
export type PajzsiApi = {
  ask: (history: ChatMessage[]) => Promise<{ reply?: string; proposals?: Proposal[]; error?: string }>;
  briefing: () => Promise<BriefingItem[]>;
  ticket: (input: TicketInput) => Promise<TicketResult>;
  apply: (proposal: Pick<Proposal, "kind" | "args">) => Promise<ApplyResult>;
};
