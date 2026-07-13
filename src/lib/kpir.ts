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
