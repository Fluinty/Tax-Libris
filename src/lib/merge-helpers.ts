// Helper functions for merging inline edits into final data

import type { ZapisVATData } from '@/types/database'
import { normalizeStawka } from './vat'
import { roundKwota } from './parse-number'

/**
 * Minimalny podzbiór pozycji faktury, na którym wolno opierać obliczenia VAT.
 * DOKŁADNIE te pięć kolumn dociąga ścieżka approve po stronie serwera
 * (do-akceptacji/actions.ts), więc sięgnięcie po cokolwiek więcej dałoby inny
 * wynik na serwerze niż w przeglądarce (karta ma pełny wiersz).
 */
export type PozycjaKlasyfikacja = {
  stawka_vat?: string | null
  wartosc_netto?: number | null
  wartosc_brutto?: number | null
  effective_vat_odliczalny?: 'pelny' | 'brak' | 'czesciowe_50' | 'czesciowe_25' | null
  effective_kup_status?: 'kup' | 'nkup' | null
}

export interface EffectiveVatResult {
  /** Pozycje rejestru VAT po uwzględnieniu wykluczeń (albo baza bez zmian). */
  pozycjeVat: any[]
  sumaNetto: number
  sumaVat: number
  sumaBrutto: number
  /** Czy wykluczenia realnie zadziałały — karta gasi tym czerwony alert
   *  o niezgodności sumy i zmienia stopkę na „(po wykluczeniach)". */
  hasExclusions: boolean
  /** Znormalizowane stawki obecne w bazie, które w całości wypadły z rejestru. */
  excludedStawki: string[]
  /** Znormalizowane stawki dołożone z pozycji, których nie było w bazie. */
  addedStawki: string[]
  /** false = nic nie przeliczono, baza i sumy wracają nietknięte. */
  recomputed: boolean
}

/**
 * Efektywne pozycje rejestru VAT: z bazowej listy (zapis workera lub ręczna
 * tabela księgowej) usuwa kwoty pozycji nieodliczalnych (art. 88) i NKUP.
 *
 * JEDNO źródło prawdy dla podglądu na karcie i dla tego, co approve zapisuje do
 * `final_zapis_vat_data`. Wcześniej istniały dwie kopie tej logiki
 * (FakturaCard.renderZapisVat i mergeInlineEditsVat) różniące się bramką
 * `isZakup`, bazą pętli i zachowaniem przy pustej liście — księgowa widziała
 * jedno, a do bazy szło drugie (audyt 2026-08 §3 i §4).
 */
