import { supabase } from './supabase.js';

const TABLE = 'ideas';

export async function listIdeas(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createIdea(userId, fields) {
  const payload = { user_id: userId, ...fields };
  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateIdea(id, patch) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteIdea(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function reorderIdeas(orderedIds) {
  const updates = orderedIds.map((id, i) =>
    supabase.from(TABLE).update({ position: (i + 1) * 1000 }).eq('id', id)
  );
  const results = await Promise.all(updates);
  for (const r of results) {
    if (r.error) throw r.error;
  }
}
