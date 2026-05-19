# Slán Safety

A Workplace Health & Safety (WHS) compliance app for the Australian construction industry — civil, mining, high-rise, and general construction.

**Status:** Prototype / feature-build phase. Not yet hosted, no real backend wired up.

## What's here

| File / Folder | What it is |
| --- | --- |
| `index.html` | The main app — onboarding, dashboard, incident reporting, permits-to-work (Hot Work, Working at Heights, Confined Space, Excavation, Demolition, Lift, Concrete, Penetration, Electrical, Asbestos, Mobile Plant, Traffic), hazard reporting, Take 5, muster, SDS, more |
| `induction.html` | Standalone Worker Induction Form (SLS-IND-001 v1.1) — videos, qualifications, VOC, SOPs |
| `manifest.json` | PWA manifest — lets workers "Add to Home Screen" on their phone |
| `sw.js` | Service worker — offline mode, background sync of queued submissions, push notifications |
| `icon-*.png`, `apple-touch-icon.png`, `favicon.png` | App icons (all sizes for iOS / Android / web) |
| `supabase-schema.sql`, `setup.sql` | Two draft database schemas (not yet wired up — see notes below) |
| `supabase-functions/`, `firebase-functions/` | Backend function code (not yet deployed) |
| `archive/` | Older versions, zips, and the previous attempt at combining the app + induction form into one file |

## How to view it locally

Double-click `index.html` or `induction.html` and it'll open in your browser.

## Coverage

Australia-wide WHS — written generically across states (no hard-coding of any single state's WHS Act).

## Notes

- All data is currently stored in the browser. Refreshing the page resets everything. Real backend wiring (Supabase) is a planned next phase.
- The service worker registration in `index.html` is currently commented out (was off during local testing when `sw.js` wasn't present). It can be re-enabled once we're deploying through a real host.
- Two draft database schemas exist (`supabase-schema.sql` and `setup.sql`) — these will be reconciled into a single schema when backend work begins.