export function computeEffectivePozycjeVat(params: {
  pozycjeVat: any[] | null | undefined
  sumy: { netto: number; vat: number; brutto: number }
  pozycjeEditable: PozycjaKlasyfikacja[] | null | undefined
  /** Wykluczenia dotyczą VAT NALICZONEGO — tylko zakup (NULL = zakup, jak w kpir.ts). */
  applyExclusions: boolean
  /** Ręczna tabela VAT księgowej wygrywa: nie przeliczamy jej z pozycji. */
  keepManualRows: boolean
}): EffectiveVatResult {
  const { pozycjeVat, sumy, pozycjeEditable, applyExclusions, keepManualRows } = params
  const base = pozycjeVat ?? []
  const unchanged: EffectiveVatResult = {
    pozycjeVat: base,
    sumaNetto: Number(sumy.netto ?? 0),
    sumaVat: Number(sumy.vat ?? 0),
    sumaBrutto: Number(sumy.brutto ?? 0),
    hasExclusions: false,
    excludedStawki: [],
    addedStawki: [],
    recomputed: false,
  }

  if (!applyExclusions || keepManualRows) return unchanged
  if (!pozycjeEditable || pozycjeEditable.length === 0) return unchanged
  // Pusta baza: nie syntetyzujemy rejestru z pozycji — worker potrzebuje
  // stawka_id z własnego zapisu, a zmyślony rejestr byłby nie do zaksięgowania.
  if (base.length === 0) return unchanged

  const hasExclusions = pozycjeEditable.some(
    p => p.effective_vat_odliczalny === 'brak' || p.effective_kup_status === 'nkup'
  )
  if (!hasExclusions) return unchanged

  const deductible = pozycjeEditable.filter(
    p => p.effective_vat_odliczalny !== 'brak' && p.effective_kup_status !== 'nkup'
  )

  // Grupowanie po stawce; VAT wyprowadzany (pozycje faktury nie mają kolumny VAT)
  const groups = new Map<string, { netto: number; vat: number; brutto: number }>()
  for (const p of deductible) {
    const stawka = normalizeStawka(p.stawka_vat || '0')
    const existing = groups.get(stawka) || { netto: 0, vat: 0, brutto: 0 }
    const netto = Number(p.wartosc_netto || 0)
    const brutto = Number(p.wartosc_brutto || 0)
    existing.netto += netto
    existing.vat += brutto - netto
    existing.brutto += brutto
    groups.set(stawka, existing)
  }

  const nowePozycje: any[] = []
  const excludedStawki: string[] = []
  const addedStawki: string[] = []
  const uzyteStawki = new Set<string>()

  for (const orig of base) {
    const stawka = normalizeStawka(orig.stawka_symbol)
    const group = groups.get(stawka)
    if (group && (group.netto !== 0 || group.brutto !== 0)) {
      nowePozycje.push({ ...orig, netto: group.netto, vat: group.vat, brutto: group.brutto })
      uzyteStawki.add(stawka)
    } else {
      excludedStawki.push(stawka)
    }
  }

  // Stawka odliczalna, której NIE MA w bazowym zapisie (np. księgowa dodała
  // pozycję o innej stawce): wcześniej pętla po samych stawkach bazowych gubiła
  // ją bez śladu — razem z jej kwotą w rejestrze. stawka_id=null, bo worker musi
  // rozstrzygnąć mapowanie na rejestr Rachmistrza po stronie księgowania.
  for (const [stawka, group] of groups) {
    if (uzyteStawki.has(stawka)) continue
    if (group.netto === 0 && group.brutto === 0) continue
    nowePozycje.push({
      stawka_symbol: stawka,
      stawka_id: null,
      pole_deklaracji: null,
      netto: group.netto,
      vat: group.vat,
      brutto: group.brutto,
    })
    addedStawki.push(stawka)
  }

  return {
    pozycjeVat: nowePozycje,
    sumaNetto: nowePozycje.reduce((s, p) => s + Number(p.netto), 0),
    sumaVat: nowePozycje.reduce((s, p) => s + Number(p.vat), 0),
    sumaBrutto: nowePozycje.reduce((s, p) => s + Number(p.brutto), 0),
    hasExclusions: true,
    excludedStawki,
    addedStawki,
    recomputed: true,
  }
}

/**
 * Nakłada ręcznie edytowaną tabelę VAT (`pozycje_vat_final` z PozycjeVatSection)
 * na bazowy zapis. Zwraca null, gdy ręcznej edycji nie ma — wtedy baza zostaje.
 * Wspólne dla karty i dla approve, żeby podgląd „Zapis VAT" pokazywał te same
 * wiersze, które trafią do bazy.
 */
export function applyPozycjeVatFinal(
  basePozycje: any[] | null | undefined,
  pozycjeVatFinal: any[] | null | undefined,
): { pozycje: any[]; sumy: { netto: number; vat: number; brutto: number } } | null {
  // `?.length > 0`, nie samo `if (pozycje_vat_final)`: pusta tablica to NIE jest
  // edycja księgowej, a wcześniej zerowała rejestr VAT i sumy (utrata odliczenia).
  if (!pozycjeVatFinal || pozycjeVatFinal.length === 0) return null

  const orig = basePozycje ?? []
  const pozycje = pozycjeVatFinal.map((row: any) => {
    const normalizedStawka = normalizeStawka(row.stawka)
    const origMatch = orig.find((o: any) => normalizeStawka(o.stawka_symbol) === normalizedStawka)
    return {
      ...row,
      stawka_symbol: normalizedStawka,
      stawka_id: origMatch ? origMatch.stawka_id : null,
      pole_deklaracji: origMatch ? origMatch.pole_deklaracji : null,
    }
  })

  return {
    pozycje,
    sumy: {
      netto: pozycjeVatFinal.reduce((s: number, p: any) => s + Number(p.netto), 0),
      vat: pozycjeVatFinal.reduce((s: number, p: any) => s + Number(p.vat), 0),
      brutto: pozycjeVatFinal.reduce((s: number, p: any) => s + Number(p.brutto), 0),
    },
  }
}

