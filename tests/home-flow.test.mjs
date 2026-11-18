/* End-to-end DOM tests for v2.0: simpler home (two big actions),
   the new-game destination chooser, and ONE pick-a-game screen with
   a cruise banner.
   a. Home shows the two big actions side by side; with no cruises,
      New game goes straight to the pick screen — no chooser, no banner.
   b. After creating a cruise, New game shows the chooser; choosing
      Standalone lands on the pick screen with no banner, and Back
      from there returns to the chooser.
   c. Chooser → cruise → pick screen banner names the cruise; the
      game list is identical to standalone; setup shows the cruise
      line and the created game carries cruiseId.
   d. Cruise page "New game in this cruise" → same pick screen with
      the banner preset; "Make standalone" removes the banner, stays
      on the pick screen, and the resulting game has cruiseId null.
   e. The pick screen's rendered game/template list is identical
      with and without a cruise selected (asserted via a/c captures). */
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

function addPlayers(w, names) {
  names.forEach((name) => {
    $('#newName').value = name;
    click($('#addEntry'), 'add entry ' + name);
  });
}
function createCruiseViaForm(w, name) {
  click($('#newCruiseBtn'), 'new cruise');
  $('#crName').value = name;
  click($('#crCreate'), 'create cruise');
}
function pickSoccerToSignup(w) {
  click($('[data-pick="builtin-soccer"]'), 'pick soccer');
  click($('#segMode button[data-v="total"]'), 'final-total scoring');
  click($('#toSignup'), 'to signup');
}

const w = boot();

/* ============ (a) two big actions; no cruises → straight to pick ============ */
ok(!!$('#newGameBtn') && !!$('#newCruiseBtn'), 'a: home has New game and New cruise buttons');
ok(!!$('#newGameBtn').closest('.homeactions') && !!$('#newCruiseBtn').closest('.homeactions'),
  'a: both actions sit in the big home-actions row');
ok(!bodyText(w).includes('Your cruises'), 'a: no Your cruises section while there are no cruises');
click($('#newGameBtn'), 'new game (no cruises)');
ok(bodyText(w).includes('Pick a game'), 'a: New game goes straight to the pick screen');
ok(!bodyText(w).includes("Where's this game?"), 'a: no destination chooser without cruises');
ok(!appHTML(w).includes('cruisebanner') && !bodyText(w).includes('This game will be saved in'),
  'a: no cruise banner on the standalone pick screen');
const gridStandalone = $('.grid').innerHTML;
ok(gridStandalone.includes('Create new game'), 'a: pick list includes the make-your-own entry');
click($('#navBackBtn'), 'back from pick (nav row)');
ok(!!$('#newGameBtn'), 'a: Back from a standalone pick returns Home');

/* ============ (b) with a cruise, New game asks where it belongs ============ */
createCruiseViaForm(w, 'Sky Princess — Nov 2026');
const cruiseId = state(w).cruises[0].id;
ok(bodyText(w).includes('Sky Princess — Nov 2026'), 'b: creating a cruise lands on its page');
click($('#brandBtn'), 'home');
ok(bodyText(w).includes('Your cruises') && bodyText(w).includes('Sky Princess — Nov 2026'),
  'b: home lists the cruise under Your cruises');
click($('#newGameBtn'), 'new game (cruise exists)');
ok(bodyText(w).includes("Where's this game?"), 'b: chooser appears when a cruise exists');
ok(!!$('#destStandalone'), 'b: chooser offers Standalone game');
ok(!!$(`[data-destcruise="${cruiseId}"]`), 'b: chooser offers the cruise as a destination');
click($('#destStandalone'), 'choose standalone');
ok(bodyText(w).includes('Pick a game'), 'b: standalone choice continues to the pick screen');
ok(!appHTML(w).includes('cruisebanner'), 'b: standalone pick screen has no banner');
ok($('.grid').innerHTML === gridStandalone, 'e: pick list identical after choosing Standalone');
click($('#navBackBtn'), 'back from pick (nav row)');
ok(bodyText(w).includes("Where's this game?"), 'b: Back from the pick screen returns to the chooser');
click($('#navBackBtn'), 'back from chooser (nav row)');
ok(!!$('#newGameBtn') && bodyText(w).includes('Your cruises'), 'b: Back from the chooser returns Home');

/* ============ (c) chooser → cruise → banner + game carries cruiseId ============ */
click($('#newGameBtn'), 'new game again');
click($(`[data-destcruise="${cruiseId}"]`), 'choose the cruise');
ok(bodyText(w).includes('Pick a game'), 'c: cruise choice continues to the pick screen');
ok(appHTML(w).includes('cruisebanner') && bodyText(w).includes('This game will be saved in:') &&
  bodyText(w).includes('Sky Princess — Nov 2026'), 'c: banner above the list names the cruise');
ok(!!$('#makeStandaloneBtn'), 'c: banner offers Make standalone');
ok($('.grid').innerHTML === gridStandalone, 'e: pick list identical with a cruise selected');
pickSoccerToSignup(w);
ok(bodyText(w).includes('Cruise:') && bodyText(w).includes('Sky Princess — Nov 2026'),
  'c: setup/sign-up still show the cruise line');
addPlayers(w, ['Ana', 'Ben']);
click($('#startBtn'), 'start cruise game');
const g1 = lastGame(w);
ok(g1.cruiseId === cruiseId, 'c: created game carries the chosen cruiseId');
click($('#brandBtn'), 'home');

/* ============ (d) cruise page entry: banner preset; Make standalone ============ */
click($(`[data-opencruise="${cruiseId}"]`), 'open cruise');
click($('#cruiseNewGameBtn'), 'new game in this cruise');
ok(bodyText(w).includes('Pick a game') && appHTML(w).includes('cruisebanner') &&
  bodyText(w).includes('This game will be saved in:'), 'd: cruise-page entry lands on the same pick screen, banner preset');
ok($('.grid').innerHTML === gridStandalone, 'e: pick list identical from the cruise page too');
click($('#makeStandaloneBtn'), 'make standalone');
ok(bodyText(w).includes('Pick a game'), 'd: Make standalone stays on the pick screen');
ok(!appHTML(w).includes('cruisebanner') && !bodyText(w).includes('This game will be saved in'),
  'd: banner is gone after Make standalone');
pickSoccerToSignup(w);
ok(!bodyText(w).includes('Cruise:'), 'd: no cruise line after making it standalone');
addPlayers(w, ['Cal', 'Dot']);
click($('#startBtn'), 'start standalone game');
const g2 = lastGame(w);
ok(!g2.cruiseId, 'd: resulting game is standalone (cruiseId null)');

console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
