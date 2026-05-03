import { supabase } from './supabase.js';

// ============ Projects ============

export async function listProjects(userId) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createProject(userId, fields) {
  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, patch) {
  const { data, error } = await supabase
    .from('projects')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderProjects(orderedIds) {
  const updates = orderedIds.map((id, i) =>
    supabase.from('projects').update({ position: (i + 1) * 1000 }).eq('id', id)
  );
  const results = await Promise.all(updates);
  for (const r of results) if (r.error) throw r.error;
}

// ============ Items ============

export async function listItems(userId) {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createItem(userId, fields) {
  const { data, error } = await supabase
    .from('items')
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateItem(id, patch) {
  const { data, error } = await supabase
    .from('items')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteItem(id) {
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderItems(orderedIds) {
  const updates = orderedIds.map((id, i) =>
    supabase.from('items').update({ position: (i + 1) * 1000 }).eq('id', id)
  );
  const results = await Promise.all(updates);
  for (const r of results) if (r.error) throw r.error;
}
