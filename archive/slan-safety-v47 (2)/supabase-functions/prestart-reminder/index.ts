// Slán Safety — Pre-Start Reminder Edge Function
// Deploy: supabase functions deploy prestart-reminder
// Schedule: supabase functions deploy prestart-reminder --schedule "*/1 * * * *"
// (runs every minute, checks if 15 min window before work start)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY          = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY         = Deno.env.get('VAPID_PRIVATE_KEY')!

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Get all site configs
  const { data: sites } = await supabase.from('site_config').select('*')

  const now = new Date()
  const todayDate = now.toLocaleDateString('en-AU')

  for (const site of sites || []) {
    const [h, m] = (site.work_start_time || '07:00').split(':').map(Number)
    const workStart    = new Date(); workStart.setHours(h, m, 0, 0)
    const windowStart  = new Date(workStart.getTime() - 15 * 60 * 1000)
    const windowEnd    = new Date(workStart.getTime() - 10 * 60 * 1000)

    // Only alert in the 15-10 minute window before work start
    if (now < windowStart || now > windowEnd) continue

    // Check if site pre-start has been done today
    const { data: done } = await supabase
      .from('prestarts')
      .select('id')
      .eq('site', site.site_name)
      .eq('date', todayDate)
      .eq('is_site_prestart', true)
      .limit(1)

    if (done && done.length > 0) continue // already done — no alert needed

    // Get push subscriptions for supervisors on this site
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('site', site.site_name)
      .eq('role', 'Site Supervisor')

    if (!subs || subs.length === 0) continue

    // Send push notification to each supervisor
    const payload = JSON.stringify({
      title: '⚠️ Site Pre-Start Required',
      body:  `Work starts at ${site.work_start_time}. No site pre-start has been submitted yet for ${site.site_name}.`,
      icon:  '/apple-touch-icon.png',
      badge: '/apple-touch-icon.png',
      tag:   'prestart-reminder',
      data:  { screen: 'site-prestart' }
    })

    for (const { subscription } of subs) {
      try {
        // Use web-push via npm
        const { sendNotification, setVapidDetails } = await import('npm:web-push')
        setVapidDetails('mailto:admin@slansafety.com.au', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
        await sendNotification(subscription, payload)
      } catch (err) {
        console.error('Push failed:', err)
      }
    }

    console.log(`Sent pre-start reminder for ${site.site_name}`)
  }

  return new Response('OK', { status: 200 })
})
