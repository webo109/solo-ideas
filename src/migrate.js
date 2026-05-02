import { createIdea, listIdeas } from './store.js';

const OLD_KEYS = ['eureka.v1', 'tada.v1'];
const MIGRATED_FLAG = 'solo.migrated.v1';

export async function migrateLocalStorageIfNeeded(userId) {
  if (localStorage.getItem(MIGRATED_FLAG)) return 0;

  let oldData = null;
  for (const key of OLD_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const items = parsed?.ideas || parsed?.tasks;
      if (Array.isArray(items) && items.length) {
        oldData = items;
        break;
      }
    } catch {
      // ignore corrupt JSON, keep checking other keys
    }
  }

  if (!oldData) {
    localStorage.setItem(MIGRATED_FLAG, String(Date.now()));
    return 0;
  }

  const existing = await listIdeas(userId);
  if (existing.length > 0) {
    localStorage.setItem(MIGRATED_FLAG, String(Date.now()));
    return 0;
  }

  let count = 0;
  const reversed = [...oldData].reverse();
  for (const idea of reversed) {
    try {
      await createIdea(userId, {
        text: String(idea.text ?? '').slice(0, 200),
        solution: idea.solution ? String(idea.solution).slice(0, 1000) : null,
        done: !!idea.done,
        position: (count + 1) * 1000,
      });
      count++;
    } catch (e) {
      console.error('Migration failed for idea:', idea, e);
    }
  }

  localStorage.setItem(MIGRATED_FLAG, String(Date.now()));
  return count;
}
