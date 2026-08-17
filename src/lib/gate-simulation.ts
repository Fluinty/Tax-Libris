// ── Retro-symulacja bramki auto-write (ROADMAP-INPUT-2026-08 §4.1) ──────────
//
// NARZĘDZIE POMIARU, nie zmiana zachowania: liczy, co zrobiłby automat, gdyby
// działał od początku — na kartach JUŻ zakończonych przez człowieka. Zero
// wpływu na bramkę, metryki client_metrics i flagi.
//
// Dlaczego ta metryka: progi uzgodnione z biurem (≥50 dekretów AI, >50%
// czystości) mierzą czystość OGÓŁEM, a księgować będzie BRAMKA — podzbiór kart
// przechodzących auto_write_gate. Retro-symulacja 12.08: Czajecki 91,9%
// czystości ogółem, ale wśród kart przechodzących bramkę precyzja 85,4%.
// Decyzja o uzbrojeniu musi stać na precyzji bramki.
//
// Warunki bramki odtworzone z docs/ARCHITECTURE.md („confidence>=0.95, zero
// czerwonych flag, kwota<=auto_max_kwota") + zbioru flag fakturaWymagaUwagi.
// WALIDACJA NA ŻYWYM OBSERWATORZE (13.08.2026): wszystkie 33 eventy
// auto_candidate wyemitowane przez workera od 12.08 wskazują karty, które ten
// predykat też przepuszcza (33/33); w drugą stronę — wśród 107 kart pending*
// utworzonych po starcie obserwatora predykat nie przepuszcza żadnej karty
// realnego klienta, której worker by nie wskazał (2 rozjazdy to klient DEMO,
// którego worker pomija w całości).
//
// OGRANICZENIA SYMULACJI (warunki bramki workera niepoliczalne z panelu):
//  - worker pomija klienta DEMO — symulacja tego nie odtwarza per warunek,
//    ale sekcja UI jest osiągalna tylko przez /klienci/[nip], a gate dostępu
//    i tak wycina demo dla nie-adminów; dla admina wynik na DEMO jest jawnie
//    symulacyjny;
//  - ewentualny warunek „opis z listy klienta" (dopasowanie ai_proponowany_opis
//    do client_opisy) — NIEODTWARZALNY wstecz: lista opisów klienta zmienia się
//    w czasie, a panel nie wersjonuje jej stanu z dnia klasyfikacji karty;
//    walidacja na obserwatorze nie wykazała, żeby ten warunek dziś działał
//    (żaden kandydat nie odpadł z tego powodu), więc NIE jest symulowany;
//  - stan przełączników (config.auto_write_global, clients.auto_write_enabled)
//    celowo POZA symulacją — pytanie brzmi „co by było, gdyby automat DZIAŁAŁ",
//    więc odtwarzamy wyłącznie merytoryczną część auto_write_gate;
//  - auto_max_kwota liczona wg DZISIEJSZEJ wartości (COALESCE(auto_max_kwota,
//    5000)) — historycznych wartości progu panel nie wersjonuje.

// Wiersz karty w kształcie potrzebnym symulacji (podzbiór exceptions_queue).
export interface GateSimCard {
  id: number
  status: string
  kwota_brutto: number | null
  ai_confidence: number | null
  confidence_overall: number | null
  is_potential_duplicate: boolean | null
  vendor_vat_active: boolean | null
  date_anomaly: string | null
  rachunek_match_status: string | null
  srodek_trwaly_status: string | null
  wymaga_mpp: boolean | null
  anomalie_historii: unknown
  walidator_usluga_warningi: unknown
  walidator_kup_vat_warningi: unknown
  edycja_ksiegowa: boolean | null
}

export const GATE_SIM_COLUMNS =
  'id, status, kwota_brutto, ai_confidence, confidence_overall, is_potential_duplicate, ' +
  'vendor_vat_active, date_anomaly, rachunek_match_status, srodek_trwaly_status, wymaga_mpp, ' +
  'anomalie_historii, walidator_usluga_warningi, walidator_kup_vat_warningi, edycja_ksiegowa'

// Statusy „zakończone przez system" — jak mianownik RPC client_metrics
// i COMPLETED_STATUSES sekcji nauki. external_booked CELOWO poza symulacją:
// te karty nie przeszły przez system, automat nie miałby ich co księgować.
export const GATE_SIM_STATUSES = ['auto_created', 'approved', 'resolved'] as const

/** Domyślny próg kwotowy bramki — jak COALESCE(auto_max_kwota, 5000) workera. */
export const GATE_DEFAULT_MAX_KWOTA = 5000

/** Próg pewności bramki (ARCHITECTURE.md; potwierdzony payloadami auto_candidate). */
export const GATE_MIN_CONFIDENCE = 0.95

// Statusy rachunku traktowane jako czerwona flaga. 'below_threshold' /
// 'skip_*' / 'no_account_in_invoice' / 'ok' NIE blokują — to stany „nie dotyczy",
// nie alarmy (fakturaWymagaUwagi flaguje wyłącznie 'mismatch'; 'error' dokładamy,
// bo automat nie może księgować na nieudanej weryfikacji rachunku).
//
// DRUGIE świadome odstępstwo od fakturaWymagaUwagi: środek trwały blokuje
// przy KAŻDYM statusie ('mocny_alert' I 'slaby_alert'), nie tylko mocnym —
// automat nie powinien księgować niczego z podejrzeniem ŚT, bo decyzja
// „koszt vs środek trwały" jest z natury księgowej. Na danych 17.08 różnica
// zerowa (8 zakończonych kart ze slaby_alert, żadna nie przechodzi pozostałych
// warunków); gdyby żywa bramka workera przepuszczała slaby_alert, symulacja
// zaniży wolumen — do wyrównania przy zleceniu zmiany bramki na K1.
const RACHUNEK_ALARMY = new Set(['mismatch', 'error'])

