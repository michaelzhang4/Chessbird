# Adding content to Chessbird (the guide)

Everything is one command via the helper. Open a terminal (PowerShell) **in the project
folder** and use `scripts\cb.cmd`. You never touch Node paths or the deploy steps yourself.

> The flow is always: **1) import** (creates/updates a set) → **2) deploy** (publishes it).
> After deploying, the new set appears at https://michaelzhang4.github.io/Chessbird/ within ~1 min.

---

## The commands

```
scripts\cb.cmd study   <studyId> <set-id> "Title"            # Lichess study → tactics (1 puzzle per chapter)
scripts\cb.cmd study   <studyId> <set-id> "Title" b expand   # Lichess study → BLACK repertoire drill (full tree)
scripts\cb.cmd puzzles "<OpeningTag>" <set-id> "Title" 500   # puzzle DB → tactics for one opening
scripts\cb.cmd woodpecker                                    # re-import everything in scripts\studies.json
scripts\cb.cmd manifest                                      # rebuild the library index (after deleting a set)
scripts\cb.cmd preview                                       # run locally at http://localhost:5173 (Ctrl+C to stop)
scripts\cb.cmd deploy  "what I added"                        # build + publish to GitHub Pages
```

`set-id` = a short lowercase-with-dashes name, unique per set (it's the filename). `Title` = what
shows in the app (keep the quotes).

---

## Recipes

### Add a tactics study from Lichess
1. Find a study, e.g. `https://lichess.org/study/`**`fmCGaziQ`** — the code is the study ID.
2. `scripts\cb.cmd study fmCGaziQ my-set "My Tactics"`
3. `scripts\cb.cmd deploy "add my tactics"`

### Add an opening repertoire to drill (as Black)
```
scripts\cb.cmd study VV8eF6Ge my-repertoire "My Repertoire (Black)" b expand
scripts\cb.cmd deploy "add repertoire"
```
`b` = you play Black (use `w` for a White repertoire). `expand` = include all the sidelines,
not just the main line. The opponent's moves auto-play; you play your side.

### Add tactics for a specific opening (from the puzzle database)
```
scripts\cb.cmd puzzles "Sicilian_Defense_Najdorf" najdorf-tactics "Najdorf Tactics" 500
scripts\cb.cmd deploy "add najdorf tactics"
```
- The **opening tag** is Lichess's name with underscores. To find it: open a puzzle on
  lichess.org, look at the opening name shown, and join the words with `_`
  (e.g. "Sicilian Defense: Hyperaccelerated Dragon" → `Sicilian_Defense_Hyperaccelerated_Dragon`).
  A loose word works too — `"Dragon"` matches every Dragon line.
- `500` is how many to keep (most-popular first). This command downloads a ~300 MB database
  each time and takes a few minutes — that's normal.

### Add a bunch of Woodpecker studies at once
1. Open `scripts\studies.json`, add the study IDs (just the codes) to the list.
2. `scripts\cb.cmd woodpecker`  (fetches, converts, dedups, prints an analysis)
3. `scripts\cb.cmd deploy "more woodpecker"`

### Remove a set
1. Delete its file in `static\data\sets\` (e.g. `my-set.json`).
2. `scripts\cb.cmd manifest`  (updates the index)
3. `scripts\cb.cmd deploy "remove my-set"`

### Try before publishing
`scripts\cb.cmd preview` → open http://localhost:5173 → click around. Ctrl+C to stop, then
`deploy` when happy.

---

## How it fits together
- Each import writes a file to `static\data\sets\<set-id>.json` and refreshes
  `static\data\manifest.json` (the library index) automatically.
- `deploy` builds the site and pushes it to the `gh-pages` branch, which GitHub Pages serves.
  No GitHub Actions, no tests run on push.
- Your solving **progress** lives only in your browser (not in these files). On iPhone, "Add to
  Home Screen" keeps it durable, and use **Settings → Export** for backups.

## If something breaks
- *"Node.js not found"* → install from https://nodejs.org, close and reopen the terminal.
- *Push asks for login* → sign in to GitHub once; it's remembered after that.
- *A study won't import (403)* → it's private or has PGN download disabled on Lichess; ask the
  owner to make it public, or pick another study.
