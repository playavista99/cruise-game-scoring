/* End-to-end DOM tests for v2.4.8: sign-up ordering controls.
   Bracket and Round Robin sign-ups get a "🔀 Randomize order"
   button (the old bracket-only "Shuffle seeds", now for both —
   every tap re-randomizes) and drag-and-drop reordering via a ⠿
   handle on each row. Quick Score gets neither: its list order is
   not a matchup order. The order at Start is the seeding (bracket),
   the preset schedule order (RR), and Round 1's pairing order
   (results-based RR).

   a. Bracket: button + hint + handles present; randomize with a
      stubbed Math.random permutes deterministically and keeps the
      same entries.
   b. Round Robin: same controls present; randomize permutes.
   c. Quick Score: no button, no hint, no handles.
   d. signupMove seam: exact reorder of draft entries (ids), and
      the rendered rows follow.
   e. Start after a move: bracket round-1 pairings reflect the new
      seed order.
   f. Start after a move: preset RR round-1 pairings reflect the
      new order; results-based RR round 1 pairs consecutively in
      the new order.
   g. Row actions unaffected: remove and inline name edit still
      work with handles present. */
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
const nameOf = (game, id) => (game.entries.find((e) => e.id === id) || {}).name;
const pairSet = (game, round) => game.matches.filter((m) => m.round === round)
  .map((m) => [nameOf(game, m.aId), nameOf(game, m.bId)].sort().join('|')).sort();

function toSignup(w, opts) {
  click($('#newGameBtn'), 'new game');
  click($(`[data-pick="${opts.template || 'builtin-beanbag'}"]`), 'pick template');
  if (opts.format) click($(`#segFormat button[data-v="${opts.format}"]`), 'format seg');
  if (opts.scoreMode) click($(`#segMode button[data-v="${opts.scoreMode}"]`), 'score mode seg');
  if (opts.rrGames !== undefined) $('#rrGames').value = String(opts.rrGames);
  if (opts.pairing) click($(`#segPairing button[data-v="${opts.pairing}"]`), 'pairing seg');
  click($('#toSignup'), 'to signup');
}
function addPlayers(w, names) {
  names.forEach((name) => {
    $('#newName').value = name;
    click($('#addEntry'), 'add entry ' + name);
  });
}
// Visible row names in order, from the rendered "N. Name" labels.
function rowNames(w) {
  return $$('#entryList [data-entryrow]').map((row) => {
    const span = row.querySelector('[data-nameedit]');
    return span ? span.textContent : null;
  });
}
const NAMES = ['Anna', 'Ben', 'Cleo', 'Dan'];

/* ============ (a) bracket: randomize + handles + hint ============ */
{
  const w = boot();
  toSignup(w, { format: 'bracket', scoreMode: 'total' });
  addPlayers(w, NAMES);
  const btn = $('#shuffleBtn');
  ok(!!btn, 'a: bracket sign-up has the randomize button');
  ok(btn && btn.textContent.includes('Randomize order'), 'a: button is labelled "🔀 Randomize order", got: ' + (btn && btn.textContent));
  ok(bodyText(w).includes('Order decides the matchups — randomize or drag to arrange.'), 'a: hint line is shown');
  ok($$('[data-draghandle]').length === 4, 'a: one drag handle per row');
  const idsBefore = w.CruiseGameScoring.signupOrder();
  ok(idsBefore.length === 4, 'a: signupOrder reports the 4 draft entries');

  // Deterministic Fisher-Yates: Math.random() === 0 always picks
  // index 0, so [A,B,C,D] -> swap(3,0) -> swap(2,0) -> swap(1,0)
  // -> [B,C,D,A].
  w.Math.random = () => 0;
  click(btn, 'randomize');
  const idsAfter = w.CruiseGameScoring.signupOrder();
  ok(JSON.stringify(idsAfter.slice().sort()) === JSON.stringify(idsBefore.slice().sort()),
    'a: randomize keeps exactly the same entries (a permutation)');
  ok(JSON.stringify(idsAfter) === JSON.stringify([idsBefore[1], idsBefore[2], idsBefore[3], idsBefore[0]]),
    'a: with Math.random stubbed to 0 the order rotates to [B,C,D,A], got: ' + JSON.stringify(idsAfter));
  ok(JSON.stringify(rowNames(w)) === JSON.stringify(['Ben', 'Cleo', 'Dan', 'Anna']),
    'a: rendered rows follow the randomized order, got: ' + JSON.stringify(rowNames(w)));

  // Re-randomize: a second tap shuffles again from the new order.
  click($('#shuffleBtn'), 'randomize again');
  const idsAgain = w.CruiseGameScoring.signupOrder();
  ok(JSON.stringify(idsAgain) === JSON.stringify([idsAfter[1], idsAfter[2], idsAfter[3], idsAfter[0]]),
    'a: second tap re-randomizes from the current order');
}

