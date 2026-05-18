import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import type { ExceptionWithClient, ClientExceptionCount, ClientPojazd } from '@/types/database'
import { FakturaCard } from '@/components/do-akceptacji/FakturaCard'
import { ClientSidebar } from '@/components/exceptions/ClientSidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, BarChart2 } from 'lucide-react'
import { RealtimeToast } from '@/components/do-akceptacji/RealtimeToast'
import { FakturaListClient } from './FakturaListClient'

export const revalidate = 30 // Auto-refresh (ISR) co 30 sekund

interface PageProps {
  searchParams: Promise<{ client?: string; sort?: string; typ?: string }>
}

export default async function DoAkceptacjiPage({ searchParams }: PageProps) {
  const params = await searchParams
  const typFilter = params.typ ?? 'zakup'
  const supabase = createSupabaseAdmin()
  const { nips } = await getAllowedNips()

  // 1. Fetch all relevant exceptions (pending, pending_review, auto_created today)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let exceptionsQuery = applyNipFilter(
    supabase
      .from('exceptions_queue')
      .select('*, clients!inner(nazwa, platnik_vat)')
      .in('status', ['pending', 'pending_review', 'auto_created']),
    nips
  )

  if (params.client) {
    exceptionsQuery = exceptionsQuery.eq('client_nip', params.client)
  }

  // Apply sorting
  switch (params.sort) {
    case 'oldest':
      exceptionsQuery = exceptionsQuery.order('created_at', { ascending: true })
      break
    case 'highest':
      exceptionsQuery = exceptionsQuery.order('kwota_brutto', { ascending: false, nullsFirst: false })
      break
    case 'lowest':
      exceptionsQuery = exceptionsQuery.order('kwota_brutto', { ascending: true, nullsFirst: false })
      break
    default:
      exceptionsQuery = exceptionsQuery.order('created_at', { ascending: false })
  }

  const { data: rawExceptions } = await exceptionsQuery

  // Transform to typed data
  const allExceptions: ExceptionWithClient[] = (rawExceptions ?? []).map((e) => {
    const clientData = e.clients as unknown as { nazwa: string; platnik_vat?: boolean }
    return {
      ...e,
      client_nazwa: clientData?.nazwa ?? 'Nieznany',
      client: {
        platnik_vat: clientData?.platnik_vat ?? true, // default to true (safe: shows VAT sections)
      } as any,
      clients: undefined,
    }
  })

  // Brak filtra typu na poziomie serwera - przekazujemy wszystko do klienta
  const typedExceptions = allExceptions

  // Split into sections
  const pendingReview = typedExceptions.filter(e => e.status === 'pending_review')
  const pending = typedExceptions.filter(e => e.status === 'pending')
  const autoCreated = typedExceptions.filter(e => 
    e.status === 'auto_created' && new Date(e.created_at) >= today
  )

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
      .from('exceptions_queue')
      .select('status, ai_confidence, created_at')
      .gte('created_at', today.toISOString()),
    nips
  )

  const todayStats = todayStatsData ?? []
  const todayTotal = todayStats.length
  const todayToAccept = todayStats.filter(e => e.status === 'pending_review').length
  const todayExceptions = todayStats.filter(e => e.status === 'pending').length
  const todayErrors = todayStats.filter(e => e.status === 'ignored').length // lub inny status błędu jeśli używamy
  
  const highConfidenceProposals = todayStats.filter(e => e.ai_confidence && e.ai_confidence >= 0.8).length
  const hitRate = todayTotal > 0 ? Math.round((highConfidenceProposals / todayTotal) * 100) : 0

  // 4. Sidebar - count items per client (count pending and pending_review)
  const { data: allPendingItems } = await applyNipFilter(
    supabase
      .from('exceptions_queue')
      .select('client_nip, typ_dokumentu, ai_proponowany_opis, clients!inner(nazwa)')
      .in('status', ['pending', 'pending_review']),
    nips
  )

  const filteredItemsForSidebar = allPendingItems ?? []

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
          nazwa: (item.clients as unknown as { nazwa: string })?.nazwa ?? 'Nieznany',
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
              currentSort={params.sort ?? 'newest'}
            />
          </div>
        </aside>

        {/* LISTA FAKTUR */}
        <div className="flex-1 min-w-0 pb-20">
          <FakturaListClient 
            pendingReview={pendingReview}
            pending={pending}
            autoCreated={autoCreated}
            clientOpisyMap={new Map(clientOpisyMapAsArray) as any}
            clientPojazdyMap={clientPojazdyRecord}
          />
        </div>
      </main>
    </div>
  )
}
