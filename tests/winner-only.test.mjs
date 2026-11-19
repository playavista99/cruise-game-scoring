/* End-to-end DOM tests for v2.4.7: winner-only match results.
   A Bracket or Round Robin match can be decided with NO score —
   "Or just pick the winner:" in the scoring sheet. Quick Score has
   no matches and never sees the option.

   a. Bracket: pick-winner buttons in the sheet; tapping one records
      a winner-only result and closes the sheet; the card shows the
      winner with a "won / no score" tag and NO numbers; a fully
      winner-only bracket crowns a champion; the finish screen's
      Match results and the shared results text use "X def. Y".
   b. Replacing a recorded SCORE with a winner-only result takes
      the two-step in-app confirm (first tap arms, second commits).
   c. Reopening a winner-only match shows "Winner: … — no score
      recorded"; tapping the other entry switches the winner in one
      tap; entering a score converts it back to a scored match.
   d. Round Robin: a winner-only win counts in the standings with
      0 points (a scored 9–0 winner outranks it on points); the
      player-view payload formats it "X def. Y" with no nulls.
   e. Quick Score: no pick-winner UI anywhere.
   f. Playoff: a winner-only playoff result locks the bracket and
      crowns the champion.
   g. A preset-RR walk-up regeneration keeps winner-only matches. */
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
  click($('#toSignup'), 'to signup');
  opts.players.forEach((name) => {
    $('#newName').value = name;
    click($('#addEntry'), 'add entry');
  });
  click($('#startBtn'), 'start game');
  return lastGame(w);
}
function openScorer(w, matchId) {
  click($(`[data-score="${matchId}"]`), 'open scorer ' + matchId);
}
function pickWinner(w, matchId, entryId) {
  openScorer(w, matchId);
  click($(`[data-mwin="${entryId}"]`), 'pick winner ' + entryId);
  return lastGame(w);
}
function scoreMatch(w, matchId, sa, sb) {
  openScorer(w, matchId);
  const a = $('#scA'), b = $('#scB');
  if (!a || !b) throw new Error('scorer inputs missing for ' + matchId);
  a.value = String(sa); b.value = String(sb);
  click($('#scSave'), 'save score');
  return lastGame(w);
}
function cardFor(matches, matchId) {
  const m = matches.find((x) => x.id === matchId);
  if (!m) return null;
  const label = 'M' + (matches.indexOf(m) + 1);
  return $$('.match').find((el) => {
    const s = el.querySelector('.sub');
    return s && s.textContent.trim() === label;
  }) || null;
}