/* ============ (b) round robin: randomize + handles + hint ============ */
{
  const w = boot();
  toSignup(w, { format: 'rr', scoreMode: 'total', rrGames: 2, pairing: 'preset' });
  addPlayers(w, NAMES);
  const btn = $('#shuffleBtn');
  ok(!!btn && btn.textContent.includes('Randomize order'), 'b: RR sign-up has the randomize button');
  ok(bodyText(w).includes('Order decides the matchups — randomize or drag to arrange.'), 'b: hint line is shown');
  ok($$('[data-draghandle]').length === 4, 'b: one drag handle per row');
  const idsBefore = w.CruiseGameScoring.signupOrder();
  w.Math.random = () => 0;
  click(btn, 'randomize');
  const idsAfter = w.CruiseGameScoring.signupOrder();
  ok(JSON.stringify(idsAfter) === JSON.stringify([idsBefore[1], idsBefore[2], idsBefore[3], idsBefore[0]]),
    'b: RR randomize permutes the draft order the same way');
  ok(JSON.stringify(rowNames(w)) === JSON.stringify(['Ben', 'Cleo', 'Dan', 'Anna']),
    'b: rendered rows follow, got: ' + JSON.stringify(rowNames(w)));
}

/* ============ (c) quick score: no ordering controls ============ */
{
  const w = boot();
  toSignup(w, { format: 'quick', scoreMode: 'total' });
  addPlayers(w, NAMES);
  ok($('#shuffleBtn') === null, 'c: quick score has no randomize button');
  ok($$('[data-draghandle]').length === 0, 'c: quick score rows have no drag handles');
  ok(!bodyText(w).includes('Order decides the matchups'), 'c: quick score has no matchups hint');
}

/* ============ (d) signupMove seam: exact reorder ============ */
{
  const w = boot();
  toSignup(w, { format: 'bracket', scoreMode: 'total' });
  addPlayers(w, NAMES);
  const ids = w.CruiseGameScoring.signupOrder(); // [A,B,C,D] by insertion
  w.CruiseGameScoring.signupMove(0, 2);
  ok(JSON.stringify(w.CruiseGameScoring.signupOrder()) === JSON.stringify([ids[1], ids[2], ids[0], ids[3]]),
    'd: signupMove(0,2) moves the first entry to position 2');
  ok(JSON.stringify(rowNames(w)) === JSON.stringify(['Ben', 'Cleo', 'Anna', 'Dan']),
    'd: rendered rows follow the move, got: ' + JSON.stringify(rowNames(w)));
  w.CruiseGameScoring.signupMove(3, 0);
  ok(JSON.stringify(w.CruiseGameScoring.signupOrder()) === JSON.stringify([ids[3], ids[1], ids[2], ids[0]]),
    'd: signupMove(3,0) moves the last entry to the front');
  w.CruiseGameScoring.signupMove(1, 1);
  ok(JSON.stringify(rowNames(w)) === JSON.stringify(['Dan', 'Ben', 'Cleo', 'Anna']),
    'd: a no-op move leaves the order untouched');
}

