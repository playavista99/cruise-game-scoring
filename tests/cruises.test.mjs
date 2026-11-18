/* End-to-end DOM tests for v1.8: cruises, rosters, cruise summary,
   and copying players from another game.
   a. Create a cruise with a name only; home lists it. Roster can be
      managed by hand on the cruise page (add / edit / two-step remove).
   b. An Individuals Quick Score game started inside the cruise files
      under it; manual sign-ups join the roster at game start, and a
      mid-game walk-up joins it too.
   c. A second game in the cruise: the roster picker toggles Ana in,
      Ben stays out (no-show), Cal is added by hand — entries are
      exactly [Ana, Cal]; the roster keeps everyone, Cal with cabin.
   d. Cruise summary: games played, players = the whole roster
      (v1.8.1 — a roster-only player counts too), wins tally — and
      removing a roster player never touches games already played.
   e. Copy players from another game at a standalone sign-up: entries
      are added (duplicates skipped), the list stays editable, and
      the game starts standalone.
   f. Deleting a cruise (two-step) keeps its games, cruiseId cleared.
   g. Teams-mode sign-up in a cruise shows no roster section.
   h. A store with no cruises key loads fine and gains cruises = []. */
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
const cruise0 = (w) => state(w).cruises[0];
const rosterNames = (w) => cruise0(w).roster.map((r) => r.name);

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
function createCruiseViaForm(w, name) {
  click($('#newCruiseBtn'), 'new cruise');
  $('#crName').value = name;
  click($('#crCreate'), 'create cruise');
}
function openCruiseFromHome(w, id) {
  click($('#brandBtn'), 'home');
  click($(`[data-opencruise="${id}"]`), 'open cruise');
}
function startCruiseGame(w, cruiseId) {
  // From the cruise page: new game -> Soccer Shootout -> final-total -> sign-up.
  click($('#cruiseNewGameBtn'), 'new game in cruise');
  click($('[data-pick="builtin-soccer"]'), 'pick soccer');
  click($('#segMode button[data-v="total"]'), 'final-total scoring');
  click($('#toSignup'), 'to signup');
}

/* ============ (a) create a cruise with name only + roster management ============ */
const w = boot();
createCruiseViaForm(w, 'Sky Princess — Nov 2026');
ok(state(w).cruises.length === 1, 'a: one cruise stored');
let c = cruise0(w);
ok(c.name === 'Sky Princess — Nov 2026' && c.ship === '' && c.startDate === '' && c.endDate === '', 'a: name-only cruise, optional fields blank');
ok(Array.isArray(c.roster) && c.roster.length === 0, 'a: roster starts empty');
ok(bodyText(w).includes('Sky Princess — Nov 2026'), 'a: creating lands on the cruise page');
const cruiseId = c.id;
// Roster add by hand.
$('#rosterName').value = 'Dan';
$('#rosterCabin').value = '1204';
click($('#rosterAdd'), 'roster add Dan');
ok(rosterNames(w).join(',') === 'Dan' && cruise0(w).roster[0].cabin === '1204', 'a: roster add stores name + cabin');
// Roster edit.
const danId = cruise0(w).roster[0].id;
click($(`[data-rosteredit="${danId}"]`), 'edit Dan');
$('#rosterEditName').value = 'Daniel';
$('#rosterEditCabin').value = '1205';
click($('#rosterEditSave'), 'save roster edit');
ok(rosterNames(w).join(',') === 'Daniel' && cruise0(w).roster[0].cabin === '1205', 'a: roster edit updates name + cabin');
// Roster remove is two-step.
$('#rosterName').value = 'Temp';
click($('#rosterAdd'), 'roster add Temp');
const tempId = cruise0(w).roster.find((r) => r.name === 'Temp').id;
const tempDel = $(`[data-rosterdel="${tempId}"]`);
click(tempDel, 'first remove tap');
ok(rosterNames(w).includes('Temp'), 'a: first remove tap only arms');
ok(tempDel.textContent === 'Confirm remove?', 'a: remove button armed, got: ' + tempDel.textContent);
click(tempDel, 'second remove tap');
ok(!rosterNames(w).includes('Temp') && rosterNames(w).join(',') === 'Daniel', 'a: second tap removes; Daniel stays');
// Home lists the cruise.
click($('#brandBtn'), 'home');
ok(bodyText(w).includes('Your cruises') && bodyText(w).includes('Sky Princess — Nov 2026'), 'a: home lists the cruise under Your cruises');
ok(bodyText(w).includes('0 games · 1 player'), 'a: home meta counts games + roster players');

