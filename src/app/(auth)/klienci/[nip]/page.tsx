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
import { RecentExceptionsTable } from '@/components/client-detail/RecentExceptionsTable'
import { LearningSection } from '@/components/client-detail/LearningSection'
import { GateSimulationSection } from '@/components/client-detail/GateSimulationSection'
import { BladOdczytu } from '@/components/shared/BladOdczytu'

export const dynamic = 'force-dynamic'

export default async function ClientDetailPage({ params }: { params: Promise<{ nip: string }> }) {
  const { nip } = await params
  const { nips, isAdmin, ryczaltNips, demoNips } = await getAllowedNips()

  // Authorization check: non-admin can only view their assigned NIPs
  // Also block ryczalt clients for everyone
  if (ryczaltNips.includes(nip)) {
    notFound()
  }
  if (!isAdmin && nips === null && demoNips.includes(nip)) {
    notFound()
  }
  if (!isAdmin && nips && !nips.includes(nip)) {
    notFound()
  }

  const supabase = createSupabaseAdmin()

  // maybeSingle + błąd sprawdzany PRZED notFound: przy .single() KAŻDY błąd
  // (także awaria bazy) dawał data=null, więc `if (!client) notFound()` ubiegał
  // check błędu — awaria Supabase renderowała mylące 404 „klient nie istnieje"
  // (recenzja Fali 3). Teraz: błąd odczytu → BladOdczytu; brak wiersza → 404.
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('nip', nip)
    .maybeSingle()

  if (clientError) return <BladOdczytu tabela="clients" message={clientError.message} />
  if (!client) {
    notFound()
  }

  // Statystyki
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysIso = thirtyDaysAgo.toISOString()

  // 1. Zsumowane exception (błąd countu NIE może po cichu pokazać „0 zaległości")
  const { count: exceptionsCount, error: exCountError } = await supabase.from('exceptions_queue').select('*', { count: 'exact', head: true }).eq('client_nip', nip).in('status', ['pending', 'pending_review'])

  // 2. Faktury z tego miesiąca (z auditu action = 'auto_create_full' lub 'set_opis')
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { count: invoicesMonth, error: invCountError } = await supabase.from('audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('client_nip', nip)
    .in('action', ['auto_create_full', 'set_opis'])
    .gte('timestamp', firstDayOfMonth)

  // 3. Pojazdy
  const { data: pojazdy, error: pojazdyError } = await supabase.from('client_pojazdy').select('*').eq('client_nip', nip).order('aktywny', { ascending: false }).order('data_dodania', { ascending: false })
  const activePojazdyCount = pojazdy?.filter(p => p.aktywny).length || 0

  // 4. Hit rate (przybliżenie na bazie ostatnich 30 dni)
  const { data: recentAudits, error: auditsError } = await supabase.from('audit_log')
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
    activePojazdyCount,
    chartData
  }

  // Opisy
  const { data: opisy, error: opisyError } = await supabase.from('client_opisy').select('*').eq('client_nip', nip).order('hit_count', { ascending: false })

  // Logi (ostatnie 20)
  const { data: logs, error: logsError } = await supabase.from('client_changes_log')
    .select('*')
    .eq('client_nip', nip)
    .order('changed_at', { ascending: false })
    .limit(20)

  // Kandydat na auto: policz z ostatnich 50 rekordów klienta o statusie approved/auto_created/resolved
  const { data: candidateRecords, error: candidateError } = await supabase
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

  // JAWNA lista kolumn: tabela ma 80 kolumn z ciezkimi jsonb (pozycje_xml_full,
  // zapis_vat_data), a RecentExceptionsTable czyta 8 pol — pelne wiersze to
  // ~2,5 kB/szt. niepotrzebnego transferu na kazde wejscie na karte klienta.
  const { data: recentExceptions, error: recentError } = await supabase
    .from('exceptions_queue')
    .select('id, client_nip, status, ksiegowe_numer, nazwa_dostawcy, kwota_brutto, created_at, resolved_by, auto_created_by')
    .eq('client_nip', nip)
    .order('id', { ascending: false })
    .limit(20)

  // AUDIT §2 (C8): awaria odczytu = komunikat z tabela, nie pusta karta klienta
  // (clientError obsłużony wyżej, przed notFound — patrz komentarz przy odczycie)
  if (exCountError) return <BladOdczytu tabela="exceptions_queue (licznik pending)" message={exCountError.message} />
  if (invCountError) return <BladOdczytu tabela="audit_log (licznik miesiąca)" message={invCountError.message} />
  if (pojazdyError) return <BladOdczytu tabela="client_pojazdy" message={pojazdyError.message} />
  if (auditsError) return <BladOdczytu tabela="audit_log" message={auditsError.message} />
  if (opisyError) return <BladOdczytu tabela="client_opisy" message={opisyError.message} />
  if (logsError) return <BladOdczytu tabela="client_changes_log" message={logsError.message} />
  if (candidateError) return <BladOdczytu tabela="exceptions_queue (kandydat auto)" message={candidateError.message} />
  if (recentError) return <BladOdczytu tabela="exceptions_queue (ostatnie karty)" message={recentError.message} />

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
        {/* Dane LAZY — obie sekcje strzelają do swoich akcji przy pierwszym rozwinięciu */}
        <GateSimulationSection nip={nip} />
        <LearningSection nip={nip} />
        {/* Cast przez unknown — zawezony select to podzbior ExceptionItem,
            komponent czyta wylacznie te 8 pol (grep item.*) */}
        <RecentExceptionsTable items={(recentExceptions || []) as unknown as import('@/types/database').ExceptionItem[]} />
        <PojazdyTable nip={nip} pojazdy={pojazdy || []} />
        <OpisyTable nip={nip} opisy={opisy || []} />
        <ClientChangesLog logs={logs || []} />
      </div>
    </div>
  )
}
