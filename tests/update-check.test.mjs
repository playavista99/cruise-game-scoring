/* End-to-end DOM tests for v1.9: the menu's in-app update check.
   a. Remote version == current: "You're up to date ✓", no Update button.
   b. Remote version newer (2.5 vs the running 2.4.7): update-available
      status + Update button; clicking
      it clears only the cgsa-shell caches, sets the just-updated flag,
      and reloads. A second pass with a waiting service worker checks
      registration.update() + the SKIP_WAITING message + reload on
      controllerchange.
   c. Fetch rejects (offline): soft "can't check" status, no Update.
   d. Opening the menu triggers an automatic check.
   e. Version-compare units: equal, patch, minor, 1.10 > 1.9.
   f. Just-updated flag: after a reload, a check that confirms
      current == remote shows the "Updated" status once and clears it.
   g. (v2.4.3) Checking state: while a check is in flight the status
      reads "Checking for updates…", the Check button is disabled,
      and the progress bar is visible; all restore when it lands.
   h. (v2.4.3) Updating state: tapping Update now stores the target
      version in sessionStorage and sets the visible updating UI —
      disabled "Updating…" button, "Updating to v…" status, progress
      bar — and the state persists until the reload.
   i. (v2.4.3) Startup banner, target stored and reached: Home shows
      "✓ Updated to v…", the flag + target are cleared, tap dismisses.
   j. (v2.4.3) Startup banner, target stored but NOT reached: Home
      shows the "didn't finish" warning naming the running version.
   k. (v2.4.3) Startup banner, LEGACY (flag, no target): a startup
      check with remote == running shows the success banner.
   l. (v2.4.3) Legacy with a newer remote: "didn't finish" banner.
   m. (v2.4.3) Legacy with a failed check (offline): NO banner, and
      the flag is cleared. */
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
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 25));

function jsonResponse(data) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

let W = null;
function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(html, { url: 'https://playavista99.github.io/cruise-game-scoring/', runScripts: 'outside-only' });
  const w = dom.window;
  w.confirm = () => true;
  w.alert = () => {};
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};
  w.__fetchCalls = [];
  w.fetch = (url, fetchOpts) => {
    w.__fetchCalls.push({ url: String(url), opts: fetchOpts || {} });
    if (opts.fetchImpl) return opts.fetchImpl(url, fetchOpts, w);
    return Promise.resolve(jsonResponse({ version: '2.4.7' }));
  };
  w.__reloadCalls = 0;
  w.__cgsaReload = () => { w.__reloadCalls++; };
  if (opts.cacheKeys) {
    w.__deletedCaches = [];
    const keys = opts.cacheKeys.slice();
    w.caches = {
      keys: () => Promise.resolve(keys.slice()),
      delete: (name) => { w.__deletedCaches.push(name); return Promise.resolve(true); }
    };
  }
  if (opts.serviceWorker) {
    Object.defineProperty(w.navigator, 'serviceWorker', { value: opts.serviceWorker, configurable: true });
  }
  if (opts.justUpdated) w.sessionStorage.setItem('cgsa-just-updated', '1');
  if (opts.updateTarget) w.sessionStorage.setItem('cgsa-update-target', opts.updateTarget);
  scripts.forEach((s) => w.eval(s));
  W = w;
  return w;
}
const $ = (sel) => W.document.querySelector(sel);
const click = (el, what) => { if (!el) throw new Error('missing element: ' + what); el.click(); };
const status = () => $('#updateStatus').textContent;
const updateHidden = () => $('#updateNowBtn').classList.contains('hidden');

/* ============ (e) version-compare units ============ */
{
  const w = boot();
  const cmp = w.CruiseGameScoring.compareVersions;
  ok(w.CruiseGameScoring.APP_VERSION === '2.4.7', 'e: APP_VERSION is 2.4.7');
  ok($('#menuVersionText').textContent === 'Version 2.4.7', 'e: menu version line is rewritten from APP_VERSION');
  ok(cmp('1.9', '1.9') === 0, 'e: equal versions compare 0');
  ok(cmp('1.8.1', '1.9') < 0 && cmp('1.9', '1.8.1') > 0, 'e: patch-level compare works');
  ok(cmp('1.10', '1.9') > 0 && cmp('1.9', '1.10') < 0, 'e: 1.10 > 1.9 (tuple compare, not string/float)');
  ok(cmp('2', '1.99') > 0 && cmp('1.9.0', '1.9') === 0, 'e: missing components count as 0');
}

/* ============ (d) + (a) menu open auto-checks; up to date ============ */
{
  const w = boot();
  ok(w.__fetchCalls.length === 0, 'd: no version fetch before the menu opens');
  click($('#menuBtn'), 'open menu');
  await tick(40);
  ok(w.__fetchCalls.length === 1, 'd: opening the menu triggered exactly one check');
  ok(w.__fetchCalls[0].url.indexOf('version.json?cb=') === 0, 'd: check fetches version.json with a cache-buster, got ' + w.__fetchCalls[0].url);
  ok(w.__fetchCalls[0].opts.cache === 'no-store', 'd: check fetch uses cache: no-store');
  ok(status() === "You're up to date ✓", 'a: equal remote shows up-to-date, got: ' + status());
  ok(updateHidden(), 'a: Update button stays hidden when up to date');
  ok($('#checkUpdatesBtn').disabled === false && $('#checkUpdatesBtn').textContent === 'Check for updates',
    'a: Check button restored after the check');
  // On-demand re-check via the button.
  click($('#checkUpdatesBtn'), 'manual check');
  await tick(40);
  ok(w.__fetchCalls.length === 2, 'a: Check button runs another check');
  ok(status() === "You're up to date ✓", 'a: still up to date after manual check');
}

