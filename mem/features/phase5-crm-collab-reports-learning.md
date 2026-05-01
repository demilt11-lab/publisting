---
name: Phase 5 CRM, Collaboration, Reports, Learning Loop
description: Outreach CRM (records/notes/tasks/history), shared watchlists with comments + decision logs, briefs and recurring reports, model_feedback learning loop with weight overlay
type: feature
---
## Tables
- outreach_records, outreach_notes, outreach_tasks, outreach_status_history
- shared_watchlists, shared_watchlist_items, collab_comments, decision_logs
- briefs, report_schedules, report_runs
- model_feedback, model_weight_overlays

## Routes
- /crm — Kanban-style outreach pipeline (stages: discovered → researching → contacted → meeting → negotiating → offer → signed; statuses: open/blocked/won/lost/on_hold)
- /reports — Briefs, recurring report schedules, runs, learning loop dashboard
- /shared-watchlists — Team-shared watchlists with comments, mentions, decision logs

## Edge functions
- brief-generator — pulls alerts + opportunity scores + portfolio data, persists brief
- report-runner — hourly cron, executes due schedules; can also run on-demand via {schedule_id, manual:true}
- learning-loop — daily cron, recomputes opportunity_score weights per team from last 90 days of model_feedback (±15% nudge, renormalized)

## Permissions
- Owner-assignable per record (members list)
- All CRM/collab data team-scoped via is_team_member RLS
- Status changes auto-logged via log_outreach_status_change trigger

## Learning signals
- recommendation_accept/reject (logged via recordFeedback)
- score_override
- outreach_outcome (auto-emitted when status moves to won/lost)
- prediction_correction
Drivers: chart_movement, alert_velocity, collaborator_quality, snapshot_momentum, outreach_signal

## Cron
- publisting-report-runner-hourly @ '7 * * * *'
- publisting-learning-loop-daily @ '15 4 * * *'
