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

import type { FakturaPozycja } from '@/types/database'

export function computeKpirFromPozycje(
  pozycje: FakturaPozycja[],
  typDokumentu: string | null,
  aiKwoty: Record<string, number>,
  isVatPayerKarta: boolean | null
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
      if (odlicz === 'czesciowe_50') {
        // Dla nie-vatowca cały VAT jest kosztem, więc podstawa = brutto.
        // Mnożnik 75% z uwagi na użytek mieszany (analogicznie do vatowca).
        kwota = 0.75 * brutto
      } else {
        kwota = brutto
      }
    } else {
      if (odlicz === 'pelny') kwota = netto
      else if (odlicz === 'brak') kwota = brutto
      else if (odlicz === 'czesciowe_50') {
        // czesciowe_50: podstawa = netto + nieodliczona ½VAT (art.86a),
        // koszt KPiR = 75% podstawy (art.23 ust.1 pkt 46a PIT - uzytek mieszany).
        // To przeliczanie dziala WYLACZNIE na kartach bez kpir_pojazdowe_data
        // (karty z wykrytym rezimem pojazdowym sa wykluczone z przeliczania),
        // wiec jedyny realny przypadek czesciowe_50 tutaj to pozycja samochodowa
        // bez wykrytego rezimu - domyslny mnoznik 75% (uzytek mieszany) jest wlasciwy.
        // Enum 20% (pojazd prywatny) zawsze idzie z kpir_pojazdowe_data, wiec nie trafia tu.
        kwota = 0.75 * (netto + vat * 0.5)
      }
      else kwota = netto // fallback
    }
    
    result[colDef.klucz] += kwota
  }
  
  // Zaokrąglenie do 2 miejsc po przecinku
  for (const key of Object.keys(result)) {
    result[key] = Math.round(result[key] * 100) / 100
  }

  return { kwoty: result, requiresManualRecalc }
}
