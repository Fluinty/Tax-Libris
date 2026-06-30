// Helper functions for merging inline edits into final data

import type { ZapisVATData } from '@/types/database'

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
    merged.pozycje_vat = exception.pozycje_vat_final
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
        const stawka = rawStawka.startsWith('Stawka') ? rawStawka.replace('Stawka', '') : rawStawka
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
        const stawkaNum = orig.stawka_symbol.startsWith('Stawka')
          ? orig.stawka_symbol.replace('Stawka', '')
          : orig.stawka_symbol
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
      const strat = scalonyPojazd.strategia
      const rezProc = scalonyPojazd.rezim_proc
      if (strat === 'pelne_100' || rezProc === '100') {
        merged.rodzaj_odliczenia = 1 // Całkowite
      } else if (strat === 'mieszany_50_75' || rezProc === '50_75') {
        merged.rodzaj_odliczenia = 2 // Proporcjonalne
      } else if (strat === 'prywatne_20' || rezProc === '20') {
        merged.rodzaj_odliczenia = 0 // Brak
      }
    }
  }

  return merged as ZapisVATData
}

/**
 * Build final_kpir_pojazdowe_data from inline PojazdRezimSection edits.
 */
export function mergeInlineEditsPojazd(exception: any): any {
  const aiPojazd = exception.ai_kpir_pojazdowe_data || exception.kpir_pojazdowe_data

  // KRYTYCZNE: jeśli Monika jawnie WYŁĄCZYŁA suwak pojazdu (rezim_edited=true,
  // ale oba final pola = null) → jawne false, wyczyszczone pole, NIE fallback na AI
  if (exception.rezim_edited === true && exception.pojazd_id_final == null && exception.rezim_paliwowy_final == null) {
    return {
      wydatki_dotycza_pojazdu: false,
      procent_do_ujecia_w_kosztach: 1,
      wydatki_pozostale_wartosc_faktury: 0,
      strategia: null,
      pojazd_id: null,
      rezim_proc: null,
    }
  }

  // If Monika edited inline (pojazd_id_final or rezim_paliwowy_final or rezim_edited is true with a regime)
  if (exception.pojazd_id_final != null || exception.rezim_paliwowy_final != null) {
    const rezim = exception.rezim_paliwowy_final || (aiPojazd?.strategia === 'pelne_100' ? '100' : aiPojazd?.strategia === 'prywatne_20' ? '20' : '50_75')
    const procent = mapRezimToProcentEnum(rezim)
    const strategia = rezim === '100' ? 'pelne_100' : rezim === '20' ? 'prywatne_20' : 'mieszany_50_75'

    return {
      ...(aiPojazd || {}),
      wydatki_dotycza_pojazdu: true,
      procent_do_ujecia_w_kosztach: procent,
      strategia: strategia,
      pojazd_id: exception.pojazd_id_final ?? aiPojazd?.pojazd_id ?? null,
      rezim_proc: rezim,
    }
  }

  return aiPojazd || null
}

function mapRezimToProcentEnum(rezim: string | null): number {
  if (rezim === '100') return 0
  if (rezim === '20') return 2
  return 1 // default '50_75'
}
