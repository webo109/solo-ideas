// deno-lint-ignore-file no-explicit-any
// Solo agent chat: function-calling enabled. Single-turn-per-request.
// Frontend manages the multi-step loop (sends back tool results in subsequent turns).

import { handlePreflight, jsonOk, jsonError } from '../_shared/cors.ts';
import { requireUser } from '../_shared/auth.ts';
import { callGeminiAgent, GeminiTurn, ToolDeclaration } from '../_shared/gemini-tools.ts';

const SYSTEM = `You are Solo — the user's personal-knowledge agent inside their idea + note tracker.

Capabilities:
- You have read access to all projects and items the user has marked AI-on (privacy gate). You see active and archived items.
- You can call tools to LIST data and to PROPOSE WRITES (create/update items, change status, create projects). Writes require user confirmation in the UI — your tool call is the proposal; the user accepts or rejects.

Operating rules:
- Be direct and concise. No filler ("I'd be happy to…").
- For "what's …" questions, prefer calling \`list_items\` / \`list_projects\` first to ground your answer in real data.
- For "add / create / archive / mark" intents, call the appropriate write tool with concrete arguments. Only one tool per turn — wait for the result before the next.
- Never fabricate item IDs, project names, or statuses. If something doesn't appear in the data, say so.
- Refer to projects by name (the user's term) not UUID.
- After a tool returns, summarize the outcome in one sentence ("Created task X in Sakni." / "Found 5 items: …").

Item kinds: note, idea, task, doc.
Item statuses: open, today, done (= archived).`;

const TOOLS: ToolDeclaration[] = [
  {
    name: 'list_projects',
    description: 'List the user\'s AI-enabled projects with item counts. No arguments.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_items',
    description:
      'List items, optionally filtered by project name, kind, status, or pinned. Returns id, project_name, kind, status, pinned, text (truncated), updated_at, done_at.',
    parameters: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: 'Match a project name (case-insensitive contains).' },
        kind: { type: 'string', enum: ['note', 'idea', 'task', 'doc'] },
        status: { type: 'string', enum: ['open', 'today', 'done'] },
        pinned: { type: 'boolean' },
        limit: { type: 'number', description: 'Cap results (default 30).' },
      },
    },
  },
  {
    name: 'create_item',
    description:
      'PROPOSE creating a new item (note/idea/task/doc) in a project. The user will confirm before it actually runs.',
    parameters: {
      type: 'object',
      properties: {
        project_name: { type: 'string' },
        kind: { type: 'string', enum: ['note', 'idea', 'task', 'doc'] },
        text: { type: 'string', description: 'Body text. For docs, first line becomes the title.' },
      },
      required: ['project_name', 'kind', 'text'],
    },
  },
  {
    name: 'update_item_status',
    description:
      'PROPOSE changing an item status. status="done" means archive. Needs the item id from a prior list_items call.',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        status: { type: 'string', enum: ['open', 'today', 'done'] },
      },
      required: ['item_id', 'status'],
    },
  },
  {
    name: 'update_item_text',
    description: 'PROPOSE editing an item\'s text. Needs item id from list_items.',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['item_id', 'text'],
    },
  },
  {
    name: 'create_project',
    description: 'PROPOSE creating a new project. The user can later toggle AI on for it.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        color: { type: 'string', description: 'Optional hex color like #00d2ff.' },
      },
      required: ['name'],
    },
  },
];

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonError('POST only', 405);

  const user = await requireUser(req);
  if (!user) return jsonError('Unauthorized', 401);
  const supabase = user.supabase;

  let body: any;
  try { body = await req.json(); } catch { return jsonError('Invalid JSON'); }

  const turns: GeminiTurn[] = Array.isArray(body?.turns) ? body.turns : null;
  if (!turns || turns.length === 0) return jsonError('Missing "turns"');

  // Pull AI-on projects + items as compact context, included with the system prompt.
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
      .select('id, project_id, kind, text, solution, status, pinned, created_at, updated_at, done_at')
      .in('project_id', projectIds)
      .order('updated_at', { ascending: false })
      .limit(500);
    if (iErr) return jsonError(iErr.message, 500);
    items = its ?? [];
  }

  const projById: Record<string, any> = {};
  for (const p of projs ?? []) projById[p.id] = p;

  const dataBlock = JSON.stringify({
    projects: (projs ?? []).map((p: any) => ({ id: p.id, name: p.name, color: p.color })),
    items: items.map((it: any) => ({
      id: it.id,
      project: projById[it.project_id]?.name ?? '?',
      kind: it.kind,
      status: it.status,
      pinned: it.pinned || undefined,
      text: it.text?.length > 300 ? it.text.slice(0, 300) + '…' : it.text,
      updated_at: it.updated_at,
      done_at: it.done_at || undefined,
    })),
  });

  const system = `${SYSTEM}\n\nToday: ${new Date().toISOString().slice(0, 10)}\n\nUser data (JSON, AI-on projects only):\n${dataBlock}`;

  try {
    const result = await callGeminiAgent({
      system,
      turns,
      tools: TOOLS,
      temperature: 0.4,
    });
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Gemini call failed', 502);
  }
});
