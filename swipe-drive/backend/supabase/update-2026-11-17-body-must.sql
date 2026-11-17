-- SwipeToDrive BETA (branch std-beta): body or size as a must have.
-- Tapping a shape twice in the profile (or the guest start) makes it a must have: only that shape is shown.
-- NULL or false keeps today's behaviour (the shape is a would like that only lifts the score). No data changes.
-- Until this runs, the app keeps the choice in desk.body_must and the profile save quietly drops the unknown column,
-- so nothing breaks if it is run later. Run in the Supabase SQL editor when Dan approves the BETA going live.
alter table public.customers add column if not exists body_must boolean;
