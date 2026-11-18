/* End-to-end DOM tests for v2.1.2: deleting an in-progress game
   from the lists that show it — Home's "In progress" section and a
   cruise page's game list — using the app's two-step in-app confirm
   (same pattern as History delete).
   a. Home card shows Delete; first tap only arms ("Confirm
      delete?", game still in the store and the list, no navigation);
      second tap deletes — gone from the store and the rendered
      list, and the "In progress" section disappears when the last
      in-progress game is deleted.
   b. The card's resume control (Continue) still opens the game.
   c. Cruise page: the same two-step delete on its in-progress card;
      the cruise roster is untouched and the game vanishes there too.
   d. Arm resets, matching History delete: arming one card disarms
      any other, navigating away and back renders disarmed, and the
      ~4 s arm window expires on its own. */
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
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 25));

let W = null;
function boot() {
  const dom = new JSDOM(html, { url: 'https://playavista99.github.io/cruise-game-scoring/', runScripts: 'outside-only' });
  const w = dom.window;
  w.confirm = () => true;
  w.alert = () => {};
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};
  scripts.forEach((s) => w.eval(s));
  W = w;
  return w;
}
const $ = (sel) => W.document.querySelector(sel);
const $$ = (sel) => Array.from(W.document.querySelectorAll(sel));
const click = (el, what) => { if (!el) throw new Error('missing element: ' + what); el.click(); };
const state = (w) => JSON.parse(w.localStorage.getItem('cgsa-state-v1'));
const lastGame = (w) => { const g = state(w).games; return g[g.length - 1]; };
const gameById = (w, id) => state(w).games.find((g) => g.id === id);
const bodyText = (w) => w.document.body.textContent;
const delBtn = (id) => $(`[data-delgame="${id}"]`);
const rosterNames = (w) => state(w).cruises[0].roster.map((r) => r.name);

function addPlayers(w, names) {
  names.forEach((name) => {
    $('#newName').value = name;
    click($('#addEntry'), 'add entry ' + name);
  });
}
function pickSoccerToSignup(w) {
  click($('[data-pick="builtin-soccer"]'), 'pick soccer');
  click($('#segMode button[data-v="total"]'), 'final-total scoring');
  click($('#toSignup'), 'to signup');
}
function startGameHere(w, names) {
  pickSoccerToSignup(w);
  addPlayers(w, names);
  click($('#startBtn'), 'start game');
  return lastGame(w).id;
}

const w = boot();

/* ---- Setup: G1 standalone, G2 in a cruise, G3 standalone ---- */
click($('#newGameBtn'), 'new game (no cruises yet)');
const g1 = startGameHere(w, ['Ana', 'Ben']);
ok(gameById(w, g1) && gameById(w, g1).status === 'playing' && !gameById(w, g1).cruiseId,
  'setup: G1 is a standalone in-progress game');
click($('#brandBtn'), 'home');

click($('#newCruiseBtn'), 'new cruise');
$('#crName').value = 'Delete Test Cruise';
click($('#crCreate'), 'create cruise');
const cruiseId = state(w).cruises[0].id;
click($('#cruiseNewGameBtn'), 'new game in this cruise');
const g2 = startGameHere(w, ['Cal', 'Dot']);
ok(gameById(w, g2) && gameById(w, g2).cruiseId === cruiseId, 'setup: G2 filed under the cruise');
ok(rosterNames(w).join(',') === 'Cal,Dot', 'setup: G2 sign-ups joined the roster');
click($('#brandBtn'), 'home');

click($('#newGameBtn'), 'new game (cruise exists)');
click($('#destStandalone'), 'choose standalone');
const g3 = startGameHere(w, ['Eve', 'Fay']);
click($('#brandBtn'), 'home');

ok(bodyText(w).includes('In progress'), 'setup: home shows the In progress section');
ok(!!delBtn(g1) && !!delBtn(g2) && !!delBtn(g3), 'a: every in-progress card on Home has a Delete button');
ok(delBtn(g1).textContent === 'Delete', 'a: delete button starts unarmed, reading "Delete"');

