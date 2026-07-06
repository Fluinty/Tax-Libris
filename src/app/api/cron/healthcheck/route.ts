import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const WORKER_STALE_MINUTES = 10
const STALE_PENDING_HOURS = 24
const ANTISPAM_COOLDOWN_MINUTES = 60

export async function GET(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────
    const authHeader = req.headers.get('authorization')
    const expected = process.env.CRON_SECRET
    if (!expected || authHeader !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseAdmin()
    const now = new Date()

    // ── Check A: worker heartbeat ────────────────────────
    const { data: workerRow, error: workerErr } = await supabase
      .from('worker_status')
      .select('last_cycle_at')
      .eq('id', 1)
      .maybeSingle()

    if (workerErr) throw new Error(`worker_status query failed: ${workerErr.message}`)

    let workerAliveMinutesAgo: number | null = null
    let workerDead = false

    if (!workerRow || !workerRow.last_cycle_at) {
      workerDead = true
    } else {
      const lastCycle = new Date(workerRow.last_cycle_at)
      workerAliveMinutesAgo = Math.round((now.getTime() - lastCycle.getTime()) / 60_000)
      if (workerAliveMinutesAgo >= WORKER_STALE_MINUTES) {
        workerDead = true
      }
    }

    // ── Check B: stale pending queue ─────────────────────
    const cutoff = new Date(now.getTime() - STALE_PENDING_HOURS * 3600_000).toISOString()

    const { count: stalePendingCount, error: queueErr } = await supabase
      .from('exceptions_queue')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'pending_review'])
      .lt('created_at', cutoff)

    if (queueErr) throw new Error(`exceptions_queue count failed: ${queueErr.message}`)

    const staleCount = stalePendingCount ?? 0
    const hasAlarm = workerDead || staleCount > 0
    const ok = !hasAlarm

    // ── Alert email (with anti-spam) ─────────────────────
    let alertSent = false

    if (hasAlarm) {
      // Anti-spam: check cooldown
      const { data: configRow } = await supabase
        .from('config')
        .select('value')
        .eq('key', 'watchdog_last_alert')
        .maybeSingle()

      let shouldSend = true
      if (configRow?.value) {
        const lastAlert = new Date(configRow.value)
        const minutesSince = (now.getTime() - lastAlert.getTime()) / 60_000
        if (minutesSince < ANTISPAM_COOLDOWN_MINUTES) {
          shouldSend = false
        }
      }

      if (shouldSend && process.env.RESEND_API_KEY && process.env.ALERT_EMAIL) {
        // Build email body
        const problems: string[] = []
        if (workerDead) {
          problems.push(
            workerAliveMinutesAgo !== null
              ? `🔴 Worker nie żyje — ostatni heartbeat ${workerAliveMinutesAgo} min temu (próg: ${WORKER_STALE_MINUTES} min)`
              : `🔴 Worker nie żyje — brak wiersza worker_status lub last_cycle_at jest NULL`
          )
        }
        if (staleCount > 0) {
          problems.push(
            `🟡 Zaległa kolejka — ${staleCount} rekordów pending/pending_review starszych niż ${STALE_PENDING_HOURS}h`
          )
        }

        const body = [
          `[Fluinty Watchdog] Wykryto problemy:`,
          ``,
          ...problems,
          ``,
          `Czas sprawdzenia: ${now.toISOString()}`,
          `Następne sprawdzenie za 5 minut.`,
        ].join('\n')

        const from = process.env.ALERT_FROM || 'alerts@resend.dev'

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [process.env.ALERT_EMAIL],
            subject: '[Fluinty ALERT] worker/kolejka',
            text: body,
          }),
        })

        if (!resendRes.ok) {
          const errText = await resendRes.text()
          console.error(`[watchdog] Resend API error ${resendRes.status}: ${errText}`)
        } else {
          alertSent = true
          // Update anti-spam timestamp
          await supabase
            .from('config')
            .upsert({ key: 'watchdog_last_alert', value: now.toISOString() }, { onConflict: 'key' })
        }
      }
    }

    return NextResponse.json({
      ok,
      workerAliveMinutesAgo,
      stalePendingCount: staleCount,
      alertSent,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[watchdog] Fatal error: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