/* ============ (b) newer remote: Update button, cache clear, reload ============ */
{
  const w = boot({
    fetchImpl: () => Promise.resolve(jsonResponse({ version: '2.5' })),
    cacheKeys: ['cgsa-shell-v21', 'cgsa-shell-v22', 'someone-elses-cache']
  });
  click($('#menuBtn'), 'open menu');
  await tick(40);
  ok(status() === 'Update available: v2.5', 'b: newer remote shows update status, got: ' + status());
  ok(!updateHidden(), 'b: Update button appears for a newer remote');
  click($('#updateNowBtn'), 'update now');
  await tick(60);
  ok(w.__deletedCaches.join(',') === 'cgsa-shell-v21,cgsa-shell-v22',
    'b: only cgsa-shell caches were deleted, got: ' + w.__deletedCaches.join(','));
  ok(w.__reloadCalls === 1, 'b: update reloaded the app exactly once (no service worker path)');
  ok(w.sessionStorage.getItem('cgsa-just-updated') === '1', 'b: just-updated flag set for the post-reload check');
}

/* ============ (b2) waiting service worker: update + SKIP_WAITING ============ */
{
  const calls = { update: 0, message: null };
  const listeners = {};
  const registration = {
    update: () => { calls.update++; return Promise.resolve(); },
    waiting: { postMessage: (msg) => { calls.message = msg; } }
  };
  const sw = {
    register: () => Promise.resolve(registration),
    getRegistration: () => Promise.resolve(registration),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener: (type, fn) => { if (listeners[type] === fn) delete listeners[type]; }
  };
  const w = boot({
    fetchImpl: () => Promise.resolve(jsonResponse({ version: '2.5' })),
    serviceWorker: sw,
    cacheKeys: ['cgsa-shell-v22']
  });
  click($('#menuBtn'), 'open menu');
  await tick(40);
  ok(status() === 'Update available: v2.5', 'b2: update available with a service worker, got: ' + status());
  click($('#updateNowBtn'), 'update now (sw)');
  await tick(60);
  ok(calls.update === 1, 'b2: registration.update() was called');
  ok(calls.message && calls.message.type === 'SKIP_WAITING', 'b2: waiting worker got the SKIP_WAITING message');
  ok(w.__deletedCaches.join(',') === 'cgsa-shell-v22', 'b2: shell cache cleared on the service-worker path too');
  ok(w.__reloadCalls === 0, 'b2: no reload before controllerchange (fallback timer still pending)');
  ok(typeof listeners.controllerchange === 'function', 'b2: controllerchange listener registered');
  listeners.controllerchange();
  ok(w.__reloadCalls === 1, 'b2: controllerchange reloaded the app');
  await tick(30);
  ok(w.__reloadCalls === 1, 'b2: reload happened exactly once');
}

/* ============ (c) offline: fetch rejects ============ */
{
  const w = boot({ fetchImpl: () => Promise.reject(new Error('offline')) });
  click($('#menuBtn'), 'open menu');
  await tick(40);
  ok(status() === "Can't check right now — you may be offline.", 'c: offline status shown, got: ' + status());
  ok(updateHidden(), 'c: no Update button when the check fails');
  ok($('#checkUpdatesBtn').disabled === false, 'c: Check button re-enabled after a failed check');
}

/* ============ (f) just-updated flag: confirmed once, then cleared ============ */
{
  const w = boot({ justUpdated: true });
  click($('#menuBtn'), 'open menu');
  await tick(40);
  ok(status() === "Updated — you're on the latest version ✓", 'f: post-update confirmation status, got: ' + status());
  ok(w.sessionStorage.getItem('cgsa-just-updated') === null, 'f: flag cleared after being shown');
  ok(updateHidden(), 'f: no Update button on the confirmation status');
}

/* ============ (g) checking state is visible while in flight ============ */
{
  let resolveCheck = null;
  const w = boot({
    fetchImpl: () => new Promise((res) => { resolveCheck = () => res(jsonResponse({ version: '2.4.7' })); })
  });
  click($('#menuBtn'), 'open menu');
  ok(status() === 'Checking for updates…', 'g: status shows checking while in flight, got: ' + status());
  ok($('#checkUpdatesBtn').disabled === true, 'g: Check button disabled while checking');
  ok(!$('#updateProgress').classList.contains('hidden'), 'g: progress bar visible while checking');
  await tick(10);
  ok(status() === 'Checking for updates…', 'g: still checking while the fetch is unresolved');
  resolveCheck();
  await tick(40);
  ok(status() === "You're up to date ✓", 'g: check lands on up-to-date, got: ' + status());
  ok($('#checkUpdatesBtn').disabled === false && $('#checkUpdatesBtn').textContent === 'Check for updates',
    'g: Check button restored after the check');
  ok($('#updateProgress').classList.contains('hidden'), 'g: progress bar hidden after the check');
}

