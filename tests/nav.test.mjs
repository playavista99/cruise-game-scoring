/* DOM tests for v2.1 navigation + header:
   - Header markup: the brand sits in the center topzone (empty left
     spacer before it, Account/Menu zone after it) so CSS grid can
     center it.
   a. The ☰ menu's FIRST item is Home; clicking it from a deep screen
      and from mid-game closes the menu and lands Home (the mid-game
      game stays in progress).
   b. Every screen renders the shared nav row with the expected
      buttons — Back + Home, or Home only on play / roundSummary —
      and each Back lands on its specified target. The finish screen
      deliberately keeps its own buttons (Play again / Home) and has
      no nav row and no Back.
   c. Play-screen Home leaves the game in the in-progress list.
   d. No screen renders more than one Back button (asserted on every
      screen visited, via assertNav + the finish/home checks).
   e. Sign-up counter pluralization: "1 player" / "2 players",
      "1 team" / "2 teams". */
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
function boot() {
  const dom = new JSDOM(html, { url: 'https://playavista99.github.io/cruise-game-scoring/', runScripts: 'outside-only' });
  const w = dom.window;
  w.confirm = () => true;
  w.alert = () => {};
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: '2.1.1' }) });
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

/* Buttons whose label STARTS with "Back" (the shared nav row's is
   "← Back"). "Save & back to home" deliberately does not count. */
function backButtons(w) {
  return $$('#app button').filter((b) => /^←?\s*Back\b/.test(b.textContent.trim()));
}
function assertNav(w, label, expectBack) {
  ok(!!$('.navrow'), label + ': nav row rendered');
  ok(!!$('#navHomeBtn'), label + ': nav row has a Home button');
  ok(!!$('#navBackBtn') === expectBack, label + ': nav Back ' + (expectBack ? 'present' : 'absent'));
  ok(backButtons(w).length === (expectBack ? 1 : 0),
    label + ': exactly ' + (expectBack ? 'one' : 'no') + ' Back button on screen, got ' + backButtons(w).length);
  if (expectBack) ok($('#navBackBtn').textContent.trim() === '← Back', label + ': nav Back reads "← Back"');
}
function addPlayers(w, names) {
  names.forEach((n) => { $('#newName').value = n; click($('#addEntry'), 'add ' + n); });
}
function setTotal(w, entryId, val) {
  const inp = $(`[data-total="${entryId}"]`);
  if (!inp) throw new Error('missing total input for ' + entryId);
  inp.value = String(val);
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
}
function createCruiseViaForm(w, name) {
  click($('#newCruiseBtn'), 'new cruise');
  $('#crName').value = name;
  click($('#crCreate'), 'create cruise');
}

/* ============ header markup: brand in the center zone ============ */
{
  const w = boot();
  const kids = Array.from(w.document.querySelector('.topbar').children);
  ok(kids[0].classList.contains('topzone-left'), 'hdr: first topbar child is the empty left zone');
  ok(!!$('#brandBtn').closest('.topzone-center'), 'hdr: brand button sits inside the center zone');
  ok(kids[2].classList.contains('topbtns'), 'hdr: third topbar child is the Account/Menu zone');
  ok(backButtons(w).length === 0 && !$('.navrow'), 'hdr: Home screen itself has no nav row and no Back button');
}

/* ============ (a) menu Home: first item, works from deep + mid-game ============ */
{
  const w = boot();
  click($('#newGameBtn'), 'new game');
  click($('[data-pick="builtin-soccer"]'), 'pick soccer'); // setup = a deep screen
  ok(bodyText(w).includes('Set up:'), 'a: on the setup screen');
  click($('#menuBtn'), 'open menu');
  ok(!$('#menuPanel').classList.contains('hidden'), 'a: menu panel open');
  const items = $$('#menuPanel .menuitem');
  ok(items.length > 1 && items[0].id === 'menuHomeBtn', 'a: Home is the FIRST menu item');
  ok(items[0].textContent.includes('Home'), 'a: first menu item is labelled Home');
  click($('#menuHomeBtn'), 'menu Home from setup');
  ok($('#menuPanel').classList.contains('hidden'), 'a: menu closed after choosing Home');
  ok(!!$('#newGameBtn'), 'a: landed on the Home screen');

  // Mid-game: the game must survive a menu Home.
  click($('#newGameBtn'), 'new game again');
  click($('[data-pick="builtin-soccer"]'), 'pick soccer');
  click($('#segMode button[data-v="total"]'), 'final-total scoring');
  click($('#toSignup'), 'to signup');
  addPlayers(w, ['Ana', 'Ben']);
  click($('#startBtn'), 'start game');
  ok(!!$('#finishBtn'), 'a: on the play screen');
  click($('#menuBtn'), 'open menu mid-game');
  click($('#menuHomeBtn'), 'menu Home mid-game');
  ok(!!$('#newGameBtn'), 'a: Home after mid-game menu Home');
  ok(bodyText(w).includes('In progress') && bodyText(w).includes('Soccer Shootout'),
    'a: the game is still in progress on Home');
}

