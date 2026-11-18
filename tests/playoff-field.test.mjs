/* End-to-end DOM tests for the playoff field screen, bracket
   regeneration, and the whole-bracket view (v1.6). Drives the shipped
   index.html + config.js + engines.js + qr.js + app.js in jsdom,
   clicking the real buttons.

   Scenarios:
   a. RR (Bean Bag) with 6 entries, playoff Top 4: Start playoff lands
      on the field screen with seeds in standings order; replacing
      seed 2 with the 5th-placed entry flows into the generated
      pairings (seed1 vs seed4, replacement-as-seed2 vs seed3).
   b. Top 8 playoff: the bracket view lists Quarterfinals, Semifinals
      and the Final, with "Winner of Semifinal 1/2" feeder labels.
   c. Regeneration: Regenerate returns to the field screen with the
      field preserved; a changed seed rebuilds the bracket (new match
      IDs, new pairing). After a playoff match is scored, Regenerate
      is replaced by the locked note.
   d. Size change Top 4 -> Top 2 re-derives a 2-entry field and
      generates a single 1v2 final.
   e. Standalone 8-player single-elim bracket: View bracket shows all
      3 rounds with friendly feeder labels, and a first-round match
      can be scored from the bracket view.
   f. Engines: buildSingleElim for 8 ids pairs seeds (1,8),(5,4),
      (3,6),(7,2) — standard seeding, 1 and 2 in opposite halves.
   g. Format-level proof #1: the full field-screen + replace +
      generate flow on Shuffleboard (not Bean Bag).
   h. Format-level proof #2: the bracket view on a CUSTOM game's
      standalone bracket. */
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
  if (opts.playoffElim) click($(`#segPlayoffElim button[data-v="${opts.playoffElim}"]`), 'playoff elim seg');
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
/* Score every unscored RR match with the a-side winning by a distinct
   margin (9, 7, 5, 3 …) so the standings order is fully deterministic:
   winners rank by points for, losers by point difference. Returns
   { winners: [ids in standings order], losers: [ids in standings order] }. */
function scoreAllRR(w, game) {
  const wins = [], losses = [];
  game.matches.forEach((m, i) => {
    if (m.scored || m.autoBye) return;
    const pts = 9 - i * 2;
    wins.push(m.aId); losses.push(m.bId);
    game = scoreMatch(w, m.id, pts, 0);
  });
  const losersByStandings = losses.slice().reverse(); // -3 diff ranks above -5, -7, -9
  return { game, winners: wins, losers: losersByStandings };
}
const nameOf = (game, id) => (game.entries.find((e) => e.id === id) || {}).name;
function seedRowTexts(w) {
  return $$('.seedno').map((el) => el.parentElement.textContent);
}
function roundPairs(game, matches, round) {
  return matches.filter((m) => m.round === round && !m.autoBye)
    .map((m) => [m.aId, m.bId].sort().join('|')).sort();
}
const pairOf = (x, y) => [x, y].sort().join('|');

