'use server'

// ── „Symulacja automatu" — retro-symulacja bramki auto-write (read-only) ────
// Liczy na kartach ZAKOŃCZONYCH klienta, co zrobiłby automat, gdyby działał
// od początku: ile kart przeszłoby auto_write_gate i ile z nich księgowa
// REALNIE poprawiła (edycja_ksiegowa=true) — czyli ile automat zaksięgowałby
// błędnie. Definicje i walidacja predykatu: src/lib/gate-simulation.ts.
//
// WYŁĄCZNIE ODCZYT — narzędzie pomiaru przed decyzją o uzbrojeniu fali 1.
// Zero zmian w bramce, metrykach client_metrics i flagach.
//
// Dostęp: wzorzec fetchClientLearning — server action to publiczny endpoint
// POST, a createSupabaseAdmin() omija RLS, więc kontrola ról i scoping po NIP
// są jawne i fail-closed. Rola 'klient' = brak dostępu.

import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips } from '@/lib/auth-helpers'
import {
  GATE_SIM_COLUMNS,
  GATE_SIM_STATUSES,
  GATE_DEFAULT_MAX_KWOTA,
  simulateGate,
  type GateSimCard,
} from '@/lib/gate-simulation'

export interface GateSimBadCard {
  queueId: number
  ksiegoweNumer: string | null
  nazwaDostawcy: string | null
  kwotaBrutto: number | null
  dataWystawienia: string | null
  confidence: number | null
  /** Co księgowa poprawiła — zdania z payload.diff eventu edited,
   *  fallback: wiersze klasyfikacja_korekty (pole_typ: ai → księgowa). */
  poprawki: string[]
}

export interface GateSimulationData {
  totalCompleted: number
  przeszloby: number
  czystych: number
  blednych: number
  /** Karty przechodzące bramkę z edycja_ksiegowa IS NULL (sprzed flag) —
   *  poza licznikiem i mianownikiem precyzji; null ≠ false. */
  bezFlagi: number
  /** czystych / (czystych + blednych); null gdy mianownik zerowy. */
  precyzja: number | null
  /** Czystość ogółem z tych samych kart (edycja_ksiegowa=false / karty
   *  z flagą) — obok precyzji, żeby różnica była widoczna. */
  czystoscOgolem: number | null
  maxKwota: number
  bledneKarty: GateSimBadCard[]
  /** Tryb obserwatora: liczba eventów auto_candidate dla klienta + skrajne daty. */
  obserwatorCount: number
  obserwatorOd: string | null
  obserwatorOstatni: string | null
  warning?: string
}

// Rowne serwerowemu max-rows PostgREST (1000): wyzszy limit i tak zostalby
// ucieta do 1000, a warunek `cards.length >= CARDS_LIMIT` nigdy by nie zaszedl
// — warning o ucieciu bylby martwym kodem i sekcja klamalaby o mianowniku.
const CARDS_LIMIT = 1000
const DISPLAY_COLUMNS =
  GATE_SIM_COLUMNS + ', ksiegowe_numer, nazwa_dostawcy, data_wystawienia, resolved_at'

type CardRow = GateSimCard & {
  ksiegowe_numer: string | null
  nazwa_dostawcy: string | null
  data_wystawienia: string | null
  resolved_at: string | null
}

// Etykiety pól diff jak w sekcji nauki (klucze kwota_<Kolumna> + reszta)
const KPIR_LABELS: Record<string, string> = {
  PrzychodSprzedazTowarowIUslug: 'Przychód ze sprzedaży (kol. 7)',
  PozostalePrzychody: 'Pozostałe przychody (kol. 8)',
  ZakupyTowarow: 'Zakup towarów i materiałów (kol. 10)',
  ZakupyKosztyUboczne: 'Koszty uboczne zakupu (kol. 11)',
  Wynagrodzenia: 'Wynagrodzenia (kol. 12)',
  WydatkiPozostale: 'Wydatki pozostałe (kol. 13)',
  Inne: 'Inne',
}

function diffLabel(key: string): string {
  if (key.startsWith('kwota_')) return KPIR_LABELS[key.slice(6)] ?? key.slice(6)
  return key
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmt(v: any): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// Zdania „co poprawiono" z payload.diff eventu edited. Opis pomijamy —
// edycja_ksiegowa (kryterium „błędna dla automatu") z definicji nie obejmuje
// opisu, więc zdanie o opisie sugerowałoby korektę, której metryka nie liczy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function poprawkiZDiffu(payload: any): string[] {
  const diff = payload?.diff
  if (!diff || typeof diff !== 'object') return []
  const out: string[] = []
  for (const [key, val] of Object.entries(diff as Record<string, { z?: unknown; na?: unknown }>)) {
    if (key === 'opis') continue
    out.push(`${diffLabel(key)}: ${fmt(val?.z)} → ${fmt(val?.na)}`)
  }
  return out
}

