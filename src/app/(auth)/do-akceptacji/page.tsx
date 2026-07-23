import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import type { ExceptionWithClient, ClientExceptionCount, ClientPojazd } from '@/types/database'
import { FakturaCard } from '@/components/do-akceptacji/FakturaCard'
import { ClientSidebar } from '@/components/exceptions/ClientSidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, BarChart2 } from 'lucide-react'
import { RealtimeToast } from '@/components/do-akceptacji/RealtimeToast'
import { FakturaListClient } from './FakturaListClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface PageProps {
  searchParams: Promise<{ client?: string; sort?: string; typ?: string }>
}

export default async function DoAkceptacjiPage({ searchParams }: PageProps) {
  const params = await searchParams
  const typFilter = params.typ ?? 'all'
  const supabase = createSupabaseAdmin()
  const { nips, isAdmin, ryczaltNips, demoNips } = await getAllowedNips()

  // 1. Fetch all relevant exceptions (pending + pending_review only)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 1a. Fetch exceptions from view (without embedded joins — views lack FK constraints)
  let exceptionsQuery = applyNipFilter(
    supabase
      .from('exceptions_queue_v2')
      .select(`*`)
      .in('status', ['pending', 'pending_review']),
    nips,
    'client_nip',
    ryczaltNips
  )

  if (typFilter === 'zakup' || typFilter === 'sprzedaz') {
    exceptionsQuery = exceptionsQuery.eq('typ_dokumentu', typFilter)
  }

  if (params.client) {
    exceptionsQuery = exceptionsQuery.eq('client_nip', params.client)
  }

  // Apply sorting
  switch (params.sort) {
    case 'newest':
      exceptionsQuery = exceptionsQuery.order('created_at', { ascending: false })
      break
    case 'highest':
    case 'amount_desc':
      exceptionsQuery = exceptionsQuery.order('kwota_brutto', { ascending: false, nullsFirst: false })
      break
    case 'lowest':
      exceptionsQuery = exceptionsQuery.order('kwota_brutto', { ascending: true, nullsFirst: false })
      break
    case 'conf_desc':
      exceptionsQuery = exceptionsQuery.order('confidence_overall', { ascending: false, nullsFirst: false })
      break
    case 'conf_asc':
      exceptionsQuery = exceptionsQuery.order('confidence_overall', { ascending: true, nullsFirst: false })
      break
    case 'oldest':
    default:
      exceptionsQuery = exceptionsQuery.order('created_at', { ascending: true })
  }

  const { data: rawExceptions, error: rawError } = await exceptionsQuery

  console.log('[do-akceptacji] rawExceptions count:', rawExceptions?.length, 'error:', rawError?.message ?? 'none')

  // 1b. Fetch clients separately and build lookup map
  const exceptionNips = [...new Set(rawExceptions?.map(e => e.client_nip) ?? [])]
  const { data: clientsData } = exceptionNips.length > 0
    ? await supabase
        .from('clients')
        .select('nip, nazwa, platnik_vat, is_demo')
        .in('nip', exceptionNips)
    : { data: [] as { nip: string; nazwa: string; platnik_vat: boolean; is_demo: boolean }[] }

  const clientsMap = new Map(
    (clientsData ?? []).map(c => [c.nip, c])
  )

  // 1c. Fetch ai_review_log and faktury_pozycje separately
  const exceptionIds = rawExceptions?.map(e => e.id) ?? []
  const [{ data: reviewLogsData }, { data: pozycjeData }] = exceptionIds.length > 0
    ? await Promise.all([
        supabase
          .from('ai_review_log')
          .select('id, queue_id, review_ok, review_pewnosc, review_ostrzezenia, review_sugestie, data_utworzenia')
          .in('queue_id', exceptionIds),
        supabase
          .from('faktury_pozycje')
          .select('*')
          .in('faktura_id', exceptionIds)
          .order('lp', { ascending: true })
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }]

  const reviewMap = new Map<number, typeof reviewLogsData>()
  for (const log of reviewLogsData ?? []) {
    const existing = reviewMap.get(log.queue_id) ?? []
    existing.push(log)
    reviewMap.set(log.queue_id, existing)
  }

  const pozycjeMap = new Map<number, any[]>()
  for (const p of pozycjeData ?? []) {
    const existing = pozycjeMap.get(p.faktura_id) ?? []
    existing.push(p)
    pozycjeMap.set(p.faktura_id, existing)
  }

  // 1d. Merge exceptions with client data and review logs
  const allExceptions: ExceptionWithClient[] = (rawExceptions ?? []).map((e) => {
    const c = clientsMap.get(e.client_nip)
    return {
      ...e,
      client_nazwa: c?.nazwa ?? 'Nieznany',
      is_demo: c?.is_demo ?? false,
      client: {
        platnik_vat: c?.platnik_vat ?? true,
      } as any,
      ai_review_log: reviewMap.get(e.id) ?? [],
      pozycje_editable: pozycjeMap.get(e.id) ?? [],
    }
  })

  console.log('[do-akceptacji] allExceptions count:', allExceptions.length)

  // Brak filtra typu na poziomie serwera - przekazujemy wszystko do klienta
  const typedExceptions = allExceptions

  // Split into sections
  const pendingReview = typedExceptions.filter(e => e.status === 'pending_review')
  const pending = typedExceptions.filter(e => e.status === 'pending')

  // 2. Fetch all client descriptions for the comboboxes
  // Collect unique NIPs
  const currentNips = Array.from(new Set(typedExceptions.map(e => e.client_nip)))
  const { data: clientOpisyData } = await supabase
    .from('client_opisy')
    .select('id, client_nip, opis, aktywny, typ_dokumentu')
    .in('client_nip', currentNips.length > 0 ? currentNips : ['dummy'])

  const clientOpisyRecord: Record<string, { id: number, nazwa: string, aktywny: boolean, typ_dokumentu: string | null }[]> = {}
  for (const op of clientOpisyData ?? []) {
    if (!clientOpisyRecord[op.client_nip]) {
      clientOpisyRecord[op.client_nip] = []
    }
    clientOpisyRecord[op.client_nip].push({
      id: op.id,
      nazwa: op.opis, // mapujemy opis z bazy na oczekiwane pole nazwa przez komponenty UI
      aktywny: op.aktywny,
      typ_dokumentu: op.typ_dokumentu
    })
  }

  // 2b. Fetch all vehicle data for the comboboxes (pre-fetch, sesja 7)
  const { data: pojazdyData } = await supabase
    .from('client_pojazdy')
    .select('*')
    .in('client_nip', currentNips.length > 0 ? currentNips : ['dummy'])

  const clientPojazdyRecord: Record<string, ClientPojazd[]> = {}
  for (const p of (pojazdyData ?? []) as ClientPojazd[]) {
    if (!clientPojazdyRecord[p.client_nip]) {
      clientPojazdyRecord[p.client_nip] = []
    }
    clientPojazdyRecord[p.client_nip].push(p)
  }

  // 3. Statystyki dnia (obliczane ze wszystkich faktur z dzisiaj)
  const { data: todayStatsData } = await applyNipFilter(
    supabase
      .from('exceptions_queue_v2')
      .select('status, ai_confidence, created_at')
      .gte('created_at', today.toISOString()),
    nips,
    'client_nip',
    ryczaltNips
  )

  const todayStats = todayStatsData ?? []
  const todayTotal = todayStats.length
  const todayToAccept = todayStats.filter(e => e.status === 'pending_review').length
  const todayExceptions = todayStats.filter(e => e.status === 'pending').length
  const todayErrors = todayStats.filter(e => e.status === 'ignored').length // lub inny status błędu jeśli używamy
  
  const highConfidenceProposals = todayStats.filter(e => e.ai_confidence && e.ai_confidence >= 0.8).length
  const hitRate = todayTotal > 0 ? Math.round((highConfidenceProposals / todayTotal) * 100) : 0

  // 4. Sidebar - count items per client (count pending and pending_review)
  // 4a. Sidebar - fetch pending items from view (without clients join)
  const { data: allPendingItems } = await applyNipFilter(
    supabase
      .from('exceptions_queue_v2')
      .select('client_nip, typ_dokumentu, ai_proponowany_opis')
      .in('status', ['pending', 'pending_review']),
    nips,
    'client_nip',
    ryczaltNips
  )

  const filteredItemsForSidebar = allPendingItems ?? []

  // 4b. Fetch client names for sidebar (reuse clientsMap if NIPs overlap, else fetch)
  const sidebarNips = [...new Set(filteredItemsForSidebar.map(i => i.client_nip))]
  const missingSidebarNips = sidebarNips.filter(n => !clientsMap.has(n))
  if (missingSidebarNips.length > 0) {
    const { data: extraClients } = await supabase
      .from('clients')
      .select('nip, nazwa, platnik_vat, is_demo')
      .in('nip', missingSidebarNips)
    for (const c of extraClients ?? []) {
      clientsMap.set(c.nip, c)
    }
  }

  function aggregateCounts(items: any[]): ClientExceptionCount[] {
    const counts = new Map<string, ClientExceptionCount>()
    for (const item of items) {
      const existing = counts.get(item.client_nip)
      const hasAi = !!item.ai_proponowany_opis
      if (existing) {
        existing.pending_count++
        if (hasAi) existing.has_ai_proposal = true
      } else {
        counts.set(item.client_nip, {
          client_nip: item.client_nip,
          nazwa: clientsMap.get(item.client_nip)?.nazwa ?? 'Nieznany',
          pending_count: 1,
          has_ai_proposal: hasAi,
        })
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.pending_count - a.pending_count)
  }

  const clientsWithCounts = aggregateCounts(filteredItemsForSidebar)
  const totalPending = filteredItemsForSidebar.length
  const currentPendingCount = pendingReview.length + pending.length // for toast

  // Helper map do serializacji dla client component
  // Odtwarzamy Mapę z rekordu wewnątrz client componentu (lub pass Record)
  const clientOpisyMapAsArray = Object.entries(clientOpisyRecord)

  return (
    <div className="flex-1 bg-[#F8FAFC]">
      <RealtimeToast currentPendingCount={currentPendingCount} />

      {/* STICKY STATS HEADER */}
      <div className="sticky top-16 z-40 bg-white border-b border-[#E2E8F0] px-4 sm:px-6 lg:px-8 py-3 shadow-sm">
        <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center gap-4 text-sm font-medium">
          <div className="flex items-center gap-2 text-[#1F3A5F]">
            <BarChart2 className="w-4 h-4" />
            Statystyki dnia
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="text-slate-600">Dziś: <span className="font-bold text-[#1E293B]">{todayTotal}</span> faktur</div>
          <div className="text-[#4A90E2]"><span className="font-bold">{todayToAccept}</span> do akceptacji</div>
          <div className="text-red-500"><span className="font-bold">{todayExceptions}</span> wyjątki</div>
          <div className="text-amber-500"><span className="font-bold">{todayErrors}</span> błędów</div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="text-emerald-600">Hit rate AI: <span className="font-bold">{hitRate}%</span></div>
        </div>
      </div>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row gap-8">
        {/* SIDEBAR */}
        <aside className="w-full md:w-64 shrink-0">
          <div className="sticky top-[120px]">
            <ClientSidebar
              clients={clientsWithCounts}
              totalPending={totalPending}
              selectedClient={params.client ?? null}
              currentTyp={'all'}
              currentSort={params.sort ?? 'oldest'}
            />
          </div>
        </aside>

        {/* LISTA FAKTUR */}
        <div className="flex-1 min-w-0 max-w-full pb-20">
          <FakturaListClient 
            pendingReview={pendingReview}
            pending={pending}
            autoCreated={[]}
            clientOpisyMap={new Map(clientOpisyMapAsArray) as any}
            clientPojazdyMap={clientPojazdyRecord}
          />
        </div>
      </main>
    </div>
  )
}
