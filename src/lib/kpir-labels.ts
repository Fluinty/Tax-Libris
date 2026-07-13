/**
 * KPiR column display labels — wzór 2026 (19 kolumn zamiast 17)
 *
 * Od 1.01.2026 dodano kolumnę 3 (numer KSeF) i 5 (NIP kontrahenta),
 * przez co numery merytoryczne przesunęły się o +2 względem starej numeracji.
 *
 * Wewnętrznie system NADAL posługuje się starymi numerami (7/8/10/11/12/13)
 * jako identyfikatorami — tu zmieniamy WYŁĄCZNIE to, co widzi użytkownik.
 */

/** Mapowanie: wewnętrzny id kolumny → numer wyświetlany wg wzoru KPiR 2026 */
export const KPIR_DISPLAY_NUMBER: Record<number, number> = {
  7: 9,
  8: 10,
  10: 12,
  11: 13,
  12: 14,
  13: 15,
}

/** Pełne nazwy kolumn (po starym wewnętrznym id) */
const KPIR_NAMES: Record<number, string> = {
  7: 'Sprzedaż towarów i usług',
  8: 'Pozostałe przychody',
  10: 'Zakup towarów handlowych i materiałów',
  11: 'Koszty uboczne zakupu',
  12: 'Wynagrodzenia',
  13: 'Pozostałe wydatki',
}

/**
 * Pełna etykieta kolumny do wyświetlenia użytkownikowi.
 * @example kpirLabel(13) → "15 — Pozostałe wydatki"
 */
export function kpirLabel(id: number): string {
  const displayNum = KPIR_DISPLAY_NUMBER[id]
  const name = KPIR_NAMES[id]
  if (displayNum != null && name) return `${displayNum} — ${name}`
  if (displayNum != null) return `${displayNum}`
  return `${id}`
}

/**
 * Krótka etykieta kolumny.
 * @example kpirShort(13) → "kol. 15"
 */
export function kpirShort(id: number): string {
  const displayNum = KPIR_DISPLAY_NUMBER[id] ?? id
  return `kol. ${displayNum}`
}

/**
 * Sam numer wyświetlany (bez prefiksu "kol.").
 * @example kpirDisplayNum(13) → 15
 */
export function kpirDisplayNum(id: number): number {
  return KPIR_DISPLAY_NUMBER[id] ?? id
}