/* ============ (a) field screen + replace + generate (Bean Bag RR) ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 1, scoreMode: 'total', playoff: '4', players: ['Ann', 'Bob', 'Cy', 'Dee', 'Eli', 'Fay'] });
  const res = scoreAllRR(w, game); game = res.game;
  const [W0, W1, W2] = res.winners;           // standings 1–3
  const [L2, L1, L0] = res.losers;            // standings 4, 5, 6
  ok($('#startPlayoffBtn'), 'a: Start playoff offered once the RR is done');
  click($('#startPlayoffBtn'), 'start playoff');
  game = lastGame(w);
  ok(!game.playoffMatches, 'a: no bracket built yet — field review comes first');
  ok(bodyText(w).includes('Playoff field'), 'a: field screen shown');
  ok(JSON.stringify(game.playoffField) === JSON.stringify([W0, W1, W2, L2]),
    'a: field is the standings top 4 in order, got ' + JSON.stringify((game.playoffField || []).map((id) => nameOf(game, id))));
  const rows = seedRowTexts(w);
  ok(rows.length === 4 && rows[0].includes(nameOf(game, W0)) && rows[1].includes(nameOf(game, W1)) &&
     rows[2].includes(nameOf(game, W2)) && rows[3].includes(nameOf(game, L2)),
    'a: seed rows render in standings order');
  ok(rows[0].includes('1W–0L') && rows[3].includes('0W–1L'), 'a: seed rows carry standings lines (W–L · Diff · Pts)');
  // Replace seed 2 (W1) with the 5th-placed entry (L1).
  click($('[data-replace-seed="1"]'), 'open replace picker for seed 2');
  ok($(`[data-pick-replacement="${L1}"]`), 'a: 5th-placed entry offered as a replacement');
  ok(!$(`[data-pick-replacement="${W0}"]`), 'a: players already in the field are not offered');
  click($(`[data-pick-replacement="${L1}"]`), 'pick replacement');
  game = lastGame(w);
  ok(JSON.stringify(game.playoffField) === JSON.stringify([W0, L1, W2, L2]),
    'a: replacement sits in the seed 2 slot, got ' + JSON.stringify((game.playoffField || []).map((id) => nameOf(game, id))));
  click($('#pfGenerateBtn'), 'generate bracket');
  game = lastGame(w);
  ok(!!game.playoffMatches && game.playoffMatches.length === 3, 'a: Top 4 single-elim bracket has 3 matches');
  const pairs = roundPairs(game, game.playoffMatches, 1);
  ok(pairs.includes(pairOf(W0, L2)), 'a: semifinal 1 is seed 1 vs seed 4');
  ok(pairs.includes(pairOf(L1, W2)), 'a: semifinal 2 is the replacement (seed 2) vs seed 3');
  ok(bodyText(w).includes('Winner of Semifinal 1'), 'a: play screen final slot uses the friendly feeder label');
}

/* ============ (b) Top 8 bracket view: all rounds, friendly labels ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 1, scoreMode: 'total', playoff: '8', players: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'] });
  const res = scoreAllRR(w, game); game = res.game;
  click($('#startPlayoffBtn'), 'start playoff');
  click($('#pfGenerateBtn'), 'generate bracket');
  game = lastGame(w);
  ok(game.playoffMatches.length === 7, 'b: Top 8 single-elim bracket has 7 matches');
  ok($('#viewBracketBtn'), 'b: View bracket button in the playoff section');
  click($('#viewBracketBtn'), 'open bracket view');
  ok(!!$('#navBackBtn'), 'b: bracket view screen is showing (nav row)');
  const txt = bodyText(w);
  ok(txt.includes('Quarterfinals') && txt.includes('Semifinals') && txt.includes('Final'),
    'b: bracket view lists Quarterfinals, Semifinals and the Final');
  ok(txt.includes('Winner of Semifinal 1') && txt.includes('Winner of Semifinal 2'),
    'b: the Final slots read "Winner of Semifinal 1/2"');
  ok(txt.includes('Winner of Quarterfinal 1'), 'b: semifinal slots read "Winner of Quarterfinal N"');
  ok(!/Winner of M\d/.test(txt), 'b: no old-style "Winner of M#" labels remain');
}

/* ============ (c) regeneration, then the lock ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 1, scoreMode: 'total', playoff: '4', players: ['Ann', 'Bob', 'Cy', 'Dee', 'Eli', 'Fay'] });
  const res = scoreAllRR(w, game); game = res.game;
  const [W0, W1, W2] = res.winners;
  const [L2, L1, L0] = res.losers;
  click($('#startPlayoffBtn'), 'start playoff');
  click($('#pfGenerateBtn'), 'generate bracket');
  game = lastGame(w);
  const oldIds = game.playoffMatches.map((m) => m.id);
  const fieldAtGen = (game.playoffField || []).slice();
  ok($('#regenBracketBtn'), 'c: Regenerate bracket offered while the bracket is unscored');
  ok(!bodyText(w).includes('Bracket locked'), 'c: no locked note before any playoff score');
  click($('#regenBracketBtn'), 'regenerate');
  game = lastGame(w);
  ok(bodyText(w).includes('Playoff field'), 'c: Regenerate returns to the field screen');
  ok(JSON.stringify(game.playoffField) === JSON.stringify(fieldAtGen), 'c: field preserved as last generated');
  // Change seed 3 (W2) to the 6th-placed entry (L0), then regenerate.
  click($('[data-replace-seed="2"]'), 'open replace picker for seed 3');
  click($(`[data-pick-replacement="${L0}"]`), 'pick 6th-placed replacement');
  click($('#pfGenerateBtn'), 'regenerate bracket');
  game = lastGame(w);
  ok(game.playoffMatches.every((m) => !oldIds.includes(m.id)), 'c: regenerated bracket has all-new match IDs');
  const pairs = roundPairs(game, game.playoffMatches, 1);
  ok(pairs.includes(pairOf(W1, L0)), 'c: new pairing present (seed 2 vs replacement-as-seed 3)');
  ok(!pairs.includes(pairOf(L1, W2)) && !roundPairs(game, game.playoffMatches, 1).join(',').includes(W2),
    'c: displaced seed 3 is out of the bracket');
  // Score a playoff match: the bracket locks.
  const sf = game.playoffMatches.find((m) => m.round === 1 && !m.autoBye);
  game = scoreMatch(w, sf.id, 5, 2);
  ok($('#regenBracketBtn') === null, 'c: Regenerate is gone once a playoff match is scored');
  ok(bodyText(w).includes('Bracket locked'), 'c: locked note shown after a playoff score');
}

/* ============ (d) size change re-derives the field ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 1, scoreMode: 'total', playoff: '4', players: ['Ann', 'Bob', 'Cy', 'Dee', 'Eli', 'Fay'] });
  const res = scoreAllRR(w, game); game = res.game;
  const [W0, W1] = res.winners;
  click($('#startPlayoffBtn'), 'start playoff');
  ok(seedRowTexts(w).length === 4, 'd: field starts at 4 seeds');
  click($('#segPfSize button[data-v="2"]'), 'switch to Top 2');
  game = lastGame(w);
  ok(game.playoffSize === 2 && game.playoffField.length === 2, 'd: field re-derived at size 2');
  ok(JSON.stringify(game.playoffField) === JSON.stringify([W0, W1]), 'd: Top 2 field is the standings top 2');
  ok(seedRowTexts(w).length === 2, 'd: two seed rows after the size change');
  click($('#pfGenerateBtn'), 'generate bracket');
  game = lastGame(w);
  ok(game.playoffMatches.length === 1, 'd: Top 2 generates a single match');
  const only = game.playoffMatches[0];
  ok(pairOf(only.aId, only.bId) === pairOf(W0, W1), 'd: the single final pairs seed 1 vs seed 2');
}

/* ============ (e) standalone bracket: view + score from the view ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'bracket', elim: 'single', scoreMode: 'total', players: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'] });
  ok(game.matches.length === 7, 'e: 8-player bracket has 7 matches');
  ok($('#viewBracketBtn'), 'e: View bracket button on the bracket play screen');
  click($('#viewBracketBtn'), 'open bracket view');
  ok(!!$('#navBackBtn'), 'e: bracket view screen is showing (nav row)');
  const txt = bodyText(w);
  ok(txt.includes('Quarterfinals') && txt.includes('Semifinals') && txt.includes('Final'),
    'e: bracket view shows all 3 rounds');
  ok(txt.includes('Winner of Quarterfinal 1') && txt.includes('Winner of Semifinal 2'),
    'e: friendly feeder labels throughout');
  const qf = game.matches.find((m) => m.round === 1);
  game = scoreMatch(w, qf.id, 6, 2);
  const scored = game.matches.find((m) => m.id === qf.id);
  ok(scored.scored && scored.winnerId === qf.aId, 'e: first-round match scored from the bracket view');
  // The app fills a downstream slot once BOTH feeders are decided, so
  // score the sibling quarterfinal too, then check the flow.
  const sf0 = game.matches.find((m) => m.round === 2 && (m.srcA.m === qf.id || m.srcB.m === qf.id));
  const siblingId = sf0.srcA.m === qf.id ? sf0.srcB.m : sf0.srcA.m;
  game = scoreMatch(w, siblingId, 4, 1);
  const sf = game.matches.find((m) => m.id === sf0.id);
  ok((sf.srcA.m === qf.id ? sf.aId : sf.bId) === scored.winnerId, 'e: winner flowed into the semifinal slot');
  ok(bodyText(w).includes(nameOf(game, scored.winnerId)), 'e: semifinal card now names the winner');
}

/* ============ (f) engines: standard seeding ============ */
{
  const w = boot();
  const ids = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
  const ms = w.Engines.buildSingleElim(ids);
  const seedOf = (id) => ids.indexOf(id) + 1;
  const pairs = ms.filter((m) => m.round === 1)
    .map((m) => [seedOf(m.srcA.id), seedOf(m.srcB.id)].sort((x, y) => x - y))
    .sort((p, q) => p[0] - q[0]);
  ok(JSON.stringify(pairs) === JSON.stringify([[1, 8], [2, 7], [3, 6], [4, 5]]),
    'f: buildSingleElim pairs seeds (1,8),(5,4),(3,6),(7,2) as sets — 1 and 2 in opposite halves, got ' + JSON.stringify(pairs));
}

