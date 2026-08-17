import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import { BladOdczytu } from '@/components/shared/BladOdczytu'
import { DashboardClient } from '@/components/dashboard/DashboardClient'
import type {
  DashboardMetrics,
  RecentActivity,
  AutomationRateClient,
  WolumenKpirViewRow,
} from '@/types/database'

interface PageProps {
  searchParams: Promise<{
    client?: string
    period?: string
  }>
}

function periodToDays(period: string): number | null {
  switch (period) {
    case '1d': return 1
    case '7d': return 7
    case '30d': return 30
    case 'all': return null
    default: return 7
  }
}

function formatDateSQL(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams
  const selectedClient = params.client ?? ''
  const selectedPeriod = params.period ?? '7d'
  const days = periodToDays(selectedPeriod)
  const supabase = createSupabaseAdmin()
  const { nips, isAdmin, ryczaltNips, demoNips } = await getAllowedNips()

  // ── ETAP 1: trzy zapytania zależne WYŁĄCZNIE od nips — RÓWNOLEGLE ─────────
  // Graf zależności dashboardu: clients (→ targetNips), audit_log i lista
  // klientów KPiR (→ kpirNips) nie zależą od siebie; dotąd leciały
  // sekwencyjnie. Metryki (ETAP 2) potrzebują targetNips/kpirNips.
  let clientsQuery = supabase
    .from('clients')
    .select('nip, nazwa, is_demo')
    .eq('aktywny', true)
    .order('nazwa', { ascending: true })
  clientsQuery = applyNipFilter(clientsQuery, nips, 'nip', ryczaltNips, demoNips, isAdmin)

  let recentQuery = supabase
    .from('audit_log')
    .select('id, timestamp, action, client_nip, zapis_id, opis_zapisany, pozycja_xml, error_message, rule_id, details')
    .order('timestamp', { ascending: false })
    .limit(20)
  if (selectedClient) recentQuery = recentQuery.eq('client_nip', selectedClient)
  if (days) recentQuery = recentQuery.gte('timestamp', formatDateSQL(days))
  recentQuery = applyNipFilter(recentQuery, nips, 'client_nip', ryczaltNips, demoNips, isAdmin)

  let kpirClientsQuery = supabase
    .from('clients')
    .select('nip, nazwa')
    .eq('forma_opodatkowania', 'kpir')
    .eq('aktywny', true)
  kpirClientsQuery = applyNipFilter(kpirClientsQuery, nips, 'nip', ryczaltNips, demoNips, isAdmin)
  if (selectedClient) kpirClientsQuery = kpirClientsQuery.eq('nip', selectedClient)

  const [
    { data: allClients, error: clientsError },
    { data: recentRaw, error: recentError },
    { data: kpirClientsData, error: kpirError },
  ] = await Promise.all([clientsQuery, recentQuery, kpirClientsQuery])

  // AUDIT §2 (C8): awaria odczytu = komunikat z tabela, nie pusty dashboard
  if (clientsError) return <BladOdczytu tabela="clients" message={clientsError.message} />
  if (recentError) return <BladOdczytu tabela="audit_log" message={recentError.message} />
  if (kpirError) return <BladOdczytu tabela="clients (KPiR)" message={kpirError.message} />

  const clientMap = new Map((allClients ?? []).map(c => [c.nip, c.nazwa]))

  // NIPy nie-demo do filtrowania metryk globalnych
  // Admin widzi wszystkich nie-demo (żeby demo nie brudziło mu metryk).
  // Zwykły użytkownik widzi dokładnie to, co ma przypisane (łącznie z demo, jeśli ma do niego dostęp).
  const targetNips = nips === null
    ? (allClients ?? []).filter(c => !c.is_demo).map(c => c.nip)
    : (allClients ?? []).map(c => c.nip)

  const kpirNips = (kpirClientsData ?? []).map(c => c.nip)

  // ── ETAP 2: metryki zależne od targetNips/kpirNips — RÓWNOLEGLE ───────────
  let pendingQuery = supabase
    .from('exceptions_queue')
    .select('id', { count: 'exact' })
    .in('status', ['pending', 'pending_review'])
  if (selectedClient) pendingQuery = pendingQuery.eq('client_nip', selectedClient)
  else pendingQuery = pendingQuery.in('client_nip', targetNips)
  pendingQuery = applyNipFilter(pendingQuery, nips, 'client_nip', ryczaltNips, demoNips, isAdmin)

  let prevPendingQuery = null
  if (days) {
    let q = supabase
      .from('exceptions_queue')
      .select('id', { count: 'exact' })
      .eq('status', 'pending')
      .lte('created_at', formatDateSQL(days))
    if (selectedClient) q = q.eq('client_nip', selectedClient)
    else q = q.in('client_nip', targetNips)
    prevPendingQuery = applyNipFilter(q, nips, 'client_nip', ryczaltNips, demoNips, isAdmin)
  }

  const now = new Date()
  const firstDayOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString()
  let autoRateQuery = supabase
    .from('v_automation_rate')
    .select('client_nip, miesiac, auto_cnt, procesowalne, pct')
    .gte('miesiac', firstDayOfMonth)
  if (selectedClient) autoRateQuery = autoRateQuery.eq('client_nip', selectedClient)
  else autoRateQuery = autoRateQuery.in('client_nip', targetNips)
  autoRateQuery = applyNipFilter(autoRateQuery, nips, 'client_nip', ryczaltNips, demoNips, isAdmin)

  const [pendingRes, prevPendingRes, autoRateRes, wolumenRes] = await Promise.all([
    pendingQuery,
    prevPendingQuery ?? Promise.resolve({ count: null, error: null as { message: string } | null }),
    autoRateQuery,
    kpirNips.length > 0
      ? supabase.from('wolumen_kpir_view').select('*').in('client_nip', kpirNips)
      : Promise.resolve({ data: [] as WolumenKpirViewRow[], error: null as { message: string } | null }),
  ])

  if (pendingRes.error) return <BladOdczytu tabela="exceptions_queue (liczniki)" message={pendingRes.error.message} />
  if (autoRateRes.error) return <BladOdczytu tabela="v_automation_rate" message={autoRateRes.error.message} />
  if (wolumenRes.error) return <BladOdczytu tabela="wolumen_kpir_view" message={wolumenRes.error.message} />
  const autoRateData = autoRateRes.data

  const pendingExceptions = pendingRes.count
  const exceptionsTrend: number | null = days
    ? (pendingExceptions ?? 0) - (prevPendingRes.count ?? 0)
    : null

  const sumAuto = (autoRateData ?? []).reduce((acc, r) => acc + (Number(r.auto_cnt) || 0), 0)
  const sumProcesowalne = (autoRateData ?? []).reduce((acc, r) => acc + (Number(r.procesowalne) || 0), 0)
  const automationRate = sumProcesowalne > 0 ? Number(((sumAuto / sumProcesowalne) * 100).toFixed(1)) : 0

  const metrics: DashboardMetrics = {
    pendingExceptions: pendingExceptions ?? 0,
    exceptionsTrend,
    automationRate,
  }

  const recentActivity: RecentActivity[] = (recentRaw ?? []).map(r => ({
    ...r,
    client_nazwa: r.client_nip ? (clientMap.get(r.client_nip) ?? r.client_nip) : 'Nieznany',
  }))

  const topAutomationClients: AutomationRateClient[] = (autoRateData ?? [])
    .map(r => ({
      klient: clientMap.get(r.client_nip) ?? r.client_nip,
      auto: Number(r.auto_cnt) || 0,
      procesowalne: Number(r.procesowalne) || 0,
      pct: Number(r.pct) || 0,
    }))
    .sort((a, b) => b.pct - a.pct || b.auto - a.auto)
    .slice(0, 10)

  // ========== WOLUMEN FAKTUR (KPiR) — pobrane w ETAPACH 1-2 ==========
  const kpirClientNames: Record<string, string> = {}
  for (const c of kpirClientsData ?? []) {
    kpirClientNames[c.nip] = c.nazwa
  }
  const wolumenViewRows = (wolumenRes.data ?? []) as WolumenKpirViewRow[]

  return (
    <DashboardClient
      metrics={metrics}
      recentActivity={recentActivity}
      topAutomationClients={topAutomationClients}
      wolumenViewRows={wolumenViewRows}
      kpirClientNames={kpirClientNames}
    />
  )
}

