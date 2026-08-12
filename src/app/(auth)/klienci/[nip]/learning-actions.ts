'use server'

// ── Sekcja „Czego system nauczył się od księgowej" — agregacja read-only ─────
// Rama narracyjna (docs/PRODUCT.md): poprawka księgowej = inwestycja w kontekst
// klienta, nie błąd AI. Agregujemy zdarzenia korekt (faktura_events: edited /
// rezim_changed) w „zasady" per dostawca × kategoria zmiany i liczymy dowód
// skuteczności: karty tego dostawcy zakończone PO ostatniej korekcie bez zmian.
//
// WYŁĄCZNIE ODCZYT. Wszystkie liczby w UI muszą być policzalne z danych —
// żadnych twierdzeń o mechanizmie, którego nie widać w tabelach (DECISIONS).
//
// Dostęp: wzorzec gateFakturaHistory / assertCanWriteClient — server action to
// publiczny endpoint POST, a createSupabaseAdmin() omija RLS, więc kontrola ról
// i scoping po NIP są jawne i fail-closed. Rola 'klient' = brak dostępu.

import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips } from '@/lib/auth-helpers'

export type LearningCategory = 'kpir' | 'vat' | 'rezim' | 'opis' | 'inne'

export interface LearningInvoiceRef {
  queueId: number
  ksiegoweNumer: string | null
  data: string | null // data wystawienia albo data zakończenia (ISO)
  nazwaDostawcy: string | null
}

export interface LearningRule {
  supplierKey: string
  supplierName: string
  supplierNip: string | null
  category: LearningCategory
  /** Zdanie reguły po polsku — wyłącznie fakty z ostatniej korekty w grupie */
  sentence: string
  /** Liczba zdarzeń korekt w tej grupie (jedna karta może mieć ich kilka) */
  correctionsCount: number
  /** Liczba UNIKALNYCH poprawionych faktur w grupie — do etykiet list faktur */
  correctionCardsCount: number
  lastCorrectionAt: string // ISO
  /** Karty dostawcy zakończone PO ostatniej korekcie bez poprawek */
  cleanAfterCount: number
  status: 'utrwalona' | 'swieza'
  correctionInvoices: LearningInvoiceRef[]
  cleanInvoices: LearningInvoiceRef[]
}

export interface ClientLearningData {
  rules: LearningRule[]
  /** Liczba zdarzeń korekt (edited + rezim_changed) ujętych w regułach —
   *  każde zdarzenie liczone RAZ, nawet gdy diff obejmuje kilka kategorii */
  totalCorrections: number
  rulesCount: number
  /** Unikalne faktury zaliczone jako „czyste po nauce" w którejkolwiek regule */
  cleanAfterTotal: number
  // Dane do empty-state — liczone z FLAG KART, nie z eventów (eventy istnieją
  // dopiero od 08.2026, karty edytowane wcześniej nie mają zdarzeń korekt):
  totalCompleted: number
  editedCompleted: number
  cleanCompleted: number
  warning?: string
}

// Statusy „zakończone przez system" — jak w mianowniku RPC client_metrics
const COMPLETED_STATUSES = ['approved', 'resolved', 'auto_created']

// Etykiety kolumn KPiR (klucze diff: kwota_<Kolumna> — rekonesans MCP 11.08.2026)
const KPIR_LABELS: Record<string, string> = {
  PrzychodSprzedazTowarowIUslug: 'Przychód ze sprzedaży (kol. 7)',
  PozostalePrzychody: 'Pozostałe przychody (kol. 8)',
  ZakupyTowarow: 'Zakup towarów i materiałów (kol. 10)',
  ZakupyKosztyUboczne: 'Koszty uboczne zakupu (kol. 11)',
  Wynagrodzenia: 'Wynagrodzenia (kol. 12)',
  WydatkiPozostale: 'Wydatki pozostałe (kol. 13)',
  Inne: 'Inne',
}

const REZIM_LABELS: Record<string, string> = {
  prywatne_20: 'prywatny (20% kosztów)',
  mieszany_50_75: 'mieszany (75% kosztów, 50% VAT)',
  pelne_100: 'pełny (100%)',
  vat26: 'pełny VAT (VAT-26)',
}

const VAT_KEYS = new Set(['gtu', 'procedura_jpk', 'typ_dokumentu_jpk', 'pozycje_vat', 'wymaga_mpp'])