/* ============ (a) bracket: pick the winner, no score ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'bracket', elim: 'single', scoreMode: 'total',
    players: ['Anna', 'Ben', 'Cleo', 'Dan'] });
  const sf1 = game.matches.find((m) => m.round === 1);
  const sf2 = game.matches.filter((m) => m.round === 1)[1];
  const fin = game.matches.find((m) => m.round === 2);

  openScorer(w, sf1.id);
  ok(bodyText(w).includes('Or just pick the winner:'), 'a: sheet offers "Or just pick the winner:"');
  ok($$(`[data-mwin]`).length === 2, 'a: one winner button per entry');
  ok(!!$(`[data-mwin="${sf1.aId}"]`) && !!$(`[data-mwin="${sf1.bId}"]`), 'a: buttons carry the two entry ids');

  click($(`[data-mwin="${sf1.aId}"]`), 'pick the winner (sheet already open)');
  game = lastGame(w);
  const m1 = game.matches.find((m) => m.id === sf1.id);
  ok(m1.winnerOnly === true && m1.scored === true && m1.sa === null && m1.sb === null,
    'a: state — winner-only, decided, no score');
  ok(m1.winnerId === sf1.aId && m1.loserId === sf1.bId, 'a: winner/loser recorded');
  ok(!$('#scorerBox'), 'a: sheet closed after picking');
  let card = cardFor(game.matches, sf1.id);
  ok(card && card.textContent.includes('won') && card.textContent.includes('no score'),
    'a: card shows the won / no-score tags');
  ok(card && !card.textContent.includes('null'), 'a: card shows no "null"');
  ok(card && !card.querySelector('.score'), 'a: card shows no score numbers');
  ok(card && card.querySelector('[data-score]').textContent.includes('Edit result'),
    'a: reopen button reads "Edit result" for a winner-only match');
  card = cardFor(game.matches, fin.id);
  ok(card && card.textContent.includes(nameOf(game, sf1.aId)),
    'a: the Final card names the winner-only winner right away');

  game = pickWinner(w, sf2.id, sf2.bId);
  const finState = game.matches.find((m) => m.id === fin.id);
  ok(finState.aId && finState.bId, 'a: Final participants set from winner-only feeders');
  game = pickWinner(w, fin.id, finState.aId);
  ok(bodyText(w).includes('Champion') && bodyText(w).includes(nameOf(game, finState.aId)),
    'a: champion banner crowns the winner-only champion');
  ok(!$('#finishBtn').disabled, 'a: Finish unlocks');

  click($('#finishBtn'), 'finish game');
  ok(bodyText(w).includes('Match results'), 'a: finish screen lists Match results');
  ok(new RegExp(nameOf(game, sf1.aId) + '.* def\\. ' + nameOf(game, sf1.bId)).test(bodyText(w)),
    'a: history detail renders the winner-only match as "X def. Y" (colors on: "X (Red) def. Y (Blue)")');
  click($('[data-share="copy"]'), 'copy results');
  ok(w.__cap.includes('Matches:'), 'a: shared results text has a Matches section');
  ok(w.__cap.includes(' def. '), 'a: shared results text contains "def." for the winner-only match');
  ok(!w.__cap.includes('null'), 'a: shared results text contains no "null"');
}

/* ============ (b) replacing a score takes two taps ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'bracket', elim: 'single', scoreMode: 'total',
    players: ['Anna', 'Ben', 'Cleo', 'Dan'] });
  const sf1 = game.matches.find((m) => m.round === 1);
  game = scoreMatch(w, sf1.id, 6, 2);
  let m = game.matches.find((x) => x.id === sf1.id);
  ok(m.winnerId === sf1.aId && !m.winnerOnly, 'b: scored win recorded first');

  openScorer(w, sf1.id);
  click($(`[data-mwin="${sf1.bId}"]`), 'first tap on the other winner button');
  game = lastGame(w);
  m = game.matches.find((x) => x.id === sf1.id);
  ok(m.winnerOnly === false && m.sa === 6 && m.sb === 2 && m.winnerId === sf1.aId,
    'b: first tap only arms — the recorded score is untouched');
  const armedBtn = $(`[data-mwin="${sf1.bId}"]`);
  ok(armedBtn && armedBtn.textContent.includes('Tap again'), 'b: armed button asks for a second tap');
  click(armedBtn, 'second tap confirms');
  game = lastGame(w);
  m = game.matches.find((x) => x.id === sf1.id);
  ok(m.winnerOnly === true && m.sa === null && m.winnerId === sf1.bId && m.loserId === sf1.aId,
    'b: second tap replaces the score with the winner-only result');
}

/* ============ (c) reopen: switch winner, then convert to a score ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'bracket', elim: 'single', scoreMode: 'total',
    players: ['Anna', 'Ben', 'Cleo', 'Dan'] });
  const sf1 = game.matches.find((m) => m.round === 1);
  game = pickWinner(w, sf1.id, sf1.aId);

  openScorer(w, sf1.id);
  ok(bodyText(w).includes('Winner:') && bodyText(w).includes('no score recorded'),
    'c: reopening shows who won with no score recorded');
  ok(bodyText(w).includes(nameOf(game, sf1.aId)), 'c: the banner names the current winner');
  click($(`[data-mwin="${sf1.bId}"]`), 'switch winner in one tap');
  game = lastGame(w);
  let m = game.matches.find((x) => x.id === sf1.id);
  ok(m.winnerOnly === true && m.winnerId === sf1.bId && m.loserId === sf1.aId,
    'c: winner switched with a single tap (no arm on a winner-only match)');

  game = scoreMatch(w, sf1.id, 5, 3);
  m = game.matches.find((x) => x.id === sf1.id);
  ok(m.winnerOnly === false && m.sa === 5 && m.sb === 3 && m.winnerId === sf1.aId,
    'c: entering a score converts back to a scored match (5 beats 3)');
}

/* ============ (d) round robin: standings + player view ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 1, scoreMode: 'total',
    players: ['Anna', 'Ben', 'Cleo', 'Dan'] });
  ok(game.matches.length === 2, 'd: one round of two matches');
  const [mA, mB] = game.matches;
  game = pickWinner(w, mA.id, mA.aId);            // winner-only win, 0 points
  game = scoreMatch(w, mB.id, 9, 0);              // scored win, 9 points
  const rows = $$('table.stand tr');
  const rowText = (i) => rows[i] ? rows[i].textContent : '';
  ok(rowText(1).includes(nameOf(game, mB.aId)) && rowText(1).includes('9'),
    'd: the scored 9–0 winner leads the standings on points');
  ok(rowText(2).includes(nameOf(game, mA.aId)), 'd: the winner-only winner is second (win, no points)');
  ok(bodyText(w).includes('Round robin complete.'), 'd: RR completes on a winner-only result');

  const payload = w.CruiseGameScoring.buildPlayerView(JSON.parse(JSON.stringify(game)));
  const matchRows = [];
  [payload.current, payload.upNext].forEach((sec) => { if (sec) sec.rows.forEach((r) => { if (r.aName !== undefined) matchRows.push(r); }); });
  ok(matchRows.some((r) => r.scoreText.includes(' def. ')),
    'd: player view formats the winner-only match as "X def. Y"');
  ok(matchRows.every((r) => !String(r.scoreText).includes('null') && !String(r.aName).includes('null') && !String(r.bName).includes('null')),
    'd: no player-view match string contains "null"');
  ok(matchRows.every((r) => r.scoreText !== '0 – 0'), 'd: no player-view match shows a fake 0 – 0 score');
}

/* ============ (e) Quick Score: no matches, no pick-winner ============ */
{
  const w = boot();
  setupGame(w, { format: 'quick', scoreMode: 'total', players: ['Anna', 'Ben'] });
  ok(!bodyText(w).includes('Or just pick the winner'), 'e: Quick Score never offers pick-the-winner');
  ok($$('[data-mwin]').length === 0, 'e: no winner buttons on the Quick Score screen');
}

