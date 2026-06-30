import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import { ClientChangesLog } from '@/components/client-detail/ClientChangesLog'

export const dynamic = 'force-dynamic'

export default async function LogsPage() {
  const adminSupabase = createSupabaseAdmin()
  const { nips, ryczaltNips } = await getAllowedNips()

  // Pobierz ostatnie logi globalnie (filtered by allowed NIPs)
  let logsQuery = adminSupabase
    .from('client_changes_log')
    .select('*, clients(nazwa)')
    .order('changed_at', { ascending: false })
    .limit(100)
  logsQuery = applyNipFilter(logsQuery, nips, 'client_nip', ryczaltNips)

  const { data: logs } = await logsQuery

  const formattedLogs = logs?.map(l => {
    const clientName = Array.isArray(l.clients) ? l.clients[0]?.nazwa : (l.clients as any)?.nazwa
    return {
      ...l,
      field_name: `[${clientName || l.client_nip}] ${l.field_name}`
    }
  }) || []

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1F3A5F] tracking-tight">Logi Zmian (Audit)</h1>
        <p className="text-[#64748B] mt-1">Historia edycji danych klientów, pojazdów i opisów.</p>
      </div>

      <ClientChangesLog logs={formattedLogs} />
    </div>
  )
}
