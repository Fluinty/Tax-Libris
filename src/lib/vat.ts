import { roundKwota, parsePolishNumber } from './parse-number'
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

// ── JEDYNE wejście parsowania liczb z XML KSeF / podglad_faktury ────────────
// Dwa źródła, DWA formaty (pomiar 17.08): surowa exceptions_queue trzyma XML
// workera z polskimi przecinkami ("83,33"; 1285/1753 kart), ale panel czyta
// widok v2, który przebudowuje pozycje z faktury_pozycje (numeric::text →
// zawsze kropka; 0 przecinków w 5273 pozycjach). Przecinki docierają do
// komponentów torem podglad_faktury (kwotaDoZaplaty, wiersze, rozliczenia).
// Ta funkcja obsługuje OBA formaty, żeby konsument nie musiał wiedzieć,
// którym torem przyszła liczba — i żeby zmiana źródła (np. serwowanie
// surowego XML) niczego po cichu nie zerowała (DECISIONS 17.08, wpis
// SPROSTOWANIE). null = brak/nieparsowalne — default wybiera wołający
// (?? 0 dla sum, ?? 1 dla ilości). Minus '−' (U+2212) normalizowany
// prewencyjnie — 0 wystąpień w prod 17.08.
export function parseXmlKwota(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  return parsePolishNumber(String(raw).replace('−', '-'))
}

export function normalizeStawka(raw: string | null | undefined): string {
  const s = String(raw ?? '').replace(/stawka/i, '').replace('%', '').trim().toLowerCase()
  if (s === '') return 'zw'
  return s
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
    const stawka = normalizeStawka(pVal(p, 'stawkaVat', 'stawka'))
    if (!groups[stawka]) groups[stawka] = { netto: 0, brutto: 0 }
    
    const nettoVal = parseXmlKwota(pVal(p, 'wartoscNetto', 'wartosc_netto')) ?? 0
    let bruttoVal = parseXmlKwota(pVal(p, 'wartoscBrutto', 'wartosc_brutto')) ?? 0
    
    if (!bruttoVal && nettoVal) {
      const stawkaNum = parseFloat(stawka)
      bruttoVal = !isNaN(stawkaNum) ? (roundKwota(nettoVal * (1 + stawkaNum / 100)) ?? nettoVal) : nettoVal
    }
    
    groups[stawka].netto += nettoVal
    groups[stawka].brutto += bruttoVal
  }

  return Object.entries(groups).map(([stawka, { netto, brutto }]) => ({
    stawka,
    stawka_symbol: stawka,
    stawka_id: '',
    netto: roundKwota(netto) ?? 0,
    vat: roundKwota(brutto - netto) ?? 0,
    brutto: roundKwota(brutto) ?? 0,
  }))
}

// ── Wiersz różnicy „Layer 2" (rozliczenia poza fakturą) — JEDEN wzór ────────
// Dotąd Preview liczył go z bazy `kwota_brutto − suma pozycji XML`,
// a PelnaFaktura z `kwotaDoZaplaty − officialVatTable` — przy rozjeździe
// jeden pokazywał saldo, a drugi nie (AUDIT §3). Wspólna baza:
// doZaplaty (kwotaDoZaplaty z podglądu KSeF, fallback kwota_brutto karty)
// minus brutto oficjalnej tabeli VAT, z odjęciem jawnie wykazanych
// dodatkowychRozliczen. Różnice OBJAŚNIAMY, nigdy nie korygujemy (CLAUDE.md).
export interface Layer2Result {
  /** doZaplaty − brutto tabeli VAT (surowa różnica) */
  rozrachunkiDiff: number
  /** różnica po odjęciu jawnych dodatkowychRozliczen — to renderujemy */
  layer2Diff: number
  /** czy wiersz różnicy ma się pokazać (obie różnice > 2 gr) */
  showLayer2Row: boolean
  sumaDodatkowych: number
}

// Baza „do zapłaty" dla wiersza Layer 2 — JEDNO wyprowadzenie w OBU widokach
// (recenzja Fali 3: Preview miał fallback na kwota_brutto, Pełna liczyła
// z surowego 0 przy braku/zerze kwotaDoZaplaty — latentny rozjazd bliźniaków;
// w prod 17.08: 0 kart rozjechanych, 2 karty z doZaplaty=0 mają też brutto=0).
// Legalne 0 ORAZ brak/nieparsowalna wartość → fallback na kwota_brutto karty.
export function deriveDoZaplaty(kwotaDoZaplaty: unknown, kwotaBrutto: number | null | undefined): number {
  const parsed = parseXmlKwota(kwotaDoZaplaty)
  return parsed !== null && parsed !== 0 ? parsed : (kwotaBrutto ?? 0)
}

export function computeLayer2(
  doZaplaty: number,
  vatTableBrutto: number,
  dodatkoweRozliczenia: unknown[] | null | undefined
): Layer2Result {
  const rozliczenia = Array.isArray(dodatkoweRozliczenia) ? dodatkoweRozliczenia : []
  let sumaDodatkowych = 0
  for (const roz of rozliczenia as { kwota?: unknown; typ?: string }[]) {
    const parsed = parseXmlKwota(roz?.kwota)
    if (parsed !== null) {
      const isOdliczenie = roz?.typ?.toLowerCase().includes('odliczenie')
      sumaDodatkowych += parsed * (isOdliczenie ? -1 : 1)
    }
  }
  const rozrachunkiDiff = doZaplaty - vatTableBrutto
  const showLayer2 = Math.abs(rozrachunkiDiff) > 0.02
  const layer2Diff = rozliczenia.length > 0 ? rozrachunkiDiff - sumaDodatkowych : rozrachunkiDiff
  return {
    rozrachunkiDiff,
    layer2Diff,
    showLayer2Row: showLayer2 && Math.abs(layer2Diff) > 0.02,
    sumaDodatkowych,
  }
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