/* ============ (g) format-level proof: Shuffleboard RR + playoff ============ */
{
  const w = boot();
  let game = setupGame(w, { template: 'builtin-shuffle', format: 'rr', pairing: 'preset', rrGames: 1, scoreMode: 'total', playoff: '4', players: ['Sue', 'Sal', 'Sid', 'Sky', 'Sam', 'Syd'] });
  ok(game.templateId === 'builtin-shuffle', 'g: game is Shuffleboard, not Bean Bag');
  const res = scoreAllRR(w, game); game = res.game;
  const [W0, W1, W2] = res.winners;
  const [L2, L1] = res.losers;
  click($('#startPlayoffBtn'), 'start playoff');
  game = lastGame(w);
  ok(bodyText(w).includes('Playoff field') && !!$('#pfGenerateBtn'), 'g: field screen works for Shuffleboard');
  ok(Array.isArray(game.playoffField) && game.playoffField.length === 4, 'g: field derived for Shuffleboard');
  click($('[data-replace-seed="1"]'), 'open replace picker for seed 2');
  click($(`[data-pick-replacement="${L1}"]`), 'pick replacement');
  click($('#pfGenerateBtn'), 'generate bracket');
  game = lastGame(w);
  const pairs = roundPairs(game, game.playoffMatches, 1);
  ok(pairs.includes(pairOf(W0, L2)) && pairs.includes(pairOf(L1, W2)),
    'g: Shuffleboard playoff pairings reflect the replacement');
  click($('#viewBracketBtn'), 'open bracket view');
  ok(bodyText(w).includes('Winner of Semifinal 1'), 'g: bracket view works for Shuffleboard');
}

