/* End-to-end DOM tests for mid-game adds + round robin regeneration
   (v1.4). Drives the shipped index.html + config.js + engines.js +
   qr.js + app.js in jsdom, clicking the real buttons.
   Run: node tests/rr-adds.test.mjs   (needs jsdom)

   Scenarios:
   a. Pre-set RR, 6 players target 2, one match scored, add a 7th:
      the scored match is identical afterwards, the newcomer gets
      their 2 games, nobody exceeds target, the schedule changed.
   b. Pre-set RR, add before any scoring: the schedule equals a
      fresh schedule for the enlarged field.
   c. Results-based RR: a mid-round walk-up shows "Joins next round"
      and is paired when staff pair the next round.
   d. Completed pre-set RR (4 players, target 1): a late entry still
      gets a game, an opponent goes past target, the late-entry note
      shows, scored matches untouched.
   e. Playoff started: adds are blocked with the note.
   f. Bracket: add before scoring rebuilds with correct byes; after
      a real score the form becomes the can't-add note.
   g. Manual "Regenerate remaining schedule": two-step confirm,
      scored match kept, unscored pairings rebuilt into new rounds.
   h. Quick Score walk-ups still work (no regression). */
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

function setupGame(w, opts) {
  click($('#newGameBtn'), 'new game');
  click($(`[data-pick="${opts.template || 'builtin-beanbag'}"]`), 'pick template');
  if (opts.format) click($(`#segFormat button[data-v="${opts.format}"]`), 'format seg');
  if (opts.scoreMode) click($(`#segMode button[data-v="${opts.scoreMode}"]`), 'score mode seg');
  if (opts.elim) click($(`#segElim button[data-v="${opts.elim}"]`), 'elim seg');
  if (opts.rrGames !== undefined) $('#rrGames').value = String(opts.rrGames);
  if (opts.pairing) click($(`#segPairing button[data-v="${opts.pairing}"]`), 'pairing seg');
  if (opts.playoff) click($(`#segPlayoff button[data-v="${opts.playoff}"]`), 'playoff seg');
  click($('#toSignup'), 'to signup');
  opts.players.forEach((name) => {
    $('#newName').value = name;
    click($('#addEntry'), 'add entry');
  });
  click($('#startBtn'), 'start game');
  return lastGame(w);
}
function scoreMatch(w, matchId, sa, sb) {
  click($(`[data-score="${matchId}"]`), 'open scorer ' + matchId);
  const a = $('#scA'), b = $('#scB');
  if (!a || !b) throw new Error('scorer inputs missing for ' + matchId);
  a.value = String(sa); b.value = String(sb);
  click($('#scSave'), 'save score');
  return lastGame(w);
}
function addRRWalkup(w, name) {
  const inp = $('#rrWalkName');
  if (!inp) throw new Error('RR walk-up form missing');
  inp.value = name;
  click($('#rrWalkAdd'), 'add RR walk-up');
  return lastGame(w);
}
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
function gamesFor(game, id) {
  // {played: scored matches, scheduled: unscored matches}
  let played = 0, scheduled = 0;
  game.matches.forEach((m) => {
    if (m.aId === id || m.bId === id) { if (m.scored) played++; else scheduled++; }
  });
  return { played, scheduled };
}

/* ============ (a) pre-set RR: add after one scored match ============ */
{
  const w = boot();
  const g = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 2, scoreMode: 'total', players: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] });
  ok(g.matches.length === 6, 'a: fresh 6x2 preset schedule has 6 matches, got ' + g.matches.length);
  const m0 = g.matches[0];
  ok(m0.round === 1, 'a: first match is round 1');
  let game = scoreMatch(w, m0.id, 3, 1);
  const keptBefore = game.matches.find((m) => m.id === m0.id);
  const unscoredBefore = game.matches.filter((m) => !m.scored).map((m) => pairKey(m.aId, m.bId)).sort().join(',');
  game = addRRWalkup(w, 'Gina');
  ok(game.entries.length === 7, 'a: 7 entries after the add');
  const gina = game.entries[game.entries.length - 1];
  ok(gina.name === 'Gina' && gina.color === 'Black', 'a: newcomer last, palette color by position (Black), got ' + gina.color);
  const kept = game.matches.find((m) => m.id === m0.id);
  ok(kept && kept.aId === keptBefore.aId && kept.bId === keptBefore.bId && kept.sa === 3 && kept.sb === 1 && kept.round === keptBefore.round && kept.scored,
    'a: scored match identical after regeneration');
  const gf = gamesFor(game, gina.id);
  ok(gf.scheduled === 2 && gf.played === 0, 'a: newcomer scheduled for exactly 2 games, got ' + JSON.stringify(gf));
  game.entries.slice(0, 6).forEach((e) => {
    const t = gamesFor(game, e.id);
    ok(t.played + t.scheduled === 2, 'a: ' + e.name + ' ends with exactly 2 games (played ' + t.played + ' + scheduled ' + t.scheduled + ')');
  });
  const unscoredAfter = game.matches.filter((m) => !m.scored).map((m) => pairKey(m.aId, m.bId)).sort().join(',');
  ok(unscoredAfter !== unscoredBefore, 'a: unscored schedule differs from before the add');
  ok(game.matches.filter((m) => !m.scored).every((m) => m.round >= 2), 'a: rebuilt matches are numbered after the highest scored round');
  ok(bodyText(w).includes('Schedule rebuilt') && bodyText(w).includes('1 match kept'), 'a: rebuild summary note shown');
}

