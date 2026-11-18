/* DOM tests for v2.0.1: the sign-up screen explains why Start is
   disabled below the 2-entry minimum.
   a. Individuals: 0 entries → hint "Add at least 2 players to start"
      visible + Start disabled; 1 entry → still shown; 2 entries →
      hint gone + Start enabled; remove back to 1 → hint returns.
   b. Teams: the hint reads "Add at least 2 teams to start".
   The hint is updated by the same refresh() that sets the Start
   button's disabled state, so every entry path (manual add, roster
   toggles, copy-players, remove) keeps them in agreement. */
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
const click = (el, what) => { if (!el) throw new Error('missing element: ' + what); el.click(); };
const bodyText = (w) => w.document.body.textContent;
const hintShown = () => { const h = $('#startHint'); return !!h && !h.hidden; };
const hintText = () => { const h = $('#startHint'); return h ? h.textContent : null; };

function toSignup(w, kind) {
  click($('#newGameBtn'), 'new game');
  click($('[data-pick="builtin-soccer"]'), 'pick soccer');
  if (kind === 'teams') click($('#segKind button[data-v="teams"]'), 'teams kind');
  click($('#segMode button[data-v="total"]'), 'final-total scoring');
  click($('#toSignup'), 'to signup');
}
function addEntry(w, name) {
  $('#newName').value = name;
  click($('#addEntry'), 'add entry ' + name);
}

/* ============ (a) individuals: hint tracks the entry count ============ */
{
  const w = boot();
  toSignup(w, 'individuals');
  ok(bodyText(w).includes('Sign up players'), 'a: sign-up screen is for players');
  ok(!!$('#startHint'), 'a: hint element exists on the sign-up screen');
  ok(hintShown() && hintText() === 'Add at least 2 players to start',
    'a: 0 entries → players hint visible, got: ' + hintText());
  ok($('#startBtn').disabled === true, 'a: 0 entries → Start disabled');

  addEntry(w, 'Ana');
  ok(hintShown() && hintText() === 'Add at least 2 players to start', 'a: 1 entry → hint still visible');
  ok($('#startBtn').disabled === true, 'a: 1 entry → Start still disabled');

  addEntry(w, 'Ben');
  ok(!hintShown(), 'a: 2 entries → hint hidden');
  ok($('#startBtn').disabled === false, 'a: 2 entries → Start enabled');

  click($('[data-delentry="0"]'), 'remove an entry');
  ok(hintShown() && hintText() === 'Add at least 2 players to start', 'a: back to 1 entry → hint returns');
  ok($('#startBtn').disabled === true, 'a: back to 1 entry → Start disabled again');
}

/* ============ (b) teams: wording switches to teams ============ */
{
  const w = boot();
  toSignup(w, 'teams');
  ok(bodyText(w).includes('Sign up teams'), 'b: sign-up screen is for teams');
  ok(hintShown() && hintText() === 'Add at least 2 teams to start',
    'b: 0 teams → teams hint visible, got: ' + hintText());
  ok($('#startBtn').disabled === true, 'b: 0 teams → Start disabled');

  addEntry(w, 'Red Team');
  ok(hintShown() && hintText() === 'Add at least 2 teams to start', 'b: 1 team → hint still visible');
  addEntry(w, 'Blue Team');
  ok(!hintShown(), 'b: 2 teams → hint hidden');
  ok($('#startBtn').disabled === false, 'b: 2 teams → Start enabled');
}

console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
