# Migrations

`../schema.sql` is a full snapshot, used only when standing up a new project.
Every change after that lives here as its own file.

- Name: `0001-add-lark-record-id.sql` — four digits, then a short slug.
- Forward-only. No automatic down migrations.
- Must stay backwards compatible for one release, so rolling the code back does
  not break the database. Renames and drops take two releases:
  1. add the new column, write to both;
  2. next release, drop the old one.
- Order of operations: staging → verify → production → **then** deploy the code
  that depends on it.
- Only ARCH and DEV-BE write here, and only after an approved ADR.
