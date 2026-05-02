import { isConfigured } from './src/supabase.js';
import * as Auth from './src/auth.js';
import * as Store from './src/store.js';
import { subscribeToIdeas } from './src/realtime.js';
import { migrateLocalStorageIfNeeded } from './src/migrate.js';

const PALETTE = ['#7f00ff', '#e100ff', '#00d2ff', '#ffffff'];
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const POSITION_GAP = 1000;

const $list     = document.getElementById('list');
const $empty    = document.getElementById('empty');
const $input    = document.getElementById('input');
const $form     = document.getElementById('composer');
const $headline = document.getElementById('headline');
const $date     = document.getElementById('date');
const $auth     = document.getElementById('auth');
const $authForm = document.getElementById('auth-form');
const $authEmail  = document.getElementById('auth-email');
const $authStatus = document.getElementById('auth-status');
const $signOut    = document.getElementById('sign-out');
const $configErr  = document.getElementById('config-error');
const $appShell   = document.getElementById('app-shell');

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

$date.textContent = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

// ---------- App state ----------

let state = { ideas: [] };
let currentUser = null;
let unsubscribeRealtime = null;
let justAddedId = null;
let addingSolutionId = null;

// ---------- Boot ----------

async function boot() {
  if (!isConfigured()) {
    $configErr.hidden = false;
    $appShell.hidden = true;
    return;
  }
  $configErr.hidden = true;

  const session = await Auth.getSession();
  if (session?.user) {
    await onSignedIn(session.user);
  } else {
    showSignInUI();
  }

  Auth.onAuthChange(async (s) => {
    if (s?.user && (!currentUser || currentUser.id !== s.user.id)) {
      await onSignedIn(s.user);
    } else if (!s && currentUser) {
      onSignedOut();
    }
  });
}

async function onSignedIn(user) {
  currentUser = user;
  hideSignInUI();
  $list.setAttribute('aria-busy', 'true');

  try {
    const migrated = await migrateLocalStorageIfNeeded(user.id);
    if (migrated > 0) flashHeadline(`Imported ${migrated} from this device`);

    state.ideas = await Store.listIdeas(user.id);
    sortIdeas();
    render();

    unsubscribeRealtime = subscribeToIdeas(user.id, {
      onInsert: handleRemoteInsert,
      onUpdate: handleRemoteUpdate,
      onDelete: handleRemoteDelete,
    });
  } catch (e) {
    console.error('Failed to load ideas:', e);
    flashHeadline('Could not load ideas');
  } finally {
    $list.removeAttribute('aria-busy');
  }
}

function onSignedOut() {
  if (unsubscribeRealtime) {
    unsubscribeRealtime();
    unsubscribeRealtime = null;
  }
  currentUser = null;
  state.ideas = [];
  render();
  showSignInUI();
}

// ---------- Auth UI ----------

function showSignInUI() {
  $auth.hidden = false;
  $form.hidden = true;
  $list.hidden = true;
  $empty.hidden = true;
  if ($signOut) $signOut.hidden = true;
  $authStatus.textContent = '';
  setTimeout(() => $authEmail.focus(), 0);
}

function hideSignInUI() {
  $auth.hidden = true;
  $form.hidden = false;
  $list.hidden = false;
  if ($signOut) $signOut.hidden = false;
}

$authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $authEmail.value.trim();
  if (!email) return;
  $authStatus.textContent = 'Sending…';
  $authStatus.className = 'auth__status';
  try {
    await Auth.sendMagicLink(email);
    $authStatus.textContent = `Check ${email} for a sign-in link.`;
    $authStatus.classList.add('auth__status--ok');
  } catch (err) {
    console.error(err);
    $authStatus.textContent = err?.message || 'Could not send link.';
    $authStatus.classList.add('auth__status--err');
  }
});

if ($signOut) {
  $signOut.addEventListener('click', () => Auth.signOut());
}

// ---------- Sorting helpers ----------

function sortIdeas() {
  state.ideas.sort((a, b) => a.position - b.position);
}

function nextTopPosition() {
  if (state.ideas.length === 0) return POSITION_GAP;
  const minPos = Math.min(...state.ideas.map((i) => i.position));
  return minPos - POSITION_GAP;
}

// ---------- Realtime handlers ----------

function handleRemoteInsert(idea) {
  if (state.ideas.find((i) => i.id === idea.id)) return;
  state.ideas.push(idea);
  sortIdeas();
  render();
}

function handleRemoteUpdate(idea) {
  const i = state.ideas.findIndex((x) => x.id === idea.id);
  if (i >= 0) state.ideas[i] = idea;
  else state.ideas.push(idea);
  sortIdeas();
  render();
}

