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

**Entry colors:** every player or team in every game gets a color
(Red, Blue, Green, Yellow, Orange, Purple, Black, White), assigned
automatically in sign-up order — so Bean Bag Toss starts Red vs Blue —
and changeable by tapping the color swatch on the sign-up row. The
color dot follows the entry through play, standings, brackets,
results and history; in Bean Bag Toss tap-by-tap scoring each side's
scoring block is also tinted with its color.

**Data:** games, templates and history are stored in the browser's
localStorage on the device. Nothing about players or games leaves the
device. An optional staff account (Supabase Auth) syncs *custom
templates only* across a staffer's devices.

**☰ Menu (top right):** *Install this app* (PWA install prompt, or
Add-to-Home-Screen instructions) · *Share / QR code* (a QR code for
this site's URL, generated on-device by `qr.js` — nothing is fetched —
plus Share / Copy link) · *Join the WhatsApp group* (only shown when
`WHATSAPP_GROUP_URL` is set in `config.js`) · *Send feedback*. The
same feedback form is also behind the **Send feedback** button at the
bottom of the home page. Feedback is written to the Supabase
`feedback` table (insert-only — see below).

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `engines.js` | Tournament engines (brackets, round robin, Swiss pairing, standings) — shared by the page and the tests |
| `qr.js` | QR Code Generator for JavaScript (Kazuhiko Arase, MIT) — draws the share QR code on-device, works offline |
| `config.js` | Supabase URL + anon key for the optional account (blank = accounts off), plus `WHATSAPP_GROUP_URL` for the menu's WhatsApp entry (blank = entry hidden) |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline shell / installable PWA bits |
| `supabase/schema.sql` | One-time database setup for the optional account |
| `tests/engines.test.mjs` | Engine verification: `node tests/engines.test.mjs` |

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
