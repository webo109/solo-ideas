import { isConfigured } from './src/supabase.js';
import * as Auth from './src/auth.js';
import * as Api from './src/api.js';
import * as AI from './src/ai.js';
import { subscribeToProjects, subscribeToItems } from './src/realtime.js';
import { migrateLocalStorageIfNeeded } from './src/migrate.js';
import { renderMarkdown } from './src/markdown.js';

// ====================== Constants ======================

const PALETTE = ['#7f00ff', '#e100ff', '#00d2ff', '#ffffff'];
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const POSITION_GAP = 1000;
const PROJECT_COLORS = ['#7f00ff', '#e100ff', '#00d2ff', '#5cd6c0', '#ffd23f', '#ff5d8f', '#f97316', '#34d399'];

const KIND_LABEL = { note: 'Notes', idea: 'Ideas', task: 'Tasks', doc: 'Docs' };
const KIND_PLACEHOLDER = {
  note: 'Quick note…',
  idea: 'Describe a problem or idea…',
  task: 'What needs to be done?',
  doc:  'New document — first line becomes the title…',
};
const KIND_EMPTY = {
  note: 'No notes yet.',
  idea: 'No ideas yet — log a problem and a possible solution.',
  task: 'No tasks yet — what needs doing?',
  doc:  'No docs yet — long-form notes go here.',
};

const SEED_PROJECTS = [
  { name: 'Inbox',           color: '#7f00ff' },
  { name: 'Sakni',           color: '#00d2ff' },
  { name: 'Solo',            color: '#e100ff' },
  { name: 'Daily / Life',    color: '#5cd6c0' },
  { name: 'Coffee Shop App', color: '#7f00ff' },
  { name: 'Uni',             color: '#ffd23f' },
  { name: 'Learning',        color: '#ff5d8f' },
];

const AI_SCHEDULE_LABEL = {
  off: 'Off', manual: 'Manual', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
};

// ====================== DOM refs ======================

const $  = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const $configErr   = $('config-error');
const $appShell    = $('app-shell');
const $auth        = $('auth');
const $authForm    = $('auth-form');
const $authEmail   = $('auth-email');
const $authStatus  = $('auth-status');
const $signOut     = $('sign-out');
const $date        = $('date');
const $streak      = $('streak');
const $streakCount = $('streak-count');
const $chatBtn     = $('chat-btn');

const $projList   = $('proj-list');
const $newProjBtn = $('new-project-btn');

const $panelHeader = $('panel-header');
const $panelDot    = $('panel-dot');
const $panelTitle  = $('panel-title');
const $renameBtn   = $('rename-btn');
const $deleteBtn   = $('delete-btn');
const $panelMeta   = $('panel-meta');
const $banner      = $('banner');
const $aiBanner    = $('ai-banner');
const $viewToggle  = $('view-toggle');
const $kindTabs    = $('kind-tabs');
const $form        = $('composer');
const $input       = $('input');
const $list        = $('list');
const $empty       = $('empty');
const $emptyText   = $('empty-text');
const $emptyHint   = $('empty-hint');
const $welcome     = $('welcome');

const $projModal       = $('proj-modal');
const $projForm        = $('proj-form');
const $projName        = $('proj-name');
const $colorRow        = $('color-row');
const $projModalTitle  = $('proj-modal-title');
const $projSave        = $('proj-save');
const $projAi          = $('proj-ai');

const $confirmModal = $('confirm-modal');
const $confirmTitle = $('confirm-title');
const $confirmLede  = $('confirm-lede');
const $confirmOk    = $('confirm-ok');

const $reader         = $('reader-modal');
const $readerTitle    = $('reader-title');
const $readerSub      = $('reader-sub');
const $readerBody     = $('reader-body');
const $readerEditPane = $('reader-edit');
const $readerTextarea = $('reader-textarea');
const $readerEditBtn  = $('reader-edit-btn');
const $readerSaveBtn  = $('reader-save-btn');
const $readerCancelBtn= $('reader-cancel-btn');
const $readerToggle   = $('reader-toggle');
const $readerOrganize = $('reader-organize');
const $readerArchive  = $('reader-archive');

const $chatPanel    = $('chat-panel');
const $chatFab      = $('chat-fab');
const $chatClose    = $('chat-close');
const $chatThreadSel= $('chat-thread-sel');
const $chatNewBtn   = $('chat-new-btn');
const $chatMessages = $('chat-messages');
const $chatForm     = $('chat-form');
const $chatInput    = $('chat-input');

// ====================== State ======================

const state = {
  user: null,
  projects: [],
  items: [],
  currentProjectId: null,
  currentKind: 'note',
  currentView: 'active',
  unsubProjects: null,
  unsubItems: null,
  justAddedId: null,
  editingProjectId: null,
  pendingProjectColor: PROJECT_COLORS[0],
  pendingProjectAI: false,
  confirmAction: null,

  // Reader
  readerItemId: null,
  readerEditing: false,
  readerShowingOriginal: false,

  // AI
  aiBusy: new Set(),

  // Chat
  chatOpen: false,
  chatThreads: [],
  chatThreadId: null,
  chatMessages: [],
  chatStreaming: false,
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

$date.textContent = new Date().toLocaleDateString(undefined, {
  weekday: 'long', month: 'long', day: 'numeric',
});

// ====================== Boot ======================

async function boot() {
  if (!isConfigured()) {
    $configErr.hidden = false;
    $appShell.hidden = true;
    $auth.hidden = true;
    return;
  }
  $configErr.hidden = true;

  const session = await Auth.getSession();
  if (session?.user) await onSignedIn(session.user);
  else showSignIn();

  Auth.onAuthChange(async (s) => {
    if (s?.user && (!state.user || state.user.id !== s.user.id)) await onSignedIn(s.user);
    else if (!s && state.user) onSignedOut();
  });
}

async function onSignedIn(user) {
  state.user = user;
  $auth.hidden = true;
  $appShell.hidden = false;
  if ($chatFab) $chatFab.hidden = false;

  try {
    await migrateLocalStorageIfNeeded(user.id);
    state.projects = await Api.listProjects(user.id);
    state.items    = await Api.listItems(user.id);

    if (state.projects.length === 0) {
      await seedProjects(user.id);
      state.projects = await Api.listProjects(user.id);
    }

    state.currentProjectId =
      localStorage.getItem('solo.lastProjectId') ||
      state.projects[0]?.id || null;
    if (!state.projects.find((p) => p.id === state.currentProjectId)) {
      state.currentProjectId = state.projects[0]?.id || null;
    }

    state.unsubProjects = subscribeToProjects(user.id, {
      onInsert: (p) => { if (!state.projects.find(x => x.id === p.id)) { state.projects.push(p); state.projects.sort((a,b)=>a.position-b.position); renderSidebar(); } },
      onUpdate: (p) => { const i = state.projects.findIndex(x=>x.id===p.id); if (i>=0) state.projects[i]=p; state.projects.sort((a,b)=>a.position-b.position); renderAll(); },
      onDelete: (p) => { state.projects = state.projects.filter(x=>x.id!==p.id); if (state.currentProjectId===p.id) state.currentProjectId = state.projects[0]?.id || null; renderAll(); },
    });
    state.unsubItems = subscribeToItems(user.id, {
      onInsert: (it) => { if (!state.items.find(x=>x.id===it.id)) { state.items.push(it); renderMain(); } },
      onUpdate: (it) => { const i = state.items.findIndex(x=>x.id===it.id); if (i>=0) state.items[i]=it; else state.items.push(it); renderMain(); },
      onDelete: (it) => { state.items = state.items.filter(x=>x.id!==it.id); renderMain(); },
    });

    renderAll();
    startScheduler();
  } catch (e) {
    console.error('Boot failed:', e);
    aiBannerShow('Could not load data. Run migrations 0003 + 0004 in Supabase, then refresh.');
  }
}

async function seedProjects(userId) {
  for (let i = 0; i < SEED_PROJECTS.length; i++) {
    const p = SEED_PROJECTS[i];
    try { await Api.createProject(userId, { ...p, position: (i + 1) * POSITION_GAP }); }
    catch (e) { console.error('Seed failed for', p, e); }
  }
}

function onSignedOut() {
  state.unsubProjects?.();
  state.unsubItems?.();
  stopScheduler();
  state.user = null;
  state.projects = [];
  state.items = [];
  state.currentProjectId = null;
  $appShell.hidden = true;
  if ($chatFab) $chatFab.hidden = true;
  showSignIn();
}

function showSignIn() {
  $auth.hidden = false;
  $appShell.hidden = true;
  $authStatus.textContent = '';
  setTimeout(() => $authEmail.focus(), 0);
}

$authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $authEmail.value.trim();
  if (!email) return;
  $authStatus.className = 'auth__status';
  $authStatus.textContent = 'Sending…';
  try {
    await Auth.sendMagicLink(email);
    $authStatus.classList.add('auth__status--ok');
    $authStatus.textContent = `Check ${email} for a sign-in link.`;
  } catch (err) {
    console.error(err);
    $authStatus.classList.add('auth__status--err');
    $authStatus.textContent = err?.message || 'Could not send link.';
  }
});
$signOut.addEventListener('click', () => Auth.signOut());

