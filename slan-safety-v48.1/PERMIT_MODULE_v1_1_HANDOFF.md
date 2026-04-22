# Slán Safety — Permits Module v1.1 Developer Handoff

This note describes exactly what was added to `index.html` (v47 → v48.1) to
implement the **Permits to Work** module. Written for the developer taking
over backend wiring and production hardening.

## v1.1 changes (applied on top of v1.0)

Three production-readiness fixes were applied after the initial v1.0 build:

1. **Sign-out gate hook** — The sign-out block is now injected directly from
   `startFlow(m)` at the moment the EOS card is shown. The earlier `goTo()`
   wrapper with `setTimeout(30)` has been removed (was fragile to timing).

2. **Offline-to-online sync** — Each permit carries a `_firestore_synced`
   flag. `pmPersist()` sets it `false` pessimistically and only marks `true`
   after a successful Firestore write. A new `pmSyncPending()` function runs
   on the `window.online` event and retries any unsynced permits. Closes the
   "submitted offline, lost in transit" gap.

3. **Supervisor dashboard placement** — The Permits entry point was moved
   from the unused `screen-supervisor` into the live `screen-dash`, and
   wired into `renderSuperDash()` so the tile shows a live count of
   "X awaiting approval" with a red notification dot whenever permits are
   pending.

---


---

## What's in this folder

- `index.html` — the v47 app with the Permits module built in (v48)
- `sw.js`, `manifest.json`, icons, logos — unchanged from v47

To deploy: replace your current `index.html` on GitHub Pages with this one.
Keep a copy of v47 for rollback.

---

## Module scope (v1)

**Permit types implemented:** Hot Works only (Welding, Grinding, Oxy Cutting,
Soldering, Thermal Lance, Other).

**Permit types stubbed in the UI but disabled:** Working at Heights, Confined
Space, Electrical, Excavation (marked "Coming soon").

**Three user journeys fully working in the UI:**
1. Worker submits a permit → supervisor approves/rejects/adds conditions
2. Worker views active permit with live fire-watch timer → signs out via
   6-tick closeout
3. Supervisor monitors/revokes permits mid-shift

**Sign-out integration:** If a worker taps Sign Out while an active permit
exists, an amber warning block appears above the end-of-shift declaration
card. The Confirm Sign Out button is hard-locked until the permit is
closed out, regardless of whether the 4 EOS tick boxes are ticked.

---

## File locations of the changes

All changes are in a single file — `index.html`. Six insertions were made:

| # | Insertion point                           | Content                                     |
|---|-------------------------------------------|---------------------------------------------|
| 1 | Before `</style>`                         | CSS block (~135 lines, all `.pm-` prefixed) |
| 2 | Worker home tile grid (after Report Incident) | Permits tile                           |
| 3 | Supervisor dashboard (before hazards card)    | Permit approvals card                   |
| 4 | Sign-out confirm screen (above `eos-card`)    | Permit sign-out gate block              |
| 5 | After `screen-hazard` (before `screen-talk`)  | 7 permit screens                        |
| 6 | Before final `</script>`                      | JavaScript module (~600 lines)          |

Every insertion is wrapped in comments like `<!-- ═══ PERMITS MODULE v1.0 ═══ -->`
so it is easy to locate and diff against v47.

---

## Data model (Firestore `permits` collection)

One document per permit, keyed by `permit_id`. Written whenever status
changes.

