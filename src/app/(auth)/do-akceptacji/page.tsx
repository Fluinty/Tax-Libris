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

/**
 * Kolumny faktury_pozycje wysyłane do karty — JAWNA lista zamiast `select('*')`.
 * Tabela ma kolumnę `nazwa_embedding` (vector 1536, ~6 kB/wiersz), której panel
 * nigdzie nie czyta, a która leciała do przeglądarki przy każdym wejściu na
 * kolejkę i przy auto-refreshu co 30 s. Lista musi odpowiadać typowi
 * `FakturaPozycjaKarta` (src/types/database.ts).
 * UWAGA: kolumny effective_* są GENERATED — wolno je SELECTOWAĆ (tak samo robi
 * ścieżka approve), ale nigdy nie wpisywać w UPDATE.
 */
const POZYCJE_KARTY_COLUMNS = [
  'id', 'faktura_id', 'lp', 'nazwa', 'ilosc', 'jednostka',
  'stawka_vat', 'wartosc_netto', 'wartosc_brutto',
  'ai_kolumna_kpir', 'final_kolumna_kpir', 'effective_kolumna_kpir',
  'ai_podstawa_prawna', 'final_podstawa_prawna',
  'edytowane_przez_monike', 'walidator_zmiana',
  'final_kup_status', 'effective_kup_status',
  'final_vat_odliczalny', 'effective_vat_odliczalny',
  'effective_gtu_bits',
].join(', ')

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
    ryczaltNips,
    demoNips,
    isAdmin
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

  // ── ETAP 1: trzy niezależne zapytania RÓWNOLEGLE ──────────────────────────
  // Graf zależności: (A) lista v2, (G) statystyki dnia i (H) pozycje sidebara
  // zależą WYŁĄCZNIE od nips z getAllowedNips — dotąd leciały sekwencyjnie na
  // końcu waterfalla. (H) w ogóle nie strzela, gdy lista nie ma filtra
  // klient/typ: wtedy (A) zawiera dokładnie te same wiersze pending* i sidebar
  // liczy się z already-pobranych danych (dedup — trzeci strzał w v2 był kopią
  // pierwszego).
  const hasListFilter = Boolean(params.client) || typFilter === 'zakup' || typFilter === 'sprzedaz'

  const todayStatsQuery = applyNipFilter(
    supabase
      .from('exceptions_queue_v2')
      .select('status, ai_confidence')
      .gte('created_at', today.toISOString()),
    nips,
    'client_nip',
    ryczaltNips,
    demoNips,
    isAdmin
  )
  const sidebarQuery = applyNipFilter(
    supabase
      .from('exceptions_queue_v2')
      .select('client_nip, typ_dokumentu, ai_proponowany_opis')
      .in('status', ['pending', 'pending_review']),
    nips,
    'client_nip',
    ryczaltNips,
    demoNips,
    isAdmin
  )

  const [{ data: rawExceptions, error: rawError }, { data: todayStatsData }, sidebarRes] =
    await Promise.all([
      exceptionsQuery,
      todayStatsQuery,
      hasListFilter ? sidebarQuery : Promise.resolve(null),
    ])

  console.log('[do-akceptacji] rawExceptions count:', rawExceptions?.length, 'error:', rawError?.message ?? 'none')

  // ── ETAP 2: cztery zapytania zależne od wyniku (A) — RÓWNOLEGLE ───────────
  // clients/pozycje/opisy/pojazdy potrzebują nips-ów i id z listy, ale są
  // niezależne od siebie. Zapytania o ai_review_log CELOWO BRAK: tabela jest
  // pusta (reviewer v1 wyłączony), a strzał leciał przy KAŻDYM załadowaniu
  // kolejki i auto-refreshu co 30 s. Komponenty renderujące recenzję zostają
  // z guardem na brak danych — reviewer może wrócić (DECISIONS: tylko z żywym
  // groundingiem), wtedy przywrócić fetch.
  const exceptionNips = [...new Set(rawExceptions?.map(e => e.client_nip) ?? [])]
  const exceptionIds = rawExceptions?.map(e => e.id) ?? []

  // Stronicowanie pozycji: serwerowy max-rows PostgREST tnie odpowiedź do
  // 1000 wierszy PO CICHU, a pending* ma ich dziś 1046 (pomiar 17.08) —
  // bez range() 46 wierszy o najwyższych lp znikało z 8 kart (karta
  // pokazywała niekompletne pozycje). Defekt istniał przed pakietem perf,
  // ujawnił go audyt payloadów.
  const POZYCJE_PAGE = 1000
  async function fetchPozycjeAll(ids: number[]) {
    const out: any[] = []
    for (let from = 0; ; from += POZYCJE_PAGE) {
      const { data, error } = await supabase
        .from('faktury_pozycje')
        .select(POZYCJE_KARTY_COLUMNS)
        .in('faktura_id', ids)
        .order('faktura_id', { ascending: true })
        .order('lp', { ascending: true })
        .range(from, from + POZYCJE_PAGE - 1)
      if (error) {
        console.error('[do-akceptacji] blad odczytu pozycji (faktury_pozycje):', error.message)
        break
      }
      out.push(...(data ?? []))
      if (!data || data.length < POZYCJE_PAGE) break
    }
    return out
  }
  // Sidebar może wskazywać NIP-y spoza przefiltrowanej listy — clients
  // pobieramy dla sumy obu zbiorów (dotąd: osobne dociąganie na końcu).
  const sidebarItemsRaw = hasListFilter ? (sidebarRes?.data ?? []) : (rawExceptions ?? [])
  const clientNipsToFetch = [
    ...new Set([...exceptionNips, ...sidebarItemsRaw.map((i: { client_nip: string }) => i.client_nip)]),
  ]

  const [{ data: clientsData }, { data: pozycjeData }, { data: clientOpisyData }, { data: pojazdyData }] =
    await Promise.all([
      clientNipsToFetch.length > 0
        ? supabase
            .from('clients')
            .select('nip, nazwa, platnik_vat, is_demo')
            .in('nip', clientNipsToFetch)
        : Promise.resolve({ data: [] as { nip: string; nazwa: string; platnik_vat: boolean; is_demo: boolean }[] }),
      exceptionIds.length > 0
        ? fetchPozycjeAll(exceptionIds).then(rows => ({ data: rows }))
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('client_opisy')
        .select('id, client_nip, opis, aktywny, typ_dokumentu')
        .in('client_nip', exceptionNips.length > 0 ? exceptionNips : ['dummy']),
      supabase
        .from('client_pojazdy')
        .select('*')
        .in('client_nip', exceptionNips.length > 0 ? exceptionNips : ['dummy']),
    ])

  const clientsMap = new Map(
    (clientsData ?? []).map(c => [c.nip, c])
  )

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
      ai_review_log: [], // reviewer v1 wyłączony — patrz komentarz przy 1c
      pozycje_editable: pozycjeMap.get(e.id) ?? [],
    }
  })

  console.log('[do-akceptacji] allExceptions count:', allExceptions.length)

  // Brak filtra typu na poziomie serwera - przekazujemy wszystko do klienta
  const typedExceptions = allExceptions

  // Split into sections
  const pendingReview = typedExceptions.filter(e => e.status === 'pending_review')
  const pending = typedExceptions.filter(e => e.status === 'pending')

  // 2. Opisy klientów do comboboxów (pobrane w ETAPIE 2)
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

  // 2b. Pojazdy do comboboxów (pobrane w ETAPIE 2)
  const clientPojazdyRecord: Record<string, ClientPojazd[]> = {}
  for (const p of (pojazdyData ?? []) as ClientPojazd[]) {
    if (!clientPojazdyRecord[p.client_nip]) {
      clientPojazdyRecord[p.client_nip] = []
    }
    clientPojazdyRecord[p.client_nip].push(p)
  }

  // 3. Statystyki dnia (pobrane w ETAPIE 1)
  const todayStats = todayStatsData ?? []
  const todayTotal = todayStats.length
  const todayToAccept = todayStats.filter(e => e.status === 'pending_review').length
  const todayExceptions = todayStats.filter(e => e.status === 'pending').length
  const todayErrors = todayStats.filter(e => e.status === 'ignored').length // lub inny status błędu jeśli używamy
  
  const highConfidenceProposals = todayStats.filter(e => e.ai_confidence && e.ai_confidence >= 0.8).length
  const hitRate = todayTotal > 0 ? Math.round((highConfidenceProposals / todayTotal) * 100) : 0

  // 4. Sidebar — bez własnego zapytania: przy braku filtra listy liczony
  // z danych (A) z ETAPU 1 (te same wiersze pending*), przy filtrze —
  // z sidebarRes; nazwy klientów już w clientsMap (ETAP 2 pobiera sumę
  // NIP-ów listy i sidebara, dawne dociąganie 4b zbędne).
  const filteredItemsForSidebar = sidebarItemsRaw

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
