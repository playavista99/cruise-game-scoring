/* End-to-end DOM tests for v2.3: the LIVE player view.
   a. buildPlayerView payloads for Quick Score, Round Robin and
      Bracket games — sections populated, feeder labels in upNext.
   b. SANITIZATION (hard privacy rule): individuals publish as
      first names only, teams as team names with NO member names,
      and cabin numbers never appear — checked on the payload AND
      on the body actually pushed to Supabase.
   c. Share flow with a stubbed fetch: start sharing creates a
      12-char code + upserts with a ~24h expiry; a score change
      triggers another (debounced) upsert; stop sharing issues the
      DELETE and clears game.share; a failed push says so plainly
      and leaves scoring fully functional.
   d. view.html (the standalone player page): renders a payload's
      standings / current / up-next; a null payload (and a missing
      code) shows the unavailable message. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { ({ JSDOM } = createRequire('/tmp/qsr-test/package.json')('jsdom')); }

const DIR = new URL('..', import.meta.url).pathname;
const html = readFileSync(DIR + 'index.html', 'utf8');
const viewHtml = readFileSync(DIR + 'view.html', 'utf8');
const scripts = ['config.js', 'engines.js', 'qr.js', 'app.js'].map((f) => readFileSync(DIR + f, 'utf8'));

let failures = 0, checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('FAIL:', msg); }
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 25));

let W = null;
function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(html, { url: 'https://playavista99.github.io/cruise-game-scoring/', runScripts: 'outside-only' });
  const w = dom.window;
  w.confirm = () => true;
  w.alert = () => {};
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};
  w.__calls = [];
  w.fetch = (url, fetchOpts) => {
    const call = { url: String(url), opts: fetchOpts || {}, method: (fetchOpts && fetchOpts.method) || 'GET' };
    try { call.body = fetchOpts && fetchOpts.body ? JSON.parse(fetchOpts.body) : null; } catch (e) { call.body = null; }
    w.__calls.push(call);
    if (opts.fetchImpl) return opts.fetchImpl(call, w);
    if (call.url.indexOf('/rest/v1/shared_views') !== -1) return Promise.resolve({ ok: true, status: 201 });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: '2.3' }) });
  };
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
const pushes = (w) => w.__calls.filter((c) => c.method === 'POST' && c.url.indexOf('/rest/v1/shared_views') !== -1);
const deletes = (w) => w.__calls.filter((c) => c.method === 'DELETE' && c.url.indexOf('/rest/v1/shared_views') !== -1);
const payloadOf = (w, g) => w.CruiseGameScoring.buildPlayerView(JSON.parse(JSON.stringify(g)));

function setupGame(w, opts) {
  click($('#newGameBtn'), 'new game');
  click($(`[data-pick="${opts.template || 'builtin-beanbag'}"]`), 'pick template');
  if (opts.format) click($(`#segFormat button[data-v="${opts.format}"]`), 'format seg');
  if (opts.kind) click($(`#segKind button[data-v="${opts.kind}"]`), 'kind seg');
  if (opts.scoreMode) click($(`#segMode button[data-v="${opts.scoreMode}"]`), 'score mode seg');
  if (opts.elim) click($(`#segElim button[data-v="${opts.elim}"]`), 'elim seg');
  if (opts.rrGames !== undefined) $('#rrGames').value = String(opts.rrGames);
  if (opts.pairing) click($(`#segPairing button[data-v="${opts.pairing}"]`), 'pairing seg');
  click($('#toSignup'), 'to signup');
  opts.players.forEach((p) => {
    $('#newName').value = p.name;
    const cab = $('#newCabin');
    if (cab) cab.value = p.cabin || '';
    const mem = $('#newMembers');
    if (mem) mem.value = p.members || '';
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

/* ============ (a)+(b) Quick Score payload + sanitization ============ */
{
  const w = boot();
  const g = setupGame(w, {
    template: 'builtin-soccer', scoreMode: 'total',
    players: [
      { name: 'Maria Gonzalez', cabin: 'A523' },
      { name: 'Ana Lee', cabin: 'B101' },
      { name: 'Bob Ray', cabin: '' }
    ]
  });
  const [maria, ana, bob] = g.entries;
  setTotal(w, maria.id, 30);
  setTotal(w, ana.id, 20);
  setTotal(w, bob.id, 10);
  const p = payloadOf(w, lastGame(w));
  ok(p.v === 1 && p.status === 'playing' && p.format === 'Quick Score', 'a: QS payload meta (v/status/format)');
  ok(typeof p.updatedTime === 'string' && p.updatedTime.length > 0 && !!p.updatedAt, 'a: QS payload carries update stamps');
  ok(p.standings.length === 3, 'a: QS standings has all 3 entries');
  ok(p.standings[0].name === 'Maria' && p.standings[0].scoreText === '30 pts', 'a: QS leader is Maria with 30 pts, got ' + JSON.stringify(p.standings[0]));
  ok(p.standings[1].name === 'Ana' && p.standings[2].name === 'Bob', 'a: QS standings order + first names');
  ok(p.current === null && p.upNext === null, 'a: classic QS has no current/up-next sections');
  const s = JSON.stringify(p);
  ok(s.indexOf('Gonzalez') === -1 && s.indexOf('Lee') === -1 && s.indexOf('Ray') === -1, 'b: no surnames anywhere in the QS payload');
  ok(s.indexOf('A523') === -1 && s.indexOf('B101') === -1, 'b: no cabin numbers anywhere in the QS payload');
  ok(s.indexOf('cabin') === -1, 'b: the word cabin never appears in the payload');
}