// ====================== AI banner ======================

function aiBannerShow(text, kind = 'err') {
  if (!$aiBanner) return;
  $aiBanner.hidden = false;
  $aiBanner.className = `ai-banner ai-banner--${kind}`;
  $aiBanner.textContent = text;
  clearTimeout(aiBannerShow._t);
  aiBannerShow._t = setTimeout(() => { $aiBanner.hidden = true; }, 6000);
}

// ====================== Render ======================

// Defer list re-renders while the user is editing a list field or dragging,
// so realtime UPDATEs don't blow away in-progress work.
let _interacting = false;
let _renderQueued = false;
function isInteracting() {
  if (_interacting) return true;
  if (drag) return true;
  const ae = document.activeElement;
  return !!(ae && ae.closest && ae.closest('#list [contenteditable="true"], .item__solution-form'));
}
function flushQueuedRender() {
  if (_renderQueued) { _renderQueued = false; renderMain(); }
}

function renderAll() { renderSidebar(); renderMain(); renderStreak(); }

function renderSidebar() {
  if (projDrag) return;  // don't blow away the row mid-drag
  $projList.innerHTML = '';
  for (const p of state.projects) {
    const li = document.createElement('li');
    li.className = 'proj' + (p.id === state.currentProjectId ? ' proj--active' : '');
    li.dataset.id = p.id;
    const count = state.items.filter((it) => it.project_id === p.id && it.status !== 'done').length;
    const aiBadge = p.ai_enabled ? '<span class="proj-ai" title="AI on">🤖</span>' : '';
    li.innerHTML = `
      <button class="proj-handle" type="button" aria-label="Drag to reorder" tabindex="-1">⋮⋮</button>
      <span class="proj-dot" style="background:${escapeHtml(p.color)}"></span>
      <span class="proj-name">${escapeHtml(p.name)}</span>
      ${aiBadge}
      <span class="proj-count">${count}</span>
    `;
    $projList.appendChild(li);
  }
}

