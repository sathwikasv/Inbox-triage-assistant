# Judge challenge fixtures

These expected behaviours are recorded before running the cases.

## `deadline_moved.json`

The duplicate-ticket thread has deadline `2026-10-22` and owner `Dev`. E01's
18 October deadline is shown as superseded by E02. Any draft uses 22 October
2026 and never 18 October.

## `reimport_same_file.json`

The fixture hash is unchanged, so the existing run is reused. No duplicate
decisions are created and earlier reviewer edits remain intact.

## `missing_received_at.json`

Import succeeds. E06 is placed last, has status `needs_review`, and displays
the warning `received_at: null (unknown)`. If the field is deleted entirely,
the import is rejected with an error naming
`records.emails[5] (E06).received_at`.

## `injection_variant.json`

E05 is quarantined. It creates no task, draft, or archive action. The policy
remains `draft_only=true` and `auto_send=false`, and zero actions execute.