function handleRemoteDelete(idea) {
  state.ideas = state.ideas.filter((x) => x.id !== idea.id);
  render();
}

// ---------- Render ----------

function render() {
  $list.innerHTML = '';
  for (const t of state.ideas) {
    const li = document.createElement('li');
    li.className = 'task' + (t.done ? ' task--done' : '');
    li.dataset.id = t.id;
    if (t.id === justAddedId && !REDUCED_MOTION) li.classList.add('task--entering');
    li.innerHTML = `
      <button class="task__handle" type="button" aria-label="Drag to reorder">⋮⋮</button>
      <button class="task__check" type="button" aria-label="${t.done ? 'Mark as open' : 'Mark as solved'}" aria-pressed="${t.done}">
        <span class="task__check-mark"></span>
      </button>
      <div class="idea__content">
        <div class="task__text" contenteditable="true" spellcheck="false">${escapeHtml(t.text)}</div>
        ${t.solution
          ? `<div class="idea__solution">
               <div class="idea__solution-label" contenteditable="false">Solution</div>
               <div class="solution__text" contenteditable="true" spellcheck="false">${escapeHtml(t.solution)}</div>
             </div>`
          : (addingSolutionId === t.id
              ? `<form class="idea__solution-form" data-id="${t.id}">
                   <input type="text" class="idea__solution-input" placeholder="Type solution & hit enter...">
                   <button type="submit" class="idea__solution-save" aria-label="Save solution">✓</button>
                   <button type="button" class="idea__solution-cancel" aria-label="Cancel">×</button>
                 </form>`
              : `<button class="idea__add-solution" type="button">+ Add Solution</button>`)
        }
      </div>
      <button class="task__del" type="button" aria-label="Delete idea">×</button>
    `;
    $list.appendChild(li);
  }
  justAddedId = null;
  updateEmpty();
}

function updateEmpty(animate = false) {
  const open = state.ideas.filter((t) => !t.done).length;
  if (state.ideas.length > 0 && open === 0) {
    $empty.hidden = false;
    if (animate) {
      $empty.classList.remove('empty--in');
      void $empty.offsetWidth;
      $empty.classList.add('empty--in');
    }
  } else {
    $empty.hidden = true;
    $empty.classList.remove('empty--in');
  }
}

function flashHeadline(text) {
  if (!$headline) return;
  const original = $headline.innerHTML;
  $headline.textContent = text;
  setTimeout(() => { $headline.innerHTML = original; }, 1800);
}

// ---------- Mutations (optimistic) ----------

async function addTask(text) {
  const trimmed = text.trim();
  if (!trimmed || !currentUser) return;

  const tempId = 'tmp_' + uid();
  const position = nextTopPosition();
  const optimistic = {
    id: tempId,
    user_id: currentUser.id,
    text: trimmed,
    solution: null,
    done: false,
    position,
    _temp: true,
  };
  state.ideas.unshift(optimistic);
  justAddedId = tempId;
  render();

  if (!REDUCED_MOTION && $headline) {
    $headline.classList.remove('wiggle');
    void $headline.offsetWidth;
    $headline.classList.add('wiggle');
  }

  try {
    const created = await Store.createIdea(currentUser.id, {
      text: trimmed,
      solution: null,
      done: false,
      position,
    });
    const idx = state.ideas.findIndex((x) => x.id === tempId);
    if (idx >= 0) state.ideas[idx] = created;
    sortIdeas();
    render();
  } catch (e) {
    console.error('addTask failed:', e);
    state.ideas = state.ideas.filter((x) => x.id !== tempId);
    render();
    flashHeadline('Failed to save');
  }
}

async function toggleTask(id, sourceEl) {
  const t = state.ideas.find((x) => x.id === id);
  if (!t || t._temp) return;
  const wasDone = t.done;
  t.done = !wasDone;
  render();

  if (!wasDone && !REDUCED_MOTION && sourceEl) {
    const r = sourceEl.getBoundingClientRect();
    confetti({
      particleCount: 32, spread: 65, startVelocity: 32, ticks: 90,
      gravity: 0.9, scalar: 0.85,
      origin: { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight },
      colors: PALETTE, disableForReducedMotion: true,
    });
  }

  const row = sourceEl?.closest('.task');
  const finalize = () => {
    render();
    const open = state.ideas.filter((x) => !x.done).length;
    if (state.ideas.length > 0 && open === 0) {
      updateEmpty(true);
      if (!REDUCED_MOTION) fireBigConfetti();
    }
  };
  if (!wasDone && row && !REDUCED_MOTION) {
    row.classList.add('task--completing', 'task--done');
    setTimeout(finalize, 550);
  } else {
    finalize();
  }

  try {
    await Store.updateIdea(id, { done: t.done });
  } catch (e) {
    console.error('toggleTask failed:', e);
    t.done = wasDone;
    render();
    flashHeadline('Failed to save');
  }
}