function renderMain() {
  if (isInteracting()) { _renderQueued = true; return; }
  const proj = currentProject();
  if (!proj) {
    $panelHeader.hidden = true; $banner.hidden = true; $viewToggle.hidden = true;
    $kindTabs.hidden = true; $form.hidden = true; $list.hidden = true; $empty.hidden = true;
    $welcome.hidden = false;
    return;
  }
  $welcome.hidden = true;

  $panelHeader.hidden = false;
  $panelDot.style.background = proj.color;
  $panelTitle.textContent = proj.name;

  const projItems = state.items.filter((it) => it.project_id === proj.id);
  const open = projItems.filter((it) => it.status !== 'done').length;
  const done = projItems.filter((it) => it.status === 'done').length;
  $panelMeta.textContent = `${open} open · ${done} archived${proj.ai_enabled ? ' · AI on' : ''}`;

  $viewToggle.hidden = false;
  $kindTabs.hidden = false;
  $$('.vt-btn', $viewToggle).forEach((b) => b.classList.toggle('active', b.dataset.view === state.currentView));
  $$('.kind-tab', $kindTabs).forEach((b) => b.classList.toggle('active', b.dataset.kind === state.currentKind));

  for (const kind of ['note', 'idea', 'task', 'doc']) {
    const c = projItems.filter((it) =>
      it.kind === kind &&
      (state.currentView === 'active' ? it.status !== 'done' : it.status === 'done')
    ).length;
    const el = $kindTabs.querySelector(`[data-kind-count="${kind}"]`);
    if (el) el.textContent = c;
  }

  renderBanner(projItems);

  $form.hidden = state.currentView !== 'active';
  $input.placeholder = KIND_PLACEHOLDER[state.currentKind] || 'Capture something…';

  let filtered = projItems
    .filter((it) =>
      it.kind === state.currentKind &&
      (state.currentView === 'active' ? it.status !== 'done' : it.status === 'done'));

  // Sorting: docs sort pinned-first then most-recent edited; archive by done_at desc; others by position.
  if (state.currentView === 'archive') {
    filtered.sort((a, b) => (new Date(b.done_at || 0) - new Date(a.done_at || 0)));
  } else if (state.currentKind === 'doc') {
    filtered.sort((a, b) => {
      if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return (new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    });
  } else {
    filtered.sort((a, b) => a.position - b.position);
  }

  if (filtered.length === 0) {
    $list.hidden = true; $empty.hidden = false;
    $emptyText.textContent = state.currentView === 'archive'
      ? `No archived ${KIND_LABEL[state.currentKind].toLowerCase()}.`
      : KIND_EMPTY[state.currentKind];
    $emptyHint.textContent = state.currentView === 'active' && state.currentKind !== 'doc'
      ? 'Tap the circle to advance: open → today → archived.'
      : (state.currentKind === 'doc' && state.currentView === 'active'
          ? 'First line of your markdown becomes the title. Click any doc to open the reader.'
          : '');
  } else {
    $empty.hidden = true; $list.hidden = false;
    $list.innerHTML = '';
    for (const it of filtered) $list.appendChild(itemNode(it, proj));
  }
}

function itemNode(it, proj) {
  if (it.kind === 'doc') return docRowNode(it, proj);
  return regularItemNode(it, proj);
}

function regularItemNode(it, proj) {
  const li = document.createElement('li');
  li.className = 'item' + (it.id === state.justAddedId && !REDUCED_MOTION ? ' item--entering' : '');
  li.classList.add(`item--${it.kind}`);
  if (it.status === 'today') li.classList.add('item--today');
  if (it.status === 'done')  li.classList.add('item--done');
  li.dataset.id = it.id;

  const isArchive = state.currentView === 'archive';
  if (isArchive) li.classList.add('item--archive');
  const showSolution = it.kind === 'idea';
  const aiOn = !!proj?.ai_enabled;
  const sched = it.ai_schedule || 'off';
  const aiBusy = state.aiBusy.has(it.id);

  const aiChip = aiOn && !isArchive && (it.kind === 'idea' || it.kind === 'task')
    ? `<button class="ai-chip ${sched !== 'off' ? 'ai-chip--on' : ''} ${aiBusy ? 'ai-chip--busy' : ''}" type="button" data-action="ai-menu" title="AI: ${AI_SCHEDULE_LABEL[sched]}">${aiBusy ? '…' : '🤖'}<span class="ai-chip__sched">${sched === 'off' ? '' : AI_SCHEDULE_LABEL[sched]}</span></button>`
    : '';

  const suggestionsBlock = it.ai_suggestions
    ? `<details class="item__suggestions" open>
         <summary>✨ AI suggestions${it.ai_last_run_at ? ' · ' + relTime(it.ai_last_run_at) : ''}<span class="suggestions__hint">click any suggestion to edit</span></summary>
         <div class="suggestions__body" data-md data-suggestions contenteditable="${isArchive ? 'false' : 'true'}" spellcheck="false">${renderMarkdown(it.ai_suggestions)}</div>
         ${isArchive ? '' : `<div class="suggestions__actions">
           <button class="btn-sm" type="button" data-action="suggest-create-task" title="Create a new task in this project from the (edited) text">+ Add as task</button>
           ${it.kind === 'idea' ? '<button class="btn-sm" type="button" data-action="suggest-apply-solution" title="Replace this idea\'s solution with the (edited) text">Use as solution</button>' : ''}
           <button class="btn-sm icon-btn--danger" type="button" data-action="suggest-clear" title="Remove the AI suggestion block">Clear</button>
         </div>`}
       </details>`
    : '';

  li.innerHTML = `
    ${isArchive ? '' : '<button class="item__handle" type="button" aria-label="Drag to reorder">⋮⋮</button>'}
    <button class="item__check item__check--${it.status}" type="button" aria-label="Cycle status" title="open → today → archive">
      <span class="item__check-mark"></span>
    </button>
    <div class="item__body">
      <div class="item__text" data-md contenteditable="${isArchive ? 'false' : 'true'}" spellcheck="false">${escapeHtml(it.text)}</div>
      ${showSolution ? renderSolutionBlock(it) : ''}
      ${suggestionsBlock}
    </div>
    <div class="item__actions">
      ${aiChip}
      ${isArchive
        ? `<button class="icon-btn icon-btn--small" data-action="restore" title="Restore">↶</button>
           <button class="icon-btn icon-btn--small icon-btn--danger" data-action="delete" title="Delete forever">×</button>`
        : `<button class="icon-btn icon-btn--small icon-btn--ghost" data-action="delete" title="Delete">×</button>`}
    </div>
  `;
  return li;
}

function docRowNode(it, proj) {
  const li = document.createElement('li');
  li.className = 'doc' + (it.id === state.justAddedId && !REDUCED_MOTION ? ' doc--entering' : '');
  if (it.pinned) li.classList.add('doc--pinned');
  if (it.status === 'done') li.classList.add('doc--archived');
  li.dataset.id = it.id;

  const isArchive = state.currentView === 'archive';
  const source = it.organized_text || it.text;
  const { title } = AI.splitTitleBody(source);
  const preview = AI.previewFromMarkdown(source.replace(/^#{1,6}\s+.*\n?/, ''), 180);
  const wc = AI.wordCount(source);

  li.innerHTML = `
    ${isArchive ? '' : '<button class="doc__handle" type="button" aria-label="Drag" tabindex="-1">⋮⋮</button>'}
    <button class="doc__pin ${it.pinned ? 'doc__pin--on' : ''}" type="button"
      data-action="${isArchive ? 'restore' : 'pin'}"
      title="${isArchive ? 'Restore' : (it.pinned ? 'Unpin' : 'Pin')}">${isArchive ? '↶' : '📌'}</button>
    <div class="doc__body" data-action="open-reader">
      <h4 class="doc__title">${escapeHtml(title)}</h4>
      <p class="doc__preview">${escapeHtml(preview)}</p>
      <div class="doc__meta">
        <span><strong>edited</strong> ${relTime(it.updated_at)}</span>
        <span><strong>${wc}</strong> words</span>
        ${it.ai_organized_at ? '<span class="doc__ai-tag">✨ organized</span>' : ''}
        ${proj?.ai_enabled ? '' : '<span class="doc__off-tag">AI off</span>'}
      </div>
    </div>
    <button class="icon-btn icon-btn--small icon-btn--danger" data-action="delete"
      title="${isArchive ? 'Delete forever' : 'Delete'}">×</button>
  `;
  return li;
}

function renderSolutionBlock(it) {
  if (it.solution) {
    return `<div class="item__solution">
      <div class="item__solution-label">Solution</div>
      <div class="solution__text" data-md contenteditable="true" spellcheck="false">${escapeHtml(it.solution)}</div>
    </div>`;
  }
  return `<button class="item__add-solution" type="button" data-action="add-solution">+ Add Solution</button>`;
}

function relTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return Math.round(ms/60_000) + 'm ago';
  if (ms < 86_400_000) return Math.round(ms/3_600_000) + 'h ago';
  if (ms < 7*86_400_000) return Math.round(ms/86_400_000) + 'd ago';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderBanner(projItems) {
  if (state.currentView !== 'active') { $banner.hidden = true; return; }
  const open = projItems.filter((it) => it.status === 'open').length;
  const today = projItems.filter((it) => it.status === 'today').length;
  const todayDone = projItems.filter((it) => it.status === 'done' && isSameDay(it.done_at)).length;
  if (open === 0 && today === 0 && todayDone === 0) { $banner.hidden = true; return; }
  let parts = [];
  if (today > 0) parts.push(`<strong>${today} in progress today</strong>`);
  if (open > 0)  parts.push(`${open} open`);
  if (todayDone > 0) parts.push(`<strong style="color:#5cd6c0">${todayDone} archived today</strong>`);
  $banner.hidden = false;
  $banner.innerHTML = parts.join(' · ');
}

function renderStreak() {
  const now = new Date();
  const count = state.items.filter((it) =>
    it.status === 'done' && it.done_at && (now - new Date(it.done_at)) / 86_400_000 < 7
  ).length;
  if (count > 0) { $streak.hidden = false; $streakCount.textContent = count; }
  else $streak.hidden = true;
}

function isSameDay(ts) {
  if (!ts) return false;
  const d = new Date(ts), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function currentProject() { return state.projects.find((p) => p.id === state.currentProjectId); }
function getItem(id) { return state.items.find((x) => x.id === id); }

// ====================== Sidebar ======================

$projList.addEventListener('click', (e) => {
  if (e.target.closest('.proj-handle')) return;  // handle clicks are for drag, not selection
  const li = e.target.closest('.proj');
  if (!li) return;
  state.currentProjectId = li.dataset.id;
  localStorage.setItem('solo.lastProjectId', state.currentProjectId);
  renderAll();
});

// ---- project drag-to-reorder (sidebar) ----
let projDrag = null;
$projList.addEventListener('pointerdown', (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  const handle = e.target.closest('.proj-handle');
  if (!handle) return;
  const row = handle.closest('.proj');
  if (!row) return;
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  projDrag = { pointerId: e.pointerId, handle, row, startY: e.clientY };
  row.classList.add('proj--dragging');
});
$projList.addEventListener('pointermove', (e) => {
  if (!projDrag || e.pointerId !== projDrag.pointerId) return;
  const dy = e.clientY - projDrag.startY;
  projDrag.row.style.transform = `translateY(${dy}px) scale(1.02)`;
  const draggedRect = projDrag.row.getBoundingClientRect();
  const draggedMid = draggedRect.top + draggedRect.height / 2;
  const sibs = [...$projList.children].filter((c) => c !== projDrag.row);
  for (const sib of sibs) {
    const r = sib.getBoundingClientRect();
    const sibMid = r.top + r.height / 2;
    const isBefore = !!(projDrag.row.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_PRECEDING);
    const isAfter  = !!(projDrag.row.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (dy < 0 && isBefore && draggedMid < sibMid) {
      $projList.insertBefore(projDrag.row, sib);
      const newRect = projDrag.row.getBoundingClientRect();
      projDrag.startY += newRect.top - draggedRect.top;
      projDrag.row.style.transform = `translateY(${e.clientY - projDrag.startY}px) scale(1.02)`;
      break;
    }
    if (dy > 0 && isAfter && draggedMid > sibMid) {
      $projList.insertBefore(projDrag.row, sib.nextSibling);
      const newRect = projDrag.row.getBoundingClientRect();
      projDrag.startY += newRect.top - draggedRect.top;
      projDrag.row.style.transform = `translateY(${e.clientY - projDrag.startY}px) scale(1.02)`;
      break;
    }
  }
});
async function endProjDrag() {
  if (!projDrag) return;
  projDrag.row.classList.remove('proj--dragging');
  projDrag.row.style.transform = '';
  const newOrder = [...$projList.children].map((li) => li.dataset.id);
  projDrag = null;
  newOrder.forEach((id, i) => {
    const p = state.projects.find((x) => x.id === id);
    if (p) p.position = (i + 1) * POSITION_GAP;
  });
  state.projects.sort((a, b) => a.position - b.position);
  try { await Api.reorderProjects(newOrder); }
  catch (e) { console.error('project reorder failed:', e); }
  renderSidebar();
}
$projList.addEventListener('pointerup',     (e) => { if (projDrag && e.pointerId === projDrag.pointerId) endProjDrag(); });
$projList.addEventListener('pointercancel', (e) => { if (projDrag && e.pointerId === projDrag.pointerId) endProjDrag(); });
$newProjBtn.addEventListener('click', () => openProjectModal(null));
$renameBtn.addEventListener('click', () => openProjectModal(state.currentProjectId));
$deleteBtn.addEventListener('click', () => onDeleteProject());

// ====================== Tabs / view ======================

$viewToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.vt-btn');
  if (!btn) return;
  state.currentView = btn.dataset.view;
  renderMain();
});
$kindTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.kind-tab');
  if (!btn) return;
  state.currentKind = btn.dataset.kind;
  renderMain();
});

// ====================== Composer ======================

function autoGrow() {
  $input.style.height = 'auto';
  $input.style.height = Math.min($input.scrollHeight, 240) + 'px';
}

$form.addEventListener('submit', (e) => {
  e.preventDefault();
  addItem($input.value);
});
$input.addEventListener('input', autoGrow);
$input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (typeof $form.requestSubmit === 'function') $form.requestSubmit();
    else $form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }
});

