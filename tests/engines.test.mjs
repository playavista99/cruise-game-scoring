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

/* ---------- remaining-schedule rebuild (mid-game adds, v1.4) ---------- */
{
  const schedOf = (rounds) => {
    const s = {};
    rounds.forEach((r) => r.pairs.forEach((pr) => { s[pr[0]] = (s[pr[0]] || 0) + 1; s[pr[1]] = (s[pr[1]] || 0) + 1; }));
    return s;
  };
  const roundsValid = (rounds, label) => {
    rounds.forEach((r, i) => {
      const seen = new Set();
      r.pairs.forEach((pr) => {
        ok(!seen.has(pr[0]) && !seen.has(pr[1]), `${label}: entry twice in rebuilt round ${i + 1}`);
        seen.add(pr[0]); seen.add(pr[1]);
      });
    });
  };
  const unmetTotal = (u) => Object.values(u).reduce((a, b) => a + b, 0);

  // T1: forbidden pairings avoided while both entries still need games.
  {
    const needs = { A: 2, B: 2, C: 2, D: 2 };
    const forbidden = { 'A|B': true, 'C|D': true };
    const out = E.buildRemainingRR(['A', 'B', 'C', 'D'], needs, forbidden, {}, 42);
    const s = schedOf(out.rounds);
    ok(['A', 'B', 'C', 'D'].every((id) => s[id] === 2), 'T1: every need met exactly');
    ok(unmetTotal(out.unmet) === 0, 'T1: nothing unmet');
    ok(!Object.keys(out.extras).length, 'T1: no extras');
    let usedForbidden = false;
    out.rounds.forEach((r) => r.pairs.forEach((pr) => { if (forbidden[E.pairKey(pr[0], pr[1])]) usedForbidden = true; }));
    ok(!usedForbidden, 'T1: no forbidden pairing used');
    roundsValid(out.rounds, 'T1');
  }
  // T2: odd total need — exactly one entry sits one game short.
  {
    const out = E.buildRemainingRR(['A', 'B', 'C'], { A: 2, B: 2, C: 1 }, {}, {}, 7);
    ok(unmetTotal(out.unmet) === 1, 'T2: exactly one game unmet on an odd total, got ' + unmetTotal(out.unmet));
    const s = schedOf(out.rounds);
    const totalSched = Object.values(s).reduce((a, b) => a + b, 0);
    ok(totalSched === 4, 'T2: two matches scheduled');
    roundsValid(out.rounds, 'T2');
  }
  // T3: completed-RR late entry — fills against distinct opponents,
  // fewest-games first, extras reported, nothing unmet.
  {
    const needs = { A: 0, B: 0, C: 0, D: 0, NEW: 2 };
    const played = { A: 1, B: 1, C: 1, D: 1, NEW: 0 };
    const forbidden = { 'A|B': true, 'C|D': true };
    const out = E.buildRemainingRR(['A', 'B', 'C', 'D', 'NEW'], needs, forbidden, played, 9);
    const s = schedOf(out.rounds);
    ok(s.NEW === 2 && unmetTotal(out.unmet) === 0, 'T3: newcomer gets both games');
    const opps = new Set();
    out.rounds.forEach((r) => r.pairs.forEach((pr) => { if (pr[0] === 'NEW') opps.add(pr[1]); if (pr[1] === 'NEW') opps.add(pr[0]); }));
    ok(opps.size === 2, 'T3: newcomer faces two distinct opponents');
    ok(Object.values(out.extras).reduce((a, b) => a + b, 0) === 2, 'T3: two extra games reported');
    roundsValid(out.rounds, 'T3');
  }
  // T4: fill cap — a late entry cannot exceed its distinct opponents.
  {
    const out = E.buildRemainingRR(['A', 'B', 'C', 'N'], { A: 0, B: 0, C: 0, N: 5 }, {}, { A: 2, B: 2, C: 2, N: 0 }, 3);
    const s = schedOf(out.rounds);
    ok(s.N === 3, 'T4: newcomer capped at 3 distinct opponents, got ' + s.N);
    ok(out.unmet.N === 2, 'T4: remaining 2 reported unmet');
  }
  // T5: a rematch is allowed when BOTH entries still need the game.
  {
    const out = E.buildRemainingRR(['A', 'B'], { A: 1, B: 1 }, { 'A|B': true }, { A: 1, B: 1 }, 5);
    ok(out.rounds.length === 1 && out.rounds[0].pairs.length === 1, 'T5: needy rematch still scheduled');
    ok(unmetTotal(out.unmet) === 0, 'T5: nothing unmet');
  }
  // T6: nobody needs games -> no rounds.
  {
    const out = E.buildRemainingRR(['A', 'B', 'C'], { A: 0, B: 0, C: 0 }, {}, {}, 5);
    ok(out.rounds.length === 0, 'T6: empty schedule when no needs');
  }
  // T7: sweep over schedule-derived states (preset schedule, first k
  // matches "played", then a walk-up joins). Invariants: nobody is
  // scheduled past their need without an extras entry to explain it,
  // nobody falls short by more than the forced parity game, rounds
  // are valid matchings.
  for (let n = 3; n <= 9; n++) {
    for (let g = 1; g <= 4; g++) {
      for (const k of [0, 1, 3]) {
        const es = ids(n);
        const built = E.buildPresetRR(es, g);
        if (k > built.matches.length) continue;
        const played = {}, forbidden = {};
        es.forEach((id) => { played[id] = 0; });
        built.matches.slice(0, k).forEach((m) => {
          played[m.aId]++; played[m.bId]++;
          forbidden[E.pairKey(m.aId, m.bId)] = true;
        });
        const all = es.concat(['NEW']);
        const needs = {};
        all.forEach((id) => { needs[id] = id === 'NEW' ? g : Math.max(0, g - played[id]); });
        const out = E.buildRemainingRR(all, needs, forbidden, played, 100 + n * 10 + g);
        const s = schedOf(out.rounds);
        all.forEach((id) => {
          const got = s[id] || 0;
          ok(got <= needs[id] + (out.extras[id] || 0), `T7 n=${n} g=${g} k=${k}: ${id} overscheduled (${got} > need ${needs[id]})`);
          ok(got + (out.unmet[id] || 0) >= needs[id] - 1, `T7 n=${n} g=${g} k=${k}: ${id} short by more than the parity game`);
          ok(got - needs[id] === (out.extras[id] || 0) || got <= needs[id], `T7 n=${n} g=${g} k=${k}: ${id} extras bookkeeping`);
        });
        roundsValid(out.rounds, `T7 n=${n} g=${g} k=${k}`);
      }
    }
  }
  // T8: results-based — a lone active entry (walk-up in a finished
  // pool) is paired against a real opponent, never handed a bye.
  {
    const es = entries(4);
    const game = E.createResultsBasedRR(es, 1);
    game.matches.slice().forEach((m) => E.scoreRRMatch(game, DEF, m.id, 3, 1));
    ok(E.rrComplete(game), 'T8: pool complete before the walk-up');
    game.entries.push({ id: 'P5', name: 'P5' });
    const rn = E.generateNextRRRound(game, DEF);
    ok(rn === 2, 'T8: a new round is generated for the walk-up');
    const nm = game.matches.find((m) => m.round === 2);
    ok(nm && (nm.aId === 'P5' || nm.bId === 'P5'), 'T8: walk-up is in the new match');
    ok(nm && nm.aId !== nm.bId && (nm.aId === 'P1' || nm.bId === 'P1'), 'T8: opponent is the fewest-games / first-signed-up entry (P1)');
    ok(!game.rrByes.includes('P5'), 'T8: walk-up was not given a bye');
  }
}

