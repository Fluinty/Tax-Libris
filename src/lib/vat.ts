import type { ZapisVATData, TypDokumentu } from '@/types/database';

export function getEtykietaSekcjiVAT(typ: TypDokumentu | null, hasVAT: boolean): string {
  if (!hasVAT) return '💰 Zapis VAT';
  return typ === 'sprzedaz' 
    ? '💰 Zapis VAT (sprzedaż należny)' 
    : '💰 Zapis VAT (zakup naliczony)';
}

export function isFakturaZwolniona(zapisVat: ZapisVATData | null): boolean {
  return zapisVat === null;
}

// Listy do dropdownów w modalu edycji
export const REJESTRY_VAT = [
  { id: 1, nazwa: 'Rejestr sprzedaży VAT' },
  { id: 2, nazwa: 'Rejestr zakupów VAT' },
  { id: 3, nazwa: 'Rejestr zakupów dla marża VAT' },
];

export const TRANSAKCJE_VAT_KRAJOWE = [
  // Zakup
  { id: 16, nazwa: 'Nabycie krajowe', dla: 'zakup' },
  { id: 15, nazwa: 'Nabycie krajowe środka trwałego', dla: 'zakup' },
  // Sprzedaż
  { id: 1, nazwa: 'Dostawa krajowa', dla: 'sprzedaz' },
];

// Labele dla enumów wyświetlanych w sekcji VAT
export const RODZAJ_ZAKUPU_LABELS: Record<number, string> = {
  0: 'Towary handlowe',
  1: 'Kosztowe',
  2: 'Zaopatrzeniowe',
  3: 'Inwestycyjne',
  4: 'Środek trwały',
  5: 'Pozostałe',
};

export const RODZAJ_ODLICZENIA_LABELS: Record<number, string> = {
  0: 'Brak',
  1: 'Całkowite',
  2: 'Proporcjonalne',
  3: 'Strukturą',
};

// Pomocnicza funkcja do wyciągania wartości z PozycjaXml
function findVal(obj: any, ...keys: string[]): string | null {
  if (!obj || typeof obj !== 'object') return null
  for (const k of keys) {
    if (k in obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
      return String(obj[k])
    }
  }
  return null
}

function pVal(poz: any, ...keys: string[]): string | null {
  if (!poz) return null
  
  if (poz.DanePozycji) {
    return findVal(poz.DanePozycji, ...keys)
  }
  
  return findVal(poz, ...keys)
}

/**
 * Zwraca zsumowaną oficjalną tabelę VAT bezpośrednio z pozycji XML
 * (tak, jak robi to podgląd KSeF). Ignoruje ewentualne usunięcie pozycji przez księgową (np. nkup).
 */
export function getOfficialVatTable(pozycjeXmlFull: any[] | null | undefined): any[] | null {
  if (!pozycjeXmlFull || !Array.isArray(pozycjeXmlFull) || pozycjeXmlFull.length === 0) {
    return null
  }

  const groups: Record<string, { netto: number; brutto: number }> = {}
  
  for (const p of pozycjeXmlFull) {
    const rawStawka = (pVal(p, 'stawkaVat', 'stawka') || '').replace('Stawka', '').trim()
    const stawka = rawStawka || 'zw'
    if (!groups[stawka]) groups[stawka] = { netto: 0, brutto: 0 }
    
    const nettoVal = Number(pVal(p, 'wartoscNetto', 'wartosc_netto') || 0)
    let bruttoVal = Number(pVal(p, 'wartoscBrutto', 'wartosc_brutto') || 0)
    
    if (!bruttoVal && nettoVal) {
      const stawkaNum = parseFloat(stawka)
      bruttoVal = !isNaN(stawkaNum) ? Math.round(nettoVal * (1 + stawkaNum / 100) * 100) / 100 : nettoVal
    }
    
    groups[stawka].netto += nettoVal
    groups[stawka].brutto += bruttoVal
  }

  return Object.entries(groups).map(([stawka, { netto, brutto }]) => ({
    stawka_symbol: stawka,
    stawka_id: '',
    netto: Math.round(netto * 100) / 100,
    vat: Math.round((brutto - netto) * 100) / 100,
    brutto: Math.round(brutto * 100) / 100,
  }))
}

