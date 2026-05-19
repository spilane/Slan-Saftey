# Morning handover — 2026-05-20 session

Hey Niall — overnight summary while you were asleep. Everything below is safe to read first before testing on your phone.

---

## 1. What I shipped tonight (9 bugs + housekeeping)

All commits are on `main` and already auto-deployed to **https://slan-saftey.vercel.app**.

| Commit | Bug # | What changed |
|---|---|---|
| `8eb029e` | 1, 2, 5 | Removed diagnostic buttons in permits; readonly inputs (permit ID/date/site) now force DM Sans 15px globally; restore-draft banner restyled with design tokens |
| `1bb9ac6` | 3, 8, 9 | Double-submit guard on incident; demo role-flips now preserve signature, photo, sign-in, and toolbox sign-off |
| `5dc5605` | 4 | Hot Work photo slots rebuilt with the correct overlay pattern (`.hw-photo-fileinput` class) |
| `d8f8b4b` | 6, 7 | SDS photo switched to programmatic-click pattern; incident shows 2 photo slots by default (3rd reveals after slot 1 is filled) |
| `aba8242` | 4 (real fix) | **iOS PWA reload guard** — saves the form screen ID on `goTo`, restores it after a reload. Applies to all 12 permit types + incident + hazard + SDS |
| `a317beb` | tidy | Use CSS variables for the switch-user button colors |

**Bug 4 — important context:** the original "tap photo → home screen" diagnosis was wrong. You told me the picker actually DID open, you took the photo, tapped OK, paused, *then* went home. That's iOS Safari evicting the PWA WebView during camera and reloading on return. The reload guard fixes the symptom (lands you back on the form with the restore banner ready); the photo handler already saved the draft. Net: on iOS or Android, photo flow should now survive even a hard reload.

## 2. Things I deliberately DID NOT touch (need your judgment)

### 2a. Color consistency
The app uses these design tokens (from `:root` at line 746):
- `--deep: #1B3A2D` (brand deep green)
- `--mid:  #2D6A45` (brand mid green)
- `--gold: #B8960C` (brand gold)
- `--gold-l: #D4AF37` (lighter brand gold)
- `--gold-bg: #FDF8E8` (gold tint)

But I see these **hardcoded variants** used in places:
- `#1B6E3A` — a brighter green (appears in "Continue to App" button, "Redraw signature" link, the green permission pill borders, and a few more places). Could be intentional "success / go" semantic green, but it's inconsistent with the brand greens.
- `#FAC775` — a warm peach (appears in the **My Profile avatar circle** and stars-related UI). Not the brand gold.
- `#FAEEDA` — warm yellow (Safety Stars tile background, TFB demo box). The brand gold-bg is `#FDF8E8`, slightly cooler.
- `#412402` / `#854F0B` / `#633806` — warm browns used for stars text and TFB tools text.
- `#1C5AAD` blue (worker role icon), `#5535AD` purple (psychosocial submit button), `#976500` brown (hazard submit button), `#A32D2D` red (sign out, near-miss) — these all feel like distinct *semantic* colors (info/wellness/warning/danger). Probably intentional.

**My recommendation:** the `#1B6E3A` bright green is the most suspect inconsistency — it's used as a primary action color but doesn't match the brand greens. If you confirm it should be replaced with `var(--mid)` everywhere, I can do that in one batch tomorrow.

The avatar `#FAC775` peach also doesn't match brand gold, but it's a stylistic choice — the warm tone is friendlier for a profile picture. Up to you.

### 2b. Profile centering
You mentioned profiles "not centered." I read both the setup screen (`screen-profile` at line 1446) and the view screen (`screen-my-profile` at line 1727). The CSS uses `text-align:center` on the setup-hero and flex layouts elsewhere — nothing jumped out as obviously wrong **without seeing it on your phone**. If you can take a screenshot tomorrow of the specific thing that looks off-centre, I can fix it precisely.

### 2c. Other permit types' photo HTML
Bug 4's "fragile" `<label for="...">` pattern with 1px hidden inputs exists in **10 other permit types** (Confined Space, Excavation, Demolition, Lift, Concrete, Penetration, Electrical, Asbestos, Mobile Plant, Traffic, Working at Heights) — that's roughly 40 more photo slots. I did NOT refactor them because:

