/* End-to-end DOM tests for v1.6.1: a bracket winner's name shows in
   the next round as soon as they win their match (display only).
   resolveBracket still fills a match's participants atomically — the
   next match stays unscorable until BOTH feeders are decided — but
   the vs-line names a feeder winner/loser the moment they are known,
   instead of reading "Winner of Quarterfinal 1" until then.

   Scenarios:
   a. Standalone 8-player single-elim: score ONLY Quarterfinal 1 →
      Semifinal 1's card names the QF1 winner on one side and reads
      "Winner of Quarterfinal 2" on the other, and still has NO Score
      button. Score Quarterfinal 2 → both names show, button appears.
   b. RR Top-4 playoff: win Semifinal 1 → the Final card shows that
      winner's name vs "Winner of Semifinal 2".
   c. Standalone 4-player double-elim: a losers-bracket slot fed by a
      'lose' source names the loser as soon as the winners match is
      scored, while the other side still reads "Loser of …". */
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
const nameOf = (game, id) => (game.entries.find((e) => e.id === id) || {}).name;

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
function scoreAllRR(w, game) {
  const wins = [], losses = [];
  game.matches.forEach((m, i) => {
    if (m.scored || m.autoBye) return;
    const pts = 9 - i * 2;
    wins.push(m.aId); losses.push(m.bId);
    game = scoreMatch(w, m.id, pts, 0);
  });
  return { game, winners: wins, losers: losses.slice().reverse() };
}
/* The rendered .match card for a match (by id) within its matches
   array (cards are labelled "M<index+1>" by matchLabel). Only
   unambiguous on screens rendering a single matches array — use the
   bracket view. */
function cardFor(matches, matchId) {
  const m = matches.find((x) => x.id === matchId);
  if (!m) return null;
  const label = 'M' + (matches.indexOf(m) + 1);
  return $$('.match').find((el) => {
    const s = el.querySelector('.sub');
    return s && s.textContent.trim() === label;
  }) || null;
}