/* ============ (b) gamedest + pick (chooser path, then cruise-page path) ============ */
{
  const w = boot();
  createCruiseViaForm(w, 'Sky Princess — Nov 2026');
  const cruiseId = state(w).cruises[0].id;
  click($('#brandBtn'), 'home');
  click($('#newGameBtn'), 'new game');
  ok(bodyText(w).includes("Where's this game?"), 'b: on the destination chooser');
  assertNav(w, 'b gamedest', true);
  click($('#navBackBtn'), 'gamedest Back');
  ok(!!$('#newGameBtn'), 'b: gamedest Back returns Home');

  click($('#newGameBtn'), 'new game');
  click($('#destStandalone'), 'standalone');
  ok(bodyText(w).includes('Pick a game'), 'b: on the pick screen');
  assertNav(w, 'b pick via chooser', true);
  click($('#navBackBtn'), 'pick Back');
  ok(bodyText(w).includes("Where's this game?"), 'b: pick Back returns to the chooser');
  click($('#destStandalone'), 'standalone again');
  click($('#navHomeBtn'), 'pick nav Home');
  ok(!!$('#newGameBtn'), 'b: pick Home returns Home');

  click($(`[data-opencruise="${cruiseId}"]`), 'open cruise');
  click($('#cruiseNewGameBtn'), 'new game in this cruise');
  ok(bodyText(w).includes('This game will be saved in:'), 'b: pick screen shows the cruise banner');
  assertNav(w, 'b pick via cruise page', true);
  click($('#navBackBtn'), 'pick Back to cruise');
  ok(bodyText(w).includes('Games in this cruise'), 'b: pick Back returns to the cruise page');
}

/* ============ (b) templates + templateEditor (both entries) ============ */
{
  const w = boot();
  click($('#templatesBtn'), 'my games');
  ok(bodyText(w).includes('My games'), 'b: on the templates screen');
  assertNav(w, 'b templates', true);
  click($('#newTplBtn'), 'create custom game');
  ok(bodyText(w).includes('Create custom game'), 'b: on the template editor');
  assertNav(w, 'b templateEditor from templates', true);
  click($('#navBackBtn'), 'editor Back');
  ok(bodyText(w).includes('My games'), 'b: editor Back returns to My games');
  click($('#navBackBtn'), 'templates Back');
  ok(!!$('#newGameBtn'), 'b: templates Back returns Home');
}
{
  const w = boot();
  click($('#newGameBtn'), 'new game (no cruises)');
  click($('#createBtn'), 'create new game from pick');
  ok(bodyText(w).includes('Create custom game'), 'b: editor opened from pick');
  assertNav(w, 'b templateEditor from pick', true);
  click($('#navBackBtn'), 'editor Back');
  ok(bodyText(w).includes('Pick a game'), 'b: editor Back returns to the pick screen');
}

/* ============ (b)+(e) setup, signup (+ plurals), play, finish ============ */
{
  const w = boot();
  click($('#newGameBtn'), 'new game');
  click($('[data-pick="builtin-soccer"]'), 'pick soccer');
  assertNav(w, 'b setup', true);
  click($('#navBackBtn'), 'setup Back');
  ok(bodyText(w).includes('Pick a game'), 'b: setup Back returns to the pick screen');
  click($('[data-pick="builtin-soccer"]'), 'pick soccer again');
  click($('#segMode button[data-v="total"]'), 'final-total scoring');
  click($('#toSignup'), 'to signup');
  assertNav(w, 'b signup', true);
  ok($('#entryCount').textContent === '0 players', 'e: counter reads "0 players", got "' + $('#entryCount').textContent + '"');
  addPlayers(w, ['Ana']);
  ok($('#entryCount').textContent === '1 player', 'e: counter reads "1 player", got "' + $('#entryCount').textContent + '"');
  addPlayers(w, ['Ben']);
  ok($('#entryCount').textContent === '2 players', 'e: counter reads "2 players", got "' + $('#entryCount').textContent + '"');
  click($('#navBackBtn'), 'signup Back');
  ok(bodyText(w).includes('Set up:'), 'b: signup Back returns to setup');
  click($('#toSignup'), 'to signup again');
  click($('#startBtn'), 'start game');
  assertNav(w, 'b/c play', false);
  click($('#navHomeBtn'), 'play nav Home');
  ok(bodyText(w).includes('In progress') && bodyText(w).includes('Soccer Shootout'),
    'c: game left in progress after play-screen Home');

  // Finish screen: its own buttons only — no nav row, no Back.
  click($(`[data-continue="${lastGame(w).id}"]`), 'continue game');
  const g = lastGame(w);
  setTotal(w, g.entries[0].id, 3);
  setTotal(w, g.entries[1].id, 1);
  click($('#finishBtn'), 'finish game');
  ok(bodyText(w).includes('winner'), 'b: on the finish screen');
  ok(!$('.navrow') && !$('#navBackBtn') && !$('#navHomeBtn'), 'b: finish screen has no nav row (keeps its own buttons)');
  ok(backButtons(w).length === 0, 'b/d: finish screen has no Back button');
  ok(!!$('#finishHomeBtn'), 'b: finish screen keeps its own Home button');
}
{
  const w = boot();
  click($('#newGameBtn'), 'new game');
  click($('[data-pick="builtin-soccer"]'), 'pick soccer');
  click($('#segKind button[data-v="teams"]'), 'teams kind');
  click($('#toSignup'), 'to signup');
  ok($('#entryCount').textContent === '0 teams', 'e: counter reads "0 teams", got "' + $('#entryCount').textContent + '"');
  addPlayers(w, ['Red Team']);
  ok($('#entryCount').textContent === '1 team', 'e: counter reads "1 team", got "' + $('#entryCount').textContent + '"');
  addPlayers(w, ['Blue Team']);
  ok($('#entryCount').textContent === '2 teams', 'e: counter reads "2 teams", got "' + $('#entryCount').textContent + '"');
}

