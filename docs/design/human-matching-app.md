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

## 3. Screens

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

## 5. Data model (proposed migration `030_human_matching.sql`)

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
  claim_kind text NOT NULL CHECK (claim_kind IN ('match','review')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);

CREATE TABLE IF NOT EXISTS match_suggestions (
  suggestion_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wg_name text NOT NULL,
  wg_type text,
  queue_status text NOT NULL CHECK (queue_status IN ('ambiguous','unresolved')),
  decision text NOT NULL CHECK (decision IN ('match','no_equivalent')),
  entry_id bigint REFERENCES pf2e_catalog_entries(entry_id),
  pf2e_name text,                 -- copied at suggest time, for the audit trail
  class_id text REFERENCES classes(class_id),
  note text,
  suggested_by text NOT NULL REFERENCES match_reviewers(reviewer_name),
  suggested_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'suggested' CHECK (state IN ('suggested','approved','rejected')),
  CHECK ((decision = 'match') = (entry_id IS NOT NULL))
);
-- At most one open suggestion per WG name.
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_suggestion ON match_suggestions (wg_name) WHERE state = 'suggested';

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

## 6. How approvals feed the existing tables (approval only)

Everything happens in one transaction on **Approve**. Suggest and Reject never touch these tables.

1. Insert the `match_reviews` row (the trigger enforces the two-person rule).
2. Set the suggestion's `state` to `approved` or `rejected`.
3. If approved:
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
| GET | `/api/status` | Counts: queue, open suggestions, approved, rejected |

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
9. Every keyboard shortcut in section 7 works.

## 11. Open questions

1. Should all 4,924 unresolved items go in the queue, or only the 6 ambiguous ones plus unresolved items that have at least one good candidate (similarity > 0.4)? Many unresolved items are likely WG-only or homebrew.
2. Should an approved alias be scoped to one class (`class_id`) or apply globally? The default proposal is global unless the suggester picks a class.
3. Who are the reviewers, and is LAN access wanted or localhost only?
4. Should we move to Postgres row locks (`SELECT ... FOR UPDATE SKIP LOCKED`) if more than about 3 people use it at once?
5. Should approved decisions also be exported as a migration file, so the VPS can get them later through the normal migration process?
6. Should a rejection allow the same pick to be suggested again, or block it?
