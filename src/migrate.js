import { createProject, createItem, listProjects } from './api.js';

const OLD_KEYS = ['eureka.v1', 'tada.v1'];
const MIGRATED_FLAG = 'solo.migrated.v2';

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
      // ignore corrupt JSON
    }
  }

  if (!oldData) {
    localStorage.setItem(MIGRATED_FLAG, String(Date.now()));
    return 0;
  }

  const projects = await listProjects(userId);
  let inbox = projects.find((p) => p.name.toLowerCase() === 'inbox');
  if (!inbox) {
    inbox = await createProject(userId, { name: 'Inbox', color: '#7f00ff', position: 1000 });
  }

  let count = 0;
  const reversed = [...oldData].reverse();
  for (const idea of reversed) {
    try {
      await createItem(userId, {
        project_id: inbox.id,
        kind: 'idea',
        text: String(idea.text ?? '').slice(0, 5000),
        solution: idea.solution ? String(idea.solution).slice(0, 5000) : null,
        status: idea.done ? 'done' : 'open',
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
