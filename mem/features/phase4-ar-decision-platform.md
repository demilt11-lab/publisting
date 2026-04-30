---
name: Phase 4 A&R Decision Platform
description: Opportunity scoring, lifecycle states, automation rules, portfolio dashboard, smart recommendations
type: feature
---
Phase 4 evolves Publisting from lookup intelligence into an A&R decision platform.

**Tables**
- `opportunity_scores`: composite 0-100 score per (entity_type, entity_key) with momentum/chart/alert/network/signing-gap components, lifecycle_state (emerging|accelerating|peaking|stable|declining|dormant), explanation, signals JSON.
- `automation_rules`: trigger_type (opportunity_score|lifecycle_change|alert_event), action_type (add_to_outreach|add_to_review|raise_alert|tag_priority), conditions JSON DSL, cooldown_hours, scoped per user or team.
- `automation_runs`: audit log of every fire with status (success|skipped|error).

**Edge functions**
- `opportunity-engine`: weighted-recency slope from snapshots → momentum; chart_placements_history + playlist count → chart; lookup_alerts (14d) → alert velocity; collaborator_edges → network; missing canonical row → signing gap. Cron 03:45 UTC.
- `automation-runner`: cron sweep at 04:00 UTC + DB trigger `trg_dispatch_automation_on_alert` invokes runner via pg_net on every new lookup_alert + manual /run from admin UI. Cooldown enforced via automation_runs lookback.
- `smart-recommendations`: combines opportunity_scores + collaborator-graph proximity to user's favorites/team watchlist + momentum boost. Excludes already-tracked entities.

**Pages**
- `/portfolio`: team/personal toggle (uses TeamContext), filter by entity_type/lifecycle/min_score/search, smart recommendations grid, ranked targets with component breakdown.
- `/admin/automation-rules`: rule CRUD with scope select (team/personal), JSON conditions/action_params editors, per-rule "Run now" + "Run all now", recent runs feed.
