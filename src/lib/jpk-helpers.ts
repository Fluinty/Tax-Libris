// JPK_V7 helpers — stałe i utility dla GTU, procedur, typów dokumentu

// ── GTU 1-13 ──────────────────────────────────────────────────────

export interface GtuEntry {
  num: number;
  bit: number;
  name: string;
  nameFull: string;
}

export const GTU_LIST: GtuEntry[] = [
  { num: 1,  bit: 1,    name: 'Alkohol',         nameFull: 'Alkohol etylowy, piwo, wino' },
  { num: 2,  bit: 2,    name: 'Paliwa',          nameFull: 'Paliwa silnikowe' },
  { num: 3,  bit: 4,    name: 'Oleje',           nameFull: 'Oleje opałowe i smarowe' },
  { num: 4,  bit: 8,    name: 'Tytoń',           nameFull: 'Wyroby tytoniowe' },
  { num: 5,  bit: 16,   name: 'Odpady',          nameFull: 'Odpady, złom' },
  { num: 6,  bit: 32,   name: 'Elektronika',     nameFull: 'Elektronika z zał. 15' },
  { num: 7,  bit: 64,   name: 'Pojazdy',         nameFull: 'Pojazdy i części samochodowe' },
  { num: 8,  bit: 128,  name: 'Metale',          nameFull: 'Metale szlachetne, jubilerstwo' },
  { num: 9,  bit: 256,  name: 'Leki',            nameFull: 'Leki refundowane' },
  { num: 10, bit: 512,  name: 'Nieruchomości',   nameFull: 'Budynki, budowle, grunty' },
  { num: 11, bit: 1024, name: 'Emisje CO2',      nameFull: 'Uprawnienia do emisji gazów cieplarn.' },
  { num: 12, bit: 2048, name: 'Usługi niemat.',  nameFull: 'Usługi doradcze, prawne, marketing' },
  { num: 13, bit: 4096, name: 'Transport',       nameFull: 'Usługi transportowe i magazynowe' },
];

export function bitmaskToGtuNums(bitmask: number): number[] {
  return GTU_LIST.filter(g => (bitmask & g.bit) !== 0).map(g => g.num);
}

export function gtuNumsToBitmask(nums: number[]): number {
  return GTU_LIST
    .filter(g => nums.includes(g.num))
    .reduce((acc, g) => acc | g.bit, 0);
}

export function toggleGtuBit(bitmask: number, gtuNum: number): number {
  const entry = GTU_LIST.find(g => g.num === gtuNum);
  if (!entry) return bitmask;
  return bitmask ^ entry.bit;
}

export function isGtuActive(bitmask: number, gtuNum: number): boolean {
  const entry = GTU_LIST.find(g => g.num === gtuNum);
  if (!entry) return false;
  return (bitmask & entry.bit) !== 0;
}

export function formatGtuBadgeList(bitmask: number): string[] {
  return GTU_LIST
    .filter(g => (bitmask & g.bit) !== 0)
    .map(g => `GTU_${String(g.num).padStart(2, '0')}`);
}


// ── Procedury JPK (bitmask) ───────────────────────────────────────

export interface ProceduraJpk {
  bit: number;
  kod: string;
  nazwa: string;
  frequent: boolean;  // TP, MK = true (na górze UI)
}

export const PROCEDURY_JPK_BITMASK: ProceduraJpk[] = [
  { bit: 4,    kod: 'TP',     nazwa: 'Powiązania między podmiotami',       frequent: true },
  { bit: 1024, kod: 'MK',     nazwa: 'Metoda kasowa VAT',                  frequent: true },
  { bit: 1,    kod: 'SW',     nazwa: 'Sprzedaż wysyłkowa zagraniczna',     frequent: false },
  { bit: 2,    kod: 'EE',     nazwa: 'Telekomunikacyjne / nadawcze',       frequent: false },
  { bit: 8,    kod: 'TT_WNT', nazwa: 'Transakcja trójstronna WNT',        frequent: false },
  { bit: 16,   kod: 'TT_D',   nazwa: 'Transakcja trójstronna dostawa',    frequent: false },
  { bit: 32,   kod: 'MR_T',   nazwa: 'Marża towarów używanych',            frequent: false },
  { bit: 64,   kod: 'MR_UZ',  nazwa: 'Marża antyki / dzieła sztuki',       frequent: false },
  { bit: 512,  kod: 'B_SPV',  nazwa: 'Bony jednego przeznaczenia',         frequent: false },
];

export function bitmaskToProceduryCodes(bitmask: number): string[] {
  return PROCEDURY_JPK_BITMASK
    .filter(p => (bitmask & p.bit) !== 0)
    .map(p => p.kod);
}

export function toggleProceduraBit(bitmask: number, bit: number): number {
  return bitmask ^ bit;
}

export function isProceduraActive(bitmask: number, bit: number): boolean {
  return (bitmask & bit) !== 0;
}


export function getProceduryJpkForTyp(typDokumentu: string | null): ProceduraJpk[] {
  if (typDokumentu === 'zakup') {
    return PROCEDURY_JPK_BITMASK.filter(p => ['TP', 'MK'].includes(p.kod));
  }
  // Dla sprzedaży zwracamy wszystkie (można rozbudować później o dokładną listę dla sprzedaży)
  return PROCEDURY_JPK_BITMASK;
}

// ── Typ dokumentu JPK (enum) ─────────────────────────────────────

export interface TypDokumentuJpk {
  value: number;
  kod: string;
  nazwa: string;
}

export const TYP_DOKUMENTU_JPK: TypDokumentuJpk[] = [
  { value: 0, kod: '',       nazwa: 'Brak oznaczenia (zwykła faktura)' },
  { value: 1, kod: 'FP',     nazwa: 'FP — Faktura do paragonu' },
  { value: 2, kod: 'RO',     nazwa: 'RO — Raport zbiorczy z kasy' },
  { value: 3, kod: 'WEW',    nazwa: 'WEW — Dokument wewnętrzny' },
  { value: 4, kod: 'IMP',    nazwa: 'IMP — Import towarów art. 33a' },
  { value: 5, kod: 'VAT_RR', nazwa: 'VAT_RR — Faktura od rolnika ryczałtowego' },
];

export function getTypDokumentuJpkForTyp(typDokumentu: string | null): TypDokumentuJpk[] {
  if (typDokumentu === 'zakup') {
    return TYP_DOKUMENTU_JPK.filter(t => [0, 3, 4, 5].includes(t.value)); // Brak, WEW, IMP, VAT_RR
  }
  // sprzedaz
  return TYP_DOKUMENTU_JPK.filter(t => [0, 1, 2, 3].includes(t.value)); // Brak, FP, RO, WEW
}

export function getTypDokumentuLabel(value: number | null | undefined): string {
  const entry = TYP_DOKUMENTU_JPK.find(t => t.value === (value ?? 0));
  return entry?.nazwa ?? 'Nieznany';
}


// ── Stawki VAT ────────────────────────────────────────────────────

export const STAWKI_VAT = ['23', '8', '5', '0', 'zw', 'np', 'oo'] as const;
export type StawkaVat = typeof STAWKI_VAT[number];

export function getStawkaLabel(stawka: string): string {
  if (['zw', 'np', 'oo'].includes(stawka)) return stawka.toUpperCase();
  return `${stawka}%`;
}


// ── GtuSource type ────────────────────────────────────────────────

export interface GtuSource {
  bit: number;
  gtu: number;
  source: 'keywords' | 'default' | 'ai' | 'manual';
  detail: string;
}