/* ============ (b) first game in the cruise: roster sync at start + walk-up ============ */
openCruiseFromHome(w, cruiseId);
startCruiseGame(w, cruiseId);
ok(bodyText(w).includes('Cruise:') && bodyText(w).includes('Sky Princess — Nov 2026'), 'b: sign-up shows the cruise line');
ok(!!$('#rosterPick'), 'b: roster picker section present for Individuals in a cruise');
ok($$('#rosterPick [data-rosterpick]').length === 1, 'b: picker lists the one roster player (Daniel)');
addPlayers(w, ['Ana', 'Ben']);
click($('#startBtn'), 'start game 1');
let g1 = lastGame(w);
ok(g1.cruiseId === cruiseId, 'b: game carries cruiseId');
ok(rosterNames(w).join(',') === 'Daniel,Ana,Ben', 'b: manual sign-ups joined the roster at start, got ' + rosterNames(w).join(','));
ok(appHTML(w).includes('🛳 Sky Princess — Nov 2026'), 'b: play header sub-line names the cruise');
// Walk-up joins the roster too.
$('#walkName').value = 'Walt';
click($('#walkAdd'), 'add walk-up Walt');
g1 = lastGame(w);
ok(g1.entries.map((e) => e.name).join(',') === 'Ana,Ben,Walt', 'b: walk-up added to the game');
ok(rosterNames(w).join(',') === 'Daniel,Ana,Ben,Walt', 'b: walk-up joined the roster');
// Home in-progress card names the cruise.
click($('#homeBtn'), 'save & home');
ok(appHTML(w).includes('🛳 Sky Princess — Nov 2026 · Quick Score'), 'b: home in-progress card meta names the cruise');
click($(`[data-continue="${g1.id}"]`), 'continue game 1');
g1 = lastGame(w);
setTotal(w, g1.entries[0].id, 3); // Ana
setTotal(w, g1.entries[1].id, 1); // Ben
setTotal(w, g1.entries[2].id, 0); // Walt
click($('#finishBtn'), 'finish game 1');
ok(lastGame(w).status === 'finished' && lastGame(w).winnerId === g1.entries[0].id, 'b: game 1 finished, Ana won');
click($('#finishHomeBtn'), 'home after finish');

/* ============ (c) second game: roster toggles, no-show, manual add ============ */
openCruiseFromHome(w, cruiseId);
startCruiseGame(w, cruiseId);
ok($$('#rosterPick [data-rosterpick]').length === 4, 'c: picker lists all 4 roster players');
const anaRosterId = cruise0(w).roster.find((r) => r.name === 'Ana').id;
click($(`[data-rosterpick="${anaRosterId}"]`), 'toggle Ana in');
// Ben is a no-show: simply never toggled. Cal is new, added by hand with a cabin.
$('#newName').value = 'Cal';
$('#newCabin').value = '812';
click($('#addEntry'), 'add Cal');
const listTxt = $('#entryList').textContent;
ok($$('#entryList [data-delentry]').length === 2, 'c: exactly 2 entries before start');
ok(listTxt.includes('Ana') && listTxt.includes('Cal') && !listTxt.includes('Ben') && !listTxt.includes('Walt') && !listTxt.includes('Daniel'),
  'c: entries are exactly Ana + Cal');
click($('#startBtn'), 'start game 2');
const g2 = lastGame(w);
ok(g2.entries.map((e) => e.name).join(',') === 'Ana,Cal', 'c: game 2 entries are Ana + Cal');
ok(rosterNames(w).join(',') === 'Daniel,Ana,Ben,Walt,Cal', 'c: roster keeps everyone incl. no-show Ben, got ' + rosterNames(w).join(','));
ok(cruise0(w).roster.find((r) => r.name === 'Cal').cabin === '812', 'c: Cal joined the roster with his cabin');
setTotal(w, g2.entries[0].id, 1); // Ana
setTotal(w, g2.entries[1].id, 5); // Cal
click($('#finishBtn'), 'finish game 2');
ok(lastGame(w).winnerId === g2.entries[1].id, 'c: game 2 finished, Cal won');
click($('#finishHomeBtn'), 'home after finish 2');

/* ============ (d) cruise summary + roster removal leaves games alone ============ */
openCruiseFromHome(w, cruiseId);
const sumCard = $$('.card')[0].textContent;
ok(/Games played\s*2/.test(sumCard), 'd: summary games played = 2, got: ' + sumCard.replace(/\s+/g, ' ').slice(0, 80));
ok(/Players\s*5/.test(sumCard), 'd: summary players = 5 = whole roster size (Daniel counts even though he never played)');
ok(sumCard.includes('Ana') && sumCard.includes('Cal'), 'd: wins tally names Ana and Cal');
ok((sumCard.match(/1 win/g) || []).length === 2, 'd: each has exactly 1 win');
ok(sumCard.indexOf('Ana') < sumCard.indexOf('Cal'), 'd: tied wins sort by name (Ana before Cal)');
ok($$('[data-cruiseview]').length === 2, 'd: cruise page lists both finished games');
// The Home cruise card's player count must agree with the summary:
// both are the roster size (5 here — Daniel, Ana, Ben, Walt, Cal).
click($('#navBackBtn'), 'back home from cruise page (nav row)');
ok(bodyText(w).includes('2 games · 5 players'), 'd: home card meta players = 5 = roster size, agrees with summary');
openCruiseFromHome(w, cruiseId);
// Removing Walt from the roster must not touch game 1.
const waltRosterId = cruise0(w).roster.find((r) => r.name === 'Walt').id;
const waltDel = $(`[data-rosterdel="${waltRosterId}"]`);
click(waltDel, 'arm roster remove Walt');
click(waltDel, 'confirm roster remove Walt');
ok(!rosterNames(w).includes('Walt'), 'd: Walt removed from roster');
const g1After = state(w).games.find((g) => g.id === g1.id);
ok(g1After.entries.map((e) => e.name).join(',') === 'Ana,Ben,Walt', 'd: game 1 still has Walt — played games untouched');