/* ============ (d) arming one card disarms any other ============ */
click(delBtn(g1), 'arm G1 delete');
ok(delBtn(g1).textContent === 'Confirm delete?' && delBtn(g1).classList.contains('confirming'),
  'a/d: first tap arms the button ("Confirm delete?")');
ok(!!gameById(w, g1) && state(w).games.length === 3, 'a: first tap deletes nothing');
ok(!!$('#newGameBtn'), 'a: an arming tap does not navigate away from Home');
click(delBtn(g3), 'arm G3 delete instead');
ok(delBtn(g1).textContent === 'Delete' && !delBtn(g1).classList.contains('confirming'),
  'd: arming another card disarms the first');
ok(delBtn(g3).textContent === 'Confirm delete?', 'd: the newly tapped card is the armed one');
click(delBtn(g1), 'tap G1 delete while G3 is armed');
ok(!!gameById(w, g1), 'd: tapping a disarmed card only arms it — G1 still present');
ok(delBtn(g3).textContent === 'Delete', 'd: G3 disarmed in turn');

/* ============ (d) navigation renders disarmed ============ */
click($('#historyBtn'), 'open History');
click($('#navBackBtn'), 'back Home from History');
ok(delBtn(g1).textContent === 'Delete', 'd: navigating away and back renders the button disarmed');
click(delBtn(g1), 'tap G1 delete after navigation');
ok(!!gameById(w, g1) && delBtn(g1).textContent === 'Confirm delete?',
  'd: first tap after navigation only arms — no delete');

/* ============ (d) the ~4 s arm window expires on its own ============ */
await tick(4300);
ok(delBtn(g1).textContent === 'Delete' && !delBtn(g1).classList.contains('confirming'),
  'd: the arm expires after the window');
click(delBtn(g1), 'tap G1 delete after expiry');
ok(!!gameById(w, g1) && delBtn(g1).textContent === 'Confirm delete?',
  'd: first tap after expiry only re-arms — no delete');

/* ============ (a) second tap on the armed button deletes ============ */
click(delBtn(g1), 'confirm delete G1');
ok(!gameById(w, g1), 'a: second tap removes the game from the store');
ok(!delBtn(g1), 'a: the deleted game\'s card leaves the rendered list');
ok(!!delBtn(g2) && !!delBtn(g3), 'a: the other in-progress games are untouched');

/* ============ (b) Continue still resumes the game ============ */
click($(`[data-continue="${g3}"]`), 'continue G3');
ok($$('#app [data-total]').length === 2 && bodyText(w).includes('Eve') && bodyText(w).includes('Fay'),
  'b: Continue opens the game on the play screen');
ok(gameById(w, g3).status === 'playing', 'b: the resumed game is still in progress');
click($('#navHomeBtn'), 'nav Home from play');
ok(!!delBtn(g3), 'b: back Home, G3 is listed again');

/* ============ (c) cruise page delete; roster untouched ============ */
click($(`[data-opencruise="${cruiseId}"]`), 'open cruise');
ok(!!delBtn(g2), 'c: the cruise page in-progress card has a Delete button');
click(delBtn(g2), 'arm G2 delete on cruise page');
ok(delBtn(g2).textContent === 'Confirm delete?' && !!gameById(w, g2),
  'c: first tap on the cruise page only arms');
click(delBtn(g2), 'confirm delete G2');
ok(!gameById(w, g2), 'c: second tap removes the cruise game from the store');
ok(!delBtn(g2) && bodyText(w).includes('No games yet'),
  'c: the game vanishes from the cruise page list');
ok(rosterNames(w).join(',') === 'Cal,Dot', 'c: the cruise roster is untouched by the delete');
click($('#brandBtn'), 'home');
ok(!delBtn(g2) && !!delBtn(g3), 'c: Home\'s list agrees — G2 gone, G3 remains');

/* ============ (a) deleting the last one removes the section ============ */
click(delBtn(g3), 'arm G3 delete');
click(delBtn(g3), 'confirm delete G3');
ok(state(w).games.length === 0, 'a: all games deleted from the store');
ok(!bodyText(w).includes('In progress'), 'a: the In progress section disappears when empty');
ok($$('[data-delgame]').length === 0, 'a: no delete buttons remain on Home');

console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