/* ============ (a) standalone single-elim: name flows after ONE feeder ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'bracket', elim: 'single', scoreMode: 'total',
    players: ['Alpha', 'Bravo', 'Charley', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'] });
  click($('#viewBracketBtn'), 'open bracket view');
  const round1 = game.matches.filter((m) => m.round === 1);
  const qf1 = round1[0];
  const sf = game.matches.find((m) => m.round === 2 && (m.srcA.m === qf1.id || m.srcB.m === qf1.id));
  const sibling = game.matches.find((m) => m.id === (sf.srcA.m === qf1.id ? sf.srcB.m : sf.srcA.m));
  const siblingLabel = 'Winner of Quarterfinal ' + (round1.indexOf(sibling) + 1);
  let card = cardFor(game.matches, sf.id);
  ok(card && card.textContent.includes('Winner of Quarterfinal ' + (round1.indexOf(qf1) + 1)),
    'a: before any score the semifinal slot reads "Winner of Quarterfinal N"');

  game = scoreMatch(w, qf1.id, 6, 2);
  const qf1After = game.matches.find((m) => m.id === qf1.id);
  const winnerName = nameOf(game, qf1After.winnerId);
  const sfState = game.matches.find((m) => m.id === sf.id);
  ok(sfState.aId === null && sfState.bId === null,
    'a: state unchanged — semifinal participants still unset until BOTH feeders resolve');
  card = cardFor(game.matches, sf.id);
  ok(!!card, 'a: semifinal card still rendered after one quarterfinal');
  ok(card && card.textContent.includes(winnerName),
    'a: semifinal card names the QF1 winner (' + winnerName + ') immediately');
  ok(card && card.textContent.includes(siblingLabel),
    'a: the undecided side still reads "' + siblingLabel + '"');
  ok(card && !card.textContent.includes('Winner of Quarterfinal ' + (round1.indexOf(qf1) + 1)),
    'a: the decided side no longer reads "Winner of Quarterfinal ' + (round1.indexOf(qf1) + 1) + '"');
  ok(card && !card.querySelector('[data-score]'),
    'a: semifinal still has NO Score button with only one feeder decided');

  game = scoreMatch(w, sibling.id, 4, 1);
  const sibAfter = game.matches.find((m) => m.id === sibling.id);
  const sfNow = game.matches.find((m) => m.id === sf.id);
  ok(sfNow.aId && sfNow.bId, 'a: semifinal participants set once both feeders are decided');
  card = cardFor(game.matches, sf.id);
  ok(card && card.textContent.includes(winnerName) && card.textContent.includes(nameOf(game, sibAfter.winnerId)),
    'a: both semifinalists named after both quarterfinals');
  ok(card && !!card.querySelector('[data-score]'), 'a: Score button appears once both feeders are decided');
}

/* ============ (b) RR Top-4 playoff: Final names the SF1 winner at once ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 1, scoreMode: 'total', playoff: '4',
    players: ['Ann', 'Bob', 'Cy', 'Dee', 'Eli', 'Fay'] });
  const res = scoreAllRR(w, game); game = res.game;
  click($('#startPlayoffBtn'), 'start playoff');
  click($('#pfGenerateBtn'), 'generate bracket');
  game = lastGame(w);
  click($('#viewBracketBtn'), 'open bracket view');
  const pm = game.playoffMatches;
  const sf1 = pm.filter((m) => m.round === 1)[0];
  const fin = pm.find((m) => m.round === 2);
  let card = cardFor(game.playoffMatches, fin.id);
  ok(card && card.textContent.includes('Winner of Semifinal 1') && card.textContent.includes('Winner of Semifinal 2'),
    'b: before any playoff score the Final reads "Winner of Semifinal 1/2"');

  game = scoreMatch(w, sf1.id, 5, 2);
  const sf1After = game.playoffMatches.find((m) => m.id === sf1.id);
  const winnerName = nameOf(game, sf1After.winnerId);
  const finState = game.playoffMatches.find((m) => m.id === fin.id);
  ok(finState.aId === null && finState.bId === null,
    'b: state unchanged — Final participants still unset with one semifinal open');
  card = cardFor(game.playoffMatches, fin.id);
  ok(card && card.textContent.includes(winnerName),
    'b: Final card names the Semifinal 1 winner (' + winnerName + ') immediately');
  ok(card && card.textContent.includes('Winner of Semifinal 2'),
    'b: the open side still reads "Winner of Semifinal 2"');
  ok(card && !card.textContent.includes('Winner of Semifinal 1'),
    'b: the decided side no longer reads "Winner of Semifinal 1"');
  ok(card && !card.querySelector('[data-score]'), 'b: Final still has NO Score button');
}

/* ============ (c) double-elim: 'lose' feeder names the loser at once ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'bracket', elim: 'double', scoreMode: 'total',
    players: ['Kim', 'Lou', 'Mel', 'Ned'] });
  click($('#viewBracketBtn'), 'open bracket view');
  const wb1 = game.matches.filter((m) => m.stage === 'wb' && m.round === 1);
  const lb1 = game.matches.find((m) => m.stage === 'lb' && m.round === 1);
  ok(wb1.length === 2 && !!lb1, 'c: 4-player double-elim has 2 WB semifinals and an LB opener');
  ok((lb1.srcA.t === 'lose' && lb1.srcB.t === 'lose'), 'c: LB opener is fed by two lose sources');
  const wbFirst = wb1.find((m) => m.id === lb1.srcA.m) || wb1[0];
  const wbOther = wb1.find((m) => m.id !== wbFirst.id);
  const otherIdx = wb1.indexOf(wbOther) + 1;
  let card = cardFor(game.matches, lb1.id);
  ok(card && card.textContent.includes('Loser of Winners SF 1') && card.textContent.includes('Loser of Winners SF 2'),
    'c: before any score the LB slots read "Loser of Winners SF N"');

  game = scoreMatch(w, wbFirst.id, 7, 3);
  const wbAfter = game.matches.find((m) => m.id === wbFirst.id);
  const loserName = nameOf(game, wbAfter.loserId);
  const lbState = game.matches.find((m) => m.id === lb1.id);
  ok(lbState.aId === null && lbState.bId === null,
    'c: state unchanged — LB participants still unset with one feeder open');
  card = cardFor(game.matches, lb1.id);
  ok(card && card.textContent.includes(loserName),
    'c: LB card names the loser (' + loserName + ') as soon as the WB match is scored');
  ok(card && card.textContent.includes('Loser of Winners SF ' + otherIdx),
    'c: the open side still reads "Loser of Winners SF ' + otherIdx + '"');
  ok(card && !card.querySelector('[data-score]'), 'c: LB match still has NO Score button');

  game = scoreMatch(w, wbOther.id, 4, 2);
  const lbNow = game.matches.find((m) => m.id === lb1.id);
  ok(lbNow.aId && lbNow.bId, 'c: LB participants set once both WB semifinals are decided');
  card = cardFor(game.matches, lb1.id);
  ok(card && !!card.querySelector('[data-score]'), 'c: Score button appears once both feeders are decided');
}

console.log('\n' + checks + ' checks, ' + failures + ' failures');
if (failures) process.exit(1);
