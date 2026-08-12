import { KPIR_DISPLAY_NUMBER } from './kpir-labels'

export type TypDokumentu = 'zakup' | 'sprzedaz';

export interface KolumnaKpir {
  numer: number;          // wewnętrzny id (stara numeracja — NIE zmieniaj!)
  displayNumer: number;   // numer wg wzoru KPiR 2026 (do wyświetlenia)
  klucz: string;          // klucz w JSON-ie ai_kwoty_per_kolumna
  label: string;          // co pokazujemy księgowej
  labelKrotki: string;    // dla wąskich miejsc
}

export const KOLUMNY_PER_TYP: Record<TypDokumentu, readonly KolumnaKpir[]> = {
  zakup: [
    { numer: 10, displayNumer: KPIR_DISPLAY_NUMBER[10], klucz: 'ZakupyTowarow',         label: 'Zakup towarów handlowych i materiałów', labelKrotki: 'Zakup towarów' },
    { numer: 11, displayNumer: KPIR_DISPLAY_NUMBER[11], klucz: 'ZakupyKosztyUboczne',   label: 'Koszty uboczne zakupu',    labelKrotki: 'Koszty uboczne' },
    { numer: 12, displayNumer: KPIR_DISPLAY_NUMBER[12], klucz: 'WydatkiWynagrodzenia',  label: 'Wynagrodzenia',            labelKrotki: 'Wynagrodzenia' },
    { numer: 13, displayNumer: KPIR_DISPLAY_NUMBER[13], klucz: 'WydatkiPozostale',      label: 'Pozostałe wydatki',        labelKrotki: 'Pozostałe wydatki' },
  ],
  sprzedaz: [
    { numer: 7,  displayNumer: KPIR_DISPLAY_NUMBER[7],  klucz: 'PrzychodSprzedazTowarowIUslug', label: 'Sprzedaż towarów i usług', labelKrotki: 'Sprzedaż' },
    { numer: 8,  displayNumer: KPIR_DISPLAY_NUMBER[8],  klucz: 'PrzychodPozostale',             label: 'Pozostałe przychody',      labelKrotki: 'Pozostałe' },
  ],
} as const;

export function getKolumnyForTyp(typ: string | null): readonly KolumnaKpir[] {
  // Legacy / NULL = 'zakup'
  return KOLUMNY_PER_TYP[(typ as TypDokumentu) === 'sprzedaz' ? 'sprzedaz' : 'zakup'];
}

export function getEtykietaKontrahenta(typ: string | null): string {
  return typ === 'sprzedaz' ? 'Nabywca' : 'Sprzedawca';
}

export function getEtykietaSekcjiKwot(typ: string | null): string {
  return typ === 'sprzedaz' 
    ? 'Rozdzielenie kwot na kolumny KPiR (przychody)' 
    : 'Rozdzielenie kwot na kolumny KPiR (rozchody)';
}

import type { FakturaPozycjaKarta } from '@/types/database'

