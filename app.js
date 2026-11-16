/* Cruise Game Scoring App — static port.
   All games, templates and history live in localStorage on this device.
   Supabase is used ONLY for the optional staff account: sign-in plus
   cloud sync of custom templates. Nothing about players or games ever
   leaves the device. */
(function () {
  'use strict';
  const E = window.Engines;

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
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* storage full/blocked */ } }

  function allTemplates() { return BUILTINS.concat(S.templates); }
  function getTemplate(id) { return allTemplates().find(function (t) { return t.id === id; }) || null; }
  function getGame(id) { return S.games.find(function (g) { return g.id === id; }) || null; }
  function entryName(game, id) {
    const e = game.entries.find(function (x) { return x.id === id; });
    return e ? e.name : '—';
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
  document.getElementById('brandBtn').addEventListener('click', function () { go('home'); });
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
      '<button class="btn block" id="newGameBtn" style="min-height:64px;font-size:19px">＋ New game</button>';
    if (inProgress.length) {
      h += '<h2>In progress</h2>';
      inProgress.slice().reverse().forEach(function (g) {
        h += '<div class="card row"><div>' + badge(g) + '</div><div class="grow">' +
          '<div class="gamename">' + esc(g.name) + '</div>' +
          '<div class="sub">' + esc(formatLabel(g)) + ' · ' + g.entries.length + ' ' + (g.entryKind === 'teams' ? 'teams' : 'players') + ' · ' + fmtDate(g.createdAt) + '</div></div>' +
          '<button class="btn small" data-continue="' + g.id + '">Continue</button></div>';
      });
    }
    h += '<div class="row wrap" style="margin-top:14px">' +
      '<button class="btn secondary grow" id="historyBtn">🏆 History' + (finished.length ? ' (' + finished.length + ')' : '') + '</button>' +
      '<button class="btn secondary grow" id="templatesBtn">🎲 My games</button></div>';
    h += '<p class="note" style="margin-top:16px">Everything is saved on this device and works with no connection. An optional staff account (top right) only syncs your custom game templates.</p>';
    h += '<button class="btn feedbackbtn block" id="homeFeedbackBtn" style="margin-top:18px">✉️ Send feedback</button>';
    return h;
  };
  BINDS.home = function () {
    document.getElementById('newGameBtn').addEventListener('click', function () { go('pick'); });
    document.getElementById('homeFeedbackBtn').addEventListener('click', function () { openFeedback(); });
    document.getElementById('historyBtn').addEventListener('click', function () { go('history'); });
    document.getElementById('templatesBtn').addEventListener('click', function () { go('templates'); });
    document.querySelectorAll('[data-continue]').forEach(function (b) {
      b.addEventListener('click', function () { go('play', b.getAttribute('data-continue')); });
    });
  };

  function formatLabel(g) {
    if (g.format === 'quick') return 'Quick Score';
    if (g.format === 'bracket') return (g.elim === 'double' ? 'Double-elim bracket' : 'Single-elim bracket');
    return 'Round Robin' + (g.rrPairing === 'results' ? ' · Results-based' : ' · Pre-set');
  }

  /* ----- Pick a game ----- */
  SCREENS.pick = function () {
    let h = '<h1>Pick a game</h1><div class="grid">';
    allTemplates().forEach(function (t) {
      h += '<button class="pickcard" data-pick="' + t.id + '">' + badge(t, 54) + '<span>' + esc(t.name) + '</span>' +
        (t.builtin ? '' : '<span class="sub">Custom</span>') + '</button>';
    });
    h += '<button class="pickcard" id="createBtn">' + badge({ icon: '➕', color: '#0b6fa4' }, 54) + '<span>Create new game</span></button>';
    h += '</div><button class="btn ghost block" id="backBtn">Back</button>';
    return h;
  };
  BINDS.pick = function () {
    document.querySelectorAll('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () { startDraft(b.getAttribute('data-pick')); });
    });
    document.getElementById('createBtn').addEventListener('click', function () { go('templateEditor', { id: null, thenSetup: true }); });
    document.getElementById('backBtn').addEventListener('click', function () { go('home'); });
  };

  function startDraft(templateId) {
    const t = getTemplate(templateId);
    draft = {
      templateId: templateId,
      def: { attempts: t.attempts, buttons: clone(t.buttons), winDir: t.winDir },
      format: 'quick', entryKind: 'individuals', scoreMode: 'tap',
      elim: 'single', rrGames: '2', rrPairing: 'preset', playoffSize: '0', playoffElim: 'single',
      entries: []
    };
    go('setup');
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
  SCREENS.setup = function () {
    const t = getTemplate(draft.templateId);
    let h = '<h1>Set up: ' + esc(t.name) + '</h1>' +
      '<div class="card row"><div>' + badge(t) + '</div><div class="grow"><div class="gamename">' + esc(t.name) + '</div>' +
      '<div class="sub">Scoring rules below start from the template — change anything for this game only.</div></div></div>' +
      '<div id="setupDefWrap">' + defEditorHTML(draft.def, 'su') + '</div>' +
      '<h2>Format</h2>' + segHTML('segFormat', [
        { v: 'quick', label: 'Quick Score' }, { v: 'bracket', label: 'Bracket' }, { v: 'rr', label: 'Round Robin' }], draft.format) +
      '<h2>Who is playing</h2>' + segHTML('segKind', [
        { v: 'individuals', label: 'Individuals' }, { v: 'teams', label: 'Teams' }], draft.entryKind) +
      '<h2>Score entry</h2>' + segHTML('segMode', [
        { v: 'tap', label: 'Tap-by-tap (app adds up)' }, { v: 'total', label: 'Type final total' }], draft.scoreMode) +
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
    });
    bindSeg('segKind', null, function (v) { draft.entryKind = v; });
    bindSeg('segMode', null, function (v) { draft.scoreMode = v; });
    bindSeg('segElim', null, function (v) { draft.elim = v; });
    bindSeg('segPairing', null, function (v) { draft.rrPairing = v; });
    bindSeg('segPlayoff', null, function (v) {
      draft.playoffSize = v;
      document.getElementById('playoffElimWrap').classList.toggle('hidden', v === '0');
    });
    bindSeg('segPlayoffElim', null, function (v) { draft.playoffElim = v; });
    document.getElementById('setupBack').addEventListener('click', function () { go('pick'); });
    document.getElementById('toSignup').addEventListener('click', function () {
      draft.def = readDefEditor('su');
      const rrInput = document.getElementById('rrGames');
      if (rrInput) draft.rrGames = rrInput.value;
      go('signup');
    });
  };

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
  SCREENS.signup = function () {
    const kindWord = draft.entryKind === 'teams' ? 'team' : 'player';
    let h = '<h1>Sign up ' + kindWord + 's</h1>' +
      '<p class="note">Name is required. Cabin is optional — it tells apart duplicate names and helps find winners later.' +
      (draft.entryKind === 'teams' ? ' Member names are optional too.' : '') + '</p>' +
      '<div id="entryList">';
    draft.entries.forEach(function (e, i) {
      h += entryRowHTML(e, i);
    });
    h += '</div>' +
      '<div class="entryrow"><input type="text" class="nm" id="newName" placeholder="' + (draft.entryKind === 'teams' ? 'Team' : 'Player') + ' name" autocomplete="off">' +
      '<input type="text" class="cb" id="newCabin" placeholder="Cabin" inputmode="numeric">' +
      '<button class="iconbtn" id="addEntry" aria-label="Add">＋</button></div>' +
      (draft.entryKind === 'teams' ? '<input type="text" id="newMembers" placeholder="Member names (optional)" style="margin:4px 0 8px">' : '') +
      '<p class="note" id="rrPreview"></p>' +
      '<div class="row wrap">' +
      (draft.format === 'bracket' ? '<button class="btn secondary" id="shuffleBtn">🔀 Shuffle seeds</button>' : '') +
      '<span class="grow"></span><span class="sub" id="entryCount"></span></div>' +
      '<button class="btn block" id="startBtn" style="margin-top:12px">Start game</button>' +
      '<button class="btn ghost block" id="signupBack">Back to setup</button>';
    return h;
  };
  function entryRowHTML(e, i) {
    return '<div class="card row" style="margin:6px 0;padding:10px 12px"><div class="grow">' +
      '<span class="gamename" style="font-size:16px">' + (i + 1) + '. ' + esc(e.name) + '</span>' +
      (e.cabin ? '<span class="tag">Cabin ' + esc(e.cabin) + '</span>' : '') +
      (e.members ? '<div class="sub">' + esc(e.members) + '</div>' : '') +
      '</div><button class="iconbtn" data-delentry="' + i + '" aria-label="Remove">✕</button></div>';
  }
  BINDS.signup = function () {
    const refresh = function () {
      document.getElementById('entryList').innerHTML = draft.entries.map(entryRowHTML).join('');
      document.querySelectorAll('[data-delentry]').forEach(function (b) {
        b.addEventListener('click', function () {
          draft.entries.splice(parseInt(b.getAttribute('data-delentry'), 10), 1);
          refresh();
        });
      });
      document.getElementById('entryCount').textContent = draft.entries.length + (draft.entryKind === 'teams' ? ' teams' : ' players');
      const pv = document.getElementById('rrPreview');
      if (pv) pv.textContent = draft.format === 'rr' ? rrPreview(draft.entries.length) : '';
      document.getElementById('startBtn').disabled = draft.entries.length < 2;
    };
    const addFromInputs = function () {
      const nm = document.getElementById('newName');
      const name = nm.value.trim();
      if (!name) { nm.focus(); return; }
      const e = { id: E.uid('e'), name: name, cabin: document.getElementById('newCabin').value.trim() };
      const mem = document.getElementById('newMembers');
      if (mem && mem.value.trim()) e.members = mem.value.trim();
      draft.entries.push(e);
      nm.value = ''; document.getElementById('newCabin').value = '';
      if (mem) mem.value = '';
      nm.focus();
      refresh();
    };
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
      entries: clone(draft.entries), matches: [], playoffMatches: null,
      status: 'playing', winnerId: null, createdAt: Date.now(), finishedAt: null
    };
    game.entries.forEach(function (e) { e.taps = []; e.total = null; });
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
    let h = '<div class="card row"><div>' + badge(game) + '</div><div class="grow">' +
      '<div class="gamename">' + esc(game.name) + '</div><div class="sub">' + esc(formatLabel(game)) + ' · ' +
      (game.scoreMode === 'tap' ? 'Tap-by-tap scoring' : 'Final-total scoring') + '</div></div>' +
      '<button class="btn small secondary" id="gameSettingsBtn">⚙ Game settings</button></div>';
    if (game.format === 'quick') h += quickPlayHTML(game);
    else if (game.format === 'bracket') h += bracketPlayHTML(game, game.matches, 'brk');
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
    document.getElementById('homeBtn').addEventListener('click', function () { go('home'); });
    document.getElementById('deleteGameBtn').addEventListener('click', function () {
      if (!confirm('Delete this game and its scores?')) return;
      S.games = S.games.filter(function (g) { return g.id !== game.id; });
      save(); go('home');
    });
    const fb = document.getElementById('finishBtn');
    if (fb) fb.addEventListener('click', function () {
      let winner = null;
      if (game.format === 'quick') { const s = quickSorted(game); winner = s.length ? s[0].id : null; }
      else winner = currentChampion(game);
      game.status = 'finished';
      game.winnerId = winner;
      game.finishedAt = Date.now();
      save(); go('finish', game.id);
    });
    if (game.format === 'quick') bindQuick(game);
    else if (game.format === 'bracket') bindMatchCards(game, game.matches, 'brk');
    else bindRR(game);
  };

  /* ----- Quick Score play ----- */
  function quickPlayHTML(game) {
    const sorted = quickSorted(game);
    let h = '<h2>Leaderboard</h2>';
    sorted.forEach(function (e, i) {
      const sc = quickScore(game, e);
      h += '<div class="card" style="margin:8px 0;padding:12px"><div class="row spread">' +
        '<div class="grow"><span class="gamename" style="font-size:17px">' + (i + 1) + '. ' + esc(e.name) + '</span>' +
        (e.cabin ? '<span class="tag">Cabin ' + esc(e.cabin) + '</span>' : '') + '</div>' +
        '<div class="score" style="font-size:20px;font-weight:800">' + (sc === null ? '—' : sc) + '</div></div>';
      if (game.scoreMode === 'tap') {
        const taps = e.taps || [];
        h += '<div class="sub" style="margin-top:4px">' + taps.length + '/' + game.def.attempts + ' attempts' +
          (taps.length ? ' · ' + taps.map(function (ti) { return esc(game.def.buttons[ti] ? game.def.buttons[ti].label : '?'); }).join(', ') : '') + '</div>' +
          '<div class="taprow">' + game.def.buttons.map(function (b, bi) {
            return '<button class="tapbtn" data-tap="' + e.id + ':' + bi + '"' + (taps.length >= game.def.attempts ? ' disabled' : '') + '>' + esc(b.label) + '<small>' + b.points + ' pts</small></button>';
          }).join('') + '</div>' +
          (taps.length ? '<button class="btn small secondary" data-undo="' + e.id + '" style="margin-top:8px">↩ Undo last tap</button>' : '');
      } else {
        h += '<div class="entryrow" style="margin-top:8px"><input type="text" inputmode="numeric" placeholder="Final total" value="' +
          (e.total === null ? '' : e.total) + '" data-total="' + e.id + '"><span class="sub">tap outside the box to save</span></div>';
      }
      h += '</div>';
    });
    h += '<h3>Add a walk-up</h3><div class="entryrow">' +
      '<input type="text" class="nm" id="walkName" placeholder="Name" autocomplete="off">' +
      '<input type="text" class="cb" id="walkCabin" placeholder="Cabin" inputmode="numeric">' +
      '<button class="iconbtn" id="walkAdd" aria-label="Add">＋</button></div>';
    return h;
  }
  function bindQuick(game) {
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
      game.entries.push({ id: E.uid('e'), name: nm.value.trim(), cabin: document.getElementById('walkCabin').value.trim(), taps: [], total: null });
      save(); render();
    });
  }

  /* ----- Match cards + inline scorer (bracket & round robin) ----- */
  function matchLabel(game, matches, m) {
    return 'M' + (matches.indexOf(m) + 1);
  }
  function sideName(game, matches, m, side) {
    const id = side === 'a' ? m.aId : m.bId;
    if (id) return entryName(game, id);
    const src = side === 'a' ? m.srcA : m.srcB;
    if (src && (src.t === 'win' || src.t === 'lose')) {
      const srcMatch = matches.find(function (x) { return x.id === src.m; });
      const lbl = srcMatch ? 'M' + (matches.indexOf(srcMatch) + 1) : '';
      return (src.t === 'win' ? 'Winner of ' : 'Loser of ') + lbl;
    }
    return 'TBD';
  }
  function matchCardHTML(game, matches, m, where) {
    const isOpen = openScorer && openScorer.matchId === m.id;
    let vs, scoreTxt = '';
    if (m.autoBye) {
      vs = esc(entryName(game, m.winnerId)) + ' <span class="tag">bye</span>';
    } else {
      vs = esc(sideName(game, matches, m, 'a')) + ' <span class="sub">vs</span> ' + esc(sideName(game, matches, m, 'b'));
    }
    if (m.scored && !m.autoBye) scoreTxt = '<span class="score">' + m.sa + ' – ' + m.sb + '</span>';
    let winnerTag = '';
    if (m.scored && m.winnerId && !m.autoBye) winnerTag = '<span class="tag win">✓ ' + esc(entryName(game, m.winnerId)) + '</span>';
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
      h += '<div class="sidebox"><div class="who">' + esc(entryName(game, m.aId)) + '</div>' +
        '<input type="text" inputmode="numeric" id="scA" value="' + (m.sa === null ? '' : m.sa) + '" placeholder="Final total"></div>' +
        '<div class="sidebox"><div class="who">' + esc(entryName(game, m.bId)) + '</div>' +
        '<input type="text" inputmode="numeric" id="scB" value="' + (m.sb === null ? '' : m.sb) + '" placeholder="Final total"></div>';
    } else {
      [ ['a', m.aId], ['b', m.bId] ].forEach(function (pair) {
        const side = pair[0], eid = pair[1];
        const taps = side === 'a' ? openScorer.tapsA : openScorer.tapsB;
        const total = E.tapsTotal(def, taps);
        h += '<div class="sidebox"><div class="row spread"><div class="who">' + esc(entryName(game, eid)) + '</div>' +
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
    return 'Round ' + round;
  }
  function bracketPlayHTML(game, matches, where) {
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
    if (champ) h += '<div class="winnerbanner"><div class="crown">🏆</div><div class="sub" style="color:#cfe8f5">Champion</div><div class="wname">' + esc(entryName(game, champ)) + '</div></div>';
    return h;
  }

  /* ----- Round Robin play ----- */
  function rrPlayHTML(game) {
    const st = E.computeStandings(game.entries, game.matches, game.def);
    let h = '<h2>Standings</h2><div class="card" style="padding:8px 12px"><table class="stand"><tr><th>#</th><th>' +
      (game.entryKind === 'teams' ? 'Team' : 'Player') + '</th><th class="num">P</th><th class="num">W</th><th class="num">L</th><th class="num">Diff</th><th class="num">Pts</th></tr>';
    st.forEach(function (r, i) {
      const e = game.entries.find(function (x) { return x.id === r.id; });
      h += '<tr' + (i === 0 ? ' class="top"' : '') + '><td>' + (i + 1) + '</td><td>' + esc(e ? e.name : r.id) +
        (e && e.cabin ? ' <span class="sub">(' + esc(e.cabin) + ')</span>' : '') + '</td>' +
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
        h += '<p class="note">Bye this round: <b>' + esc(entryName(game, game.rrByeByRound[r])) + '</b>' + (game.rrPairing === 'results' ? ' (counts as one of their games)' : '') + '</p>';
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
      h += '<div class="card"><b>Round robin complete.</b> <span class="sub">Leader: ' + esc(st.length ? entryName(game, st[0].id) : '—') + '</span></div>';
      if (game.playoffSize > 0 && !game.playoffMatches) {
        const k = Math.min(game.playoffSize, game.entries.length);
        if (k >= 2) h += '<button class="btn block" id="startPlayoffBtn">Start playoff — top ' + k + ' (' + (game.playoffElim === 'double' ? 'double' : 'single') + ' elimination)</button>';
      }
    }
    if (game.playoffMatches) {
      h += '<h2>Playoff bracket</h2>' + bracketPlayHTML(game, game.playoffMatches, 'po');
    }
    return h;
  }
  function bindRR(game) {
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
        save(); render();
      }
    });
    const sp = document.getElementById('startPlayoffBtn');
    if (sp) sp.addEventListener('click', function () {
      const st = E.computeStandings(game.entries, game.matches, game.def);
      const k = Math.min(game.playoffSize, game.entries.length);
      const seeds = st.slice(0, k).map(function (r) { return r.id; });
      game.playoffMatches = game.playoffElim === 'double' ? E.buildDoubleElim(seeds) : E.buildSingleElim(seeds);
      game.playoffMatches.forEach(function (m) { m.stage = m.stage === 'brk' ? 'brk' : m.stage; });
      E.resolveBracket(game.def, game.playoffMatches);
      save(); render();
    });
  }

  /* ----- Game settings (in-game editor) ----- */
  function showGameSettings(game) {
    openModal('<h2 style="margin-top:0">Game settings — ' + esc(game.name) + '</h2>' +
      '<p class="note">Change the scoring rules for this game. Scores already entered stay as they are.</p>' +
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
      game.def = readDefEditor('gs');
      save(); closeModal(); render();
    });
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
    // Returns [{id, name, cabin, line}] in finishing order, best first.
    if (game.format === 'quick') {
      return quickSorted(game).map(function (e) {
        const sc = quickScore(game, e);
        return { id: e.id, name: e.name, cabin: e.cabin, line: (sc === null ? '—' : sc + ' pts') };
      });
    }
    if (game.format === 'rr') {
      return E.computeStandings(game.entries, game.matches, game.def).map(function (r) {
        const e = game.entries.find(function (x) { return x.id === r.id; });
        return { id: r.id, name: e ? e.name : r.id, cabin: e ? e.cabin : '', line: r.w + 'W–' + r.l + 'L' + (r.d ? '–' + r.d + 'D' : '') + ' · ' + r.pf + ' pts' };
      });
    }
    // Bracket: champion first, then everyone else in seed order.
    const champ = game.winnerId;
    const rest = game.entries.filter(function (e) { return e.id !== champ; });
    const out = [];
    if (champ) { const c = game.entries.find(function (e) { return e.id === champ; }); out.push({ id: c.id, name: c.name, cabin: c.cabin, line: 'Champion' }); }
    rest.forEach(function (e) { out.push({ id: e.id, name: e.name, cabin: e.cabin, line: '' }); });
    return out;
  }
  function resultsText(game) {
    const rows = finalStandings(game);
    const winner = game.winnerId ? entryName(game, game.winnerId) : (rows.length ? rows[0].name : '—');
    let txt = game.name + ' — ' + formatLabel(game) + '\n' + fmtDate(game.finishedAt || game.createdAt) + '\n🏆 Winner: ' + winner + '\n';
    if (game.format === 'rr' && game.playoffMatches && game.winnerId) txt += 'Playoff champion: ' + winner + '\n';
    txt += '\nResults:\n';
    rows.forEach(function (r, i) { txt += (i + 1) + '. ' + r.name + (r.cabin ? ' (cabin ' + r.cabin + ')' : '') + (r.line ? ' — ' + r.line : '') + '\n'; });
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
    c.fillText(game.name, 450, 185);
    c.font = '400 26px system-ui, sans-serif'; c.fillStyle = '#cfe8f5';
    c.fillText(formatLabel(game) + ' · ' + fmtDate(game.finishedAt || game.createdAt), 450, 228);
    c.font = '800 40px system-ui, sans-serif'; c.fillStyle = '#ffd34d';
    c.fillText('🏆 ' + winner, 450, 282);
    c.fillStyle = '#ffffff'; c.fillRect(0, 300, cv.width, cv.height - 300);
    c.textAlign = 'left'; c.fillStyle = '#12212e';
    rows.forEach(function (r, i) {
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

  SCREENS.finish = function (gameId) {
    const game = getGame(gameId);
    if (!game) return '<p class="empty">Game not found.</p>';
    const rows = finalStandings(game);
    const winner = game.winnerId ? entryName(game, game.winnerId) : (rows.length ? rows[0].name : '—');
    let h = '<div class="winnerbanner"><div class="crown">🏆</div><div class="sub" style="color:#cfe8f5">' + esc(game.name) + ' winner</div>' +
      '<div class="wname">' + esc(winner) + '</div></div>';
    if (game.format === 'rr' && game.playoffMatches) h += '<p class="note" style="text-align:center">Playoff champion — round robin standings below.</p>';
    h += '<div class="card"><table class="stand">';
    rows.forEach(function (r, i) {
      h += '<tr' + (i === 0 ? ' class="top"' : '') + '><td>' + (i + 1) + '</td><td>' + esc(r.name) +
        (r.cabin ? ' <span class="sub">(cabin ' + esc(r.cabin) + ')</span>' : '') + '</td><td class="num">' + esc(r.line) + '</td></tr>';
    });
    h += '</table></div>' + shareButtonsHTML(game) +
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
      elim: old.elim, entries: old.entries.map(function (e) {
        return { id: e.id, name: e.name, cabin: e.cabin, members: e.members, taps: [], total: null };
      }),
      matches: [], playoffMatches: null, status: 'playing', winnerId: null,
      createdAt: Date.now(), finishedAt: null
    };
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
    S.games.push(game); save();
    go('play', game.id);
  }

  /* ----- History ----- */
  SCREENS.history = function () {
    const finished = S.games.filter(function (g) { return g.status === 'finished'; }).slice().reverse();
    let h = '<h1>History</h1>';
    if (!finished.length) h += '<p class="empty">No finished games yet.</p>';
    finished.forEach(function (g) {
      h += '<div class="card row"><div>' + badge(g) + '</div><div class="grow"><div class="gamename">' + esc(g.name) + '</div>' +
        '<div class="sub">' + esc(formatLabel(g)) + ' · ' + fmtDate(g.finishedAt || g.createdAt) + ' · 🏆 ' + esc(g.winnerId ? entryName(g, g.winnerId) : '—') + '</div></div>' +
        '<button class="btn small" data-view="' + g.id + '">View</button></div>';
    });
    h += '<button class="btn ghost block" id="backBtn">Back</button>';
    return h;
  };
  BINDS.history = function () {
    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { go('finish', b.getAttribute('data-view')); });
    });
    document.getElementById('backBtn').addEventListener('click', function () { go('home'); });
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
      if (willOpen) { menuPanel.classList.remove('hidden'); menuBtn.setAttribute('aria-expanded', 'true'); }
      else closeMenu();
    });
    document.addEventListener('click', function (ev) {
      if (!menuPanel.classList.contains('hidden') && !menuPanel.contains(ev.target)) closeMenu();
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeMenu(); });
  }
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
