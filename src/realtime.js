import { supabase } from './supabase.js';

export function subscribeToIdeas(userId, handlers) {
  const filter = `user_id=eq.${userId}`;
  const channel = supabase
    .channel(`ideas:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ideas', filter },
      (payload) => handlers.onInsert?.(payload.new),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'ideas', filter },
      (payload) => handlers.onUpdate?.(payload.new),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'ideas', filter },
      (payload) => handlers.onDelete?.(payload.old),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
