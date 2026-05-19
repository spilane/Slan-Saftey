// Slán Safety — Pre-Start Reminder Cloud Function
// Sends push notification to supervisor 15 mins before work start
// if no site pre-start has been submitted yet
//
// DEPLOY STEPS:
// 1. npm install -g firebase-tools
// 2. firebase login
// 3. firebase init functions  (select slan-safety project)
// 4. Copy this file to functions/index.js
// 5. npm install in the functions folder
// 6. firebase deploy --only functions

const functions  = require('firebase-functions');
const admin      = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Runs every minute — checks if it's the 15-minute window before work start
exports.prestartReminder = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    const WORK_START = '07:00'; // HH:MM — update per client
    const SITE       = 'Job 042 — Northside'; // update per client

    const now       = new Date();
    const [h, m]    = WORK_START.split(':').map(Number);
    const workStart = new Date(); workStart.setHours(h, m, 0, 0);
    const alertAt   = new Date(workStart.getTime() - 15 * 60 * 1000);

    // Only fire in a 1-minute window 15 mins before start
    const diffMs = now - alertAt;
    if (diffMs < 0 || diffMs > 60000) return null;

    const today = now.toLocaleDateString('en-AU');

    // Check if site pre-start done today
    const psSnap = await db.collection('prestarts')
      .where('site',       '==', SITE)
      .where('date',       '==', today)
      .where('is_site_prestart', '==', true)
      .limit(1).get();

    if (!psSnap.empty) {
      console.log('Site pre-start already done — no reminder needed');
      return null;
    }

    // Get supervisor FCM tokens
    const tokenSnap = await db.collection('push_tokens')
      .where('site', '==', SITE)
      .where('role', '==', 'Site Supervisor')
      .get();

    if (tokenSnap.empty) {
      console.log('No supervisor tokens found for', SITE);
      return null;
    }

    const tokens = tokenSnap.docs.map(d => d.data().token).filter(Boolean);
    if (tokens.length === 0) return null;

    const message = {
      notification: {
        title: '⚠️ Site Pre-Start Required',
        body:  `Work starts at ${WORK_START}. No site pre-start submitted yet for ${SITE}.`
      },
      data: { screen: 'site-prestart' },
      tokens
    };

    const response = await admin.messaging().sendMulticast(message);
    console.log(`Pre-start reminder sent: ${response.successCount} success, ${response.failureCount} failed`);

    // Clean up invalid tokens
    response.responses.forEach((resp, idx) => {
      if (!resp.success &&
          (resp.error?.code === 'messaging/invalid-registration-token' ||
           resp.error?.code === 'messaging/registration-token-not-registered')) {
        db.collection('push_tokens').where('token','==',tokens[idx]).get()
          .then(snap => snap.forEach(doc => doc.ref.delete()));
      }
    });

    return null;
  });

// Also runs when a new hazard with Critical severity is added
// Immediately notifies the supervisor
exports.criticalHazardAlert = functions.firestore
  .document('hazards/{hazardId}')
  .onCreate(async (snap) => {
    const hazard = snap.data();
    if (hazard.severity !== 'Critical' && hazard.effective_severity !== 'Critical') return null;

    const tokenSnap = await db.collection('push_tokens')
      .where('site', '==', hazard.site)
      .where('role', '==', 'Site Supervisor')
      .get();

    if (tokenSnap.empty) return null;
    const tokens = tokenSnap.docs.map(d => d.data().token).filter(Boolean);
    if (tokens.length === 0) return null;

    await admin.messaging().sendMulticast({
      notification: {
        title: '🚨 CRITICAL HAZARD REPORTED',
        body:  `${hazard.hazard_type} at ${hazard.location}. Reported by ${hazard.reporter_name}.`
      },
      data: { screen: 'screen-dash' },
      tokens
    });

    return null;
  });
