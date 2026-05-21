// Pure helper: per-pozycja kwota referencyjna calculation (sesja 33)
// Accounts for KUP/NKUP status and VAT odliczalny per line item.

import type { FakturaPozycja } from '@/types/database'

/**
 * Calculate the reference amount for KPiR column validation.
 *
 * Rules:
 * - NKUP positions → excluded (0 zł to KPiR)
 * - VAT odliczalny = 'brak' OR client not VAT payer → use brutto
 * - VAT odliczalny = 'pelny' AND client is VAT payer → use netto
 * - VAT odliczalny = 'czesciowe_50' → netto + 50% VAT (approximated as brutto for simplicity)
 * - VAT odliczalny = 'czesciowe_25' → netto + 75% VAT
 */
export function kwotaReferencyjnaPozycje(
  pozycje: FakturaPozycja[],
  isVatPayer: boolean
): number {
  let suma = 0
  for (const p of pozycje) {
    // NKUP = nie idzie do KPiR w ogóle
    if (p.effective_kup_status === 'nkup') continue

    const netto = p.wartosc_netto ?? 0
    const brutto = p.wartosc_brutto ?? 0

    if (!isVatPayer || p.effective_vat_odliczalny === 'brak') {
      // Brak odliczenia VAT → cała kwota brutto idzie do kosztu
      suma += brutto
    } else if (p.effective_vat_odliczalny === 'czesciowe_50') {
      // 50% VAT odliczalne → koszt = netto + 50% VAT
      const vat = brutto - netto
      suma += netto + vat * 0.5
    } else if (p.effective_vat_odliczalny === 'czesciowe_25') {
      // 25% VAT odliczalne → koszt = netto + 75% VAT
      const vat = brutto - netto
      suma += netto + vat * 0.75
    } else {
      // pelny → netto (VAT w pełni odliczony, nie idzie do kosztu)
      suma += netto
    }
  }
  return suma
}
