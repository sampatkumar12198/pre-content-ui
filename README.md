# Teaching Content Review Panel

Internal tool to browse and curate PrepGraph teaching content per exam → subject →
concept → microconcept → teaching unit. FastAPI backend talking directly to Postgres,
Bootstrap 5 + vanilla-JS frontend. Session login backed by a read-only Excel user list.

## What it does

- Cascading filters: pick **Exam** → its **Subjects** load → pick a **Subject** →
  its **Concepts** appear in a server-side paginated grid. With no filters it lists
  **all concepts**. **Clear** resets everything.
- Concepts grid: name, description, importance, # microconcepts, # teaching units, status,
  with **View / Edit / Soft-delete (is_active)** actions.
- **View** a concept → modal with its **microconcepts** (own View/Edit/Delete) and the
  concept's **teaching content**.
- **View** a microconcept → its **actual teaching content** (teaching units + lesson text).
- Teaching units show associated **images** (click a thumbnail to enlarge in a lightbox).
- **Copy** buttons: copy a unit's lesson text, or copy an image to the clipboard.
- Edits (incl. the **lesson text**) and soft-deletes persist to the DB.

## Login, users & roles

Access requires signing in. Users are kept in a **read-only Excel file** (`users.xlsx`,
auto-created on first run) with four columns: **`id`**, **`password`**, **`name`**, **`role`**
(`admin` or `user`).

- Default seed login: **`admin` / `admin123`** — change it (and add people) by editing
  `users.xlsx` and saving. The app never writes to this file; changes apply on next login.
- To add a user, append a row with their `id`, `password`, `name`, and `role`.
  (If you keep `users.xlsx` open in Excel the app can't add the `role` column itself — close
  it once so the column is written, or add the header yourself.)

**Roles**

- **admin** — sees and operates on every exam; gets a **Users & Access** button (top-right)
  to assign exams to non-admin users.
- **user** (non-admin) — can only see/operate on the exams an admin has assigned. The exam
  dropdown, concept grid (even with no filter), microconcepts, teaching content and images
  are all restricted to those exams server-side; everything else returns 403.

**Managing users (in-app):** sign in as an admin → **Users & Access**. From there you can:
- **Create user** — fill id / name / password / role, then Create.
- **Assign exams** — tick the exams for each non-admin user → **Save**.
- **Delete user** — trash icon (can't delete yourself or the last admin).

Creating/deleting users writes to `users.xlsx`, so **close it in Excel first** or the write
fails with "users.xlsx is open in Excel" (HTTP 423). You can still manage users by editing
the spreadsheet directly instead. Exam assignments are stored in `assignments.json` (app-managed).

> Passwords are plain text in the spreadsheet and the session secret lives in `.env`.
> Fine for a local internal tool; harden both before any deployment.

## Data model (live `prepgraph_merged6`)

- `pgca.taxonomy_nodes` — one table for `subject`/`topic`/`concept`/`micro_concept`
  (`node_type`), hierarchy via self-FK `parent_id`. Soft-delete via `is_active`
  (added by `migrations/001`).
- `pgca.exam_concept_scope` — maps `exam_id` → `concept_id` (the "scope" table).
- `catalog.exams` — exams. Subjects per exam = walk `parent_id` up to `node_type='subject'`.
- `pgca.teaching_units` (+ `pgca.tu_variants.speech_text`) — the teaching content.
  Linked to concepts via `concept_id`; to microconcepts via `primary_micro_concept_id`
  and `pgca.tu_micro_concept_refs`.

## Setup & run

**Easiest (Windows):** double-click **`run.bat`** (or run it in a terminal). It creates a
project-local `.venv`, installs deps on first run, and starts the server at
http://localhost:8000.

**Manual:** use the project venv so it doesn't depend on which global Python is active
(this machine has both Python 3.10 and 3.14 — deps must be in the one you run):

```bash
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt

# One-time: adds is_active to taxonomy_nodes + helpful indexes (idempotent).
.venv\Scripts\python scripts\apply_migration.py

.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
# open http://localhost:8000
```

> If you see `ModuleNotFoundError: No module named 'fastapi'`, you're running a different
> Python than the one the deps were installed into — use `run.bat` or the `.venv` python above.

`DATABASE_URL` is read from `.env` (the `+asyncpg` driver suffix is stripped automatically).
