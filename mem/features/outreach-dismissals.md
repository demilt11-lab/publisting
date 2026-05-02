---
name: Outreach Dismissals (No-Response Memory)
description: Per-team list of entities (artist/writer/producer/track/catalog) that did not respond. Hides them from outreach lanes by default and remembers the name so future imports/alerts/recommendations can flag re-encounters.
type: feature
---
Table: `public.outreach_dismissals`
- Unique on `(team_id, entity_type, entity_key)`
- RLS: only `is_team_member(auth.uid(), team_id)` can view/insert/update/delete.
- Inserted via `dismissEntity()` (upsert), removed via `undismissEntity()`.

UI surfaces:
- `/crm` lane cards have hover `EyeOff` button → calls `dismissEntity` with reason "Did not respond".
- Header shows count + "Show/Hide dismissed" toggle and a "Dismissed entities" dialog with Restore action.
- Drawer footer has Dismiss/Restore button.

Future integrations (alerts evaluator, smart-recommendations, automation-runner) should query `outreach_dismissals` and either skip dismissed entries or annotate them as "previously dismissed: {reason}" instead of re-creating outreach records silently.