/* ============ (b) Teams: team name yes, member names never ============ */
{
  const w = boot();
  const g = setupGame(w, {
    template: 'builtin-soccer', scoreMode: 'total', kind: 'teams',
    players: [
      { name: 'Sea Lions', members: 'Zoe Zephyr, Quinn Quasar' },
      { name: 'Wave Riders', members: 'Uma Underwood' }
    ]
  });
  ok(g.entryKind === 'teams' && g.entries[0].members.indexOf('Zephyr') !== -1, 'b: setup sanity — members exist on the device game');
  setTotal(w, g.entries[0].id, 7);
  const s = JSON.stringify(payloadOf(w, lastGame(w)));
  ok(s.indexOf('Sea Lions') !== -1 && s.indexOf('Wave Riders') !== -1, 'b: team names publish as-is');
  ok(s.indexOf('Zephyr') === -1 && s.indexOf('Quinn') === -1 && s.indexOf('Zoe') === -1 && s.indexOf('Underwood') === -1 && s.indexOf('Uma') === -1,
    'b: NO team member names (first or last) in the payload');
}

/* ============ (a) Round Robin payload ============ */
{
  const w = boot();
  let g = setupGame(w, {
    format: 'rr', pairing: 'preset', rrGames: 2, scoreMode: 'total',
    players: [{ name: 'Pete One' }, { name: 'Paul Two' }, { name: 'Mary Three' }, { name: 'John Four' }]
  });
  const r1 = g.matches.filter((m) => m.round === 1);
  ok(r1.length === 2, 'a: RR setup sanity — 2 matches in round 1, got ' + r1.length);
  g = scoreMatch(w, r1[0].id, 5, 2);
  const p = payloadOf(w, g);
  ok(p.standings.length === 4, 'a: RR standings has all 4 entries');
  ok(p.standings[0].w === 1 && p.standings[0].l === 0, 'a: RR leader has W1 L0');
  ok(p.standings[0].pointsText === '5 pts' && p.standings[0].diffText === '+3', 'a: RR leader points/diff text, got ' + p.standings[0].pointsText + ' / ' + p.standings[0].diffText);
  ok(p.standings[0].name === 'Pete' || p.standings[0].name === 'Mary' || p.standings[0].name === 'Paul' || p.standings[0].name === 'John',
    'a: RR standings names are first names only, got ' + p.standings[0].name);
  ok(!!p.current && p.current.label === 'Round 1' && p.current.rows.length === 2, 'a: RR current is Round 1 with both matches');
  ok(p.current.rows[0].scoreText === '5 – 2' && p.current.rows[0].status === 'Final', 'a: RR scored match shows its score as Final');
  ok(p.current.rows[1].scoreText === '' && p.current.rows[1].status === '', 'a: RR unscored match shows no score yet');
  ok(!!p.upNext && p.upNext.label === 'Round 2' && p.upNext.rows.length === 2, 'a: RR up next is Round 2 with its fixtures');
  const s = JSON.stringify(p);
  ok(s.indexOf('One') === -1 && s.indexOf('Three') === -1 && s.indexOf('Four') === -1, 'b: no surnames in the RR payload');
}

