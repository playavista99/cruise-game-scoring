# Cruise Game Scoring App

A static web app that replaces the paper name-and-score sheets cruise
activity staff use for deck games. One phone or tablet runs everything;
it works fully offline after the first load.

**Formats:** Quick Score leaderboard · Bracket (single + double
elimination) · Round Robin (pre-set schedules, or results-based Swiss
pairing with a manual "pair next round" button, plus an optional
playoff bracket seeded from the final standings).

**Games:** Soccer Shootout, Hole-in-One Golf, Bean Bag Toss, Pop Darts,
Axe Throw, Shuffleboard, Mini Golf — every scoring rule editable at
setup and mid-game — plus a custom game builder with export/import
codes so a whole activity team can run identical setups.

**Quick Score rounds:** Quick Score games can optionally play in
rounds (set at setup; brackets and round robins are unaffected). Two
scoring bases: **Cumulative** — each round's score adds to a running
total — or **Advance** — reach the round's target to stay in; anyone
below it is out (if nobody reaches a target, the round's top scorer(s)
advance instead, so a game never dead-ends). Round targets can be
planned at setup *and/or* set or changed on the summary screen after
each round, and rounds keep being added until staff finish the game —
there is no fixed round count. Finishing crowns the best running total
(Cumulative) or the best score in the final round among those still in
(Advance); ties are joint winners. The finish screen and history show
a round-by-round breakdown, and Play Again keeps the rounds setup.
Games saved before rounds existed load as classic Quick Score.

**Mid-game walk-ups:** players can join after a game has started.
Quick Score always allowed walk-ups; brackets accept them only while
no match has been scored (the bracket is rebuilt with the newcomer as
last seed). In a **pre-set round robin**, adding a player regenerates
the remaining schedule: scored matches are kept exactly as they are,
unscored pairings are rebuilt so everyone still gets their full game
count — and if the round robin was already complete, the newcomer is
rotated in against players who each get one extra game so they can
play. A **↻ Regenerate remaining schedule** button does the same
rebuild on demand (two-tap confirm). In a **results-based round
robin**, a walk-up joins the pool immediately (their standings row
says "Joins next round") and is paired when staff pair the next
round. Adds close once a playoff bracket has started.

**Editing players:** the **👥 Edit players** button on the play
screen (every format) opens an editor for the current game: fix a
name or cabin (handy for sign-up typos — the sign-up list itself also
edits names inline via the ✎ on each row), change a player's color,
**replace a player with a substitute** — the substitute takes over
that player's scores, matches and color, so a mid-game dropout costs
nothing — or **swap two players' identities**, trading their names,
cabins and colors while scores stay with the slots. Substitutions
and swaps are recorded on the finish screen, in history, and in the
shared results text ("Subs: Maria for John"). Finished games in
history are a record and can't be edited.

**Playoff field & bracket view:** when a round robin with a playoff
finishes, *Start playoff* opens a **field screen** before anything is
built: the top 2 / 4 / 8 from the final standings (size and
single/double style adjustable there), each seed with its standings
line. Any seed can be **replaced** with another player from the
standings — for someone who can't stay for the playoff — and the field
can be reset to the standings at any time. *Generate bracket* then
builds the bracket with standard seeding (1v8, 5v4, 3v6, 7v2, so 1
and 2 can't meet before the final). While no playoff match has been
scored, **↻ Regenerate bracket** returns to the field screen (field
preserved) and generating again rebuilds the bracket wholesale; once
a playoff match is scored the field is locked (use Edit players to
swap a person). The **🏆 View bracket** button — on round robin
playoffs and standalone bracket games alike — shows the whole bracket
as one chart: every round, with undecided slots reading "Winner of
Semifinal 1" / "Loser of Winners SF 2" instead of match numbers, and
matches can be scored right from the chart. A slot whose feeder match
has been decided shows that winner's (or loser's) name right away,
even before the other feeder is played — the match itself still only
becomes scorable once both players are set. These are format-level
features — they work the same for every game, built-in or custom.

**Entry colors — your choice at setup:** player colors are a setup
option, not automatic. The setup screen's *Player colors* toggle
defaults **on for Bean Bag Toss only** (the bags themselves are
colored) and **off for every other game**; flip it either way before
the game starts. When on, every player or team gets a color (Red,
Blue, Green, Yellow, Orange, Purple, Black, White) in sign-up order —
so Bean Bag starts Red vs Blue — changeable by tapping the color
swatch on the sign-up row, and the color dot follows the entry
through play, standings, brackets, results and history (Bean Bag
tap-by-tap scoring blocks are also tinted). When off, there is no
color UI anywhere and entries carry no color at all. Games saved
before the choice existed simply keep showing their colors.

**Game labels:** the setup screen's optional *Game label* names a
specific game — "Soccer Shootout — Day 1", "Soccer Shootout
Tournament" — and then titles it everywhere the game's name appears:
the play screen (base game name kept in the sub-line), home,
history, the results screen and the shared results text. The label
can also be set or changed later in the ⚙ Game settings screen.

**Saved setups:** *💾 Save these settings* on the setup screen stores
the whole configuration — base game, edited scoring rules, format
and its options, Quick Score rounds plan, colors choice and label —
under a name you pick. The home screen's *Saved setups* section
launches one straight to sign-up with two taps (▶ Start); players
are never stored, they sign up fresh each time. A setup whose custom
game template has been deleted is greyed out and can't start.
Setups are stored **on-device only** (localStorage, like games and
history) — they deliberately do not sync through Supabase; cloud
sync would need a new table and is out of scope.