async function addItem(text) {
  const trimmed = text.trim();
  const proj = currentProject();
  if (!trimmed || !state.user || !proj) return;

  const projItems = state.items.filter((it) => it.project_id === proj.id && it.kind === state.currentKind);
  const minPos = projItems.length ? Math.min(...projItems.map((it) => it.position)) : POSITION_GAP * 2;
  const newPos = minPos - POSITION_GAP;

  const tempId = 'tmp_' + uid();
  const optimistic = {
    id: tempId, user_id: state.user.id, project_id: proj.id,
    kind: state.currentKind, text: trimmed, solution: null,
    status: 'open', position: newPos, done_at: null,
    pinned: false, organized_text: null, ai_organized_at: null,
    ai_schedule: 'off', ai_last_run_at: null, ai_suggestions: null,
    updated_at: new Date().toISOString(), _temp: true,
  };
  state.items.push(optimistic);
  state.justAddedId = tempId;
  $input.value = ''; autoGrow(); $input.focus();
  renderMain();

  try {
    const created = await Api.createItem(state.user.id, {
      project_id: proj.id, kind: state.currentKind, text: trimmed,
      status: 'open', position: newPos,
    });
    const tempIdx = state.items.findIndex((x) => x.id === tempId);
    const realIdx = state.items.findIndex((x) => x.id === created.id && !x._temp);
    if (realIdx >= 0) {
      // Realtime INSERT beat us — drop the temp, keep the realtime row.
      if (tempIdx >= 0) state.items.splice(tempIdx, 1);
    } else if (tempIdx >= 0) {
      state.items[tempIdx] = created;
    } else {
      state.items.push(created);
    }
    renderMain();

    // Auto-organize on save for docs in AI-on projects
    if (created.kind === 'doc' && proj.ai_enabled) {
      organizeItemInBackground(created.id);
    }
  } catch (e) {
    console.error('addItem failed:', e);
    state.items = state.items.filter((x) => x.id !== tempId);
    renderMain();
  }
}

// ====================== List interactions ======================

$list.addEventListener('click', async (e) => {
  const li = e.target.closest('.item, .doc');
  if (!li) return;
  const id = li.dataset.id;
  const it = getItem(id);
  if (!it || it._temp) return;

  if (e.target.closest('.item__check')) return cycleStatus(it, e.target.closest('.item__check'));

  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'open-reader')   return openReader(it);
  if (action === 'pin')           return togglePin(it);
  if (action === 'restore')       return updateItemStatus(it, 'open');
  if (action === 'delete')        return state.currentView === 'archive' ? confirmDelete(it) : confirmDelete(it);
  if (action === 'add-solution')  return startAddingSolution(li, it);
  if (action === 'ai-menu')       return openAiMenu(it, e.target.closest('.ai-chip'));
  if (action === 'suggest-create-task')   return suggestionToTask(it, li);
  if (action === 'suggest-apply-solution') return suggestionToSolution(it, li);
  if (action === 'suggest-clear')          return clearSuggestions(it);
});

// Read the current text from the suggestions block (handles in-edit textContent vs rendered HTML).
function currentSuggestionsText(li) {
  const body = li.querySelector('.suggestions__body');
  if (!body) return '';
  // If user is mid-edit, body has plain textContent. Otherwise it has rendered HTML — fall back to stored value.
  if (body.dataset.editing === '1') return (body.textContent || '').trim();
  return '';
}

async function suggestionToTask(it, li) {
  const editText = currentSuggestionsText(li);
  const text = (editText || it.ai_suggestions || '').trim();
  if (!text) return;
  const proj = state.projects.find(p => p.id === it.project_id);
  if (!proj) return;
  const projTasks = state.items.filter(x => x.project_id === proj.id && x.kind === 'task');
  const minPos = projTasks.length ? Math.min(...projTasks.map(x => x.position)) : POSITION_GAP * 2;
  try {
    const created = await Api.createItem(state.user.id, {
      project_id: proj.id, kind: 'task', text,
      status: 'open', position: minPos - POSITION_GAP,
    });
    state.items.push(created);
    aiBannerShow(`Added as task in ${proj.name}.`, 'ok');
    renderMain();
  } catch (e) {
    console.error(e);
    aiBannerShow('Could not create task: ' + (e.message || e));
  }
}

async function suggestionToSolution(it, li) {
  const editText = currentSuggestionsText(li);
  const text = (editText || it.ai_suggestions || '').trim();
  if (!text) return;
  try {
    const updated = await Api.updateItem(it.id, { solution: text });
    const i = state.items.findIndex(x => x.id === updated.id);
    if (i>=0) state.items[i] = updated;
    aiBannerShow('Applied as solution.', 'ok');
    renderMain();
  } catch (e) {
    console.error(e);
    aiBannerShow('Could not apply: ' + (e.message || e));
  }
}

async function clearSuggestions(it) {
  try {
    const updated = await Api.updateItem(it.id, { ai_suggestions: null });
    const i = state.items.findIndex(x => x.id === updated.id);
    if (i>=0) state.items[i] = updated;
    renderMain();
  } catch (e) { console.error(e); }
}

async function cycleStatus(it, sourceEl) {
  const next = it.status === 'open' ? 'today' : it.status === 'today' ? 'done' : 'open';
  if (next === 'done' && !REDUCED_MOTION && sourceEl) {
    const r = sourceEl.getBoundingClientRect();
    confetti({
      particleCount: 32, spread: 65, startVelocity: 32, ticks: 90, gravity: 0.9, scalar: 0.85,
      origin: { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight },
      colors: PALETTE, disableForReducedMotion: true,
    });
  }
  await updateItemStatus(it, next);
}

async function updateItemStatus(it, status) {
  const prev = it.status;
  it.status = status;
  renderMain();
  try {
    const updated = await Api.updateItem(it.id, { status });
    const i = state.items.findIndex((x) => x.id === updated.id);
    if (i >= 0) state.items[i] = updated;
    renderMain(); renderStreak();
  } catch (e) { console.error(e); it.status = prev; renderMain(); }
}

async function togglePin(it) {
  const next = !it.pinned;
  it.pinned = next; renderMain();
  try {
    const updated = await Api.updateItem(it.id, { pinned: next });
    const i = state.items.findIndex(x=>x.id===updated.id);
    if (i>=0) state.items[i] = updated;
    renderMain();
  } catch (e) { console.error(e); it.pinned = !next; renderMain(); }
}

function confirmDelete(it) {
  showConfirm({
    title: state.currentView === 'archive' ? `Delete forever?` : `Delete this ${it.kind}?`,
    lede: state.currentView === 'archive'
      ? 'This permanently removes the item. Cannot be undone.'
      : 'It will be permanently removed. To archive instead, click the circle until it\'s checked.',
    onConfirm: () => deleteItem(it),
  });
}
async function deleteItem(it) {
  state.items = state.items.filter((x) => x.id !== it.id);
  renderMain();
  try { await Api.deleteItem(it.id); }
  catch (e) { console.error(e); state.items.push(it); renderMain(); }
}

