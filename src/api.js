import { supabase } from './supabase.js';

// ============ Projects ============

export async function listProjects(userId) {
  const { data, error } = await supabase
    .from('projects').select('*').eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createProject(userId, fields) {
  const { data, error } = await supabase
    .from('projects').insert({ user_id: userId, ...fields }).select().single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, patch) {
  const { data, error } = await supabase
    .from('projects').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderProjects(orderedIds) {
  const updates = orderedIds.map((id, i) =>
    supabase.from('projects').update({ position: (i + 1) * 1000 }).eq('id', id));
  const results = await Promise.all(updates);
  for (const r of results) if (r.error) throw r.error;
}

// ============ Items ============

export async function listItems(userId) {
  const { data, error } = await supabase
    .from('items').select('*').eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createItem(userId, fields) {
  const { data, error } = await supabase
    .from('items').insert({ user_id: userId, ...fields }).select().single();
  if (error) throw error;
  return data;
}

export async function updateItem(id, patch) {
  const { data, error } = await supabase
    .from('items').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteItem(id) {
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderItems(orderedIds) {
  const updates = orderedIds.map((id, i) =>
    supabase.from('items').update({ position: (i + 1) * 1000 }).eq('id', id));
  const results = await Promise.all(updates);
  for (const r of results) if (r.error) throw r.error;
}

// ============ Chat threads ============

export async function listChatThreads(userId, limit = 30) {
  const { data, error } = await supabase
    .from('chat_threads').select('*').eq('user_id', userId)
    .order('updated_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getOrCreateTodayThread(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from('chat_threads').select('*')
    .eq('user_id', userId).eq('day', today).maybeSingle();
  if (existing) return existing;
  const niceTitle = new Date().toLocaleDateString(undefined,
    { weekday: 'short', month: 'short', day: 'numeric' });
  const { data, error } = await supabase
    .from('chat_threads')
    .insert({ user_id: userId, title: niceTitle, day: today })
    .select().single();
  if (error) throw error;
  return data;
}

export async function listChatMessages(threadId) {
  const { data, error } = await supabase
    .from('chat_messages').select('*').eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function appendChatMessage(userId, threadId, role, content) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ user_id: userId, thread_id: threadId, role, content })
    .select().single();
  if (error) throw error;
  // touch thread updated_at
  await supabase.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
  return data;
}

export async function deleteChatThread(threadId) {
  const { error } = await supabase.from('chat_threads').delete().eq('id', threadId);
  if (error) throw error;
}
