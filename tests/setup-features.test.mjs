/* End-to-end DOM tests for v1.7: setup choices.
   a. Colors toggle default: OFF for Soccer Shootout, ON for Bean Bag
      Toss — and it can be flipped either way at setup.
   b. Colors OFF: no swatches at sign-up, entries carry no color, no
      dots/names in play, Edit players, finish or the shared results
      text, walk-ups get no color. Colors ON: exactly the old behavior.
   c. An old-format saved game (entries with colors, no useColors
      flag) still renders colors — missing flag means ON.
   d. Game label: set at setup it titles the play header (base name
      kept in the sub-line), finish banner, history list and results
      text; editing it in Game settings updates it.
   e. Saved setup round-trip: a distinctive config (Bean Bag, Quick
      Score, Advance rounds [5, 8], colors ON, label, edited attempts)
      saved as a preset launches from Home straight to sign-up and
      produces a game matching the config field-by-field.
   f. A preset whose custom template was deleted is greyed, shows
      "Game template no longer exists" and has no Start button.
   g. Preset delete is the two-step in-app confirm: first tap arms,
      second tap deletes. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { ({ JSDOM } = createRequire('/tmp/qsr-test/package.json')('jsdom')); }

const DIR = new URL('..', import.meta.url).pathname;
const html = readFileSync(DIR + 'index.html', 'utf8');
const scripts = ['config.js', 'engines.js', 'qr.js', 'app.js'].map((f) => readFileSync(DIR + f, 'utf8'));

let failures = 0, checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('FAIL:', msg); }
}

let W = null;
function boot(seedState) {
  const dom = new JSDOM(html, { url: 'https://playavista99.github.io/cruise-game-scoring/', runScripts: 'outside-only' });
  const w = dom.window;
  w.confirm = () => true;
  w.alert = () => {};
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};
  w.__cap = '';
  Object.defineProperty(w.navigator, 'clipboard', {
    value: { writeText: (t) => { w.__cap = t; return Promise.resolve(); } },
    configurable: true
  });
  if (seedState) w.localStorage.setItem('cgsa-state-v1', JSON.stringify(seedState));
  scripts.forEach((s) => w.eval(s));
  W = w;
  return w;
}
const $ = (sel) => W.document.querySelector(sel);
const $$ = (sel) => Array.from(W.document.querySelectorAll(sel));
const click = (el, what) => { if (!el) throw new Error('missing element: ' + what); el.click(); };
const state = (w) => JSON.parse(w.localStorage.getItem('cgsa-state-v1'));
const lastGame = (w) => { const g = state(w).games; return g[g.length - 1]; };
const bodyText = (w) => w.document.body.textContent;
const appHTML = (w) => w.document.getElementById('app').innerHTML;
const COLOR_WORDS = /\(Red|Blue|Green|Yellow|Orange|Purple|Black|White\)/;

function pickGame(w, templateId) {
  click($('#newGameBtn'), 'new game');
  click($(`[data-pick="${templateId}"]`), 'pick ' + templateId);
}
function addPlayers(w, names) {
  names.forEach((name) => {
    $('#newName').value = name;
    click($('#addEntry'), 'add entry ' + name);
  });
}
function setTotal(w, id, v) {
  const inp = $(`[data-total="${id}"]`);
  if (!inp) throw new Error('total input missing for ' + id);
  inp.value = String(v);
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
}
function copyResults(w) {
  w.__cap = '';
  click($('[data-share="copy"]'), 'copy results');
  return w.__cap;
}

/* ============ (a) colors toggle defaults ============ */
{
  const w = boot();
  pickGame(w, 'builtin-soccer');
  ok(!!$('#segColors'), 'a: colors seg exists on setup');
  ok($('#segColors button.on').getAttribute('data-v') === 'off', 'a: Soccer Shootout defaults colors OFF');
  // Flip it on and confirm sign-up honors it.
  click($('#segColors button[data-v="on"]'), 'colors on');
  click($('#toSignup'), 'to signup');
  addPlayers(w, ['Ana']);
  ok($$('#entryList [data-colorpick]').length === 1, 'a: soccer with colors ON shows a swatch');
  click($('#signupBack'), 'back to setup');
  click($('#setupBack'), 'back to pick');
  click($('[data-pick="builtin-beanbag"]'), 'pick beanbag from pick screen');
  ok($('#segColors button.on').getAttribute('data-v') === 'on', 'a: Bean Bag Toss defaults colors ON');
}

