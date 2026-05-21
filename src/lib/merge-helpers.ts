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
export function mergeInlineEditsVat(exception: any): ZapisVATData | null {
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

  return merged as ZapisVATData
}

/**
 * Build final_kpir_pojazdowe_data from inline PojazdRezimSection edits.
 * Previously this was ALWAYS null because approve actions never populated it.
 */
export function mergeInlineEditsPojazd(exception: any): any {
  const aiPojazd = exception.ai_kpir_pojazdowe_data || exception.kpir_pojazdowe_data

  // If Monika edited inline (pojazd_id_final or rezim_paliwowy_final)
  if (exception.pojazd_id_final != null || exception.rezim_paliwowy_final != null) {
    return {
      ...(aiPojazd || {}),
      wydatki_dotycza_pojazdu: exception.pojazd_id_final != null,
      procent_do_ujecia_w_kosztach: mapRezimToProcentEnum(exception.rezim_paliwowy_final),
      pojazd_id: exception.pojazd_id_final,
      rezim_proc: exception.rezim_paliwowy_final || '100',
    }
  }

  return aiPojazd || null
}

function mapRezimToProcentEnum(rezim: string | null): number {
  if (rezim === '100') return 0
  if (rezim === '20') return 2
  return 1 // default '50_75'
}
