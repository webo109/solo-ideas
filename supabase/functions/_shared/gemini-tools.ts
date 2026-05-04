// deno-lint-ignore-file no-explicit-any
// Single-shot Gemini call with function-calling support.
// Used by the agent variant of ai-chat.

const DEFAULT_MODEL = 'gemini-2.5-flash';

export type GeminiTurn =
  | { role: 'user'; content: string }
  | { role: 'model'; content?: string; functionCall?: { name: string; args: any } }
  | { role: 'function'; name: string; response: any };

export type ToolDeclaration = {
  name: string;
  description: string;
  parameters: any;
};

export type GeminiResult =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; tool: { name: string; args: any } };

function turnsToContents(turns: GeminiTurn[]): any[] {
  const contents: any[] = [];
  for (const t of turns) {
    if (t.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: t.content }] });
    } else if (t.role === 'model') {
      const parts: any[] = [];
      if (t.functionCall) parts.push({ functionCall: { name: t.functionCall.name, args: t.functionCall.args } });
      if (t.content) parts.push({ text: t.content });
      contents.push({ role: 'model', parts });
    } else if (t.role === 'function') {
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: t.name, response: t.response } }],
      });
    }
  }
  return contents;
}

export async function callGeminiAgent(opts: {
  system?: string;
  turns: GeminiTurn[];
  tools: ToolDeclaration[];
  temperature?: number;
}): Promise<GeminiResult> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set on this Edge Function.');

  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body: any = {
    contents: turnsToContents(opts.turns),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: 4096,
    },
    tools: [{ functionDeclarations: opts.tools }],
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t}`);
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];

  // Prefer function call if present.
  for (const p of parts) {
    if (p.functionCall) {
      return { type: 'tool_call', tool: { name: p.functionCall.name, args: p.functionCall.args || {} } };
    }
  }
  const text = parts.map((p: any) => p.text || '').join('').trim();
  if (!text) throw new Error('Gemini returned empty response.');
  return { type: 'text', text };
}
