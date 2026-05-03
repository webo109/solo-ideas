// deno-lint-ignore-file no-explicit-any
import { handlePreflight, jsonError, corsHeaders } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';
import { callGeminiStream } from '../_shared/gemini.ts';

const SYSTEM = `You are Solo, the user's personal-knowledge assistant inside their idea + note tracker.

You have read-only awareness of their projects, items (notes, ideas, tasks, docs), and archive. The user's data follows in a JSON block. Privacy: only AI-on projects are included — if they ask about a project that's not here, tell them it's AI-off.

How to answer:
- Direct and concise. No preamble like "I'd be happy to help".
- Refer to items by their text (truncate long ones with …).
- When listing, prefer Markdown bullets.
- When suggesting next actions, be specific (file names, commands, decisions).
- If you don't know or the data doesn't show it, say so plainly.
- Never fabricate item titles, project names, or status. If the data doesn't contain it, it doesn't exist for you.`;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonError('POST only', 405);

  const user = await requireUser(req);
  if (!user) return jsonError('Unauthorized', 401);
  const supabase = user.supabase;

  let body: any;
  try { body = await req.json(); } catch { return jsonError('Invalid JSON'); }

  const message = String(body?.message ?? '').trim();
  const history = Array.isArray(body?.history) ? body.history : [];
  if (!message) return jsonError('Missing "message"');
  if (message.length > 4000) return jsonError('Message too long');

  // Pull AI-on projects + their items.
  const { data: projs, error: pErr } = await supabase
    .from('projects')
    .select('id, name, color, ai_enabled')
    .eq('ai_enabled', true);
  if (pErr) return jsonError(pErr.message, 500);

  const projectIds = (projs ?? []).map((p: any) => p.id);
  let items: any[] = [];
  if (projectIds.length > 0) {
    const { data: its, error: iErr } = await supabase
      .from('items')
      .select('id, project_id, kind, text, solution, status, pinned, created_at, done_at')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false })
      .limit(500);
    if (iErr) return jsonError(iErr.message, 500);
    items = its ?? [];
  }

  // Compact context: { projects: [{name, color}], items: [{p, kind, status, text, solution?, done_at?}] }
  const projById: Record<string, any> = {};
  for (const p of projs ?? []) projById[p.id] = p;
  const compact = {
    projects: (projs ?? []).map((p: any) => ({ name: p.name, color: p.color })),
    items: items.map((it: any) => ({
      project: projById[it.project_id]?.name ?? '?',
      kind: it.kind,
      status: it.status,
      pinned: it.pinned || undefined,
      text: it.text?.length > 400 ? it.text.slice(0, 400) + '…' : it.text,
      solution: it.solution
        ? (it.solution.length > 200 ? it.solution.slice(0, 200) + '…' : it.solution)
        : undefined,
      done_at: it.done_at || undefined,
    })),
  };

  const transcript = history
    .slice(-10)
    .map((m: any) => `${m.role === 'user' ? 'User' : 'Solo'}: ${m.content}`)
    .join('\n\n');

  const prompt = [
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    `Data (JSON):`,
    '```json',
    JSON.stringify(compact),
    '```',
    transcript ? `\nRecent conversation:\n${transcript}` : '',
    `\nUser: ${message}\nSolo:`,
  ].join('\n');

  try {
    const stream = await callGeminiStream({
      system: SYSTEM,
      prompt,
      temperature: 0.5,
    });
    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Gemini stream failed', 502);
  }
});
