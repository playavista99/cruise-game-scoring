/* End-to-end DOM tests for Edit players — rename, substitute, swap
   (v1.5). Drives the shipped index.html + config.js + engines.js +
   qr.js + app.js in jsdom, clicking the real buttons.
   Run: node tests/edit-players.test.mjs   (needs jsdom)

   Scenarios:
   a. Quick Score: rename a player mid-game (and change their color
      via the modal swatch) — leaderboard, finish screen and shared
      results text all show the new name.
   b. Round Robin: substitute after a scored match — the match keeps
      its score under the same entry id, standings show the new name,
      finish screen + results text record "Maria replaced John" /
      "Subs: Maria for John".
   c. Bracket: identity swap — two entries exchange name + color,
      match pairings and the scored result are unchanged, swap logged.
   d. Sign-up: inline name edit via the ✎ / name tap — Enter saves,
      an empty name reverts, blur saves.
   e. Edit players modal: an empty name on Save is rejected (hint
      shown, old name kept); an empty substitute name is rejected too. */
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
const entryByName = (g, name) => g.entries.find((e) => e.name === name);

function setupGame(w, opts) {
  click($('#newGameBtn'), 'new game');
  click($(`[data-pick="${opts.template || 'builtin-beanbag'}"]`), 'pick template');
  if (opts.format) click($(`#segFormat button[data-v="${opts.format}"]`), 'format seg');
  if (opts.scoreMode) click($(`#segMode button[data-v="${opts.scoreMode}"]`), 'score mode seg');
  if (opts.elim) click($(`#segElim button[data-v="${opts.elim}"]`), 'elim seg');
  if (opts.rrGames !== undefined) $('#rrGames').value = String(opts.rrGames);
  if (opts.pairing) click($(`#segPairing button[data-v="${opts.pairing}"]`), 'pairing seg');
  click($('#toSignup'), 'to signup');
  opts.players.forEach((name) => {
    $('#newName').value = name;
    click($('#addEntry'), 'add entry');
  });
  click($('#startBtn'), 'start game');
  return lastGame(w);
}
function setTotal(w, entryId, val) {
  const inp = $(`[data-total="${entryId}"]`);
  if (!inp) throw new Error('total input missing for ' + entryId);
  inp.value = String(val);
  inp.dispatchEvent(new w.Event('change', { bubbles: true }));
}
function scoreMatch(w, matchId, sa, sb) {
  click($(`[data-score="${matchId}"]`), 'open scorer ' + matchId);
  const a = $('#scA'), b = $('#scB');
  if (!a || !b) throw new Error('scorer inputs missing for ' + matchId);
  a.value = String(sa); b.value = String(sb);
  click($('#scSave'), 'save score');
  return lastGame(w);
}
function openEditPlayers(w) {
  click($('#editPlayersBtn'), 'edit players button');
  if (!$('#epList')) throw new Error('edit players modal did not open');
}
function closeEditPlayers(w) { click($('#epDone'), 'edit players Done'); }
function copyResults(w) {
  w.__cap = '';
  click($('[data-share="copy"]'), 'copy results');
  return w.__cap;
}

/* ============ (a) Quick Score: rename + recolor mid-game ============ */
{
  const w = boot();
  let g = setupGame(w, { format: 'quick', scoreMode: 'total', players: ['John', 'Paul'] });
  const john = entryByName(g, 'John');
  setTotal(w, john.id, 10);
  setTotal(w, entryByName(g, 'Paul').id, 4);
  g = lastGame(w);
  ok(g.entries.find((e) => e.id === john.id).total === 10, 'a: John has 10 before the rename');

  openEditPlayers(w);
  ok($$('#epList [data-epname]').length === 2, 'a: modal lists both players');
  const nameInp = $(`[data-epname="${john.id}"]`);
  nameInp.value = 'Johnny';
  click($(`[data-epsave="${john.id}"]`), 'save renamed row');
  g = lastGame(w);
  ok(entryByName(g, 'Johnny') && entryByName(g, 'Johnny').id === john.id, 'a: rename saved under the same entry id');
  ok(bodyText(w).includes('Johnny'), 'a: leaderboard behind the modal already shows Johnny');

  // Recolor via the row swatch: picker opens, pick Green, modal reopens.
  click($(`[data-epcolor="${john.id}"]`), 'row color swatch');
  ok(!!$('[data-pickcolor="Green"]'), 'a: color picker opened from the modal');
  click($('[data-pickcolor="Green"]'), 'pick Green');
  g = lastGame(w);
  ok(entryByName(g, 'Johnny').color === 'Green', 'a: color changed to Green, got ' + entryByName(g, 'Johnny').color);
  ok(!!$('#epList'), 'a: edit players modal reopened after the color pick');
  closeEditPlayers(w);
  ok(!$('#epList'), 'a: modal closed after Done');

  click($('#finishBtn'), 'finish game');
  ok(bodyText(w).includes('Johnny'), 'a: finish screen shows Johnny');
  const txt = copyResults(w);
  ok(txt.includes('Winner: Johnny (Green)'), 'a: results text winner is Johnny (Green), got: ' + txt.split('\n')[2]);
  ok(txt.includes('1. Johnny (Green)'), 'a: results text standings show Johnny');
}

