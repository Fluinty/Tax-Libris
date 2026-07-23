import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import { ClientsTableClient } from '@/components/clients/ClientsTableClient'
import type { ClientWithCounts } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function KlienciPage() {
  const supabase = createSupabaseAdmin()
  const { nips, isAdmin, ryczaltNips, demoNips } = await getAllowedNips()

  // Fetch active clients (filtered by allowed NIPs)
  let clientsQuery = supabase
    .from('clients')
    .select('*')
    .eq('aktywny', true)
    .order('nazwa', { ascending: true })
  clientsQuery = applyNipFilter(clientsQuery, nips, 'nip', ryczaltNips, demoNips, isAdmin)

  const { data: clients } = await clientsQuery

  // Fetch metrics from view
  let metricsQuery = supabase.from('client_metrics_view').select('*')
  metricsQuery = applyNipFilter(metricsQuery, nips, 'client_nip', ryczaltNips, demoNips, isAdmin)
  const { data: metricsData } = await metricsQuery

  const metricsMap = new Map<string, any>()
  for (const m of metricsData ?? []) {
    metricsMap.set(m.client_nip, m)
  }

  // TODO na pozycje: W przyszłości dodać wliczanie pozycje_vat_edited = true LUB final_* NOT NULL z faktury_pozycje.
  // Obecnie liczymy tylko wyjątki na poziomie nagłówka.
  const clientsWithCounts: ClientWithCounts[] = (clients ?? []).map((c) => ({
    ...c,
    pending_count: metricsMap.get(c.nip)?.pending_count ?? 0,
    history_count: metricsMap.get(c.nip)?.history_count ?? 0,
    decisions_count: metricsMap.get(c.nip)?.decisions_count ?? 0,
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
      />
    </div>
  )
}