/**
 * Phase 2 — Merge inline section edits (GTU, procedury JPK, pozycje VAT)
 * into final_zapis_vat_data JSON before sending to worker.
 *
 * Fixes critical bug: inline edits were saved to separate columns
 * (gtu_bitmask_final, procedura_jpk_final, etc.) but approveFaktura()
 * never merged them back into final_zapis_vat_data.
 */
export function mergeInlineEditsVat(exception: any, pozycjeEditable?: any[], scalonyPojazd?: any): ZapisVATData | null {
  const base = exception.final_zapis_vat_data
    || exception.ai_zapis_vat_data
    || exception.zapis_vat_data

  if (!base) return null

  const merged = { ...base }

  // GTU bitmask from inline GtuSection
  if (exception.gtu_bitmask_final != null) {
    merged.grupa_asortymentu = exception.gtu_bitmask_final
  }

  // Procedury JPK from inline ProceduryJpkSection
  if (exception.procedura_jpk_final != null) {
    merged.procedura_jpk = exception.procedura_jpk_final
  }
  if (exception.typ_dokumentu_jpk_final != null) {
    merged.typ_dokumentu = exception.typ_dokumentu_jpk_final
  }

  // Pozycje VAT (if edited inline via PozycjeVatSection)
  const reczneVat = applyPozycjeVatFinal(base.pozycje_vat, exception.pozycje_vat_final)
  if (reczneVat) {
    merged.pozycje_vat = reczneVat.pozycje
    merged.suma_netto = reczneVat.sumy.netto
    merged.suma_vat = reczneVat.sumy.vat
    merged.suma_brutto = reczneVat.sumy.brutto
  }

  // Auto-korekta rodzaj_odliczenia: jeśli jakieś pozycje mają częściowe odliczenie VAT
  // a nagłówek mówi "Całkowite" (1), ustaw na "Proporcjonalne" (2)
  if (pozycjeEditable && pozycjeEditable.length > 0) {
    const hasCzesciowe = pozycjeEditable.some(
      (p: any) => p.effective_vat_odliczalny === 'czesciowe_50' || p.effective_vat_odliczalny === 'czesciowe_25'
    )
    if (hasCzesciowe && Number(merged.rodzaj_odliczenia) === 1) {
      merged.rodzaj_odliczenia = 2 // Proporcjonalne
    }
  }

  // Wykluczenia (art. 88 / NKUP) — wspólna logika z podglądem na karcie.
  // keepManualRows: ręczna tabela VAT księgowej NIE jest przeliczana z pozycji
  // (wcześniej blok wykluczeń nadpisywał ją bezwarunkowo i korekta znikała).
  const effVat = computeEffectivePozycjeVat({
    pozycjeVat: merged.pozycje_vat,
    sumy: { netto: merged.suma_netto, vat: merged.suma_vat, brutto: merged.suma_brutto },
    pozycjeEditable: pozycjeEditable as PozycjaKlasyfikacja[] | undefined,
    applyExclusions: exception.typ_dokumentu !== 'sprzedaz',
    keepManualRows: reczneVat !== null,
  })
  if (effVat.recomputed) {
    merged.pozycje_vat = effVat.pozycjeVat
    merged.suma_netto = effVat.sumaNetto
    merged.suma_vat = effVat.sumaVat
    merged.suma_brutto = effVat.sumaBrutto
  }

  // Synchronizacja rodzaj_odliczenia ze scalonym reżimem pojazdu
  if (scalonyPojazd) {
    if (scalonyPojazd.wydatki_dotycza_pojazdu === false) {
      // Jeśli odznaczono pojazd, a wcześniej było odliczenie proporcjonalne (2) dla auta, przywróć całkowite (1)
      if (Number(merged.rodzaj_odliczenia) === 2) {
        merged.rodzaj_odliczenia = 1
      }
    } else if (scalonyPojazd.wydatki_dotycza_pojazdu === true) {
      const inputRezim = scalonyPojazd.rezim_proc ?? scalonyPojazd.strategia
      const norm = normalizujRezim(inputRezim)
      if (norm === '100') {
        merged.rodzaj_odliczenia = 1 // Całkowite
        merged.sposob_naliczania_kwoty_do_odliczenia = 0
      } else if (norm === '50_75' || norm === '20') {
        merged.rodzaj_odliczenia = 2 // Proporcjonalne
        merged.sposob_naliczania_kwoty_do_odliczenia = 1
      } else if (norm === null) {
        console.warn('Nieznana wartość reżimu w mergeInlineEditsVat:', inputRezim)
      }
    }
  }

  return merged as ZapisVATData
}

