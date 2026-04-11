-- ══════════════════════════════════════════════════════
-- Slán Safety — Supabase Database Setup
-- Run this entire file in your Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ══════════════════════════════════════════════════════

-- UUID extension
create extension if not exists "uuid-ossp";

-- ── SITE CONFIGURATION ─────────────────────────────────
create table if not exists site_config (
  id             uuid primary key default uuid_generate_v4(),
  site_name      text unique not null,
  work_start_time text default '07:00',
  supervisor_name text,
  plant_list     jsonb default '[]',
  created_at     timestamptz default now()
);

-- Insert your default site — update as needed
insert into site_config (site_name, work_start_time, supervisor_name)
values ('Job 042 — Northside', '07:00', 'Site Supervisor')
on conflict (site_name) do nothing;

-- ── SIGN INS / OUTS ────────────────────────────────────
create table if not exists sign_ins (
  id               uuid primary key default uuid_generate_v4(),
  ref              text unique,
  site             text,
  worker_name      text,
  company          text,
  role             text,
  type             text check (type in ('Sign In','Sign Out')),
  date             text,
  time             text,
  latitude         text,
  longitude        text,
  address          text,
  google_maps_link text,
  timestamp        timestamptz default now()
);

-- ── TOOLBOX TALK SIGNATURES ────────────────────────────
create table if not exists toolbox_signs (
  id           uuid primary key default uuid_generate_v4(),
  ref          text unique,
  site         text,
  worker_name  text,
  company      text,
  role         text,
  talk_title   text,
  talk_version text,
  date         text,
  time         text,
  timestamp    timestamptz default now()
);

-- ── PRE-START CHECKS ───────────────────────────────────
create table if not exists prestarts (
  id               uuid primary key default uuid_generate_v4(),
  ref              text unique,
  site             text,
  worker_name      text,
  company          text,
  plant_id         text,
  plant_name       text,
  equipment_type   text,
  outcome          text,
  defects          jsonb default '[]',
  checklist_results jsonb default '{}',
  hour_meter       text,
  notes            text,
  is_site_prestart boolean default false,
  date             text,
  time             text,
  timestamp        timestamptz default now()
);

-- ── HAZARD REPORTS ─────────────────────────────────────
create table if not exists hazards (
  id                 uuid primary key default uuid_generate_v4(),
  ref                text unique,
  site               text,
  reporter_name      text,
  anonymous          boolean default false,
  hazard_type        text,
  severity           text,
  effective_severity text,
  location           text,
  description        text,
  who_at_risk        text,
  work_activity      text,
  immediate_action   text,
  swms_coverage      text,
  recurring          text,
  status             text default 'Open',
  date               text,
  time               text,
  timestamp          timestamptz default now()
);

-- ── PUSH NOTIFICATION SUBSCRIPTIONS ────────────────────
create table if not exists push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  worker_name text,
  role        text,
  site        text,
  device_key  text unique,
  subscription jsonb not null,
  created_at  timestamptz default now()
);

-- ── ENABLE REAL-TIME ───────────────────────────────────
-- Allows the supervisor dashboard to update live
alter publication supabase_realtime add table sign_ins;
alter publication supabase_realtime add table toolbox_signs;
alter publication supabase_realtime add table prestarts;
alter publication supabase_realtime add table hazards;

-- ══════════════════════════════════════════════════════
-- DONE. Note your Project URL and anon key from:
-- Project Settings → API → Project URL & anon public key
-- ══════════════════════════════════════════════════════