/* ============ (b) colors OFF end-to-end + colors ON control ============ */
{
  const w = boot();
  pickGame(w, 'builtin-beanbag');
  click($('#segMode button[data-v="total"]'), 'final-total scoring');
  click($('#segColors button[data-v="off"]'), 'colors off');
  click($('#toSignup'), 'to signup');
  addPlayers(w, ['Ann', 'Ben']);
  ok($$('#entryList [data-colorpick]').length === 0, 'b: no swatches at sign-up when colors off');
  ok(!appHTML(w).includes('colordot'), 'b: no color dots at sign-up when colors off');
  click($('#startBtn'), 'start game');
  let g = lastGame(w);
  ok(g.useColors === false, 'b: game stores useColors=false');
  ok(g.entries.every((e) => !('color' in e)), 'b: entries carry no color property');
  ok(!appHTML(w).includes('colordot'), 'b: no color dots on the play screen');
  // Walk-up gets no color either.
  $('#walkName').value = 'Walt';
  click($('#walkAdd'), 'add walk-up');
  g = lastGame(w);
  const walt = g.entries.find((e) => e.name === 'Walt');
  ok(!!walt && !('color' in walt), 'b: walk-up entry has no color');
  // Edit players shows no swatches.
  click($('#editPlayersBtn'), 'open edit players');
  ok($$('#epList [data-epcolor]').length === 0, 'b: edit players modal has no swatches');
  click($('#epDone'), 'close edit players');
  // Score and finish: no colors anywhere.
  g = lastGame(w);
  setTotal(w, g.entries[0].id, 9);
  setTotal(w, g.entries[1].id, 4);
  click($('#finishBtn'), 'finish game');
  ok(!appHTML(w).includes('colordot'), 'b: no color dots on the finish screen');
  const txt = copyResults(w);
  ok(!COLOR_WORDS.test(txt), 'b: shared results text has no color names, got: ' + txt.split('\n').slice(0, 5).join(' | '));
  ok(txt.includes('Winner: Ann'), 'b: results text still names the winner plainly');

  // Control: colors ON is exactly the old behavior.
  const w2 = boot();
  pickGame(w2, 'builtin-beanbag');
  click($('#toSignup'), 'to signup (on)');
  addPlayers(w2, ['Ann', 'Ben']);
  ok($$('#entryList [data-colorpick]').length === 2, 'b: colors ON shows swatches at sign-up');
  click($('#startBtn'), 'start game (on)');
  const g2 = lastGame(w2);
  ok(g2.useColors === true, 'b: colors ON stores useColors=true');
  ok(g2.entries[0].color === 'Red' && g2.entries[1].color === 'Blue', 'b: colors ON assigns Red/Blue, got ' + g2.entries.map((e) => e.color));
  ok(appHTML(w2).includes('colordot'), 'b: colors ON shows dots in play');
}

/* ============ (c) old-format game (no flag) still renders colors ============ */
{
  const def = { attempts: 4, buttons: [{ label: 'In the hole', points: 3 }, { label: 'On board', points: 1 }, { label: 'Miss', points: 0 }], winDir: 'high' };
  const seed = {
    templates: [],
    games: [{
      id: 'old-1', templateId: 'builtin-beanbag', name: 'Bean Bag Toss', icon: '🌽', color: '#ea580c',
      def, format: 'quick', entryKind: 'individuals', scoreMode: 'total', elim: 'single',
      entries: [
        { id: 'oe1', name: 'Old One', cabin: '', color: 'Purple', taps: [], total: 7 },
        { id: 'oe2', name: 'Old Two', cabin: '', color: 'Blue', taps: [], total: 3 }
      ],
      matches: [], playoffMatches: null, playoffField: null,
      status: 'playing', winnerId: null, createdAt: Date.now(), finishedAt: null
    }]
  };
  const w = boot(seed);
  ok(state(w).games[0].useColors === undefined, 'c: seeded game really has no useColors flag');
  click($('[data-continue="old-1"]'), 'continue old game');
  ok(appHTML(w).includes('colordot'), 'c: old game renders color dots (missing flag = ON)');
  ok(bodyText(w).includes('Old One'), 'c: old game loads and plays');
}

/* ============ (d) game label ============ */
{
  const w = boot();
  pickGame(w, 'builtin-soccer');
  click($('#segMode button[data-v="total"]'), 'final-total scoring');
  $('#suLabel').value = 'Day 1 Showdown';
  click($('#toSignup'), 'to signup');
  addPlayers(w, ['Ana', 'Ben']);
  click($('#startBtn'), 'start game');
  let g = lastGame(w);
  ok(g.label === 'Day 1 Showdown', 'd: label stored on the game');
  ok(bodyText(w).includes('Day 1 Showdown'), 'd: play header shows the label');
  ok(bodyText(w).includes('Soccer Shootout'), 'd: play header sub-line keeps the base game name');
  // Edit the label in Game settings.
  click($('#gameSettingsBtn'), 'open game settings');
  ok($('#gsLabel').value === 'Day 1 Showdown', 'd: settings field pre-filled with the label');
  $('#gsLabel').value = 'Day 2 Rematch';
  click($('#gsSave'), 'save settings');
  g = lastGame(w);
  ok(g.label === 'Day 2 Rematch', 'd: label updated via Game settings');
  ok(bodyText(w).includes('Day 2 Rematch'), 'd: play header shows the new label');
  // Finish: banner, results text, history list all use the label.
  setTotal(w, g.entries[0].id, 3);
  setTotal(w, g.entries[1].id, 1);
  click($('#finishBtn'), 'finish game');
  ok(bodyText(w).includes('Day 2 Rematch'), 'd: finish banner shows the label');
  const txt = copyResults(w);
  ok(txt.split('\n')[0].startsWith('Day 2 Rematch'), 'd: results text heading is the label, got: ' + txt.split('\n')[0]);
  click($('#finishHomeBtn'), 'home');
  click($('#historyBtn'), 'history');
  ok(bodyText(w).includes('Day 2 Rematch'), 'd: history list shows the label');
}

