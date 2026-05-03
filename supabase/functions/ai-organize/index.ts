// deno-lint-ignore-file no-explicit-any
import { handlePreflight, jsonOk, jsonError } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';
import { callGemini } from '../_shared/gemini.ts';

const SYSTEM = `You organize the user's personal notes into clean Markdown.
Rules:
- Preserve the user's exact wording. Do NOT paraphrase, rewrite, or "improve" prose.
- Add structural Markdown only: # title on line 1 (use the user's own first idea/sentence as the title — do not invent), ## subsections to group related thoughts, hyphen bullets for list-y content, blank lines between paragraphs.
- Fix obvious punctuation/capitalization errors.
- Wrap inline code, URLs, file paths, and identifiers in \`backticks\`.
- Output ONLY the cleaned Markdown. No commentary, no fences, no "here's your note".
- Do NOT add new information, suggestions, or summaries.`;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonError('POST only', 405);

  const user = await requireUser(req);
  if (!user) return jsonError('Unauthorized', 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonError('Invalid JSON'); }

  const text = String(body?.text ?? '').trim();
  if (!text) return jsonError('Missing "text"');
  if (text.length > 10000) return jsonError('Text too long (>10000 chars)');

  try {
    const organized = await callGemini({
      system: SYSTEM,
      prompt: `Organize this note:\n\n${text}`,
      temperature: 0.2,
    });
    return jsonOk({ organized });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Gemini call failed', 502);
  }
});