/* ============ (e) start after a move: bracket pairings follow ============ */
{
  const w = boot();
  toSignup(w, { format: 'bracket', scoreMode: 'total' });
  addPlayers(w, NAMES);
  w.CruiseGameScoring.signupMove(0, 2); // order: Ben, Cleo, Anna, Dan
  click($('#startBtn'), 'start game');
  const game = lastGame(w);
  ok(game.format === 'bracket', 'e: bracket game created');
  // Seeds: 1=Ben, 2=Cleo, 3=Anna, 4=Dan; standard seeding pairs
  // 1v4 and 2v3.
  ok(JSON.stringify(pairSet(game, 1)) === JSON.stringify(['Anna|Cleo', 'Ben|Dan']),
    'e: round-1 pairings reflect the moved order, got: ' + JSON.stringify(pairSet(game, 1)));
}
{
  // Control: no move — pairings follow sign-up order.
  const w = boot();
  toSignup(w, { format: 'bracket', scoreMode: 'total' });
  addPlayers(w, NAMES);
  click($('#startBtn'), 'start game');
  const game = lastGame(w);
  ok(JSON.stringify(pairSet(game, 1)) === JSON.stringify(['Anna|Dan', 'Ben|Cleo']),
    'e2: without a move, round 1 pairs 1v4 and 2v3 of sign-up order, got: ' + JSON.stringify(pairSet(game, 1)));
}

/* ============ (f) start after a move: RR schedules follow ============ */
{
  const w = boot();
  toSignup(w, { format: 'rr', scoreMode: 'total', rrGames: 3, pairing: 'preset' });
  addPlayers(w, NAMES);
  w.CruiseGameScoring.signupMove(0, 2); // order: Ben, Cleo, Anna, Dan
  click($('#startBtn'), 'start game');
  const game = lastGame(w);
  // Circle method on [Ben,Cleo,Anna,Dan]: round 1 pairs the ends
  // inward — Ben|Dan and Cleo|Anna.
  ok(JSON.stringify(pairSet(game, 1)) === JSON.stringify(['Anna|Cleo', 'Ben|Dan']),
    'f: preset RR round 1 reflects the moved order, got: ' + JSON.stringify(pairSet(game, 1)));
}
{
  const w = boot();
  toSignup(w, { format: 'rr', scoreMode: 'total', rrGames: 2, pairing: 'results' });
  addPlayers(w, NAMES);
  w.CruiseGameScoring.signupMove(0, 2); // order: Ben, Cleo, Anna, Dan
  click($('#startBtn'), 'start game');
  const game = lastGame(w);
  // Results-based round 1 pairs consecutively in sign-up order.
  ok(JSON.stringify(pairSet(game, 1)) === JSON.stringify(['Anna|Dan', 'Ben|Cleo']),
    'f2: results-based RR round 1 pairs consecutively in the moved order, got: ' + JSON.stringify(pairSet(game, 1)));
}

/* ============ (g) row actions still work with handles present ============ */
{
  const w = boot();
  toSignup(w, { format: 'rr', scoreMode: 'total', rrGames: 2, pairing: 'preset' });
  addPlayers(w, NAMES);
  click($('[data-delentry="1"]'), 'remove Ben');
  ok(JSON.stringify(rowNames(w)) === JSON.stringify(['Anna', 'Cleo', 'Dan']),
    'g: remove still works, rows: ' + JSON.stringify(rowNames(w)));
  ok($$('[data-draghandle]').length === 3, 'g: handles re-render with the list');
  click($('[data-nameedit="0"]'), 'edit Anna inline');
  const inp = $('[data-nameinput="0"]');
  ok(!!inp, 'g: inline name editor opens');
  inp.value = 'Ana';
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(JSON.stringify(rowNames(w)) === JSON.stringify(['Ana', 'Cleo', 'Dan']),
    'g: inline rename commits, rows: ' + JSON.stringify(rowNames(w)));
}

console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
