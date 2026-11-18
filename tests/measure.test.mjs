/* End-to-end DOM tests for v2.2: camera photo measurement.
   The homography math itself is verified in engines.test.mjs; here
   the shipped app is driven through jsdom via the test seam
   (CruiseGameScoring.measureInjectPhoto / measureTap), which lands
   in the same functions the real file input and stage taps use —
   jsdom has no camera, file picker or layout geometry.

   Shared geometry: a 1000x1000 photo of a cornhole board (24x48in)
   photographed straight-on. Corners at fractions (.1,.1) (.9,.1)
   (.9,.9) (.1,.9) -> natural px (100,100)..(900,900), so
   planeX = (px-100)/800*24 and planeY = (py-100)/800*48.
     target (0.5,0.5)  -> plane (12, 24)
     ball A (0.55,0.5) -> plane (13.5, 24) -> 1.5in from target
     ball B (0.5,0.6)  -> plane (12, 30)   -> 6.0in from target
     pair (0.3,0.3)->(0.5,0.5): plane (6,12)->(12,24) = sqrt(180) = 13.416in */
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
const click = (el, what) => { if (!el) throw new Error('missing element: ' + what); el.click(); };
const state = (w) => JSON.parse(w.localStorage.getItem('cgsa-state-v1'));
const lastGame = (w) => { const g = state(w).games; return g[g.length - 1]; };
const bodyText = (w) => w.document.body.textContent;
const PHOTO = { dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', w: 1000, h: 1000 };
function calibrate(w) {
  [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]].forEach(([x, y]) => w.CruiseGameScoring.measureTap(x, y));
}
function addPlayers(w, names) {
  names.forEach((name) => {
    $('#newName').value = name;
    click($('#addEntry'), 'add entry ' + name);
  });
}

/* ============ (b) free measure tool ============ */
{
  const w = boot();
  ok(!!$('#measureBtn'), 'b: home has the Camera measure button');
  click($('#measureBtn'), 'open free measure');
  ok(bodyText(w).includes('Camera measure'), 'b: measure screen opens');
  ok(!!$('#measureFile'), 'b: photo phase offers the file input');
  ok(bodyText(w).includes('never saved'), 'b: explainer says the photo is never saved');
  w.CruiseGameScoring.measureInjectPhoto(PHOTO);
  const sess = () => w.CruiseGameScoring.measureState();
  ok(!!$('#measureStage'), 'b: stage renders after photo injection');
  ok($('#measureRefs [data-ref="cornhole"]').classList.contains('on'), 'b: cornhole is the default reference');
  ok(bodyText(w).includes('corner 1 of 4'), 'b: calibration prompts corner 1');
  calibrate(w);
  ok(!!sess().H, 'b: homography computed after the 4th corner');
  ok(sess().swapped === false, 'b: straight-on board is not flagged as swapped');
  // A (0.3,0.3) -> plane (6,12); B (0.5,0.5) -> plane (12,24): sqrt(180) = 13.416in
  w.CruiseGameScoring.measureTap(0.3, 0.3);
  ok(!!sess().pendingA, 'b: first tap sets point A');
  w.CruiseGameScoring.measureTap(0.5, 0.5);
  ok(sess().pairs.length === 1, 'b: second tap completes a measurement pair');
  ok(Math.abs(sess().pairs[0].dist - Math.sqrt(180)) < 0.05,
    'b: pair distance matches the geometry (got ' + sess().pairs[0].dist + ')');
  ok(bodyText(w).includes('1′ 1.4″'), 'b: readout shows the distance in feet/inches');
  click($('#measureUnits'), 'switch to centimetres');
  ok(bodyText(w).includes('34.1 cm'), 'b: units toggle converts the readout to cm');
  click($('#measureUnits'), 'switch back to inches');
  ok(bodyText(w).includes('1′ 1.4″'), 'b: units toggle converts back');
  // Second pair across the board's width: (0,0) -> (24,0) = 24in.
  w.CruiseGameScoring.measureTap(0.1, 0.1);
  w.CruiseGameScoring.measureTap(0.9, 0.1);
  ok(sess().pairs.length === 2 && Math.abs(sess().pairs[1].dist - 24) < 0.05, 'b: second pair measures the board width');
  ok(bodyText(w).includes('2′ 0.0″'), 'b: second readout shows 2 feet');
  click($('[data-delpair="0"]'), 'remove first pair');
  ok(sess().pairs.length === 1 && Math.abs(sess().pairs[0].dist - 24) < 0.05, 'b: removing a pair drops only that pair');
  click($('#navBackBtn'), 'back from free measure');
  ok(!!$('#newGameBtn'), 'b: Back from the free tool returns Home');
  ok(w.CruiseGameScoring.measureState() === null, 'b: leaving discards the measure session (and its photo)');
}

