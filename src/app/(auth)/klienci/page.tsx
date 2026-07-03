import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import { ClientsTableClient } from '@/components/clients/ClientsTableClient'
import type { ClientWithCounts } from '@/types/database'

export default async function KlienciPage() {
  const supabase = createSupabaseAdmin()
  const { nips, isAdmin, ryczaltNips } = await getAllowedNips()

  // Fetch active clients (filtered by allowed NIPs)
  let clientsQuery = supabase
    .from('clients')
    .select('*')
    .eq('aktywny', true)
    .order('nazwa', { ascending: true })
  clientsQuery = applyNipFilter(clientsQuery, nips, 'nip', ryczaltNips)

  const { data: clients } = await clientsQuery

  // Fetch pending exceptions count per client
  let excCountQuery = supabase
    .from('exceptions_queue')
    .select('client_nip')
    .in('status', ['pending', 'pending_review'])
  excCountQuery = applyNipFilter(excCountQuery, nips, 'client_nip', ryczaltNips)
  const { data: exceptionsCounts } = await excCountQuery

  // Aggregate counts
  const exceptionsMap = new Map<string, number>()
  for (const e of exceptionsCounts ?? []) {
    exceptionsMap.set(e.client_nip, (exceptionsMap.get(e.client_nip) ?? 0) + 1)
  }

  const clientsWithCounts: ClientWithCounts[] = (clients ?? []).map((c) => ({
    ...c,
    exceptions_count: exceptionsMap.get(c.nip) ?? 0,
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
