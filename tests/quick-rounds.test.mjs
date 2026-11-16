/* End-to-end DOM tests for Quick Score rounds (v1.3).
   Drives the shipped index.html + config.js + engines.js + qr.js +
   app.js in jsdom, clicking the real buttons like a staffer would.
   Run: node tests/quick-rounds.test.mjs   (needs jsdom — the engine
   tests in engines.test.mjs have no dependencies; this one does)

   Scenarios:
   1. Bean Bag Toss, Advance: R1 target 5, scores 6/5/3 -> low scorer
      is Out, the other two advance.
   2. Same game: R2 target set on the summary screen (8), scores 7/9,
      finish -> winner is the 9 (final-round rule); breakdown shows
      both rounds; Play Again preserves mode + planned targets.
   3. Nobody hits the target (10; scores 4/2) -> top scorer advances,
      summary says so.
   4. Cumulative: two rounds add up; winner by running total.
   5. Old-format saves (no rounds fields, no winnerIds) load, play,
      finish and render history normally; history Delete works.
   6. Classic Quick Score (rounds OFF) is unchanged: no qsRounds
      state is created and the classic finish flow crowns the leader. */
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

let W = null; // current window, set by boot()
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

function newGame(w, opts) {
  click($('#newGameBtn'), 'new game');
  click($(`[data-pick="${opts.template || 'builtin-beanbag'}"]`), 'pick template');
  if (opts.scoreMode) click($(`#segMode button[data-v="${opts.scoreMode}"]`), 'score mode seg');
  if (opts.rounds) {
    click($('#segQsRounds button[data-v="on"]'), 'rounds on');
    if (opts.mode) click($(`#segQsMode button[data-v="${opts.mode}"]`), 'rounds mode seg');
    (opts.targets || []).forEach((t, i) => {
      if (i > 0) click($('#qsAddTgt'), 'add planned round');
      const inp = $(`#qs-tgt-${i}`);
      if (inp && t !== null && t !== undefined) inp.value = String(t);
    });
  }
  click($('#toSignup'), 'to signup');
  opts.players.forEach((name) => {
    $('#newName').value = name;
    click($('#addEntry'), 'add entry');
  });
  click($('#startBtn'), 'start game');
  return lastGame(w);
}
function tap(w, entryId, btnIdx, times) {
  for (let i = 0; i < (times || 1); i++) {
    click($(`[data-tap="${entryId}:${btnIdx}"]`), 'tap ' + entryId + ':' + btnIdx);
  }
}
function setTotal(w, entryId, val) {
  const inp = $(`[data-total="${entryId}"]`);
  if (!inp) throw new Error('missing total input for ' + entryId);
  inp.value = String(val);
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
}

