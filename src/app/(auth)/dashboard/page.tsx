import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import { DashboardClient } from '@/components/dashboard/DashboardClient'
import type {
  DashboardMetrics,
  ActivityChartData,
  TopClient,
  TopRule,
  RecentActivity,
  Client,
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

  // --- Hit rate & invoices processed ---
  let auditQuery = supabase
    .from('audit_log')
    .select('action', { count: 'exact' })

  if (selectedClient) auditQuery = auditQuery.eq('client_nip', selectedClient)
  if (days) auditQuery = auditQuery.gte('timestamp', formatDateSQL(days))
  auditQuery = auditQuery.in('action', ['set_opis', 'exception'])
  auditQuery = applyNipFilter(auditQuery, nips, 'client_nip', ryczaltNips)

  const { data: auditActions } = await auditQuery

  const setOpisCount = (auditActions ?? []).filter(a => a.action === 'set_opis').length
  const exceptionCount = (auditActions ?? []).filter(a => a.action === 'exception').length
  const totalActions = setOpisCount + exceptionCount
  const hitRate = totalActions > 0 ? Math.round((setOpisCount / totalActions) * 100) : 0
  const invoicesProcessed = setOpisCount

  // --- Previous period for trends ---
  let hitRateTrend: number | null = null
  let invoicesTrend: number | null = null

  if (days) {
    let prevQuery = supabase
      .from('audit_log')
      .select('action')
    if (selectedClient) prevQuery = prevQuery.eq('client_nip', selectedClient)
    prevQuery = prevQuery
      .gte('timestamp', formatDateSQL(days * 2))
      .lt('timestamp', formatDateSQL(days))
      .in('action', ['set_opis', 'exception'])
    prevQuery = applyNipFilter(prevQuery, nips, 'client_nip', ryczaltNips)

    const { data: prevActions } = await prevQuery
    const prevSetOpis = (prevActions ?? []).filter(a => a.action === 'set_opis').length
    const prevException = (prevActions ?? []).filter(a => a.action === 'exception').length
    const prevTotal = prevSetOpis + prevException
    const prevHitRate = prevTotal > 0 ? Math.round((prevSetOpis / prevTotal) * 100) : 0

    hitRateTrend = hitRate - prevHitRate
    invoicesTrend = invoicesProcessed - prevSetOpis
  }

  // --- Active rules ---
  let rulesQuery = supabase
    .from('rules')
    .select('id', { count: 'exact' })
  if (selectedClient) rulesQuery = rulesQuery.eq('client_nip', selectedClient)
  rulesQuery = applyNipFilter(rulesQuery, nips, 'client_nip', ryczaltNips)
  const { count: activeRules } = await rulesQuery

  // Rules trend (created in this period)
  let rulesTrend: number | null = null
  if (days) {
    let newRulesQuery = supabase
      .from('rules')
      .select('id', { count: 'exact' })
      .gte('created_at', formatDateSQL(days))
    if (selectedClient) newRulesQuery = newRulesQuery.eq('client_nip', selectedClient)
    newRulesQuery = applyNipFilter(newRulesQuery, nips, 'client_nip', ryczaltNips)
    const { count: newRules } = await newRulesQuery
    rulesTrend = newRules ?? 0
  }

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

  const metrics: DashboardMetrics = {
    hitRate,
    hitRateTrend,
    invoicesProcessed,
    invoicesTrend,
    activeRules: activeRules ?? 0,
    rulesTrend,
    pendingExceptions: pendingExceptions ?? 0,
    exceptionsTrend,
  }

  // ========== CHART DATA ==========
  let chartQuery = supabase
    .from('audit_log')
    .select('timestamp, action')
  if (selectedClient) chartQuery = chartQuery.eq('client_nip', selectedClient)
  if (days) chartQuery = chartQuery.gte('timestamp', formatDateSQL(days))
  chartQuery = chartQuery.in('action', ['set_opis', 'exception'])
  chartQuery = chartQuery.order('timestamp', { ascending: true })
  chartQuery = applyNipFilter(chartQuery, nips, 'client_nip', ryczaltNips)

  const { data: chartRaw } = await chartQuery

  // Group by date
  const chartMap = new Map<string, { obsluzone: number; wyjatki: number }>()
  for (const row of chartRaw ?? []) {
    const dateKey = new Date(row.timestamp).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
    })
    const existing = chartMap.get(dateKey) ?? { obsluzone: 0, wyjatki: 0 }
    if (row.action === 'set_opis') existing.obsluzone++
    else if (row.action === 'exception') existing.wyjatki++
    chartMap.set(dateKey, existing)
  }

  const chartData: ActivityChartData[] = Array.from(chartMap.entries()).map(
    ([data, counts]) => ({ data, ...counts })
  )

  // ========== TOP CLIENTS ==========
  let topClientsQuery = supabase
    .from('audit_log')
    .select('client_nip, action')
  if (days) topClientsQuery = topClientsQuery.gte('timestamp', formatDateSQL(days))
  topClientsQuery = topClientsQuery.in('action', ['set_opis', 'exception'])
  topClientsQuery = applyNipFilter(topClientsQuery, nips, 'client_nip', ryczaltNips)

  const { data: topClientsRaw } = await topClientsQuery

  // Fetch clients for name mapping (filtered by allowed NIPs)
  let clientsQuery = supabase
    .from('clients')
    .select('nip, nazwa')
    .eq('aktywny', true)
    .order('nazwa', { ascending: true })
  clientsQuery = applyNipFilter(clientsQuery, nips, 'nip', ryczaltNips)

  const { data: allClients } = await clientsQuery

  const clientMap = new Map((allClients ?? []).map(c => [c.nip, c.nazwa]))

  // Aggregate per client
  const clientAgg = new Map<string, { obsluzone: number; total: number }>()
  for (const row of topClientsRaw ?? []) {
    if (!row.client_nip) continue
    const existing = clientAgg.get(row.client_nip) ?? { obsluzone: 0, total: 0 }
    existing.total++
    if (row.action === 'set_opis') existing.obsluzone++
    clientAgg.set(row.client_nip, existing)
  }

  const topClients: TopClient[] = Array.from(clientAgg.entries())
    .map(([nip, counts]) => ({
      klient: clientMap.get(nip) ?? nip,
      obsluzone: counts.obsluzone,
      hit_rate: counts.total > 0 ? Math.round((counts.obsluzone / counts.total) * 100) : 0,
    }))
    .sort((a, b) => b.obsluzone - a.obsluzone)
    .slice(0, 10)

  // ========== TOP RULES ==========
  let topRulesQuery = supabase
    .from('rules')
    .select('id, pattern_pozycji, opis_zdarzenia, hit_count, client_nip')
    .order('hit_count', { ascending: false })
    .limit(10)
  if (selectedClient) topRulesQuery = topRulesQuery.eq('client_nip', selectedClient)
  topRulesQuery = applyNipFilter(topRulesQuery, nips, 'client_nip', ryczaltNips)

  const { data: topRulesRaw } = await topRulesQuery

  const topRules: TopRule[] = (topRulesRaw ?? []).map(r => ({
    id: r.id,
    pattern_pozycji: r.pattern_pozycji,
    opis_zdarzenia: r.opis_zdarzenia,
    klient: clientMap.get(r.client_nip) ?? r.client_nip,
    hit_count: r.hit_count,
  }))

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

  return (
    <DashboardClient
      metrics={metrics}
      chartData={chartData}
      topClients={topClients}
      topRules={topRules}
      recentActivity={recentActivity}
      clients={(allClients ?? []) as Pick<Client, 'nip' | 'nazwa'>[]}
      selectedClient={selectedClient}
      selectedPeriod={selectedPeriod}
    />
  )
}