export const CEL_ZAKUPU_LABELS: Record<number, string> = {
  0: 'Gospodarczy',
  1: 'Mieszany',
  2: 'Niegospodarczy',
};

export function getRodzajZakupuLabel(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' && isNaN(Number(value))) return value;
  const numValue = Number(value);
  return RODZAJ_ZAKUPU_LABELS[numValue] ?? `Nieznany (${value})`;
}

export function getRodzajOdliczeniaLabel(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' && isNaN(Number(value))) return value;
  const numValue = Number(value);
  return RODZAJ_ODLICZENIA_LABELS[numValue] ?? `Nieznany (${value})`;
}

export function getCelZakupuLabel(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' && isNaN(Number(value))) return value;
  const numValue = Number(value);
  return CEL_ZAKUPU_LABELS[numValue] ?? `Nieznany (${value})`;
}

export const RODZAJE_ZAKUPU = ['Zaopatrzeniowe', 'Inwestycyjne', 'Pozostałe'];
export const RODZAJE_ODLICZENIA = ['Całkowite', 'Proporcjonalne', 'Brak'];
export const CELE_ZAKUPU = ['Gospodarczy', 'Mieszany', 'Niegospodarczy'];

export const PROCEDURY_JPK = [
  { kod: null, label: '— brak —' },
  { kod: 'MK', label: 'MK (metoda kasowa)' },
  { kod: 'FP', label: 'FP (faktura do paragonu)' },
  { kod: 'RO', label: 'RO (raport okresowy)' },
  { kod: 'TP', label: 'TP (transakcje powiązane)' },
];

export const GRUPY_ASORTYMENTU = [
  { kod: null, label: '— brak —' },
  { kod: 'GTU_01', label: 'GTU_01 — alkohole' },
  { kod: 'GTU_02', label: 'GTU_02 — paliwa' },
  { kod: 'GTU_03', label: 'GTU_03 — olej opałowy' },
  { kod: 'GTU_04', label: 'GTU_04 — wyroby tytoniowe' },
  { kod: 'GTU_05', label: 'GTU_05 — odpady' },
  { kod: 'GTU_06', label: 'GTU_06 — elektronika' },
  { kod: 'GTU_07', label: 'GTU_07 — pojazdy' },
  { kod: 'GTU_08', label: 'GTU_08 — metale szlachetne' },
  { kod: 'GTU_09', label: 'GTU_09 — leki' },
  { kod: 'GTU_10', label: 'GTU_10 — budynki' },
  { kod: 'GTU_11', label: 'GTU_11 — transferowe' },
  { kod: 'GTU_12', label: 'GTU_12 — usługi doradcze/prawnicze' },
  { kod: 'GTU_13', label: 'GTU_13 — usługi transportowe' },
];

export const STRATEGIA_LABELS: Record<string, string> = {
  'mieszany_50_75': '75% (użytek mieszany)',
  'sluzbowy_100_100': '100% (firmowy / VAT-26)',
  'prywatny_50_20': '20% (pojazd prywatny)',
  'ciezarowy_100_100': '100% (ciężarowy > 3.5T)',
};

export const REZIM_VAT_LABELS: Record<string, string> = {
  'mieszany_50_75': '50% odliczenia VAT',
  'sluzbowy_100_100': '100% odliczenia VAT',
  'prywatny_50_20': '50% odliczenia VAT',
  'ciezarowy_100_100': '100% odliczenia VAT',
};

export const REZIM_KPIR_LABELS: Record<string, string> = {
  'mieszany_50_75': '75% × (netto + ½ VAT)',
  'sluzbowy_100_100': '100% kosztu',
  'prywatny_50_20': '20% × (netto + ½ VAT)',
  'ciezarowy_100_100': '100% kosztu',
};