/* ============ Scenarios 1 + 2: Advance, two rounds ============ */
{
  const w = boot();
  const g = newGame(w, { rounds: true, mode: 'advance', targets: [5], players: ['Ann', 'Bob', 'Cid'] });
  const [ann, bob, cid] = g.entries.map((e) => e.id);
  ok(g.qsRounds && g.qsRounds.mode === 'advance', 'S1: qsRounds advance created');
  ok(g.qsRounds.planned[0] === 5, 'S1: planned R1 target = 5, got ' + JSON.stringify(g.qsRounds.planned));
  ok(bodyText(w).includes('Round 1') && bodyText(w).includes('Target: 5 pts'), 'S1: banner shows Round 1 + target 5');
  // Round 1: Ann 6 (hole,hole), Bob 5 (hole,board,board), Cid 3 (hole)
  tap(w, ann, 0, 2); tap(w, bob, 0, 1); tap(w, bob, 1, 2); tap(w, cid, 0, 1);
  click($('#endRoundBtn'), 'end round 1');
  let game = lastGame(w);
  const rec = game.qsRounds.rounds[0];
  ok(game.qsRounds.rounds.length === 1, 'S1: one round recorded');
  ok(rec.scores[ann] === 6 && rec.scores[bob] === 5 && rec.scores[cid] === 3,
    'S1: round scores 6/5/3, got ' + JSON.stringify(rec.scores));
  ok(rec.target === 5 && rec.advancedByFallback === false, 'S1: target recorded, no fallback');
  ok(game.qsRounds.outRound[cid] === 1, 'S1: Cid out in round 1');
  ok(!game.qsRounds.outRound[ann] && !game.qsRounds.outRound[bob], 'S1: Ann and Bob still in');
  ok(bodyText(w).includes('Round 1 summary'), 'S1: summary screen shown');
  ok($$('#summaryFinishBtn').length === 1, 'S1: summary has Finish');

  // Scenario 2: set R2 target on the summary, play R2, finish.
  $('#nextTarget').value = '8';
  click($('#startNextBtn'), 'start round 2');
  game = lastGame(w);
  ok(game.qsRounds.current === 2 && game.qsRounds.planned[1] === 8, 'S2: round 2 with target 8 from summary');
  ok(bodyText(w).includes('Round 2') && bodyText(w).includes('Target: 8 pts'), 'S2: banner shows Round 2 + target 8');
  ok($$(`[data-tap^="${cid}:"]`).length === 0, 'S2: out entry Cid has no scoring buttons');
  // Round 2: Ann 7 (hole,hole,board), Bob 9 (hole x3)
  tap(w, ann, 0, 2); tap(w, ann, 1, 1); tap(w, bob, 0, 3);
  click($('#finishBtn'), 'finish game');
  game = lastGame(w);
  ok(game.status === 'finished', 'S2: game finished');
  ok(game.winnerId === bob, 'S2: winner is Bob (final-round 9 beats 7), got ' + game.winnerId);
  ok(Array.isArray(game.winnerIds) && game.winnerIds.length === 1 && game.winnerIds[0] === bob, 'S2: winnerIds = [Bob]');
  ok(game.qsRounds.rounds.length === 2, 'S2: mid-round finish snapshotted round 2');
  ok($('.winnerbanner .wname').textContent.includes('Bob'), 'S2: winner banner names Bob');
  ok(bodyText(w).includes('Round by round'), 'S2: breakdown shown on finish screen');
  ok(bodyText(w).includes('Out R1'), 'S2: breakdown/standings mark Cid Out R1');
  // Play Again preserves rounds config.
  click($('#againBtn'), 'play again');
  const g2 = lastGame(w);
  ok(g2.id !== game.id && g2.qsRounds && g2.qsRounds.mode === 'advance', 'S2: play-again keeps advance mode');
  ok(g2.qsRounds.planned[0] === 5 && g2.qsRounds.planned[1] === 8, 'S2: play-again keeps planned targets [5,8]');
  ok(g2.qsRounds.current === 1 && g2.qsRounds.rounds.length === 0, 'S2: play-again starts fresh at round 1');
}

/* ============ Scenario 3: nobody hits the target ============ */
{
  const w = boot();
  const g = newGame(w, { scoreMode: 'total', rounds: true, mode: 'advance', targets: [10], players: ['Dan', 'Eve'] });
  const [dan, eve] = g.entries.map((e) => e.id);
  setTotal(w, dan, 4); setTotal(w, eve, 2);
  click($('#endRoundBtn'), 'end round');
  const game = lastGame(w);
  ok(game.qsRounds.rounds[0].advancedByFallback === true, 'S3: fallback flagged');
  ok(!game.qsRounds.outRound[dan], 'S3: top scorer Dan advanced');
  ok(game.qsRounds.outRound[eve] === 1, 'S3: Eve out in round 1');
  ok(bodyText(w).includes('Nobody reached the target'), 'S3: summary explains the fallback');
  ok(bodyText(w).includes('Only Dan is still in'), 'S3: summary notes one entry left');
  click($('#summaryFinishBtn'), 'finish from summary');
  const fin = lastGame(w);
  ok(fin.status === 'finished' && fin.winnerId === dan, 'S3: Dan wins after summary finish');
  ok(fin.qsRounds.rounds.length === 1, 'S3: summary finish adds no phantom round');
}

/* ============ Scenario 4: Cumulative ============ */
{
  const w = boot();
  const g = newGame(w, { rounds: true, mode: 'cumulative', players: ['Fay', 'Gil'] });
  const [fay, gil] = g.entries.map((e) => e.id);
  tap(w, fay, 0, 1); // Fay R1: 3
  tap(w, gil, 1, 1); // Gil R1: 1
  click($('#endRoundBtn'), 'end round 1');
  ok(bodyText(w).includes('Round 1 summary'), 'S4: summary shown');
  click($('#startNextBtn'), 'start round 2 (no target)');
  let game = lastGame(w);
  ok(game.qsRounds.current === 2, 'S4: now round 2');
  ok(bodyText(w).includes('Round 2'), 'S4: banner shows Round 2');
  tap(w, fay, 1, 1); // Fay R2: 1 -> total 4
  tap(w, gil, 0, 1); tap(w, gil, 1, 1); // Gil R2: 4 -> total 5
  click($('#finishBtn'), 'finish');
  game = lastGame(w);
  ok(game.winnerId === gil, 'S4: Gil wins on running total 5 vs 4');
  ok(game.qsRounds.rounds.length === 2, 'S4: two rounds recorded');
  ok(bodyText(w).includes('Round by round'), 'S4: breakdown shown');
  // Standings lines carry totals.
  ok(bodyText(w).includes('5 pts') && bodyText(w).includes('4 pts'), 'S4: totals 5 and 4 visible');
}