// Inline-editable text + solution + AI suggestions
// items + solutions render as plain text (no swap needed); suggestions render markdown so we swap on focus.
$list.addEventListener('focusin', (e) => {
  const target = e.target.closest('[data-md]');
  if (!target) return;
  if (target.dataset.editing === '1') return;
  const li = target.closest('.item, .doc');
  const it = getItem(li?.dataset.id);
  if (!it || it._temp) return;
  if (it.kind === 'doc') return; // docs use the reader

  let kind = 'text';
  if (target.dataset.suggestions !== undefined || target.closest('.suggestions__body')) kind = 'ai_suggestions';
  else if (target.classList.contains('solution__text'))                                    kind = 'solution';

  target.dataset.editing = '1';
  target.dataset.kind = kind;

  // Only suggestions need swap from rendered markdown -> raw text for editing.
  if (kind === 'ai_suggestions') {
    target.textContent = it.ai_suggestions || '';
  }
});

$list.addEventListener('focusout', async (e) => {
  const target = e.target.closest('[data-md]');
  if (!target || target.dataset.editing !== '1') return;
  const li = target.closest('.item, .doc');
  const it = getItem(li?.dataset.id);
  if (!it) { setTimeout(flushQueuedRender, 0); return; }
  const newValue = (target.textContent || '').trim();
  const kind = target.dataset.kind || 'text';
  target.dataset.editing = '0';

  const original =
    kind === 'ai_suggestions' ? (it.ai_suggestions || '') :
    kind === 'solution'       ? (it.solution || '') :
                                (it.text || '');

  // Suggestions: re-render markdown after edit (or on no-op).
  // text/solution: stay as plain text, so just keep textContent as-is.
  if (newValue === original) {
    if (kind === 'ai_suggestions') target.innerHTML = renderMarkdown(original);
    setTimeout(flushQueuedRender, 0);
    return;
  }
  if (kind === 'text' && !newValue) {
    target.textContent = it.text;
    setTimeout(flushQueuedRender, 0);
    return;
  }

  const patch =
    kind === 'ai_suggestions' ? { ai_suggestions: newValue || null } :
    kind === 'solution'       ? { solution: newValue || null } :
                                { text: newValue };
  try {
    const updated = await Api.updateItem(it.id, patch);
    const i = state.items.findIndex((x) => x.id === updated.id);
    if (i>=0) state.items[i] = updated;
    if (kind === 'ai_suggestions') {
      target.innerHTML = renderMarkdown(updated.ai_suggestions || '');
    }
    // text/solution already display the new value via textContent — nothing to do.
  } catch (err) {
    console.error(err);
    if (kind === 'ai_suggestions') target.innerHTML = renderMarkdown(original);
    else                            target.textContent = original;
  }
  finally { setTimeout(flushQueuedRender, 0); }
});
$list.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    const editable = e.target.closest('[contenteditable="true"]');
    if (editable) { e.preventDefault(); editable.blur(); }
  }
});

function startAddingSolution(li, it) {
  const body = li.querySelector('.item__body');
  if (!body) return;
  const btn = body.querySelector('.item__add-solution');
  if (!btn) return;
  btn.outerHTML = `
    <form class="item__solution-form" data-id="${escapeHtml(it.id)}">
      <input type="text" class="item__solution-input" placeholder="Type solution & hit enter…" maxlength="5000" />
      <button type="submit" class="icon-btn icon-btn--small" aria-label="Save">✓</button>
      <button type="button" class="icon-btn icon-btn--small icon-btn--ghost" data-action="cancel-solution" aria-label="Cancel">×</button>
    </form>
  `;
  body.querySelector('.item__solution-input')?.focus();
}
$list.addEventListener('submit', async (e) => {
  const f = e.target.closest('.item__solution-form');
  if (!f) return;
  e.preventDefault();
  const id = f.dataset.id;
  const it = getItem(id);
  if (!it) return;
  const value = f.querySelector('.item__solution-input').value.trim();
  if (!value) return;
  it.solution = value; renderMain();
  try {
    const updated = await Api.updateItem(id, { solution: value });
    const i = state.items.findIndex((x) => x.id === updated.id);
    if (i>=0) state.items[i] = updated;
    renderMain();
  } catch (err) { console.error(err); it.solution = null; renderMain(); }
});
$list.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="cancel-solution"]')) renderMain();
});

// ====================== Reader (Docs) ======================

function openReader(it) {
  state.readerItemId = it.id;
  state.readerEditing = false;
  state.readerShowingOriginal = false;
  renderReader();
  $reader.hidden = false;
}
function closeReader() {
  state.readerItemId = null;
  state.readerEditing = false;
  $reader.hidden = true;
}
function renderReader() {
  const it = getItem(state.readerItemId);
  if (!it) { closeReader(); return; }
  const proj = state.projects.find(p=>p.id===it.project_id);
  const shouldShowOrganized = !!it.organized_text && !state.readerShowingOriginal;
  const source = shouldShowOrganized ? it.organized_text : it.text;
  const { title } = AI.splitTitleBody(source);
  const wc = AI.wordCount(source);
  const readMin = Math.max(1, Math.round(wc / 200));

  $readerTitle.textContent = title;
  $readerSub.innerHTML = `
    <span>edited ${relTime(it.updated_at)}</span>
    <span>${wc} words</span>
    <span>~${readMin} min read</span>
    ${it.ai_organized_at ? `<span class="reader-flag">✨ AI organized ${relTime(it.ai_organized_at)}</span>` : ''}
    ${proj?.ai_enabled ? '' : '<span class="reader-flag reader-flag--off">AI off for this project</span>'}
  `;

  $readerToggle.hidden = !it.organized_text;
  $readerToggle.textContent = state.readerShowingOriginal ? 'Show organized' : 'Show original';
  $readerOrganize.hidden = !proj?.ai_enabled;
  $readerOrganize.disabled = state.aiBusy.has(it.id);
  $readerOrganize.textContent = state.aiBusy.has(it.id) ? '✨ Organizing…' : '✨ Re-organize';

  if (state.readerEditing) {
    $readerBody.hidden = true;
    $readerEditPane.hidden = false;
    $readerTextarea.value = it.text || '';
    $readerTextarea.focus();
  } else {
    $readerEditPane.hidden = true;
    $readerBody.hidden = false;
    $readerBody.innerHTML = renderMarkdown(source);
  }
}
$reader.addEventListener('click', (e) => {
  if (e.target.dataset.readerClose !== undefined) closeReader();
});
$readerEditBtn.addEventListener('click', () => { state.readerEditing = true; renderReader(); });
$readerCancelBtn.addEventListener('click', () => { state.readerEditing = false; renderReader(); });
$readerToggle.addEventListener('click', () => {
  state.readerShowingOriginal = !state.readerShowingOriginal;
  renderReader();
});
$readerOrganize.addEventListener('click', () => {
  const it = getItem(state.readerItemId);
  if (it) organizeItemInBackground(it.id);
});
$readerArchive.addEventListener('click', () => {
  const it = getItem(state.readerItemId);
  if (!it) return;
  updateItemStatus(it, 'done');
  closeReader();
});
$readerSaveBtn.addEventListener('click', async () => {
  const it = getItem(state.readerItemId);
  if (!it) return;
  const newText = $readerTextarea.value.trim();
  if (!newText) return;
  try {
    const updated = await Api.updateItem(it.id, { text: newText, organized_text: null, ai_organized_at: null });
    const i = state.items.findIndex(x=>x.id===updated.id);
    if (i>=0) state.items[i] = updated;
    state.readerEditing = false;
    state.readerShowingOriginal = false;
    renderReader(); renderMain();

    // Auto-organize after save for AI-on projects
    const proj = state.projects.find(p=>p.id===it.project_id);
    if (proj?.ai_enabled) organizeItemInBackground(it.id);
  } catch (e) { console.error(e); aiBannerShow('Could not save.'); }
});

// ====================== AI: organize ======================

async function organizeItemInBackground(itemId) {
  const it = getItem(itemId);
  if (!it) return;
  if (state.aiBusy.has(itemId)) return;
  state.aiBusy.add(itemId);
  if (state.readerItemId === itemId) renderReader();
  try {
    const organized = await AI.organizeDoc(it.text);
    const updated = await Api.updateItem(itemId, {
      organized_text: organized,
      ai_organized_at: new Date().toISOString(),
    });
    const i = state.items.findIndex(x=>x.id===itemId);
    if (i>=0) state.items[i] = updated;
    if (state.readerItemId === itemId) renderReader();
    renderMain();
  } catch (e) {
    console.error(e);
    aiBannerShow(`AI organize failed: ${e.message?.slice(0, 120) || 'unknown'}. Showing original.`);
  } finally {
    state.aiBusy.delete(itemId);
    if (state.readerItemId === itemId) renderReader();
    renderMain();
  }
}