export async function fetchGateSimulation(
  nip: string
): Promise<{ data: GateSimulationData | null; error: string | null }> {
  // ── Bramka dostępu (read-only, fail-closed — wzorzec fetchClientLearning) ──
  if (!/^\d{10}$/.test(nip ?? '')) {
    return { data: null, error: 'Nieprawidłowy NIP klienta' }
  }
  const { nips, isAdmin, panelUser, ryczaltNips, demoNips } = await getAllowedNips()
  if (!panelUser || panelUser.rola === 'klient') {
    return { data: null, error: 'Brak uprawnień do tej sekcji' }
  }
  if (ryczaltNips.includes(nip)) {
    return { data: null, error: 'Brak dostępu do tego klienta' }
  }
  if (!isAdmin) {
    if (nips !== null && !nips.includes(nip)) {
      return { data: null, error: 'Brak dostępu do tego klienta' }
    }
    if (nips === null && demoNips.includes(nip)) {
      return { data: null, error: 'Brak dostępu do tego klienta' }
    }
  }

  const supabase = createSupabaseAdmin()

  // ── Dane: stała liczba zapytań (4–6), zero N+1 ────────────────────────────
  const { data: clientRow, error: clientError } = await supabase
    .from('clients')
    .select('auto_max_kwota')
    .eq('nip', nip)
    .maybeSingle()
  if (clientError) {
    return { data: null, error: `Błąd odczytu klienta (clients): ${clientError.message}` }
  }
  if (!clientRow) {
    return { data: null, error: `Nie znaleziono klienta o NIP ${nip} (clients)` }
  }
  const maxKwota = clientRow.auto_max_kwota ?? GATE_DEFAULT_MAX_KWOTA

  // DESC po resolved_at: przy ucięciu limitem zostają NAJNOWSZE zakończone
  const { data: cardsData, error: cardsError } = await supabase
    .from('exceptions_queue')
    .select(DISPLAY_COLUMNS)
    .eq('client_nip', nip)
    .in('status', [...GATE_SIM_STATUSES])
    .order('resolved_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(CARDS_LIMIT)
  if (cardsError) {
    return { data: null, error: `Błąd odczytu kart (exceptions_queue): ${cardsError.message}` }
  }
  // Kolumny budowane ze stałej GATE_SIM_COLUMNS — inferencja typów PostgREST
  // nie umie sparsować dynamicznego stringa i zwraca GenericStringError,
  // stąd przejście przez unknown (kształt gwarantuje DISPLAY_COLUMNS).
  const cards = (cardsData ?? []) as unknown as CardRow[]

  const sim = simulateGate(cards, maxKwota)
  const bledne = (sim.passingCards as CardRow[]).filter((c) => c.edycja_ksiegowa === true)

  // Czystość ogółem na TYCH SAMYCH kartach (bez null-flag w mianowniku) —
  // porównanie obok precyzji; liczba z client_metrics może się minimalnie
  // różnić (okno czasowe RPC), więc liczymy lokalnie na identycznym zbiorze.
  const ogolemCzyste = cards.filter((c) => c.edycja_ksiegowa === false).length
  const ogolemZFlaga = ogolemCzyste + cards.filter((c) => c.edycja_ksiegowa === true).length
  const czystoscOgolem = ogolemZFlaga > 0 ? ogolemCzyste / ogolemZFlaga : null

  // ── „Co księgowa poprawiła" dla kart błędnych ─────────────────────────────
  const poprawkiPerKarta = new Map<number, string[]>()
  if (bledne.length > 0) {
    const bledneIds = bledne.map((c) => c.id)

    // Zdarzenia edited (payload.diff) — najbogatsze źródło
    const { data: editedEvents, error: eventsError } = await supabase
      .from('faktura_events')
      .select('queue_id, payload, created_at')
      .eq('client_nip', nip)
      .eq('event_type', 'edited')
      .in('queue_id', bledneIds)
      .order('created_at', { ascending: true })
    if (eventsError) {
      return { data: null, error: `Błąd odczytu zdarzeń (faktura_events): ${eventsError.message}` }
    }
    for (const ev of editedEvents ?? []) {
      const id = ev.queue_id as number
      const zdania = poprawkiZDiffu(ev.payload)
      if (zdania.length === 0) continue
      const arr = poprawkiPerKarta.get(id) ?? []
      for (const z of zdania) if (!arr.includes(z)) arr.push(z)
      poprawkiPerKarta.set(id, arr)
    }

    // Fallback: klasyfikacja_korekty (trigger, pełna historia od początku
    // produkcji; klucz faktura_id = faktury.id — mapujemy po legacy_queue_id)
    const brakujace = bledneIds.filter((id) => !poprawkiPerKarta.has(id))
    if (brakujace.length > 0) {
      const { data: fakturyRows, error: fakturyError } = await supabase
        .from('faktury')
        .select('id, legacy_queue_id')
        .eq('client_nip', nip)
        .in('legacy_queue_id', brakujace)
      if (fakturyError) {
        return { data: null, error: `Błąd odczytu faktur (faktury): ${fakturyError.message}` }
      }
      const queueByFaktura = new Map(
        (fakturyRows ?? []).map((f) => [f.id as number, f.legacy_queue_id as number])
      )
      if (queueByFaktura.size > 0) {
        const { data: korekty, error: korektyError } = await supabase
          .from('klasyfikacja_korekty')
          .select('faktura_id, pole_typ, wartosc_ai, wartosc_monika, changed_at')
          .eq('client_nip', nip)
          .in('faktura_id', [...queueByFaktura.keys()])
          .order('changed_at', { ascending: true })
        if (korektyError) {
          return { data: null, error: `Błąd odczytu korekt (klasyfikacja_korekty): ${korektyError.message}` }
        }
        for (const k of korekty ?? []) {
          const queueId = queueByFaktura.get(k.faktura_id as number)
          if (queueId == null) continue
          const zdanie = `${k.pole_typ}: ${fmt(k.wartosc_ai)} → ${fmt(k.wartosc_monika)}`
          const arr = poprawkiPerKarta.get(queueId) ?? []
          if (!arr.includes(zdanie)) arr.push(zdanie)
          poprawkiPerKarta.set(queueId, arr)
        }
      }
    }
  }

  // ── Tryb obserwatora: żywe eventy auto_candidate klienta ──────────────────
  // Licznik przez count=exact + dwa zapytania limit(1) po skrajne daty —
  // pełna lista bez limitu zostałaby ucięta przez serwerowy max-rows (1000)
  // rosnąco, więc po 1000. evencie licznik by zamarzł, a „ostatni" pokazywałby
  // datę 1000. NAJSTARSZEGO eventu.
  const { count: obserwatorCount, error: countError } = await supabase
    .from('faktura_events')
    .select('id', { count: 'exact', head: true })
    .eq('client_nip', nip)
    .eq('event_type', 'auto_candidate')
  if (countError) {
    return { data: null, error: `Błąd odczytu kandydatów (faktura_events): ${countError.message}` }
  }
  let obserwatorOd: string | null = null
  let obserwatorOstatni: string | null = null
  if ((obserwatorCount ?? 0) > 0) {
    const [pierwszy, ostatni] = await Promise.all([
      supabase
        .from('faktura_events')
        .select('created_at')
        .eq('client_nip', nip)
        .eq('event_type', 'auto_candidate')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('faktura_events')
        .select('created_at')
        .eq('client_nip', nip)
        .eq('event_type', 'auto_candidate')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (pierwszy.error) {
      return { data: null, error: `Błąd odczytu kandydatów (faktura_events): ${pierwszy.error.message}` }
    }
    if (ostatni.error) {
      return { data: null, error: `Błąd odczytu kandydatów (faktura_events): ${ostatni.error.message}` }
    }
    obserwatorOd = (pierwszy.data?.created_at as string | undefined) ?? null
    obserwatorOstatni = (ostatni.data?.created_at as string | undefined) ?? null
  }

  const warnings: string[] = []
  if (cards.length >= CARDS_LIMIT) {
    warnings.push(`Uwzględniono ${CARDS_LIMIT} najnowszych zakończonych kart — starsze pominięte`)
  }
  if (sim.bezFlagi > 0) {
    const n = sim.bezFlagi
    const fraza =
      n === 1
        ? '1 karta przechodząca bramkę nie ma flagi edycji'
        : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
          ? `${n} karty przechodzące bramkę nie mają flagi edycji`
          : `${n} kart przechodzących bramkę nie ma flagi edycji`
    warnings.push(`${fraza} (sprzed wdrożenia flag) — poza licznikiem precyzji`)
  }

  return {
    data: {
      totalCompleted: sim.totalCompleted,
      przeszloby: sim.przeszloby,
      czystych: sim.czystych,
      blednych: sim.blednych,
      bezFlagi: sim.bezFlagi,
      precyzja: sim.precyzja,
      czystoscOgolem,
      maxKwota,
      bledneKarty: bledne.map((c) => ({
        queueId: c.id,
        ksiegoweNumer: c.ksiegowe_numer,
        nazwaDostawcy: c.nazwa_dostawcy,
        kwotaBrutto: c.kwota_brutto,
        dataWystawienia: c.data_wystawienia,
        confidence: c.confidence_overall ?? c.ai_confidence,
        poprawki: poprawkiPerKarta.get(c.id) ?? [],
      })),
      obserwatorCount: obserwatorCount ?? 0,
      obserwatorOd,
      obserwatorOstatni,
      warning: warnings.length > 0 ? warnings.join('; ') : undefined,
    },
    error: null,
  }
}
