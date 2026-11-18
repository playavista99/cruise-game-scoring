/* Cruise Game Scoring App — tournament engines.
   Pure logic, no DOM. Works in the browser (window.Engines) and in node
   (module.exports) so the exact shipped code is what the tests exercise. */
(function () {
  'use strict';

  let _uid = 1;
  function uid(prefix) { return (prefix || 'm') + (_uid++) + '_' + Math.random().toString(36).slice(2, 8); }
  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

  /* ---------------- match outcome ---------------- */
  // Winner of a scored head-to-head match under the game's win direction.
  // Returns {winner, loser} or null when tied / unscored.
  function matchOutcome(def, m) {
    if (m.sa === null || m.sa === undefined || m.sb === null || m.sb === undefined) return null;
    if (m.sa === m.sb) return null;
    const aWins = def.winDir === 'low' ? m.sa < m.sb : m.sa > m.sb;
    return aWins ? { winner: m.aId, loser: m.bId } : { winner: m.bId, loser: m.aId };
  }
  function tapsTotal(def, taps) {
    if (!taps) return 0;
    return taps.reduce(function (sum, ti) { return sum + (def.buttons[ti] ? def.buttons[ti].points : 0); }, 0);
  }

  /* ---------------- brackets (single + double elimination) ----------------
     Matches form a graph: each slot has a source —
       {t:'entry', id}  a real entry
       {t:'empty'}      a bye slot (seed beyond the field)
       {t:'win', m}     winner of match m
       {t:'lose', m}    loser of match m
     resolveBracket() derives participants, auto-advances byes, and clears
     scores whose participants changed (so a corrected score re-flows). */

  function seedPositions(p) {
    // Standard bracket seed order for a bracket of size p (power of two).
    let order = [1, 2];
    while (order.length < p) {
      const sum = order.length * 2 + 1;
      const next = [];
      order.forEach(function (s) { next.push(s, sum - s); });
      order = next;
    }
    return order;
  }

  function mkMatch(stage, round, srcA, srcB) {
    return {
      id: uid('m'), kind: 'brk', stage: stage, round: round,
      srcA: srcA, srcB: srcB, aId: null, bId: null,
      sa: null, sb: null, tapsA: [], tapsB: [],
      scored: false, autoBye: false, winnerId: null, loserId: null
    };
  }

  function buildSingleElim(ids) {
    const n = ids.length, p = nextPow2(Math.max(2, n)), order = seedPositions(p);
    const rounds = Math.log2(p);
    const matches = [];
    let prev = [];
    for (let i = 0; i < p / 2; i++) {
      const sa = order[2 * i], sb = order[2 * i + 1];
      const m = mkMatch('brk', 1,
        sa <= n ? { t: 'entry', id: ids[sa - 1] } : { t: 'empty' },
        sb <= n ? { t: 'entry', id: ids[sb - 1] } : { t: 'empty' });
      matches.push(m); prev.push(m);
    }
    for (let r = 2; r <= rounds; r++) {
      const cur = [];
      for (let i = 0; i < prev.length / 2; i++) {
        const m = mkMatch('brk', r, { t: 'win', m: prev[2 * i].id }, { t: 'win', m: prev[2 * i + 1].id });
        matches.push(m); cur.push(m);
      }
      prev = cur;
    }
    return matches;
  }

  function buildDoubleElim(ids) {
    const n = ids.length, p = nextPow2(Math.max(4, n)), order = seedPositions(p);
    const k = Math.log2(p);
    const matches = [];
    // Winners bracket
    const wbRounds = [];
    let prev = [];
    for (let i = 0; i < p / 2; i++) {
      const sa = order[2 * i], sb = order[2 * i + 1];
      const m = mkMatch('wb', 1,
        sa <= n ? { t: 'entry', id: ids[sa - 1] } : { t: 'empty' },
        sb <= n ? { t: 'entry', id: ids[sb - 1] } : { t: 'empty' });
      matches.push(m); prev.push(m);
    }
    wbRounds.push(prev);
    for (let r = 2; r <= k; r++) {
      const cur = [];
      for (let i = 0; i < prev.length / 2; i++) {
        const m = mkMatch('wb', r, { t: 'win', m: prev[2 * i].id }, { t: 'win', m: prev[2 * i + 1].id });
        matches.push(m); cur.push(m);
      }
      wbRounds.push(cur); prev = cur;
    }
    const wbFinal = prev[0];
    // Losers bracket: LB1 pairs WB round-1 losers; then for each later WB
    // round, a drop-in round (LB survivors vs that round's WB losers,
    // crossed) followed by a pairing round (LB survivors vs each other),
    // except after the final WB round where the drop-in is the LB final.
    let lbRound = 0;
    let survivors = [];
    {
      lbRound++;
      const first = wbRounds[0];
      for (let i = 0; i < first.length / 2; i++) {
        const m = mkMatch('lb', lbRound, { t: 'lose', m: first[2 * i].id }, { t: 'lose', m: first[2 * i + 1].id });
        matches.push(m); survivors.push(m);
      }
    }
    for (let wr = 2; wr <= k; wr++) {
      const dropLosers = wbRounds[wr - 1];
      lbRound++;
      const drop = [];
      for (let i = 0; i < survivors.length; i++) {
        const src = dropLosers[dropLosers.length - 1 - i]; // crossed to delay rematches
        const m = mkMatch('lb', lbRound, { t: 'win', m: survivors[i].id }, { t: 'lose', m: src.id });
        matches.push(m); drop.push(m);
      }
      survivors = drop;
      if (wr < k) {
        lbRound++;
        const paired = [];
        for (let i = 0; i < survivors.length / 2; i++) {
          const m = mkMatch('lb', lbRound, { t: 'win', m: survivors[2 * i].id }, { t: 'win', m: survivors[2 * i + 1].id });
          matches.push(m); paired.push(m);
        }
        survivors = paired;
      }
    }
    const gf = mkMatch('gf', 1, { t: 'win', m: wbFinal.id }, { t: 'win', m: survivors[0].id });
    matches.push(gf);
    return matches;
  }

  // Source value: {state:'pending'} | {state:'ready', id} | {state:'empty'}
  function srcValue(src, byId) {
    if (!src) return { state: 'empty' };
    if (src.t === 'entry') return { state: 'ready', id: src.id };
    if (src.t === 'empty') return { state: 'empty' };
    const m = byId[src.m];
    if (!m || !m.resolved) return { state: 'pending' };
    if (src.t === 'win') return m.winnerId ? { state: 'ready', id: m.winnerId } : { state: 'empty' };
    return m.loserId ? { state: 'ready', id: m.loserId } : { state: 'empty' };
  }

  function resolveBracket(def, matches) {
    const byId = {};
    matches.forEach(function (m) { byId[m.id] = m; });
    let changed = true, guard = 0;
    while (changed && guard++ < 200) {
      changed = false;
      for (const m of matches) {
        const va = srcValue(m.srcA, byId), vb = srcValue(m.srcB, byId);
        if (va.state === 'pending' || vb.state === 'pending') {
          if (m.resolved) { m.resolved = false; m.aId = m.bId = null; m.winnerId = m.loserId = null; changed = true; }
          continue;
        }
        const na = va.state === 'ready' ? va.id : null;
        const nb = vb.state === 'ready' ? vb.id : null;
        if (m.aId !== na || m.bId !== nb) {
          m.aId = na; m.bId = nb;
          m.sa = m.sb = null; m.tapsA = []; m.tapsB = []; m.scored = false; m.autoBye = false;
          changed = true;
        }
        const wasResolved = m.resolved;
        if (na && nb) {
          m.resolved = true;
          const out = m.scored ? matchOutcome(def, m) : null;
          m.winnerId = out ? out.winner : null;
          m.loserId = out ? out.loser : null;
          m.autoBye = false;
        } else if (na || nb) {
          // One side empty -> bye: the present entry advances automatically.
          m.resolved = true; m.scored = true; m.autoBye = true;
          m.winnerId = na || nb; m.loserId = null;
        } else {
          m.resolved = true; m.scored = true; m.autoBye = true;
          m.winnerId = null; m.loserId = null;
        }
        if (!wasResolved && m.resolved) changed = true;
        if (wasResolved && (m.winnerId !== (m._pw || null))) changed = true;
        m._pw = m.winnerId;
      }
    }
    matches.forEach(function (m) { delete m._pw; });
    let champion = null;
    for (const m of matches) {
      const isFinal = (m.stage === 'brk' || m.stage === 'gf') && m === matches[matches.length - 1];
      if (isFinal && m.winnerId) champion = m.winnerId;
    }
    if (!champion) {
      // Single-elim: champion is the winner of the highest-round match.
      let best = null;
      matches.forEach(function (m) { if (m.stage === 'brk' && m.winnerId && (!best || m.round > best.round)) best = m; });
      if (best && best.round === Math.max.apply(null, matches.map(function (x) { return x.round; }))) champion = best.winnerId;
    }
    return champion;
  }

  function scoreBracketMatch(def, matches, matchId, sa, sb) {
    const m = matches.find(function (x) { return x.id === matchId; });
    if (!m || !m.aId || !m.bId) return false;
    if (sa === sb) return false; // brackets cannot end in a tie
    m.sa = sa; m.sb = sb; m.scored = true;
    resolveBracket(def, matches);
    return true;
  }

  /* ---------------- round robin: shared ---------------- */
  function computeStandings(entries, matches, def) {
    const table = {};
    entries.forEach(function (e) {
      table[e.id] = { id: e.id, played: 0, w: 0, l: 0, d: 0, pf: 0, pa: 0, diff: 0 };
    });
    matches.forEach(function (m) {
      if (!m.scored || m.autoBye || m.sa === null || m.sb === null) return;
      const A = table[m.aId], B = table[m.bId];
      if (!A || !B) return;
      A.played++; B.played++;
      A.pf += m.sa; A.pa += m.sb; B.pf += m.sb; B.pa += m.sa;
      const out = matchOutcome(def, m);
      if (!out) { A.d++; B.d++; }
      else if (out.winner === m.aId) { A.w++; B.l++; }
      else { B.w++; A.l++; }
    });
    const rows = entries.map(function (e) { return table[e.id]; });
    rows.forEach(function (r) { r.diff = def.winDir === 'low' ? r.pa - r.pf : r.pf - r.pa; });
    rows.sort(function (x, y) {
      return (y.w - x.w) || (y.diff - x.diff) || (y.pf - x.pf);
    });
    return rows;
  }

  // Honest per-entry game range for a requested total: when entries*games
  // is odd, one entry must play one fewer.
  function gamesRange(n, g) {
    if ((n * g) % 2 === 0) return { min: g, max: g };
    return { min: g - 1, max: g };
  }

  function circleRounds(ids) {
    // One full everyone-plays-everyone cycle (circle method).
    const arr = ids.slice();
    if (arr.length % 2 === 1) arr.push(null);
    const m = arr.length, rounds = [];
    let cur = arr.slice();
    for (let r = 0; r < m - 1; r++) {
      const pairs = []; let bye = null;
      for (let i = 0; i < m / 2; i++) {
        const a = cur[i], b = cur[m - 1 - i];
        if (a === null) bye = b; else if (b === null) bye = a; else pairs.push([a, b]);
      }
      rounds.push({ pairs: pairs, bye: bye });
      cur = [cur[0], cur[m - 1]].concat(cur.slice(1, m - 1));
    }
    return rounds;
  }

  function greedyRounds(ids, target, priorPairCounts, seed) {
    // Build rounds (matchings) giving each entry `target` more games.
    // Soft rule: avoid repeating a pairing inside this block, then avoid
    // pairings already used in earlier cycles. Several deterministic
    // attempts; the attempt with the fewest repeats wins.
    let best = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const rnd = mulberry(seed + attempt * 7919);
      const need = {};
      ids.forEach(function (id) { need[id] = target; });
      if ((ids.length * target) % 2 === 1) need[ids[(attempt) % ids.length]] -= 1; // forced short entry
      const blockPairs = {};
      const rounds = [];
      let repeats = 0, guard = 0;
      while (ids.some(function (id) { return need[id] > 0; }) && guard++ < 300) {
        const order = ids.filter(function (id) { return need[id] > 0; })
          .sort(function (x, y) { return (need[y] - need[x]) || (rnd() - 0.5); });
        const used = {}, pairs = [];
        let bye = null;
        for (const id of order) {
          if (used[id] || need[id] <= 0) continue;
          const cands = order.filter(function (o) { return o !== id && !used[o] && need[o] > 0; });
          if (!cands.length) { bye = id; continue; }
          cands.sort(function (p, q) {
            const kp = pairKey(id, p), kq = pairKey(id, q);
            return ((blockPairs[kp] ? 1 : 0) - (blockPairs[kq] ? 1 : 0)) ||
              ((priorPairCounts[kp] || 0) - (priorPairCounts[kq] || 0)) ||
              (need[q] - need[p]) || (rnd() - 0.5);
          });
          const pick = cands[0], k = pairKey(id, pick);
          if (blockPairs[k]) repeats++;
          blockPairs[k] = (blockPairs[k] || 0) + 1;
          used[id] = used[pick] = true;
          pairs.push([id, pick]);
          need[id]--; need[pick]--;
        }
        rounds.push({ pairs: pairs, bye: bye });
      }
      const exact = ids.every(function (id) { return need[id] === 0; });
      if (exact && (!best || repeats < best.repeats)) best = { rounds: rounds, repeats: repeats };
      if (best && best.repeats === 0) break;
    }
    return best ? best.rounds : [];
  }

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rotate(arr, k) { const n = arr.length; const s = ((k % n) + n) % n; return arr.slice(s).concat(arr.slice(0, s)); }

  // Partial cycle: `rem` games per entry (rem < n-1), never repeating a
  // pairing inside the block. Built from whole rounds of one circle cycle:
  //  - even field: any rem rounds give everyone exactly rem games.
  //  - odd field: the rem entries whose bye fell inside the kept rounds
  //    sit one game short; one extra round pairs them up using pairings
  //    the kept rounds did not use — all of them when rem is even, and
  //    all but one when rem is odd (the single forced short entry that
  //    gamesRange() reports honestly).
  function remainderRounds(ids, rem, rotation) {
    const n = ids.length;
    for (let tryRot = 0; tryRot < n; tryRot++) {
      const cyc = circleRounds(rotate(ids, rotation + tryRot));
      const kept = cyc.slice(0, rem);
      if (n % 2 === 0) return kept;
      const played = {}, usedPairs = {};
      ids.forEach(function (id) { played[id] = 0; });
      kept.forEach(function (r) {
        r.pairs.forEach(function (pr) { played[pr[0]]++; played[pr[1]]++; usedPairs[pairKey(pr[0], pr[1])] = true; });
      });
      const shorted = ids.filter(function (id) { return played[id] === rem - 1; });
      const wantPairs = Math.floor(shorted.length / 2);
      if (wantPairs === 0) return kept;
      for (let attempt = 0; attempt < 300; attempt++) {
        const rnd = mulberry(97 + tryRot * 131 + attempt * 17);
        const pool = shorted.slice().sort(function () { return rnd() - 0.5; });
        const pairs = [], used = {};
        for (const id of pool) {
          if (used[id]) continue;
          const pick = pool.find(function (o) { return o !== id && !used[o] && !usedPairs[pairKey(id, o)]; });
          if (!pick) continue;
          used[id] = used[pick] = true;
          pairs.push([id, pick]);
        }
        if (pairs.length === wantPairs) {
          const leftover = shorted.find(function (id) { return !used[id]; }) || null;
          return kept.concat([{ pairs: pairs, bye: leftover }]);
        }
      }
    }
    return null; // caller falls back to greedy
  }

  // Pre-set round robin: the whole schedule up front. `gamesPerEntry` is
  // the TOTAL games each entry plays (Jeff's correction, 2026-11-16).
  function buildPresetRR(ids, gamesPerEntry) {
    const n = ids.length;
    if (n < 2 || gamesPerEntry < 1) return { rounds: [], matches: [] };
    let rounds = [];
    if (n === 2) {
      for (let i = 0; i < gamesPerEntry; i++) rounds.push({ pairs: [[ids[0], ids[1]]], bye: null });
    } else {
      const per = n - 1;
      const full = Math.floor(gamesPerEntry / per);
      const rem = gamesPerEntry - full * per;
      const prior = {};
      for (let c = 0; c < full; c++) {
        const cyc = circleRounds(rotate(ids, c));
        cyc.forEach(function (r) {
          r.pairs.forEach(function (pr) { const k = pairKey(pr[0], pr[1]); prior[k] = (prior[k] || 0) + 1; });
        });
        rounds = rounds.concat(cyc);
      }
      if (rem > 0) {
        const remRounds = remainderRounds(ids, rem, full);
        rounds = rounds.concat(remRounds || greedyRounds(ids, rem, prior, 1234 + n * 31 + gamesPerEntry));
      }
    }
    const matches = [];
    rounds.forEach(function (r, ri) {
      r.pairs.forEach(function (pr) {
        matches.push({
          id: uid('m'), kind: 'rr', stage: 'rr', round: ri + 1,
          aId: pr[0], bId: pr[1], sa: null, sb: null, tapsA: [], tapsB: [],
          scored: false, autoBye: false, winnerId: null, loserId: null
        });
      });
    });
    return { rounds: rounds, matches: matches };
  }

  /* ---------------- round robin: remaining-schedule rebuild ----------------
     Used when the field changes mid-game (a walk-up joins a pre-set
     round robin) or staff ask for the remaining schedule to be
     regenerated. Scored matches are NEVER touched by this builder —
     the caller keeps them and appends what comes back.

     Inputs:
       ids:            entry ids, sign-up order
       needsIn:        {id: games still needed} — target minus games
                       already played (scored) for each entry
       forbiddenPairs: {pairKey: true} — pairings already played. A
                       soft constraint while both entries still need
                       games (full cycles legitimately rematch), but a
                       HARD constraint for fill games (below)
       playedIn:       {id: games already played} — orders fill picks
     Phase 1 pairs entries who still need games against each other —
     an entry that still needs games is NEVER scheduled past its
     need. Phase 2 covers a leftover entry whose would-be opponents
     are all done: it plays "fill" games, but only against entries
     whose need was already 0 when the rebuild started (players at
     target — the completed-round-robin late-entry case). Those
     opponents exceed their target, reported in `extras`; fills
     prefer the opponents with the fewest games and are never a
     rematch. If no fill opponent is available — including the odd
     total a full field can produce, where one entry simply sits one
     game short (the same honest math as gamesRange) — the leftover
     need is reported in `unmet`. */
  function buildRemainingRR(ids, needsIn, forbiddenPairs, playedIn, seedBase) {
    forbiddenPairs = forbiddenPairs || {};
    playedIn = playedIn || {};
    let best = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const rnd = mulberry((seedBase || 7) + attempt * 104729);
      const need = {}, unmet = {}, scheduled = {};
      ids.forEach(function (id) {
        need[id] = Math.max(0, needsIn[id] || 0);
        unmet[id] = 0; scheduled[id] = 0;
      });
      const blockUsed = {};
      const rounds = [];
      let repeats = 0;
      const pairCost = function (a, b) {
        const k = pairKey(a, b);
        return (blockUsed[k] ? 2 : 0) + (forbiddenPairs[k] ? 1 : 0);
      };
      const notePair = function (a, b) {
        const k = pairKey(a, b);
        if (blockUsed[k] || forbiddenPairs[k]) repeats++;
        blockUsed[k] = (blockUsed[k] || 0) + 1;
        scheduled[a]++; scheduled[b]++;
        need[a]--; need[b]--;
      };
      const pushRound = function (pairs, used) {
        const sitting = ids.filter(function (id) { return !used[id]; });
        rounds.push({ pairs: pairs, bye: sitting.length === 1 ? sitting[0] : null });
      };
      // Phase 1: entries who need games play each other.
      let guard = 0;
      while (ids.filter(function (id) { return need[id] > 0; }).length >= 2 && guard++ < 400) {
        const order = ids.filter(function (id) { return need[id] > 0; })
          .sort(function (x, y) { return (need[y] - need[x]) || (rnd() - 0.5); });
        const used = {}, pairs = [];
        for (const id of order) {
          if (used[id] || need[id] <= 0) continue;
          const cands = order.filter(function (o) { return o !== id && !used[o] && need[o] > 0; });
          if (!cands.length) continue;
          cands.sort(function (p, q) {
            return (pairCost(id, p) - pairCost(id, q)) || (need[q] - need[p]) || (rnd() - 0.5);
          });
          const pick = cands[0];
          notePair(id, pick);
          used[id] = used[pick] = true;
          pairs.push([id, pick]);
        }
        if (!pairs.length) break;
        pushRound(pairs, used);
      }
      // Phase 2: a leftover entry takes fill games against entries
      // already at target (fewest games first, never a rematch).
      guard = 0;
      while (ids.some(function (id) { return need[id] > 0; }) && guard++ < 400) {
        const needy = ids.filter(function (id) { return need[id] > 0; })
          .sort(function (x, y) { return (need[y] - need[x]) || (ids.indexOf(x) - ids.indexOf(y)); });
        const used = {}, pairs = [];
        for (const x of needy) {
          if (used[x] || need[x] <= 0) continue;
          let cands = ids.filter(function (y) { return y !== x && !used[y] && need[y] > 0; });
          if (cands.length) {
            cands.sort(function (p, q) { return (pairCost(x, p) - pairCost(x, q)) || (need[q] - need[p]); });
          } else {
            // Fill opponents: only entries whose need was already 0
            // when the rebuild started (at target), never a rematch.
            cands = ids.filter(function (y) {
              const k = pairKey(x, y);
              return y !== x && !used[y] && (needsIn[y] || 0) <= 0 && !forbiddenPairs[k] && !blockUsed[k];
            });
            cands.sort(function (p, q) {
              const tp = (playedIn[p] || 0) + scheduled[p];
              const tq = (playedIn[q] || 0) + scheduled[q];
              return (tp - tq) || (ids.indexOf(p) - ids.indexOf(q));
            });
          }
          if (!cands.length) { unmet[x] += need[x]; need[x] = 0; continue; }
          const pick = cands[0];
          notePair(x, pick);
          used[x] = used[pick] = true;
          pairs.push([x, pick]);
        }
        if (!pairs.length) break;
        pushRound(pairs, used);
      }
      ids.forEach(function (id) { if (need[id] > 0) { unmet[id] += need[id]; need[id] = 0; } });
      const extras = {};
      ids.forEach(function (id) {
        const ex = scheduled[id] - (needsIn[id] || 0);
        if (ex > 0) extras[id] = ex;
      });
      const unmetTotal = ids.reduce(function (s, id) { return s + unmet[id]; }, 0);
      const score = unmetTotal * 100000 + repeats * 100 + rounds.length;
      if (!best || score < best.score) best = { rounds: rounds, extras: extras, unmet: unmet, score: score };
      if (unmetTotal === 0 && repeats === 0) break;
    }
    if (!best) return { rounds: [], extras: {}, unmet: {} };
    return { rounds: best.rounds, extras: best.extras, unmet: best.unmet };
  }

  /* ---------------- round robin: results-based (Swiss) ----------------
     Round 1 is paired in sign-up order. Each later round is paired from
     the current standings ONLY when generateNextRRRound() is called —
     scoring a match never creates a round (Jeff, 2026-11-16).
     A bye counts as one of the entry's games (a walkover), so every
     entry reaches exactly the requested total after that many rounds. */

  function rrGamesPlayed(game) {
    const played = {};
    game.entries.forEach(function (e) { played[e.id] = 0; });
    game.matches.forEach(function (m) {
      if (m.kind !== 'rr') return;
      if (played[m.aId] !== undefined) played[m.aId]++;
      if (played[m.bId] !== undefined) played[m.bId]++;
    });
    (game.rrByes || []).forEach(function (b) { if (played[b] !== undefined) played[b]++; });
    return played;
  }

  function swissPair(order, activeIds, playedPairs, byeHistory, gamesPlayed) {
    const pool = activeIds.slice();
    let bye = null;
    if (pool.length % 2 === 1) {
      const maxPlayed = Math.max.apply(null, pool.map(function (id) { return gamesPlayed[id] || 0; }));
      let cands = pool.filter(function (id) { return (gamesPlayed[id] || 0) === maxPlayed; });
      const fresh = cands.filter(function (id) { return !byeHistory[id]; });
      if (fresh.length) cands = fresh;
      // lowest-ranked candidate (order is best-first, so take the last one)
      bye = cands.slice().sort(function (a, b) { return order.indexOf(b) - order.indexOf(a); })[0];
      pool.splice(pool.indexOf(bye), 1);
    }
    const pairs = [], used = {};
    for (const id of pool) {
      if (used[id]) continue;
      const rest = pool.filter(function (o) { return o !== id && !used[o]; });
      if (!rest.length) break;
      const pick = rest.find(function (o) { return !playedPairs[pairKey(id, o)]; }) || rest[0];
      used[id] = used[pick] = true;
      pairs.push([id, pick]);
    }
    return { pairs: pairs, bye: bye };
  }

  function createResultsBasedRR(entries, gamesPerEntry) {
    const ids = entries.map(function (e) { return e.id; });
    const game = {
      entries: entries, matches: [], rrByes: [], rrRoundsGenerated: 0,
      rrTarget: gamesPerEntry
    };
    // Round 1: sign-up order, paired consecutively.
    const playedPairs = {};
    const res = swissPair(ids, ids.slice(), playedPairs, {}, {});
    res.pairs.forEach(function (pr) {
      game.matches.push({
        id: uid('m'), kind: 'rr', stage: 'rr', round: 1,
        aId: pr[0], bId: pr[1], sa: null, sb: null, tapsA: [], tapsB: [],
        scored: false, autoBye: false, winnerId: null, loserId: null
      });
    });
    if (res.bye) game.rrByes.push(res.bye);
    game.rrRoundsGenerated = 1;
    return game;
  }

  function rrAllRoundsScored(game) {
    return game.matches.every(function (m) { return m.kind !== 'rr' || m.scored; });
  }
  function rrComplete(game) {
    const played = rrGamesPlayed(game);
    return game.entries.every(function (e) { return played[e.id] >= game.rrTarget; });
  }

  // THE manual generate step. Returns the new round number, or null when
  // the round robin is already complete. Never called by scoring code.
  function generateNextRRRound(game, def) {
    if (!rrAllRoundsScored(game)) return null;
    if (rrComplete(game)) return null;
    const standings = computeStandings(game.entries, game.matches, def);
    const order = standings.map(function (r) { return r.id; });
    const playedCount = rrGamesPlayed(game);
    const active = order.filter(function (id) { return playedCount[id] < game.rrTarget; });
    const playedPairs = {};
    game.matches.forEach(function (m) { if (m.kind === 'rr') playedPairs[pairKey(m.aId, m.bId)] = true; });
    const byeHistory = {};
    (game.rrByes || []).forEach(function (b) { byeHistory[b] = true; });
    if (active.length === 1) {
      // A lone active entry — only reachable when a walk-up joined a
      // pool everyone else has already finished. Pair them against
      // the at-target entry with the fewest games played (sign-up
      // order breaks ties) instead of crediting a bye they did not
      // earn; the opponent simply gets an extra game.
      const only = active[0];
      const others = game.entries.map(function (e) { return e.id; })
        .filter(function (id) { return id !== only; });
      if (!others.length) return null;
      others.sort(function (a, b) {
        return ((playedCount[a] || 0) - (playedCount[b] || 0)) ||
          (game.entries.findIndex(function (e) { return e.id === a; }) -
           game.entries.findIndex(function (e) { return e.id === b; }));
      });
      const loneRound = game.rrRoundsGenerated + 1;
      game.matches.push({
        id: uid('m'), kind: 'rr', stage: 'rr', round: loneRound,
        aId: only, bId: others[0], sa: null, sb: null, tapsA: [], tapsB: [],
        scored: false, autoBye: false, winnerId: null, loserId: null
      });
      game.rrRoundsGenerated = loneRound;
      return loneRound;
    }
    const res = swissPair(order, active, playedPairs, byeHistory, playedCount);
    const roundNo = game.rrRoundsGenerated + 1;
    res.pairs.forEach(function (pr) {
      game.matches.push({
        id: uid('m'), kind: 'rr', stage: 'rr', round: roundNo,
        aId: pr[0], bId: pr[1], sa: null, sb: null, tapsA: [], tapsB: [],
        scored: false, autoBye: false, winnerId: null, loserId: null
      });
    });
    if (res.bye) game.rrByes.push(res.bye);
    game.rrRoundsGenerated = roundNo;
    return roundNo;
  }

  // Scoring an RR match: records the score and NOTHING else — in
  // particular it never generates a round.
  function scoreRRMatch(game, def, matchId, sa, sb) {
    const m = game.matches.find(function (x) { return x.id === matchId; });
    if (!m) return false;
    m.sa = sa; m.sb = sb; m.scored = true;
    const out = matchOutcome(def, m);
    m.winnerId = out ? out.winner : null;
    m.loserId = out ? out.loser : null;
    return true;
  }

  const Engines = {
    uid: uid, pairKey: pairKey, nextPow2: nextPow2,
    matchOutcome: matchOutcome, tapsTotal: tapsTotal,
    seedPositions: seedPositions,
    buildSingleElim: buildSingleElim, buildDoubleElim: buildDoubleElim,
    resolveBracket: resolveBracket, scoreBracketMatch: scoreBracketMatch,
    computeStandings: computeStandings, gamesRange: gamesRange,
    buildPresetRR: buildPresetRR, buildRemainingRR: buildRemainingRR,
    createResultsBasedRR: createResultsBasedRR, generateNextRRRound: generateNextRRRound,
    scoreRRMatch: scoreRRMatch, rrGamesPlayed: rrGamesPlayed,
    rrAllRoundsScored: rrAllRoundsScored, rrComplete: rrComplete
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engines;
  if (typeof window !== 'undefined') window.Engines = Engines;
})();