/* ============ (h) format-level proof: custom game standalone bracket ============ */
{
  const custom = {
    id: 'custom-ring-toss', name: 'Ring Toss', icon: '🎯', color: '#dc2626',
    attempts: 3, winDir: 'high',
    buttons: [{ label: 'Ring', points: 5 }, { label: 'Near', points: 2 }, { label: 'Miss', points: 0 }]
  };
  const w = boot({ templates: [custom], games: [] });
  let game = setupGame(w, { template: 'custom-ring-toss', format: 'bracket', elim: 'single', scoreMode: 'total', players: ['Kim', 'Lee', 'Mel', 'Ned'] });
  ok(game.templateId === 'custom-ring-toss' && game.name === 'Ring Toss', 'h: game is the custom Ring Toss');
  ok($('#viewBracketBtn'), 'h: View bracket button on a custom game');
  click($('#viewBracketBtn'), 'open bracket view');
  const txt = bodyText(w);
  ok(txt.includes('Semifinals') && txt.includes('Final'), 'h: custom bracket view lists Semifinals and the Final');
  ok(txt.includes('Winner of Semifinal 1') && txt.includes('Winner of Semifinal 2'),
    'h: friendly feeder labels on a custom game');
  const sf = game.matches.find((m) => m.round === 1);
  game = scoreMatch(w, sf.id, 8, 4);
  ok(game.matches.find((m) => m.id === sf.id).scored, 'h: scoring works from a custom game bracket view');
}

/* ============ (i) field-screen elim toggle + double-elim bracket view ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 1, scoreMode: 'total', playoff: '4', players: ['Ann', 'Bob', 'Cy', 'Dee'] });
  const res = scoreAllRR(w, game); game = res.game;
  click($('#startPlayoffBtn'), 'start playoff');
  click($('#segPfElim button[data-v="double"]'), 'flip playoff style to double on the field screen');
  game = lastGame(w);
  ok(game.playoffElim === 'double', 'i: elim toggle on the field screen updates the game');
  click($('#pfGenerateBtn'), 'generate bracket');
  game = lastGame(w);
  const stages = {};
  game.playoffMatches.forEach((m) => { stages[m.stage] = (stages[m.stage] || 0) + 1; });
  ok(stages.wb === 3 && stages.lb === 2 && stages.gf === 1,
    'i: Top 4 double-elim builds 3 WB + 2 LB + 1 GF matches, got ' + JSON.stringify(stages));
  click($('#viewBracketBtn'), 'open bracket view');
  const txt = bodyText(w);
  ok(txt.includes('Winners bracket') && txt.includes('Losers bracket'), 'i: bracket view shows Winners and Losers brackets');
  ok(txt.includes('Loser of Winners SF 1'), 'i: losers-bracket slots read "Loser of Winners SF N"');
  ok(txt.includes('Winner of Winners Final'), 'i: grand final slot reads "Winner of Winners Final"');
}

console.log('\n' + checks + ' checks, ' + failures + ' failures');
if (failures) process.exit(1);
