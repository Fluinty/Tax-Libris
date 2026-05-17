export type TypDokumentu = 'zakup' | 'sprzedaz';

export interface KolumnaKpir {
  numer: number;
  klucz: string;          // klucz w JSON-ie ai_kwoty_per_kolumna
  label: string;          // co pokazujemy księgowej
  labelKrotki: string;    // dla wąskich miejsc
}

export const KOLUMNY_PER_TYP: Record<TypDokumentu, readonly KolumnaKpir[]> = {
  zakup: [
    { numer: 10, klucz: 'ZakupyTowarow',         label: 'Zakup towarów handlowych', labelKrotki: 'Zakup towarów' },
    { numer: 11, klucz: 'ZakupyKosztyUboczne',   label: 'Koszty uboczne zakupu',    labelKrotki: 'Koszty uboczne' },
    { numer: 12, klucz: 'WydatkiWynagrodzenia',  label: 'Wynagrodzenia w naturze',  labelKrotki: 'Wynagrodzenia' },
    { numer: 13, klucz: 'WydatkiPozostale',      label: 'Pozostałe wydatki',        labelKrotki: 'Pozostałe wydatki' },
  ],
  sprzedaz: [
    { numer: 7,  klucz: 'PrzychodSprzedazTowarowIUslug', label: 'Sprzedaż towarów i usług', labelKrotki: 'Sprzedaż' },
    { numer: 8,  klucz: 'PrzychodPozostale',             label: 'Pozostałe przychody',      labelKrotki: 'Pozostałe' },
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