export function computeKpirFromPozycje(
  pozycje: FakturaPozycjaKarta[],
  typDokumentu: string | null,
  aiKwoty: Record<string, number>,
  isVatPayerKarta: boolean | null,
  rezimPojazdowy: '100' | '50_75' | '20' | null = null
): { kwoty: Record<string, number>; requiresManualRecalc: boolean } {
  const result: Record<string, number> = {}
  const kolumny = getKolumnyForTyp(typDokumentu)
  
  // Wariant rozliczenia VAT
  let isVatPayer = isVatPayerKarta
  let requiresManualRecalc = false
  
  if (isVatPayer === null) {
    // Heurystyka: jeśli suma brutto wszystkich pozycji AI KUP == suma kolumn AI, to prawdopodobnie nievatowiec (brutto).
    // Jeśli netto, to vatowiec (netto).
    let sumaBruttoKup = 0
    let sumaNettoKup = 0
    for (const p of pozycje) {
      if (p.effective_kup_status === 'kup') {
        sumaBruttoKup += Number(p.wartosc_brutto || 0)
        sumaNettoKup += Number(p.wartosc_netto || 0)
      }
    }
    
    // Check if all positions have same netto and brutto (e.g. rate 'zw', 'np')
    const allNettoEqualsBrutto = pozycje.length > 0 && pozycje.every(p => Number(p.wartosc_netto) === Number(p.wartosc_brutto))
    
    if (allNettoEqualsBrutto) {
      // Tie-break (wymóg użytkownika): Gdy faktura ma wyłącznie pozycje zw/np, wariant netto (vatowiec)
      isVatPayer = true
      requiresManualRecalc = true
    } else {
      const sumaAi = Object.values(aiKwoty).reduce((acc, val) => acc + Number(val || 0), 0)
      const diffBrutto = Math.abs(sumaAi - sumaBruttoKup)
      const diffNetto = Math.abs(sumaAi - sumaNettoKup)
      // Domyślnie zakładamy vatowca (netto), chyba że bliżej nam do brutto
      isVatPayer = diffNetto <= diffBrutto
    }
  }

  // Zainicjuj zerami dla dozwolonych kolumn
  for (const col of kolumny) {
    result[col.klucz] = 0
  }

  // Sumowanie pozycji
  for (const p of pozycje) {
    if (p.effective_kup_status === 'nkup') continue
    
    const colNumer = p.effective_kolumna_kpir ?? p.final_kolumna_kpir ?? p.ai_kolumna_kpir
    const colDef = kolumny.find(c => c.numer === colNumer)
    if (!colDef) continue // Pomijamy pozycje przypisane do błędnej kolumny (np. 10 przy sprzedaży)
    
    const netto = Number(p.wartosc_netto || 0)
    const brutto = Number(p.wartosc_brutto || 0)
    const vat = brutto - netto
    
    let kwota = 0
    const odlicz = p.effective_vat_odliczalny || 'pelny'
    
    if (!isVatPayer) {
      if (rezimPojazdowy === '50_75') {
        kwota = 0.75 * brutto
      } else if (rezimPojazdowy === '20') {
        kwota = 0.20 * brutto
      } else if (rezimPojazdowy === '100') {
        kwota = brutto
      } else if (odlicz === 'czesciowe_50') {
        kwota = 0.75 * brutto
      } else if (odlicz === 'czesciowe_25') {
        // Pojazd prywatny (odpowiednik reżimu '20'): bez tej gałęzi pozycja
        // wpadała do `else` i była liczona jak pełne odliczenie.
        kwota = 0.20 * brutto
      } else {
        kwota = brutto
      }
    } else {
      if (rezimPojazdowy === '100') {
        kwota = netto
      } else if (rezimPojazdowy === '50_75') {
        kwota = 0.75 * (netto + vat * 0.5)
      } else if (rezimPojazdowy === '20') {
        kwota = 0.20 * (netto + vat * 0.5)
      } else if (odlicz === 'pelny') {
        kwota = netto
      } else if (odlicz === 'brak') {
        kwota = brutto
      } else if (odlicz === 'czesciowe_50') {
        kwota = 0.75 * (netto + vat * 0.5)
      } else if (odlicz === 'czesciowe_25') {
        // Jak wyżej — wymiar 'czesciowe_25' istnieje w typie i w merge-helpers
        // (rodzaj_odliczenia=2), a tutaj był pominięty: kwota szła jako netto.
        kwota = 0.20 * (netto + vat * 0.5)
      } else {
        kwota = netto // fallback
      }
    }
    
    result[colDef.klucz] += kwota
  }
  
  // Zaokrąglenie do 2 miejsc po przecinku
  for (const key of Object.keys(result)) {
    result[key] = Math.round(result[key] * 100) / 100
  }

  return { kwoty: result, requiresManualRecalc }
}
