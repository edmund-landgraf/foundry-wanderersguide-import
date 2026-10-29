# Human matching app (design only, not built)

Status: design. Nothing here is deployed. Target DB: local `wgi_rules` on DAEDALUS (`my-postgres`), only.

## 1. Purpose and non-goals

**Purpose:** let people resolve the WG -> PF2e 8.6.1 matches the database can't settle by itself. A person suggests a match, and a *different* person approves or rejects it.

**Non-goals:**
- No automatic associations. The app never writes a match without a second person's approval.
- No editing of PF2e data, WG data, or rename rules.
- No deployment to the VPS, and no access to any other database (AMBA's `AdventureMakerByAct`, `appdb`, etc.).
- No accounts, roles, or permissions beyond a reviewer's name.

When there is nothing to match or review, the app does nothing and shows only:

> **No ambiguous data left to match.**

## 2. Where the queue comes from (existing schema)

| Source | Used for |
|---|---|
| `wg_pf2e_catalog_matches` (migration 028): `wg_id, wg_name, wg_type, entry_id, pf2e_name, match_strategy, status, candidate_count` | Queue rows where `status IN ('ambiguous','unresolved')` (same filter as the `wg_pf2e_unresolved` view) |
| `wg_keyword_snapshot.row_data` (`source_table='ability_block'`) | WG side: name, type, level, traits, `description`, `prerequisites`, `content_source_id` |
| `pf2e_catalog_entries` (023): `entry_id, item_kind, foundry_type, pf2e_name, pf2e_slug, compendium_collection, source_path, category, traits, level, class_id` | Candidates and search |
| `D:\repos\foundryvtt_pf2e\<source_path>` at tag `pf2e-8.6.1` | Description snippet (`system.description.value`, HTML stripped, first ~300 chars), read at runtime. The catalog has no description column. |
| `compendium_match_aliases` (`status` = proposed/active/retired) | Where approved decisions are written (section 6) |

One queue item = one distinct `wg_name` (several WG ids can share a name, e.g. Taunt). Ambiguous items come first, then unresolved, both by name. That's 6 ambiguous rows and 4,924 unresolved today.

What a person sees for each item:
- **WG:** name, type, level, traits, class (from WG traits if present), source id, and the description text.
- **Candidates:**
  - Ambiguous items: the rows in `wg_pf2e_catalog_matches` with that name.
  - Unresolved items: the top 5 catalog entries by name similarity (`pg_trgm` `similarity()` on `lower(pf2e_name)`, read-only).
  - Each candidate shows name, item kind, class, level, traits, file path and a description snippet.
- **Search box:** free-text search of `pf2e_catalog_entries.pf2e_name`, so a person can pick any 8.6.1 entry.
- **No PF2e equivalent:** records that WG has no PF2e match (homebrew or WG-only content).
- **Skip:** releases the item. Nothing is recorded.

## 3. Screens (Book picker, Match within a book, Review, Many-to-one check; see 5b, 5c)

1. **Match:** the next unclaimed queue item, its candidates, the search box, and the buttons *Suggest*, *No PF2e equivalent* and *Skip*. An optional one-line note can be added.
2. **Review:** the next pending suggestion that *someone else* made. It shows the same WG and PF2e detail plus who suggested it and their note. Buttons: *Approve* or *Reject* (a reason is required to reject).
3. **Empty state:** if there's nothing to match and nothing to review for this person, the page shows only "No ambiguous data left to match." If items are only waiting on other reviewers, it adds one smaller line: "N suggestions waiting for another reviewer."

There are two tabs at the top (Match, Review) with counts, and a name box (section 7).

## 4. Workflow

```
queued (ambiguous | unresolved)
   └─ Suggest / No equivalent ──> suggested
                                   ├─ Approve (different person) ──> approved ──> written to aliases (section 6), leaves queue
                                   └─ Reject (reason) ─────────────> rejected ──> back to queue (shows past rejections)
   └─ Skip ──> queued (claim released)
```

Rules:
- One open suggestion per WG name at a time. Its item drops out of Match until reviewed.
- The suggester can never review their own suggestion. This is enforced in SQL (section 5), not just in the UI.
- Rejected items come back to Match showing earlier rejected picks and their reasons.
- Suggestions never change anything outside the new tables.

## 5. Data model (proposed migration `032_human_matching.sql`)

> Source of machine suggestions: `030_wg_name_normalized_proposals.sql` fills `wg_pf2e_name_proposals` (status `proposed`/`ambiguous`, never final) and `pf2e_unmatched_entries` (`unmatched` vs `out-of-scope` by PF2e source book). These feed the review queue; they are not associations.

No UUIDs. Identity keys, names and slugs only. Every table records who did what and when.

```sql
BEGIN;
CREATE TABLE IF NOT EXISTS match_reviewers (
  reviewer_name text PRIMARY KEY CHECK (reviewer_name ~ '^[A-Za-z][A-Za-z0-9 _.-]{1,39}$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Short-lived lock so two people don't work the same item.
CREATE TABLE IF NOT EXISTS match_claims (
  wg_name text PRIMARY KEY,
  claimed_by text NOT NULL REFERENCES match_reviewers(reviewer_name),
  claim_kind text NOT NULL CHECK (claim_kind IN ('match','review','m2o')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);

CREATE TABLE IF NOT EXISTS match_suggestions (
  suggestion_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wg_name text NOT NULL,
  wg_type text,
  kind text NOT NULL DEFAULT 'match' CHECK (kind IN ('match','many_to_one')),
  queue_status text CHECK (queue_status IN ('ambiguous','unresolved')),   -- kind='match' only
  catalog_match_id bigint,          -- kind='many_to_one': the wg_pf2e_catalog_matches row being checked
  wg_id bigint,                     -- kind='many_to_one': the WG row being checked
  decision text NOT NULL CHECK (decision IN ('match','no_equivalent','confirm','deny')),
  entry_id bigint REFERENCES pf2e_catalog_entries(entry_id),
  pf2e_name text,                 -- copied at suggest time, for the audit trail
  class_id text REFERENCES classes(class_id),
  note text,
  suggested_by text NOT NULL REFERENCES match_reviewers(reviewer_name),
  suggested_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'suggested' CHECK (state IN ('suggested','approved','rejected')),
  CHECK (kind <> 'match' OR decision IN ('match','no_equivalent')),
  CHECK (kind <> 'many_to_one' OR (decision IN ('confirm','deny') AND wg_id IS NOT NULL AND entry_id IS NOT NULL)),
  CHECK (decision <> 'match' OR entry_id IS NOT NULL)
);
-- At most one open suggestion per WG name (match) / per WG row + PF2e target (many_to_one).
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_suggestion ON match_suggestions (wg_name) WHERE state = 'suggested' AND kind = 'match';
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_m2o ON match_suggestions (wg_id, entry_id) WHERE state = 'suggested' AND kind = 'many_to_one';

-- Human verdicts on automated matches. Never deletes: a denied match is flagged, and 028 skips it.
CREATE TABLE IF NOT EXISTS wg_match_verifications (
  wg_id bigint NOT NULL,
  entry_id bigint NOT NULL REFERENCES pf2e_catalog_entries(entry_id),
  verdict text NOT NULL CHECK (verdict IN ('confirmed','denied')),
  suggestion_id bigint NOT NULL REFERENCES match_suggestions(suggestion_id),
  approved_by text NOT NULL REFERENCES match_reviewers(reviewer_name),
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wg_id, entry_id)
);

-- Many-to-one groups: one PF2e entry with more than one resolved WG row.
CREATE OR REPLACE VIEW many_to_one_queue AS
SELECT m.entry_id, e.pf2e_name, m.match_id AS catalog_match_id, m.wg_id, m.wg_name, m.wg_type, m.match_strategy,
       count(*) OVER (PARTITION BY m.entry_id) AS group_size
FROM wg_pf2e_catalog_matches m
JOIN pf2e_catalog_entries e USING (entry_id)
WHERE m.status IN ('active','proposed')
  AND m.entry_id IN (SELECT entry_id FROM wg_pf2e_catalog_matches
                     WHERE status IN ('active','proposed') AND entry_id IS NOT NULL
                     GROUP BY entry_id HAVING count(*) > 1)
  AND NOT EXISTS (SELECT 1 FROM wg_match_verifications v WHERE v.wg_id = m.wg_id AND v.entry_id = m.entry_id)
  AND NOT EXISTS (SELECT 1 FROM match_suggestions s WHERE s.kind = 'many_to_one' AND s.state = 'suggested'
                  AND s.wg_id = m.wg_id AND s.entry_id = m.entry_id);

CREATE TABLE IF NOT EXISTS match_reviews (
  review_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  suggestion_id bigint NOT NULL UNIQUE REFERENCES match_suggestions(suggestion_id),
  verdict text NOT NULL CHECK (verdict IN ('approved','rejected')),
  reason text,
  reviewed_by text NOT NULL REFERENCES match_reviewers(reviewer_name),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (verdict = 'approved' OR coalesce(trim(reason), '') <> '')
);

-- Two-person rule, enforced in the database.
CREATE OR REPLACE FUNCTION match_reviews_two_person() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM match_suggestions s
             WHERE s.suggestion_id = NEW.suggestion_id AND s.suggested_by = NEW.reviewed_by) THEN
    RAISE EXCEPTION 'A suggester cannot review their own suggestion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM match_suggestions s
                 WHERE s.suggestion_id = NEW.suggestion_id AND s.state = 'suggested') THEN
    RAISE EXCEPTION 'Suggestion is not open';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_match_reviews_two_person ON match_reviews;
CREATE TRIGGER trg_match_reviews_two_person BEFORE INSERT ON match_reviews
  FOR EACH ROW EXECUTE FUNCTION match_reviews_two_person();

-- Human-confirmed "WG has no PF2e equivalent" (keeps the row honest without defaulting).
CREATE TABLE IF NOT EXISTS wg_no_pf2e_equivalent (
  wg_name text PRIMARY KEY,
  suggestion_id bigint NOT NULL REFERENCES match_suggestions(suggestion_id),
  approved_by text NOT NULL REFERENCES match_reviewers(reviewer_name),
  approved_at timestamptz NOT NULL DEFAULT now()
);

-- The queue: what still needs a person.
CREATE OR REPLACE VIEW match_queue AS
SELECT m.wg_name, min(m.wg_type) AS wg_type,
       CASE WHEN bool_or(m.status = 'ambiguous') THEN 'ambiguous' ELSE 'unresolved' END AS queue_status,
       count(DISTINCT m.wg_id) AS wg_rows
FROM wg_pf2e_catalog_matches m
WHERE m.status IN ('ambiguous', 'unresolved')
  AND NOT EXISTS (SELECT 1 FROM match_suggestions s WHERE s.wg_name = m.wg_name AND s.state IN ('suggested', 'approved'))
  AND NOT EXISTS (SELECT 1 FROM wg_no_pf2e_equivalent n WHERE n.wg_name = m.wg_name)
GROUP BY m.wg_name;
COMMIT;
```

## 5b. Many-to-one check (third screen)

**Why:** the automated matching assumes several WG entries all mean the same PF2e entry. Each of those assumptions should be checked by a person, and then confirmed by a second person.

**Groups (real counts, local `wgi_rules`, 2026-10-28):** `wg_pf2e_catalog_matches` with `status IN ('active','proposed')`, grouped by `entry_id HAVING count(*) > 1`.
- 1,506 PF2e entries have more than one WG row: 3,625 WG rows in total, out of 9,301 resolved rows.
- 995 of those groups (2,417 rows) contain *different* WG names (e.g. "X" and "X (legacy)"). The other 511 groups are the same name repeated in WG.
- Largest groups: Weapon Specialization 29, Weapon Expertise 23, Perception Expertise 21, Skillful Lessons 18, Reflex Expertise 18.
- Groups with different names come first, then the rest, largest first.

**Screen:** shows one PF2e target (name, kind, class, level, traits, path, description snippet) and a table with **one row per WG entry** in the group: WG name, type, level, traits, source id, how it was matched (`keyword`/`exact`/`alias`), and a description snippet. Each row has **Confirm** and **Deny** (a reason is required to deny). Rows are decided one at a time; there's no "confirm all". The person claims the whole group (`match_claims.wg_name` = `'m2o:' || entry_id`).

**Flow:**
```
automated match (unverified)
  └─ Confirm / Deny (person A) ──> suggested (kind='many_to_one')
         ├─ Approve (person B ≠ A) ──> wg_match_verifications row: confirmed | denied
         └─ Reject (person B)      ──> back to the many-to-one screen
```
- **Approved confirm:** the match is marked verified and leaves the screen. Nothing else changes.
- **Approved deny:** a `denied` verification is written. Nothing is deleted. The 028 rebuild skips `(wg_id, entry_id)` pairs with a `denied` verification, so that WG row falls back to `unresolved` (or `ambiguous` if other candidates remain) and reappears in the Match queue. Any alias that produced the match stays in place; if a denied pair came from an alias, the review screen notes it so a person can retire the alias separately.
- The two-person trigger covers these suggestions too, because they share `match_suggestions`/`match_reviews`.

**Review screen:** many-to-one suggestions show up in the same Review queue, labeled "Many-to-one: confirm" or "Many-to-one: deny", showing the WG row next to the PF2e target.

**Empty state:** when `many_to_one_queue` is empty, the screen shows "No many-to-one matches left to check."

**Progress counter (header, all screens):** "Assumptions verified: V / T (P%)".
- T = automated matches in `wg_pf2e_catalog_matches` (`active`/`proposed`, 9,301 today).
- V = rows in `wg_match_verifications`, plus approved match suggestions.
- Shown alongside: "many-to-one rows left: N" (3,625 today).

## 5c. Match within a book (Book picker + per-book queue)

Matching happens inside one book at a time. A WG row and a PF2e entry from the same book are far more likely to be the same thing, and a reviewer can hold one book's content in their head.

**Pairing books.** A PF2e book (`pf2e_catalog_entries.pf2e_source_book`, from `system.publication.title`) is paired with a WG `content_source` by normalized name. Normalizing means lowercase, then strip "Pathfinder", "Adventure Path:", "Adventure:", "Lost Omens", "Player's Guide", and "(backport)", "(in progress)", "(remastered)", "(legacy)". A book with only one side is listed as *unpaired*. A human can link an unpaired pair by hand; that link is itself a suggestion and goes through review.

### Book picker screen

- One row per book (paired or unpaired), showing:
  - PF2e total, matched, proposed and unmatched.
  - WG total, matched and unresolved.
  - WG slot placeholders.
  - Real queue size, and a progress bar.
- Sort by real queue size (default), name, or progress. Filter: paired, PF2e-only, WG-only, out-of-scope.
- The book's scope comes from `pf2e_book_wg_scope` (`COALESCE(override_scope, scope)`). Books marked `wg-book-absent` or `wg-book-empty` show as **Out of scope** and are collapsed by default. Changing `override_scope` is a suggestion that goes to review like any other.

### Per-book queue screen

- **Two columns side by side:**
  - Left: this book's unmatched PF2e entries (`pf2e_unmatched_entries`, minus `wg_pf2e_name_proposals`), with kind, name, level and traits.
  - Right: this book's unresolved WG `ability_block` rows, with type, name and level.
- **Fuzzy hints, never associations.** The app may show "possible match" hints, for example from bigram name similarity or a matching ancestry or class trait, with the score shown. A hint never writes anything. The human picks a left row and a right row; that pick becomes a **suggested tag** in the review queue, and a *different* human confirms or denies it (the existing two-person rule, section 4). Nothing is auto-associated, at any score.
- **Slot placeholders are structural, not matched.** These are WG level-slot rows: type `class-feature` whose name is Skill Feat, General Feat, Ancestry Feat, "<Class> Feat", Skill Increase, Attribute Boost(s), or "Runic Repertoire (Nth)". They are collapsed under a "Structural (N)" header. The human's action on them is **"structural, no PF2e item"** (one row or bulk), not a match. That too is a suggestion that goes to review. Once approved, the row leaves the real queue.
- **"Not in PF2e catalog" flag.** A WG row can be flagged when its PF2e counterpart lives in a pack the catalog doesn't import yet. This is a suggestion for review, and it feeds a catalog-coverage backlog.
- **Progress counters** in the header: unmatched left on each side, pending review, structural confirmed, and approved this session. When both columns are empty, the screen shows "No ambiguous data left to match" for this book and offers the next book.

### Worked example: Impossible Magic (snapshot 2026-10-28)

| Side | Total | Matched | Proposed | Unmatched |
|---|---|---|---|---|
| PF2e (feat/classfeature/action/heritage) | 485 | 456 | 5 | 24 |
| WG ability_block (content_source 842) | 675 | 504 | n/a | 171 |

- About 100 of the 171 WG rows are slot placeholders: Skill Feat ×20, Skill Increase ×18, Runesmith Feat ×11, Attribute Boosts ×10, General Feat ×10, Magus, Necromancer and Summoner Feat ×10 each, and Runic Repertoire 5th, 9th, 13th and 17th. They go to the Structural group.
- About 45 WG rows are Runesmith runes (for example "Atryl, Rune of Fire"). Their PF2e items are in a pack the catalog doesn't import, so they get the "Not in PF2e catalog" flag.
- Fuzzy hints a human would see, as hints only:
  - Eidolon Weapon Specialization ↔ Eidolon Weapons Specialization (0.96)
  - Unbounded Invocations ↔ Unbound Invocations (0.95)
  - Anatomical Quartering ↔ Automatic Quartering (0.74)
- The rest of the PF2e side is mostly eidolon and magus actions (Spellstrike, Arcane Cascade and others) and necromancer choices (Spirit, Reaper, Bone and others) that WG has no row for. These stay unmatched.
- What's left is about 30 items per side. That is a realistic size for a single sitting.

Across all books (see `D:\tmp\wgui-newpc\all-books-unmatched-counts.md`): 50 paired books, real queue 1,696 (725 PF2e plus 971 WG once 710 placeholders are removed). WG-only sources, mostly Starfinder and playtests, add 3,314 rows and default to out-of-scope.
## 6. How approvals feed the existing tables (approval only)

Everything happens in one transaction on **Approve**. Suggest and Reject never touch these tables.

1. Insert the `match_reviews` row (the trigger enforces the two-person rule).
2. Set the suggestion's `state` to `approved` or `rejected`.
3. If approved, for `kind='many_to_one'`: insert into `wg_match_verifications` (`confirmed` or `denied`), then rebuild 028 (which skips denied pairs). For `kind='match'`:
   - **match:** insert into `compendium_match_aliases`:
     - `source_name` = WG name, `target_name` = `pf2e_name`
     - `source_slug` = `wgi_slugify(wg name)`, `target_slug` = `pf2e_slug`
     - `item_kind` = the catalog kind, with `classfeature` stored as `feat`
     - `match_strategy` = 'canonical', `rename_via` = 'exact', `status` = 'active', `priority` = 40
     - `class_id` from the suggestion
     - `evidence_ref` = 'PF2e 8.6.1: ' || source_path, `notes` = 'human: suggested by X, approved by Y (suggestion N)'
     - `ON CONFLICT DO NOTHING`
   - **no_equivalent:** insert into `wg_no_pf2e_equivalent`.
4. Re-run the 028 rebuild (or a single-name version of it), so `wg_pf2e_catalog_matches` shows the alias as `alias/active`.

Rejection leaves `compendium_match_aliases` and 028 untouched, and the item reappears in the queue.

## 7. Auth, concurrency, keys

- **Auth (minimal):** the person types their name once; it's kept in `localStorage` and must exist in `match_reviewers` with `active = true`. An admin adds names with an `INSERT` into `match_reviewers`. The server listens on `127.0.0.1` only (or the LAN, if Edmund chooses), with no passwords. This is an honest-person model, not real security.
- **Concurrency:** opening an item claims it with `INSERT ... ON CONFLICT (wg_name) DO UPDATE ... WHERE match_claims.expires_at < now()`. A claim lasts 10 minutes and is renewed by any action. *Skip*, *Suggest* and the review buttons release it, and expired claims are ignored. Review claims are keyed by the suggestion's `wg_name` too.
- **Keyboard:**
  - Many-to-one: `↑`/`↓` move between rows, `C` confirms the row, `D` denies it
  - `1`-`9`: pick candidate N
  - `/`: focus search
  - `Enter`: Suggest the picked candidate
  - `N`: No PF2e equivalent
  - `S`: Skip
  - On Review: `A` approves, `R` rejects (focuses the reason box)
  - `Tab`: switch screens

## 8. API (JSON, about 7 endpoints)

| Method | Path | Does |
|---|---|---|
| GET | `/api/next-match?who=` | Claim and return the next queue item with its WG detail and candidates, or `{empty:true}` |
| GET | `/api/search?q=` | Up to 20 matches in `pf2e_catalog_entries` by name (ILIKE + trigram) |
| POST | `/api/suggest` | `{who, wg_name, decision, entry_id?, class_id?, note?}` creates the `match_suggestions` row |
| POST | `/api/skip` | `{who, wg_name}` releases the claim |
| GET | `/api/next-review?who=` | Claim and return the next open suggestion where `suggested_by <> who`, or `{empty:true}` |
| POST | `/api/review` | `{who, suggestion_id, verdict, reason?}`, transactional as in section 6 |
| GET | `/api/next-m2o?who=` | Claim and return the next many-to-one group with its rows, or `{empty:true}` |
| POST | `/api/m2o` | `{who, wg_id, entry_id, decision: confirm|deny, reason?}` creates a `kind='many_to_one'` suggestion |
| GET | `/api/status` | Counts: queue, open suggestions, approved, rejected, many-to-one rows left, assumptions verified |

## 9. Tech (keep it small)

- One Node script (`tools/matcher/server.mjs`) using the `pg` driver and Node's built-in `http`, serving one `index.html` with plain JS and no build step.
- It connects to `wgi_rules` on `localhost:5432` as `appuser`, with the password read from an env var and never logged. The connection string is hard-pinned to database `wgi_rules`, and the server refuses to start if the host isn't local.
- It never connects to the VPS or any other database. It writes only to the section 5 tables plus `compendium_match_aliases` and the 028 rebuild on approval.
- It reads PF2e description snippets from `D:\repos\foundryvtt_pf2e` (tag `pf2e-8.6.1`) by `source_path`.
- Start it with `node tools/matcher/server.mjs` and open `http://127.0.0.1:8787`.

## 10. Acceptance criteria

1. With an empty queue and no open suggestions, both screens show only "No ambiguous data left to match." and nothing gets written.
2. Suggesting writes only a `match_suggestions` row. `compendium_match_aliases` and `wg_pf2e_catalog_matches` are unchanged.
3. The same person can't approve their own suggestion. The UI hides it, and an `INSERT` into `match_reviews` fails at the trigger.
4. Approving a match creates exactly one active alias, and after the rebuild that WG name leaves `match_queue`.
5. Approving "No PF2e equivalent" creates one `wg_no_pf2e_equivalent` row, and the name leaves the queue.
6. Rejecting returns the item to the queue with the rejection reason shown.
7. Two browsers can't claim the same item at once, and an abandoned claim frees itself after 10 minutes.
8. Every target is a `pf2e_catalog_entries` row (8.6.1), and no UUID is stored anywhere.
9. Many-to-one: each WG row gets its own suggestion; an approved deny never deletes anything, and after the 028 rebuild that row is back in the Match queue; an approved confirm removes the row from the screen; the progress counter goes up.
10. Every keyboard shortcut in section 7 works.

## 11. Open questions

1. Should all 4,924 unresolved items go in the queue, or only the 6 ambiguous ones plus unresolved items that have at least one good candidate (similarity > 0.4)? Many unresolved items are likely WG-only or homebrew.
2. Should an approved alias be scoped to one class (`class_id`) or apply globally? The default proposal is global unless the suggester picks a class.
3. Who are the reviewers, and is LAN access wanted or localhost only?
4. Should we move to Postgres row locks (`SELECT ... FOR UPDATE SKIP LOCKED`) if more than about 3 people use it at once?
5. Should approved decisions also be exported as a migration file, so the VPS can get them later through the normal migration process?
6. Should a rejection allow the same pick to be suggested again, or block it?