/* ============ (f) playoff: winner-only result locks the bracket ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 1, scoreMode: 'total', playoff: '2',
    players: ['Ann', 'Bob', 'Cy', 'Dee'] });
  game.matches.slice().forEach((m) => { game = scoreMatch(w, m.id, 5, 1); });
  click($('#startPlayoffBtn'), 'start playoff');
  click($('#pfGenerateBtn'), 'generate bracket');
  game = lastGame(w);
  ok(game.playoffMatches && game.playoffMatches.length === 1, 'f: top-2 playoff is a single final');
  const pm = game.playoffMatches[0];
  game = pickWinner(w, pm.id, pm.aId);
  const pmAfter = game.playoffMatches[0];
  ok(pmAfter.winnerOnly === true && pmAfter.winnerId === pm.aId, 'f: playoff final decided winner-only');
  ok(bodyText(w).includes('Bracket locked — a playoff match has been scored.'),
    'f: a winner-only playoff result locks the bracket like a score does');
  ok(!$('#finishBtn').disabled, 'f: Finish unlocks with a winner-only playoff champion');
}

/* ============ (g) walk-up regeneration keeps winner-only matches ============ */
{
  const w = boot();
  let game = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 2, scoreMode: 'total',
    players: ['Ann', 'Bob', 'Cy', 'Dee'] });
  const m0 = game.matches[0];
  game = pickWinner(w, m0.id, m0.aId);
  $('#rrWalkName').value = 'Newbie';
  click($('#rrWalkAdd'), 'add walk-up');
  game = lastGame(w);
  const kept = game.matches.find((m) => m.id === m0.id);
  ok(!!kept, 'g: the winner-only match survives regeneration');
  ok(kept && kept.winnerOnly === true && kept.winnerId === m0.aId && kept.aId === m0.aId && kept.bId === m0.bId,
    'g: …with its pairing and winner untouched');
  ok(game.matches.some((m) => m.aId === game.entries[4].id || m.bId === game.entries[4].id),
    'g: the walk-up got scheduled into the rebuilt remainder');
}

console.log('\n' + checks + ' checks, ' + failures + ' failures');
if (failures) process.exit(1);
