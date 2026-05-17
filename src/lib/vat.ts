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
  'mieszany_50_75': 'Mieszany (firmowo-prywatnie)',
  'sluzbowy_100_100': 'Służbowy (VAT-26)',
  'prywatny_50_20': 'Prywatny w działalności',
  'ciezarowy_100_100': 'Ciężarowy (>3.5T)',
};

export const REZIM_VAT_LABELS: Record<string, string> = {
  'mieszany_50_75': '50% odliczenia',
  'sluzbowy_100_100': '100% (pełne odliczenie)',
  'prywatny_50_20': '50% odliczenia',
  'ciezarowy_100_100': '100% (pełne odliczenie)',
};

export const REZIM_KPIR_LABELS: Record<string, string> = {
  'mieszany_50_75': '75% kosztu',
  'sluzbowy_100_100': '100% (pełen koszt)',
  'prywatny_50_20': '20% kosztu',
  'ciezarowy_100_100': '100% (pełen koszt)',
};