function niepusteJson(v: unknown): boolean {
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return v !== '' && v !== false
}

/** Pewność karty jak w fakturaWymagaUwagi: overall z fallbackiem na ai. */
export function gateConfidence(card: GateSimCard): number | null {
  if (typeof card.confidence_overall === 'number') return card.confidence_overall
  if (typeof card.ai_confidence === 'number') return card.ai_confidence
  return null
}

/**
 * Czerwone flagi karty w rozumieniu bramki — po polsku, do pokazania
 * księgowej przy karcie odrzuconej. Pusta lista = zero flag.
 */
export function gateRedFlags(card: GateSimCard): string[] {
  const flagi: string[] = []
  if (card.is_potential_duplicate) flagi.push('potencjalny duplikat')
  if (card.vendor_vat_active === false) flagi.push('kontrahent nieaktywny w VAT')
  if (card.date_anomaly) flagi.push('anomalia daty')
  if (card.rachunek_match_status && RACHUNEK_ALARMY.has(card.rachunek_match_status))
    flagi.push(`rachunek: ${card.rachunek_match_status}`)
  if (card.srodek_trwaly_status) flagi.push(`środek trwały (${card.srodek_trwaly_status})`)
  if (card.wymaga_mpp) flagi.push('MPP')
  if (niepusteJson(card.anomalie_historii)) flagi.push('anomalie historii')
  if (niepusteJson(card.walidator_usluga_warningi)) flagi.push('ostrzeżenia walidatora usług')
  if (niepusteJson(card.walidator_kup_vat_warningi)) flagi.push('ostrzeżenia walidatora KUP/VAT')
  return flagi
}

export interface GateVerdict {
  passes: boolean
  /** Powody odrzucenia (puste gdy passes) — do UI i analizy zacieśnienia. */
  reasons: string[]
  confidence: number | null
  redFlags: string[]
}

/**
 * Czy karta przeszłaby bramkę auto-write. `maxKwota` = COALESCE z clients;
 * `minConfidence` parametryzowane, żeby analiza zacieśnienia mogła liczyć
 * warianty 0.97 / 0.98 tą samą funkcją (jedno źródło prawdy).
 */
export function gateVerdict(
  card: GateSimCard,
  maxKwota: number = GATE_DEFAULT_MAX_KWOTA,
  minConfidence: number = GATE_MIN_CONFIDENCE
): GateVerdict {
  const confidence = gateConfidence(card)
  const redFlags = gateRedFlags(card)
  const reasons: string[] = []
  if (confidence == null) reasons.push('brak wskaźnika pewności')
  else if (confidence < minConfidence) reasons.push(`pewność ${confidence} < ${minConfidence}`)
  if (card.kwota_brutto == null) reasons.push('brak kwoty brutto')
  else if (card.kwota_brutto > maxKwota) reasons.push(`kwota ${card.kwota_brutto} > ${maxKwota}`)
  if (redFlags.length > 0) reasons.push(...redFlags)
  return { passes: reasons.length === 0, reasons, confidence, redFlags }
}

export interface GateSimSummary {
  /** Karty zakończone objęte symulacją (auto_created/approved/resolved). */
  totalCompleted: number
  /** Ile z nich przeszłoby bramkę. */
  przeszloby: number
  /** Z przechodzących: bez realnej korekty księgowej (edycja_ksiegowa=false). */
  czystych: number
  /** Z przechodzących: z realną korektą księgową (edycja_ksiegowa=true) —
   *  automat zaksięgowałby je BŁĘDNIE. */
  blednych: number
  /** Z przechodzących: flaga edycja_ksiegowa IS NULL (karty sprzed flag) —
   *  liczone OSOBNO, nie jako czyste ani błędne; null ≠ false. */
  bezFlagi: number
  /** czystych / (czystych + blednych); null gdy mianownik zerowy.
   *  Karty bezFlagi poza licznikiem i mianownikiem — uczciwiej niż udawać,
   *  że brak danych to czystość. */
  precyzja: number | null
}

/**
 * Zbiorcze metryki symulacji na kartach zakończonych. Karta „błędna dla
 * automatu" = przeszłaby bramkę AND edycja_ksiegowa=true (flagi wiarygodne
 * po fixie fantomów — AUDIT-flagi-vs-eventy.md, DECISIONS 12.08).
 */
export function simulateGate(
  cards: GateSimCard[],
  maxKwota: number = GATE_DEFAULT_MAX_KWOTA,
  minConfidence: number = GATE_MIN_CONFIDENCE
): GateSimSummary & { passingCards: GateSimCard[] } {
  const completed = cards.filter((c) => (GATE_SIM_STATUSES as readonly string[]).includes(c.status))
  const passing = completed.filter((c) => gateVerdict(c, maxKwota, minConfidence).passes)
  const czystych = passing.filter((c) => c.edycja_ksiegowa === false).length
  const blednych = passing.filter((c) => c.edycja_ksiegowa === true).length
  const bezFlagi = passing.length - czystych - blednych
  const mianownik = czystych + blednych
  return {
    totalCompleted: completed.length,
    przeszloby: passing.length,
    czystych,
    blednych,
    bezFlagi,
    precyzja: mianownik > 0 ? czystych / mianownik : null,
    passingCards: passing,
  }
}