/* ============ (b) Round Robin: substitute after a scored match ============ */
{
  const w = boot();
  let g = setupGame(w, { format: 'rr', pairing: 'preset', rrGames: 1, scoreMode: 'total', players: ['John', 'Paul', 'Ringo', 'George'] });
  const m0 = g.matches[0];
  const johnId = m0.aId;
  const johnName = g.entries.find((e) => e.id === johnId).name;
  g = scoreMatch(w, m0.id, 5, 2);
  ok(g.matches[0].scored && g.matches[0].sa === 5, 'b: first match scored 5-2');

  openEditPlayers(w);
  click($(`[data-epsub="${johnId}"]`), 'replace with substitute');
  ok(!!$('#epSubName'), 'b: substitute form opened');
  ok(bodyText(w).includes('takes over'), 'b: substitute form explains the takeover');
  $('#epSubName').value = 'Maria';
  $('#epSubCabin').value = '77';
  click($('#epSubConfirm'), 'confirm substitute');
  g = lastGame(w);
  const maria = g.entries.find((e) => e.id === johnId);
  ok(maria && maria.name === 'Maria' && maria.cabin === '77', 'b: substitute took over the entry (same id, new name + cabin)');
  const kept = g.matches.find((m) => m.id === m0.id);
  ok(kept.scored && kept.sa === 5 && kept.sb === 2 && kept.aId === johnId, 'b: scored match kept its score under the same entry id');
  ok(Array.isArray(g.subLog) && g.subLog.length === 1 && g.subLog[0].type === 'sub' &&
     g.subLog[0].oldName === johnName && g.subLog[0].newName === 'Maria' && !!g.subLog[0].at,
     'b: substitution logged with old/new names and a timestamp');
  closeEditPlayers(w);
  ok(bodyText(w).includes('Maria'), 'b: standings show Maria');

  // Play out the rest and finish.
  g = lastGame(w);
  g.matches.filter((m) => !m.scored).forEach((m) => { g = scoreMatch(w, m.id, 4, 1); });
  click($('#finishBtn'), 'finish game');
  ok(bodyText(w).includes('Maria replaced ' + johnName), 'b: finish screen records the substitution');
  const txt = copyResults(w);
  ok(txt.includes('Subs: Maria for ' + johnName), 'b: results text has the Subs line, got tail: ' + txt.trim().split('\n').pop());
}

