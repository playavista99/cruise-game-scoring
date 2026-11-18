/* Cruise Game Scoring App — static port.
   All games, templates and history live in localStorage on this device.
   Supabase is used ONLY for the optional staff account: sign-in plus
   cloud sync of custom templates. Nothing about players or games ever
   leaves the device. */
(function () {
  'use strict';
  const E = window.Engines;

  /* The running build's version. This is the code's single source of
     truth; version.json (checked over the network), the menu fallback
     line in index.html, and the service-worker cache name are bumped
     alongside it on every release — see the README release checklist. */
  const APP_VERSION = '2.0.1';
  const UPDATE_FLAG_KEY = 'cgsa-just-updated';
  function parseVersion(v) {
    return String(v === null || v === undefined ? '' : v).trim().replace(/^v/i, '').split('.').map(function (part) {
      const n = parseInt(part, 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    });
  }
  function compareVersions(a, b) {
    const aa = parseVersion(a);
    const bb = parseVersion(b);
    const len = Math.max(aa.length, bb.length);
    for (let i = 0; i < len; i++) {
      const diff = (aa[i] || 0) - (bb[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }
  window.CruiseGameScoring = { APP_VERSION: APP_VERSION, compareVersions: compareVersions };

  /* ---------------- built-in templates ---------------- */
  const BUILTINS = [
    { id: 'builtin-soccer', name: 'Soccer Shootout', icon: '⚽', color: '#16a34a', attempts: 5, winDir: 'high', builtin: true,
      buttons: [{ label: 'Goal', points: 1 }, { label: 'Saved', points: 0 }, { label: 'Missed', points: 0 }] },
    { id: 'builtin-golf', name: 'Hole-in-One Golf', icon: '⛳', color: '#0284c7', attempts: 3, winDir: 'high', builtin: true,
      buttons: [{ label: 'In', points: 10 }, { label: 'Close', points: 3 }, { label: 'Miss', points: 0 }] },
    { id: 'builtin-beanbag', name: 'Bean Bag Toss', icon: '🌽', color: '#ea580c', attempts: 4, winDir: 'high', builtin: true,
      buttons: [{ label: 'In the hole', points: 3 }, { label: 'On board', points: 1 }, { label: 'Miss', points: 0 }] },
    { id: 'builtin-popdarts', name: 'Pop Darts', icon: '🎈', color: '#9333ea', attempts: 3, winDir: 'high', builtin: true,
      buttons: [{ label: 'Pop', points: 5 }, { label: 'Miss', points: 0 }] },
    { id: 'builtin-axe', name: 'Axe Throw', icon: '🪓', color: '#b45309', attempts: 5, winDir: 'high', builtin: true,
      buttons: [{ label: 'Bullseye', points: 5 }, { label: 'Inner', points: 3 }, { label: 'Outer', points: 1 }, { label: 'Miss', points: 0 }] },
    { id: 'builtin-shuffle', name: 'Shuffleboard', icon: '🥏', color: '#0d9488', attempts: 4, winDir: 'high', builtin: true,
      buttons: [{ label: 'Zone 3', points: 3 }, { label: 'Zone 2', points: 2 }, { label: 'Zone 1', points: 1 }, { label: 'Miss', points: 0 }] },
    { id: 'builtin-minigolf', name: 'Mini Golf', icon: '🏌️', color: '#ca8a04', attempts: 9, winDir: 'low', builtin: true,
      buttons: [{ label: '1', points: 1 }, { label: '2', points: 2 }, { label: '3', points: 3 }, { label: '4', points: 4 }, { label: '5+', points: 5 }] }
  ];
  const CUSTOM_ICONS = ['🎲', '⭐', '🏆', '🎯', '🚀', '🦄', '🍕', '🎸', '🏀', '🎳'];
  const CUSTOM_COLORS = ['#dc2626', '#0891b2', '#65a30d', '#7c3aed', '#db2777', '#4f46e5', '#059669', '#d97706'];
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function customBadge(name) {
    const h = hashStr(name || 'game');
    return { icon: CUSTOM_ICONS[h % CUSTOM_ICONS.length], color: CUSTOM_COLORS[h % CUSTOM_COLORS.length] };
  }

  /* ---------------- state ---------------- */
  const LS_KEY = 'cgsa-state-v1';
  let S;
  try { S = JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch (e) { S = null; }
  if (!S || typeof S !== 'object') S = { templates: [], games: [] };
  if (!Array.isArray(S.templates)) S.templates = [];
  if (!Array.isArray(S.games)) S.games = [];
  if (!Array.isArray(S.setups)) S.setups = [];
  if (!Array.isArray(S.cruises)) S.cruises = [];
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* storage full/blocked */ } }

  function allTemplates() { return BUILTINS.concat(S.templates); }
  function getTemplate(id) { return allTemplates().find(function (t) { return t.id === id; }) || null; }
  function getGame(id) { return S.games.find(function (g) { return g.id === id; }) || null; }

  /* ---------------- cruises (v1.8) ----------------
     A cruise groups the games played on one sailing and carries a
     roster: the running list of that sailing's players (name +
     optional cabin). Games point at their cruise with game.cruiseId
     (null/absent = standalone). Everything stays on-device, exactly
     like games and history; no Supabase changes. */
  function getCruise(id) {
    if (!id) return null;
    return S.cruises.find(function (c) { return c.id === id; }) || null;
  }
  function normName(s) { return String(s === null || s === undefined ? '' : s).trim().toLowerCase(); }
  /* Roster sync: called from every entry-add path (game start, and
     Quick Score / Round Robin / Bracket walk-ups). A game entry joins
     its cruise's roster matched by normalized name (trimmed,
     case-insensitive); a match that lacks a cabin gains the entry's,
     a new name is appended. Edit-players substitutes deliberately do
     NOT call this (one-game stand-ins), and renames never rewrite
     the roster. */
  function syncRosterEntry(game, entry) {
    if (!game || !game.cruiseId || !entry) return;
    const cruise = getCruise(game.cruiseId);
    if (!cruise) return;
    if (!Array.isArray(cruise.roster)) cruise.roster = [];
    const key = normName(entry.name);
    if (!key) return;
    const found = cruise.roster.find(function (r) { return normName(r.name) === key; });
    if (found) {
      if (!found.cabin && entry.cabin) found.cabin = entry.cabin;
    } else {
      cruise.roster.push({ id: E.uid('p'), name: entry.name, cabin: entry.cabin || '' });
    }
  }
  function syncGameRoster(game) {
    if (!game) return;
    game.entries.forEach(function (e) { syncRosterEntry(game, e); });
  }
  function fmtDay(s) {
    if (!s) return '';
    const d = new Date(String(s) + 'T12:00:00');
    if (isNaN(d.getTime())) return String(s);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function cruiseMeta(c) {
    const parts = [];
    if (c.ship) parts.push(c.ship);
    if (c.startDate && c.endDate) parts.push(fmtDay(c.startDate) + ' – ' + fmtDay(c.endDate));
    else if (c.startDate) parts.push('From ' + fmtDay(c.startDate));
    else if (c.endDate) parts.push('Until ' + fmtDay(c.endDate));
    return parts.join(' · ');
  }
  // "Ship · dates · N games · M players" — shared by the home cruise
  // rows and the new-game destination chooser so they always agree.
  function cruiseCardMeta(c) {
    const nGames = S.games.filter(function (g) { return g.cruiseId === c.id; }).length;
    const nPlayers = c.roster ? c.roster.length : 0;
    return [cruiseMeta(c), nGames + (nGames === 1 ? ' game' : ' games'),
      nPlayers + (nPlayers === 1 ? ' player' : ' players')].filter(Boolean).join(' · ');
  }
  function entryName(game, id) {
    const e = game.entries.find(function (x) { return x.id === id; });
    return e ? e.name : '—';
  }

  /* ---------------- entry colors ----------------
     Every entry (player or team, every game) carries a color so staff
     can tell entries apart — bean bags are literally red vs blue.
     Entries auto-get the next palette color in sign-up order (so Bean
     Bag Toss starts Red vs Blue); the stored value is the color NAME
     ('Red'). Games saved before colors existed have no color field:
     entryColor() falls back to the palette color by entry position,
     so old games render correctly and never crash. */
  const ENTRY_COLORS = [
    { name: 'Red', hex: '#dc2626' }, { name: 'Blue', hex: '#2563eb' },
    { name: 'Green', hex: '#16a34a' }, { name: 'Yellow', hex: '#eab308' },
    { name: 'Orange', hex: '#ea580c' }, { name: 'Purple', hex: '#9333ea' },
    { name: 'Black', hex: '#111827' }, { name: 'White', hex: '#f8fafc' }
  ];
  function paletteAt(i) { return ENTRY_COLORS[((i % ENTRY_COLORS.length) + ENTRY_COLORS.length) % ENTRY_COLORS.length]; }
  function colorByName(name) {
    return ENTRY_COLORS.find(function (c) { return c.name === name; }) || null;
  }
  function entryColor(list, e) {
    if (!e) return null;
    const stored = e.color ? colorByName(e.color) : null;
    if (stored) return stored;
    const i = list ? list.indexOf(e) : -1;
    return paletteAt(i < 0 ? 0 : i);
  }
  function entryColorById(game, id) {
    if (!game || !id) return null;
    if (game.useColors === false) return null; // colors are a setup choice (v1.7)
    const e = game.entries.find(function (x) { return x.id === id; });
    return e ? entryColor(game.entries, e) : null;
  }
  /* Player colors are opt-in at setup (v1.7): game.useColors === false
     means no color UI anywhere for that game. Games saved before the
     choice existed have no flag — treat missing as ON so their look
     never changes. All color display funnels through these helpers
     (entryColorById above, entryDotHTML / nameWithDotHTML below, and
     entryColorInGame for the spots that hold an entry object), so
     gating here gates every screen at once. */
  function colorsOn(game) { return !game || game.useColors !== false; }
  function entryColorInGame(game, e) {
    return colorsOn(game) ? entryColor(game.entries, e) : null;
  }
  function entryColorNameInGame(game, e) {
    const c = entryColorInGame(game, e);
    return c ? c.name : '';
  }
  // The name a game is shown under: its optional label ("Soccer
  // Shootout — Day 1") when one is set, else the base game name.
  function displayName(game) {
    const l = game && game.label ? String(game.label).trim() : '';
    return l || (game ? game.name : '');
  }
  function colorDotHTML(color) {
    if (!color) return '';
    return '<span class="colordot" style="background:' + color.hex + '" aria-hidden="true"></span>';
  }
  function entryDotHTML(game, id) { return colorDotHTML(entryColorById(game, id)); }
  // Dot + escaped name — drop-in for HTML spots that used esc(entryName(...)).
  function nameWithDotHTML(game, id) { return entryDotHTML(game, id) + esc(entryName(game, id)); }
  function showColorPicker(currentName, onPick, onCancel) {
    let h = '<h2 style="margin-top:0">Choose a color</h2><div class="palettegrid">';
    ENTRY_COLORS.forEach(function (c) {
      h += '<button class="palettebtn' + (c.name === currentName ? ' on' : '') + '" data-pickcolor="' + c.name + '">' +
        '<span class="colordot big" style="background:' + c.hex + '"></span>' + c.name + '</button>';
    });
    h += '</div><button class="btn ghost block" id="cpCancel">Cancel</button>';
    openModal(h);
    document.querySelectorAll('[data-pickcolor]').forEach(function (b) {
      b.addEventListener('click', function () { closeModal(); onPick(b.getAttribute('data-pickcolor')); });
    });
    document.getElementById('cpCancel').addEventListener('click', function () {
      closeModal();
      if (onCancel) onCancel();
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- tiny DOM helpers ---------------- */
  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modalRoot');
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function badge(t, size) {
    return '<span class="badge" style="background:' + esc(t.color) + '22;border:2px solid ' + esc(t.color) + (size ? ';width:' + size + 'px;height:' + size + 'px' : '') + '">' + esc(t.icon) + '</span>';
  }
  function fmtDate(ts) { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function parseNum(v, fallback) {
    const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
    return isNaN(n) ? fallback : n;
  }

  /* ---------------- router ---------------- */
  let screen = { name: 'home' };
  let draft = null;         // setup/sign-up in progress
  let pendingCruiseId = null; // cruise a new-game flow was started from; consumed by startDraft
  let pickReturn = null;     // where the pick screen's Back goes: {screen:'home'|'gamedest'} or {screen:'cruise', id}
  let openScorer = null;    // {gameId, matchId, tapsA:[], tapsB:[]}
  function go(name, arg) {
    screen = { name: name, arg: arg };
    openScorer = null;
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    const fn = SCREENS[screen.name] || SCREENS.home;
    app.innerHTML = fn(screen.arg);
    const bind = BINDS[screen.name];
    if (bind) bind(screen.arg);
  }
  document.getElementById('brandBtn').addEventListener('click', function () { pendingCruiseId = null; pickReturn = null; go('home'); });
  document.getElementById('accountBtn').addEventListener('click', function () { go('account'); });

  /* ---------------- shared fragments ---------------- */
  function defSummary(def) {
    return def.attempts + ' attempts · ' + def.buttons.map(function (b) { return esc(b.label) + ' ' + b.points; }).join(' / ') +
      ' · ' + (def.winDir === 'low' ? 'low score wins' : 'high score wins');
  }
  // Editable scoring-definition fieldset. Inputs are plain DOM (never
  // re-rendered while typing), read on demand by readDefEditor().
  function defEditorHTML(def, prefix) {
    let rows = '';
    def.buttons.forEach(function (b, i) {
      rows += '<div class="btnrow-editor">' +
        '<input type="text" class="lbl" id="' + prefix + '-lbl-' + i + '" value="' + esc(b.label) + '" aria-label="Button label">' +
        '<input type="text" class="pts" id="' + prefix + '-pts-' + i + '" value="' + b.points + '" inputmode="numeric" aria-label="Points">' +
        '<button class="iconbtn" data-delbtn="' + i + '" aria-label="Remove button">✕</button></div>';
    });
    return '<label class="field"><span>Attempts per turn</span>' +
      '<input type="text" id="' + prefix + '-attempts" value="' + def.attempts + '" inputmode="numeric"></label>' +
      '<div class="field"><span style="font-weight:600;font-size:15px">Scoring buttons (tap-by-tap mode)</span>' +
      '<div id="' + prefix + '-btnrows">' + rows + '</div>' +
      '<button class="btn secondary small" id="' + prefix + '-addbtn" type="button">+ Add button</button></div>' +
      '<label class="field"><span>Who wins</span><select id="' + prefix + '-windir">' +
      '<option value="high"' + (def.winDir === 'high' ? ' selected' : '') + '>High score wins</option>' +
      '<option value="low"' + (def.winDir === 'low' ? ' selected' : '') + '>Low score wins</option></select></label>';
  }
  function bindDefEditor(prefix, rerender) {
    document.querySelectorAll('[data-delbtn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const i = parseInt(btn.getAttribute('data-delbtn'), 10);
        const def = readDefEditor(prefix);
        def.buttons.splice(i, 1);
        if (!def.buttons.length) def.buttons.push({ label: 'Score', points: 1 });
        rerender(def);
      });
    });
    const add = document.getElementById(prefix + '-addbtn');
    if (add) add.addEventListener('click', function () {
      const def = readDefEditor(prefix);
      def.buttons.push({ label: 'New', points: 1 });
      rerender(def);
    });
  }
  function readDefEditor(prefix) {
    const attempts = Math.max(1, parseNum(document.getElementById(prefix + '-attempts').value, 1));
    const buttons = [];
    document.querySelectorAll('#' + prefix + '-btnrows .btnrow-editor').forEach(function (row, i) {
      const lbl = row.querySelector('.lbl').value.trim() || ('Button ' + (i + 1));
      const pts = parseNum(row.querySelector('.pts').value, 0);
      buttons.push({ label: lbl, points: pts });
    });
    if (!buttons.length) buttons.push({ label: 'Score', points: 1 });
    return { attempts: attempts, buttons: buttons, winDir: document.getElementById(prefix + '-windir').value };
  }

  /* ---------------- screens ---------------- */
  const SCREENS = {};
  const BINDS = {};

  /* ----- Home ----- */
  SCREENS.home = function () {
    const inProgress = S.games.filter(function (g) { return g.status === 'playing'; });
    const finished = S.games.filter(function (g) { return g.status === 'finished'; });
    let h = '<h1>Score a game</h1>' +
      '<div class="homeactions">' +
      '<button class="btn" id="newGameBtn">🎮 New game</button>' +
      '<button class="btn secondary" id="newCruiseBtn">🛳 New cruise</button></div>';
    if (S.cruises.length) {
      h += '<h2>Your cruises</h2>';
      S.cruises.slice().reverse().forEach(function (c) {
        h += '<div class="card row"><div class="badge" style="background:#0b6fa422;border:2px solid #0b6fa4">🛳</div><div class="grow">' +
          '<div class="gamename">' + esc(c.name) + '</div>' +
          '<div class="sub">' + esc(cruiseCardMeta(c)) + '</div></div>' +
          '<button class="btn small" data-opencruise="' + c.id + '">Open</button></div>';
      });
    }
    if (inProgress.length) {
      h += '<h2>In progress</h2>';
      inProgress.slice().reverse().forEach(function (g) {
        const gc = getCruise(g.cruiseId);
        h += '<div class="card row"><div>' + badge(g) + '</div><div class="grow">' +
          '<div class="gamename">' + esc(displayName(g)) + '</div>' +
          '<div class="sub">' + (gc ? '🛳 ' + esc(gc.name) + ' · ' : '') + esc(formatLabel(g)) + ' · ' + g.entries.length + ' ' + (g.entryKind === 'teams' ? 'teams' : 'players') + ' · ' + fmtDate(g.createdAt) + '</div></div>' +
          '<button class="btn small" data-continue="' + g.id + '">Continue</button></div>';
      });
    }
    if (S.setups.length) {
      h += '<h2>Saved setups</h2>';
      S.setups.slice().reverse().forEach(function (p) {
        const t = getTemplate(p.templateId);
        h += '<div class="card row"' + (t ? '' : ' style="opacity:.55"') + '>' +
          (t ? '<div>' + badge(t) + '</div>' : '') +
          '<div class="grow"><div class="gamename">' + esc(p.name) + '</div>' +
          '<div class="sub">' + (t ? esc(presetSummary(p)) : 'Game template no longer exists') + '</div></div>' +
          (t ? '<button class="btn small" data-startpreset="' + p.id + '">▶ Start</button>' : '') +
          '<button class="btn small danger" data-delpreset="' + p.id + '">Delete</button></div>';
      });
      h += '<p class="note">A saved setup launches straight to sign-up with its game, rules, format, rounds, colors and label — players are signed up fresh each time.</p>';
    }
    h += '<div class="row wrap" style="margin-top:14px">' +
      '<button class="btn secondary grow" id="historyBtn">🏆 History' + (finished.length ? ' (' + finished.length + ')' : '') + '</button>' +
      '<button class="btn secondary grow" id="templatesBtn">🎲 My games</button></div>';
    h += '<p class="note" style="margin-top:16px">Everything is saved on this device and works with no connection. An optional staff account (top right) only syncs your custom game templates.</p>';
    h += '<button class="btn feedbackbtn block" id="homeFeedbackBtn" style="margin-top:18px">✉️ Send feedback</button>';
    return h;
  };
  // Saved-setup delete uses the same two-step in-app confirm as
  // history delete (native confirm() is suppressed in some browsers).
  let presetDelArmId = null, presetDelArmTimer = null;
  function disarmPresetDel() {
    presetDelArmId = null;
    if (presetDelArmTimer) { clearTimeout(presetDelArmTimer); presetDelArmTimer = null; }
    document.querySelectorAll('[data-delpreset]').forEach(function (x) {
      x.textContent = 'Delete'; x.classList.remove('confirming');
    });
  }
  BINDS.home = function () {
    disarmPresetDel(); // every fresh render starts disarmed
    document.getElementById('newGameBtn').addEventListener('click', function () {
      // With cruises on file, ask where the game belongs first; with
      // none, go straight to the pick screen exactly as before (v2.0).
      if (S.cruises.length) go('gamedest');
      else { pendingCruiseId = null; pickReturn = { screen: 'home' }; go('pick'); }
    });
    document.getElementById('newCruiseBtn').addEventListener('click', function () { openCruiseForm(); });
    document.querySelectorAll('[data-opencruise]').forEach(function (b) {
      b.addEventListener('click', function () { go('cruise', b.getAttribute('data-opencruise')); });
    });
    document.getElementById('homeFeedbackBtn').addEventListener('click', function () { openFeedback(); });
    document.getElementById('historyBtn').addEventListener('click', function () { go('history'); });
    document.getElementById('templatesBtn').addEventListener('click', function () { go('templates'); });
    document.querySelectorAll('[data-continue]').forEach(function (b) {
      b.addEventListener('click', function () {
        const g = getGame(b.getAttribute('data-continue'));
        // A rounds game paused on its summary goes back to the summary,
        // not into a half-started next round.
        if (g && qsActive(g) && g.qsRounds.betweenRounds) go('roundSummary', g.id);
        else go('play', b.getAttribute('data-continue'));
      });
    });
    document.querySelectorAll('[data-startpreset]').forEach(function (b) {
      b.addEventListener('click', function () {
        const p = S.setups.find(function (x) { return x.id === b.getAttribute('data-startpreset'); });
        if (p) startPreset(p);
      });
    });
    document.querySelectorAll('[data-delpreset]').forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.getAttribute('data-delpreset');
        if (presetDelArmId === id) {
          disarmPresetDel();
          S.setups = S.setups.filter(function (x) { return x.id !== id; });
          save(); render();
          return;
        }
        disarmPresetDel();
        presetDelArmId = id;
        b.textContent = 'Confirm delete?';
        b.classList.add('confirming');
        presetDelArmTimer = setTimeout(disarmPresetDel, 4000);
      });
    });
  };

  function formatLabel(g) {
    if (g.format === 'quick') {
      if (qsActive(g)) return 'Quick Score · Rounds (' + (g.qsRounds.mode === 'advance' ? 'Advance' : 'Cumulative') + ')';
      return 'Quick Score';
    }
    if (g.format === 'bracket') return (g.elim === 'double' ? 'Double-elim bracket' : 'Single-elim bracket');
    return 'Round Robin' + (g.rrPairing === 'results' ? ' · Results-based' : ' · Pre-set');
  }

  /* ----- New cruise form ----- */
  function openCruiseForm() {
    openModal('<h2 style="margin-top:0">🛳 New cruise</h2>' +
      '<p class="note">Games you start inside this cruise are filed together, its players form a roster you can pick from at sign-up, and the cruise page keeps a summary. Only the name is required.</p>' +
      '<label class="field"><span>Cruise name</span><input type="text" id="crName" placeholder="e.g. Sky Princess — Nov 2026" maxlength="60" autocomplete="off"></label>' +
      '<label class="field"><span>Ship (optional)</span><input type="text" id="crShip" placeholder="e.g. Sky Princess" maxlength="60" autocomplete="off"></label>' +
      '<label class="field"><span>Start date (optional)</span><input type="date" id="crStart"></label>' +
      '<label class="field"><span>End date (optional)</span><input type="date" id="crEnd"></label>' +
      '<p class="note hidden" id="crHint" style="color:#b3261e;font-weight:600">The cruise needs a name first — nothing was created.</p>' +
      '<button class="btn block" id="crCreate">Create cruise</button>' +
      '<button class="btn ghost block" id="crCancel">Cancel</button>');
    document.getElementById('crCancel').addEventListener('click', closeModal);
    document.getElementById('crCreate').addEventListener('click', function () {
      const name = document.getElementById('crName').value.trim();
      if (!name) {
        document.getElementById('crHint').classList.remove('hidden');
        document.getElementById('crName').focus();
        return;
      }
      const c = {
        id: E.uid('cr'), name: name,
        ship: document.getElementById('crShip').value.trim(),
        startDate: document.getElementById('crStart').value,
        endDate: document.getElementById('crEnd').value,
        createdAt: Date.now(), roster: []
      };
      S.cruises.push(c);
      save();
      closeModal();
      go('cruise', c.id);
    });
    const inp = document.getElementById('crName');
    if (inp) inp.focus();
  }

  /* ----- New game destination (v2.0) -----
     Tapping New game on Home with at least one cruise on file asks
     where the game belongs: standalone, or filed under one of the
     cruises. The choice only sets pendingCruiseId (consumed by
     startDraft into draft.cruiseId); every path then lands on the
     SAME pick screen. With no cruises this screen never appears. */
  SCREENS.gamedest = function () {
    let h = '<h1>Where\'s this game?</h1>' +
      '<button class="card row destrow" id="destStandalone"><div class="badge" style="background:#0b6fa422;border:2px solid #0b6fa4">🎮</div><div class="grow">' +
      '<div class="gamename">Standalone game</div><div class="sub">Not filed under a cruise</div></div></button>';
    S.cruises.slice().reverse().forEach(function (c) {
      h += '<button class="card row destrow" data-destcruise="' + c.id + '"><div class="badge" style="background:#0b6fa422;border:2px solid #0b6fa4">🛳</div><div class="grow">' +
        '<div class="gamename">' + esc(c.name) + '</div>' +
        '<div class="sub">' + esc(cruiseCardMeta(c)) + '</div></div></button>';
    });
    h += '<button class="btn ghost block" id="destBack">Back</button>';
    return h;
  };
  BINDS.gamedest = function () {
    document.getElementById('destStandalone').addEventListener('click', function () {
      pendingCruiseId = null; pickReturn = { screen: 'gamedest' }; go('pick');
    });
    document.querySelectorAll('[data-destcruise]').forEach(function (b) {
      b.addEventListener('click', function () {
        pendingCruiseId = b.getAttribute('data-destcruise'); pickReturn = { screen: 'gamedest' }; go('pick');
      });
    });
    document.getElementById('destBack').addEventListener('click', function () { go('home'); });
  };

  /* ----- Pick a game -----
     ONE pick screen for every entry (Home standalone, Home via the
     destination chooser, and the cruise page). When the game is
     headed into a cruise, a banner above the list says so and can
     drop the game back to standalone without leaving the screen. */
  SCREENS.pick = function () {
    const pc = getCruise(pendingCruiseId);
    let h = '<h1>Pick a game</h1>' +
      (pc ? '<div class="cruisebanner"><span>🛳 This game will be saved in: <b>' + esc(pc.name) + '</b></span>' +
        '<button class="cruisebanner-btn" id="makeStandaloneBtn" type="button">Make standalone</button></div>' : '') +
      '<div class="grid">';
    allTemplates().forEach(function (t) {
      h += '<button class="pickcard" data-pick="' + t.id + '">' + badge(t, 54) + '<span>' + esc(t.name) + '</span>' +
        (t.builtin ? '' : '<span class="sub">Custom</span>') + '</button>';
    });
    h += '<button class="pickcard" id="createBtn">' + badge({ icon: '➕', color: '#0b6fa4' }, 54) + '<span>Create new game</span></button>';
    h += '</div><button class="btn ghost block" id="backBtn">Back</button>';
    return h;
  };
  BINDS.pick = function () {
    const ms = document.getElementById('makeStandaloneBtn');
    if (ms) ms.addEventListener('click', function () { pendingCruiseId = null; render(); });
    document.querySelectorAll('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () { startDraft(b.getAttribute('data-pick')); });
    });
    document.getElementById('createBtn').addEventListener('click', function () { go('templateEditor', { id: null, thenSetup: true }); });
    document.getElementById('backBtn').addEventListener('click', function () {
      const r = pickReturn;
      pickReturn = null;
      pendingCruiseId = null;
      if (r && r.screen === 'cruise' && getCruise(r.id)) go('cruise', r.id);
      else if (r && r.screen === 'gamedest' && S.cruises.length) go('gamedest');
      else go('home');
    });
  };

  function startDraft(templateId) {
    const t = getTemplate(templateId);
    draft = {
      templateId: templateId,
      def: { attempts: t.attempts, buttons: clone(t.buttons), winDir: t.winDir },
      format: 'quick', entryKind: 'individuals', scoreMode: 'tap',
      elim: 'single', rrGames: '2', rrPairing: 'preset', playoffSize: '0', playoffElim: 'single',
      qsRoundsOn: 'off', qsMode: 'cumulative', qsPlanned: [''], qsPlannedParsed: null,
      // Colors are a setup choice (v1.7): Bean Bag Toss defaults ON
      // (the bags themselves are colored), every other game OFF.
      useColors: templateId === 'builtin-beanbag',
      label: '',
      cruiseId: pendingCruiseId || null,
      entries: []
    };
    pendingCruiseId = null; // consumed: a later standalone draft must not inherit it
    pickReturn = null;
    go('setup');
  }

  /* ----- Saved setups (presets, v1.7) -----
     A preset captures a full setup-screen configuration — base game,
     (possibly edited) scoring rules, format and its options, Quick
     Score rounds plan, the colors choice and the label — so a crew
     member can launch the same game again in two taps. Players are
     NEVER stored: starting a preset builds a fresh draft from the
     config and goes straight to sign-up. Presets live in the same
     on-device localStorage store as templates and history; they are
     deliberately NOT synced through Supabase (that would need a new
     cloud table — out of scope). */
  function parseQsPlannedStrings(strings) {
    const parsed = strings.map(function (s) {
      const t = String(s).trim();
      if (t === '') return null;
      const n = parseNum(t, -1);
      return n < 0 ? null : n;
    });
    while (parsed.length && parsed[parsed.length - 1] === null) parsed.pop();
    return parsed;
  }
  function formatShim(o) {
    // Just enough shape for formatLabel()/qsActive() to describe a
    // draft or a preset the way they describe a game.
    return {
      format: o.format, elim: o.elim, rrPairing: o.rrPairing,
      qsRounds: o.qsRoundsOn === 'on' ? { mode: o.qsMode } : null
    };
  }
  function presetFromDraft(name) {
    return {
      id: E.uid('set'), name: name, createdAt: Date.now(),
      templateId: draft.templateId, def: clone(draft.def),
      format: draft.format, entryKind: draft.entryKind, scoreMode: draft.scoreMode,
      elim: draft.elim, rrGames: String(draft.rrGames), rrPairing: draft.rrPairing,
      playoffSize: String(draft.playoffSize), playoffElim: draft.playoffElim,
      qsRoundsOn: draft.qsRoundsOn, qsMode: draft.qsMode, qsPlanned: draft.qsPlanned.slice(),
      useColors: !!draft.useColors, label: draft.label || ''
    };
  }
  function presetSummary(p) {
    const t = getTemplate(p.templateId);
    return (t ? t.name : 'Missing game') + ' · ' + formatLabel(formatShim(p)) +
      (p.label ? ' · “' + p.label + '”' : '');
  }
  function startPreset(p) {
    if (!getTemplate(p.templateId)) return; // blocked in the UI; defensive
    draft = {
      templateId: p.templateId, def: clone(p.def),
      format: p.format, entryKind: p.entryKind, scoreMode: p.scoreMode,
      elim: p.elim, rrGames: p.rrGames, rrPairing: p.rrPairing,
      playoffSize: p.playoffSize, playoffElim: p.playoffElim,
      qsRoundsOn: p.qsRoundsOn, qsMode: p.qsMode,
      qsPlanned: (p.qsPlanned && p.qsPlanned.length ? p.qsPlanned : ['']).slice(),
      qsPlannedParsed: null,
      useColors: !!p.useColors, label: p.label || '',
      cruiseId: null, // presets launch standalone games
      entries: []
    };
    if (draft.format === 'quick' && draft.qsRoundsOn === 'on') {
      draft.qsPlannedParsed = parseQsPlannedStrings(draft.qsPlanned);
    }
    go('signup');
  }
  function openSaveSetup() {
    const t = getTemplate(draft.templateId);
    const suggestion = draft.label || ((t ? t.name : 'Game') + ' — ' + formatLabel(formatShim(draft)));
    openModal('<h2 style="margin-top:0">💾 Save these settings</h2>' +
      '<p class="note">Save this setup — game, scoring rules, format, rounds, colors and label — so you can launch it again from the home screen. Players are not saved; they sign up fresh each time.</p>' +
      '<label class="field"><span>Setup name</span><input type="text" id="presetName" value="' + esc(suggestion) + '" maxlength="60"></label>' +
      '<button class="btn block" id="presetSave">Save setup</button>' +
      '<button class="btn ghost block" id="presetCancel">Cancel</button>');
    document.getElementById('presetCancel').addEventListener('click', closeModal);
    document.getElementById('presetSave').addEventListener('click', function () {
      const name = document.getElementById('presetName').value.trim();
      if (!name) { alert('Give the setup a name first.'); return; }
      S.setups.push(presetFromDraft(name));
      save();
      closeModal();
      const btn = document.getElementById('saveSetupBtn');
      if (btn) {
        const old = btn.textContent;
        btn.textContent = '✓ Saved — find it on the home screen';
        setTimeout(function () { btn.textContent = old; }, 2500);
      }
    });
    const inp = document.getElementById('presetName');
    if (inp) { inp.focus(); if (inp.select) inp.select(); }
  }

  /* ----- My games (templates) ----- */
  SCREENS.templates = function () {
    let h = '<h1>My games</h1><p class="note">Built-in games are edited per game at setup. Custom games live here — build your own, export one to share with another staffer, or import theirs.</p>';
    h += '<button class="btn block" id="newTplBtn">＋ Create custom game</button>';
    h += '<div class="row wrap"><button class="btn secondary grow" id="exportAllBtn">Export a game</button>' +
      '<button class="btn secondary grow" id="importBtn">Import a game</button></div>';
    if (S.templates.length) {
      h += '<h2>Custom games</h2>';
      S.templates.forEach(function (t) {
        h += '<div class="card row"><div>' + badge(t) + '</div><div class="grow"><div class="gamename">' + esc(t.name) + '</div>' +
          '<div class="sub">' + esc(defSummary(t)) + '</div></div>' +
          '<button class="btn small secondary" data-edittpl="' + t.id + '">Edit</button>' +
          '<button class="btn small secondary" data-playtpl="' + t.id + '">Play</button></div>';
      });
    }
    h += '<h2>Built-in games</h2>';
    BUILTINS.forEach(function (t) {
      h += '<div class="card row"><div>' + badge(t) + '</div><div class="grow"><div class="gamename">' + esc(t.name) + '</div>' +
        '<div class="sub">' + esc(defSummary(t)) + '</div></div></div>';
    });
    h += '<button class="btn ghost block" id="backBtn">Back</button>';
    return h;
  };
  BINDS.templates = function () {
    document.getElementById('newTplBtn').addEventListener('click', function () { go('templateEditor', { id: null }); });
    document.getElementById('importBtn').addEventListener('click', showImport);
    document.getElementById('exportAllBtn').addEventListener('click', function () {
      if (!S.templates.length) { alert('No custom games yet — create one first.'); return; }
      showExport(S.templates[0].id);
    });
    document.querySelectorAll('[data-edittpl]').forEach(function (b) {
      b.addEventListener('click', function () { go('templateEditor', { id: b.getAttribute('data-edittpl') }); });
    });
    document.querySelectorAll('[data-playtpl]').forEach(function (b) {
      b.addEventListener('click', function () { startDraft(b.getAttribute('data-playtpl')); });
    });
    document.getElementById('backBtn').addEventListener('click', function () { go('home'); });
  };

  function exportCode(t) {
    const payload = { app: 'cruise-game-scoring', kind: 'template', v: 1, name: t.name, attempts: t.attempts, buttons: t.buttons, winDir: t.winDir };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }
  function showExport(templateId) {
    const t = getTemplate(templateId);
    if (!t) return;
    const others = S.templates.filter(function (x) { return x.id !== templateId; });
    let select = '';
    if (S.templates.length > 1) {
      select = '<label class="field"><span>Which game</span><select id="expSel">' +
        S.templates.map(function (x) { return '<option value="' + x.id + '"' + (x.id === templateId ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>';
    }
    openModal('<h2 style="margin-top:0">Export “' + esc(t.name) + '”</h2>' + select +
      '<p class="note">Send this code to another staffer; they paste it into Import on their device.</p>' +
      '<textarea id="expCode" rows="5" readonly>' + esc(exportCode(t)) + '</textarea>' +
      '<button class="btn block" id="expCopy">Copy code</button>' +
      '<button class="btn ghost block" id="expClose">Close</button>');
    const sel = document.getElementById('expSel');
    if (sel) sel.addEventListener('change', function () { closeModal(); showExport(sel.value); });
    document.getElementById('expCopy').addEventListener('click', function () {
      const ta = document.getElementById('expCode');
      ta.select();
      copyText(ta.value, 'Export code copied.');
    });
    document.getElementById('expClose').addEventListener('click', closeModal);
  }
  function showImport() {
    openModal('<h2 style="margin-top:0">Import a game</h2>' +
      '<p class="note">Paste an export code from another staffer.</p>' +
      '<textarea id="impCode" rows="5" placeholder="Paste code here"></textarea>' +
      '<button class="btn block" id="impGo">Import</button>' +
      '<button class="btn ghost block" id="impClose">Cancel</button>');
    document.getElementById('impClose').addEventListener('click', closeModal);
    document.getElementById('impGo').addEventListener('click', function () {
      try {
        const raw = document.getElementById('impCode').value.trim();
        const obj = JSON.parse(decodeURIComponent(escape(atob(raw))));
        if (obj.kind !== 'template' || !obj.name || !Array.isArray(obj.buttons)) throw new Error('bad');
        const b = customBadge(obj.name);
        const t = {
          id: E.uid('tpl'), name: String(obj.name).slice(0, 60), icon: b.icon, color: b.color,
          attempts: Math.max(1, parseNum(obj.attempts, 3)),
          buttons: obj.buttons.map(function (x) { return { label: String(x.label || 'Score').slice(0, 24), points: parseNum(x.points, 0) }; }),
          winDir: obj.winDir === 'low' ? 'low' : 'high', builtin: false, updatedAt: Date.now()
        };
        S.templates.push(t); save(); cloudPushTemplate(t);
        closeModal(); go('templates');
      } catch (e) { alert('That code did not work. Check it was copied in full.'); }
    });
  }

  /* ----- Template editor ----- */
  let tplEditDef = null;
  SCREENS.templateEditor = function (arg) {
    const existing = arg && arg.id ? getTemplate(arg.id) : null;
    tplEditDef = existing
      ? { attempts: existing.attempts, buttons: clone(existing.buttons), winDir: existing.winDir }
      : { attempts: 3, buttons: [{ label: 'Score', points: 1 }, { label: 'Miss', points: 0 }], winDir: 'high' };
    return '<h1>' + (existing ? 'Edit game' : 'Create custom game') + '</h1>' +
      '<label class="field"><span>Game name</span><input type="text" id="tplName" value="' + esc(existing ? existing.name : '') + '" placeholder="e.g. Ring Toss"></label>' +
      '<div id="tplDefWrap">' + defEditorHTML(tplEditDef, 'tpl') + '</div>' +
      '<button class="btn block" id="tplSave">' + (arg && arg.thenSetup ? 'Save & set up a game' : 'Save game') + '</button>' +
      (existing ? '<button class="btn danger block" id="tplDelete">Delete this game</button>' : '') +
      '<button class="btn ghost block" id="tplCancel">Cancel</button>';
  };
  BINDS.templateEditor = function (arg) {
    const rerender = function (def) {
      tplEditDef = def;
      document.getElementById('tplDefWrap').innerHTML = defEditorHTML(def, 'tpl');
      bindDefEditor('tpl', rerender);
    };
    bindDefEditor('tpl', rerender);
    document.getElementById('tplCancel').addEventListener('click', function () { go(arg && arg.thenSetup ? 'pick' : 'templates'); });
    const del = document.getElementById('tplDelete');
    if (del) del.addEventListener('click', function () {
      if (!confirm('Delete this custom game? Games already played with it stay in history.')) return;
      S.templates = S.templates.filter(function (t) { return t.id !== arg.id; });
      save(); go('templates');
    });
    document.getElementById('tplSave').addEventListener('click', function () {
      const name = document.getElementById('tplName').value.trim();
      if (!name) { alert('Give the game a name first.'); return; }
      const def = readDefEditor('tpl');
      let t;
      if (arg && arg.id) {
        t = getTemplate(arg.id);
        Object.assign(t, { name: name, attempts: def.attempts, buttons: def.buttons, winDir: def.winDir, updatedAt: Date.now() });
      } else {
        const b = customBadge(name);
        t = { id: E.uid('tpl'), name: name, icon: b.icon, color: b.color, attempts: def.attempts, buttons: def.buttons, winDir: def.winDir, builtin: false, updatedAt: Date.now() };
        S.templates.push(t);
      }
      save(); cloudPushTemplate(t);
      if (arg && arg.thenSetup) startDraft(t.id); else go('templates');
    });
  };

  /* ----- Setup ----- */
  function segHTML(id, options, current) {
    return '<div class="seg" id="' + id + '">' + options.map(function (o) {
      return '<button type="button" data-v="' + o.v + '"' + (o.v === current ? ' class="on"' : '') + '>' + o.label + '</button>';
    }).join('') + '</div>';
  }
  function bindSeg(id, get, set, onChange) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) {
      b.addEventListener('click', function () {
        set(b.getAttribute('data-v'));
        document.querySelectorAll('#' + id + ' button').forEach(function (x) { x.classList.toggle('on', x === b); });
        if (onChange) onChange();
      });
    });
  }
  /* Quick Score rounds: planned-target editor rows (plain DOM inputs,
     read on demand — the same pattern as the scoring-definition editor). */
  function qsTargetsHTML() {
    let rows = '';
    draft.qsPlanned.forEach(function (v, i) {
      rows += '<div class="btnrow-editor"><span class="tgtlbl">Round ' + (i + 1) + '</span>' +
        '<input type="text" class="pts" id="qs-tgt-' + i + '" value="' + esc(v) + '" inputmode="numeric" placeholder="Target pts" aria-label="Round ' + (i + 1) + ' target">' +
        (draft.qsPlanned.length > 1
          ? '<button class="iconbtn" data-deltgt="' + i + '" aria-label="Remove planned round">✕</button>'
          : '<span class="tgtspacer"></span>') + '</div>';
    });
    return rows;
  }
  function readQsStrings() {
    const inputs = document.querySelectorAll('#qsTgtRows input');
    if (!inputs.length) return draft.qsPlanned.slice();
    const out = [];
    inputs.forEach(function (inp) { out.push(inp.value); });
    return out;
  }
  function bindQsTargets() {
    const wrap = document.getElementById('qsTgtRows');
    if (!wrap) return;
    const rerender = function () {
      wrap.innerHTML = qsTargetsHTML();
      bindQsTargets();
    };
    wrap.querySelectorAll('[data-deltgt]').forEach(function (b) {
      b.addEventListener('click', function () {
        draft.qsPlanned = readQsStrings();
        draft.qsPlanned.splice(parseInt(b.getAttribute('data-deltgt'), 10), 1);
        if (!draft.qsPlanned.length) draft.qsPlanned = [''];
        rerender();
      });
    });
    const add = document.getElementById('qsAddTgt');
    if (add && !add.dataset.bound) {
      add.dataset.bound = '1';
      add.addEventListener('click', function () {
        draft.qsPlanned = readQsStrings();
        draft.qsPlanned.push('');
        rerender();
        const inputs = wrap.querySelectorAll('input');
        if (inputs.length) inputs[inputs.length - 1].focus();
      });
    }
  }
  SCREENS.setup = function () {
    const t = getTemplate(draft.templateId);
    let h = '<h1>Set up: ' + esc(t.name) + '</h1>' +
      '<div class="card row"><div>' + badge(t) + '</div><div class="grow"><div class="gamename">' + esc(t.name) + '</div>' +
      '<div class="sub">Scoring rules below start from the template — change anything for this game only.</div></div></div>' +
      (draft.cruiseId && getCruise(draft.cruiseId)
        ? '<p class="note">🛳 Cruise: <b>' + esc(getCruise(draft.cruiseId).name) + '</b> — this game will be filed under that cruise, and its players join the cruise roster.</p>'
        : '') +
      '<label class="field"><span>Game label (optional)</span>' +
      '<input type="text" id="suLabel" value="' + esc(draft.label || '') + '" placeholder="e.g. Soccer Shootout — Day 1" maxlength="60"></label>' +
      '<p class="note">A label names THIS game — “Soccer Shootout Tournament”, “Day 2 rematch” — and shows wherever the game’s name appears. Blank keeps the plain game name.</p>' +
      '<div id="setupDefWrap">' + defEditorHTML(draft.def, 'su') + '</div>' +
      '<h2>Format</h2>' + segHTML('segFormat', [
        { v: 'quick', label: 'Quick Score' }, { v: 'bracket', label: 'Bracket' }, { v: 'rr', label: 'Round Robin' }], draft.format) +
      '<h2>Who is playing</h2>' + segHTML('segKind', [
        { v: 'individuals', label: 'Individuals' }, { v: 'teams', label: 'Teams' }], draft.entryKind) +
      '<h2>Score entry</h2>' + segHTML('segMode', [
        { v: 'tap', label: 'Tap-by-tap (app adds up)' }, { v: 'total', label: 'Type final total' }], draft.scoreMode) +
      '<h2>Player colors</h2>' + segHTML('segColors', [
        { v: 'on', label: 'On — a color for each entry' }, { v: 'off', label: 'Off — no colors' }], draft.useColors ? 'on' : 'off') +
      '<p class="note">On: every player or team gets a color (Red, Blue, Green, …) shown next to their name at sign-up, in play, in results and in history. ' +
      'Bean Bag Toss starts with colors on — the bags are colored — everything else starts with them off. Either way it is your choice, here at setup.</p>' +
      '<div id="quickOpts" class="' + (draft.format === 'quick' ? '' : 'hidden') + '">' +
      '<h2>Rounds</h2>' + segHTML('segQsRounds', [
        { v: 'off', label: 'Off — one leaderboard' }, { v: 'on', label: 'On — play in rounds' }], draft.qsRoundsOn) +
      '<div id="qsOpts" class="' + (draft.qsRoundsOn === 'on' ? '' : 'hidden') + '">' +
      '<h2>How rounds score</h2>' + segHTML('segQsMode', [
        { v: 'cumulative', label: 'Cumulative (scores add up)' }, { v: 'advance', label: 'Advance (hit the target to stay in)' }], draft.qsMode) +
      '<div class="field"><span>Planned round targets</span>' +
      '<div id="qsTgtRows">' + qsTargetsHTML() + '</div>' +
      '<button class="btn secondary small" id="qsAddTgt" type="button">+ Add planned round</button>' +
      '<p class="note">Targets are where a round’s bar sits — on Cornhole, round 1 might need 5 points, round 2 a new amount to stay in. ' +
      'You do <b>not</b> have to plan them all now: after each round the summary screen lets you set or change the next round’s target before it starts. ' +
      'Advance mode needs a Round 1 target; in Cumulative mode targets are just optional pace markers.</p></div>' +
      '</div></div>' +
      '<div id="bracketOpts" class="' + (draft.format === 'bracket' ? '' : 'hidden') + '">' +
      '<h2>Elimination</h2>' + segHTML('segElim', [
        { v: 'single', label: 'Single elimination' }, { v: 'double', label: 'Double elimination' }], draft.elim) + '</div>' +
      '<div id="rrOpts" class="' + (draft.format === 'rr' ? '' : 'hidden') + '">' +
      '<label class="field"><span>Games per entry — total games each ' + 'entry plays</span>' +
      '<input type="text" id="rrGames" value="' + esc(draft.rrGames) + '" inputmode="numeric"></label>' +
      '<h2>Pairings</h2>' + segHTML('segPairing', [
        { v: 'preset', label: 'Pre-set (schedule up front)' }, { v: 'results', label: 'Results-based (pair each round from standings)' }], draft.rrPairing) +
      '<h2>Playoff after round robin</h2>' + segHTML('segPlayoff', [
        { v: '0', label: 'None' }, { v: '2', label: 'Top 2' }, { v: '4', label: 'Top 4' }, { v: '8', label: 'Top 8' }], draft.playoffSize) +
      '<div id="playoffElimWrap" class="' + (draft.playoffSize !== '0' ? '' : 'hidden') + '"><h2>Playoff style</h2>' +
      segHTML('segPlayoffElim', [{ v: 'single', label: 'Single elimination' }, { v: 'double', label: 'Double elimination' }], draft.playoffElim) + '</div>' +
      '</div>' +
      '<button class="btn block" id="toSignup" style="margin-top:18px">Continue to sign-up →</button>' +
      '<button class="btn secondary block" id="saveSetupBtn">💾 Save these settings</button>' +
      '<button class="btn ghost block" id="setupBack">Back</button>';
    return h;
  };
  BINDS.setup = function () {
    const rerenderDef = function (def) {
      draft.def = def;
      document.getElementById('setupDefWrap').innerHTML = defEditorHTML(def, 'su');
      bindDefEditor('su', rerenderDef);
    };
    bindDefEditor('su', rerenderDef);
    bindSeg('segFormat', null, function (v) {
      draft.format = v;
      document.getElementById('bracketOpts').classList.toggle('hidden', v !== 'bracket');
      document.getElementById('rrOpts').classList.toggle('hidden', v !== 'rr');
      document.getElementById('quickOpts').classList.toggle('hidden', v !== 'quick');
    });
    bindSeg('segKind', null, function (v) { draft.entryKind = v; });
    bindSeg('segMode', null, function (v) { draft.scoreMode = v; });
    bindSeg('segColors', null, function (v) { draft.useColors = (v === 'on'); });
    bindSeg('segQsRounds', null, function (v) {
      draft.qsRoundsOn = v;
      document.getElementById('qsOpts').classList.toggle('hidden', v !== 'on');
    });
    bindSeg('segQsMode', null, function (v) { draft.qsMode = v; });
    bindQsTargets();
    bindSeg('segElim', null, function (v) { draft.elim = v; });
    bindSeg('segPairing', null, function (v) { draft.rrPairing = v; });
    bindSeg('segPlayoff', null, function (v) {
      draft.playoffSize = v;
      document.getElementById('playoffElimWrap').classList.toggle('hidden', v === '0');
    });
    bindSeg('segPlayoffElim', null, function (v) { draft.playoffElim = v; });
    document.getElementById('setupBack').addEventListener('click', function () { go('pick'); });
    document.getElementById('toSignup').addEventListener('click', function () {
      if (!finalizeDraftFromSetup()) return;
      go('signup');
    });
    document.getElementById('saveSetupBtn').addEventListener('click', function () {
      if (!finalizeDraftFromSetup()) return;
      openSaveSetup();
    });
  };
  // Snapshot the setup screen's DOM-held values (scoring rules, games
  // per entry, label, planned targets) into the draft and compute the
  // parsed round plan. Returns false — after alerting — when the
  // config is invalid (Advance rounds without a Round 1 target), so a
  // saved preset can never hold a config a manual setup would reject.
  function finalizeDraftFromSetup() {
    draft.def = readDefEditor('su');
    const rrInput = document.getElementById('rrGames');
    if (rrInput) draft.rrGames = rrInput.value;
    const lbl = document.getElementById('suLabel');
    if (lbl) draft.label = lbl.value.trim();
    if (draft.format === 'quick' && draft.qsRoundsOn === 'on') {
      draft.qsPlanned = readQsStrings();
      draft.qsPlannedParsed = parseQsPlannedStrings(draft.qsPlanned);
      if (draft.qsMode === 'advance' && (draft.qsPlannedParsed.length === 0 || draft.qsPlannedParsed[0] === null)) {
        alert('Advance mode needs a Round 1 target — enter one in the Planned round targets, or switch rounds to Cumulative.');
        return false;
      }
    } else {
      draft.qsPlannedParsed = null;
    }
    return true;
  }

  /* ----- Sign-up ----- */
  function rrPreview(entriesCount) {
    const g = Math.max(1, parseNum(draft.rrGames, 2));
    if (entriesCount < 2) return '';
    const range = E.gamesRange(entriesCount, g);
    if (draft.rrPairing === 'results') {
      const byes = entriesCount % 2 === 1 ? g : 0;
      const matches = (entriesCount * g - byes) / 2;
      return 'Results-based: round 1 is paired in sign-up order; later rounds are paired from the standings when you tap the generate button. ' +
        'Planned: ' + matches + ' matches over ' + g + ' rounds · each entry plays ' + g + ' games' + (byes ? ' (a bye counts as a game)' : '') + '.';
    }
    const built = E.buildPresetRR(entriesCount ? draft.entries.map(function (e) { return e.id; }) : [], g);
    const rangeTxt = range.min === range.max ? String(range.max) : (range.min + '–' + range.max);
    return 'Pre-set schedule: ' + built.matches.length + ' matches in ' + built.rounds.length + ' rounds · each entry plays ' + rangeTxt + ' games' +
      (range.min !== range.max ? ' (with an odd field × games, one entry plays one fewer — that is the honest math)' : '') + '.';
  }
  /* Roster picker rows (sign-up inside a cruise, Individuals only):
     each roster player is a toggle — tap to put them in this game,
     tap again to leave them out (the no-show case). Selection is by
     normalized name against the current sign-up list, so the rows
     always mirror the list exactly. */
  function rosterPickHTML() {
    const cruise = draft && draft.cruiseId ? getCruise(draft.cruiseId) : null;
    if (!cruise) return '';
    if (!cruise.roster || !cruise.roster.length) {
      return '<p class="note">Nobody is on this cruise’s roster yet — everyone who plays a game in the cruise joins it automatically, and next time they are one tap away here.</p>';
    }
    let h = '';
    cruise.roster.forEach(function (r) {
      const sel = draft.entries.some(function (e) { return normName(e.name) === normName(r.name); });
      h += '<button type="button" class="rosterpick' + (sel ? ' on' : '') + '" data-rosterpick="' + r.id + '">' +
        '<span class="rpcheck">' + (sel ? '✓' : '＋') + '</span>' +
        '<span class="grow">' + esc(r.name) + (r.cabin ? ' <span class="sub">(cabin ' + esc(r.cabin) + ')</span>' : '') + '</span>' +
        '<span class="sub">' + (sel ? 'Playing' : 'Tap to add') + '</span></button>';
    });
    return h;
  }
  function toggleRosterPick(rosterId) {
    const cruise = draft && draft.cruiseId ? getCruise(draft.cruiseId) : null;
    if (!cruise || !cruise.roster) return;
    const r = cruise.roster.find(function (x) { return x.id === rosterId; });
    if (!r) return;
    const idx = draft.entries.findIndex(function (e) { return normName(e.name) === normName(r.name); });
    if (idx >= 0) { draft.entries.splice(idx, 1); return; }
    const e = { id: E.uid('e'), name: r.name, cabin: r.cabin || '' };
    if (draft.useColors !== false) e.color = paletteAt(draft.entries.length).name;
    draft.entries.push(e);
  }
  /* Copy players from another game: adds that game's entries to the
     sign-up list (names, cabins, team members), skipping names
     already listed — nothing is replaced, and the list stays fully
     editable before Start. Same-cruise games are listed first. */
  function copyPlayersFrom(src) {
    if (!src || !draft) return;
    src.entries.forEach(function (se) {
      const dup = draft.entries.some(function (e) { return normName(e.name) === normName(se.name); });
      if (dup) return;
      const e = { id: E.uid('e'), name: se.name, cabin: se.cabin || '' };
      if (se.members) e.members = se.members;
      if (draft.useColors !== false) e.color = paletteAt(draft.entries.length).name;
      draft.entries.push(e);
    });
  }
  function openCopyPlayers(onDone) {
    const inCruise = function (g) { return !!(draft && draft.cruiseId && g.cruiseId === draft.cruiseId); };
    const games = S.games.slice().sort(function (a, b) {
      const ca = inCruise(a) ? 0 : 1, cb = inCruise(b) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return b.createdAt - a.createdAt;
    });
    let h = '<h2 style="margin-top:0">Copy players from another game</h2>' +
      '<p class="note">That game’s players are added to this sign-up list — nobody is removed, names already on the list are skipped, and you can still edit everything before starting.</p>';
    if (!games.length) h += '<p class="empty">No other games on this device yet.</p>';
    let lastGroup = null;
    games.forEach(function (g) {
      if (draft && draft.cruiseId) {
        const grp = inCruise(g) ? 'This cruise' : 'Other games';
        if (grp !== lastGroup) { h += '<h3>' + grp + '</h3>'; lastGroup = grp; }
      }
      h += '<button class="btn block secondary" data-copyfrom="' + g.id + '">' + esc(displayName(g)) +
        ' <span class="sub">· ' + esc(formatLabel(g)) + ' · ' + g.entries.length + ' ' + (g.entryKind === 'teams' ? 'teams' : 'players') +
        ' · ' + fmtDate(g.createdAt) + (g.status === 'finished' ? ' · finished' : ' · in progress') + '</span></button>';
    });
    h += '<button class="btn ghost block" id="copyCancel">Cancel</button>';
    openModal(h);
    document.getElementById('copyCancel').addEventListener('click', closeModal);
    document.querySelectorAll('[data-copyfrom]').forEach(function (b) {
      b.addEventListener('click', function () {
        copyPlayersFrom(getGame(b.getAttribute('data-copyfrom')));
        closeModal();
        if (onDone) onDone();
      });
    });
  }
  function startHintText() {
    return draft.entryKind === 'teams' ? 'Add at least 2 teams to start' : 'Add at least 2 players to start';
  }
  SCREENS.signup = function () {
    const kindWord = draft.entryKind === 'teams' ? 'team' : 'player';
    const cruise = draft.cruiseId ? getCruise(draft.cruiseId) : null;
    let h = '<h1>Sign up ' + kindWord + 's</h1>' +
      (cruise ? '<p class="note">🛳 Cruise: <b>' + esc(cruise.name) + '</b></p>' : '') +
      '<p class="note">Name is required. Cabin is optional — it tells apart duplicate names and helps find winners later.' +
      (draft.entryKind === 'teams' ? ' Member names are optional too.' : '') + '</p>' +
      (cruise && draft.entryKind === 'individuals'
        ? '<h2>From this cruise’s roster</h2><div id="rosterPick">' + rosterPickHTML() + '</div>' +
          '<p class="note">Tap a name to add them to this game; tap again to leave out a no-show. Names added below join the roster when the game starts.</p>'
        : '') +
      '<div id="entryList">';
    draft.entries.forEach(function (e, i) {
      h += entryRowHTML(e, i);
    });
    h += '</div>' +
      '<div class="entryrow"><input type="text" class="nm" id="newName" placeholder="' + (draft.entryKind === 'teams' ? 'Team' : 'Player') + ' name" autocomplete="off">' +
      '<input type="text" class="cb" id="newCabin" placeholder="Cabin" inputmode="numeric">' +
      '<button class="iconbtn" id="addEntry" aria-label="Add">＋</button></div>' +
      (draft.entryKind === 'teams' ? '<input type="text" id="newMembers" placeholder="Member names (optional)" style="margin:4px 0 8px">' : '') +
      '<button class="btn secondary block" id="copyPlayersBtn">📋 Copy players from another game…</button>' +
      '<p class="note" id="rrPreview"></p>' +
      '<div class="row wrap">' +
      (draft.format === 'bracket' ? '<button class="btn secondary" id="shuffleBtn">🔀 Shuffle seeds</button>' : '') +
      '<span class="grow"></span><span class="sub" id="entryCount"></span></div>' +
      '<button class="btn block" id="startBtn" style="margin-top:12px">Start game</button>' +
      '<p class="note" id="startHint" style="text-align:center;margin:8px 0 0"' + (draft.entries.length < 2 ? '' : ' hidden') + '>' + startHintText() + '</p>' +
      '<button class="btn ghost block" id="signupBack">Back to setup</button>';
    return h;
  };
  let signupEditIdx = -1; // sign-up row whose name is being edited inline (-1 = none)
  function entryRowHTML(e, i) {
    // Colors off (setup choice): the row is plain — no swatch, no tag.
    const c = (!draft || draft.useColors !== false) ? entryColor(draft.entries, e) : null;
    const editing = signupEditIdx === i;
    return '<div class="card row" style="margin:6px 0;padding:10px 12px">' +
      (c ? '<button class="colorswatch" data-colorpick="' + i + '" style="background:' + c.hex + '" aria-label="Color: ' + c.name + '. Tap to change"></button>' : '') +
      '<div class="grow">' +
      (editing
        ? '<input type="text" class="nameedit" data-nameinput="' + i + '" value="' + esc(e.name) + '" autocomplete="off" aria-label="Edit name">'
        : '<span class="gamename" style="font-size:16px">' + (i + 1) + '. <span data-nameedit="' + i + '">' + esc(e.name) + '</span></span>' +
          '<button class="editbtn" data-nameedit="' + i + '" aria-label="Edit name">✎</button>') +
      (c ? '<span class="tag">' + c.name + '</span>' : '') +
      (e.cabin ? '<span class="tag">Cabin ' + esc(e.cabin) + '</span>' : '') +
      (e.members ? '<div class="sub">' + esc(e.members) + '</div>' : '') +
      '</div><button class="iconbtn" data-delentry="' + i + '" aria-label="Remove">✕</button></div>';
  }
  BINDS.signup = function () {
    signupEditIdx = -1;
    const refresh = function () {
      document.getElementById('entryList').innerHTML = draft.entries.map(entryRowHTML).join('');
      document.querySelectorAll('[data-delentry]').forEach(function (b) {
        b.addEventListener('click', function () {
          signupEditIdx = -1;
          draft.entries.splice(parseInt(b.getAttribute('data-delentry'), 10), 1);
          refresh();
        });
      });
      document.querySelectorAll('[data-nameedit]').forEach(function (b) {
        b.addEventListener('click', function () {
          signupEditIdx = parseInt(b.getAttribute('data-nameedit'), 10);
          refresh();
          const inp = document.querySelector('[data-nameinput]');
          if (inp) { inp.focus(); if (inp.select) inp.select(); }
        });
      });
      const nameInp = document.querySelector('[data-nameinput]');
      if (nameInp) {
        let done = false;
        const commit = function (saveIt) {
          if (done) return; done = true;
          const idx = parseInt(nameInp.getAttribute('data-nameinput'), 10);
          const v = nameInp.value.trim();
          if (saveIt && v && draft.entries[idx]) draft.entries[idx].name = v;
          signupEditIdx = -1;
          refresh();
        };
        nameInp.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
          else if (ev.key === 'Escape') commit(false);
        });
        nameInp.addEventListener('blur', function () { commit(true); });
      }
      document.querySelectorAll('[data-colorpick]').forEach(function (b) {
        b.addEventListener('click', function () {
          const entry = draft.entries[parseInt(b.getAttribute('data-colorpick'), 10)];
          if (!entry) return;
          showColorPicker(entryColor(draft.entries, entry).name, function (colorName) {
            entry.color = colorName;
            refresh();
          });
        });
      });
      document.getElementById('entryCount').textContent = draft.entries.length + (draft.entryKind === 'teams' ? ' teams' : ' players');
      const pv = document.getElementById('rrPreview');
      if (pv) pv.textContent = draft.format === 'rr' ? rrPreview(draft.entries.length) : '';
      document.getElementById('startBtn').disabled = draft.entries.length < 2;
      const startHint = document.getElementById('startHint');
      if (startHint) {
        startHint.textContent = startHintText();
        startHint.hidden = draft.entries.length >= 2;
      }
      // Roster picker (cruise sign-ups): rows mirror the entry list.
      const rp = document.getElementById('rosterPick');
      if (rp) {
        rp.innerHTML = rosterPickHTML();
        rp.querySelectorAll('[data-rosterpick]').forEach(function (b) {
          b.addEventListener('click', function () {
            signupEditIdx = -1;
            toggleRosterPick(b.getAttribute('data-rosterpick'));
            refresh();
          });
        });
      }
    };
    const addFromInputs = function () {
      const nm = document.getElementById('newName');
      const name = nm.value.trim();
      if (!name) { nm.focus(); return; }
      const e = { id: E.uid('e'), name: name, cabin: document.getElementById('newCabin').value.trim() };
      if (draft.useColors !== false) e.color = paletteAt(draft.entries.length).name;
      const mem = document.getElementById('newMembers');
      if (mem && mem.value.trim()) e.members = mem.value.trim();
      draft.entries.push(e);
      nm.value = ''; document.getElementById('newCabin').value = '';
      if (mem) mem.value = '';
      nm.focus();
      refresh();
    };
    document.getElementById('copyPlayersBtn').addEventListener('click', function () { openCopyPlayers(refresh); });
    document.getElementById('addEntry').addEventListener('click', addFromInputs);
    document.getElementById('newName').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') addFromInputs(); });
    document.getElementById('newCabin').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') addFromInputs(); });
    const sh = document.getElementById('shuffleBtn');
    if (sh) sh.addEventListener('click', function () {
      for (let i = draft.entries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = draft.entries[i]; draft.entries[i] = draft.entries[j]; draft.entries[j] = tmp;
      }
      refresh();
    });
    document.getElementById('signupBack').addEventListener('click', function () { go('setup'); });
    document.getElementById('startBtn').addEventListener('click', function () {
      if (draft.entries.length < 2) return;
      createGame();
    });
    refresh();
  };

  function createGame() {
    const t = getTemplate(draft.templateId);
    const game = {
      id: E.uid('g'), templateId: t.id, name: t.name, icon: t.icon, color: t.color,
      def: clone(draft.def), format: draft.format, entryKind: draft.entryKind,
      scoreMode: draft.scoreMode, elim: draft.elim,
      useColors: !!draft.useColors, label: (draft.label || '').trim(),
      cruiseId: draft.cruiseId || null,
      entries: clone(draft.entries), matches: [], playoffMatches: null, playoffField: null,
      status: 'playing', winnerId: null, createdAt: Date.now(), finishedAt: null
    };
    game.entries.forEach(function (e, i) {
      e.taps = []; e.total = null;
      if (game.useColors) {
        if (!colorByName(e.color || '')) e.color = paletteAt(i).name;
      } else {
        delete e.color; // colors off: entries carry no color at all
      }
    });
    if (draft.format === 'quick' && draft.qsRoundsOn === 'on') {
      game.qsRounds = {
        mode: draft.qsMode,                       // 'cumulative' | 'advance'
        planned: (draft.qsPlannedParsed || []).slice(), // target per round (index = round-1), null = none set
        current: 1,                               // round being scored (1-based)
        rounds: [],                               // finished rounds: {target, scores:{entryId:score|null}, advancedByFallback}
        outRound: {},                             // advance mode: entryId -> round it went out
        betweenRounds: false                      // true while the round-summary screen is the live one
      };
    }
    if (draft.format === 'bracket') {
      game.matches = draft.elim === 'double'
        ? E.buildDoubleElim(game.entries.map(function (e) { return e.id; }))
        : E.buildSingleElim(game.entries.map(function (e) { return e.id; }));
      E.resolveBracket(game.def, game.matches);
    } else if (draft.format === 'rr') {
      const g = Math.max(1, parseNum(draft.rrGames, 2));
      game.rrTarget = g;
      game.rrPairing = draft.rrPairing;
      game.playoffSize = parseInt(draft.playoffSize, 10) || 0;
      game.playoffElim = draft.playoffElim;
      if (draft.rrPairing === 'results') {
        const st = E.createResultsBasedRR(game.entries, g);
        game.matches = st.matches;
        game.rrByes = st.rrByes;
        game.rrRoundsGenerated = st.rrRoundsGenerated;
        game.rrByeByRound = {};
        if (st.rrByes.length) game.rrByeByRound[1] = st.rrByes[0];
        game.matches.forEach(function (m) { m.winnerId = null; });
      } else {
        const built = E.buildPresetRR(game.entries.map(function (e) { return e.id; }), g);
        game.matches = built.matches;
        game.rrByes = [];
        game.rrByeByRound = {};
        built.rounds.forEach(function (r, i) { if (r.bye) game.rrByeByRound[i + 1] = r.bye; });
        game.rrRoundsGenerated = built.rounds.length;
      }
    }
    S.games.push(game);
    syncGameRoster(game); // game start: everyone playing joins the cruise roster
    save();
    draft = null;
    go('play', game.id);
  }

  /* ----- Play ----- */
  function quickScore(game, e) {
    if (game.scoreMode === 'tap') return E.tapsTotal(game.def, e.taps || []);
    return e.total;
  }
  function quickSorted(game) {
    const arr = game.entries.slice();
    arr.sort(function (a, b) {
      const sa = quickScore(game, a), sb = quickScore(game, b);
      const va = sa === null ? (game.def.winDir === 'low' ? Infinity : -Infinity) : sa;
      const vb = sb === null ? (game.def.winDir === 'low' ? Infinity : -Infinity) : sb;
      return game.def.winDir === 'low' ? va - vb : vb - va;
    });
    return arr;
  }
  /* ----- Quick Score rounds -----
     State lives on game.qsRounds (absent = classic single leaderboard,
     so every pre-rounds save loads unchanged):
       mode:     'cumulative' (scores add up) | 'advance' (hit target to stay in)
       planned:  [target|null, ...] per round, index = round-1; grows as
                 staff add rounds from the summary screen
       current:  1-based round being scored
       rounds:   finished rounds [{target, scores:{entryId:score|null},
                 advancedByFallback}]
       outRound: advance mode — entryId -> round number it went out
     While a round is being scored, its scores live in the usual places
     (e.taps / e.total), so all existing scoring code works untouched;
     End round snapshots them into rounds[] and resets for the next one. */
  function qsActive(game) {
    return !!game && game.format === 'quick' && !!game.qsRounds && !!game.qsRounds.mode;
  }
  // Rank comparison honoring win direction; an unscored (null) score is
  // always worse than any real score. Negative = a ranks ahead of b.
  function rankCmp(game, a, b) {
    const an = a === null || a === undefined, bn = b === null || b === undefined;
    if (an && bn) return 0;
    const va = an ? (game.def.winDir === 'low' ? Infinity : -Infinity) : a;
    const vb = bn ? (game.def.winDir === 'low' ? Infinity : -Infinity) : b;
    return game.def.winDir === 'low' ? va - vb : vb - va;
  }
  function qsCurrentTarget(game) {
    const p = game.qsRounds.planned[game.qsRounds.current - 1];
    return p === undefined ? null : p;
  }
  function qsRoundsTotal(game, id) {
    return game.qsRounds.rounds.reduce(function (sum, r) {
      const s = r.scores[id];
      return sum + (s === null || s === undefined ? 0 : s);
    }, 0);
  }
  function qsRunningTotal(game, e) {
    const sc = quickScore(game, e);
    return qsRoundsTotal(game, e.id) + (sc === null ? 0 : sc);
  }
  function qsIsOut(game, e) {
    return qsActive(game) && game.qsRounds.mode === 'advance' && !!game.qsRounds.outRound[e.id];
  }
  function qsReached(game, score, target) {
    if (score === null || score === undefined || target === null || target === undefined) return false;
    return game.def.winDir === 'low' ? score <= target : score >= target;
  }
  // Play-screen order: classic games keep quickSorted exactly. Cumulative
  // sorts by running total; Advance puts entries still in first (by this
  // round's score), then out entries (latest exit first).
  // NOTE: rankCmp(game, x, y) is negative when x ranks ahead of y, so a
  // sort comparator must pass the values in element order — rankCmp(a, b),
  // never rankCmp(b, a) (that inverts the ranking; v1.3 shipped it
  // inverted in every rounds sort below).
  function quickPlaySorted(game) {
    if (!qsActive(game)) return quickSorted(game);
    const qs = game.qsRounds;
    if (qs.mode === 'cumulative') {
      return game.entries.slice().sort(function (a, b) {
        return rankCmp(game, qsRunningTotal(game, a), qsRunningTotal(game, b)) ||
          rankCmp(game, quickScore(game, a), quickScore(game, b));
      });
    }
    const inn = game.entries.filter(function (e) { return !qs.outRound[e.id]; });
    const out = game.entries.filter(function (e) { return !!qs.outRound[e.id]; });
    inn.sort(function (a, b) { return rankCmp(game, quickScore(game, a), quickScore(game, b)); });
    out.sort(function (a, b) {
      if (qs.outRound[b.id] !== qs.outRound[a.id]) return qs.outRound[b.id] - qs.outRound[a.id];
      const ra = qs.rounds[qs.outRound[a.id] - 1], rb = qs.rounds[qs.outRound[b.id] - 1];
      return rankCmp(game, ra ? ra.scores[a.id] : null, rb ? rb.scores[b.id] : null);
    });
    return inn.concat(out);
  }
  // Winner ids once the game is finished (game.qsRounds.rounds is final
  // by then — finishGame snapshots an in-progress round first).
  function qsWinnerIds(game) {
    const qs = game.qsRounds;
    const recs = qs.rounds;
    if (!recs.length) return [];
    let best = null, winners = [];
    const consider = function (id, score) {
      if (!winners.length || rankCmp(game, score, best) < 0) { best = score; winners = [id]; }
      else if (rankCmp(game, score, best) === 0) winners.push(id);
    };
    if (qs.mode === 'cumulative') {
      game.entries.forEach(function (e) { consider(e.id, qsRoundsTotal(game, e.id)); });
    } else {
      const last = recs[recs.length - 1];
      game.entries.forEach(function (e) {
        if (!qs.outRound[e.id]) consider(e.id, last.scores[e.id]);
      });
    }
    return winners;
  }
  function qsFinalStandings(game) {
    const qs = game.qsRounds;
    const recs = qs.rounds;
    const row = function (e, line) {
      return { id: e.id, name: e.name, cabin: e.cabin, color: entryColorNameInGame(game, e), line: line };
    };
    if (qs.mode === 'cumulative') {
      return game.entries.slice()
        .sort(function (a, b) { return rankCmp(game, qsRoundsTotal(game, a.id), qsRoundsTotal(game, b.id)); })
        .map(function (e) { return row(e, qsRoundsTotal(game, e.id) + ' pts'); });
    }
    const last = recs[recs.length - 1];
    const inn = game.entries.filter(function (e) { return !qs.outRound[e.id]; });
    const out = game.entries.filter(function (e) { return !!qs.outRound[e.id]; });
    inn.sort(function (a, b) { return rankCmp(game, last.scores[a.id], last.scores[b.id]); });
    out.sort(function (a, b) {
      if (qs.outRound[b.id] !== qs.outRound[a.id]) return qs.outRound[b.id] - qs.outRound[a.id];
      const ra = qs.rounds[qs.outRound[a.id] - 1], rb = qs.rounds[qs.outRound[b.id] - 1];
      return rankCmp(game, ra ? ra.scores[a.id] : null, rb ? rb.scores[b.id] : null);
    });
    const rows = [];
    inn.forEach(function (e) {
      const s = last.scores[e.id];
      rows.push(row(e, s === null || s === undefined ? '—' : s + ' pts'));
    });
    out.forEach(function (e) { rows.push(row(e, 'Out R' + qs.outRound[e.id])); });
    return rows;
  }
  // End the current round: snapshot scores, apply Advance elimination,
  // reset per-round scoring, and land on the round summary.
  function endRound(game) {
    const qs = game.qsRounds;
    const rnum = qs.current;
    const target = qsCurrentTarget(game);
    const rec = { target: target, scores: {}, advancedByFallback: false };
    game.entries.forEach(function (e) { rec.scores[e.id] = quickScore(game, e); });
    if (qs.mode === 'advance' && target !== null && target !== undefined) {
      const inn = game.entries.filter(function (e) { return !qs.outRound[e.id]; });
      const reached = inn.filter(function (e) { return qsReached(game, rec.scores[e.id], target); });
      if (inn.length && !reached.length) {
        // Nobody hit the target: the round's top scorer(s) advance
        // instead, so the game can never dead-end.
        rec.advancedByFallback = true;
        let best = null, haveBest = false;
        inn.forEach(function (e) {
          if (!haveBest || rankCmp(game, rec.scores[e.id], best) < 0) { best = rec.scores[e.id]; haveBest = true; }
        });
        inn.forEach(function (e) { if (rankCmp(game, rec.scores[e.id], best) !== 0) qs.outRound[e.id] = rnum; });
      } else {
        inn.forEach(function (e) { if (!qsReached(game, rec.scores[e.id], target)) qs.outRound[e.id] = rnum; });
      }
    }
    qs.rounds.push(rec);
    qs.betweenRounds = true;
    game.entries.forEach(function (e) { e.taps = []; e.total = null; });
    save();
    go('roundSummary', game.id);
  }
  // Finish from either the play screen or the round summary. For a
  // rounds game finished mid-round, the in-progress round is snapshotted
  // as the final round (no elimination applied — the game is over).
  function finishGame(game) {
    let winnerIds = [];
    if (game.format === 'quick') {
      if (qsActive(game)) {
        const qs = game.qsRounds;
        if (!qs.betweenRounds) {
          const scores = {};
          game.entries.forEach(function (e) { scores[e.id] = quickScore(game, e); });
          qs.rounds.push({ target: qsCurrentTarget(game), scores: scores, advancedByFallback: false, final: true });
        }
        winnerIds = qsWinnerIds(game);
      } else {
        const s = quickSorted(game);
        winnerIds = s.length ? [s[0].id] : [];
      }
    } else {
      const c = currentChampion(game);
      winnerIds = c ? [c] : [];
    }
    game.winnerIds = winnerIds;
    game.winnerId = winnerIds.length ? winnerIds[0] : null;
    game.status = 'finished';
    game.finishedAt = Date.now();
    save();
    go('finish', game.id);
  }
  function rrDone(game) {
    const allScored = game.matches.every(function (m) { return m.scored; });
    if (!allScored) return false;
    if (game.rrPairing === 'results') return E.rrComplete(game);
    return true;
  }
  function currentChampion(game) {
    if (game.format === 'bracket') return E.resolveBracket(game.def, game.matches);
    if (game.format === 'rr') {
      if (game.playoffMatches) return E.resolveBracket(game.def, game.playoffMatches);
      if (rrDone(game)) {
        const st = E.computeStandings(game.entries, game.matches, game.def);
        return st.length ? st[0].id : null;
      }
      return null;
    }
    return null;
  }
  function canFinish(game) {
    if (game.format === 'quick') return game.entries.length > 0;
    if (game.format === 'bracket') return !!currentChampion(game);
    // rr
    if (!rrDone(game)) return false;
    if (game.playoffMatches) return !!currentChampion(game);
    return true;
  }

  SCREENS.play = function (gameId) {
    const game = getGame(gameId);
    if (!game) return '<p class="empty">Game not found.</p>';
    const playCruise = getCruise(game.cruiseId);
    let h = '<div class="card row"><div>' + badge(game) + '</div><div class="grow">' +
      '<div class="gamename">' + esc(displayName(game)) + '</div><div class="sub">' +
      (game.label && String(game.label).trim() ? esc(game.name) + ' · ' : '') +
      (playCruise ? '🛳 ' + esc(playCruise.name) + ' · ' : '') + esc(formatLabel(game)) + ' · ' +
      (game.scoreMode === 'tap' ? 'Tap-by-tap scoring' : 'Final-total scoring') + '</div></div>' +
      '<button class="btn small secondary" id="editPlayersBtn">👥 Edit players</button>' +
      '<button class="btn small secondary" id="gameSettingsBtn">⚙ Game settings</button></div>';
    if (game.format === 'quick') h += quickPlayHTML(game);
    else if (game.format === 'bracket') h += bracketPlayHTML(game, game.matches, 'brk') +
      '<button class="btn block" id="viewBracketBtn" style="margin:10px 0">🏆 View bracket</button>' + bracketAddHTML(game);
    else h += rrPlayHTML(game);
    h += '<hr class="divider">' +
      '<button class="btn block" id="finishBtn"' + (canFinish(game) ? '' : ' disabled') + '>Finish game</button>' +
      (canFinish(game) ? '' : '<p class="note" style="text-align:center">Finish unlocks when the game has a winner.</p>') +
      '<button class="btn ghost block" id="homeBtn">Save & back to home</button>' +
      '<button class="btn danger block" id="deleteGameBtn">Delete this game</button>';
    return h;
  };
  BINDS.play = function (gameId) {
    const game = getGame(gameId);
    if (!game) return;
    document.getElementById('gameSettingsBtn').addEventListener('click', function () { showGameSettings(game); });
    document.getElementById('editPlayersBtn').addEventListener('click', function () { showEditPlayers(game); });
    document.getElementById('homeBtn').addEventListener('click', function () { go('home'); });
    document.getElementById('deleteGameBtn').addEventListener('click', function () {
      if (!confirm('Delete this game and its scores?')) return;
      S.games = S.games.filter(function (g) { return g.id !== game.id; });
      save(); go('home');
    });
    const fb = document.getElementById('finishBtn');
    if (fb) fb.addEventListener('click', function () { finishGame(game); });
    if (game.format === 'quick') bindQuick(game);
    else if (game.format === 'bracket') {
      bindMatchCards(game, game.matches, 'brk'); bindBracketAdd(game);
      const vb = document.getElementById('viewBracketBtn');
      if (vb) vb.addEventListener('click', function () { go('bracketView', game.id); });
    }
    else bindRR(game);
  };

  /* ----- Quick Score play ----- */
  function qsBannerHTML(game) {
    const qs = game.qsRounds;
    const target = qsCurrentTarget(game);
    let txt = 'Round ' + qs.current;
    if (qs.planned.length > 1 && qs.current <= qs.planned.length) txt += ' of ' + qs.planned.length + ' planned';
    if (target !== null && target !== undefined) {
      txt += ' · ' + (qs.mode === 'advance' ? 'Target' : 'Pace target') + ': ' + target + ' pts';
    }
    const sub = qs.mode === 'advance'
      ? 'Advance — reach the target to stay in'
      : 'Cumulative — round scores add up';
    return '<div class="roundbanner"><div class="roundbanner-main">' + esc(txt) + '</div>' +
      '<div class="roundbanner-sub">' + esc(sub) + '</div></div>';
  }
  function quickPlayHTML(game) {
    const rounds = qsActive(game);
    const sorted = quickPlaySorted(game);
    let h = '';
    if (rounds) h += qsBannerHTML(game);
    h += '<h2>Leaderboard</h2>';
    sorted.forEach(function (e, i) {
      const sc = quickScore(game, e);
      const ec = entryColorInGame(game, e);
      const out = qsIsOut(game, e);
      const cumulative = rounds && game.qsRounds.mode === 'cumulative';
      const bigScore = cumulative ? qsRunningTotal(game, e) : sc;
      const tint = (!out && ec && game.templateId === 'builtin-beanbag' && game.scoreMode === 'tap')
        ? ';border-left:7px solid ' + ec.hex : '';
      h += '<div class="card' + (out ? ' outcard' : '') + '" style="margin:8px 0;padding:12px' + tint + '"><div class="row spread">' +
        '<div class="grow">' + colorDotHTML(ec) + '<span class="gamename" style="font-size:17px">' + (i + 1) + '. ' + esc(e.name) + '</span>' +
        (e.cabin ? '<span class="tag">Cabin ' + esc(e.cabin) + '</span>' : '') +
        (out ? '<span class="tag outtag">Out · Round ' + game.qsRounds.outRound[e.id] + '</span>' : '') + '</div>' +
        '<div class="score" style="font-size:20px;font-weight:800">' + (out || bigScore === null ? '—' : bigScore) + '</div></div>';
      if (out) {
        h += '<div class="sub" style="margin-top:4px">Out in round ' + game.qsRounds.outRound[e.id] + ' — no longer scoring.</div>';
      } else if (game.scoreMode === 'tap') {
        const taps = e.taps || [];
        h += '<div class="sub" style="margin-top:4px">' + taps.length + '/' + game.def.attempts + ' attempts' +
          (taps.length ? ' · ' + taps.map(function (ti) { return esc(game.def.buttons[ti] ? game.def.buttons[ti].label : '?'); }).join(', ') : '') +
          (cumulative ? ' · This round: ' + sc + ' · Total: ' + bigScore : '') + '</div>' +
          '<div class="taprow">' + game.def.buttons.map(function (b, bi) {
            return '<button class="tapbtn" data-tap="' + e.id + ':' + bi + '"' + (taps.length >= game.def.attempts ? ' disabled' : '') + '>' + esc(b.label) + '<small>' + b.points + ' pts</small></button>';
          }).join('') + '</div>' +
          (taps.length ? '<button class="btn small secondary" data-undo="' + e.id + '" style="margin-top:8px">↩ Undo last tap</button>' : '');
      } else {
        h += '<div class="entryrow" style="margin-top:8px"><input type="text" inputmode="numeric" placeholder="' + (rounds ? 'Round total' : 'Final total') + '" value="' +
          (e.total === null ? '' : e.total) + '" data-total="' + e.id + '"><span class="sub">' +
          (cumulative ? 'Running total: ' + bigScore + ' · ' : '') + 'tap outside the box to save</span></div>';
      }
      h += '</div>';
    });
    h += '<h3>Add a walk-up</h3><div class="entryrow">' +
      '<input type="text" class="nm" id="walkName" placeholder="Name" autocomplete="off">' +
      '<input type="text" class="cb" id="walkCabin" placeholder="Cabin" inputmode="numeric">' +
      '<button class="iconbtn" id="walkAdd" aria-label="Add">＋</button></div>';
    if (rounds) {
      h += '<button class="btn block" id="endRoundBtn" style="margin-top:16px">End round ' + game.qsRounds.current + ' → round summary</button>' +
        '<p class="note" style="text-align:center">Ending the round locks in this round’s scores' +
        (game.qsRounds.mode === 'advance' ? ' and settles who advances' : '') + '.</p>';
    }
    return h;
  }
  function bindQuick(game) {
    const er = document.getElementById('endRoundBtn');
    if (er) er.addEventListener('click', function () { endRound(game); });
    document.querySelectorAll('[data-tap]').forEach(function (b) {
      b.addEventListener('click', function () {
        const parts = b.getAttribute('data-tap').split(':');
        const e = game.entries.find(function (x) { return x.id === parts[0]; });
        if (e && e.taps.length < game.def.attempts) { e.taps.push(parseInt(parts[1], 10)); save(); render(); }
      });
    });
    document.querySelectorAll('[data-undo]').forEach(function (b) {
      b.addEventListener('click', function () {
        const e = game.entries.find(function (x) { return x.id === b.getAttribute('data-undo'); });
        if (e && e.taps.length) { e.taps.pop(); save(); render(); }
      });
    });
    document.querySelectorAll('[data-total]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        const e = game.entries.find(function (x) { return x.id === inp.getAttribute('data-total'); });
        if (e) { e.total = inp.value.trim() === '' ? null : parseNum(inp.value, 0); save(); render(); }
      });
    });
    document.getElementById('walkAdd').addEventListener('click', function () {
      const nm = document.getElementById('walkName');
      if (!nm.value.trim()) { nm.focus(); return; }
      const e = { id: E.uid('e'), name: nm.value.trim(), cabin: document.getElementById('walkCabin').value.trim(), taps: [], total: null };
      if (colorsOn(game)) e.color = paletteAt(game.entries.length).name;
      game.entries.push(e);
      syncRosterEntry(game, e); // walk-ups join the cruise roster too
      save(); render();
    });
  }

  /* ----- Quick Score round summary -----
     Shown when a round ends. Staff see who advanced / the running
     totals, set or edit the NEXT round's target here (this is the
     "after the round" half of Jeff's ask — targets can be planned at
     setup AND set here), then start the next round or finish. */
  SCREENS.roundSummary = function (gameId) {
    const game = getGame(gameId);
    if (!game || !qsActive(game) || !game.qsRounds.rounds.length) return '<p class="empty">Game not found.</p>';
    const qs = game.qsRounds;
    const rec = qs.rounds[qs.rounds.length - 1];
    const rnum = qs.rounds.length;
    let h = '<div class="card row"><div>' + badge(game) + '</div><div class="grow">' +
      '<div class="gamename">' + esc(displayName(game)) + '</div><div class="sub">' + esc(formatLabel(game)) + '</div></div></div>';
    h += '<h1>Round ' + rnum + ' summary</h1>';
    if (rec.target !== null && rec.target !== undefined) {
      h += '<p class="note">' + (qs.mode === 'advance' ? 'Target to stay in' : 'Pace target') + ': <b>' + rec.target + ' pts</b></p>';
    }
    if (rec.advancedByFallback) {
      h += '<div class="card" style="border-left:7px solid #e09e00"><b>Nobody reached the target</b> — so the round’s top scorer(s) advance instead and the game goes on.</div>';
    }
    // Rows: Advance — advancers first (by round score), then the outs.
    // Cumulative — by running total.
    let rows;
    if (qs.mode === 'advance') {
      const stillIn = game.entries.filter(function (e) { return !qs.outRound[e.id]; });
      const outNow = game.entries.filter(function (e) { return qs.outRound[e.id] === rnum; });
      const outBefore = game.entries.filter(function (e) { return qs.outRound[e.id] && qs.outRound[e.id] !== rnum; });
      const byScore = function (a, b) { return rankCmp(game, rec.scores[a.id], rec.scores[b.id]); };
      stillIn.sort(byScore); outNow.sort(byScore);
      rows = stillIn.map(function (e) { return { e: e, status: 'advanced' }; })
        .concat(outNow.map(function (e) { return { e: e, status: 'out' }; }))
        .concat(outBefore.map(function (e) { return { e: e, status: 'outbefore' }; }));
    } else {
      rows = game.entries.slice()
        .sort(function (a, b) { return rankCmp(game, qsRoundsTotal(game, a.id), qsRoundsTotal(game, b.id)); })
        .map(function (e) { return { e: e, status: 'total' }; });
    }
    h += '<div class="card" style="padding:8px 12px"><table class="stand"><tr><th>' +
      (game.entryKind === 'teams' ? 'Team' : 'Player') + '</th><th class="num">Round ' + rnum + '</th>' +
      (qs.mode === 'cumulative' ? '<th class="num">Total</th>' : '<th>Status</th>') + '</tr>';
    rows.forEach(function (r) {
      const s = rec.scores[r.e.id];
      h += '<tr' + (r.status === 'advanced' || r.status === 'total' ? '' : ' class="outrow"') + '><td>' + entryDotHTML(game, r.e.id) + esc(r.e.name) +
        (r.e.cabin ? ' <span class="sub">(cabin ' + esc(r.e.cabin) + ')</span>' : '') + '</td>' +
        '<td class="num">' + (s === null || s === undefined ? '—' : s) + '</td>';
      if (qs.mode === 'cumulative') h += '<td class="num"><b>' + qsRoundsTotal(game, r.e.id) + '</b></td>';
      else if (r.status === 'advanced') h += '<td><span class="tag win">✓ Advanced</span></td>';
      else if (r.status === 'out') h += '<td><span class="tag outtag">Out</span></td>';
      else h += '<td><span class="sub">Out R' + qs.outRound[r.e.id] + '</span></td>';
      h += '</tr>';
    });
    h += '</table></div>';
    if (qs.mode === 'advance') {
      const stillIn = game.entries.filter(function (e) { return !qs.outRound[e.id]; });
      if (stillIn.length === 1) {
        h += '<div class="card"><b>Only ' + esc(stillIn[0].name) + ' is still in.</b> ' +
          '<span class="sub">Finish now to crown them — or start another round anyway.</span></div>';
      }
    }
    const nextTarget = qs.planned[rnum];
    h += '<h2>Next round</h2>' +
      '<label class="field"><span>Round ' + (rnum + 1) + ' target' + (qs.mode === 'cumulative' ? ' (optional pace marker)' : '') + '</span>' +
      '<input type="text" id="nextTarget" inputmode="numeric" placeholder="Target pts" value="' +
      (nextTarget === null || nextTarget === undefined ? '' : nextTarget) + '"></label>' +
      '<button class="btn block" id="startNextBtn">Start round ' + (rnum + 1) + '</button>' +
      '<button class="btn secondary block" id="summaryFinishBtn">Finish game</button>' +
      '<button class="btn ghost block" id="summaryHomeBtn">Save & back to home</button>';
    return h;
  };
  BINDS.roundSummary = function (gameId) {
    const game = getGame(gameId);
    if (!game || !qsActive(game)) return;
    const qs = game.qsRounds;
    const rnum = qs.rounds.length;
    document.getElementById('startNextBtn').addEventListener('click', function () {
      const raw = document.getElementById('nextTarget').value.trim();
      let target = null;
      if (raw !== '') { const n = parseNum(raw, -1); target = n < 0 ? null : n; }
      while (qs.planned.length < rnum) qs.planned.push(null);
      qs.planned[rnum] = target;
      qs.current = rnum + 1;
      qs.betweenRounds = false;
      save();
      go('play', game.id);
    });
    document.getElementById('summaryFinishBtn').addEventListener('click', function () { finishGame(game); });
    document.getElementById('summaryHomeBtn').addEventListener('click', function () { go('home'); });
  };

  /* ----- Match cards + inline scorer (bracket & round robin) ----- */
  function matchLabel(game, matches, m) {
    return 'M' + (matches.indexOf(m) + 1);
  }
  /* The entry a win/lose feeder slot will be filled by, once its
     feeder match has a result — even before resolveBracket sets this
     match's own aId/bId (those wait for BOTH feeders to resolve).
     Display only: each winner's name shows in the next round as soon
     as they win their match (Jeff's pick, v1.6.1), while the Score
     button still unlocks only when both participants are set. */
  function feederKnownId(matches, src) {
    if (!src || (src.t !== 'win' && src.t !== 'lose')) return null;
    const fm = matches.find(function (x) { return x.id === src.m; });
    if (!fm) return null;
    return (src.t === 'win' ? fm.winnerId : fm.loserId) || null;
  }
  function sideName(game, matches, m, side) {
    const id = side === 'a' ? m.aId : m.bId;
    if (id) return entryName(game, id);
    const src = side === 'a' ? m.srcA : m.srcB;
    if (src && (src.t === 'win' || src.t === 'lose')) {
      const known = feederKnownId(matches, src);
      if (known) return entryName(game, known);
      const srcMatch = matches.find(function (x) { return x.id === src.m; });
      if (!srcMatch) return 'TBD';
      return (src.t === 'win' ? 'Winner of ' : 'Loser of ') + matchStageName(game, matches, srcMatch);
    }
    return 'TBD';
  }
  function sideNameHTML(game, matches, m, side) {
    const id = side === 'a' ? m.aId : m.bId;
    if (id) return nameWithDotHTML(game, id);
    const src = side === 'a' ? m.srcA : m.srcB;
    const known = feederKnownId(matches, src);
    return known ? nameWithDotHTML(game, known) : esc(sideName(game, matches, m, side));
  }
  function matchCardHTML(game, matches, m, where) {
    const isOpen = openScorer && openScorer.matchId === m.id;
    let vs, scoreTxt = '';
    if (m.autoBye) {
      vs = nameWithDotHTML(game, m.winnerId) + ' <span class="tag">bye</span>';
    } else {
      vs = sideNameHTML(game, matches, m, 'a') + ' <span class="sub">vs</span> ' + sideNameHTML(game, matches, m, 'b');
    }
    if (m.scored && !m.autoBye) scoreTxt = '<span class="score">' + m.sa + ' – ' + m.sb + '</span>';
    let winnerTag = '';
    if (m.scored && m.winnerId && !m.autoBye) winnerTag = '<span class="tag win">✓ ' + nameWithDotHTML(game, m.winnerId) + '</span>';
    const canScore = !m.autoBye && m.aId && m.bId;
    let h = '<div class="match"><div class="row spread"><div class="grow"><span class="sub">' + matchLabel(game, matches, m) + '</span> ' +
      '<span class="vs">' + vs + '</span>' + winnerTag + '</div>' + scoreTxt + '</div>';
    if (canScore) {
      h += '<button class="btn small ' + (m.scored ? 'secondary' : '') + '" data-score="' + m.id + '" style="margin-top:8px">' +
        (isOpen ? 'Close' : (m.scored ? 'Edit score' : 'Score')) + '</button>';
    }
    if (isOpen) h += scorerHTML(game, m);
    h += '</div>';
    return h;
  }
  function scorerHTML(game, m) {
    const def = game.def;
    let h = '<div class="scorer" id="scorerBox">';
    if (game.scoreMode === 'total') {
      h += '<div class="sidebox"><div class="who">' + nameWithDotHTML(game, m.aId) + '</div>' +
        '<input type="text" inputmode="numeric" id="scA" value="' + (m.sa === null ? '' : m.sa) + '" placeholder="Final total"></div>' +
        '<div class="sidebox"><div class="who">' + nameWithDotHTML(game, m.bId) + '</div>' +
        '<input type="text" inputmode="numeric" id="scB" value="' + (m.sb === null ? '' : m.sb) + '" placeholder="Final total"></div>';
    } else {
      [ ['a', m.aId], ['b', m.bId] ].forEach(function (pair) {
        const side = pair[0], eid = pair[1];
        const taps = side === 'a' ? openScorer.tapsA : openScorer.tapsB;
        const total = E.tapsTotal(def, taps);
        const ec = entryColorById(game, eid);
        const tint = (game.templateId === 'builtin-beanbag' && ec) ? ' style="border-left:7px solid ' + ec.hex + '"' : '';
        h += '<div class="sidebox"' + tint + '><div class="row spread"><div class="who">' + nameWithDotHTML(game, eid) + '</div>' +
          '<div class="sub"><span id="scCount' + side + '">' + taps.length + '/' + def.attempts + '</span> · <b id="scTotal' + side + '">' + total + '</b> pts</div></div>' +
          '<div class="taprow">' + def.buttons.map(function (b, bi) {
            return '<button class="tapbtn" data-mtap="' + side + ':' + bi + '"' + (taps.length >= def.attempts ? ' disabled' : '') + '>' + esc(b.label) + '<small>' + b.points + ' pts</small></button>';
          }).join('') + '</div>' +
          (taps.length ? '<button class="btn small secondary" data-mundo="' + side + '" style="margin-top:8px">↩ Undo last tap</button>' : '') +
          '</div>';
      });
    }
    h += '<button class="btn block" id="scSave">Save score</button></div>';
    return h;
  }
  function updateScorerDOM(game) {
    if (!openScorer) return;
    const def = game.def;
    [ ['a', openScorer.tapsA], ['b', openScorer.tapsB] ].forEach(function (pair) {
      const c = document.getElementById('scCount' + pair[0]);
      const t = document.getElementById('scTotal' + pair[0]);
      if (c) c.textContent = pair[1].length + '/' + def.attempts;
      if (t) t.textContent = E.tapsTotal(def, pair[1]);
    });
    // Re-render only the scorer box to refresh disabled states / undo buttons.
    const gameObj = getGame(openScorer.gameId);
    const m = findMatch(gameObj, openScorer.matchId);
    const box = document.getElementById('scorerBox');
    if (box && m) { box.outerHTML = scorerHTML(gameObj, m); bindScorer(gameObj); }
  }
  function findMatch(game, matchId) {
    let m = game.matches.find(function (x) { return x.id === matchId; });
    if (!m && game.playoffMatches) m = game.playoffMatches.find(function (x) { return x.id === matchId; });
    return m || null;
  }
  function bindScorer(game) {
    if (!openScorer) return;
    document.querySelectorAll('[data-mtap]').forEach(function (b) {
      b.addEventListener('click', function () {
        const parts = b.getAttribute('data-mtap').split(':');
        const arr = parts[0] === 'a' ? openScorer.tapsA : openScorer.tapsB;
        if (arr.length < game.def.attempts) { arr.push(parseInt(parts[1], 10)); updateScorerDOM(game); }
      });
    });
    document.querySelectorAll('[data-mundo]').forEach(function (b) {
      b.addEventListener('click', function () {
        const arr = b.getAttribute('data-mundo') === 'a' ? openScorer.tapsA : openScorer.tapsB;
        arr.pop(); updateScorerDOM(game);
      });
    });
    const sv = document.getElementById('scSave');
    if (sv) sv.addEventListener('click', function () {
      const m = findMatch(game, openScorer.matchId);
      if (!m) { openScorer = null; render(); return; }
      let sa, sb;
      if (game.scoreMode === 'total') {
        const va = document.getElementById('scA').value.trim();
        const vb = document.getElementById('scB').value.trim();
        if (va === '' || vb === '') { alert('Enter both scores first.'); return; }
        sa = parseNum(va, 0); sb = parseNum(vb, 0);
      } else {
        m.tapsA = openScorer.tapsA.slice();
        m.tapsB = openScorer.tapsB.slice();
        sa = E.tapsTotal(game.def, m.tapsA);
        sb = E.tapsTotal(game.def, m.tapsB);
      }
      commitMatchScore(game, m, sa, sb);
    });
  }
  function commitMatchScore(game, m, sa, sb) {
    const isBracketMatch = m.kind === 'brk';
    if (isBracketMatch) {
      if (sa === sb) { alert('A bracket match cannot end in a tie — one more round or a tiebreak, then enter the final score.'); return; }
      m.sa = sa; m.sb = sb; m.scored = true;
      const inPlayoff = game.playoffMatches && game.playoffMatches.indexOf(m) >= 0;
      E.resolveBracket(game.def, inPlayoff ? game.playoffMatches : game.matches);
    } else {
      E.scoreRRMatch(game, game.def, m.id, sa, sb);
      game.rrNote = null; // a schedule note has done its job once play moves on
    }
    openScorer = null;
    save(); render();
  }
  function bindMatchCards(game, matches, where) {
    document.querySelectorAll('[data-score]').forEach(function (b) {
      b.addEventListener('click', function () {
        const mid = b.getAttribute('data-score');
        if (openScorer && openScorer.matchId === mid) { openScorer = null; render(); return; }
        const m = findMatch(game, mid);
        openScorer = {
          gameId: game.id, matchId: mid,
          tapsA: m && m.tapsA ? m.tapsA.slice() : [],
          tapsB: m && m.tapsB ? m.tapsB.slice() : []
        };
        render();
        const box = document.getElementById('scorerBox');
        if (box) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    });
    bindScorer(game);
  }

  function roundName(stage, round, totalRounds) {
    if (stage === 'gf') return 'Grand Final';
    if (round === totalRounds) return 'Final';
    if (round === totalRounds - 1) return 'Semifinals';
    if (round === totalRounds - 2) return 'Quarterfinals';
    return 'Round ' + round;
  }
  /* Friendly name for one bracket match: its stage/round name plus its
     number within the round — "Quarterfinal 1", "Semifinal 2",
     "Winners SF 2", "Losers Final", "Grand Final". Feeder labels
     ("Winner of Semifinal 1") are built from this, so the whole
     bracket reads properly before any of it is played. */
  function matchStageName(game, matches, m) {
    if (m.stage === 'gf') return 'Grand Final';
    const stageMs = matches.filter(function (x) { return x.stage === m.stage; });
    let total = 0;
    stageMs.forEach(function (x) { if (x.round > total) total = x.round; });
    const inRound = stageMs.filter(function (x) { return x.round === m.round; });
    const idx = inRound.indexOf(m) + 1;
    const prefix = m.stage === 'wb' ? 'Winners ' : (m.stage === 'lb' ? 'Losers ' : '');
    let base;
    if (m.round === total) base = 'Final';
    else if (m.round === total - 1) base = prefix ? 'SF' : 'Semifinal';
    else if (m.round === total - 2) base = prefix ? 'QF' : 'Quarterfinal';
    else base = 'Round ' + m.round;
    return prefix + base + (inRound.length > 1 ? ' ' + idx : '');
  }
  function bracketPlayHTML(game, matches, where, noBanner) {
    let h = '';
    const stages = where === 'po'
      ? [['brk', 'Playoff'], ['wb', 'Winners bracket'], ['lb', 'Losers bracket'], ['gf', '']]
      : (game.elim === 'double' ? [['wb', 'Winners bracket'], ['lb', 'Losers bracket'], ['gf', '']] : [['brk', '']]);
    stages.forEach(function (st) {
      const ms = matches.filter(function (m) { return m.stage === st[0]; });
      if (!ms.length) return;
      if (st[1]) h += '<h2>' + st[1] + '</h2>';
      const rounds = [];
      ms.forEach(function (m) { if (rounds.indexOf(m.round) < 0) rounds.push(m.round); });
      rounds.sort(function (a, b) { return a - b; });
      rounds.forEach(function (r) {
        if (st[0] !== 'gf') h += '<h3>' + roundName(st[0], r, rounds[rounds.length - 1]) + '</h3>';
        ms.filter(function (m) { return m.round === r; }).forEach(function (m) {
          h += matchCardHTML(game, matches, m, where);
        });
      });
    });
    const champ = E.resolveBracket(game.def, matches);
    if (champ && !noBanner) h += '<div class="winnerbanner"><div class="crown">🏆</div><div class="sub" style="color:#cfe8f5">Champion</div><div class="wname">' + nameWithDotHTML(game, champ) + '</div></div>';
    return h;
  }

  /* ----- Round Robin play ----- */
  function rrPlayHTML(game) {
    const st = E.computeStandings(game.entries, game.matches, game.def);
    const playedMap = E.rrGamesPlayed(game);
    let h = '';
    if (game.rrNote) h += '<div class="card" style="border-left:7px solid #0b6fa4">' + esc(game.rrNote) + '</div>';
    h += '<h2>Standings</h2><div class="card" style="padding:8px 12px"><table class="stand"><tr><th>#</th><th>' +
      (game.entryKind === 'teams' ? 'Team' : 'Player') + '</th><th class="num">P</th><th class="num">W</th><th class="num">L</th><th class="num">Diff</th><th class="num">Pts</th></tr>';
    st.forEach(function (r, i) {
      const e = game.entries.find(function (x) { return x.id === r.id; });
      // Results-based walk-ups sit in the pool with no match and no
      // bye yet — they join properly when the next round is paired.
      const joins = game.rrPairing === 'results' && !game.playoffMatches && (playedMap[r.id] || 0) === 0;
      h += '<tr' + (i === 0 ? ' class="top"' : '') + '><td>' + (i + 1) + '</td><td>' + (e ? entryDotHTML(game, e.id) : '') + esc(e ? e.name : r.id) +
        (e && e.cabin ? ' <span class="sub">(' + esc(e.cabin) + ')</span>' : '') + (joins ? '<span class="tag">Joins next round</span>' : '') + '</td>' +
        '<td class="num">' + r.played + '</td><td class="num">' + r.w + '</td><td class="num">' + r.l + '</td>' +
        '<td class="num">' + (r.diff > 0 ? '+' : '') + r.diff + '</td><td class="num">' + r.pf + '</td></tr>';
    });
    h += '</table></div>';
    const rounds = [];
    game.matches.forEach(function (m) { if (rounds.indexOf(m.round) < 0) rounds.push(m.round); });
    rounds.sort(function (a, b) { return a - b; });
    rounds.forEach(function (r) {
      h += '<h3>Round ' + r + '</h3>';
      if (game.rrByeByRound && game.rrByeByRound[r]) {
        h += '<p class="note">Bye this round: <b>' + nameWithDotHTML(game, game.rrByeByRound[r]) + '</b>' + (game.rrPairing === 'results' ? ' (counts as one of their games)' : '') + '</p>';
      }
      game.matches.filter(function (m) { return m.round === r; }).forEach(function (m) {
        h += matchCardHTML(game, game.matches, m, 'rr');
      });
    });
    if (game.rrPairing === 'results' && !rrDone(game)) {
      const allScored = game.matches.every(function (m) { return m.scored; });
      if (allScored) {
        h += '<button class="btn block" id="genRoundBtn">Pair round ' + (game.rrRoundsGenerated + 1) + ' from the standings</button>' +
          '<p class="note" style="text-align:center">The next round is only created when you tap this — never automatically.</p>';
      } else {
        h += '<p class="note">Score every match in round ' + game.rrRoundsGenerated + ', then a button here pairs the next round from the standings.</p>';
      }
    }
    if (rrDone(game)) {
      h += '<div class="card"><b>Round robin complete.</b> <span class="sub">Leader: ' + (st.length ? nameWithDotHTML(game, st[0].id) : '—') + '</span></div>';
      if (game.playoffSize > 0 && !game.playoffMatches) {
        const k = Math.min(game.playoffSize, game.entries.length);
        if (k >= 2) h += '<button class="btn block" id="startPlayoffBtn">Start playoff — top ' + k + ' (' + (game.playoffElim === 'double' ? 'double' : 'single') + ' elimination)</button>';
      }
    }
    // Mid-game walk-ups (v1.4). Blocked once the playoff has started.
    if (game.playoffMatches) {
      h += '<div class="card"><span class="sub">Players can’t be added once the playoff has started.</span></div>';
      h += '<h2>Playoff bracket</h2>' +
        '<button class="btn block" id="viewBracketBtn">🏆 View bracket</button>';
      if (playoffScored(game)) {
        h += '<p class="note" style="text-align:center">Bracket locked — a playoff match has been scored. To swap a person, use Edit players.</p>';
      } else {
        h += '<button class="btn secondary block" id="regenBracketBtn">↻ Regenerate bracket</button>' +
          '<p class="note" style="text-align:center">Review the field — replace a player from the standings — and rebuild the bracket. No playoff match has been scored yet.</p>';
      }
      h += bracketPlayHTML(game, game.playoffMatches, 'po');
    } else {
      h += '<h3>Add a walk-up</h3><div class="entryrow">' +
        '<input type="text" class="nm" id="rrWalkName" placeholder="Name" autocomplete="off">' +
        '<input type="text" class="cb" id="rrWalkCabin" placeholder="Cabin" inputmode="numeric">' +
        '<button class="iconbtn" id="rrWalkAdd" aria-label="Add">＋</button></div>' +
        (game.rrPairing === 'preset'
          ? '<p class="note">Adding a player rebuilds the unscored part of the schedule around the matches already played — scored matches never change.</p>'
          : '<p class="note">A walk-up joins the pool right away and is paired when the next round is paired from the standings.</p>');
      if (game.rrPairing === 'preset' && !rrDone(game)) {
        h += '<button class="btn secondary block" id="regenRRBtn" data-regenrr="1">↻ Regenerate remaining schedule</button>' +
          '<p class="note" style="text-align:center">Rebuilds the unscored pairings for the current players. Scored matches are kept exactly as they are.</p>';
      }
    }
    return h;
  }
  function bindRR(game) {
    disarmRRRegen(); // every fresh render starts disarmed (same pattern as history delete)
    bindMatchCards(game, game.matches, 'rr'); // one binding covers playoff cards too (findMatch searches both)
    const gen = document.getElementById('genRoundBtn');
    if (gen) gen.addEventListener('click', function () {
      const byesBefore = (game.rrByes || []).length;
      const rn = E.generateNextRRRound(game, game.def);
      if (rn !== null) {
        if ((game.rrByes || []).length > byesBefore) {
          game.rrByeByRound = game.rrByeByRound || {};
          game.rrByeByRound[rn] = game.rrByes[game.rrByes.length - 1];
        }
        game.rrNote = null;
        save(); render();
      }
    });
    const sp = document.getElementById('startPlayoffBtn');
    if (sp) sp.addEventListener('click', function () {
      // v1.6: review the field first — the bracket is only built when
      // staff tap "Generate bracket" on the field screen.
      ensurePlayoffField(game);
      save();
      go('playoffField', game.id);
    });
    const vb = document.getElementById('viewBracketBtn');
    if (vb) vb.addEventListener('click', function () { go('bracketView', game.id); });
    const rb = document.getElementById('regenBracketBtn');
    if (rb) rb.addEventListener('click', function () {
      ensurePlayoffField(game); // the field as last generated is preserved
      save();
      go('playoffField', game.id);
    });
    const wa = document.getElementById('rrWalkAdd');
    if (wa) wa.addEventListener('click', function () {
      const nm = document.getElementById('rrWalkName');
      const name = nm.value.trim();
      if (!name) { nm.focus(); return; }
      if (game.playoffMatches) return; // the form is not rendered then; defensive
      const wasComplete = game.rrPairing === 'preset' && rrDone(game);
      const walkEntry = {
        id: E.uid('e'), name: name,
        cabin: document.getElementById('rrWalkCabin').value.trim(),
        taps: [], total: null
      };
      if (colorsOn(game)) walkEntry.color = paletteAt(game.entries.length).name;
      game.entries.push(walkEntry);
      syncRosterEntry(game, walkEntry); // walk-ups join the cruise roster too
      if (game.rrPairing === 'preset') {
        const sum = regeneratePresetRR(game);
        game.rrNote = (wasComplete
          ? 'Late entry added — some players get an extra game so ' + name + ' can play. '
          : '') + regenSummaryText(sum);
      } else {
        game.rrNote = name + ' added — joins the pool now and will be paired when the next round is paired from the standings.';
      }
      save(); render();
    });
    const rg = document.getElementById('regenRRBtn');
    if (rg) rg.addEventListener('click', function () {
      if (!rrRegenArmed) {
        // First tap arms only (two-step in-app confirm, v1.3.1 pattern).
        disarmRRRegen();
        rrRegenArmed = true;
        rg.textContent = 'Confirm regenerate?';
        rg.classList.add('confirming');
        rrRegenArmTimer = setTimeout(disarmRRRegen, 4000);
        return;
      }
      disarmRRRegen();
      const sum = regeneratePresetRR(game);
      game.rrNote = regenSummaryText(sum);
      save(); render();
    });
  }

  /* ----- Playoff field + whole-bracket view (v1.6) -----
     Format-level features: they hang off game.format / playoffMatches
     only, never off a game definition or template. After a round robin,
     staff review the playoff FIELD (game.playoffField — entry IDs in
     seed order) before anything is built: they can change the size,
     flip single/double elimination, and replace any seed with another
     player from the standings. "Generate bracket" builds
     game.playoffMatches from the field with the standard seeding
     (1v8, 5v4, 3v6, 7v2 — engines seedPositions, unchanged). While no
     playoff match is scored, generating again replaces the bracket
     wholesale — that is the regeneration path. Once a playoff match is
     scored the field is final (Edit players substitutions, which work
     by entry ID, remain available). */
  let pfReplaceSeed = null;  // seed index whose replacement picker is open
  let pfFlash = null;        // one-shot note for the field screen
  function playoffStandingsLine(r) {
    return r.w + 'W–' + r.l + 'L' + (r.d ? '–' + r.d + 'D' : '') + ' · ' +
      (r.diff > 0 ? '+' : '') + r.diff + ' diff · ' + r.pf + ' pts';
  }
  function derivePlayoffField(game) {
    const st = E.computeStandings(game.entries, game.matches, game.def);
    const k = Math.min(Math.max(2, game.playoffSize || 0), game.entries.length);
    game.playoffField = st.slice(0, k).map(function (r) { return r.id; });
    return game.playoffField;
  }
  function ensurePlayoffField(game) {
    const k = Math.min(Math.max(2, game.playoffSize || 0), game.entries.length);
    const f = game.playoffField;
    let valid = Array.isArray(f) && f.length === k;
    if (valid) {
      const seen = {};
      valid = f.every(function (id) {
        if (seen[id]) return false;
        seen[id] = true;
        return game.entries.some(function (e) { return e.id === id; });
      });
    }
    if (!valid) derivePlayoffField(game);
    return game.playoffField;
  }
  function playoffScored(game) {
    return !!(game.playoffMatches && game.playoffMatches.some(function (m) { return m.scored && !m.autoBye; }));
  }
  function buildPlayoffFromField(game) {
    const seeds = (game.playoffField || []).slice();
    game.playoffMatches = game.playoffElim === 'double'
      ? E.buildDoubleElim(seeds)
      : E.buildSingleElim(seeds);
    E.resolveBracket(game.def, game.playoffMatches);
    game.rrNote = null;
  }
  SCREENS.playoffField = function (gameId) {
    const game = getGame(gameId);
    if (!game || game.format !== 'rr' || (game.playoffSize || 0) < 2) {
      return '<p class="empty">No playoff field for this game.</p>' +
        '<button class="btn ghost block" id="pfBackBtn">Back</button>';
    }
    ensurePlayoffField(game);
    const flash = pfFlash; pfFlash = null;
    const st = E.computeStandings(game.entries, game.matches, game.def);
    const lineById = {};
    st.forEach(function (r) { lineById[r.id] = r; });
    let h = '<h1>Playoff field — top ' + game.playoffField.length + '</h1>' +
      '<p class="note">Seeded from the final round robin standings (standard seeding: 1 plays ' +
      game.playoffField.length + ', 2 plays ' + (game.playoffField.length - 1) + ', and so on). ' +
      'Replace anyone who can’t play, then generate the bracket.</p>';
    if (flash) h += '<div class="card" style="border-left:7px solid #0b6fa4">' + esc(flash) + '</div>';
    h += '<h2>Playoff size</h2>' + segHTML('segPfSize', [
      { v: '2', label: 'Top 2' }, { v: '4', label: 'Top 4' }, { v: '8', label: 'Top 8' }], String(game.playoffSize)) +
      '<h2>Playoff style</h2>' + segHTML('segPfElim', [
        { v: 'single', label: 'Single elimination' }, { v: 'double', label: 'Double elimination' }], game.playoffElim) +
      '<h2>Seeds</h2>';
    const inField = {};
    game.playoffField.forEach(function (id) { inField[id] = true; });
    game.playoffField.forEach(function (id, i) {
      const r = lineById[id];
      h += '<div class="card row" style="margin:6px 0;padding:10px 12px"><span class="seedno">' + (i + 1) + '</span>' +
        '<div class="grow"><span class="gamename" style="font-size:16px">' + nameWithDotHTML(game, id) + '</span>' +
        (r ? '<div class="sub">' + esc(playoffStandingsLine(r)) + '</div>' : '') + '</div>' +
        '<button class="btn small secondary" data-replace-seed="' + i + '">Replace…</button></div>';
      if (pfReplaceSeed === i) {
        const cands = st.filter(function (row) { return !inField[row.id]; });
        h += '<div class="card" style="margin:2px 0 10px;padding:10px 12px"><div class="sub" style="margin-bottom:6px">Replace seed ' + (i + 1) + ' with…</div>';
        if (!cands.length) h += '<p class="note">Everyone is already in the field.</p>';
        cands.forEach(function (row) {
          h += '<button class="btn block secondary" data-pick-replacement="' + row.id + '" style="margin:4px 0">' +
            nameWithDotHTML(game, row.id) + ' <span class="sub">(' + esc(playoffStandingsLine(row)) + ')</span></button>';
        });
        h += '<button class="btn ghost block" id="pfReplaceCancel">Cancel</button></div>';
      }
    });
    h += '<button class="btn ghost block" id="pfResetBtn">Reset field to standings</button>' +
      '<button class="btn block" id="pfGenerateBtn" style="margin-top:12px">Generate bracket</button>' +
      '<button class="btn ghost block" id="pfBackBtn">Back to game</button>';
    return h;
  };
  BINDS.playoffField = function (gameId) {
    const game = getGame(gameId);
    const back = document.getElementById('pfBackBtn');
    if (back) back.addEventListener('click', function () { go('play', gameId); });
    if (!game || game.format !== 'rr') return;
    bindSeg('segPfSize', null, function (v) {
      const size = parseInt(v, 10);
      if (size === game.playoffSize) return;
      const st = E.computeStandings(game.entries, game.matches, game.def);
      const oldK = Math.min(game.playoffSize || 0, game.entries.length);
      const wasCustom = Array.isArray(game.playoffField) &&
        JSON.stringify(game.playoffField) !== JSON.stringify(st.slice(0, oldK).map(function (r) { return r.id; }));
      game.playoffSize = size;
      derivePlayoffField(game);
      pfReplaceSeed = null;
      pfFlash = wasCustom ? 'Field reset to the top ' + game.playoffField.length + ' from the standings — replacements were cleared.' : null;
      save(); render();
    });
    bindSeg('segPfElim', null, function (v) { game.playoffElim = v; save(); });
    document.querySelectorAll('[data-replace-seed]').forEach(function (b) {
      b.addEventListener('click', function () {
        pfReplaceSeed = parseInt(b.getAttribute('data-replace-seed'), 10);
        render();
      });
    });
    document.querySelectorAll('[data-pick-replacement]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (pfReplaceSeed === null) return;
        game.playoffField[pfReplaceSeed] = b.getAttribute('data-pick-replacement');
        pfReplaceSeed = null;
        save(); render();
      });
    });
    const cancel = document.getElementById('pfReplaceCancel');
    if (cancel) cancel.addEventListener('click', function () { pfReplaceSeed = null; render(); });
    const reset = document.getElementById('pfResetBtn');
    if (reset) reset.addEventListener('click', function () {
      derivePlayoffField(game);
      pfReplaceSeed = null;
      pfFlash = 'Field reset to the top ' + game.playoffField.length + ' from the standings.';
      save(); render();
    });
    const gen = document.getElementById('pfGenerateBtn');
    if (gen) gen.addEventListener('click', function () {
      buildPlayoffFromField(game);
      pfReplaceSeed = null;
      save();
      go('play', game.id);
    });
  };

  /* ----- Whole-bracket view -----
     The complete bracket as one chart on its own screen: every round,
     including matches whose players aren't decided yet (their slots
     read "Winner of Semifinal 1" and the like). Scoring works here
     exactly as on the play screen — same cards, same inline scorer. */
  function bracketViewContext(game) {
    if (game.format === 'rr' && game.playoffMatches) return { matches: game.playoffMatches, where: 'po' };
    if (game.format === 'bracket') return { matches: game.matches, where: 'brk' };
    return null;
  }
  SCREENS.bracketView = function (gameId) {
    const game = getGame(gameId);
    if (!game) return '<p class="empty">Game not found.</p>';
    const ctx = bracketViewContext(game);
    if (!ctx) {
      return '<p class="empty">No bracket for this game yet.</p>' +
        '<button class="btn ghost block" id="bvBackBtn">Back to game</button>';
    }
    let h = '<div class="card row"><div>' + badge(game) + '</div><div class="grow">' +
      '<div class="gamename">' + esc(displayName(game)) + '</div><div class="sub">' + esc(formatLabel(game)) + ' · ' +
      (ctx.where === 'po' ? 'Playoff bracket' : 'Bracket') + '</div></div></div>';
    const champ = E.resolveBracket(game.def, ctx.matches);
    if (champ) {
      h += '<div class="winnerbanner"><div class="crown">🏆</div><div class="sub" style="color:#cfe8f5">Champion</div>' +
        '<div class="wname">' + nameWithDotHTML(game, champ) + '</div></div>';
    }
    h += bracketPlayHTML(game, ctx.matches, ctx.where, true);
    h += '<button class="btn ghost block" id="bvBackBtn" style="margin-top:12px">Back to game</button>';
    return h;
  };
  BINDS.bracketView = function (gameId) {
    const game = getGame(gameId);
    const back = document.getElementById('bvBackBtn');
    if (back) back.addEventListener('click', function () { go('play', gameId); });
    if (!game) return;
    const ctx = bracketViewContext(game);
    if (ctx) bindMatchCards(game, ctx.matches, ctx.where);
  };

  /* ----- Mid-game adds + RR schedule regeneration (v1.4) -----
     Scored RR matches are sacred: regeneration keeps every one of
     them exactly as-is (pairing, scores, round number) and rebuilds
     only the unscored remainder around the current entry list. Each
     entry's remaining need is rrTarget minus the scored matches it
     has played; E.buildRemainingRR schedules those needs, with fill
     games (reported as extras) only when a leftover entry's possible
     opponents are all at target — the completed-RR late-entry case. */
  let rrRegenArmed = false, rrRegenArmTimer = null;
  function disarmRRRegen() {
    rrRegenArmed = false;
    if (rrRegenArmTimer) { clearTimeout(rrRegenArmTimer); rrRegenArmTimer = null; }
    document.querySelectorAll('[data-regenrr]').forEach(function (x) {
      x.textContent = '↻ Regenerate remaining schedule'; x.classList.remove('confirming');
    });
  }
  function rrScoredStats(game) {
    const played = {}, forbidden = {};
    game.entries.forEach(function (e) { played[e.id] = 0; });
    game.matches.forEach(function (m) {
      if (m.kind !== 'rr' || !m.scored || m.autoBye) return;
      if (played[m.aId] !== undefined) played[m.aId]++;
      if (played[m.bId] !== undefined) played[m.bId]++;
      forbidden[E.pairKey(m.aId, m.bId)] = true;
    });
    return { played: played, forbidden: forbidden };
  }
  // Rebuild the unscored part of a pre-set RR. Returns a summary
  // {kept, newMatches, newRounds, extras} for the on-screen note.
  function regeneratePresetRR(game) {
    const scored = game.matches.filter(function (m) { return m.scored; });
    const ids = game.entries.map(function (e) { return e.id; });
    if (!scored.length) {
      // Nothing played yet: a fresh full schedule for the field as
      // it stands now (canonical builder, byes included).
      const built = E.buildPresetRR(ids, game.rrTarget);
      game.matches = built.matches;
      game.rrByeByRound = {};
      built.rounds.forEach(function (r, i) { if (r.bye) game.rrByeByRound[i + 1] = r.bye; });
      game.rrRoundsGenerated = built.rounds.length;
      return { kept: 0, newMatches: built.matches.length, newRounds: built.rounds.length, extras: {} };
    }
    const stats = rrScoredStats(game);
    const needs = {};
    game.entries.forEach(function (e) {
      needs[e.id] = Math.max(0, game.rrTarget - (stats.played[e.id] || 0));
    });
    const maxScoredRound = Math.max.apply(null, scored.map(function (m) { return m.round; }));
    const built = E.buildRemainingRR(ids, needs, stats.forbidden, stats.played,
      1000 + ids.length * 131 + scored.length * 17);
    // Bye records survive only for rounds that contain a scored match.
    const byeByRound = {};
    Object.keys(game.rrByeByRound || {}).forEach(function (rk) {
      const rn = parseInt(rk, 10);
      if (scored.some(function (m) { return m.round === rn; })) byeByRound[rn] = game.rrByeByRound[rk];
    });
    const fresh = [];
    built.rounds.forEach(function (r, i) {
      const rn = maxScoredRound + 1 + i;
      r.pairs.forEach(function (pr) {
        fresh.push({
          id: E.uid('m'), kind: 'rr', stage: 'rr', round: rn,
          aId: pr[0], bId: pr[1], sa: null, sb: null, tapsA: [], tapsB: [],
          scored: false, autoBye: false, winnerId: null, loserId: null
        });
      });
      if (r.bye) byeByRound[rn] = r.bye;
    });
    game.matches = scored.concat(fresh);
    game.rrByeByRound = byeByRound;
    game.rrRoundsGenerated = game.matches.reduce(function (mx, m) { return Math.max(mx, m.round); }, 0);
    return { kept: scored.length, newMatches: fresh.length, newRounds: built.rounds.length, extras: built.extras };
  }
  function regenSummaryText(sum) {
    if (!sum.newMatches) {
      return 'Schedule rebuilt: ' + sum.kept + (sum.kept === 1 ? ' match' : ' matches') +
        ' kept — no new matches could be scheduled.';
    }
    return 'Schedule rebuilt: ' + sum.kept + (sum.kept === 1 ? ' match' : ' matches') + ' kept, ' +
      sum.newMatches + ' new ' + (sum.newMatches === 1 ? 'match' : 'matches') + ' over ' +
      sum.newRounds + (sum.newRounds === 1 ? ' round' : ' rounds') + '.';
  }

  /* ----- Bracket walk-ups (v1.4) -----
     Allowed only while zero real matches have been scored: the
     bracket is rebuilt from scratch with the newcomer as last seed.
     Once a real score exists the bracket is locked — byes that the
     engine auto-advanced do not count as "scored" here. */
  function bracketAddHTML(game) {
    const scoredReal = game.matches.filter(function (m) { return m.scored && !m.autoBye; }).length;
    if (scoredReal > 0) {
      return '<div class="card"><span class="sub">Players can’t be added once bracket matches are scored.</span></div>';
    }
    return '<h3>Add a walk-up</h3><div class="entryrow">' +
      '<input type="text" class="nm" id="brWalkName" placeholder="Name" autocomplete="off">' +
      '<input type="text" class="cb" id="brWalkCabin" placeholder="Cabin" inputmode="numeric">' +
      '<button class="iconbtn" id="brWalkAdd" aria-label="Add">＋</button></div>' +
      '<p class="note">Adding a player before any match is scored rebuilds the bracket with them as the last seed.</p>';
  }
  function bindBracketAdd(game) {
    const wa = document.getElementById('brWalkAdd');
    if (!wa) return;
    wa.addEventListener('click', function () {
      const nm = document.getElementById('brWalkName');
      const name = nm.value.trim();
      if (!name) { nm.focus(); return; }
      const walkEntry = {
        id: E.uid('e'), name: name,
        cabin: document.getElementById('brWalkCabin').value.trim(),
        taps: [], total: null
      };
      if (colorsOn(game)) walkEntry.color = paletteAt(game.entries.length).name;
      game.entries.push(walkEntry);
      syncRosterEntry(game, walkEntry); // walk-ups join the cruise roster too
      const ids = game.entries.map(function (e) { return e.id; });
      game.matches = game.elim === 'double' ? E.buildDoubleElim(ids) : E.buildSingleElim(ids);
      E.resolveBracket(game.def, game.matches);
      save(); render();
    });
  }

  /* ----- Game settings (in-game editor) ----- */
  function showGameSettings(game) {
    openModal('<h2 style="margin-top:0">Game settings — ' + esc(displayName(game)) + '</h2>' +
      '<label class="field"><span>Game label (optional)</span>' +
      '<input type="text" id="gsLabel" value="' + esc(game.label || '') + '" placeholder="e.g. Soccer Shootout — Day 1" maxlength="60"></label>' +
      '<p class="note">Change the label or the scoring rules for this game. Scores already entered stay as they are.</p>' +
      '<div id="gsWrap">' + defEditorHTML(game.def, 'gs') + '</div>' +
      '<button class="btn block" id="gsSave">Save settings</button>' +
      '<button class="btn ghost block" id="gsCancel">Cancel</button>');
    const rerender = function (def) {
      document.getElementById('gsWrap').innerHTML = defEditorHTML(def, 'gs');
      bindDefEditor('gs', rerender);
    };
    bindDefEditor('gs', rerender);
    document.getElementById('gsCancel').addEventListener('click', closeModal);
    document.getElementById('gsSave').addEventListener('click', function () {
      game.label = document.getElementById('gsLabel').value.trim();
      game.def = readDefEditor('gs');
      save(); closeModal(); render();
    });
  }

  /* ----- Edit players (rename / substitute / swap) -----
     Opened from the play screen in every format. Everything in the
     app reads names, cabins and colors live from game.entries, and
     matches/scores reference entry IDs — so editing an entry's fields
     updates every screen at once; a substitute who takes over an
     entry's ID inherits its scores and matches exactly; and swapping
     two entries' identity fields (name, cabin, members, color) trades
     the two people between slots while scores stay with the slots.
     Substitutions and swaps are logged on game.subLog and shown on
     the finish screen (which is also the history detail) and in the
     shared results text. Per-row Save buttons: saving one row never
     clobbers edits in progress in another row. */
  function subCtx(game) {
    if (game.format === 'quick' && game.qsRounds) return 'Round ' + game.qsRounds.current;
    return '';
  }
  function logSub(game, rec) {
    game.subLog = game.subLog || [];
    rec.at = new Date().toISOString();
    const ctx = subCtx(game);
    if (ctx) rec.ctx = ctx;
    game.subLog.push(rec);
  }
  function subLogHTML(game) {
    const log = game.subLog || [];
    if (!log.length) return '';
    let h = '<div class="card"><h3 style="margin-top:0">Substitutions &amp; swaps</h3>';
    log.forEach(function (r) {
      if (r.type === 'swap') h += '<p style="margin:4px 0">🔀 Swapped: ' + esc(r.aName) + ' ⇄ ' + esc(r.bName) + (r.ctx ? ' <span class="sub">(' + esc(r.ctx) + ')</span>' : '') + '</p>';
      else h += '<p style="margin:4px 0">👥 ' + esc(r.newName) + ' replaced ' + esc(r.oldName) + (r.ctx ? ' <span class="sub">(' + esc(r.ctx) + ')</span>' : '') + '</p>';
    });
    return h + '</div>';
  }
  function subLogText(game) {
    const subs = [], swaps = [];
    (game.subLog || []).forEach(function (r) {
      if (r.type === 'swap') swaps.push(r.aName + ' ⇄ ' + r.bName);
      else subs.push(r.newName + ' for ' + r.oldName);
    });
    let t = '';
    if (subs.length) t += 'Subs: ' + subs.join(', ') + '\n';
    if (swaps.length) t += 'Swaps: ' + swaps.join(', ') + '\n';
    return t;
  }

  let epSubId = null, epSwapId = null; // entry ids in substitute / swap mode inside the modal
  function epRowHTML(game, e) {
    const c = entryColorInGame(game, e); // null when colors are off: no swatches
    const kind = game.entryKind === 'teams' ? 'team' : 'player';
    if (epSubId === e.id) {
      return '<div class="card eprow">' +
        '<div class="gamename">' + colorDotHTML(c) + 'Substitute for ' + esc(e.name) + '</div>' +
        '<p class="note">The substitute takes over this ' + kind + '’s scores, matches and color.</p>' +
        '<input type="text" id="epSubName" placeholder="Substitute name" autocomplete="off" style="margin:6px 0">' +
        '<input type="text" id="epSubCabin" placeholder="Cabin (optional)" inputmode="numeric" style="margin:6px 0">' +
        (game.entryKind === 'teams' ? '<input type="text" id="epSubMembers" placeholder="Member names (optional)" style="margin:6px 0">' : '') +
        '<p class="note ephint hidden" id="epSubHint">The substitute needs a name — nothing was changed.</p>' +
        '<div class="row wrap"><button class="btn small" id="epSubConfirm">Confirm substitute</button>' +
        '<button class="btn small ghost" id="epSubCancel">Cancel</button></div></div>';
    }
    if (epSwapId === e.id) {
      const others = game.entries.filter(function (x) { return x.id !== e.id; });
      return '<div class="card eprow">' +
        '<div class="gamename">' + colorDotHTML(c) + 'Swap ' + esc(e.name) + ' with…</div>' +
        '<p class="note">The two ' + kind + 's trade names, cabins' + (game.entryKind === 'teams' ? ', members' : '') + ' and colors. Scores and matches stay with the slots.</p>' +
        '<select id="epSwapSel">' + others.map(function (o) {
          return '<option value="' + o.id + '">' + esc(o.name) + '</option>';
        }).join('') + '</select>' +
        '<div class="row wrap" style="margin-top:8px"><button class="btn small" id="epSwapConfirm">Confirm swap?</button>' +
        '<button class="btn small ghost" id="epSwapCancel">Cancel</button></div></div>';
    }
    return '<div class="card eprow">' +
      '<div class="row">' + (c ? '<button class="colorswatch" data-epcolor="' + e.id + '" style="background:' + c.hex + '" aria-label="Color: ' + c.name + '. Tap to change"></button>' : '') +
      '<div class="grow"><input type="text" data-epname="' + e.id + '" value="' + esc(e.name) + '" autocomplete="off" aria-label="Name"></div></div>' +
      '<div class="entryrow" style="margin-top:8px"><input type="text" class="cb" data-epcabin="' + e.id + '" placeholder="Cabin" inputmode="numeric" value="' + esc(e.cabin || '') + '">' +
      (game.entryKind === 'teams' ? '<input type="text" data-epmembers="' + e.id + '" placeholder="Member names" value="' + esc(e.members || '') + '">' : '') +
      '<button class="btn small" data-epsave="' + e.id + '">Save</button></div>' +
      '<p class="note ephint hidden" data-ephint="' + e.id + '">Name can’t be empty — the old name was kept.</p>' +
      '<div class="row wrap" style="margin-top:4px">' +
      '<button class="btn small secondary" data-epsub="' + e.id + '">Replace with substitute…</button>' +
      (game.entries.length > 1 ? '<button class="btn small secondary" data-epswap="' + e.id + '">Swap identities with…</button>' : '') +
      '</div></div>';
  }
  function showEditPlayers(game) {
    epSubId = null; epSwapId = null;
    const kind = game.entryKind === 'teams' ? 'team' : 'player';
    openModal('<h2 style="margin-top:0">👥 Edit players — ' + esc(displayName(game)) + '</h2>' +
      '<p class="note">Fix a name or cabin, change a color, replace a ' + kind + ' with a substitute, or swap two ' + kind + 's’ places. Scores and matches stay with each slot.</p>' +
      '<div id="epList"></div>' +
      '<button class="btn block" id="epDone">Done</button>');
    document.getElementById('epDone').addEventListener('click', function () { closeModal(); render(); });
    renderEpList(game);
  }
  function renderEpList(game) {
    const wrap = document.getElementById('epList');
    if (!wrap) return;
    wrap.innerHTML = game.entries.map(function (e) { return epRowHTML(game, e); }).join('');
    wrap.querySelectorAll('[data-epsave]').forEach(function (b) {
      b.addEventListener('click', function () {
        const e = game.entries.find(function (x) { return x.id === b.getAttribute('data-epsave'); });
        if (!e) return;
        const nameInp = wrap.querySelector('[data-epname="' + e.id + '"]');
        const hint = wrap.querySelector('[data-ephint="' + e.id + '"]');
        const name = nameInp.value.trim();
        if (!name) { hint.classList.remove('hidden'); nameInp.value = e.name; nameInp.focus(); return; }
        hint.classList.add('hidden');
        e.name = name;
        e.cabin = wrap.querySelector('[data-epcabin="' + e.id + '"]').value.trim();
        const mem = wrap.querySelector('[data-epmembers="' + e.id + '"]');
        if (mem) e.members = mem.value.trim();
        save(); render();
      });
    });
    wrap.querySelectorAll('[data-epcolor]').forEach(function (b) {
      b.addEventListener('click', function () {
        const e = game.entries.find(function (x) { return x.id === b.getAttribute('data-epcolor'); });
        if (!e) return;
        showColorPicker(entryColor(game.entries, e).name, function (colorName) {
          e.color = colorName;
          save(); render();
          showEditPlayers(game);
        }, function () { showEditPlayers(game); });
      });
    });
    wrap.querySelectorAll('[data-epsub]').forEach(function (b) {
      b.addEventListener('click', function () {
        epSubId = b.getAttribute('data-epsub'); epSwapId = null;
        renderEpList(game);
        const inp = document.getElementById('epSubName');
        if (inp) inp.focus();
      });
    });
    wrap.querySelectorAll('[data-epswap]').forEach(function (b) {
      b.addEventListener('click', function () {
        epSwapId = b.getAttribute('data-epswap'); epSubId = null;
        renderEpList(game);
      });
    });
    const subConfirm = document.getElementById('epSubConfirm');
    if (subConfirm) subConfirm.addEventListener('click', function () {
      const e = game.entries.find(function (x) { return x.id === epSubId; });
      if (!e) { epSubId = null; renderEpList(game); return; }
      const nameInp = document.getElementById('epSubName');
      const name = nameInp.value.trim();
      if (!name) { document.getElementById('epSubHint').classList.remove('hidden'); nameInp.focus(); return; }
      const oldName = e.name;
      e.name = name;
      e.cabin = document.getElementById('epSubCabin').value.trim();
      const mem = document.getElementById('epSubMembers');
      if (mem) e.members = mem.value.trim();
      logSub(game, { type: 'sub', oldName: oldName, newName: name });
      epSubId = null;
      save(); render();
      renderEpList(game);
    });
    const subCancel = document.getElementById('epSubCancel');
    if (subCancel) subCancel.addEventListener('click', function () { epSubId = null; renderEpList(game); });
    const swapConfirm = document.getElementById('epSwapConfirm');
    if (swapConfirm) swapConfirm.addEventListener('click', function () {
      const a = game.entries.find(function (x) { return x.id === epSwapId; });
      const sel = document.getElementById('epSwapSel');
      const b = sel ? game.entries.find(function (x) { return x.id === sel.value; }) : null;
      if (!a || !b || a === b) { epSwapId = null; renderEpList(game); return; }
      const aName = a.name, bName = b.name;
      ['name', 'cabin', 'members'].forEach(function (k) { const t = a[k]; a[k] = b[k]; b[k] = t; });
      if (colorsOn(game)) {
        const ca = entryColor(game.entries, a).name, cb = entryColor(game.entries, b).name;
        a.color = cb; b.color = ca;
      }
      logSub(game, { type: 'swap', aName: aName, bName: bName });
      epSwapId = null;
      save(); render();
      renderEpList(game);
    });
    const swapCancel = document.getElementById('epSwapCancel');
    if (swapCancel) swapCancel.addEventListener('click', function () { epSwapId = null; renderEpList(game); });
  }

  /* ----- Modal ----- */
  function openModal(html) {
    modalRoot.innerHTML = '<div class="modalwrap" id="modalWrap"><div class="modal">' + html + '</div></div>';
    document.getElementById('modalWrap').addEventListener('click', function (ev) {
      if (ev.target === ev.currentTarget) closeModal();
    });
  }
  function closeModal() { modalRoot.innerHTML = ''; }
  function copyText(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { alert(msg); }, function () { alert('Copy failed — long-press the text to copy it manually.'); });
    } else { alert('Copy is not available on this browser.'); }
  }

  /* ----- Finish + sharing ----- */
  function finalStandings(game) {
    // Returns [{id, name, cabin, color, line}] in finishing order, best first.
    if (game.format === 'quick') {
      if (qsActive(game) && game.qsRounds.rounds.length) return qsFinalStandings(game);
      return quickSorted(game).map(function (e) {
        const sc = quickScore(game, e);
        return { id: e.id, name: e.name, cabin: e.cabin, color: entryColorNameInGame(game, e), line: (sc === null ? '—' : sc + ' pts') };
      });
    }
    if (game.format === 'rr') {
      return E.computeStandings(game.entries, game.matches, game.def).map(function (r) {
        const e = game.entries.find(function (x) { return x.id === r.id; });
        return { id: r.id, name: e ? e.name : r.id, cabin: e ? e.cabin : '', color: e ? entryColorNameInGame(game, e) : '', line: r.w + 'W–' + r.l + 'L' + (r.d ? '–' + r.d + 'D' : '') + ' · ' + r.pf + ' pts' };
      });
    }
    // Bracket: champion first, then everyone else in seed order.
    const champ = game.winnerId;
    const rest = game.entries.filter(function (e) { return e.id !== champ; });
    const out = [];
    if (champ) { const c = game.entries.find(function (e) { return e.id === champ; }); out.push({ id: c.id, name: c.name, cabin: c.cabin, color: entryColorNameInGame(game, c), line: 'Champion' }); }
    rest.forEach(function (e) { out.push({ id: e.id, name: e.name, cabin: e.cabin, color: entryColorNameInGame(game, e), line: '' }); });
    return out;
  }
  function resultsText(game) {
    const rows = finalStandings(game);
    const winner = game.winnerId ? entryName(game, game.winnerId) : (rows.length ? rows[0].name : '—');
    const winnerColor = game.winnerId ? (entryColorById(game, game.winnerId) || {}).name : (rows.length ? rows[0].color : '');
    const winnerTxt = winner + (winnerColor ? ' (' + winnerColor + ')' : '');
    const wIds = (game.winnerIds && game.winnerIds.length) ? game.winnerIds : (game.winnerId ? [game.winnerId] : []);
    const winnerLine = wIds.length > 1
      ? '🏆 Winners: ' + wIds.map(function (id) {
          const c = (entryColorById(game, id) || {}).name;
          return entryName(game, id) + (c ? ' (' + c + ')' : '');
        }).join(', ')
      : '🏆 Winner: ' + winnerTxt;
    let txt = displayName(game) + ' — ' + formatLabel(game) + '\n' + fmtDate(game.finishedAt || game.createdAt) + '\n' + winnerLine + '\n';
    if (game.format === 'rr' && game.playoffMatches && game.winnerId) txt += 'Playoff champion: ' + winnerTxt + '\n';
    txt += '\nResults:\n';
    rows.forEach(function (r, i) { txt += (i + 1) + '. ' + r.name + (r.color ? ' (' + r.color + ')' : '') + (r.cabin ? ' (cabin ' + r.cabin + ')' : '') + (r.line ? ' — ' + r.line : '') + '\n'; });
    txt += subLogText(game);
    return txt;
  }
  function download(filename, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }
  function downloadCard(game) {
    const rows = finalStandings(game).slice(0, 8);
    const winner = game.winnerId ? entryName(game, game.winnerId) : (rows.length ? rows[0].name : '—');
    const cv = document.createElement('canvas');
    cv.width = 900; cv.height = 560 + rows.length * 52;
    const c = cv.getContext('2d');
    c.fillStyle = '#0b3b5e'; c.fillRect(0, 0, cv.width, 300);
    c.fillStyle = '#ffffff'; c.textAlign = 'center';
    c.font = '90px serif'; c.fillText(game.icon || '🏆', 450, 115);
    c.font = '700 44px system-ui, sans-serif';
    c.fillText(displayName(game), 450, 185);
    c.font = '400 26px system-ui, sans-serif'; c.fillStyle = '#cfe8f5';
    c.fillText(formatLabel(game) + ' · ' + fmtDate(game.finishedAt || game.createdAt), 450, 228);
    c.font = '800 40px system-ui, sans-serif'; c.fillStyle = '#ffd34d';
    c.fillText('🏆 ' + winner, 450, 282);
    c.fillStyle = '#ffffff'; c.fillRect(0, 300, cv.width, cv.height - 300);
    c.textAlign = 'left'; c.fillStyle = '#12212e';
    rows.forEach(function (r, i) {
      const pc = r.color ? colorByName(r.color) : null;
      if (pc) {
        c.beginPath(); c.arc(36, 358 + i * 52, 10, 0, Math.PI * 2);
        c.fillStyle = pc.hex; c.fill();
        c.strokeStyle = '#94a3b8'; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = '#12212e';
      }
      c.font = (i === 0 ? '700 ' : '400 ') + '30px system-ui, sans-serif';
      c.fillText((i + 1) + '. ' + r.name, 60, 368 + i * 52);
      c.textAlign = 'right'; c.fillStyle = '#4a6072'; c.font = '400 26px system-ui, sans-serif';
      c.fillText(r.line || '', 840, 368 + i * 52);
      c.textAlign = 'left'; c.fillStyle = '#12212e';
    });
    cv.toBlob(function (blob) { if (blob) download(game.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-results.png', blob); }, 'image/png');
  }
  function shareButtonsHTML(game) {
    return '<div class="row wrap">' +
      '<button class="btn grow" data-share="copy">📋 Copy results</button>' +
      '<button class="btn secondary grow" data-share="card">🖼 Download card</button>' +
      '<button class="btn secondary grow" data-share="text">⬇ Download list</button></div>';
  }
  function bindShareButtons(game) {
    document.querySelectorAll('[data-share]').forEach(function (b) {
      b.addEventListener('click', function () {
        const kind = b.getAttribute('data-share');
        if (kind === 'copy') copyText(resultsText(game), 'Results copied — paste them anywhere.');
        else if (kind === 'card') downloadCard(game);
        else download(game.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-results.txt', new Blob([resultsText(game)], { type: 'text/plain' }));
      });
    });
  }

  // Per-round breakdown for a finished rounds game: one column per
  // round, plus the running Total (Cumulative) or the Result — final
  // round score, or where the entry went out (Advance).
  function qsBreakdownHTML(game) {
    const qs = game.qsRounds;
    const recs = qs.rounds;
    if (!recs.length) return '';
    const rows = finalStandings(game);
    let h = '<h2>Round by round</h2><div class="card" style="padding:8px 12px"><table class="stand"><tr><th>' +
      (game.entryKind === 'teams' ? 'Team' : 'Player') + '</th>';
    recs.forEach(function (r, i) { h += '<th class="num">R' + (i + 1) + '</th>'; });
    h += '<th class="num">' + (qs.mode === 'cumulative' ? 'Total' : 'Result') + '</th></tr>';
    const last = recs[recs.length - 1];
    rows.forEach(function (row) {
      h += '<tr><td>' + colorDotHTML(row.color ? colorByName(row.color) : null) + esc(row.name) + '</td>';
      recs.forEach(function (rec) {
        const s = rec.scores[row.id];
        h += '<td class="num">' + (s === null || s === undefined ? '—' : s) + '</td>';
      });
      if (qs.mode === 'cumulative') {
        h += '<td class="num"><b>' + qsRoundsTotal(game, row.id) + '</b></td>';
      } else if (qs.outRound[row.id]) {
        h += '<td class="num">Out R' + qs.outRound[row.id] + '</td>';
      } else {
        const s = last.scores[row.id];
        h += '<td class="num">' + (s === null || s === undefined ? '—' : s + ' pts') + '</td>';
      }
      h += '</tr>';
    });
    h += '</table>';
    const targets = recs.map(function (r, i) {
      return (r.target === null || r.target === undefined) ? null : 'R' + (i + 1) + ' target ' + r.target;
    }).filter(Boolean);
    if (targets.length) h += '<p class="note" style="margin:8px 2px 2px">' + esc(targets.join(' · ')) + '</p>';
    h += '</div>';
    return h;
  }

  SCREENS.finish = function (gameId) {
    const game = getGame(gameId);
    if (!game) return '<p class="empty">Game not found.</p>';
    const rows = finalStandings(game);
    const winner = game.winnerId ? entryName(game, game.winnerId) : (rows.length ? rows[0].name : '—');
    const winnerId = game.winnerId || (rows.length ? rows[0].id : null);
    const wIds = (game.winnerIds && game.winnerIds.length > 1) ? game.winnerIds : null;
    let h = '<div class="winnerbanner"><div class="crown">🏆</div><div class="sub" style="color:#cfe8f5">' + esc(displayName(game)) + (wIds ? ' — joint winners' : ' winner') + '</div>' +
      '<div class="wname">' + (wIds
        ? wIds.map(function (id) { return nameWithDotHTML(game, id); }).join(' &amp; ')
        : (winnerId ? nameWithDotHTML(game, winnerId) : esc(winner))) + '</div></div>';
    if (game.format === 'rr' && game.playoffMatches) h += '<p class="note" style="text-align:center">Playoff champion — round robin standings below.</p>';
    h += '<div class="card"><table class="stand">';
    rows.forEach(function (r, i) {
      h += '<tr' + (i === 0 ? ' class="top"' : '') + '><td>' + (i + 1) + '</td><td>' + colorDotHTML(r.color ? colorByName(r.color) : null) + esc(r.name) +
        (r.cabin ? ' <span class="sub">(cabin ' + esc(r.cabin) + ')</span>' : '') + '</td><td class="num">' + esc(r.line) + '</td></tr>';
    });
    h += '</table></div>';
    if (qsActive(game)) h += qsBreakdownHTML(game);
    h += subLogHTML(game);
    h += shareButtonsHTML(game) +
      '<button class="btn block" id="againBtn" style="margin-top:14px">↻ Play again (same players)</button>' +
      '<button class="btn ghost block" id="finishHomeBtn">Home</button>';
    return h;
  };
  BINDS.finish = function (gameId) {
    const game = getGame(gameId);
    if (!game) return;
    bindShareButtons(game);
    document.getElementById('finishHomeBtn').addEventListener('click', function () { go('home'); });
    document.getElementById('againBtn').addEventListener('click', function () { playAgain(game); });
  };

  function playAgain(old) {
    const game = {
      id: E.uid('g'), templateId: old.templateId, name: old.name, icon: old.icon, color: old.color,
      def: clone(old.def), format: old.format, entryKind: old.entryKind, scoreMode: old.scoreMode,
      elim: old.elim, useColors: old.useColors !== false, label: old.label || '',
      cruiseId: old.cruiseId || null,
      entries: old.entries.map(function (e, i) {
        const ne = { id: e.id, name: e.name, cabin: e.cabin, members: e.members, taps: [], total: null };
        if (old.useColors !== false) ne.color = colorByName(e.color || '') ? e.color : paletteAt(i).name;
        return ne;
      }),
      matches: [], playoffMatches: null, playoffField: null, status: 'playing', winnerId: null,
      createdAt: Date.now(), finishedAt: null
    };
    if (old.format === 'quick' && qsActive(old)) {
      game.qsRounds = {
        mode: old.qsRounds.mode,
        planned: clone(old.qsRounds.planned || []),
        current: 1, rounds: [], outRound: {}, betweenRounds: false
      };
    }
    if (old.format === 'bracket') {
      game.matches = old.elim === 'double'
        ? E.buildDoubleElim(game.entries.map(function (e) { return e.id; }))
        : E.buildSingleElim(game.entries.map(function (e) { return e.id; }));
      E.resolveBracket(game.def, game.matches);
    } else if (old.format === 'rr') {
      game.rrTarget = old.rrTarget; game.rrPairing = old.rrPairing;
      game.playoffSize = old.playoffSize; game.playoffElim = old.playoffElim;
      if (old.rrPairing === 'results') {
        const st = E.createResultsBasedRR(game.entries, old.rrTarget);
        game.matches = st.matches; game.rrByes = st.rrByes;
        game.rrRoundsGenerated = st.rrRoundsGenerated;
        game.rrByeByRound = {}; if (st.rrByes.length) game.rrByeByRound[1] = st.rrByes[0];
      } else {
        const built = E.buildPresetRR(game.entries.map(function (e) { return e.id; }), old.rrTarget);
        game.matches = built.matches; game.rrByes = []; game.rrByeByRound = {};
        built.rounds.forEach(function (r, i) { if (r.bye) game.rrByeByRound[i + 1] = r.bye; });
        game.rrRoundsGenerated = built.rounds.length;
      }
    }
    S.games.push(game);
    syncGameRoster(game); // same players: roster matches are no-ops
    save();
    go('play', game.id);
  }

  /* ----- History ----- */
  // Two-step in-app delete confirm: the native confirm() dialog is
  // suppressed in some embedded/browser contexts (the button then
  // appears dead), so the first tap arms the button ("Confirm
  // delete?") and only a second tap on the same button deletes. The
  // arm resets after a few seconds, when another entry is armed, or
  // whenever the history screen re-renders (any navigation).
  let histDelArmId = null, histDelArmTimer = null;
  function disarmHistDel() {
    histDelArmId = null;
    if (histDelArmTimer) { clearTimeout(histDelArmTimer); histDelArmTimer = null; }
    document.querySelectorAll('[data-delhist]').forEach(function (x) {
      x.textContent = 'Delete'; x.classList.remove('confirming');
    });
  }
  SCREENS.history = function () {
    const finished = S.games.filter(function (g) { return g.status === 'finished'; }).slice().reverse();
    let h = '<h1>History</h1>';
    if (!finished.length) h += '<p class="empty">No finished games yet.</p>';
    finished.forEach(function (g) {
      h += '<div class="card row"><div>' + badge(g) + '</div><div class="grow"><div class="gamename">' + esc(displayName(g)) + '</div>' +
        '<div class="sub">' + esc(formatLabel(g)) + ' · ' + fmtDate(g.finishedAt || g.createdAt) + ' · 🏆 ' + (g.winnerId ? nameWithDotHTML(g, g.winnerId) : '—') + '</div></div>' +
        '<button class="btn small" data-view="' + g.id + '">View</button>' +
        '<button class="btn small danger" data-delhist="' + g.id + '">Delete</button></div>';
    });
    h += '<button class="btn ghost block" id="backBtn">Back</button>';
    return h;
  };
  BINDS.history = function () {
    disarmHistDel(); // every fresh render of this screen starts disarmed
    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { go('finish', b.getAttribute('data-view')); });
    });
    document.querySelectorAll('[data-delhist]').forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.getAttribute('data-delhist');
        if (histDelArmId === id) {
          // Second tap on the armed button: really delete.
          disarmHistDel();
          S.games = S.games.filter(function (x) { return x.id !== id; });
          save(); render();
          return;
        }
        // First tap: arm this button only.
        disarmHistDel();
        histDelArmId = id;
        b.textContent = 'Confirm delete?';
        b.classList.add('confirming');
        histDelArmTimer = setTimeout(disarmHistDel, 4000);
      });
    });
    document.getElementById('backBtn').addEventListener('click', function () { go('home'); });
  };

  /* ----- Cruise page (v1.8) -----
     One sailing's home: a summary (games played, roster size,
     wins per player), its games (in-progress resume, finished open
     the usual history detail), a "new game in this cruise" launch,
     and the roster. The roster is this cruise's player list: game
     entries sync into it automatically (see syncRosterEntry), and it
     can also be managed by hand here — add, edit, remove. Removing a
     roster player never touches games already played. Deleting the
     cruise deletes only the cruise and its roster: its games become
     standalone, never deleted. Both destructive actions use the
     two-step in-app confirm pattern (no native confirm()). */
  let rosterEditId = null; // roster entry being edited on the cruise page
  let rosterDelArmId = null, rosterDelArmTimer = null;
  function disarmRosterDel() {
    rosterDelArmId = null;
    if (rosterDelArmTimer) { clearTimeout(rosterDelArmTimer); rosterDelArmTimer = null; }
    document.querySelectorAll('[data-rosterdel]').forEach(function (x) {
      x.textContent = 'Remove'; x.classList.remove('confirming');
    });
  }
  let cruiseDelArmId = null, cruiseDelArmTimer = null;
  function disarmCruiseDel() {
    cruiseDelArmId = null;
    if (cruiseDelArmTimer) { clearTimeout(cruiseDelArmTimer); cruiseDelArmTimer = null; }
    document.querySelectorAll('[data-delcruise]').forEach(function (x) {
      x.textContent = 'Delete cruise'; x.classList.remove('confirming');
    });
  }
  function cruiseSummary(cruise) {
    const finished = S.games.filter(function (g) { return g.cruiseId === cruise.id && g.status === 'finished'; });
    const wins = {};    // normalized name -> {name, count}
    finished.forEach(function (g) {
      const wIds = (g.winnerIds && g.winnerIds.length) ? g.winnerIds : (g.winnerId ? [g.winnerId] : []);
      wIds.forEach(function (id) {
        const e = g.entries.find(function (x) { return x.id === id; });
        if (!e) return;
        const k = normName(e.name);
        if (!k) return;
        if (!wins[k]) wins[k] = { name: e.name, count: 0 };
        wins[k].count++;
      });
    });
    const winRows = Object.keys(wins).map(function (k) { return wins[k]; })
      .sort(function (a, b) { return (b.count - a.count) || a.name.localeCompare(b.name); });
    // Players = the whole roster (v1.8.1, Jeff's choice): anyone on the
    // roster counts, even if they've only played an unfinished game or
    // haven't played yet. Matches the Home cruise card's player count.
    return { gamesPlayed: finished.length, playerCount: (cruise.roster || []).length, winRows: winRows };
  }
  SCREENS.cruise = function (cruiseId) {
    const c = getCruise(cruiseId);
    if (!c) {
      return '<p class="empty">Cruise not found.</p>' +
        '<button class="btn ghost block" id="cruiseBackBtn">Back</button>';
    }
    if (!Array.isArray(c.roster)) c.roster = [];
    const meta = cruiseMeta(c);
    let h = '<h1>🛳 ' + esc(c.name) + '</h1>' +
      (meta ? '<p class="note" style="margin-top:-6px">' + esc(meta) + '</p>' : '');
    const sum = cruiseSummary(c);
    h += '<div class="card"><div class="row spread"><span>Games played</span><b>' + sum.gamesPlayed + '</b></div>' +
      '<div class="row spread" style="margin-top:6px"><span>Players</span><b>' + sum.playerCount + '</b></div>';
    if (sum.winRows.length) {
      h += '<h3 style="margin-bottom:2px">Wins</h3><table class="stand">';
      sum.winRows.forEach(function (r) {
        h += '<tr><td>' + esc(r.name) + '</td><td class="num">' + r.count + (r.count === 1 ? ' win' : ' wins') + '</td></tr>';
      });
      h += '</table>';
    } else {
      h += '<p class="note" style="margin-bottom:0">No finished games yet — wins will tally up here as games are completed.</p>';
    }
    h += '</div>';
    h += '<button class="btn block" id="cruiseNewGameBtn" style="min-height:60px">➕ New game in this cruise</button>';
    const inProg = S.games.filter(function (g) { return g.cruiseId === c.id && g.status === 'playing'; }).slice().reverse();
    const finished = S.games.filter(function (g) { return g.cruiseId === c.id && g.status === 'finished'; }).slice().reverse();
    h += '<h2>Games in this cruise</h2>';
    if (!inProg.length && !finished.length) {
      h += '<p class="empty">No games yet — start the first one above.</p>';
    }
    inProg.forEach(function (g) {
      h += '<div class="card row"><div>' + badge(g) + '</div><div class="grow">' +
        '<div class="gamename">' + esc(displayName(g)) + '</div>' +
        '<div class="sub">' + esc(formatLabel(g)) + ' · ' + g.entries.length + ' ' + (g.entryKind === 'teams' ? 'teams' : 'players') + ' · ' + fmtDate(g.createdAt) + ' · in progress</div></div>' +
        '<button class="btn small" data-cruisecontinue="' + g.id + '">Continue</button></div>';
    });
    finished.forEach(function (g) {
      h += '<div class="card row"><div>' + badge(g) + '</div><div class="grow">' +
        '<div class="gamename">' + esc(displayName(g)) + '</div>' +
        '<div class="sub">' + esc(formatLabel(g)) + ' · ' + fmtDate(g.finishedAt || g.createdAt) + ' · 🏆 ' + (g.winnerId ? nameWithDotHTML(g, g.winnerId) : '—') + '</div></div>' +
        '<button class="btn small" data-cruiseview="' + g.id + '">View</button></div>';
    });
    h += '<h2>Roster (' + c.roster.length + ')</h2>';
    c.roster.forEach(function (r) {
      if (rosterEditId === r.id) {
        h += '<div class="card" style="margin:6px 0;padding:12px">' +
          '<label class="field" style="margin-top:0"><span>Name</span><input type="text" id="rosterEditName" value="' + esc(r.name) + '" autocomplete="off"></label>' +
          '<label class="field"><span>Cabin (optional)</span><input type="text" id="rosterEditCabin" value="' + esc(r.cabin || '') + '" inputmode="numeric"></label>' +
          '<p class="note hidden" id="rosterEditHint" style="color:#b3261e;font-weight:600">Name can’t be empty — nothing was changed.</p>' +
          '<div class="row wrap"><button class="btn small" id="rosterEditSave">Save</button>' +
          '<button class="btn small ghost" id="rosterEditCancel">Cancel</button></div></div>';
      } else {
        h += '<div class="card row" style="margin:6px 0;padding:10px 12px"><div class="grow">' +
          '<span class="gamename" style="font-size:16px">' + esc(r.name) + '</span>' +
          (r.cabin ? '<span class="tag">Cabin ' + esc(r.cabin) + '</span>' : '') + '</div>' +
          '<button class="btn small secondary" data-rosteredit="' + r.id + '">Edit</button>' +
          '<button class="btn small danger" data-rosterdel="' + r.id + '">Remove</button></div>';
      }
    });
    h += '<div class="entryrow"><input type="text" class="nm" id="rosterName" placeholder="Player name" autocomplete="off">' +
      '<input type="text" class="cb" id="rosterCabin" placeholder="Cabin" inputmode="numeric">' +
      '<button class="iconbtn" id="rosterAdd" aria-label="Add to roster">＋</button></div>' +
      '<p class="note">Everyone who plays a game in this cruise joins the roster automatically. Removing someone here never changes games already played.</p>' +
      '<hr class="divider">' +
      '<button class="btn danger block" data-delcruise="' + c.id + '">Delete cruise</button>' +
      '<p class="note" style="text-align:center">Deleting a cruise removes it and its roster — its games stay, as standalone games.</p>' +
      '<button class="btn ghost block" id="cruiseBackBtn">Back</button>';
    return h;
  };
  BINDS.cruise = function (cruiseId) {
    disarmRosterDel(); // every fresh render starts disarmed
    disarmCruiseDel();
    const back = document.getElementById('cruiseBackBtn');
    if (back) back.addEventListener('click', function () { rosterEditId = null; go('home'); });
    const c = getCruise(cruiseId);
    if (!c) return;
    if (!Array.isArray(c.roster)) c.roster = [];
    document.getElementById('cruiseNewGameBtn').addEventListener('click', function () {
      rosterEditId = null;
      pendingCruiseId = c.id;
      pickReturn = { screen: 'cruise', id: c.id };
      go('pick');
    });
    document.querySelectorAll('[data-cruisecontinue]').forEach(function (b) {
      b.addEventListener('click', function () {
        const g = getGame(b.getAttribute('data-cruisecontinue'));
        if (g && qsActive(g) && g.qsRounds.betweenRounds) go('roundSummary', g.id);
        else go('play', b.getAttribute('data-cruisecontinue'));
      });
    });
    document.querySelectorAll('[data-cruiseview]').forEach(function (b) {
      b.addEventListener('click', function () { go('finish', b.getAttribute('data-cruiseview')); });
    });
    const addRoster = function () {
      const nm = document.getElementById('rosterName');
      const name = nm.value.trim();
      if (!name) { nm.focus(); return; }
      const cabin = document.getElementById('rosterCabin').value.trim();
      const found = c.roster.find(function (r) { return normName(r.name) === normName(name); });
      if (found) { if (!found.cabin && cabin) found.cabin = cabin; }
      else c.roster.push({ id: E.uid('p'), name: name, cabin: cabin });
      save(); render();
    };
    document.getElementById('rosterAdd').addEventListener('click', addRoster);
    document.getElementById('rosterName').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') addRoster(); });
    document.getElementById('rosterCabin').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') addRoster(); });
    document.querySelectorAll('[data-rosteredit]').forEach(function (b) {
      b.addEventListener('click', function () {
        rosterEditId = b.getAttribute('data-rosteredit');
        render();
        const inp = document.getElementById('rosterEditName');
        if (inp) { inp.focus(); if (inp.select) inp.select(); }
      });
    });
    const es = document.getElementById('rosterEditSave');
    if (es) es.addEventListener('click', function () {
      const r = c.roster.find(function (x) { return x.id === rosterEditId; });
      if (!r) { rosterEditId = null; render(); return; }
      const name = document.getElementById('rosterEditName').value.trim();
      if (!name) {
        document.getElementById('rosterEditHint').classList.remove('hidden');
        document.getElementById('rosterEditName').focus();
        return;
      }
      r.name = name;
      r.cabin = document.getElementById('rosterEditCabin').value.trim();
      rosterEditId = null;
      save(); render();
    });
    const ec = document.getElementById('rosterEditCancel');
    if (ec) ec.addEventListener('click', function () { rosterEditId = null; render(); });
    document.querySelectorAll('[data-rosterdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.getAttribute('data-rosterdel');
        if (rosterDelArmId === id) {
          disarmRosterDel();
          c.roster = c.roster.filter(function (x) { return x.id !== id; });
          if (rosterEditId === id) rosterEditId = null;
          save(); render();
          return;
        }
        disarmRosterDel();
        rosterDelArmId = id;
        b.textContent = 'Confirm remove?';
        b.classList.add('confirming');
        rosterDelArmTimer = setTimeout(disarmRosterDel, 4000);
      });
    });
    document.querySelectorAll('[data-delcruise]').forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.getAttribute('data-delcruise');
        if (cruiseDelArmId === id) {
          disarmCruiseDel();
          S.games.forEach(function (g) { if (g.cruiseId === id) g.cruiseId = null; });
          S.cruises = S.cruises.filter(function (x) { return x.id !== id; });
          rosterEditId = null;
          save(); go('home');
          return;
        }
        disarmCruiseDel();
        cruiseDelArmId = id;
        b.textContent = 'Confirm delete cruise?';
        b.classList.add('confirming');
        cruiseDelArmTimer = setTimeout(disarmCruiseDel, 4000);
      });
    });
  };

  /* ----- Account (optional, Supabase — templates only) ----- */
  let sb = null, sbUser = null, sbStatus = '';
  function sbInit() {
    const cfg = window.APP_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) { sbStatus = 'not-configured'; return; }
    if (!window.supabase) { sbStatus = 'offline-lib'; return; }
    try {
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      sb.auth.getSession().then(function (res) {
        sbUser = res && res.data && res.data.session ? res.data.session.user : null;
        if (screen.name === 'account') render();
        if (sbUser) cloudSyncDown();
      });
      sb.auth.onAuthStateChange(function (_ev, session) {
        sbUser = session ? session.user : null;
        if (screen.name === 'account') render();
      });
    } catch (e) { sbStatus = 'error'; }
  }
  function cloudPushTemplate(t) {
    if (!sb || !sbUser || t.builtin) return;
    const row = { user_id: sbUser.id, name: t.name, definition: { attempts: t.attempts, buttons: t.buttons, winDir: t.winDir }, updated_at: new Date().toISOString() };
    const q = t.cloudId
      ? sb.from('templates').update(row).eq('id', t.cloudId)
      : sb.from('templates').insert(row).select('id').single();
    Promise.resolve(q).then(function (res) {
      if (res && res.data && res.data.id && !t.cloudId) { t.cloudId = res.data.id; save(); }
    }).catch(function () { /* offline: local copy is kept, sync retries on sign-in */ });
  }
  function cloudSyncDown() {
    if (!sb || !sbUser) return;
    sb.from('templates').select('id,name,definition,updated_at').eq('user_id', sbUser.id)
      .then(function (res) {
        if (!res || res.error || !Array.isArray(res.data)) return;
        let changed = false;
        res.data.forEach(function (row) {
          const local = S.templates.find(function (t) { return t.cloudId === row.id; });
          const def = row.definition || {};
          if (local) {
            const remoteTs = new Date(row.updated_at).getTime();
            if (remoteTs > (local.updatedAt || 0)) {
              local.name = row.name; local.attempts = def.attempts || 3;
              local.buttons = def.buttons || local.buttons; local.winDir = def.winDir || 'high';
              local.updatedAt = remoteTs; changed = true;
            }
          } else {
            const b = customBadge(row.name);
            S.templates.push({
              id: E.uid('tpl'), cloudId: row.id, name: row.name, icon: b.icon, color: b.color,
              attempts: def.attempts || 3, buttons: def.buttons || [{ label: 'Score', points: 1 }],
              winDir: def.winDir || 'high', builtin: false, updatedAt: new Date(row.updated_at).getTime()
            });
            changed = true;
          }
        });
        // Push any local templates the cloud has never seen.
        S.templates.forEach(function (t) { if (!t.cloudId) cloudPushTemplate(t); });
        if (changed) { save(); if (screen.name === 'templates') render(); }
      }).catch(function () { /* offline */ });
  }
  SCREENS.account = function () {
    let h = '<h1>Staff account</h1>' +
      '<p class="note">Optional. An account only syncs your <b>custom game templates</b> across your devices. Games, players, cabins and history always stay on this device, and the app works fully signed out.</p>';
    if (sbStatus === 'not-configured') {
      h += '<div class="card"><b>Accounts are not switched on yet.</b><p class="note">This copy of the app has no Supabase project connected. To enable accounts, the site owner creates a Supabase project, runs <b>supabase/schema.sql</b>, and pastes the project URL and anon key into <b>config.js</b> (see the README). Everything else works as-is.</p></div>';
    } else if (!sb) {
      h += '<div class="card"><b>Account library could not load</b> — you may be offline. The rest of the app works normally.</div>';
    } else if (sbUser) {
      h += '<div class="card"><div class="gamename">Signed in</div><div class="sub">' + esc(sbUser.email || '') + '</div>' +
        '<p class="note">Your custom templates sync to this account when you are online.</p>' +
        '<button class="btn block" id="syncBtn">Sync templates now</button>' +
        '<button class="btn ghost block" id="signOutBtn">Sign out</button></div>';
    } else {
      h += '<div class="card"><label class="field"><span>Email</span><input type="email" id="accEmail" autocomplete="email"></label>' +
        '<label class="field"><span>Password</span><input type="password" id="accPass" autocomplete="current-password"></label>' +
        '<button class="btn block" id="signInBtn">Sign in</button>' +
        '<button class="btn secondary block" id="signUpBtn">Create account</button>' +
        '<p class="note" id="accMsg"></p></div>';
    }
    h += '<button class="btn ghost block" id="accBack">Back</button>';
    return h;
  };
  BINDS.account = function () {
    document.getElementById('accBack').addEventListener('click', function () { go('home'); });
    const so = document.getElementById('signOutBtn');
    if (so) so.addEventListener('click', function () { sb.auth.signOut(); });
    const sy = document.getElementById('syncBtn');
    if (sy) sy.addEventListener('click', function () { S.templates.forEach(cloudPushTemplate); cloudSyncDown(); alert('Template sync started — it finishes when the connection responds.'); });
    const msg = function (t) { const m = document.getElementById('accMsg'); if (m) m.textContent = t; };
    const creds = function () {
      return { email: document.getElementById('accEmail').value.trim(), password: document.getElementById('accPass').value };
    };
    const si = document.getElementById('signInBtn');
    if (si) si.addEventListener('click', function () {
      const c = creds();
      sb.auth.signInWithPassword(c).then(function (res) {
        if (res.error) msg(res.error.message); else { sbUser = res.data.user; cloudSyncDown(); render(); }
      });
    });
    const su = document.getElementById('signUpBtn');
    if (su) su.addEventListener('click', function () {
      const c = creds();
      sb.auth.signUp(c).then(function (res) {
        if (res.error) msg(res.error.message);
        else msg('Account created. If email confirmation is on, confirm via your inbox, then sign in.');
      });
    });
  };

  /* ----- Header ☰ menu: install, share/QR, WhatsApp, feedback ----- */
  function siteUrl() {
    // Canonical app URL: origin + path up to the app root, so the QR code
    // points at https://playavista99.github.io/cruise-game-scoring/ when live.
    try {
      let path = window.location.pathname || '/';
      if (path.slice(-1) !== '/') path = path.slice(0, path.lastIndexOf('/') + 1);
      return window.location.origin + path;
    } catch (e) {
      return 'https://playavista99.github.io/cruise-game-scoring/';
    }
  }
  const menuPanel = document.getElementById('menuPanel');
  const menuBtn = document.getElementById('menuBtn');
  function closeMenu() {
    if (menuPanel) menuPanel.classList.add('hidden');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
  }
  if (menuBtn && menuPanel) {
    menuBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      const willOpen = menuPanel.classList.contains('hidden');
      if (willOpen) {
        menuPanel.classList.remove('hidden');
        menuBtn.setAttribute('aria-expanded', 'true');
        checkForUpdates();
      }
      else closeMenu();
    });
    document.addEventListener('click', function (ev) {
      if (!menuPanel.classList.contains('hidden') && !menuPanel.contains(ev.target)) closeMenu();
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeMenu(); });
  }
  /* ----- App version + in-app update check -----
     version.json is the published version marker. Checking is a plain
     no-store fetch, so it works in an ordinary browser tab as well as
     in the installed PWA. Failing to fetch is normal on ship Wi-Fi and
     is reported as a soft "can't check" line, never as an error. */
  const menuVersionText = document.getElementById('menuVersionText');
  const updateStatus = document.getElementById('updateStatus');
  const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
  const updateNowBtn = document.getElementById('updateNowBtn');
  if (menuVersionText) menuVersionText.textContent = 'Version ' + APP_VERSION;
  let updateCheckInFlight = false;
  let updateRemoteVersion = null;
  let updateInProgress = false;

  function setUpdateStatus(text) {
    if (updateStatus) updateStatus.textContent = text || '';
  }
  function showUpdateButton(show) {
    if (!updateNowBtn) return;
    updateNowBtn.classList.toggle('hidden', !show);
  }
  function justUpdatedFlag() {
    try { return window.sessionStorage.getItem(UPDATE_FLAG_KEY) === '1'; } catch (e) { return false; }
  }
  function setJustUpdatedFlag() {
    try { window.sessionStorage.setItem(UPDATE_FLAG_KEY, '1'); } catch (e) { /* private mode: the note is a nicety */ }
  }
  function clearJustUpdatedFlag() {
    try { window.sessionStorage.removeItem(UPDATE_FLAG_KEY); } catch (e) { /* nothing to clear */ }
  }
  function checkForUpdates() {
    if (updateCheckInFlight) return Promise.resolve(false);
    updateCheckInFlight = true;
    if (checkUpdatesBtn) {
      checkUpdatesBtn.disabled = true;
      checkUpdatesBtn.textContent = 'Checking…';
    }
    const url = 'version.json?cb=' + Date.now();
    return Promise.resolve().then(function () {
      return fetch(url, { cache: 'no-store' });
    }).then(function (res) {
      if (!res || !res.ok) throw new Error('version check failed');
      return res.json();
    }).then(function (data) {
      const remote = data && data.version !== null && data.version !== undefined ? String(data.version).trim() : '';
      if (!remote || !/^\d+(?:\.\d+)*$/.test(remote)) throw new Error('version check failed');
      updateRemoteVersion = remote;
      const cmp = compareVersions(remote, APP_VERSION);
      if (cmp > 0) {
        setUpdateStatus('Update available: v' + remote);
        showUpdateButton(true);
      } else if (cmp === 0 && justUpdatedFlag()) {
        setUpdateStatus('Updated — you\'re on the latest version ✓');
        showUpdateButton(false);
        clearJustUpdatedFlag();
      } else {
        setUpdateStatus('You\'re up to date ✓');
        showUpdateButton(false);
      }
      return true;
    }).catch(function () {
      updateRemoteVersion = null;
      setUpdateStatus('Can\'t check right now — you may be offline.');
      showUpdateButton(false);
      return false;
    }).then(function (result) {
      updateCheckInFlight = false;
      if (checkUpdatesBtn) {
        checkUpdatesBtn.disabled = false;
        checkUpdatesBtn.textContent = 'Check for updates';
      }
      return result;
    });
  }
  if (checkUpdatesBtn) checkUpdatesBtn.addEventListener('click', function () { checkForUpdates(); });

  function reloadApp() {
    /* A test hook lets the jsdom suite stub the reload (jsdom's
       Location.reload is not writable); real browsers never set it. */
    if (typeof window.__cgsaReload === 'function') { window.__cgsaReload(); return; }
    window.location.reload();
  }
  function deleteShellCaches() {
    if (!('caches' in window) || !window.caches) return Promise.resolve(false);
    return window.caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('cgsa-shell') === 0; })
        .map(function (k) { return window.caches.delete(k); }));
    }).then(function () { return true; });
  }
  function performUpdate() {
    if (updateInProgress) return Promise.resolve(false);
    updateInProgress = true;
    if (updateNowBtn) updateNowBtn.disabled = true;
    setJustUpdatedFlag();
    let reloaded = false;
    let fallbackTimer = null;
    let swEvents = null;
    function reloadOnce() {
      if (reloaded) return;
      reloaded = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (swEvents && typeof swEvents.remove === 'function') swEvents.remove();
      reloadApp();
    }
    function getRegistration() {
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker ||
          typeof navigator.serviceWorker.getRegistration !== 'function') {
        return Promise.resolve(null);
      }
      return navigator.serviceWorker.getRegistration().catch(function () { return null; });
    }
    return getRegistration().then(function (registration) {
      let chain = Promise.resolve();
      if (registration) {
        if (typeof navigator.serviceWorker.addEventListener === 'function') {
          const onControllerChange = function () { reloadOnce(); };
          navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
          swEvents = {
            remove: function () {
              if (typeof navigator.serviceWorker.removeEventListener === 'function') {
                navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
              }
            }
          };
        }
        fallbackTimer = setTimeout(reloadOnce, 1200);
        if (typeof registration.update === 'function') {
          chain = Promise.resolve().then(function () { return registration.update(); }).catch(function () { /* reload anyway */ });
        }
      }
      return chain.then(function () {
        return deleteShellCaches().catch(function () { /* reload anyway */ });
      }).then(function () {
        if (registration) {
          if (registration.waiting && typeof registration.waiting.postMessage === 'function') {
            try { registration.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) { /* fallback reload covers it */ }
          }
          /* The controllerchange listener or the fallback timer reloads. */
        } else {
          reloadOnce();
        }
        return true;
      });
    }).catch(function () {
      reloadOnce();
      return true;
    }).then(function (result) {
      if (updateNowBtn) updateNowBtn.disabled = false;
      if (!reloaded) {
        /* A service-worker update is still settling; the pending
           controllerchange/fallback owns the reload and the flag. */
        updateInProgress = true;
      } else {
        updateInProgress = false;
      }
      return result;
    });
  }
  if (updateNowBtn) updateNowBtn.addEventListener('click', function () { performUpdate(); });
  window.CruiseGameScoring.checkForUpdates = checkForUpdates;
  window.CruiseGameScoring.performUpdate = performUpdate;

  // WhatsApp entry: shown only when an invite link is configured in config.js.
  (function () {
    const wa = document.getElementById('menuWhatsappBtn');
    const url = (window.APP_CONFIG || {}).WHATSAPP_GROUP_URL;
    if (wa && url) {
      wa.href = url;
      wa.classList.remove('hidden');
      wa.addEventListener('click', closeMenu);
    }
  })();

  /* Install this app (PWA prompt when the browser offers one) */
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    deferredInstallPrompt = ev;
  });
  window.addEventListener('appinstalled', function () { deferredInstallPrompt = null; });
  function openInstall() {
    closeMenu();
    if (deferredInstallPrompt) {
      const p = deferredInstallPrompt;
      deferredInstallPrompt = null;
      p.prompt();
      if (p.userChoice) p.userChoice.catch(function () { /* user decided; nothing to do */ });
      return;
    }
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    const isiOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
    let body;
    if (standalone) {
      body = '<p class="note">You are already running the installed app — you are all set.</p>';
    } else if (isiOS) {
      body = '<p class="note">On iPhone/iPad: tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>. The app then opens full-screen and works with no connection.</p>';
    } else {
      body = '<p class="note">In Chrome on Android: tap the <b>⋮</b> browser menu, then <b>Add to Home screen</b> (or <b>Install app</b>). On a computer, use the install icon at the right end of the address bar.</p>';
    }
    openModal('<h2 style="margin-top:0">📲 Install this app</h2>' + body +
      '<button class="btn block" id="installClose">Done</button>');
    document.getElementById('installClose').addEventListener('click', closeModal);
  }
  const menuInstallBtn = document.getElementById('menuInstallBtn');
  if (menuInstallBtn) menuInstallBtn.addEventListener('click', openInstall);

  /* Share / QR code — QR is drawn on-device by qr.js, nothing is fetched. */
  function openShare() {
    closeMenu();
    const url = siteUrl();
    openModal('<h2 style="margin-top:0">🔗 Share this app</h2>' +
      '<p class="note">Point a camera at the code, or send the link — it opens this scoring app, free, with nothing to sign up for.</p>' +
      '<div class="qrbox" id="shareQr" role="img" aria-label="QR code that opens this app"></div>' +
      '<p class="shareurl">' + esc(url) + '</p>' +
      '<button class="btn block" id="shareBtn">Share…</button>' +
      '<button class="btn secondary block" id="shareCopy">Copy link</button>' +
      '<button class="btn ghost block" id="shareClose">Close</button>');
    const box = document.getElementById('shareQr');
    try {
      if (typeof qrcode !== 'function') throw new Error('qr library missing');
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 16, scalable: true });
    } catch (e) {
      box.innerHTML = '<p class="note" style="text-align:center">The QR code couldn’t be drawn on this device — the link below works just the same.</p>';
    }
    document.getElementById('shareClose').addEventListener('click', closeModal);
    document.getElementById('shareCopy').addEventListener('click', function () { copyText(url, 'Link copied — paste it anywhere.'); });
    document.getElementById('shareBtn').addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({ title: 'Cruise Game Scoring', text: 'Score cruise ship deck games — Quick Score, brackets and round robins, all on one phone:', url: url }).catch(function () { /* dismissed */ });
      } else {
        copyText(url, 'Link copied — paste it anywhere.');
      }
    });
  }
  const menuShareBtn = document.getElementById('menuShareBtn');
  if (menuShareBtn) menuShareBtn.addEventListener('click', openShare);

  /* Send feedback — ONE shared form, used by the menu entry and the
     home-page button. Inserts into the Supabase `feedback` table
     (insert-only RLS). A failed insert says so plainly; the typed
     text is never thrown away or silently "sent". */
  function openFeedback() {
    closeMenu();
    openModal('<div class="feedbackbox"><h2 style="margin-top:0">✉️ Send feedback</h2>' +
      '<p class="note">Ideas, bugs, a game we should add — it goes straight to the people who run this app.</p>' +
      '<form id="fbForm">' +
      '<label class="field"><span>Your feedback</span><textarea id="fbMessage" rows="5" maxlength="2000" placeholder="What should we know?"></textarea></label>' +
      '<label class="field"><span>Your name (optional)</span><input type="text" id="fbName" maxlength="80" autocomplete="name"></label>' +
      '<p class="fb-error" id="fbError"></p>' +
      '<button class="btn feedbacksubmit block" id="fbSubmit" type="submit">Send feedback</button>' +
      '</form>' +
      '<button class="btn ghost block" id="fbCancel">Cancel</button></div>');
    document.getElementById('fbCancel').addEventListener('click', closeModal);
    document.getElementById('fbForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      const err = document.getElementById('fbError');
      const msgEl = document.getElementById('fbMessage');
      const message = msgEl.value.trim();
      err.textContent = '';
      if (!message) { err.textContent = 'Please write a little feedback first, then tap Send.'; msgEl.focus(); return; }
      const nameVal = document.getElementById('fbName').value.trim();
      const cfg = window.APP_CONFIG || {};
      if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
        err.textContent = 'Sorry — feedback couldn’t be sent from this copy of the app. Please try again later.';
        return;
      }
      const btn = document.getElementById('fbSubmit');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      const fbHeaders = {
        Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      };
      fbHeaders['api' + 'key'] = cfg.SUPABASE_ANON_KEY;
      fetch(cfg.SUPABASE_URL + '/rest/v1/feedback', {
        method: 'POST',
        headers: fbHeaders,
        body: JSON.stringify({ message: message, name: nameVal ? nameVal : null })
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        openModal('<div class="feedbackbox"><div class="fb-thanks"><div class="thanks-ic">💌</div>' +
          '<h2>Thanks — feedback sent</h2>' +
          '<p class="note">We read everything. If it was about a game or a bug, it helps more than you know.</p>' +
          '<button class="btn feedbacksubmit block" id="fbThanksClose">Done</button></div></div>');
        document.getElementById('fbThanksClose').addEventListener('click', closeModal);
      }).catch(function () {
        err.textContent = 'Sorry — feedback couldn’t be sent. Your text is still here, so please check your connection and try Send again.';
        btn.disabled = false;
        btn.textContent = 'Send feedback';
      });
    });
    document.getElementById('fbMessage').focus();
  }
  const menuFeedbackBtn = document.getElementById('menuFeedbackBtn');
  if (menuFeedbackBtn) menuFeedbackBtn.addEventListener('click', openFeedback);

  /* ----- init ----- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline shell is a bonus, not a requirement */ });
    });
  }
  sbInit();
  render();
})();