/* ============ (h) updating state: UI + stored target ============ */
{
  const w = boot({
    fetchImpl: () => Promise.resolve(jsonResponse({ version: '2.5' })),
    cacheKeys: ['cgsa-shell-v22']
  });
  click($('#menuBtn'), 'open menu');
  await tick(40);
  ok(status() === 'Update available: v2.5', 'h: update available before tap, got: ' + status());
  click($('#updateNowBtn'), 'update now');
  ok($('#updateNowBtn').disabled === true, 'h: Update button disabled while updating');
  ok($('#updateNowBtn').textContent === 'Updating…', 'h: Update button relabeled, got: ' + $('#updateNowBtn').textContent);
  ok(status() === "Updating to v2.5 — the app will reload itself when it's ready. On a slow connection this can take a minute.",
    'h: status explains the update + reload, got: ' + status());
  ok(!$('#updateProgress').classList.contains('hidden'), 'h: progress bar visible while updating');
  ok(w.sessionStorage.getItem('cgsa-update-target') === '2.5', 'h: target version stored in sessionStorage');
  ok(w.sessionStorage.getItem('cgsa-just-updated') === '1', 'h: just-updated flag set alongside');
  await tick(60);
  ok(w.__reloadCalls === 1, 'h: update proceeded to its reload');
  ok($('#updateNowBtn').disabled === true && $('#updateNowBtn').textContent === 'Updating…',
    'h: updating state persists until the reload (not restored early)');
}

/* ============ (i) startup banner: target stored and reached ============ */
{
  const w = boot({ justUpdated: true, updateTarget: '2.4.7' });
  await tick(50);
  const banner = $('#updateBanner');
  ok(!!banner, 'i: Home shows the post-update banner');
  ok(banner && banner.textContent === '✓ Updated to v2.4.7', 'i: success banner text, got: ' + (banner && banner.textContent));
  ok(banner && banner.classList.contains('success'), 'i: banner uses the success style');
  ok(w.sessionStorage.getItem('cgsa-just-updated') === null, 'i: just-updated flag cleared');
  ok(w.sessionStorage.getItem('cgsa-update-target') === null, 'i: stored target cleared');
  click(banner, 'dismiss banner');
  ok($('#updateBanner') === null, 'i: banner dismisses on tap');
}

/* ============ (j) startup banner: target stored, not reached ============ */
{
  const w = boot({ justUpdated: true, updateTarget: '2.5' });
  await tick(50);
  const banner = $('#updateBanner');
  ok(!!banner, 'j: Home shows the post-update banner');
  ok(banner && banner.textContent === "The update didn't finish — you're still on v2.4.7. Check your connection, then try again from the ☰ menu.",
    'j: failure banner names the running version, got: ' + (banner && banner.textContent));
  ok(banner && banner.classList.contains('warning'), 'j: banner uses the warning style');
  ok(w.sessionStorage.getItem('cgsa-just-updated') === null, 'j: just-updated flag cleared');
  ok(w.sessionStorage.getItem('cgsa-update-target') === null, 'j: stored target cleared');
}

/* ============ (k) startup banner: legacy flag, remote == running ============ */
{
  const w = boot({ justUpdated: true });
  await tick(60);
  const banner = $('#updateBanner');
  ok(!!banner, 'k: legacy update still gets a Home banner');
  ok(banner && banner.textContent === '✓ Updated to v2.4.7', 'k: legacy success banner text, got: ' + (banner && banner.textContent));
  ok(w.sessionStorage.getItem('cgsa-just-updated') === null, 'k: legacy flag cleared after the banner decision');
}

/* ============ (l) startup banner: legacy flag, remote newer ============ */
{
  const w = boot({
    justUpdated: true,
    fetchImpl: () => Promise.resolve(jsonResponse({ version: '2.5' }))
  });
  await tick(60);
  const banner = $('#updateBanner');
  ok(!!banner, 'l: legacy update with a newer remote gets a banner');
  ok(banner && banner.textContent === "The update didn't finish — you're still on v2.4.7. Check your connection, then try again from the ☰ menu.",
    'l: legacy failure banner text, got: ' + (banner && banner.textContent));
  ok(banner && banner.classList.contains('warning'), 'l: legacy failure uses the warning style');
  ok(w.sessionStorage.getItem('cgsa-just-updated') === null, 'l: legacy flag cleared');
}

/* ============ (m) startup banner: legacy flag, check fails ============ */
{
  const w = boot({
    justUpdated: true,
    fetchImpl: () => Promise.reject(new Error('offline'))
  });
  await tick(60);
  ok($('#updateBanner') === null, 'm: no banner when the legacy startup check fails');
  ok(w.sessionStorage.getItem('cgsa-just-updated') === null, 'm: flag cleared even when the check fails');
}

console.log('\n' + checks + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