/* ============ Scenario 5: old-format saves + history delete ============ */
{
  const def = { attempts: 4, winDir: 'high', buttons: [{ label: 'In the hole', points: 3 }, { label: 'On board', points: 1 }, { label: 'Miss', points: 0 }] };
  const mk = (id, name, taps) => ({ id, name, cabin: '', color: id === 'oe1' || id === 'oe3' ? 'Red' : 'Blue', taps, total: null });
  const seed = {
    templates: [],
    games: [
      { id: 'old-play', templateId: 'builtin-beanbag', name: 'Bean Bag Toss', icon: '🌽', color: '#ea580c', def,
        format: 'quick', entryKind: 'individuals', scoreMode: 'tap', elim: 'single',
        entries: [mk('oe1', 'Old One', [0, 0]), mk('oe2', 'Old Two', [1])],
        matches: [], playoffMatches: null, status: 'playing', winnerId: null, createdAt: Date.now() - 1000, finishedAt: null },
      { id: 'old-fin', templateId: 'builtin-beanbag', name: 'Bean Bag Toss', icon: '🌽', color: '#ea580c', def,
        format: 'quick', entryKind: 'individuals', scoreMode: 'tap', elim: 'single',
        entries: [mk('oe3', 'Past Champ', [0, 0, 0]), mk('oe4', 'Past Runner', [0])],
        matches: [], playoffMatches: null, status: 'finished', winnerId: 'oe3', createdAt: Date.now() - 2000, finishedAt: Date.now() - 1000 }
    ]
  };
  const w = boot(seed);
  ok(bodyText(w).includes('History (1)'), 'S5: old finished game counted in history');
  click($('[data-continue="old-play"]'), 'continue old game');
  ok(bodyText(w).includes('Leaderboard'), 'S5: old in-progress game renders play screen');
  ok(!bodyText(w).includes('End round'), 'S5: classic game has no End round button');
  click($('#finishBtn'), 'finish old game');
  let game = state(w).games.find((x) => x.id === 'old-play');
  ok(game.status === 'finished' && game.winnerId === 'oe1', 'S5: old game finishes, taps leader wins');
  ok(!('qsRounds' in game), 'S5: finishing an old game does not invent rounds state');
  click($('#finishHomeBtn'), 'home from finish');
  click($('#historyBtn'), 'history');
  ok($$('[data-view]').length === 2, 'S5: two history entries listed');
  click($('[data-view="old-fin"]'), 'view old finished game');
  ok(bodyText(w).includes('Past Champ'), 'S5: old finished game renders its winner');
  click($('#finishHomeBtn'), 'home again');
  click($('#historyBtn'), 'history again');
  click($('[data-delhist="old-fin"]'), 'delete old finished game');
  ok(!state(w).games.some((x) => x.id === 'old-fin'), 'S5: history delete removes the game');
  ok($$('[data-view]').length === 1, 'S5: history list re-renders with one entry');
}

/* ============ Scenario 6: classic Quick Score unchanged ============ */
{
  const w = boot();
  const g = newGame(w, { players: ['Hal', 'Ida'] });
  const [hal, ida] = g.entries.map((e) => e.id);
  ok(!('qsRounds' in g), 'S6: classic game has no qsRounds');
  tap(w, hal, 0, 1); // 3
  tap(w, ida, 1, 1); // 1
  click($('#finishBtn'), 'finish classic');
  const game = lastGame(w);
  ok(game.winnerId === hal, 'S6: classic winner is the leader');
  ok(game.winnerIds && game.winnerIds[0] === hal, 'S6: winnerIds recorded');
  ok($('.winnerbanner .wname').textContent.includes('Hal'), 'S6: classic winner banner');
}

/* ============ Scenario 7: tie at the top -> joint winners ============ */
{
  const w = boot();
  const g = newGame(w, { rounds: true, mode: 'cumulative', players: ['Jo', 'Kim'] });
  const [jo, kim] = g.entries.map((e) => e.id);
  tap(w, jo, 0, 1); // 3
  tap(w, kim, 0, 1); // 3
  click($('#finishBtn'), 'finish tied game');
  const game = lastGame(w);
  ok(game.winnerIds && game.winnerIds.length === 2, 'S7: both tied entries are winners, got ' + JSON.stringify(game.winnerIds));
  ok(bodyText(w).includes('joint winners'), 'S7: banner says joint winners');
  ok($('.winnerbanner .wname').textContent.includes('Jo') && $('.winnerbanner .wname').textContent.includes('Kim'),
    'S7: banner names both winners');
}

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