/* ============ (e) saved setup round-trip ============ */
{
  const w = boot();
  pickGame(w, 'builtin-beanbag');
  click($('#segQsRounds button[data-v="on"]'), 'rounds on');
  click($('#segQsMode button[data-v="advance"]'), 'advance mode');
  $('#qs-tgt-0').value = '5';
  click($('#qsAddTgt'), 'add planned round');
  $('#qs-tgt-1').value = '8';
  $('#su-attempts').value = '6';
  $('#suLabel').value = 'Harbor Night 1';
  click($('#saveSetupBtn'), 'save these settings');
  ok(!!$('#presetName'), 'e: save prompt opened');
  ok($('#presetName').value === 'Harbor Night 1', 'e: name pre-filled from the label, got: ' + $('#presetName').value);
  $('#presetName').value = 'Harbor Advance';
  click($('#presetSave'), 'confirm save');
  ok(!$('#presetName'), 'e: save prompt closed');
  const st = state(w);
  ok(st.setups.length === 1, 'e: one preset stored');
  const p = st.setups[0];
  ok(p.name === 'Harbor Advance' && p.templateId === 'builtin-beanbag', 'e: preset name + template stored');
  ok(p.qsMode === 'advance' && JSON.stringify(p.qsPlanned) === '["5","8"]', 'e: preset stores rounds plan, got ' + JSON.stringify(p.qsPlanned));
  ok(p.useColors === true && p.label === 'Harbor Night 1' && p.def.attempts === 6, 'e: preset stores colors/label/attempts');
  // Launch it from Home.
  click($('#brandBtn'), 'home');
  ok(bodyText(w).includes('Saved setups') && bodyText(w).includes('Harbor Advance'), 'e: home lists the saved setup');
  click($(`[data-startpreset="${p.id}"]`), 'start preset');
  ok(!!$('#entryList') && bodyText(w).includes('Sign up'), 'e: preset start lands straight on sign-up');
  addPlayers(w, ['Mia', 'Ned']);
  click($('#startBtn'), 'start game');
  const g = lastGame(w);
  ok(g.def.attempts === 6 && JSON.stringify(g.def) === JSON.stringify(p.def), 'e: game def matches the preset def');
  ok(g.format === 'quick' && g.scoreMode === p.scoreMode && g.entryKind === p.entryKind, 'e: format/mode/kind match');
  ok(g.qsRounds && g.qsRounds.mode === 'advance', 'e: rounds mode is Advance');
  ok(JSON.stringify(g.qsRounds.planned) === '[5,8]', 'e: planned targets are [5,8], got ' + JSON.stringify(g.qsRounds && g.qsRounds.planned));
  ok(g.useColors === true && g.label === 'Harbor Night 1', 'e: colors flag and label match');
  ok(g.entries[0].color === 'Red' && g.entries[1].color === 'Blue', 'e: colors ON assigns Red/Blue as configured');
}

/* ============ (f) preset with a deleted template + (g) two-step delete ============ */
{
  const seed = {
    templates: [], games: [],
    setups: [{
      id: 'set-ghost', name: 'Ghost Setup', createdAt: 1, templateId: 'tpl-gone',
      def: { attempts: 3, buttons: [{ label: 'Score', points: 1 }], winDir: 'high' },
      format: 'quick', entryKind: 'individuals', scoreMode: 'tap', elim: 'single',
      rrGames: '2', rrPairing: 'preset', playoffSize: '0', playoffElim: 'single',
      qsRoundsOn: 'off', qsMode: 'cumulative', qsPlanned: [''], useColors: false, label: ''
    }]
  };
  const w = boot(seed);
  ok(bodyText(w).includes('Ghost Setup'), 'f: preset listed on home');
  ok(bodyText(w).includes('Game template no longer exists'), 'f: missing-template notice shown');
  ok(!$('[data-startpreset="set-ghost"]'), 'f: no Start button for the orphaned preset');
  ok(!!$('[data-delpreset="set-ghost"]'), 'f: delete still available for the orphaned preset');
  // (g) two-step delete: first tap only arms.
  const del = $('[data-delpreset="set-ghost"]');
  click(del, 'first delete tap');
  ok(state(w).setups.length === 1, 'g: first tap does NOT delete');
  ok(del.textContent === 'Confirm delete?', 'g: button armed as Confirm delete?, got: ' + del.textContent);
  click(del, 'second delete tap');
  ok(state(w).setups.length === 0, 'g: second tap deletes the preset');
  ok(!bodyText(w).includes('Ghost Setup'), 'g: preset row gone from home');
}

console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