/* ============ (b) roundSummary: Home only ============ */
{
  const w = boot();
  click($('#newGameBtn'), 'new game');
  click($('[data-pick="builtin-beanbag"]'), 'pick beanbag');
  click($('#segQsRounds button[data-v="on"]'), 'rounds on');
  click($('#segQsMode button[data-v="advance"]'), 'advance mode');
  $('#qs-tgt-0').value = '5';
  click($('#toSignup'), 'to signup');
  addPlayers(w, ['Ann', 'Bob', 'Cid']);
  click($('#startBtn'), 'start game');
  const g = lastGame(w);
  const ann = g.entries[0].id;
  click($(`[data-tap="${ann}:0"]`), 'tap Ann hole 1');
  click($(`[data-tap="${ann}:0"]`), 'tap Ann hole 2'); // 6 pts ≥ target 5
  click($('#endRoundBtn'), 'end round 1');
  ok(bodyText(w).includes('Round 1 summary'), 'b: on the round summary screen');
  assertNav(w, 'b roundSummary', false);
  click($('#navHomeBtn'), 'summary nav Home');
  ok(bodyText(w).includes('In progress'), 'b: game still in progress after summary Home');
}

/* ============ (b) playoffField + bracketView: Back to the play screen ============ */
{
  const w = boot();
  click($('#newGameBtn'), 'new game');
  click($('[data-pick="builtin-beanbag"]'), 'pick beanbag');
  click($('#segFormat button[data-v="rr"]'), 'round robin');
  click($('#segMode button[data-v="total"]'), 'final-total scoring');
  $('#rrGames').value = '1';
  click($('#segPlayoff button[data-v="4"]'), 'top 4 playoff');
  click($('#toSignup'), 'to signup');
  addPlayers(w, ['Ann', 'Bob', 'Cy', 'Dee', 'Eli', 'Fay']);
  click($('#startBtn'), 'start RR game');
  // Score every RR match (a-side wins big) to complete the round robin.
  lastGame(w).matches.forEach((m) => {
    if (m.scored || m.autoBye) return;
    click($(`[data-score="${m.id}"]`), 'open scorer');
    $('#scA').value = '9'; $('#scB').value = '0';
    click($('#scSave'), 'save score');
  });
  click($('#startPlayoffBtn'), 'start playoff');
  ok(bodyText(w).includes('Playoff field'), 'b: on the playoff field screen');
  assertNav(w, 'b playoffField', true);
  click($('#navBackBtn'), 'field Back');
  ok(!bodyText(w).includes('Playoff field — top'), 'b: field Back returns to the play screen');
  assertNav(w, 'b play (from field)', false);

  click($('#startPlayoffBtn'), 'start playoff again');
  click($('#pfGenerateBtn'), 'generate bracket');
  click($('#viewBracketBtn'), 'view bracket');
  ok(bodyText(w).includes('Playoff bracket'), 'b: on the bracket view');
  assertNav(w, 'b bracketView', true);
  click($('#navBackBtn'), 'bracket view Back');
  ok(!!$('#viewBracketBtn'), 'b: bracket view Back returns to the play screen');
}

/* ============ (b) history, cruise, account ============ */
{
  const w = boot();
  click($('#historyBtn'), 'history');
  ok(bodyText(w).includes('History'), 'b: on the history screen');
  assertNav(w, 'b history', true);
  click($('#navBackBtn'), 'history Back');
  ok(!!$('#newGameBtn'), 'b: history Back returns Home');

  createCruiseViaForm(w, 'Nav Cruise');
  ok(bodyText(w).includes('Games in this cruise'), 'b: on the cruise page');
  assertNav(w, 'b cruise', true);
  click($('#navBackBtn'), 'cruise Back');
  ok(!!$('#newGameBtn'), 'b: cruise Back returns Home');

  click($('#accountBtn'), 'account');
  ok(bodyText(w).includes('Staff account'), 'b: on the account screen');
  assertNav(w, 'b account', true);
  click($('#navBackBtn'), 'account Back');
  ok(!!$('#newGameBtn'), 'b: account Back returns Home');
}

console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
