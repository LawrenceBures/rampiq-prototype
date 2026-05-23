-- ================================================
-- RampIQ Events Table
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ================================================

-- Create the events table
create table if not exists rampiq_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  station       text not null default 'DFW',
  gate_id       text not null,
  event_type    text not null,
  source        text not null default 'agent_mobile',
  payload       jsonb not null default '{}',
  description   text not null default '',
  severity      text not null default 'info',
  status        text not null default 'active',
  actor_id      text,
  actor_label   text
);

-- Indexes for fast queries
create index if not exists idx_rampiq_events_created_at on rampiq_events (created_at desc);
create index if not exists idx_rampiq_events_gate_id    on rampiq_events (gate_id);
create index if not exists idx_rampiq_events_event_type on rampiq_events (event_type);
create index if not exists idx_rampiq_events_status     on rampiq_events (status);

-- ================================================
-- DEMO-ONLY RLS policies
-- These allow anonymous read/write for prototype testing.
-- REMOVE before any real deployment.
-- ================================================

alter table rampiq_events enable row level security;

-- Allow anyone to read events (DEMO ONLY)
create policy "DEMO: anon read"
  on rampiq_events for select
  to anon, authenticated
  using (true);

-- Allow anyone to insert events (DEMO ONLY)
create policy "DEMO: anon insert"
  on rampiq_events for insert
  to anon, authenticated
  with check (true);

-- Allow anyone to delete events (DEMO ONLY — for reset button)
create policy "DEMO: anon delete"
  on rampiq_events for delete
  to anon, authenticated
  using (true);

-- ================================================
-- Enable Realtime for this table
-- ================================================
alter publication supabase_realtime add table rampiq_events;