/* ============ (c) Closest Wins contest flow ============ */
{
  const w = boot();
  click($('#newGameBtn'), 'new game');
  click($('[data-pick="builtin-closest"]'), 'pick Closest Wins');
  ok(bodyText(w).includes('Scored by camera measurement'), 'c: setup explains camera scoring');
  ok(!$('#segMode'), 'c: setup has no score-entry segment for a measure game');
  ok(!$('#segFormat'), 'c: setup locks the format (no format segment)');
  ok(!$('#setupDefWrap'), 'c: setup hides the scoring-buttons editor');
  ok(bodyText(w).includes('Quick Score'), 'c: setup notes the locked Quick Score format');
  click($('#toSignup'), 'to signup');
  addPlayers(w, ['Ana', 'Ben', 'Cy']);
  click($('#startBtn'), 'start game');
  const game = lastGame(w);
  ok(game.scoreMode === 'measure' && game.format === 'quick' && game.def.winDir === 'low',
    'c: game is created as a low-wins Quick Score measure game');
  const [ana, ben, cy] = game.entries;
  ok(!!$('#measurePhotoBtn'), 'c: play screen offers Measure from a photo');
  ok((bodyText(w).match(/Not measured yet/g) || []).length === 3, 'c: all three entries start unmeasured');
  ok($('#finishBtn').disabled, 'c: Finish stays locked until someone is measured');

  // Type a distance for Cy by hand: 9.5 inches.
  click($(`[data-typedist="${cy.id}"]`), 'type distance for Cy');
  $('#tdInches').value = '9.5';
  click($('#tdSave'), 'save typed distance');
  ok(lastGame(w).entries.find((e) => e.id === cy.id).total === 9.5, 'c: typed distance is stored as the score');
  ok(bodyText(w).includes('9.5″'), 'c: play screen formats the typed distance');
  ok(!$('#finishBtn').disabled, 'c: Finish unlocks once a distance exists');

  // Photo round 1: measure Ana, then leave WITHOUT saving — the
  // game must not change.
  click($('#measurePhotoBtn'), 'open contest measure');
  ok(bodyText(w).includes('Closest Wins'), 'c: measure screen names the game being measured');
  w.CruiseGameScoring.measureInjectPhoto(PHOTO);
  calibrate(w);
  const sess = () => w.CruiseGameScoring.measureState();
  w.CruiseGameScoring.measureTap(0.5, 0.5); // target -> plane (12,24)
  ok(!!sess().target, 'c: target tap registers');
  w.CruiseGameScoring.measureTap(0.55, 0.5); // Ana's ball -> 1.5in away
  ok(!!sess().pendingBall, 'c: ball tap waits for assignment');
  ok(!!$(`[data-assign="${ana.id}"]`), 'c: assignment chips offer the unmeasured entries');
  click($(`[data-assign="${ana.id}"]`), 'assign ball to Ana');
  ok(Math.abs(sess().marks[ana.id].dist - 1.5) < 0.05, 'c: Ana’s measured distance is 1.5in (got ' + sess().marks[ana.id].dist + ')');
  click($('#navBackBtn'), 'leave without saving');
  ok(lastGame(w).entries.find((e) => e.id === ana.id).total === null, 'c: leaving without saving writes nothing');

  // Photo round 2: measure Ana and Ben, redo Ana once, then save.
  click($('#measurePhotoBtn'), 'reopen contest measure');
  w.CruiseGameScoring.measureInjectPhoto(PHOTO);
  calibrate(w);
  w.CruiseGameScoring.measureTap(0.5, 0.5); // target
  w.CruiseGameScoring.measureTap(0.55, 0.5); // Ana's ball
  click($(`[data-assign="${ana.id}"]`), 'assign Ana again');
  click($(`[data-redomark="${ana.id}"]`), 'redo Ana');
  ok(!sess().marks[ana.id], 'c: Redo clears an entry’s mark');
  w.CruiseGameScoring.measureTap(0.55, 0.5);
  click($(`[data-assign="${ana.id}"]`), 're-assign Ana');
  w.CruiseGameScoring.measureTap(0.5, 0.6); // Ben's ball -> 6.0in away
  click($(`[data-assign="${ben.id}"]`), 'assign Ben');
  ok(Math.abs(sess().marks[ben.id].dist - 6) < 0.05, 'c: Ben’s measured distance is 6in (got ' + sess().marks[ben.id].dist + ')');
  ok(bodyText(w).includes('1.5″') && bodyText(w).includes('6.0″'), 'c: measured list formats both distances');
  click($('#measureSave'), 'save distances');
  const saved = lastGame(w);
  ok(saved.entries.find((e) => e.id === ana.id).total === 1.5, 'c: saved score for Ana is 1.5');
  ok(saved.entries.find((e) => e.id === ben.id).total === 6, 'c: saved score for Ben is 6');
  ok(saved.entries.find((e) => e.id === cy.id).total === 9.5, 'c: Cy’s typed score survives the photo save');
  const bt = bodyText(w);
  ok(bt.includes('1. Ana') && bt.includes('2. Ben') && bt.includes('3. Cy') &&
    bt.indexOf('1. Ana') < bt.indexOf('2. Ben') && bt.indexOf('2. Ben') < bt.indexOf('3. Cy'),
    'c: leaderboard ranks the closest distance first');

  click($('#finishBtn'), 'finish game');
  ok(bodyText(w).includes('Ana'), 'c: finish screen names Ana');
  ok($('.winnerbanner .wname').textContent.includes('Ana'), 'c: Ana is crowned the winner');
  ok(bodyText(w).includes('1.5″') && bodyText(w).includes('6.0″') && bodyText(w).includes('9.5″'),
    'c: finish standings show all three distances formatted');
  const fin = lastGame(w);
  ok(fin.status === 'finished' && fin.winnerId === ana.id, 'c: the smallest distance wins the game');
}

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
