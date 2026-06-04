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
 * - VAT odliczalny = 'czesciowe_50' → 0.75 × (netto + 50% nieodliczony VAT)
 *   (pojazd mieszany: art.86a VAT + art.23 ust.1 pkt 46a PIT)
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
      // Pojazd mieszany (art.86a VAT + art.23 ust.1 pkt 46a PIT)
      // 50% VAT nieodliczalne wchodzi do podstawy, całość × 75% reżimu
      const vat = brutto - netto
      const vatNieodliczony = vat * 0.5
      suma += 0.75 * (netto + vatNieodliczony)
    } else {
      // pelny → netto (VAT w pełni odliczony, nie idzie do kosztu)
      suma += netto
    }
  }
  return suma
}