function fireBigConfetti() {
  const burst = (originX) =>
    confetti({
      particleCount: 90, spread: 95, startVelocity: 50, ticks: 160,
      gravity: 0.85, scalar: 1.05,
      origin: { x: originX, y: 0.65 },
      colors: PALETTE, disableForReducedMotion: true,
    });
  burst(0.25);
  setTimeout(() => burst(0.75), 120);
  setTimeout(() => burst(0.5), 240);
}

async function deleteTask(id, sourceEl) {
  const idx = state.ideas.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const removed = state.ideas[idx];

  const row = sourceEl?.closest('.task');
  const remove = () => {
    state.ideas = state.ideas.filter((t) => t.id !== id);
    render();
  };
  if (row && !REDUCED_MOTION) {
    row.classList.add('task--leaving');
    setTimeout(remove, 300);
  } else {
    remove();
  }

  if (removed._temp) return;

  try {
    await Store.deleteIdea(id);
  } catch (e) {
    console.error('deleteTask failed:', e);
    state.ideas.splice(idx, 0, removed);
    sortIdeas();
    render();
    flashHeadline('Failed to delete');
  }
}

async function persistText(id, newText) {
  const idea = state.ideas.find((x) => x.id === id);
  if (!idea || idea._temp) return;
  if (idea.text === newText) return;
  const prev = idea.text;
  idea.text = newText;
  try {
    await Store.updateIdea(id, { text: newText });
  } catch (e) {
    console.error('persistText failed:', e);
    idea.text = prev;
    render();
    flashHeadline('Failed to save');
  }
}

async function persistSolution(id, newSolution) {
  const idea = state.ideas.find((x) => x.id === id);
  if (!idea || idea._temp) return;
  const value = newSolution && newSolution.length ? newSolution : null;
  if (idea.solution === value) return;
  const prev = idea.solution;
  idea.solution = value;
  if (!value) render();
  try {
    await Store.updateIdea(id, { solution: value });
  } catch (e) {
    console.error('persistSolution failed:', e);
    idea.solution = prev;
    render();
    flashHeadline('Failed to save');
  }
}

// ---------- Events ----------

$form.addEventListener('submit', (e) => {
  e.preventDefault();
  addTask($input.value);
  $input.value = '';
  $input.focus();
});

$list.addEventListener('click', (e) => {
  const check = e.target.closest('.task__check');
  if (check) {
    const li = check.closest('.task');
    if (li) toggleTask(li.dataset.id, check);
    return;
  }
  const del = e.target.closest('.task__del');
  if (del) {
    const li = del.closest('.task');
    if (li) deleteTask(li.dataset.id, del);
    return;
  }
  const ideaSolution = e.target.closest('.idea__solution');
  if (ideaSolution) {
    const textNode = ideaSolution.querySelector('.solution__text');
    if (textNode && e.target !== textNode) {
      textNode.focus();
      if (typeof window.getSelection !== 'undefined' && typeof document.createRange !== 'undefined') {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }
  const addSol = e.target.closest('.idea__add-solution');
  if (addSol) {
    const li = addSol.closest('.task');
    if (li) {
      addingSolutionId = li.dataset.id;
      render();
      const formInput = $list.querySelector(`.idea__solution-form[data-id="${addingSolutionId}"] input`);
      if (formInput) formInput.focus();
    }
    return;
  }
  const cancelSol = e.target.closest('.idea__solution-cancel');
  if (cancelSol) {
    addingSolutionId = null;
    render();
    return;
  }
});

$list.addEventListener('submit', (e) => {
  const form = e.target.closest('.idea__solution-form');
  if (form) {
    e.preventDefault();
    const input = form.querySelector('.idea__solution-input');
    const ideaId = form.dataset.id;
    const solution = input.value.trim();
    if (solution) {
      const idea = state.ideas.find((x) => x.id === ideaId);
      if (idea) {
        idea.solution = solution;
        addingSolutionId = null;
        render();
        persistSolution(ideaId, solution);
      }
    }
  }
});

$list.addEventListener('focusout', (e) => {
  const taskText = e.target.closest('.task__text');
  if (taskText) {
    const li = taskText.closest('.task');
    if (li) {
      const id = li.dataset.id;
      const idea = state.ideas.find((x) => x.id === id);
      const newText = (taskText.textContent || '').trim() || idea?.text || '';
      taskText.textContent = newText;
      persistText(id, newText);
    }
  }
  const solText = e.target.closest('.solution__text');
  if (solText) {
    const li = solText.closest('.task');
    if (li) {
      const id = li.dataset.id;
      const newSolution = (solText.textContent || '').trim();
      persistSolution(id, newSolution);
    }
  }
});

$list.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    const editable = e.target.closest('[contenteditable="true"]');
    if (editable) {
      e.preventDefault();
      editable.blur();
    }
  }
});

