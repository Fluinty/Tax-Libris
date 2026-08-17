import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import { ClientsTableClient } from '@/components/clients/ClientsTableClient'
import type { ClientWithCounts, ClientMetricsRow } from '@/types/database'
import { BladOdczytu } from '@/components/shared/BladOdczytu'

export const dynamic = 'force-dynamic'

const OKRES_MAP: Record<string, () => string | null> = {
  'dzis': () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  },
  '7d': () => new Date(Date.now() - 7 * 86400_000).toISOString(),
  '30d': () => new Date(Date.now() - 30 * 86400_000).toISOString(),
  'all': () => null,
}

export default async function KlienciPage({ searchParams }: { searchParams: Promise<{ okres?: string }> }) {
  const params = await searchParams
  const okresKey = params.okres || 'all'
  const since = (OKRES_MAP[okresKey] ?? OKRES_MAP['all'])()

  const supabase = createSupabaseAdmin()
  const { nips, isAdmin, ryczaltNips, demoNips } = await getAllowedNips()

  // Fetch active clients (filtered by allowed NIPs)
  let clientsQuery = supabase
    .from('clients')
    .select('*')
    .eq('aktywny', true)
    .order('nazwa', { ascending: true })
  clientsQuery = applyNipFilter(clientsQuery, nips, 'nip', ryczaltNips, demoNips, isAdmin)

  const { data: clients, error: clientsError } = await clientsQuery

  // Fetch metrics from RPC (schemat fluinty — jawnie)
  const { data: metricsData, error: metricsError } = await supabase
    .schema('fluinty')
    .rpc('client_metrics', { since })

  // AUDIT §2 (C8): awaria odczytu = komunikat, nie pusta lista klientow
  if (clientsError) return <BladOdczytu tabela="clients" message={clientsError.message} />
  if (metricsError) return <BladOdczytu tabela="client_metrics (RPC)" message={metricsError.message} />

  // Kill-switch globalny automatu — TYLKO odczyt; zmiana wyłącznie ręcznym SQL-em
  // właściciela (fluinty.config, key='auto_write_global'). Brak wiersza/tabeli
  // lub błąd = traktujemy jak 'off' (fail-safe: automat rozbrojony).
  const { data: configRow, error: configError } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'auto_write_global')
    .maybeSingle()

  if (configError) {
    console.error('[KlienciPage] odczyt fluinty.config auto_write_global error:', configError)
  }
  const autoWriteGlobal: 'on' | 'off' = configRow?.value === 'on' ? 'on' : 'off'

  // NIP-filtrowanie metryk po stronie JS (jak dotąd dla views)
  const allowedNipSet = nips ? new Set(nips) : null
  const metricsMap = new Map<string, ClientMetricsRow>()
  for (const m of (metricsData ?? []) as ClientMetricsRow[]) {
    if (allowedNipSet && !allowedNipSet.has(m.client_nip)) continue
    metricsMap.set(m.client_nip, m)
  }

  const clientsWithCounts: ClientWithCounts[] = (clients ?? []).map((c) => ({
    ...c,
    pending_count: metricsMap.get(c.nip)?.pending_count ?? 0,
    ai_count: metricsMap.get(c.nip)?.ai_count ?? 0,
    external_count: metricsMap.get(c.nip)?.external_count ?? 0,
    skipped_count: metricsMap.get(c.nip)?.skipped_count ?? 0,
    czyste_ksiegowo: metricsMap.get(c.nip)?.czyste_ksiegowo ?? 0,
    decyzje_ksiegowe: metricsMap.get(c.nip)?.decyzje_ksiegowe ?? 0,
    decyzje_realne: metricsMap.get(c.nip)?.decyzje_realne ?? 0,
    pct_ksiegowa: metricsMap.get(c.nip)?.pct_ksiegowa ?? null,
    auto_verdict: metricsMap.get(c.nip)?.auto_verdict ?? null,
  }))

  const totalActive = clientsWithCounts.length
  const totalClients = isAdmin ? 300 : totalActive

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1E293B]">
          Klienci biura
        </h1>
        <p className="text-sm text-[#64748B] mt-1">
          <span className="font-semibold text-[#1E293B]">{totalActive}</span> aktywnych{isAdmin ? ` z ~${totalClients}` : ''}
        </p>
      </div>

      <ClientsTableClient
        clients={clientsWithCounts}
        isAdmin={isAdmin}
        okres={okresKey}
        autoWriteGlobal={autoWriteGlobal}
      />
    </div>
  )
}