/* ---------- camera measurement: homography (v2.2) ---------- */
{
  // Reference presets ship with the agreed real-world sizes.
  const refs = Object.fromEntries(E.MEASURE_REFS.map((r) => [r.id, r]));
  ok(refs.cornhole && refs.cornhole.w === 24 && refs.cornhole.h === 48, 'measure: cornhole ref is 24x48');
  ok(refs.card && refs.card.w === 3.37 && refs.card.h === 2.125, 'measure: credit card ref is 3.37x2.125');
  ok(refs.letter && refs.letter.w === 8.5 && refs.letter.h === 11, 'measure: letter ref is 8.5x11');

  const planeCorners = [{ x: 0, y: 0 }, { x: 24, y: 0 }, { x: 24, y: 48 }, { x: 0, y: 48 }];
  const applyH = (H, p) => E.planePoint(H, p.x, p.y); // planePoint applies any H, either direction

  // Axis-aligned similarity (scale + offset): exact geometry.
  const Hsim = [10, 0, 5, 0, 10, 7, 0, 0, 1];
  const imgSim = planeCorners.map((p) => applyH(Hsim, p));
  const Hrec = E.computeHomography(imgSim, planeCorners);
  ok(!!Hrec, 'measure: similarity case solves');
  const dSim = E.measureDistance(Hrec, applyH(Hsim, { x: 2, y: 3 }), applyH(Hsim, { x: 8, y: 11 }));
  ok(dSim !== null && Math.abs(dSim - 10) < 0.05, `measure: similarity distance 10in recovered (got ${dSim})`);

  // A genuinely projective view (tilted camera): synthesize image
  // points with a known H, then check the recovered distances.
  const Hproj = [12, 1.5, 300, 0.5, 11, 400, 0.0009, 0.0013, 1];
  const imgProj = planeCorners.map((p) => applyH(Hproj, p));
  const Hp = E.computeHomography(imgProj, planeCorners);
  ok(!!Hp, 'measure: projective case solves');
  const pairs = [
    [{ x: 1, y: 2 }, { x: 20, y: 40 }],
    [{ x: 12, y: 24 }, { x: 13.5, y: 24 }],   // a 1.5in gap at board center
    [{ x: 0, y: 0 }, { x: 24, y: 48 }],       // the full diagonal
    [{ x: 23.9, y: 47.9 }, { x: 0.1, y: 0.1 }]
  ];
  pairs.forEach(([a, b], i) => {
    const truth = Math.hypot(b.x - a.x, b.y - a.y);
    const got = E.measureDistance(Hp, applyH(Hproj, a), applyH(Hproj, b));
    ok(got !== null && Math.abs(got - truth) < 0.05,
      `measure: projective pair ${i} distance ${truth.toFixed(3)}in recovered (got ${got && got.toFixed(4)})`);
  });
  // Recovered plane coordinates land on the true inches, too.
  const ctr = E.planePoint(Hp, applyH(Hproj, { x: 12, y: 24 }).x, applyH(Hproj, { x: 12, y: 24 }).y);
  ok(ctr && Math.abs(ctr.x - 12) < 0.05 && Math.abs(ctr.y - 24) < 0.05, 'measure: planePoint recovers board center');

  // Degenerate inputs return null instead of nonsense numbers.
  const collinear = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 0 }];
  ok(E.computeHomography(collinear, planeCorners) === null, 'measure: collinear corners -> null');
  const samePoint = [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }];
  ok(E.computeHomography(samePoint, planeCorners) === null, 'measure: coincident corners -> null');
  ok(E.computeHomography(planeCorners.slice(0, 3), planeCorners) === null, 'measure: 3 corners -> null');
  ok(E.computeHomography(null, planeCorners) === null, 'measure: null input -> null');
  ok(E.measureDistance(null, { x: 0, y: 0 }, { x: 1, y: 1 }) === null, 'measure: distance without H -> null');
  ok(E.planePoint(null, 1, 2) === null, 'measure: planePoint without H -> null');
}

console.log(`\n${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
