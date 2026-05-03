// deno-lint-ignore-file no-explicit-any
import { handlePreflight, jsonOk, jsonError } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';
import { callGemini } from '../_shared/gemini.ts';

const PROMPTS: Record<string, string> = {
  idea: `You are helping the user think through their captured idea or problem.
Give 3 distinct approaches/solutions in Markdown:
- Each as a "## Approach N — short title" with 2–4 sentences.
- Different angles, not minor variants.
- Be concrete. Mention real techniques, libraries, tradeoffs.
- End each approach with a one-line "Tradeoff:" note.
- Match the user's voice and level of formality.
- Output ONLY the markdown, no preamble.`,

  task: `The user has a task to do. Suggest a concrete next-step plan in Markdown:
- 3–6 numbered steps.
- Each step is one specific, actionable thing — not vague advice.
- Include any obvious dependencies or watchouts inline.
- Output ONLY the markdown.`,

  note: `The user keeps a note. Surface useful structure:
- 1-line TL;DR.
- 3–5 bullet points distilling the key points.
- Output ONLY the markdown.`,
};

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonError('POST only', 405);

  const user = await requireUser(req);
  if (!user) return jsonError('Unauthorized', 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonError('Invalid JSON'); }

  const kind = String(body?.kind ?? 'idea');
  const text = String(body?.text ?? '').trim();
  const solution = body?.solution ? String(body.solution).trim() : null;
  if (!text) return jsonError('Missing "text"');
  if (text.length > 10000) return jsonError('Text too long');

  const system = PROMPTS[kind] || PROMPTS.idea;
  let prompt = `Item:\n${text}`;
  if (solution) prompt += `\n\nUser's existing solution attempt:\n${solution}`;

  try {
    const suggestions = await callGemini({
      system,
      prompt,
      temperature: 0.6,
    });
    return jsonOk({ suggestions });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Gemini call failed', 502);
  }
});