/** Kubełkowanie procentu na reżim. Progi bez zmian względem poprzedniej wersji. */
function rezimZProcentu(pct: number): '100' | '50_75' | '20' | null {
  if (!Number.isFinite(pct)) return null
  if (pct >= 95) return '100'
  if (pct >= 50) return '50_75'
  if (pct > 0) return '20'
  return null
}

/** Procent z tekstu: liczba STOJĄCA PRZED znakiem `%` (dopuszcza polski przecinek). */
function procentyZTekstu(s: string): number[] {
  return [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)]
    .map(m => parseFloat(m[1].replace(',', '.')))
    .filter(n => Number.isFinite(n))
}

export function normalizujRezim(v: string | null | undefined): '100' | '50_75' | '20' | null {
  if (!v) return null
  const s = String(v).toLowerCase().trim()
  // Direct matches — known enum values and common legacy formats
  if (['100', '100%', '100.00%', 'pelne_100', 'sluzbowy_100_100', 'ciezarowy_100_100'].includes(s)) return '100'
  if (['50_75', '75%', '75.00%', '75', 'mieszany_50_75'].includes(s)) return '50_75'
  if (['20', '20%', '20.00%', '20_50', 'prywatne_20', 'prywatny_50_20'].includes(s)) return '20'
  // Leasing enum_label patterns: "leasing proporcja 100.00%", "leasing_proporcja" etc.
  if (s.includes('leasing')) {
    // Bierzemy WYŁĄCZNIE liczbę przed znakiem %. Poprzedni regex łapał pierwszą
    // liczbę w zdaniu, więc „leasing limit 150 tys proporcja 75%" dawało 150 →
    // reżim „100" zamiast 75% (kwota kosztu zawyżona o 1/3).
    const pcts = procentyZTekstu(s)
    if (pcts.length === 1) return rezimZProcentu(pcts[0])
    if (pcts.length > 1) {
      // Kilka różnych procentów w jednym opisie = nie zgadujemy.
      const unikalne = [...new Set(pcts)]
      if (unikalne.length > 1) {
        console.warn('normalizujRezim: niejednoznaczny opis leasingu (kilka procentów):', v)
        return null
      }
      return rezimZProcentu(unikalne[0])
    }
    return '100' // leasing bez procentu → jak dotąd 100% (limit < wartość nabycia)
  }
  // Generic percentage parsing: extract number from strings like "75.00%", "55,56%"
  const pctMatch = s.match(/^(\d+(?:[.,]\d+)?)\s*%?$/)
  if (pctMatch) {
    return rezimZProcentu(parseFloat(pctMatch[1].replace(',', '.')))
  }
  // Unrecognized → null, never guess
  return null
}

/**
 * Rounds all numerical values in a record to 2 decimal places.
 *
 * Wartości, których nie da się uznać za kwotę (null/NaN/Infinity/tekst), są
 * POMIJANE zamiast trafiać do bazy: `Math.round(null * 100) / 100` dawało 0,
 * a NaN przechodził dalej do `final_kwoty_per_kolumna`, z której księguje worker.
 * Pominięcie nie znika po cichu — ląduje w console.error (logi Vercel).
 */
export function roundKwoty(kwoty: Record<string, number>): Record<string, number> {
  const rounded: Record<string, number> = {}
  for (const [k, v] of Object.entries(kwoty)) {
    const r = roundKwota(v)
    if (r === null) {
      console.error(`[roundKwoty] Pominięto kolumnę KPiR „${k}" — nieprawidłowa kwota:`, v)
      continue
    }
    rounded[k] = r
  }
  return rounded
}