/* ============ (c) Bracket: identity swap ============ */
{
  const w = boot();
  let g = setupGame(w, { format: 'bracket', elim: 'single', scoreMode: 'total', players: ['Anna', 'Beth', 'Cara', 'Dana'] });
  const beth = entryByName(g, 'Beth'), cara = entryByName(g, 'Cara');
  ok(beth.color === 'Blue' && cara.color === 'Green', 'c: starting colors Blue/Green, got ' + beth.color + '/' + cara.color);
  g = scoreMatch(w, g.matches[0].id, 7, 3);
  const scoredBefore = g.matches.find((m) => m.scored);
  ok(!!scoredBefore, 'c: one bracket match scored before the swap');
  // Capture pairings AFTER scoring (scoring itself advances the winner).
  const pairingsBefore = g.matches.map((m) => m.id + ':' + m.aId + '|' + m.bId).join(',');

  openEditPlayers(w);
  click($(`[data-epswap="${beth.id}"]`), 'swap identities');
  ok(!!$('#epSwapSel') && !!$('#epSwapConfirm'), 'c: swap picker + confirm shown');
  $('#epSwapSel').value = cara.id;
  click($('#epSwapConfirm'), 'confirm swap');
  g = lastGame(w);
  const slotB = g.entries.find((e) => e.id === beth.id);
  const slotC = g.entries.find((e) => e.id === cara.id);
  ok(slotB.name === 'Cara' && slotB.color === 'Green', 'c: Beth’s slot now holds Cara with Green, got ' + slotB.name + '/' + slotB.color);
  ok(slotC.name === 'Beth' && slotC.color === 'Blue', 'c: Cara’s slot now holds Beth with Blue, got ' + slotC.name + '/' + slotC.color);
  ok(g.matches.map((m) => m.id + ':' + m.aId + '|' + m.bId).join(',') === pairingsBefore, 'c: match pairings unchanged by the swap');
  const scoredAfter = g.matches.find((m) => m.id === scoredBefore.id);
  ok(scoredAfter.scored && scoredAfter.sa === 7 && scoredAfter.sb === 3 && scoredAfter.winnerId === scoredBefore.winnerId,
     'c: scored result unchanged by the swap');
  ok(Array.isArray(g.subLog) && g.subLog.length === 1 && g.subLog[0].type === 'swap' &&
     g.subLog[0].aName === 'Beth' && g.subLog[0].bName === 'Cara', 'c: swap logged as a swap, not a sub');
  closeEditPlayers(w);
}

/* ============ (d) Sign-up: inline name edit ============ */
{
  const w = boot();
  click($('#newGameBtn'), 'new game');
  click($('[data-pick="builtin-beanbag"]'), 'pick template');
  click($('#toSignup'), 'to signup');
  $('#newName').value = 'Jonh';
  click($('#addEntry'), 'add entry');
  $('#newName').value = 'Paul';
  click($('#addEntry'), 'add entry');
  ok(bodyText(w).includes('Jonh'), 'd: typo name listed');

  click($('[data-nameedit="0"]'), 'tap name to edit');
  const inp = $('[data-nameinput="0"]');
  ok(!!inp && inp.value === 'Jonh', 'd: inline input opened with the current name');
  inp.value = 'John';
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(!$('[data-nameinput="0"]') && bodyText(w).includes('1. John'), 'd: Enter saved the corrected name');

  // Empty name reverts.
  click($('[data-nameedit="0"]'), 'edit again');
  const inp2 = $('[data-nameinput="0"]');
  inp2.value = '   ';
  inp2.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(bodyText(w).includes('1. John'), 'd: empty name reverted to John');

  // Blur saves too.
  click($('[data-nameedit="1"]'), 'edit second row');
  const inp3 = $('[data-nameinput="1"]');
  inp3.value = 'Paulo';
  inp3.dispatchEvent(new w.Event('blur'));
  ok(bodyText(w).includes('2. Paulo'), 'd: blur saved the second rename');
}

/* ============ (e) Edit players modal: empty names rejected ============ */
{
  const w = boot();
  let g = setupGame(w, { format: 'quick', scoreMode: 'total', players: ['John', 'Paul'] });
  const john = entryByName(g, 'John');
  openEditPlayers(w);
  const nameInp = $(`[data-epname="${john.id}"]`);
  nameInp.value = '';
  click($(`[data-epsave="${john.id}"]`), 'save with empty name');
  g = lastGame(w);
  ok(entryByName(g, 'John') && entryByName(g, 'John').id === john.id, 'e: empty rename rejected, John kept');
  const hint = $(`[data-ephint="${john.id}"]`);
  ok(hint && !hint.classList.contains('hidden'), 'e: inline hint shown for the empty name');
  ok(nameInp.value === 'John', 'e: input restored to the old name');

  // Empty substitute name is rejected too, and nothing is logged.
  click($(`[data-epsub="${john.id}"]`), 'open substitute form');
  click($('#epSubConfirm'), 'confirm with empty substitute name');
  g = lastGame(w);
  ok(entryByName(g, 'John') && !(g.subLog && g.subLog.length), 'e: empty substitute rejected, nothing logged');
  ok($('#epSubHint') && !$('#epSubHint').classList.contains('hidden'), 'e: substitute hint shown');
  closeEditPlayers(w);
}

console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