function kpirLabel(key: string): string {
  const name = key.replace(/^kwota_/, '')
  return KPIR_LABELS[name] ?? name
}

function categorize(diffKey: string): LearningCategory {
  if (diffKey.startsWith('kwota_')) return 'kpir'
  if (diffKey === 'opis') return 'opis'
  if (VAT_KEYS.has(diffKey)) return 'vat'
  return 'inne'
}

function normalizeName(name: string | null): string {
  return (name ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// Porównanie timestampów ISO po code-pointach (NIE localeCompare — kolacja ICU
// źle porządkuje sekundę bez części ułamkowej względem sekundy z ułamkiem;
// code-point daje poprawny wynik, bo '+' < '.'). Spójne z operatorem > niżej.
function cmpIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Tolerancja porównań kwot — jak KWOTA_EPS w akcjach do-akceptacji: różnice
// poniżej pół grosza to szum zaokrągleń, korekta o 1 grosz przechodzi.
const KWOTA_EPS = 0.005

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DiffEntry = { z: any; na: any }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asNumber(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ── Realność korekty (AUDIT-flagi-vs-eventy.md) ────────────────────────────
// Historyczne eventy 'edited' bywają fantomowe: diff liczony z baseline'em
// z widoku v2 (ai_kwoty z faktury = NULL) ma zawsze z:0 i loguje „poprawkę"
// nawet przy wartościach równych propozycji AI. Prawdę o kwotach niesie
// ai_kwoty_per_kolumna KARTY (exceptions_queue) — klucz kwota_* jest realny
// tylko gdy na różni się od wartości AI o więcej niż epsilon. Klucz opis jest
// realny gdy z≠na (baseline opisu w v2 był poprawny); pozostałe klucze
// (gtu/procedura_jpk/pozycje_vat) pochodzą z jawnych flag edycji — realne.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function realDiffKeys(payload: any, card: CardRow): string[] {
  const diff: Record<string, DiffEntry> =
    payload && typeof payload === 'object' && payload.diff && typeof payload.diff === 'object' ? payload.diff : {}
  const aiKwoty = (card.ai_kwoty_per_kolumna ?? {}) as Record<string, unknown>
  return Object.keys(diff).filter((k) => {
    if (k.startsWith('kwota_')) {
      const col = k.replace(/^kwota_/, '')
      const ai = asNumber(aiKwoty[col] ?? 0)
      const na = asNumber(diff[k]?.na)
      return Math.abs(na - ai) > KWOTA_EPS
    }
    if (k === 'opis') {
      const z = typeof diff[k]?.z === 'string' ? (diff[k].z as string).trim() : ''
      const na = typeof diff[k]?.na === 'string' ? (diff[k].na as string).trim() : ''
      return z !== na
    }
    return true
  })
}

// Zdanie reguły z NAJNOWSZEJ korekty w grupie — same policzalne fakty.
// Dla KPiR baseline'em jest ai_kwoty_per_kolumna KARTY (payload.z historycznie
// bywa fantomowym 0): kwota poprawiona w tej samej kolumnie (AI≠0 i na≠0)
// vs kwota skierowana do kolumny, w której AI miało 0 — „Kwoty księgowane do"
// przy samej korekcie wysokości byłoby nieprawdą.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSentence(category: LearningCategory, latestPayload: any, latestCard: CardRow | undefined): string {
  if (category === 'rezim') {
    const na = latestPayload?.na
    const label = typeof na === 'string' ? (REZIM_LABELS[na] ?? na) : String(na ?? '—')
    return `Reżim pojazdowy: ${label}`
  }
  const diff: Record<string, DiffEntry> =
    latestPayload && typeof latestPayload === 'object' && latestPayload.diff && typeof latestPayload.diff === 'object'
      ? latestPayload.diff
      : {}
  const realKeys = latestCard ? realDiffKeys(latestPayload, latestCard) : Object.keys(diff)
  const keys = realKeys.filter((k) => categorize(k) === category)

  if (category === 'kpir') {
    const aiKwoty = (latestCard?.ai_kwoty_per_kolumna ?? {}) as Record<string, unknown>
    const targets: string[] = []
    const amountFixes: string[] = []
    const withdrawn: string[] = []
    for (const k of keys) {
      const ai = asNumber(aiKwoty[k.replace(/^kwota_/, '')] ?? 0)
      const na = asNumber(diff[k]?.na)
      if (ai !== 0 && na !== 0) amountFixes.push(kpirLabel(k))
      else if (na !== 0) targets.push(kpirLabel(k))
      else if (ai !== 0) withdrawn.push(kpirLabel(k))
    }
    const parts: string[] = []
    if (targets.length > 0) parts.push(`Kwoty księgowane do: ${targets.join(' + ')}`)
    if (amountFixes.length > 0) parts.push(`Poprawiona kwota w: ${amountFixes.join(' + ')}`)
    if (withdrawn.length > 0) parts.push(`Kwoty wycofane z: ${withdrawn.join(' + ')}`)
    return parts.length > 0 ? parts.join('; ') : `Poprawione kolumny KPiR: ${keys.map(kpirLabel).join(', ')}`
  }
  if (category === 'opis') {
    const na = keys.length > 0 ? diff[keys[0]]?.na : null
    return typeof na === 'string' && na.trim() ? `Opis: „${truncate(na.trim(), 90)}"` : 'Poprawiony opis dekretu'
  }
  if (category === 'vat') {
    const parts = keys.map((k) => {
      const na = diff[k]?.na
      const val = na === null || na === undefined || na === 0 ? 'brak' : String(na)
      return `${k} → ${val}`
    })
    return parts.length > 0 ? `Oznaczenia VAT/JPK: ${parts.join(', ')}` : 'Poprawione oznaczenia VAT/JPK'
  }
  return keys.length > 0 ? `Poprawione pola: ${keys.join(', ')}` : 'Poprawka danych dekretu'
}

interface CardRow {
  id: number
  nip_dostawcy: string | null
  nazwa_dostawcy: string | null
  status: string
  edycja_ksiegowa: boolean | null
  edycja_realna: boolean | null
  resolved_at: string | null
  created_at: string
  ksiegowe_numer: string | null
  data_wystawienia: string | null
  ai_kwoty_per_kolumna: Record<string, unknown> | null
}

const CARD_COLUMNS =
  'id, nip_dostawcy, nazwa_dostawcy, status, edycja_ksiegowa, edycja_realna, resolved_at, created_at, ksiegowe_numer, data_wystawienia, ai_kwoty_per_kolumna'

function supplierKeyOf(card: CardRow): string | null {
  if (card.nip_dostawcy && card.nip_dostawcy.trim()) return card.nip_dostawcy.trim()
  const name = normalizeName(card.nazwa_dostawcy)
  return name ? `n:${name}` : null
}

function completedAt(card: CardRow): string {
  // Konwencja okna czasowego jak w RPC client_metrics: COALESCE(resolved_at, created_at)
  return card.resolved_at ?? card.created_at
}

function toInvoiceRef(card: CardRow): LearningInvoiceRef {
  return {
    queueId: card.id,
    ksiegoweNumer: card.ksiegowe_numer,
    data: card.data_wystawienia ?? completedAt(card),
    nazwaDostawcy: card.nazwa_dostawcy,
  }
}

const EVENTS_LIMIT = 1000
const CARDS_LIMIT = 2000
const INVOICE_LIST_LIMIT = 10

export async function fetchClientLearning(
  nip: string
): Promise<{ data: ClientLearningData | null; error: string | null }> {
  // ── Bramka dostępu (read-only, fail-closed) ────────────────────────────────
  if (!/^\d{10}$/.test(nip ?? '')) {
    return { data: null, error: 'Nieprawidłowy NIP klienta' }
  }
  // getAllowedNips przy braku sesji rzuca NEXT_REDIRECT — propagujemy bez łapania
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

  // ── Dane: stała liczba zapytań (2–3), zero N+1 ────────────────────────────
  // DESC + limit = przy ucięciu zostają NAJNOWSZE korekty (zgodnie z warningiem
  // i zasadą „treść reguły z najnowszej korekty"); do agregacji odwracamy w RAM.
  const { data: eventsDesc, error: eventsError } = await supabase
    .from('faktura_events')
    .select('id, queue_id, faktura_id, event_type, actor, payload, created_at')
    .eq('client_nip', nip)
    .in('event_type', ['edited', 'rezim_changed'])
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(EVENTS_LIMIT)

  if (eventsError) {
    return { data: null, error: `Błąd odczytu zdarzeń (faktura_events): ${eventsError.message}` }
  }
  const events = (eventsDesc ?? []).slice().reverse()

  // DESC po resolved_at (nulls na końcu — w danych 1 zakończona karta bez
  // resolved_at): przy ucięciu zostają najnowsze karty, czyli dowód „czysto po".
  const { data: completedCards, error: cardsError } = await supabase
    .from('exceptions_queue')
    .select(CARD_COLUMNS)
    .eq('client_nip', nip)
    .in('status', COMPLETED_STATUSES)
    .order('resolved_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(CARDS_LIMIT)

  if (cardsError) {
    return { data: null, error: `Błąd odczytu kart (exceptions_queue): ${cardsError.message}` }
  }

  const completed = (completedCards ?? []) as CardRow[]
  const cardById = new Map<number, CardRow>()
  for (const c of completed) cardById.set(c.id, c)

  // Karty korygowane, które nie są (już) zakończone — np. external_booked lub
  // cofnięte do kolejki. Jedno dodatkowe zapytanie po brakujące id (bounded).
  const missingIds = Array.from(
    new Set(
      events
        .map((e) => e.queue_id as number | null)
        .filter((id): id is number => typeof id === 'number' && !cardById.has(id))
    )
  )
  if (missingIds.length > 0) {
    const { data: extraCards, error: extraError } = await supabase
      .from('exceptions_queue')
      .select(CARD_COLUMNS)
      .eq('client_nip', nip)
      .in('id', missingIds)
    if (extraError) {
      return { data: null, error: `Błąd odczytu kart korekt (exceptions_queue): ${extraError.message}` }
    }
    for (const c of (extraCards ?? []) as CardRow[]) cardById.set(c.id, c)
  }

  // ── Agregacja: grupy dostawca × kategoria ─────────────────────────────────
  interface Group {
    supplierKey: string
    supplierName: string
    supplierNip: string | null
    category: LearningCategory
    events: { at: string; payload: unknown; queueId: number }[]
  }
  const groups = new Map<string, Group>()
  // Każde zdarzenie korekty liczone RAZ, nawet gdy diff obejmuje kilka
  // kategorii i event trafia do kilku grup (inaczej nagłówek „N poprawek"
  // kłamałby w górę — w danych z 11.08 są diffy kwota+opis i kwota+gtu).
  let totalCorrections = 0

  for (const ev of events) {
    const queueId = ev.queue_id as number | null
    const card = queueId != null ? cardById.get(queueId) : undefined
    if (!card || queueId == null) continue // karta usunięta (reprocess = DELETE) — nie zbudujemy reguły
    const supplierKey = supplierKeyOf(card)
    if (!supplierKey) continue

    const cats = new Set<LearningCategory>()
    if (ev.event_type === 'rezim_changed') {
      cats.add('rezim')
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diff = (ev.payload as any)?.diff
      if (diff && typeof diff === 'object') {
        // Tylko klucze z REALNĄ zmianą vs AI — fantomowe eventy (baseline z:0,
        // wartości równe propozycji AI) nie są poprawkami księgowej
        for (const key of realDiffKeys(ev.payload, card)) cats.add(categorize(key))
      } else {
        cats.add('inne')
      }
    }
    if (cats.size === 0) continue // event w całości fantomowy — pomijamy
    totalCorrections++

    for (const category of cats) {
      const gkey = `${supplierKey}|${category}`
      let g = groups.get(gkey)
      if (!g) {
        g = {
          supplierKey,
          supplierName: card.nazwa_dostawcy?.trim() || card.nip_dostawcy || '(nieznany dostawca)',
          supplierNip: card.nip_dostawcy?.trim() || null,
          category,
          events: [],
        }
        groups.set(gkey, g)
      }
      g.events.push({ at: ev.created_at as string, payload: ev.payload, queueId })
    }
  }

  // Karty zakończone pogrupowane po dostawcy — do dowodu skuteczności
  const completedBySupplier = new Map<string, CardRow[]>()
  for (const c of completed) {
    const key = supplierKeyOf(c)
    if (!key) continue
    const arr = completedBySupplier.get(key)
    if (arr) arr.push(c)
    else completedBySupplier.set(key, [c])
  }

  const rules: LearningRule[] = []
  const cleanCardIds = new Set<number>()

  for (const g of groups.values()) {
    g.events.sort((a, b) => cmpIso(a.at, b.at))
    const latest = g.events[g.events.length - 1]
    const lastCorrectionAt = latest.at
    // Nazwa/NIP z karty NAJNOWSZEJ korekty — spójnie z zasadą „treść reguły
    // z najnowszej korekty" (dostawcy miewają warianty nazw pod jednym NIP)
    const latestCard = cardById.get(latest.queueId)
    const supplierName = latestCard?.nazwa_dostawcy?.trim() || g.supplierName
    const supplierNip = latestCard?.nip_dostawcy?.trim() || g.supplierNip

    // „Czysty przelot po nauce": zakończona PO ostatniej korekcie, bez poprawek.
    // Dla kategorii 'opis' miarą jest edycja_realna (edycja_ksiegowa z definicji
    // pomija opis); dla pozostałych — edycja_ksiegowa. Null ≠ false (uczciwie).
    // Flagi są wiarygodne (audyt 12.08: 30/30 zgodności z porównaniem
    // wartościowym) — bez dodatkowych warunków po eventach.
    const cleanFlag = (c: CardRow) =>
      g.category === 'opis' ? c.edycja_realna === false : c.edycja_ksiegowa === false
    const cleanAfter = (completedBySupplier.get(g.supplierKey) ?? [])
      .filter((c) => cleanFlag(c) && completedAt(c) > lastCorrectionAt)
      .sort((a, b) => cmpIso(completedAt(a), completedAt(b)))

    for (const c of cleanAfter) cleanCardIds.add(c.id)

    // Faktury-korekty: dedup po karcie (kilka eventów na jednej karcie = jedna
    // faktura); iteracja od najnowszego eventu → lista najnowsze najpierw
    const correctionCards: CardRow[] = []
    const seen = new Set<number>()
    for (const e of [...g.events].reverse()) {
      if (seen.has(e.queueId)) continue
      seen.add(e.queueId)
      const c = cardById.get(e.queueId)
      if (c) correctionCards.push(c)
    }

    rules.push({
      supplierKey: g.supplierKey,
      supplierName,
      supplierNip,
      category: g.category,
      sentence: buildSentence(g.category, latest.payload, latestCard),
      correctionsCount: g.events.length,
      correctionCardsCount: correctionCards.length,
      lastCorrectionAt,
      cleanAfterCount: cleanAfter.length,
      status: cleanAfter.length >= 1 ? 'utrwalona' : 'swieza',
      correctionInvoices: correctionCards.slice(0, INVOICE_LIST_LIMIT).map(toInvoiceRef),
      // obie listy w UI najnowsze najpierw — stąd reverse po slice końcówki
      cleanInvoices: cleanAfter.slice(-INVOICE_LIST_LIMIT).reverse().map(toInvoiceRef),
    })
  }

  // Sortowanie: korekty księgowe najpierw (wg liczby korekt), styl opisów na końcu
  rules.sort((a, b) => {
    const aOpis = a.category === 'opis' ? 1 : 0
    const bOpis = b.category === 'opis' ? 1 : 0
    if (aOpis !== bOpis) return aOpis - bOpis
    if (b.correctionsCount !== a.correctionsCount) return b.correctionsCount - a.correctionsCount
    return cmpIso(b.lastCorrectionAt, a.lastCorrectionAt)
  })

  const editedCompleted = completed.filter((c) => c.edycja_ksiegowa === true).length
  const cleanCompleted = completed.filter((c) => c.edycja_ksiegowa === false).length

  const warnings: string[] = []
  if (events.length >= EVENTS_LIMIT) {
    warnings.push(`Uwzględniono ostatnie ${EVENTS_LIMIT} zdarzeń korekt — starsze pominięte`)
  }
  if (completed.length >= CARDS_LIMIT) {
    warnings.push(`Uwzględniono ${CARDS_LIMIT} najnowszych zakończonych kart — starsze pominięte w licznikach`)
  }

  return {
    data: {
      rules,
      totalCorrections,
      rulesCount: rules.length,
      cleanAfterTotal: cleanCardIds.size,
      totalCompleted: completed.length,
      editedCompleted,
      cleanCompleted,
      warning: warnings.length > 0 ? warnings.join('; ') : undefined,
    },
    error: null,
  }
}
