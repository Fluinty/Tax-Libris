import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips } from '@/lib/auth-helpers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ClientHeader } from '@/components/client-detail/ClientHeader'
import { ClientStats } from '@/components/client-detail/ClientStats'
import { ClientDataPanel } from '@/components/client-detail/ClientDataPanel'
import { PojazdyTable } from '@/components/client-detail/PojazdyTable'
import { OpisyTable } from '@/components/client-detail/OpisyTable'
import { ClientChangesLog } from '@/components/client-detail/ClientChangesLog'
import { AutoWriteSection } from '@/components/client-detail/AutoWriteSection'

export default async function ClientDetailPage({ params }: { params: Promise<{ nip: string }> }) {
  const { nip } = await params
  const { nips, isAdmin, ryczaltNips } = await getAllowedNips()

  // Authorization check: non-admin can only view their assigned NIPs
  // Also block ryczalt clients for everyone
  if (ryczaltNips.includes(nip)) {
    notFound()
  }
  if (!isAdmin && nips && !nips.includes(nip)) {
    notFound()
  }

  const supabase = createSupabaseAdmin()

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('nip', nip)
    .single()

  if (!client) {
    notFound()
  }

  // Statystyki
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysIso = thirtyDaysAgo.toISOString()

  // 1. Zsumowane exception i reguly
  const { count: exceptionsCount } = await supabase.from('exceptions_queue').select('*', { count: 'exact', head: true }).eq('client_nip', nip).in('status', ['pending', 'pending_review'])
  const { count: rulesCount } = await supabase.from('rules').select('*', { count: 'exact', head: true }).eq('client_nip', nip)

  // 2. Faktury z tego miesiąca (z auditu action = 'auto_create_full' lub 'set_opis')
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { count: invoicesMonth } = await supabase.from('audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('client_nip', nip)
    .in('action', ['auto_create_full', 'set_opis'])
    .gte('timestamp', firstDayOfMonth)

  // 3. Pojazdy
  const { data: pojazdy } = await supabase.from('client_pojazdy').select('*').eq('client_nip', nip).order('aktywny', { ascending: false }).order('data_dodania', { ascending: false })
  const activePojazdyCount = pojazdy?.filter(p => p.aktywny).length || 0

  // 4. Hit rate (przybliżenie na bazie ostatnich 30 dni)
  const { data: recentAudits } = await supabase.from('audit_log')
    .select('action, timestamp')
    .eq('client_nip', nip)
    .in('action', ['auto_create_full', 'set_opis', 'exception'])
    .gte('timestamp', thirtyDaysIso)

  let autoCount = 0
  let exceptionCount = 0

  const dailyStats = new Map() // 'YYYY-MM-DD' => { auto: 0, wyjatki: 0 }

  for (const a of recentAudits || []) {
    const d = a.timestamp.split('T')[0]
    if (!dailyStats.has(d)) dailyStats.set(d, { data: d, obsluzone: 0, wyjatki: 0 })

    if (a.action === 'exception') {
      exceptionCount++
      dailyStats.get(d).wyjatki++
    } else {
      autoCount++
      dailyStats.get(d).obsluzone++
    }
  }

  const hitRate = (autoCount + exceptionCount) > 0 ? Math.round((autoCount / (autoCount + exceptionCount)) * 100) : 0

  // Sort and format chart data
  const chartData = Array.from(dailyStats.values()).sort((a, b) => a.data.localeCompare(b.data))

  const stats = {
    invoicesMonth: invoicesMonth || 0,
    hitRate,
    exceptionsCount: exceptionsCount || 0,
    rulesCount: rulesCount || 0,
    activePojazdyCount,
    chartData
  }

  // Opisy
  const { data: opisy } = await supabase.from('client_opisy').select('*').eq('client_nip', nip).order('hit_count', { ascending: false })

  // Logi (ostatnie 20)
  const { data: logs } = await supabase.from('client_changes_log')
    .select('*')
    .eq('client_nip', nip)
    .order('changed_at', { ascending: false })
    .limit(20)

  // Kandydat na auto: policz z ostatnich 50 rekordów klienta o statusie approved/auto_created/resolved
  const { data: candidateRecords } = await supabase
    .from('exceptions_queue')
    .select('final_kwoty_per_kolumna, final_zapis_vat_data, final_opis, final_kpir_pojazdowe_data')
    .eq('client_nip', nip)
    .in('status', ['approved', 'auto_created', 'resolved'])
    .order('id', { ascending: false })
    .limit(50)

  const records = candidateRecords || []
  const totalCount = records.length
  const editedCount = records.filter(r => 
    r.final_kwoty_per_kolumna != null ||
    r.final_zapis_vat_data != null ||
    r.final_opis != null ||
    r.final_kpir_pojazdowe_data != null
  ).length
  const editRatePct = totalCount > 0 ? Math.round((editedCount / totalCount) * 100) : 0
  const isCandidate = totalCount >= 50 && editRatePct < 5
  const candidateStats = { isCandidate, editRatePct, totalCount }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <Link href="/klienci" className="inline-flex items-center text-sm font-medium text-[#64748B] hover:text-[#1F3A5F]">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Wróć do listy
      </Link>

      <ClientHeader client={client} isAdmin={isAdmin} />

      <AutoWriteSection client={client} isAdmin={isAdmin} candidateStats={candidateStats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <ClientStats stats={stats} />
        <ClientDataPanel client={client} isAdmin={isAdmin} />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <PojazdyTable nip={nip} pojazdy={pojazdy || []} />
        <OpisyTable nip={nip} opisy={opisy || []} />
        <ClientChangesLog logs={logs || []} />
      </div>
    </div>
  )
}
