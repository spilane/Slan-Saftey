-- ═══════════════════════════════════════════════════════════════
-- SLÁN SAFETY — Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- Project: https://app.supabase.com → SQL Editor → New Query → Paste → Run
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── PROFILES ────────────────────────────────────────────────────
create table if not exists profiles (
  id            uuid default gen_random_uuid() primary key,
  device_id     text unique not null,
  name          text not null,
  company       text,
  role          text,
  is_supervisor boolean default false,
  whitecard     text,
  site          text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── ATTENDANCE (Sign In / Out) ───────────────────────────────────
create table if not exists attendance (
  id            uuid default gen_random_uuid() primary key,
  ref           text,
  device_id     text,
  worker_name   text,
  company       text,
  role          text,
  site          text,
  type          text,   -- 'Sign In' or 'Sign Out'
  date          text,
  time          text,
  ts            timestamptz,
  latitude      text,
  longitude     text,
  address       text,
  google_maps   text,
  created_at    timestamptz default now()
);

-- ── TOOLBOX TALK SIGNATURES ──────────────────────────────────────
create table if not exists toolbox_signatures (
  id            uuid default gen_random_uuid() primary key,
  ref           text,
  device_id     text,
  worker_name   text,
  company       text,
  site          text,
  talk_title    text,
  talk_version  text,
  date          text,
  time          text,
  ts            timestamptz,
  created_at    timestamptz default now()
);

-- ── PRE-START CHECKS ─────────────────────────────────────────────
create table if not exists prestart_checks (
  id                  uuid default gen_random_uuid() primary key,
  ref                 text,
  device_id           text,
  worker_name         text,
  company             text,
  site                text,
  plant_id            text,
  plant_name          text,
  equipment_type      text,
  hour_meter          text,
  outcome             text,   -- 'Fit for Use', 'Defects Found', 'Unfit — Tag Out'
  defects_count       int default 0,
  critical_fails      int default 0,
  is_supervisor_check boolean default false,
  date                text,
  time                text,
  ts                  timestamptz,
  checklist_results   jsonb,
  defects             jsonb,
  notes               text,
  created_at          timestamptz default now()
);

-- ── HAZARD REPORTS ───────────────────────────────────────────────
create table if not exists hazard_reports (
  id                uuid default gen_random_uuid() primary key,
  ref               text,
  device_id         text,
  reporter_name     text,
  anonymous         boolean default false,
  site              text,
  hazard_type       text,
  severity          text,
  effective_severity text,
  location          text,
  description       text,
  who_at_risk       text,
  work_activity     text,
  immediate_action  text,
  swms_coverage     text,
  recurring         boolean default false,
  status            text default 'Open',
  date              text,
  time              text,
  ts                timestamptz,
  created_at        timestamptz default now()
);

-- ── PUSH NOTIFICATION SUBSCRIPTIONS ─────────────────────────────
create table if not exists push_subscriptions (
  id            uuid default gen_random_uuid() primary key,
  device_id     text unique,
  worker_name   text,
  role          text,
  site          text,
  is_supervisor boolean default false,
  subscription  jsonb,
  work_start_time text default '07:00',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── ENABLE REAL-TIME ON KEY TABLES ──────────────────────────────
-- (Required for live supervisor dashboard)
alter publication supabase_realtime add table attendance;
alter publication supabase_realtime add table toolbox_signatures;
alter publication supabase_realtime add table prestart_checks;
alter publication supabase_realtime add table hazard_reports;

-- ── ROW LEVEL SECURITY (open for now — lock down per client later)
alter table profiles             enable row level security;
alter table attendance           enable row level security;
alter table toolbox_signatures   enable row level security;
alter table prestart_checks      enable row level security;
alter table hazard_reports       enable row level security;
alter table push_subscriptions   enable row level security;

-- Allow all reads and writes with the anon key (for the PWA)
-- In production, tighten these per client using site-based policies
create policy "Allow all" on profiles           for all using (true) with check (true);
create policy "Allow all" on attendance         for all using (true) with check (true);
create policy "Allow all" on toolbox_signatures for all using (true) with check (true);
create policy "Allow all" on prestart_checks    for all using (true) with check (true);
create policy "Allow all" on hazard_reports     for all using (true) with check (true);
create policy "Allow all" on push_subscriptions for all using (true) with check (true);

-- ── HELPER VIEWS ────────────────────────────────────────────────

-- Today's activity summary (used by supervisor dashboard)
create or replace view today_summary as
select
  'attendance' as form_type,
  worker_name,
  company,
  site,
  time,
  type as subtype,
  date,
  ts
from attendance
where date = to_char(now() at time zone 'Australia/Sydney', 'DD/MM/YYYY')

union all

select
  'toolbox' as form_type,
  worker_name,
  company,
  site,
  time,
  talk_title as subtype,
  date,
  ts
from toolbox_signatures
where date = to_char(now() at time zone 'Australia/Sydney', 'DD/MM/YYYY')

union all

select
  'prestart' as form_type,
  worker_name,
  company,
  site,
  time,
  plant_name || ' — ' || outcome as subtype,
  date,
  ts
from prestart_checks
where date = to_char(now() at time zone 'Australia/Sydney', 'DD/MM/YYYY')

order by ts desc;

-- ═══════════════════════════════════════════════════════════════
-- EDGE FUNCTION FOR 15-MIN NOTIFICATION (deploy separately)
-- Go to: Supabase → Edge Functions → New Function → paste below
-- Then set a cron schedule: every day at your configured time
-- ═══════════════════════════════════════════════════════════════
/*
  Function name: notify-supervisor-prestart
  Schedule: e.g. "30 6 * * 1-5" = 6:30am Mon-Fri (15 mins before 6:45am start)

  Deno.serve(async () => {
    const supabaseUrl  = Deno.env.get('SUPABASE_URL');
    const supabaseKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');

    const today = new Date().toLocaleDateString('en-AU');

    // Get today's supervisor pre-starts
    const res = await fetch(`${supabaseUrl}/rest/v1/prestart_checks?date=eq.${today}&is_supervisor_check=eq.true`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    const prestarts = await res.json();

    if (prestarts.length > 0) return new Response('Pre-start already done', { status: 200 });

    // Get supervisor push subscriptions
    const subRes = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?is_supervisor=eq.true`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    const subs = await subRes.json();

    // Send push notification to each supervisor
    for (const sub of subs) {
      // Use web-push library to send notification
      // Notification payload: { title: 'Pre-Start Reminder', body: 'Work starts in 15 minutes — pre-start not yet completed' }
    }

    return new Response('Notifications sent', { status: 200 });
  });
*/