```
{
  permit_id:                 "SLS-PTW-HW-2026-0001",
  type:                      "hot_works",
  type_label:                "Hot Works",
  subtype:                   "Welding" | "Grinding" | "Oxy Cutting" | "Soldering" | "Thermal Lance" | "Other",
  status:                    "draft" | "submitted" | "approved" | "approved_conditions"
                             | "active" | "rejected" | "revoked" | "expired" | "closed",

  worker_name, worker_company, worker_role,
  worker_signature:          (dataUrl base64 PNG, from profile),

  fire_watch_name, fire_watch_company,

  site:                      (from SITE constant),
  location:                  (user-entered, e.g. "Level 3 core wall west"),
  description:               (user-entered),
  swms_ref:                  (optional, e.g. "SWMS-0047"),

  validity_start_requested:  ISO timestamp,
  validity_end_requested:    ISO timestamp (max 8h from start),

  pre_start_checks: {
    combustibles_cleared, floor_swept, drains_covered, gas_isolated,
    extinguisher_on_site, ppe_confirmed, swms_reviewed, ventilation_adequate
  },  // all booleans

  photos:                    [dataUrl, dataUrl, dataUrl, dataUrl],  // 4 JPEGs with watermark
  photo_metadata: {
    0: { timestamp, date, time, latitude, longitude, accuracy, site },
    1: { ... }, 2: { ... }, 3: { ... }
  },

  gps:                       { latitude, longitude, accuracy },
  submitted_at:              ISO timestamp,
  submission_mode:           "online" | "offline_queued",

  // Populated by supervisor
  supervisor_name, supervisor_decision, supervisor_timestamp,
  supervisor_conditions,     // text, shown to worker prominently if present
  supervisor_rejection_reason,
  approved_at,

  // Populated by worker at closeout
  closeout: {
    signed_out_at, signed_out_by, gps,
    checks: {
      work_finished, fire_watch_complete, area_inspected,
      extinguisher_returned, area_swept, conditions_complied
    },
    note,                    // optional free text
    hazard_raised,           // boolean — if true, a separate hazard record is also created
    signature                // dataUrl PNG
  },

  // Populated by supervisor if revoked mid-shift
  revocation: {
    by, timestamp, category, reason
  },

  register_target:           "SLS-REG-011",
  history:                   [{ event, by, timestamp }, ...]
}
```

Permits are also written to `localStorage['slan_permits_v1']` for offline-first
behaviour. The client always reads from localStorage; Firestore is the
authoritative write target.

---

## Public functions (entry points)

| Function                                 | Purpose                                        |
|------------------------------------------|------------------------------------------------|
| `goToPermits()`                          | Worker — enter Permits module                  |
| `goToPermitSupQueue()`                   | Supervisor — permit approval queue             |
| `pmGoToHotWorks()`                       | Start a new Hot Works permit                   |
| `pmViewPermit(permitId)`                 | Worker view of a permit                        |
| `pmSupViewPermit(permitId)`              | Supervisor view of a permit                    |
| `pmSubmitHotWorks()`                     | Submit a new permit (validation + persist)     |
| `pmSubmitCloseout()`                     | Close out an active permit                     |
| `pmCheckSignOutGate()`                   | Called on sign-out screen; shows block if permits open |
| `pmUpdateHomeBanner()`                   | Updates the Permits tile subline on home       |

All other `pm*` functions are helpers.

---

## What's wired up for the developer to finish

### 1. PDF generation (at closeout / rejection / revocation)
The app does **not** generate the final PDF. The data model is ready; you need
a backend (Power Automate flow, Azure Function, or Cloudflare Worker) that:
1. Listens for Firestore `permits` document writes where `status` transitions to `closed`, `rejected`, `revoked`, or `expired`.
2. Generates a PDF using the document data + embedded photos.
3. Saves the PDF to the client's OneDrive at `/Slán Safety Compliance/Permits to Work/YYYY/MM/SLS-PTW-HW-YYYY-NNNN_status_worker_site.pdf`.
4. Optionally writes a SHA-256 hash of the PDF back into the Firestore document for tamper evidence.

### 2. Supervisor notifications
The JS currently calls `sendEscalationEmail(...)` on submit/approve/reject/revoke,
which the existing app wires to EmailJS. In production, the developer should
swap that to push notifications (the app is already a PWA — register for Web
Push, wire up FCM if desired).

### 3. Real-time sync between worker and supervisor
Currently both worker and supervisor read from localStorage (populated from
Firestore writes). For real-time cross-device sync, add a
`db.collection('permits').onSnapshot(...)` listener on both sides and merge
into localStorage. This is a ~20-line change.

