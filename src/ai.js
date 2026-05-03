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

export async function chatStream({ message, history, onChunk, onDone, onError }) {
  try {
    const headers = await authHeaders();
    const url = `${FUNCTIONS_BASE}/ai-chat`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, history }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      let m = t;
      try { m = JSON.parse(t).error || t; } catch { /* ignore */ }
      throw new Error(`ai-chat: ${res.status} ${m || res.statusText}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      full += chunk;
      onChunk?.(chunk, full);
    }
    onDone?.(full);
    return full;
  } catch (e) {
    onError?.(e);
    throw e;
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
