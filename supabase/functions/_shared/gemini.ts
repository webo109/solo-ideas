// deno-lint-ignore-file no-explicit-any
const DEFAULT_MODEL = 'gemini-2.0-flash-exp';

export async function callGemini(opts: {
  prompt: string;
  system?: string;
  temperature?: number;
}): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set on this Edge Function.');

  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body: any = {
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 4096,
    },
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t}`);
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  if (!text) throw new Error('Gemini returned empty content.');
  return text.trim();
}

export async function callGeminiStream(opts: {
  prompt: string;
  system?: string;
  temperature?: number;
}): Promise<ReadableStream<Uint8Array>> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set on this Edge Function.');

  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const body: any = {
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: 4096,
    },
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemini stream ${res.status}: ${t}`);
  }

  // Transform Gemini SSE to plain text chunks.
  const decoder = new TextDecoder();
  return new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json) continue;
            try {
              const obj = JSON.parse(json);
              const text = obj?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
              if (text) controller.enqueue(new TextEncoder().encode(text));
            } catch {
              // ignore partial JSON
            }
          }
        }
      } catch (e) {
        controller.error(e);
      } finally {
        controller.close();
      }
    },
  });
}