/* ============ (a) Bracket payload: current + feeder labels ============ */
{
  const w = boot();
  let g = setupGame(w, {
    format: 'bracket', elim: 'single', scoreMode: 'total',
    players: [{ name: 'Al One' }, { name: 'Bo Two' }, { name: 'Cy Three' }, { name: 'Di Four' }]
  });
  let p = payloadOf(w, g);
  ok(p.standings.length === 0, 'a: bracket payload has no standings table');
  ok(!!p.current && p.current.label === 'Semifinals' && p.current.rows.length === 2, 'a: bracket current is the Semifinals, got ' + (p.current && p.current.label));
  ok(!!p.upNext && p.upNext.rows.length === 1, 'a: bracket up next is the Final');
  ok(p.upNext.rows[0].aName === 'Winner of Semifinal 1' && p.upNext.rows[0].bName === 'Winner of Semifinal 2',
    'a: undecided final slots carry feeder labels, got ' + p.upNext.rows[0].aName + ' / ' + p.upNext.rows[0].bName);
  const sf1 = g.matches.find((m) => m.round === 1);
  g = scoreMatch(w, sf1.id, 5, 3);
  p = payloadOf(w, g);
  const sf1After = g.matches.find((m) => m.id === sf1.id);
  const winnerFirst = g.entries.find((e) => e.id === sf1After.winnerId).name.split(' ')[0];
  ok(p.upNext.rows[0].aName === winnerFirst || p.upNext.rows[0].bName === winnerFirst,
    'a: once decided, the final slot shows the winner\u2019s first name, got ' + p.upNext.rows[0].aName + ' / ' + p.upNext.rows[0].bName);
  const s = JSON.stringify(p);
  ok(s.indexOf('One') === -1 && s.indexOf('Two') === -1 && s.indexOf('Three') === -1 && s.indexOf('Four') === -1,
    'b: no surnames in the bracket payload (feeder labels carry stage names only)');
}

/* ============ (c) Share flow: start, live push, stop ============ */
{
  const w = boot();
  const g = setupGame(w, {
    template: 'builtin-soccer', scoreMode: 'total',
    players: [{ name: 'Maria Gonzalez', cabin: 'A523' }, { name: 'Ana Lee', cabin: '' }]
  });
  setTotal(w, g.entries[0].id, 30);
  ok(!lastGame(w).share, 'c: game starts unshared');
  click($('#playerViewBtn'), 'open player view sheet');
  ok(!!$('#pvStart') && bodyText(w).includes('Only first names are shown'), 'c: sheet explains first-names-only before sharing');
  click($('#pvStart'), 'start sharing');
  await tick(80);
  const shared = lastGame(w);
  ok(!!shared.share && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/.test(shared.share.code),
    'c: start sharing stores a 12-char unambiguous code, got ' + (shared.share && shared.share.code));
  ok(pushes(w).length === 1, 'c: start sharing upserts exactly once so far, got ' + pushes(w).length);
  const body = pushes(w)[0].body;
  ok(body.code === shared.share.code, 'c: upsert is targeted by the game\u2019s code');
  ok(body.payload.standings[0].name === 'Maria' && body.payload.standings[0].scoreText === '30 pts',
    'c: pushed payload carries the sanitized standings');
  const pushedStr = JSON.stringify(body);
  ok(pushedStr.indexOf('Gonzalez') === -1 && pushedStr.indexOf('A523') === -1, 'b: the PUSHED body is sanitized too');
  const span = new Date(body.expires_at).getTime() - new Date(body.updated_at).getTime();
  ok(span > 23.9 * 3600 * 1000 && span < 24.1 * 3600 * 1000, 'c: expiry is ~24h after the update, span ' + span + 'ms');
  ok(pushes(w)[0].opts.headers.Prefer.indexOf('merge-duplicates') !== -1, 'c: upsert uses merge-duplicates');
  ok(!!$('#pvQr') && !!$('#pvStop'), 'c: sharing sheet shows the QR and Stop sharing');
  ok(bodyText(w).includes('view.html?c=' + shared.share.code), 'c: sheet shows the player link with the code');
  ok(bodyText(w).includes('Live'), 'c: sheet shows a Live status after a successful push');
  // Let the start-time save()'s debounced push settle, then change a score.
  await tick(1300);
  const settled = pushes(w).length;
  setTotal(w, g.entries[1].id, 20);
  await tick(1300);
  ok(pushes(w).length > settled, 'c: a score change triggers another upsert (debounced)');
  ok(pushes(w)[pushes(w).length - 1].body.payload.standings[1].scoreText === '20 pts', 'c: the new push carries the new score');
  // Stop sharing: two-step.
  click($('#playerViewBtn'), 'reopen player view sheet');
  await tick(60);
  click($('#pvStop'), 'arm stop sharing');
  ok($('#pvStop').textContent === 'Confirm stop?', 'c: stop sharing arms first ("Confirm stop?")');
  ok(!!lastGame(w).share, 'c: an arming tap stops nothing');
  click($('#pvStop'), 'confirm stop sharing');
  await tick(60);
  ok(deletes(w).length === 1 && deletes(w)[0].url.indexOf('code=eq.' + shared.share.code) !== -1,
    'c: stop sharing issues the DELETE for the code');
  ok(!lastGame(w).share, 'c: game.share is cleared after stopping');
  ok(!$('#pvStop'), 'c: the sheet closes after stopping');
}