1. The **iOS reload guard** I added handles the symptom anyway. Even if those slots have the same fragile structure, the user lands back on the form after a reload, with the draft-restore banner offering to bring photos back.
2. You confirmed the photo picker DID open on Hot Work — so the pattern probably works on your phone, the bug was the reload.
3. Refactoring 40 slots = 40 chances to introduce a typo in HTML for permits I haven't tested.

If tomorrow you find a permit type where the photo button genuinely doesn't open the picker, ping me with which permit and I'll batch-fix all 10 in one commit (same pattern as Hot Work).

### 2d. Other submit buttons (double-submit risk)
You hit the double-submit bug on incident reports. I added the guard there. The same risk theoretically exists on:
- All 12 permit submits (`submitHotWorks`, `submitWAH`, `submitCS`, `submitExc`, `submitDemo`, `submitLift`, `submitConc`, `submitPen`, `submitElec`, `submitAsb`, `submitMP`, `submitTrf`)
- `submitHazard`, `submitPsychosocial`, `submitPreStart`, `submitContactSlan`, `sdsReportMissing`

**I did NOT add guards to these** because:
- That's 17 functions to touch, each slightly different — high churn risk
- Most might already have implicit protection (e.g., they navigate away on success before a second tap can register)
- We have no evidence they're broken

If you hit the double-submit bug anywhere else tomorrow, tell me and I'll add the guard. Or if you want me to pre-emptively guard all of them, I can do it in one batch (just say "guard all submits").

---

## 3. Suggested testing order for tomorrow (10-15 min)

1. **The big one — iOS photo + reload.** Try a Hot Work permit on your phone. Fill in some fields. Tap a photo slot, take a photo. If iOS reloads the PWA (you'll see a brief flash), wait for it to come back. You should land back on the Hot Work form with a yellow restore banner — tap "Yes, restore" and your data + photo should come back.
2. **Demo role switching state preservation.** As Jake (Worker), sign the toolbox talk. Save a signature on your profile. Switch to Eoin (Supervisor) via the bottom banner's "Switch role". Switch back to Jake. **Signature should still be there. Toolbox should still be signed.**
3. **Double-submit.** Open a new incident report, fill it in, hit Submit then immediately mash Submit again 2-3 times rapidly. Go to the incident register — there should only be ONE record, not 3.
4. **Multi-photo on incident.** New incident → photo evidence section → there should be TWO empty photo slots visible from the start. Take a photo into slot 1, slot 3 should appear.
5. **SDS missing chemical.** Go through the flow, tap "Photos of product label" — picker should open without bouncing you away.
6. **Permit identification box font.** Open a Hot Work permit. The Permit number / Date / Site fields at the top should now use the same font (DM Sans) as the rest of the form.
7. **Permits register.** The two "🔧 Show diagnostic info" buttons should be GONE.

---

## 4. Rollback (if anything's broken)

Every change tonight is one commit. To undo a specific commit:

```
cd "C:\Users\Niall Spillane\Documents\GitHub\Slan-Saftey"
git revert <commit-hash>
git push
```

Tonight's commits in order (newest first):
- `a317beb` — colour vars on switch-user button (cosmetic, safe to keep)
- `aba8242` — iOS reload guard (the big one; if this breaks navigation, revert this first)
- `d8f8b4b` — SDS + incident multi-photo
- `5dc5605` — Hot Work photo slot HTML
- `1bb9ac6` — demo state preservation + double-submit guard
- `8eb029e` — diagnostic buttons removed + font fix + restore button style

To revert ALL of tonight's work in one go (nuclear option):
```
git revert --no-edit a317beb..6f42aeb
git push
```

That would put you back to where things were before this session — only the basic GitHub/Vercel setup, robots.txt, and the demo banner persistence fix remain.

---

## 5. Open questions for you to answer when you wake up

1. Replace `#1B6E3A` bright green with `var(--mid)` brand mid green everywhere? (yes / no / show me where first)
2. Replace `#FAC775` avatar peach with `var(--gold-l)` brand gold? (yes / no / keep peach)
3. Pre-emptively add double-submit guards to all 12 permit submits + hazard + others? (yes / no / wait for evidence)
4. The profile centering you mentioned — can you take a screenshot of the specific thing?
5. Want me to fix the `Slan-Saftey` → `Slan-Safety` repo name typo? Earlier you said skip; just checking it's still a no.

**Sleep well. Everything is safe.**
