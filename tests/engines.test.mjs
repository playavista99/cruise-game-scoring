/* Engine tests for the Cruise Game Scoring App static port.
   Run: node tests/engines.test.mjs
   Covers the same checks the Muse prototype was verified against:
   - single-elim brackets n=2..16 resolve a champion, incl. byes
   - double-elim brackets n=4..16 resolve a champion, incl. byes
   - pre-set round robin: exact per-entry totals for fields 2..16 x
     games 1..14 (except the mathematically forced odd case, where one
     entry plays exactly one fewer), nobody twice in a round, and no
     repeat pairing inside the first everyone-plays-everyone cycle
   - results-based (Swiss): round 2 exists ONLY after the manual
     generate call, pairs standings-adjacent with no rematches in the
     6-player scenario (round-1 winners 1/3/5), totals stay exact */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../engines.js');

let failures = 0, checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('FAIL:', msg); }
}
const DEF = { winDir: 'high', attempts: 5, buttons: [{ label: 'Goal', points: 1 }, { label: 'Miss', points: 0 }] };
const ids = (n) => Array.from({ length: n }, (_, i) => 'P' + (i + 1));
const entries = (n) => ids(n).map((id) => ({ id, name: id }));

/* ---------- single elimination ---------- */
for (let n = 2; n <= 16; n++) {
  const es = ids(n);
  const matches = E.buildSingleElim(es);
  E.resolveBracket(DEF, matches);
  // Favorite (lowest seed number) always wins; play every playable match.
  let guard = 0;
  while (guard++ < 500) {
    const m = matches.find((x) => x.aId && x.bId && !x.scored);
    if (!m) break;
    const fav = es.indexOf(m.aId) < es.indexOf(m.bId) ? m.aId : m.bId;
    E.scoreBracketMatch(DEF, matches, m.id, fav === m.aId ? 3 : 1, fav === m.aId ? 1 : 3);
  }
  const champ = E.resolveBracket(DEF, matches);
  ok(champ === es[0], `single-elim n=${n}: champion should be top seed, got ${champ}`);
  const realMatches = matches.filter((m) => !m.autoBye);
  ok(realMatches.every((m) => m.scored), `single-elim n=${n}: all real matches scored`);
  ok(realMatches.length === n - 1, `single-elim n=${n}: expected ${n - 1} real matches, got ${realMatches.length}`);
}

/* ---------- double elimination ---------- */
for (let n = 4; n <= 16; n++) {
  const es = ids(n);
  const matches = E.buildDoubleElim(es);
  E.resolveBracket(DEF, matches);
  let guard = 0;
  while (guard++ < 2000) {
    const m = matches.find((x) => x.aId && x.bId && !x.scored);
    if (!m) break;
    const fav = es.indexOf(m.aId) < es.indexOf(m.bId) ? m.aId : m.bId;
    E.scoreBracketMatch(DEF, matches, m.id, fav === m.aId ? 3 : 1, fav === m.aId ? 1 : 3);
  }
  const champ = E.resolveBracket(DEF, matches);
  ok(champ === es[0], `double-elim n=${n}: champion should be top seed, got ${champ}`);
  const gf = matches[matches.length - 1];
  ok(gf.stage === 'gf' && gf.scored && !gf.autoBye, `double-elim n=${n}: grand final played`);
  // Everyone except the champion must have exactly 2 losses.
  const losses = {};
  es.forEach((id) => (losses[id] = 0));
  matches.forEach((m) => { if (m.loserId) losses[m.loserId]++; });
  const bad = es.filter((id) => id !== champ && losses[id] !== 2);
  ok(bad.length === 0, `double-elim n=${n}: non-champions with != 2 losses: ${bad.map((b) => b + '=' + losses[b]).join(',')}`);
  ok(losses[champ] <= 1, `double-elim n=${n}: champion losses ${losses[champ]} > 1`);
}

/* ---------- pre-set round robin totals ---------- */
for (let n = 2; n <= 16; n++) {
  for (let g = 1; g <= 14; g++) {
    const es = ids(n);
    const { rounds, matches } = E.buildPresetRR(es, g);
    const played = {};
    es.forEach((id) => (played[id] = 0));
    matches.forEach((m) => { played[m.aId]++; played[m.bId]++; });
    const range = E.gamesRange(n, g);
    const vals = es.map((id) => played[id]);
    ok(Math.min(...vals) === range.min && Math.max(...vals) === range.max,
      `preset RR n=${n} g=${g}: totals ${vals.join(',')} outside range ${range.min}..${range.max}`);
    ok(matches.length === Math.floor((n * g) / 2),
      `preset RR n=${n} g=${g}: expected ${Math.floor((n * g) / 2)} matches, got ${matches.length}`);
    // Nobody twice in a round.
    let twiceOk = true;
    rounds.forEach((r) => {
      const seen = new Set();
      r.pairs.forEach(([a, b]) => { if (seen.has(a) || seen.has(b)) twiceOk = false; seen.add(a); seen.add(b); });
    });
    ok(twiceOk, `preset RR n=${n} g=${g}: an entry plays twice in one round`);
    // No repeat pairing within the first cycle (first min(g, n-1) games).
    if (g <= n - 1 && n > 2) {
      const seenPairs = new Set();
      let rep = false;
      matches.forEach((m) => { const k = E.pairKey(m.aId, m.bId); if (seenPairs.has(k)) rep = true; seenPairs.add(k); });
      ok(!rep, `preset RR n=${n} g=${g}: repeat pairing inside first cycle`);
    }
  }
}
// Jeff's exact reported case: 10 players, "twice" = 2 total games each.
{
  const { rounds, matches } = E.buildPresetRR(ids(10), 2);
  ok(matches.length === 10 && rounds.length === 2, `Jeff case: expected 10 matches in 2 rounds, got ${matches.length} in ${rounds.length}`);
}

