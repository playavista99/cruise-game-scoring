/* End-to-end DOM tests for v2.1.1: the self-healing version guard.
   A phone that loads the app mid-deploy can cache a MIXED shell
   (new index.html + old app.js or the reverse), leaving rendered
   buttons dead. index.html carries <meta name="app-version"> as the
   pair-mate of app.js's APP_VERSION; on a mismatch the guard clears
   the cgsa-shell caches and reloads — at most once per session per
   version-pair (sessionStorage flag).
   a. meta == APP_VERSION: no deletion, no reload, no flag.
   b. meta "2.1" vs APP_VERSION "2.1.1": shell caches deleted,
      exactly one reload, heal flag set.
   c. Second boot, flag already set, meta still mismatched:
      no reload, no deletion (no loop).
   d. Meta absent entirely: treated as a mismatch — heals once. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { ({ JSDOM } = createRequire('/tmp/qsr-test/package.json')('jsdom')); }

const DIR = new URL('..', import.meta.url).pathname;
const htmlReal = readFileSync(DIR + 'index.html', 'utf8');
const htmlOldMeta = htmlReal.replace('content="2.1.1"', 'content="2.1"');
const htmlNoMeta = htmlReal.replace(/<meta name="app-version"[^>]*>\n/, '');
const scripts = ['config.js', 'engines.js', 'qr.js', 'app.js'].map((f) => readFileSync(DIR + f, 'utf8'));

let failures = 0, checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('FAIL:', msg); }
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 25));

let W = null;
function boot(html, opts) {
  opts = opts || {};
  const dom = new JSDOM(html, { url: 'https://playavista99.github.io/cruise-game-scoring/', runScripts: 'outside-only' });
  const w = dom.window;
  w.confirm = () => true;
  w.alert = () => {};
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: '2.1.1' }) });
  w.__reloadCalls = 0;
  w.__cgsaReload = () => { w.__reloadCalls++; };
  w.__deletedCaches = [];
  const keys = (opts.cacheKeys || []).slice();
  w.caches = {
    keys: () => Promise.resolve(keys.slice()),
    delete: (name) => { w.__deletedCaches.push(name); return Promise.resolve(true); }
  };
  if (opts.healFlag) w.sessionStorage.setItem(opts.healFlag, '1');
  scripts.forEach((s) => w.eval(s));
  W = w;
  return w;
}
const healKeys = (w) => Object.keys(w.sessionStorage).filter((k) => k.indexOf('cgs-heal-') === 0);

/* Fixture sanity: the variants really are what we think they are. */
ok(htmlOldMeta !== htmlReal && htmlOldMeta.indexOf('content="2.1"') !== -1, 'fixture: old-meta variant built');
ok(htmlNoMeta !== htmlReal && htmlNoMeta.indexOf('app-version') === -1, 'fixture: no-meta variant built');

/* ============ (a) matching meta: nothing happens ============ */
{
  const w = boot(htmlReal, { cacheKeys: ['cgsa-shell-v19', 'someone-elses-cache'] });
  await tick(60);
  const meta = w.document.querySelector('meta[name="app-version"]');
  ok(meta && meta.getAttribute('content') === '2.1.1', 'a: shipped index.html carries meta 2.1.1');
  ok(w.CruiseGameScoring.APP_VERSION === '2.1.1', 'a: APP_VERSION is 2.1.1');
  ok(w.__reloadCalls === 0, 'a: no reload when meta matches');
  ok(w.__deletedCaches.length === 0, 'a: no cache deletion when meta matches');
  ok(healKeys(w).length === 0, 'a: no heal flag written when meta matches');
}

/* ============ (b) stale meta: heal once ============ */
{
  const w = boot(htmlOldMeta, { cacheKeys: ['cgsa-shell-v18', 'cgsa-shell-v19', 'someone-elses-cache'] });
  await tick(60);
  ok(w.__deletedCaches.join(',') === 'cgsa-shell-v18,cgsa-shell-v19',
    'b: only cgsa-shell caches deleted, got: ' + w.__deletedCaches.join(','));
  ok(w.__reloadCalls === 1, 'b: exactly one reload, got: ' + w.__reloadCalls);
  ok(w.sessionStorage.getItem('cgs-heal-2.1|2.1.1') === '1', 'b: heal flag set for the version pair');
  ok(w.document.getElementById('menuVersionText').textContent === 'Version 2.1.1',
    'b: app still rendered before healing (guard runs after first render)');
}

/* ============ (c) flag already set: no second heal, no loop ============ */
{
  const w = boot(htmlOldMeta, {
    cacheKeys: ['cgsa-shell-v18', 'cgsa-shell-v19'],
    healFlag: 'cgs-heal-2.1|2.1.1'
  });
  await tick(60);
  ok(w.__reloadCalls === 0, 'c: no reload when the pair already healed this session');
  ok(w.__deletedCaches.length === 0, 'c: no cache deletion when the pair already healed');
}

/* ============ (d) meta absent: treated as mismatch, heals once ============ */
{
  const w = boot(htmlNoMeta, { cacheKeys: ['cgsa-shell-v19'] });
  await tick(60);
  ok(w.__deletedCaches.join(',') === 'cgsa-shell-v19', 'd: shell cache deleted when meta is absent');
  ok(w.__reloadCalls === 1, 'd: exactly one reload when meta is absent');
  ok(w.sessionStorage.getItem('cgs-heal-|2.1.1') === '1', 'd: heal flag set for the absent-meta pair');
}

console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
