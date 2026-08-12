/**
 * Wspólny parser liczb z pól formularza (polski zapis).
 *
 * Dlaczego nie parseFloat: parseFloat("123,45") -> 123 (grosze ucięte),
 * parseFloat("1 234,56") -> 1, parseFloat("12.34.56") -> 12.34 — każdy z tych
 * wyników trafiał dalej BEZ błędu i zaniżał kwoty księgowane do Rachmistrza
 * (audyt 2026-08, §4: FakturaCard/PozycjeVatSection/calc-expression).
 *
 * Zasady:
 * - usuwa białe znaki (\s w JS obejmuje też twardą spację U+00A0 i wąską
 *   U+202F) — separatory tysięcy z „1 234,56",
 * - przecinek dziesiętny -> kropka,
 * - CAŁOŚĆ musi być liczbą (regex ^-?\d+(\.\d+)?$) — „12.34.56", „12,34zł",
 *   „1e5" itp. to null, nigdy cicho ucięta wartość,
 * - zwraca null też dla pustych i nie-finite; wołający decyduje, czy null
 *   znaczy 0 (wyczyszczone pole), czy „czekaj na pełną liczbę" (stan
 *   przejściowy podczas pisania, np. „123," albo „-").
 */
export function parsePolishNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (raw == null) return null
  const cleaned = String(raw).replace(/\s/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}
