import { supabase } from './supabase.js';

export function subscribeToProjects(userId, handlers) {
  const filter = `user_id=eq.${userId}`;
  const channel = supabase
    .channel(`projects:${userId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'projects', filter },
      (p) => handlers.onInsert?.(p.new))
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'projects', filter },
      (p) => handlers.onUpdate?.(p.new))
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'projects', filter },
      (p) => handlers.onDelete?.(p.old))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToItems(userId, handlers) {
  const filter = `user_id=eq.${userId}`;
  const channel = supabase
    .channel(`items:${userId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'items', filter },
      (p) => handlers.onInsert?.(p.new))
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'items', filter },
      (p) => handlers.onUpdate?.(p.new))
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'items', filter },
      (p) => handlers.onDelete?.(p.old))
    .subscribe();
  return () => supabase.removeChannel(channel);
}