/* ============ (c) Failed push: plain message, scoring unaffected ============ */
{
  const w = boot({
    fetchImpl: (call) => {
      if (call.url.indexOf('/rest/v1/shared_views') !== -1) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: '2.3' }) });
    }
  });
  const g = setupGame(w, {
    template: 'builtin-soccer', scoreMode: 'total',
    players: [{ name: 'Maria Gonzalez' }, { name: 'Ana Lee' }]
  });
  click($('#playerViewBtn'), 'open player view sheet (failing network)');
  click($('#pvStart'), 'start sharing (failing network)');
  await tick(80);
  ok(bodyText(w).includes('Couldn\u2019t start sharing'), 'c: a failed first push says so plainly');
  ok(!lastGame(w).share, 'c: a failed start leaves the game unshared');
  setTotal(w, g.entries[0].id, 12);
  ok(lastGame(w).entries[0].total === 12, 'c: scoring still works and persists after the failed push');
}

/* ============ (a) Finished game: winner line + final standings ============ */
{
  const w = boot();
  const g = setupGame(w, {
    template: 'builtin-soccer', scoreMode: 'total',
    players: [{ name: 'Maria Gonzalez', cabin: 'A523' }, { name: 'Ana Lee', cabin: '' }]
  });
  setTotal(w, g.entries[0].id, 30);
  setTotal(w, g.entries[1].id, 20);
  click($('#finishBtn'), 'finish game');
  ok(!!$('#playerViewBtn'), 'a: the finish screen also offers Player view');
  const p = payloadOf(w, lastGame(w));
  ok(p.status === 'finished' && p.winner === '🏆 Winner: Maria', 'a: finished payload winner line is sanitized, got ' + p.winner);
  ok(p.standings.length === 2 && p.standings[0].scoreText === '30 pts', 'a: finished payload carries final standings');
  ok(JSON.stringify(p).indexOf('A523') === -1, 'b: finished payload has no cabin either');
}

/* ============ (d) view.html renders a payload ============ */
function bootView(url, fetchImpl) {
  const dom = new JSDOM(viewHtml, {
    url: url, runScripts: 'dangerously',
    beforeParse(w) {
      w.fetch = fetchImpl;
      w.scrollTo = () => {};
    }
  });
  return dom.window;
}
{
  const payload = {
    v: 1, title: 'Bean Bag Toss', format: 'Round Robin', cruise: 'Sky Princess — Nov 2026',
    status: 'playing', updatedAt: '2026-11-18T18:41:00.000Z', updatedTime: '2:41 PM', winner: null,
    standings: [
      { name: 'Maria', colorName: 'Red', colorHex: '#dc2626', scoreText: '1W–0L · 5 pts · +3', note: '', w: 1, l: 0, d: 0, played: 1, pointsText: '5 pts', diffText: '+3' },
      { name: 'Ana', colorName: 'Blue', colorHex: '#2563eb', scoreText: '0W–1L · 2 pts · -3', note: '', w: 0, l: 1, d: 0, played: 1, pointsText: '2 pts', diffText: '-3' }
    ],
    current: {
      label: 'Round 1', note: '', rows: [
        { aName: 'Maria', bName: 'Ana', scoreText: '5 – 2', status: 'Final' },
        { aName: 'Bob', bName: 'Cy', scoreText: '', status: '' }
      ]
    },
    upNext: { label: 'Up next', note: 'Next round is paired from the standings when this round finishes.', rows: [] }
  };
  const w = bootView('https://playavista99.github.io/cruise-game-scoring/view.html?c=TESTCODE1234',
    () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) }));
  await tick(60);
  const t = w.document.body.textContent;
  ok(t.includes('Bean Bag Toss') && t.includes('Sky Princess — Nov 2026'), 'd: view renders title + cruise');
  ok(t.includes('LIVE') && t.includes('2:41 PM'), 'd: view shows the LIVE updated line');
  ok(t.includes('Standings') && t.includes('Maria') && t.includes('1W–0L · 5 pts · +3'), 'd: view renders the standings rows');
  ok(t.includes('Round 1') && t.includes('5 – 2') && t.includes('Final'), 'd: view renders the current round with scores');
  ok(t.includes('Next round is paired from the standings when this round finishes.'), 'd: view renders the up-next note');
  ok(w.document.getElementById('unavailable').classList.contains('hidden'), 'd: unavailable stays hidden for a good payload');
}
{
  const w = bootView('https://playavista99.github.io/cruise-game-scoring/view.html?c=TESTCODE1234',
    () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(null) }));
  await tick(60);
  const t = w.document.body.textContent;
  ok(t.includes('player view isn\u2019t available'), 'd: a null payload shows the unavailable message');
  ok(!w.document.getElementById('unavailable').classList.contains('hidden'), 'd: unavailable block is visible for null');
}
{
  const w = bootView('https://playavista99.github.io/cruise-game-scoring/view.html',
    () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(null) }));
  await tick(60);
  ok(w.document.body.textContent.includes('player view isn\u2019t available'), 'd: a missing code shows the unavailable message');
}

console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