/* ============ (e) copy players from another game (standalone sign-up) ============ */
click($('#brandBtn'), 'home');
click($('#newGameBtn'), 'new game');
ok(bodyText(w).includes("Where's this game?"), 'e: with a cruise on file, New game asks where the game belongs (v2.0 chooser)');
click($('#destStandalone'), 'choose standalone');
click($('[data-pick="builtin-soccer"]'), 'pick soccer');
click($('#segMode button[data-v="total"]'), 'final-total scoring');
click($('#toSignup'), 'to signup');
ok(!$('#rosterPick'), 'e: standalone sign-up has no roster picker');
addPlayers(w, ['Ana']); // already in game 2 — copy must skip the duplicate
click($('#copyPlayersBtn'), 'open copy picker');
ok(bodyText(w).includes('Copy players from another game'), 'e: copy picker opened');
const copyBtn = $(`[data-copyfrom="${g2.id}"]`);
ok(!!copyBtn && copyBtn.textContent.includes('2 players'), 'e: picker row shows game 2 with its player count');
click(copyBtn, 'copy from game 2');
ok(!$('#copyCancel'), 'e: picker closed after copying');
ok($$('#entryList [data-delentry]').length === 2, 'e: Ana (kept, not duplicated) + Cal copied = 2 entries');
ok($('#entryList').textContent.includes('Cal'), 'e: Cal is on the list');
// The copied list stays editable: drop Cal, add Zed, start.
click($('[data-delentry="1"]'), 'remove copied Cal');
addPlayers(w, ['Zed']);
click($('#startBtn'), 'start copied game');
const g3 = lastGame(w);
ok(g3.entries.map((e) => e.name).join(',') === 'Ana,Zed', 'e: started with the edited list Ana + Zed');
ok(!g3.cruiseId, 'e: copied game is standalone (no cruiseId)');

/* ============ (f) delete the cruise: games survive as standalone ============ */
openCruiseFromHome(w, cruiseId);
const delBtn = $(`[data-delcruise="${cruiseId}"]`);
click(delBtn, 'first delete-cruise tap');
ok(state(w).cruises.length === 1, 'f: first tap only arms');
ok(delBtn.textContent === 'Confirm delete cruise?', 'f: delete button armed, got: ' + delBtn.textContent);
click(delBtn, 'second delete-cruise tap');
ok(state(w).cruises.length === 0, 'f: cruise deleted');
const survivors = state(w).games.filter((g) => g.id === g1.id || g.id === g2.id);
ok(survivors.length === 2, 'f: both cruise games still exist');
ok(survivors.every((g) => !g.cruiseId), 'f: surviving games are standalone (cruiseId cleared)');

/* ============ (g) Teams sign-up in a cruise: no roster section ============ */
createCruiseViaForm(w, 'Second Sailing');
ok(state(w).cruises.length === 1 && state(w).cruises[0].name === 'Second Sailing', 'g: second cruise created');
click($('#cruiseNewGameBtn'), 'new game in cruise 2');
click($('[data-pick="builtin-soccer"]'), 'pick soccer');
click($('#segKind button[data-v="teams"]'), 'teams mode');
click($('#toSignup'), 'to signup (teams)');
ok(!$('#rosterPick'), 'g: Teams sign-up in a cruise shows no roster picker');
ok(!bodyText(w).includes('From this cruise'), 'g: no roster heading in Teams mode');
ok(!!$('#copyPlayersBtn'), 'g: copy-players is still offered for Teams');

/* ============ (h) legacy store without a cruises key ============ */
{
  const w2 = boot({ templates: [], games: [] });
  ok(bodyText(w2).includes('New game') && bodyText(w2).includes('New cruise'), 'h: home renders its two big actions with no cruises key in the store');
  createCruiseViaForm(w2, 'Legacy Check');
  ok(Array.isArray(state(w2).cruises) && state(w2).cruises.length === 1, 'h: cruises defaults to [] and accepts the new cruise');
  ok(state(w2).cruises[0].roster.length === 0, 'h: new cruise roster is []');
}

console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
