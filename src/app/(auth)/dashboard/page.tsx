import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import { DashboardClient } from '@/components/dashboard/DashboardClient'
import type {
  DashboardMetrics,
  RecentActivity,
  AutomationRateClient,
  WolumenInvoiceRecord,
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

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams
  const selectedClient = params.client ?? ''
  const selectedPeriod = params.period ?? '7d'
  const days = periodToDays(selectedPeriod)
  const supabase = createSupabaseAdmin()
  const { nips, ryczaltNips } = await getAllowedNips()

  // ========== METRICS ==========

  // ========== CLIENT MAPPING & LIST ==========
  let clientsQuery = supabase
    .from('clients')
    .select('nip, nazwa')
    .eq('aktywny', true)
    .order('nazwa', { ascending: true })
  clientsQuery = applyNipFilter(clientsQuery, nips, 'nip', ryczaltNips)

  const { data: allClients } = await clientsQuery
  const clientMap = new Map((allClients ?? []).map(c => [c.nip, c.nazwa]))

  // ========== METRICS ==========

  // --- Pending exceptions ---
  let pendingQuery = supabase
    .from('exceptions_queue')
    .select('id', { count: 'exact' })
    .in('status', ['pending', 'pending_review'])
  if (selectedClient) pendingQuery = pendingQuery.eq('client_nip', selectedClient)
  pendingQuery = applyNipFilter(pendingQuery, nips, 'client_nip', ryczaltNips)
  const { count: pendingExceptions } = await pendingQuery

  // Pending trend
  let exceptionsTrend: number | null = null
  if (days) {
    let prevPendingQuery = supabase
      .from('exceptions_queue')
      .select('id', { count: 'exact' })
      .eq('status', 'pending')
      .lte('created_at', formatDateSQL(days))
    if (selectedClient) prevPendingQuery = prevPendingQuery.eq('client_nip', selectedClient)
    prevPendingQuery = applyNipFilter(prevPendingQuery, nips, 'client_nip', ryczaltNips)
    const { count: prevPending } = await prevPendingQuery
    exceptionsTrend = (pendingExceptions ?? 0) - (prevPending ?? 0)
  }

  // --- Automation rate (current month) ---
  const now = new Date()
  const firstDayOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString()
  let autoRateQuery = supabase
    .from('v_automation_rate')
    .select('client_nip, miesiac, auto_cnt, procesowalne, pct')
    .gte('miesiac', firstDayOfMonth)
  if (selectedClient) autoRateQuery = autoRateQuery.eq('client_nip', selectedClient)
  autoRateQuery = applyNipFilter(autoRateQuery, nips, 'client_nip', ryczaltNips)
  const { data: autoRateData } = await autoRateQuery

  const sumAuto = (autoRateData ?? []).reduce((acc, r) => acc + (Number(r.auto_cnt) || 0), 0)
  const sumProcesowalne = (autoRateData ?? []).reduce((acc, r) => acc + (Number(r.procesowalne) || 0), 0)
  const automationRate = sumProcesowalne > 0 ? Number(((sumAuto / sumProcesowalne) * 100).toFixed(1)) : 0

  const metrics: DashboardMetrics = {
    pendingExceptions: pendingExceptions ?? 0,
    exceptionsTrend,
    automationRate,
  }

  // ========== RECENT ACTIVITY ==========
  let recentQuery = supabase
    .from('audit_log')
    .select('id, timestamp, action, client_nip, zapis_id, opis_zapisany, pozycja_xml, error_message, rule_id, details')
    .order('timestamp', { ascending: false })
    .limit(20)
  if (selectedClient) recentQuery = recentQuery.eq('client_nip', selectedClient)
  if (days) recentQuery = recentQuery.gte('timestamp', formatDateSQL(days))
  recentQuery = applyNipFilter(recentQuery, nips, 'client_nip', ryczaltNips)

  const { data: recentRaw } = await recentQuery

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

  // ========== WOLUMEN FAKTUR (KPiR) ==========
  // 1. Fetch KPiR client NIPs (forma_opodatkowania = 'kpir')
  let kpirClientsQuery = supabase
    .from('clients')
    .select('nip, nazwa')
    .eq('forma_opodatkowania', 'kpir')
    .eq('aktywny', true)
  kpirClientsQuery = applyNipFilter(kpirClientsQuery, nips, 'nip', ryczaltNips)
  if (selectedClient) kpirClientsQuery = kpirClientsQuery.eq('nip', selectedClient)
  const { data: kpirClientsData } = await kpirClientsQuery

  const kpirNips = (kpirClientsData ?? []).map(c => c.nip)
  const kpirClientNames: Record<string, string> = {}
  for (const c of kpirClientsData ?? []) {
    kpirClientNames[c.nip] = c.nazwa
  }

  // 2. Fetch invoice records for KPiR clients (all statuses, minimal columns)
  let wolumenRecords: WolumenInvoiceRecord[] = []
  if (kpirNips.length > 0) {
    const { data: wolumenRaw } = await supabase
      .from('exceptions_queue')
      .select('client_nip, status, resolved_by, created_at, auto_created_at')
      .in('client_nip', kpirNips)

    wolumenRecords = (wolumenRaw ?? []) as WolumenInvoiceRecord[]
  }

  return (
    <DashboardClient
      metrics={metrics}
      recentActivity={recentActivity}
      topAutomationClients={topAutomationClients}
      wolumenRecords={wolumenRecords}
      kpirClientNames={kpirClientNames}
    />
  )
}
