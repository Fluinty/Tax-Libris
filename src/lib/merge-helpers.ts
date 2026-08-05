// Helper functions for merging inline edits into final data

import type { ZapisVATData } from '@/types/database'
import { normalizeStawka } from './vat'

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
  if (exception.pozycje_vat_final) {
    const origPozycje = base.pozycje_vat ?? []
    
    merged.pozycje_vat = exception.pozycje_vat_final.map((row: any) => {
      const normalizedStawka = normalizeStawka(row.stawka)
      const origMatch = origPozycje.find((o: any) => normalizeStawka(o.stawka_symbol) === normalizedStawka)
      
      return {
        ...row,
        stawka_symbol: normalizedStawka,
        stawka_id: origMatch ? origMatch.stawka_id : null,
        pole_deklaracji: origMatch ? origMatch.pole_deklaracji : null,
      }
    })
    
    merged.suma_netto = exception.pozycje_vat_final.reduce((s: number, p: any) => s + Number(p.netto), 0)
    merged.suma_vat = exception.pozycje_vat_final.reduce((s: number, p: any) => s + Number(p.vat), 0)
    merged.suma_brutto = exception.pozycje_vat_final.reduce((s: number, p: any) => s + Number(p.brutto), 0)
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

    // Przelicz pozycje_vat: wyklucz pozycje z brak/nkup z rejestru VAT
    const hasExclusions = pozycjeEditable.some(
      (p: any) => p.effective_vat_odliczalny === 'brak' || p.effective_kup_status === 'nkup'
    )
    if (hasExclusions && merged.pozycje_vat) {
      const deductible = pozycjeEditable.filter(
        (p: any) => p.effective_vat_odliczalny !== 'brak' && p.effective_kup_status !== 'nkup'
      )
      // Grupuj po stawce VAT
      const groups = new Map<string, { netto: number; vat: number; brutto: number }>()
      for (const p of deductible) {
        const rawStawka = p.stawka_vat || '0'
        const stawka = normalizeStawka(rawStawka)
        const existing = groups.get(stawka) || { netto: 0, vat: 0, brutto: 0 }
        const netto = Number(p.wartosc_netto || 0)
        const brutto = Number(p.wartosc_brutto || 0)
        existing.netto += netto
        existing.vat += (brutto - netto)
        existing.brutto += brutto
        groups.set(stawka, existing)
      }
      // Przelicz zachowując stawka_id i pole_deklaracji z oryginału
      const newPozycje: any[] = []
      for (const orig of merged.pozycje_vat) {
        const stawkaNum = normalizeStawka(orig.stawka_symbol)
        const group = groups.get(stawkaNum)
        if (group && (group.netto !== 0 || group.brutto !== 0)) {
          newPozycje.push({ ...orig, netto: group.netto, vat: group.vat, brutto: group.brutto })
        }
        // Stawki bez pozycji odliczalnych — pomijamy (nie trafiają do rejestru)
      }
      merged.pozycje_vat = newPozycje
      merged.suma_netto = newPozycje.reduce((s: number, p: any) => s + Number(p.netto), 0)
      merged.suma_vat = newPozycje.reduce((s: number, p: any) => s + Number(p.vat), 0)
      merged.suma_brutto = newPozycje.reduce((s: number, p: any) => s + Number(p.brutto), 0)
    }
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

export function normalizujRezim(v: string | null | undefined): '100' | '50_75' | '20' | null {
  if (!v) return null
  const s = String(v).toLowerCase().trim()
  // Direct matches — known enum values and common legacy formats
  if (['100', '100%', '100.00%', 'pelne_100', 'sluzbowy_100_100', 'ciezarowy_100_100'].includes(s)) return '100'
  if (['50_75', '75%', '75.00%', '75', 'mieszany_50_75'].includes(s)) return '50_75'
  if (['20', '20%', '20.00%', '20_50', 'prywatne_20', 'prywatny_50_20'].includes(s)) return '20'
  // Leasing enum_label patterns: "leasing proporcja 100.00%", "leasing_proporcja" etc.
  if (s.includes('leasing')) {
    const numMatch = s.match(/([\d.]+)\s*%?/)
    if (numMatch) {
      const pct = parseFloat(numMatch[1])
      if (pct >= 95) return '100'
      if (pct >= 50) return '50_75'
      if (pct > 0) return '20'
    }
    return '100' // leasing without number → default 100% (limit < wartość nabycia)
  }
  // Generic percentage parsing: extract number from strings like "75.00%", "20%"
  const pctMatch = s.match(/^([\d.]+)\s*%?$/)
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1])
    if (pct >= 95) return '100'
    if (pct >= 50) return '50_75'
    if (pct > 0) return '20'
  }
  // Unrecognized → null, never guess
  return null
}

/**
 * Rounds all numerical values in a record to 2 decimal places.
 */
export function roundKwoty(kwoty: Record<string, number>): Record<string, number> {
  const rounded: Record<string, number> = {}
  for (const [k, v] of Object.entries(kwoty)) {
    rounded[k] = Math.round(v * 100) / 100
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