/**
 * Build final_kpir_pojazdowe_data from inline PojazdRezimSection edits.
 *
 * Returns null in 3 cases:
 *   1. User explicitly disabled vehicle regime (rezim_edited=true, both finals null) — DEFEKT 1
 *   2. Leasing card (typ_wydatku='rata_leasingowa' / strategia='leasing_proporcja') — DEFEKT 4
 *   3. No AI data and no inline edits
 *
 * Does NOT include worker-only fields (koszt_kpir_obliczony, wydatki_pozostale_wartosc_faktury,
 * wartosc_nabycia_pojazdu, pojazd_dopasowany) — those are computed by worker.
 */
export function mergeInlineEditsPojazd(
  exception: any,
  _pozycjeEditable: any[] = [],
  _finalKwotyPerKolumna: Record<string, number> = {}
): any {
  const aiPojazd = exception.ai_kpir_pojazdowe_data || exception.kpir_pojazdowe_data

  // ── DEFEKT 4: Leasing card — panel MUST NOT produce final_kpir_pojazdowe_data.
  // Worker has dedicated path (S46 guard) and computes the proportion from vehicle value.
  if (aiPojazd?.typ_wydatku === 'rata_leasingowa' || aiPojazd?.strategia === 'leasing_proporcja') {
    return null
  }

  // ── DEFEKT 1: User explicitly DISABLED vehicle regime → null (not a frankenstein object)
  if (exception.rezim_edited === true && exception.pojazd_id_final == null && exception.rezim_paliwowy_final == null) {
    return null
  }

  // ── User edited regime inline (pojazd_id_final or rezim_paliwowy_final set)
  if (exception.pojazd_id_final != null || exception.rezim_paliwowy_final != null) {
    const inputRezim = exception.rezim_paliwowy_final !== null ? exception.rezim_paliwowy_final : (aiPojazd?.rezim_proc ?? aiPojazd?.strategia)
    const norm = normalizujRezim(inputRezim)
    if (norm === null) {
      console.warn('Nieznana wartość reżimu w mergeInlineEditsPojazd (inline edit):', inputRezim)
      return null
    }
    const procent = mapRezimToProcentEnum(norm)
    const strategia = norm === '100' ? 'pelne_100' : norm === '20' ? 'prywatny_50_20' : 'mieszany_50_75'

    return {
      wydatki_dotycza_pojazdu: true,
      procent_do_ujecia_w_kosztach: procent,
      strategia: strategia,
      pojazd_id: exception.pojazd_id_final ?? aiPojazd?.pojazd_id ?? null,
      nie_dotyczy_paliwa: aiPojazd?.nie_dotyczy_paliwa ?? true,
      typ_wydatku: aiPojazd?.typ_wydatku ?? null,
    }
  }

  // ── AI fallback: no inline edit, AI says vehicle
  if (aiPojazd && aiPojazd.wydatki_dotycza_pojazdu === true) {
    const inputRezim = aiPojazd.rezim_proc ?? aiPojazd.strategia
    if (inputRezim) {
      const norm = normalizujRezim(inputRezim)
      if (norm === null) {
        console.warn('Nieznana wartość reżimu w mergeInlineEditsPojazd (AI fallback):', inputRezim)
        return null
      }
      const procent = mapRezimToProcentEnum(norm)
      const strategia = norm === '100' ? 'pelne_100' : norm === '20' ? 'prywatny_50_20' : 'mieszany_50_75'
      return {
        wydatki_dotycza_pojazdu: true,
        procent_do_ujecia_w_kosztach: procent,
        strategia: strategia,
        pojazd_id: aiPojazd.pojazd_id ?? null,
        nie_dotyczy_paliwa: aiPojazd.nie_dotyczy_paliwa ?? true,
        typ_wydatku: aiPojazd.typ_wydatku ?? null,
      }
    }
  }

  return aiPojazd || null
}

function mapRezimToProcentEnum(rezim: '100' | '50_75' | '20'): number {
  if (rezim === '100') return 0
  if (rezim === '20') return 2
  return 1 // default '50_75'
}