### 4. Training Matrix competency gate
This was discussed during design but not implemented in v1. When the
Training Matrix (`SLS-REG-002`) is built out as its own Firestore collection,
add a lookup in `pmSubmitHotWorks()` that bounces the permit if:
- Worker has no current White Card
- Worker has no current trade ticket for the chosen subtype
- Worker has not signed off the Hot Works SOP within 12 months
- Fire watch person has not signed off the Hot Works SOP within 12 months

The bounce should happen client-side (show an alert) before the permit
is even written to Firestore. Data model hook: add a
`competency_gate_passed: boolean` + `competency_gate_details: {...}` field.

### 5. Permit auto-expiry + escalation
Currently a permit stays `active` forever if the worker never closes it out.
The sign-out hook catches most cases, but a worker could close the app and
walk off-site. Add a Cloud Function (Firestore scheduled trigger) that:
- Every 10 minutes, looks for permits where `status in [active, approved, approved_conditions]` and `validity_end_requested < now - 2h`.
- Marks them `expired`, triggers a supervisor notification, and triggers PDF generation.

### 6. Geofence enforcement
The app already captures GPS on the permit submission + on closeout sign-out.
Geofence validation is not yet implemented — add a per-site boundary config
(lat/lng/radius) and reject permits where `gps.latitude/longitude` is outside
the site boundary.

### 7. Power Automate integration
`pmPersist()` already posts to `PA_URL` with `form_type: 'permit'` and
`register_target: 'SLS-REG-011'`. The Power Automate flow needs to be
built to consume this and write to the Excel register (SLS-REG-011) in the
client's OneDrive.

---

## Security considerations (before go-live)

1. **Firestore rules** — the `permits` collection needs rules matching the existing app's rules (authenticated reads/writes, per-site scoping once multi-client is enabled).

2. **Signature storage** — signatures are stored as base64 data URLs in the document. Consider moving them to Firebase Storage and storing URLs instead, once documents start getting large.

3. **Photo storage** — same consideration. Currently photos are stored inline in the Firestore document (base64 JPEG, ~50-100KB each after compression = 200-400KB per permit for 4 photos). This is within Firestore's 1MB document limit but close to it. Move to Storage before adding permit types that need more photos.

4. **Supervisor PIN / role verification** — the existing app uses a simple `SUPERVISOR_PIN` constant. The permit approval flow uses whatever profile is active, so the existing PIN gate is the only gate. That's fine for v1 but should move to proper auth before multi-client.

---

## Testing checklist

Before release, at minimum verify:

- [ ] Worker can submit a Hot Works permit from a fresh profile
- [ ] All 8 pre-start checks must be ticked before submit is allowed
- [ ] All 4 photos must be uploaded before submit is allowed
- [ ] Validity end time cannot exceed 8 hours
- [ ] Photos display the watermark (timestamp + site + Slán badge)
- [ ] Supervisor sees the permit in "Awaiting approval" queue
- [ ] Supervisor can Approve / Approve with Conditions / Reject
- [ ] Conditions text is shown prominently to worker on approval
- [ ] Fire watch timer counts up from approval time
- [ ] Sign Out button is locked until 60 min has elapsed
- [ ] Closeout 6-tick screen requires all ticks (5 if no conditions, 6 if conditions applied)
- [ ] Optional hazard raised from closeout creates a hazard report
- [ ] Worker signs out of site → permit block appears → can't confirm sign-out until permit closed
- [ ] Supervisor can revoke an active permit with category + reason
- [ ] Permits survive app close/reopen (localStorage)
- [ ] Offline submission works (airplane mode → submit → permit shows as "submitted", syncs when back online)

---

## Questions for Pat

1. Do you want the Permits tile on the **supervisor home** too, or only the dashboard card? (Currently dashboard card only — supervisors reach permits via the card + its "View all →" link.)
2. The Permits tile on worker home is placed after Report Incident. Is that position right, or should it move closer to SWMS Library / Take 5?
3. The auto-expiry logic (item 5 above) was discussed but not built. Is it right to have the developer build it server-side, or would you like a client-side pass too (so permits expire visually on the worker's phone even if they never open the app after the deadline)?

---

*Slán Safety Permits Module v1.0 · April 2026 · Built on v47*
