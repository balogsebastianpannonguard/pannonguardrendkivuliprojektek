import { GEMINI_SMART, GeminiError, geminiAvailable } from "@/lib/gemini";

/**
 * Eszközhívós (function calling) Gemini-ciklus: a modell eszközöket hívhat, mi lefuttatjuk őket, az eredményt
 * visszaadjuk neki, és ez ismétlődik, amíg szöveges válasz nem születik (vagy el nem fogy a lépéskeret).
 * Csak a szerverről hívható.
 */
type Part = Record<string, unknown>;
type Content = { role: "user" | "model"; parts: Part[] };

export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type Candidate = { content?: { parts?: Part[] }; finishReason?: string };
type ApiResponse = { candidates?: Candidate[]; error?: { code?: number; message?: string }; promptFeedback?: { blockReason?: string } };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callModel(model: string, body: string, deadline: number): Promise<ApiResponse & { _status?: number }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("Az AI-funkciókhoz GEMINI_API_KEY szükséges.");
  let last: (ApiResponse & { _status?: number }) | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) {
      if (deadline - Date.now() < 8_000) break;
      await sleep(600 * attempt);
    }
    try {
      const raw = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
        cache: "no-store",
      });
      const text = await raw.text();
      last = (text ? JSON.parse(text) : {}) as ApiResponse & { _status?: number };
      last._status = raw.status;
      if (raw.status === 429 || raw.status >= 500) continue;
      return last;
    } catch (error) {
      if (attempt === 2 || (error as Error).name === "TimeoutError") throw new GeminiError((error as Error).name === "TimeoutError" ? "Az AI túl sokáig válaszolt." : "Nem érhető el a Gemini API.");
    }
  }
  if (last) return last;
  throw new GeminiError("Az AI most nem válaszolt, próbáld újra.");
}

export async function geminiAgent({
  system,
  turns,
  tools,
  runTool,
  maxSteps = 6,
  maxTokens = 1600,
  timeoutMs = 95_000,
  model = GEMINI_SMART,
}: {
  system: string;
  turns: { role: "user" | "model"; text: string }[];
  tools: AgentTool[];
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxSteps?: number;
  maxTokens?: number;
  timeoutMs?: number;
  model?: string;
}): Promise<string> {
  if (!geminiAvailable()) throw new GeminiError("Az AI-funkciókhoz GEMINI_API_KEY szükséges.");
  const deadline = Date.now() + timeoutMs;
  const contents: Content[] = turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));

  for (let step = 0; step < maxSteps; step++) {
    const lastStep = step === maxSteps - 1;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      // Az utolsó lépésben már nem engedünk eszközt, hogy mindenképp szöveges válasz szülessen.
      ...(!lastStep && { tools: [{ functionDeclarations: tools }], toolConfig: { functionCallingConfig: { mode: "AUTO" } } }),
      // A gondolkodási keret korlátozása jelentősen gyorsítja a választ, és nem eszi el a válasz tokenjeit.
      generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: step === 0 ? 512 : 0 } },
    });
    const response = await callModel(model, body, deadline);

    if (response.error) {
      const status = response.error.code ?? response._status;
      if (status === 401 || status === 403) throw new GeminiError("Érvénytelen vagy nem engedélyezett Gemini API-kulcs.", status);
      if (status === 429) throw new GeminiError("Az AI most túlterhelt, próbáld újra egy perc múlva.", status);
      if (status === 400) throw new GeminiError("Az AI nem tudta feldolgozni a kérést.", status);
      throw new GeminiError(`AI-hiba (${status ?? "ismeretlen"}).`, status);
    }
    if (response.promptFeedback?.blockReason) throw new GeminiError("Az AI ezt a kérést nem dolgozta fel.");

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const calls = parts.filter((part) => part.functionCall) as { functionCall: { name: string; args?: Record<string, unknown> } }[];

    if (!calls.length) {
      const text = parts
        .filter((part) => typeof part.text === "string" && !part.thought)
        .map((part) => part.text as string)
        .join("")
        .trim();
      if (text) return text;
      if (candidate?.finishReason === "SAFETY") throw new GeminiError("Az AI ezt a kérést nem dolgozta fel.");
      throw new GeminiError("Az AI üres választ adott.");
    }

    // A modell saját válaszát változtatás nélkül adjuk vissza (a gondolati aláírásokkal együtt).
    contents.push({ role: "model", parts });
    const results: Part[] = [];
    for (const call of calls.slice(0, 8)) {
      let output: unknown;
      try {
        output = await runTool(call.functionCall.name, call.functionCall.args ?? {});
      } catch (error) {
        output = { error: (error as Error).message?.slice(0, 200) || "Az eszköz hibával leállt." };
      }
      results.push({ functionResponse: { name: call.functionCall.name, response: { result: output } } });
    }
    contents.push({ role: "user", parts: results });
  }
  throw new GeminiError("Az AI nem fejezte be időben, próbáld újra egyszerűbben.");
}