/* ---------- results-based (Swiss) ---------- */
{
  const es = entries(6);
  const game = E.createResultsBasedRR(es, 2);
  ok(game.matches.length === 3 && game.matches.every((m) => m.round === 1),
    'swiss: only round 1 exists at creation');
  // Round 1 in sign-up order: P1vP2, P3vP4, P5vP6. Winners: P1, P3, P5,
  // with margins sized so the standings order is P1, P3, P5.
  const r1 = game.matches.slice();
  ok(r1[0].aId === 'P1' && r1[0].bId === 'P2' && r1[1].aId === 'P3' && r1[2].aId === 'P5',
    'swiss: round 1 paired in sign-up order');
  E.scoreRRMatch(game, DEF, r1[0].id, 5, 1); // P1 wins big
  E.scoreRRMatch(game, DEF, r1[1].id, 4, 2); // P3 wins
  E.scoreRRMatch(game, DEF, r1[2].id, 3, 2); // P5 wins narrowly
  ok(game.matches.length === 3, 'swiss: scoring the last round-1 match must NOT generate round 2');
  ok(game.rrRoundsGenerated === 1, 'swiss: roundsGenerated still 1 before the button tap');
  const rn = E.generateNextRRRound(game, DEF);
  ok(rn === 2, 'swiss: manual generate returns round 2');
  const r2 = game.matches.filter((m) => m.round === 2);
  ok(r2.length === 3, 'swiss: round 2 has 3 matches');
  const pairStr = r2.map((m) => [m.aId, m.bId].sort().join('v')).sort();
  const r1Keys = new Set(r1.map((m) => E.pairKey(m.aId, m.bId)));
  ok(r2.every((m) => !r1Keys.has(E.pairKey(m.aId, m.bId))), 'swiss: round 2 has no rematches');
  // Standings-adjacent: the three winners must be split so each faces the
  // highest-ranked available non-rematch opponent (1v3, then 5 with the
  // top loser, then the remaining losers) — the prototype's verified shape.
  ok(pairStr.includes('P1vP3'), `swiss: expected P1vP3 in round 2, got ${pairStr.join(', ')}`);
  // Generate must refuse while round 2 is unscored.
  ok(E.generateNextRRRound(game, DEF) === null, 'swiss: generate blocked until round fully scored');
  // Finish round 2; the RR is then complete (2 games each) and generate stops.
  r2.forEach((m) => E.scoreRRMatch(game, DEF, m.id, 2, 1));
  ok(E.generateNextRRRound(game, DEF) === null, 'swiss: no round 3 once everyone has 2 games');
  const played = E.rrGamesPlayed(game);
  ok(es.every((e) => played[e.id] === 2), 'swiss: every entry played exactly 2 games');
}
// Swiss totals sweep: fields 2..12, games 1..6 — manual rounds only,
// exact totals, nobody twice in a round, no early rounds.
for (let n = 2; n <= 12; n++) {
  for (let g = 1; g <= 6; g++) {
    const es = entries(n);
    const game = E.createResultsBasedRR(es, g);
    let guard = 0;
    while (guard++ < 100) {
      const unscored = game.matches.filter((m) => !m.scored);
      unscored.forEach((m) => E.scoreRRMatch(game, DEF, m.id, 3, 1));
      const before = game.matches.length;
      const rn = E.generateNextRRRound(game, DEF);
      if (rn === null) break;
      ok(game.matches.length > before, `swiss sweep n=${n} g=${g}: generate added a round`);
    }
    const played = E.rrGamesPlayed(game);
    ok(es.every((e) => played[e.id] === g), `swiss sweep n=${n} g=${g}: totals ${es.map((e) => played[e.id]).join(',')}`);
    const byRound = {};
    game.matches.forEach((m) => { (byRound[m.round] = byRound[m.round] || []).push(m); });
    let twice = false;
    Object.values(byRound).forEach((ms) => {
      const seen = new Set();
      ms.forEach((m) => { if (seen.has(m.aId) || seen.has(m.bId)) twice = true; seen.add(m.aId); seen.add(m.bId); });
    });
    ok(!twice, `swiss sweep n=${n} g=${g}: entry twice in a round`);
  }
}

/* ---------- standings tiebreaks ---------- */
{
  const es = entries(3);
  const game = E.createResultsBasedRR(es, 2);
  const r1 = game.matches.slice();
  // P1 beats P2 by 1; P3 has the bye in round 1 (counts as a game).
  E.scoreRRMatch(game, DEF, r1[0].id, 2, 1);
  const st = E.computeStandings(es, game.matches, DEF);
  ok(st[0].id === 'P1' && st[0].w === 1, 'standings: winner on top');
  ok(E.rrGamesPlayed(game)['P3'] === 1, 'standings: bye counts toward games played');
}

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
