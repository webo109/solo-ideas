import { supabase } from './supabase.js';
import { SUPABASE_URL } from './config.js';

const FUNCTIONS_BASE = (SUPABASE_URL || '').replace('.supabase.co', '.functions.supabase.co');

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Not signed in.');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function callFn(name, body) {
  const headers = await authHeaders();
  const url = `${FUNCTIONS_BASE}/${name}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text;
    try { message = JSON.parse(text).error || text; } catch { /* ignore */ }
    throw new Error(`${name}: ${res.status} ${message || res.statusText}`);
  }
  return res.json();
}

export async function organizeDoc(text) {
  const { organized } = await callFn('ai-organize', { text });
  return organized;
}

export async function suggestForItem({ kind, text, solution }) {
  const { suggestions } = await callFn('ai-suggest', { kind, text, solution });
  return suggestions;
}

// Agent turn (function-calling). Returns either {type:'text', text} or {type:'tool_call', tool}.
// Frontend manages the multi-turn loop.
export async function chatTurn({ turns }) {
  return await callFn('ai-chat', { turns });
}

// Read tools execute without confirmation; write tools require it.
export const READ_TOOLS  = new Set(['list_projects', 'list_items']);
export const WRITE_TOOLS = new Set(['create_item', 'update_item_status', 'update_item_text', 'create_project']);

// Human-readable description of a proposed action.
export function describeToolCall(name, args) {
  switch (name) {
    case 'list_projects':
      return 'List your projects';
    case 'list_items': {
      const filters = [];
      if (args.project_name) filters.push(`in ${args.project_name}`);
      if (args.kind)         filters.push(args.kind + 's');
      if (args.status)       filters.push(args.status);
      if (args.pinned)       filters.push('pinned');
      return `List items ${filters.join(' · ') || '(all)'}`;
    }
    case 'create_item':
      return `Create ${args.kind} in ${args.project_name}: "${args.text?.slice(0, 80)}${(args.text||'').length > 80 ? '…' : ''}"`;
    case 'update_item_status':
      return `Set item to ${args.status === 'done' ? 'archived' : args.status}`;
    case 'update_item_text':
      return `Edit item text → "${args.text?.slice(0, 80)}${(args.text||'').length > 80 ? '…' : ''}"`;
    case 'create_project':
      return `Create project "${args.name}"`;
    default:
      return `Run ${name}`;
  }
}

// Convenience: derive title + body from raw markdown.
// First non-empty line becomes the title; rest is the body.
export function splitTitleBody(markdown) {
  const text = String(markdown ?? '').trim();
  if (!text) return { title: 'Untitled', body: '' };
  const lines = text.split(/\r?\n/);
  let titleLine = '';
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t) {
      titleLine = t;
      bodyStart = i + 1;
      break;
    }
  }
  const title = titleLine.replace(/^#{1,6}\s+/, '').slice(0, 200) || 'Untitled';
  const body = lines.slice(bodyStart).join('\n').trim();
  return { title, body };
}

// Plain-text preview from markdown (strips formatting).
export function previewFromMarkdown(markdown, maxLen = 180) {
  const text = String(markdown ?? '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen).trim() + '…' : text;
}

export function wordCount(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
}