/* ============ (b) pre-set RR: add before any scoring ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 2, scoreMode: 'total', players: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] });
  game = addRRWalkup(w, 'Gina');
  const ids = game.entries.map((e) => e.id);
  const fresh = w.Engines.buildPresetRR(ids, 2);
  const tup = (ms) => ms.map((m) => m.round + ':' + m.aId + '|' + m.bId).sort().join(',');
  ok(tup(game.matches) === tup(fresh.matches), 'b: schedule equals a fresh 7-player schedule');
  game.entries.forEach((e) => {
    const t = gamesFor(game, e.id);
    ok(t.scheduled === 2, 'b: ' + e.name + ' has exactly 2 games');
  });
  ok(bodyText(w).includes('Schedule rebuilt'), 'b: rebuild note shown');
}

/* ============ (c) results-based RR: walk-up joins next round ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'results', rrGames: 2, scoreMode: 'total', players: ['Ana', 'Ben', 'Cyd', 'Dee'] });
  ok(game.matches.length === 2 && game.matches.every((m) => m.round === 1), 'c: round 1 paired up front');
  game = scoreMatch(w, game.matches[0].id, 3, 1); // mid-round: one match still open
  game = addRRWalkup(w, 'Newby');
  const newby = game.entries[game.entries.length - 1];
  ok(game.entries.length === 5, 'c: walk-up is in the pool');
  ok(bodyText(w).includes('Joins next round'), 'c: standings mark the walk-up "Joins next round"');
  const open = game.matches.find((m) => !m.scored);
  game = scoreMatch(w, open.id, 3, 1);
  ok($('#genRoundBtn'), 'c: pair-next-round button appears once the round is fully scored');
  click($('#genRoundBtn'), 'pair round 2');
  game = lastGame(w);
  const r2 = game.matches.filter((m) => m.round === 2);
  ok(r2.length >= 1, 'c: round 2 generated');
  ok(r2.some((m) => m.aId === newby.id || m.bId === newby.id), 'c: walk-up is paired in round 2');
  ok(!game.rrByeByRound || game.rrByeByRound[2] !== newby.id, 'c: walk-up was not handed the round-2 bye');
  ok(!bodyText(w).includes('Joins next round'), 'c: "Joins next round" clears once paired');
}

/* ============ (d) completed pre-set RR: late entry still plays ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 1, scoreMode: 'total', players: ['A', 'B', 'C', 'D'] });
  ok(game.matches.length === 2, 'd: 4 players x 1 game = 2 matches');
  const snap = game.matches.map((m) => ({ id: m.id, aId: m.aId, bId: m.bId, round: m.round }));
  game = scoreMatch(w, snap[0].id, 3, 1);
  game = scoreMatch(w, snap[1].id, 3, 2);
  ok(bodyText(w).includes('Round robin complete'), 'd: round robin complete before the add');
  game = addRRWalkup(w, 'Late');
  const late = game.entries[game.entries.length - 1];
  snap.forEach((s) => {
    const m = game.matches.find((x) => x.id === s.id);
    ok(m && m.scored && m.aId === s.aId && m.bId === s.bId && m.round === s.round, 'd: scored match ' + s.id + ' untouched');
  });
  const lf = gamesFor(game, late.id);
  ok(lf.scheduled === 1, 'd: late entry gets a game, got ' + lf.scheduled);
  const oppId = (() => { const m = game.matches.find((x) => !x.scored); return m ? (m.aId === late.id ? m.bId : m.aId) : null; })();
  const of = gamesFor(game, oppId);
  ok(of.played + of.scheduled === 2, 'd: the fill opponent goes one past target (extra game)');
  ok(bodyText(w).includes('Late entry added') && bodyText(w).includes('so Late can play'), 'd: late-entry note shown');
  ok(game.matches.some((m) => !m.scored), 'd: game is open again after the late add');
}

/* ============ (e) playoff started: adds blocked ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 1, scoreMode: 'total', playoff: '2', players: ['A', 'B', 'C', 'D'] });
  const mIds = game.matches.map((m) => m.id);
  game = scoreMatch(w, mIds[0], 3, 1);
  game = scoreMatch(w, mIds[1], 3, 2);
  ok($('#startPlayoffBtn'), 'e: playoff button offered');
  click($('#startPlayoffBtn'), 'start playoff');
  game = lastGame(w);
  ok(!!game.playoffMatches, 'e: playoff bracket exists');
  ok(bodyText(w).includes('once the playoff has started'), 'e: blocked-add note shown');
  ok($('#rrWalkName') === null && $('#rrWalkAdd') === null, 'e: no walk-up form once the playoff starts');
  ok($('#regenRRBtn') === null, 'e: no regenerate button once the playoff starts');
}

/* ============ (f) bracket: add before scoring, locked after ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'bracket', scoreMode: 'total', players: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] });
  ok($('#brWalkName') !== null, 'f: walk-up form shown before any score');
  ok(game.matches.filter((m) => m.round === 1 && m.autoBye).length === 2, 'f: 6-player bracket starts with 2 first-round byes');
  $('#brWalkName').value = 'Seventh';
  click($('#brWalkAdd'), 'add bracket walk-up');
  game = lastGame(w);
  ok(game.entries.length === 7, 'f: 7 entries after the add');
  const seventh = game.entries[game.entries.length - 1];
  ok(game.matches.length === 7, 'f: rebuilt 7-player bracket has 7 matches, got ' + game.matches.length);
  ok(game.matches.filter((m) => m.round === 1 && m.autoBye).length === 1, 'f: rebuilt bracket has exactly 1 first-round bye');
  ok(game.matches.some((m) => m.aId === seventh.id || m.bId === seventh.id), 'f: newcomer is in the rebuilt bracket');
  ok($('#brWalkName') !== null, 'f: form still offered (only auto-byes are "scored")');
  const real = game.matches.find((m) => m.aId && m.bId && !m.scored);
  game = scoreMatch(w, real.id, 3, 1);
  ok($('#brWalkName') === null, 'f: form gone after a real match is scored');
  ok(bodyText(w).includes('once bracket matches are scored'), 'f: can’t-add note shown');
}

/* ============ (g) manual regenerate with two-step confirm ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 2, scoreMode: 'total', players: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] });
  const m0 = game.matches[0];
  game = scoreMatch(w, m0.id, 3, 1);
  ok(game.matches.some((m) => !m.scored && m.round === 1), 'g: unscored round-1 matches exist before regenerate');
  const idsBefore = game.matches.map((m) => m.id).sort().join(',');
  click($('#regenRRBtn'), 'arm regenerate');
  ok($('#regenRRBtn').textContent.includes('Confirm regenerate?'), 'g: first tap arms the confirm');
  game = lastGame(w);
  ok(game.matches.map((m) => m.id).sort().join(',') === idsBefore, 'g: arming alone changes nothing');
  click($('#regenRRBtn'), 'confirm regenerate');
  game = lastGame(w);
  const kept = game.matches.find((m) => m.id === m0.id);
  ok(kept && kept.scored && kept.sa === 3 && kept.sb === 1 && kept.round === 1, 'g: scored match kept exactly');
  ok(game.matches.filter((m) => !m.scored).every((m) => m.round >= 2), 'g: rebuilt matches start after the highest scored round');
  game.entries.forEach((e) => {
    const t = gamesFor(game, e.id);
    ok(t.played + t.scheduled === 2, 'g: ' + e.name + ' still ends with exactly 2 games');
  });
  ok(bodyText(w).includes('Schedule rebuilt') && bodyText(w).includes('1 match kept'), 'g: rebuild summary note shown');
}

/* ============ (h) Quick Score walk-up regression ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'quick', players: ['Hal', 'Ida'] });
  $('#walkName').value = 'Jay';
  click($('#walkAdd'), 'quick walk-up');
  game = lastGame(w);
  ok(game.entries.length === 3, 'h: walk-up added to Quick Score');
  ok(game.entries[2].color === 'Green', 'h: walk-up color is palette position 3 (Green), got ' + game.entries[2].color);
  ok(bodyText(w).includes('Jay'), 'h: walk-up appears on the leaderboard');
}

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