**Cruises:** the home screen's *Cruises* section files a whole
sailing's games together. *➕ New cruise* asks for a name (ship and
start/end dates are optional); opening a cruise shows its page: a
**summary card** (games played, the whole roster counted as
players, and a wins tally
per player — joint winners each count), its in-progress and finished
games, and a **roster** — the cruise's own player list. Anyone who
plays a game in the cruise joins the roster automatically (matched
by name; a cabin learned later fills in), including mid-game
walk-ups; substitutes brought in through Edit players do not join.
The roster can also be managed by hand on the cruise page (add,
edit, remove — removing someone never changes games already
played). At sign-up inside a cruise (Individuals), the roster
appears as tap-to-pick rows: tap who is playing, leave the no-shows
untapped. On **any** sign-up, *Copy players from another game…*
adds a previous game's players to the list (same-cruise games
first, names already listed skipped), ready to edit before
starting. *Delete cruise* removes the cruise and its roster only —
its games stay, as standalone games. Deeper stats analysis is a
planned later phase; the summary's wins tally is its seed.

**Data:** games, templates, saved setups, cruises and history are stored in
the browser's localStorage on the device. Nothing about players or
games leaves the device. An optional staff account (Supabase Auth)
syncs *custom templates only* across a staffer's devices.

**☰ Menu (top right):** *Install this app* (PWA install prompt, or
Add-to-Home-Screen instructions) · *Share / QR code* (a QR code for
this site's URL, generated on-device by `qr.js` — nothing is fetched —
plus Share / Copy link) · *Join the WhatsApp group* (only shown when
`WHATSAPP_GROUP_URL` is set in `config.js`) · *Send feedback*. The
same feedback form is also behind the **Send feedback** button at the
bottom of the home page. Feedback is written to the Supabase
`feedback` table (insert-only — see below). The menu's **App
version** section shows the running version, checks the published
`version.json` automatically whenever the menu opens (and on demand
via *Check for updates*), and — when a newer version is published —
shows an **⬆ Update now** button that activates any waiting service
worker, clears the offline shell caches, and reloads into the new
build. A failed check (normal on ship Wi-Fi) simply says it can't
check right now.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `engines.js` | Tournament engines (brackets, round robin, Swiss pairing, standings) — shared by the page and the tests |
| `qr.js` | QR Code Generator for JavaScript (Kazuhiko Arase, MIT) — draws the share QR code on-device, works offline |
| `config.js` | Supabase URL + anon key for the optional account (blank = accounts off), plus `WHATSAPP_GROUP_URL` for the menu's WhatsApp entry (blank = entry hidden) |
| `version.json` | Published version marker, fetched by the menu's update check |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline shell / installable PWA bits |
| `supabase/schema.sql` | One-time database setup for the optional account |
| `tests/engines.test.mjs` | Engine verification: `node tests/engines.test.mjs` |
| `tests/quick-rounds.test.mjs`, `tests/rr-adds.test.mjs`, `tests/edit-players.test.mjs`, `tests/playoff-field.test.mjs`, `tests/winner-flow.test.mjs`, `tests/setup-features.test.mjs`, `tests/cruises.test.mjs`, `tests/update-check.test.mjs` | End-to-end DOM tests (jsdom) driving the shipped app: `node tests/<name>.test.mjs` |

## Release checklist

Every release bumps **four things together** — if any one is left
behind, the update check and the offline shell disagree about what
"current" means:

1. `APP_VERSION` in `app.js` (the code's single source of truth).
2. The `version` value in `version.json` (what the menu's update
   check fetches).
3. The menu fallback version line in `index.html` (what shows before
   JavaScript runs; the app rewrites it from `APP_VERSION` on load).
4. The service-worker cache name in `sw.js` (`cgsa-shell-vNN`, one
   higher than the previous release).

## Hosting (GitHub Pages)

1. Create a **public** repository named `cruise-game-scoring` and push
   these files to its `main` branch (site files at the repo root).
2. In the repo: **Settings → Pages → Deploy from a branch → main / (root)**.
3. The app is then live at `https://<account>.github.io/cruise-game-scoring/`.

## Enabling the optional staff account (Supabase)

Accounts are optional and the app works without them. To switch them on:

1. At [supabase.com](https://supabase.com), create a **new project**
   (any name, e.g. `cruise-game-scoring`).
2. In the project, open **SQL Editor**, paste in `supabase/schema.sql`,
   and run it. That creates the `templates` table with owner-only
   Row Level Security, **and the `feedback` table** (insert-only:
   anyone can send feedback from the app, nobody can read it back
   through the API — read submissions in the Supabase Table editor).
   Feedback needs that table: if it hasn't been created yet, the
   app's feedback form reports that the message couldn't be sent
   instead of pretending it worked.
3. In **Project Settings → API**, copy the **Project URL** and the
   **anon public** key (never the service_role key).
4. Paste both into `config.js` in this repo and commit.
5. Optional: under **Authentication → Providers → Email**, decide
   whether new accounts must confirm their email before signing in.

After that, the **Account** button in the app offers sign-in/sign-up,
and a signed-in staffer's custom templates sync across their devices.