// ====================== AI: schedule + suggest ======================

let aiMenuEl = null;

function openAiMenu(it, anchor) {
  closeAiMenu();
  const sched = it.ai_schedule || 'off';
  const menu = document.createElement('div');
  menu.className = 'ai-menu';
  menu.innerHTML = `
    <div class="ai-menu__title">AI for this ${it.kind}</div>
    ${['off','manual','daily','weekly','monthly'].map(opt =>
      `<button class="ai-menu__opt ${opt===sched?'ai-menu__opt--active':''}" type="button" data-sched="${opt}">${AI_SCHEDULE_LABEL[opt]}</button>`
    ).join('')}
    <div class="ai-menu__divider"></div>
    <button class="ai-menu__opt ai-menu__opt--run" type="button" data-action="run-now">✨ Run now</button>
  `;
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${r.bottom + 6}px`;
  menu.style.left = `${Math.max(8, r.right - 180)}px`;
  aiMenuEl = menu;
  setTimeout(() => document.addEventListener('click', onMenuOutside, { capture: true }), 0);

  menu.addEventListener('click', async (ev) => {
    const opt = ev.target.closest('.ai-menu__opt');
    if (!opt) return;
    if (opt.dataset.sched) {
      const s = opt.dataset.sched;
      try {
        const updated = await Api.updateItem(it.id, { ai_schedule: s });
        const i = state.items.findIndex(x=>x.id===updated.id);
        if (i>=0) state.items[i] = updated;
        renderMain();
      } catch (e) { console.error(e); aiBannerShow('Could not save AI schedule.'); }
    } else if (opt.dataset.action === 'run-now') {
      runSuggestNow(it);
    }
    closeAiMenu();
  });
}
function onMenuOutside(e) {
  if (!aiMenuEl) return;
  if (e.target.closest('.ai-menu')) return;
  if (e.target.closest('.ai-chip')) return;
  closeAiMenu();
}
function closeAiMenu() {
  if (aiMenuEl) { aiMenuEl.remove(); aiMenuEl = null; }
  document.removeEventListener('click', onMenuOutside, { capture: true });
}

// Browser-based AI scheduler.
// Items with ai_schedule = daily/weekly/monthly are checked when the app boots
// and again every 15 minutes while open. Due items get ai-suggest run on them,
// rate-limited to MAX_AUTO_RUNS per scan to avoid quota/cost spikes.

const SCHEDULE_INTERVAL_MS = {
  daily:   24 * 60 * 60 * 1000,
  weekly:  7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};
const MAX_AUTO_RUNS = 3;
const SCHEDULE_SCAN_MS = 15 * 60 * 1000;

function findDueItems() {
  const projAi = new Map(state.projects.map((p) => [p.id, !!p.ai_enabled]));
  const now = Date.now();
  const due = [];
  for (const it of state.items) {
    if (it._temp) continue;
    if (it.status === 'done') continue;
    if (it.kind !== 'idea' && it.kind !== 'task') continue;
    if (!projAi.get(it.project_id)) continue;
    const sched = it.ai_schedule || 'off';
    if (sched === 'off' || sched === 'manual') continue;
    const interval = SCHEDULE_INTERVAL_MS[sched];
    if (!interval) continue;
    const last = it.ai_last_run_at ? new Date(it.ai_last_run_at).getTime() : 0;
    if (now - last >= interval) due.push(it);
  }
  // Oldest-first
  due.sort((a, b) =>
    (a.ai_last_run_at ? new Date(a.ai_last_run_at).getTime() : 0) -
    (b.ai_last_run_at ? new Date(b.ai_last_run_at).getTime() : 0));
  return due.slice(0, MAX_AUTO_RUNS);
}

async function runScheduledSuggestions() {
  if (!state.user) return;
  const due = findDueItems();
  if (!due.length) return;
  for (const it of due) {
    if (state.aiBusy.has(it.id)) continue;
    try { await runSuggestNow(it); }
    catch (e) { console.error('scheduled suggest failed for', it.id, e); }
  }
}

let _schedTimer = null;
function startScheduler() {
  if (_schedTimer) return;
  // First scan after a small delay so initial render finishes first.
  setTimeout(runScheduledSuggestions, 4_000);
  _schedTimer = setInterval(runScheduledSuggestions, SCHEDULE_SCAN_MS);
}
function stopScheduler() {
  if (_schedTimer) { clearInterval(_schedTimer); _schedTimer = null; }
}

async function runSuggestNow(it) {
  if (state.aiBusy.has(it.id)) return;
  state.aiBusy.add(it.id);
  renderMain();
  try {
    const suggestions = await AI.suggestForItem({ kind: it.kind, text: it.text, solution: it.solution });
    const updated = await Api.updateItem(it.id, {
      ai_suggestions: suggestions,
      ai_last_run_at: new Date().toISOString(),
    });
    const i = state.items.findIndex(x=>x.id===updated.id);
    if (i>=0) state.items[i] = updated;
    renderMain();
  } catch (e) {
    console.error(e);
    aiBannerShow(`AI suggest failed: ${e.message?.slice(0, 120) || 'unknown'}.`);
  } finally {
    state.aiBusy.delete(it.id);
    renderMain();
  }
}

// ====================== Chat panel ======================

$chatBtn.addEventListener('click', () => openChat());
if ($chatFab) $chatFab.addEventListener('click', () => openChat());
$chatClose.addEventListener('click', () => closeChat());

async function openChat() {
  state.chatOpen = true;
  $chatPanel.hidden = false;
  document.body.classList.add('chat-open');
  try {
    state.chatThreads = await Api.listChatThreads(state.user.id);
    const today = await Api.getOrCreateTodayThread(state.user.id);
    if (!state.chatThreads.find(t => t.id === today.id)) state.chatThreads.unshift(today);
    state.chatThreadId = today.id;
    state.chatMessages = await Api.listChatMessages(today.id);
    renderChat();
    setTimeout(() => $chatInput.focus(), 50);
  } catch (e) { console.error(e); aiBannerShow('Could not open chat. Is migration 0004 run?'); closeChat(); }
}
function closeChat() {
  state.chatOpen = false;
  $chatPanel.hidden = true;
  document.body.classList.remove('chat-open');
}

function renderChat() {
  $chatThreadSel.innerHTML = '';
  for (const t of state.chatThreads) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.title || new Date(t.day).toLocaleDateString();
    if (t.id === state.chatThreadId) opt.selected = true;
    $chatThreadSel.appendChild(opt);
  }
  $chatMessages.innerHTML = '';
  for (const m of state.chatMessages) appendMessageNode(m);
  $chatMessages.scrollTop = $chatMessages.scrollHeight;
}

function appendMessageNode(m) {
  const div = document.createElement('div');
  div.className = `cmsg cmsg--${m.role}`;
  div.dataset.id = m.id;
  div.innerHTML = m.role === 'user'
    ? `<div class="cmsg__bubble">${escapeHtml(m.content)}</div>`
    : `<div class="cmsg__bubble cmsg__bubble--ai" data-md>${renderMarkdown(m.content)}</div>`;
  $chatMessages.appendChild(div);
  $chatMessages.scrollTop = $chatMessages.scrollHeight;
}

$chatThreadSel.addEventListener('change', async () => {
  state.chatThreadId = $chatThreadSel.value;
  state.chatMessages = await Api.listChatMessages(state.chatThreadId);
  renderChat();
});

$chatNewBtn.addEventListener('click', async () => {
  // Force-create a new thread for today (if today exists, just reuses it).
  // For multiple-per-day, create with custom day pattern.
  try {
    const today = await Api.getOrCreateTodayThread(state.user.id);
    state.chatThreadId = today.id;
    state.chatMessages = await Api.listChatMessages(today.id);
    state.chatThreads = await Api.listChatThreads(state.user.id);
    renderChat();
  } catch (e) { console.error(e); }
});

// ============ Agent: tool execution ============

function findProjectByName(name) {
  if (!name) return null;
  const lower = String(name).toLowerCase();
  return state.projects.find(p =>
    p.name.toLowerCase() === lower ||
    p.name.toLowerCase().includes(lower)
  );
}

async function executeTool(name, args) {
  try {
    if (name === 'list_projects') {
      const aiOn = state.projects.filter(p => p.ai_enabled);
      return aiOn.map(p => ({
        id: p.id, name: p.name, color: p.color,
        item_count: state.items.filter(it => it.project_id === p.id && it.status !== 'done').length,
      }));
    }
    if (name === 'list_items') {
      let pool = state.items;
      if (args.project_name) {
        const p = findProjectByName(args.project_name);
        if (!p) return { error: `Project "${args.project_name}" not found or not AI-on.` };
        pool = pool.filter(it => it.project_id === p.id);
      } else {
        const aiIds = new Set(state.projects.filter(p => p.ai_enabled).map(p => p.id));
        pool = pool.filter(it => aiIds.has(it.project_id));
      }
      if (args.kind)   pool = pool.filter(it => it.kind === args.kind);
      if (args.status) pool = pool.filter(it => it.status === args.status);
      if (args.pinned) pool = pool.filter(it => !!it.pinned);
      const limit = Math.min(50, Math.max(1, args.limit || 30));
      const projById = Object.fromEntries(state.projects.map(p => [p.id, p.name]));
      return pool.slice(0, limit).map(it => ({
        id: it.id, project: projById[it.project_id] || '?',
        kind: it.kind, status: it.status, pinned: !!it.pinned,
        text: (it.text || '').slice(0, 200),
        updated_at: it.updated_at, done_at: it.done_at || null,
      }));
    }
    if (name === 'create_item') {
      const proj = findProjectByName(args.project_name);
      if (!proj) return { error: `Project "${args.project_name}" not found.` };
      const projItems = state.items.filter(x => x.project_id === proj.id && x.kind === args.kind);
      const minPos = projItems.length ? Math.min(...projItems.map(x => x.position)) : POSITION_GAP * 2;
      const created = await Api.createItem(state.user.id, {
        project_id: proj.id, kind: args.kind, text: args.text,
        status: 'open', position: minPos - POSITION_GAP,
      });
      const i = state.items.findIndex(x => x.id === created.id);
      if (i >= 0) state.items[i] = created; else state.items.push(created);
      renderAll();
      return { success: true, item_id: created.id, project: proj.name };
    }
    if (name === 'update_item_status') {
      const it = getItem(args.item_id);
      if (!it) return { error: `Item ${args.item_id} not found.` };
      const updated = await Api.updateItem(it.id, { status: args.status });
      const i = state.items.findIndex(x => x.id === updated.id);
      if (i >= 0) state.items[i] = updated;
      renderAll();
      return { success: true, status: updated.status };
    }
    if (name === 'update_item_text') {
      const it = getItem(args.item_id);
      if (!it) return { error: `Item ${args.item_id} not found.` };
      const updated = await Api.updateItem(it.id, { text: args.text });
      const i = state.items.findIndex(x => x.id === updated.id);
      if (i >= 0) state.items[i] = updated;
      renderAll();
      return { success: true };
    }
    if (name === 'create_project') {
      const maxPos = state.projects.length ? Math.max(...state.projects.map(p => p.position)) : 0;
      const created = await Api.createProject(state.user.id, {
        name: args.name,
        color: args.color || '#7f00ff',
        position: maxPos + POSITION_GAP,
      });
      state.projects.push(created);
      renderAll();
      return { success: true, project_id: created.id, name: created.name };
    }
    return { error: `Unknown tool ${name}` };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

function appendToolCard(toolCall, onConfirm, onCancel) {
  const card = document.createElement('div');
  card.className = 'cmsg cmsg--tool';
  const isWrite = AI.WRITE_TOOLS.has(toolCall.name);
  card.innerHTML = `
    <div class="cmsg__tool">
      <div class="cmsg__tool-head">
        <span class="cmsg__tool-icon">${isWrite ? '✎' : '🔍'}</span>
        <span class="cmsg__tool-name">${escapeHtml(AI.describeToolCall(toolCall.name, toolCall.args))}</span>
      </div>
      ${isWrite ? `
        <div class="cmsg__tool-actions">
          <button class="btn-sm btn-sm--cancel" type="button" data-tool-cancel>Cancel</button>
          <button class="btn-sm btn-sm--confirm" type="button" data-tool-confirm>Confirm</button>
        </div>
      ` : '<div class="cmsg__tool-status">Running…</div>'}
    </div>
  `;
  $chatMessages.appendChild(card);
  $chatMessages.scrollTop = $chatMessages.scrollHeight;
  if (isWrite) {
    card.querySelector('[data-tool-confirm]')?.addEventListener('click', () => {
      card.querySelector('.cmsg__tool-actions').innerHTML = '<span class="cmsg__tool-status">Running…</span>';
      onConfirm();
    });
    card.querySelector('[data-tool-cancel]')?.addEventListener('click', () => {
      card.querySelector('.cmsg__tool-actions').innerHTML = '<span class="cmsg__tool-status cmsg__tool-status--cancelled">Cancelled</span>';
      onCancel();
    });
  }
  return card;
}

function setToolCardResult(card, ok, label) {
  const status = card.querySelector('.cmsg__tool-status, .cmsg__tool-actions');
  if (!status) return;
  status.outerHTML = `<span class="cmsg__tool-status ${ok ? 'cmsg__tool-status--ok' : 'cmsg__tool-status--err'}">${ok ? '✓' : '✗'} ${escapeHtml(label || (ok ? 'Done' : 'Failed'))}</span>`;
}

// ============ Agent: chat submit (replaces streaming) ============

$chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $chatInput.value.trim();
  if (!text || state.chatStreaming) return;
  $chatInput.value = '';
  $chatInput.style.height = 'auto';

  // Save user message
  const userMsg = await Api.appendChatMessage(state.user.id, state.chatThreadId, 'user', text);
  state.chatMessages.push(userMsg);
  appendMessageNode(userMsg);

  state.chatStreaming = true;
  try {
    // Build initial turns from recent persisted history + the new user message.
    const turns = state.chatMessages.slice(-10, -1).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', content: m.content }));
    turns.push({ role: 'user', content: text });

    let safety = 0;
    while (safety++ < 8) {
      const result = await AI.chatTurn({ turns });

      if (result.type === 'text') {
        const m = await Api.appendChatMessage(state.user.id, state.chatThreadId, 'assistant', result.text);
        state.chatMessages.push(m);
        appendMessageNode(m);
        break;
      }

      if (result.type === 'tool_call') {
        const tc = result.tool;
        // Record the model turn so the next call sees the same history.
        turns.push({ role: 'model', functionCall: { name: tc.name, args: tc.args } });

        const isRead = AI.READ_TOOLS.has(tc.name);
        if (isRead) {
          const card = appendToolCard(tc);
          const response = await executeTool(tc.name, tc.args);
          const ok = !response?.error;
          setToolCardResult(card, ok, ok ? `${Array.isArray(response) ? response.length + ' results' : 'Done'}` : response.error);
          turns.push({ role: 'function', name: tc.name, response });
          continue;
        }

        // Write tool: confirmation required.
        const userChoice = await new Promise((resolve) => {
          const card = appendToolCard(tc,
            async () => {
              const response = await executeTool(tc.name, tc.args);
              const ok = !response?.error;
              setToolCardResult(card, ok, ok ? 'Done' : response.error);
              resolve({ confirmed: true, response });
            },
            () => resolve({ confirmed: false, response: { error: 'User cancelled.' } })
          );
        });
        turns.push({ role: 'function', name: tc.name, response: userChoice.response });

        if (!userChoice.confirmed) {
          // Tell the model the user cancelled and let it respond.
          // (loop continues; model gets the cancellation as a function response)
        }
        continue;
      }

      // Unknown response shape; bail.
      break;
    }
  } catch (err) {
    const errMsg = document.createElement('div');
    errMsg.className = 'cmsg cmsg--assistant';
    errMsg.innerHTML = `<div class="cmsg__bubble cmsg__bubble--ai"><em style="color:#ff5d8f">${escapeHtml(err.message || 'AI failed')}</em></div>`;
    $chatMessages.appendChild(errMsg);
  } finally {
    state.chatStreaming = false;
    $chatMessages.scrollTop = $chatMessages.scrollHeight;
  }
});

$chatInput.addEventListener('input', () => {
  $chatInput.style.height = 'auto';
  $chatInput.style.height = Math.min($chatInput.scrollHeight, 160) + 'px';
});
$chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $chatForm.requestSubmit();
  }
});

// ====================== Drag-to-reorder ======================

let drag = null;
$list.addEventListener('pointerdown', (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  if (state.currentView === 'archive') return;
  const handle = e.target.closest('.item__handle, .doc__handle');
  if (!handle) return;
  const row = handle.closest('.item, .doc');
  if (!row) return;
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  drag = { pointerId: e.pointerId, handle, row, startY: e.clientY };
  row.classList.add('item--dragging');
});
$list.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dy = e.clientY - drag.startY;
  drag.row.style.transform = `translateY(${dy}px) scale(1.02)`;
  const draggedRect = drag.row.getBoundingClientRect();
  const draggedMid = draggedRect.top + draggedRect.height / 2;
  const sibs = [...$list.children].filter((c) => c !== drag.row);
  for (const sib of sibs) {
    const r = sib.getBoundingClientRect();
    const sibMid = r.top + r.height / 2;
    const isBefore = !!(drag.row.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_PRECEDING);
    const isAfter  = !!(drag.row.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (dy < 0 && isBefore && draggedMid < sibMid) {
      flipSwap(sib, () => $list.insertBefore(drag.row, sib));
      adjustStartY(e.clientY, draggedRect.top); break;
    }
    if (dy > 0 && isAfter && draggedMid > sibMid) {
      flipSwap(sib, () => $list.insertBefore(drag.row, sib.nextSibling));
      adjustStartY(e.clientY, draggedRect.top); break;
    }
  }
});
function flipSwap(sib, mutate) {
  const before = sib.getBoundingClientRect();
  mutate();
  const after = sib.getBoundingClientRect();
  const flipDy = before.top - after.top;
  if (flipDy === 0 || REDUCED_MOTION) return;
  sib.style.transition = 'none'; sib.style.transform = `translateY(${flipDy}px)`;
  requestAnimationFrame(() => {
    sib.style.transition = 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)';
    sib.style.transform = '';
    setTimeout(() => { sib.style.transition = ''; sib.style.transform = ''; }, 240);
  });
}
function adjustStartY(clientY, prevTop) {
  const r = drag.row.getBoundingClientRect();
  drag.startY += r.top - prevTop;
  drag.row.style.transform = `translateY(${clientY - drag.startY}px) scale(1.02)`;
}
async function endDrag() {
  if (!drag) return;
  drag.row.classList.remove('item--dragging');
  drag.row.style.transform = '';
  const newOrder = [...$list.children].map((li) => li.dataset.id);
  drag = null;
  const persistableIds = newOrder.filter((id) => { const it = getItem(id); return it && !it._temp; });
  persistableIds.forEach((id, i) => { const it = getItem(id); if (it) it.position = (i + 1) * POSITION_GAP; });
  try { await Api.reorderItems(persistableIds); }
  catch (e) { console.error('reorder failed:', e); }
  flushQueuedRender();
}
$list.addEventListener('pointerup',     (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(); });
$list.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(); });

// ====================== Project modal ======================

function openProjectModal(projectId) {
  state.editingProjectId = projectId;
  const p = projectId ? state.projects.find((x) => x.id === projectId) : null;
  $projModalTitle.textContent = p ? 'Edit project' : 'New project';
  $projName.value = p?.name || '';
  state.pendingProjectColor = p?.color || PROJECT_COLORS[0];
  state.pendingProjectAI = !!p?.ai_enabled;
  if ($projAi) $projAi.checked = state.pendingProjectAI;
  $projSave.textContent = p ? 'Save' : 'Create';
  renderColorRow();
  $projModal.hidden = false;
  setTimeout(() => $projName.focus(), 0);
}
function renderColorRow() {
  $colorRow.innerHTML = '';
  for (const c of PROJECT_COLORS) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'color-dot' + (c === state.pendingProjectColor ? ' color-dot--active' : '');
    dot.style.background = c; dot.dataset.color = c;
    $colorRow.appendChild(dot);
  }
}
$colorRow.addEventListener('click', (e) => {
  const dot = e.target.closest('.color-dot');
  if (!dot) return;
  state.pendingProjectColor = dot.dataset.color;
  renderColorRow();
});
$projForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $projName.value.trim();
  if (!name) return;
  const color = state.pendingProjectColor;
  const ai_enabled = $projAi ? !!$projAi.checked : false;

  if (state.editingProjectId) {
    try {
      const updated = await Api.updateProject(state.editingProjectId, { name, color, ai_enabled });
      const i = state.projects.findIndex((x) => x.id === updated.id);
      if (i >= 0) state.projects[i] = updated;
      closeProjectModal(); renderAll();
    } catch (err) { console.error(err); }
  } else {
    const maxPos = state.projects.length ? Math.max(...state.projects.map((p) => p.position)) : 0;
    try {
      const created = await Api.createProject(state.user.id, {
        name, color, ai_enabled, position: maxPos + POSITION_GAP,
      });
      state.projects.push(created);
      state.currentProjectId = created.id;
      localStorage.setItem('solo.lastProjectId', created.id);
      closeProjectModal(); renderAll();
    } catch (err) { console.error(err); }
  }
});
$projModal.addEventListener('click', (e) => { if (e.target.dataset.modalClose !== undefined) closeProjectModal(); });
function closeProjectModal() { $projModal.hidden = true; state.editingProjectId = null; }

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$projModal.hidden)    closeProjectModal();
    if (!$confirmModal.hidden) closeConfirm();
    if (!$reader.hidden && !state.readerEditing) closeReader();
    if (state.chatOpen)        closeChat();
    closeAiMenu();
  }
});

function onDeleteProject() {
  const p = currentProject();
  if (!p) return;
  const projItems = state.items.filter((it) => it.project_id === p.id);
  showConfirm({
    title: `Delete "${p.name}"?`,
    lede: projItems.length
      ? `This permanently removes the project and its ${projItems.length} items (active + archived). Cannot be undone.`
      : 'This permanently removes the project. Cannot be undone.',
    onConfirm: async () => {
      try {
        await Api.deleteProject(p.id);
        state.projects = state.projects.filter((x) => x.id !== p.id);
        state.items = state.items.filter((it) => it.project_id !== p.id);
        state.currentProjectId = state.projects[0]?.id || null;
        if (state.currentProjectId) localStorage.setItem('solo.lastProjectId', state.currentProjectId);
        renderAll();
      } catch (err) { console.error(err); }
    },
  });
}

// ====================== Confirm modal ======================

function showConfirm({ title, lede, onConfirm }) {
  $confirmTitle.textContent = title;
  $confirmLede.textContent  = lede || '';
  state.confirmAction = onConfirm;
  $confirmModal.hidden = false;
}
function closeConfirm() { $confirmModal.hidden = true; state.confirmAction = null; }
$confirmModal.addEventListener('click', (e) => { if (e.target.dataset.confirmClose !== undefined) closeConfirm(); });
$confirmOk.addEventListener('click', async () => {
  const fn = state.confirmAction; closeConfirm(); if (fn) await fn();
});

// ====================== Mouse parallax ======================

if (!REDUCED_MOTION) {
  const blobs = [...document.querySelectorAll('.blob')];
  let tx = 0, ty = 0, cx = 0, cy = 0;
  window.addEventListener('mousemove', (e) => {
    tx = (e.clientX / innerWidth - 0.5) * 2;
    ty = (e.clientY / innerHeight - 0.5) * 2;
  });
  function tick(ts) {
    cx += (tx - cx) * 0.04; cy += (ty - cy) * 0.04;
    const t = ts / 1000;
    blobs.forEach((b, i) => {
      const phase = t * 0.12 + i * 1.7;
      const dx = Math.sin(phase) * 60, dy = Math.cos(phase * 0.7) * 45;
      const f = 28 * (i + 1);
      b.style.transform = `translate(${dx + cx * f}px, ${dy + cy * f}px)`;
    });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

boot();