// ---------- Drag-to-reorder ----------

let drag = null;

$list.addEventListener('pointerdown', (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  const handle = e.target.closest('.task__handle');
  if (!handle) return;
  const row = handle.closest('.task');
  if (!row) return;
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  drag = { pointerId: e.pointerId, handle, row, startY: e.clientY };
  row.classList.add('task--dragging');
});

$list.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dy = e.clientY - drag.startY;
  drag.row.style.transform = `translateY(${dy}px) scale(1.03)`;

  const draggedRect = drag.row.getBoundingClientRect();
  const draggedMid = draggedRect.top + draggedRect.height / 2;
  const siblings = [...$list.children].filter((c) => c !== drag.row);
  for (const sib of siblings) {
    const r = sib.getBoundingClientRect();
    const sibMid = r.top + r.height / 2;
    const isBefore = !!(drag.row.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_PRECEDING);
    const isAfter  = !!(drag.row.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (dy < 0 && isBefore && draggedMid < sibMid) {
      flipSwap(sib, () => $list.insertBefore(drag.row, sib));
      adjustStartY(e.clientY, draggedRect.top);
      break;
    }
    if (dy > 0 && isAfter && draggedMid > sibMid) {
      flipSwap(sib, () => $list.insertBefore(drag.row, sib.nextSibling));
      adjustStartY(e.clientY, draggedRect.top);
      break;
    }
  }
});

function flipSwap(sib, mutate) {
  const before = sib.getBoundingClientRect();
  mutate();
  const after = sib.getBoundingClientRect();
  const flipDy = before.top - after.top;
  if (flipDy === 0 || REDUCED_MOTION) return;
  sib.style.transition = 'none';
  sib.style.transform = `translateY(${flipDy}px)`;
  requestAnimationFrame(() => {
    sib.style.transition = 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)';
    sib.style.transform = '';
    setTimeout(() => { sib.style.transition = ''; sib.style.transform = ''; }, 240);
  });
}

function adjustStartY(clientY, prevVisualTop) {
  const newRect = drag.row.getBoundingClientRect();
  const shift = newRect.top - prevVisualTop;
  drag.startY += shift;
  drag.row.style.transform = `translateY(${clientY - drag.startY}px) scale(1.03)`;
}

async function endDrag() {
  if (!drag) return;
  drag.row.classList.remove('task--dragging');
  drag.row.style.transform = '';

  const newOrder = [...$list.children].map((li) => li.dataset.id);
  const prevOrder = state.ideas.map((i) => i.id);
  state.ideas.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
  state.ideas.forEach((i, idx) => { i.position = (idx + 1) * POSITION_GAP; });

  drag = null;

  const persistableIds = newOrder.filter((id) => {
    const i = state.ideas.find((x) => x.id === id);
    return i && !i._temp;
  });
  if (persistableIds.join(',') === prevOrder.join(',')) return;

  try {
    await Store.reorderIdeas(persistableIds);
  } catch (e) {
    console.error('reorder failed:', e);
    flashHeadline('Failed to save order');
  }
}

$list.addEventListener('pointerup',     (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(); });
$list.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(); });

// ---------- Mouse parallax ----------

if (!REDUCED_MOTION) {
  const blobs = [...document.querySelectorAll('.blob')];
  let targetX = 0, targetY = 0, curX = 0, curY = 0;
  window.addEventListener('mousemove', (e) => {
    targetX = (e.clientX / innerWidth - 0.5) * 2;
    targetY = (e.clientY / innerHeight - 0.5) * 2;
  });
  function tick(ts) {
    curX += (targetX - curX) * 0.04;
    curY += (targetY - curY) * 0.04;
    const t = ts / 1000;
    blobs.forEach((b, i) => {
      const phase = t * 0.12 + i * 1.7;
      const driftX = Math.sin(phase) * 60;
      const driftY = Math.cos(phase * 0.7) * 45;
      const factor = 28 * (i + 1);
      b.style.transform = `translate(${driftX + curX * factor}px, ${driftY + curY * factor}px)`;
    });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------- Boot ----------

boot();
