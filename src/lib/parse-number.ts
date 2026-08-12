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

/**
 * Zaokrąglenie kwoty pieniężnej do 2 miejsc — jeden helper dla całego panelu.
 *
 * Dlaczego nie `Math.round(v * 100) / 100` (dotychczasowy wzorzec w
 * merge-helpers/vat/kpir/calc-expression):
 * - `null * 100 === 0`, więc brak wartości cicho stawał się zerową kwotą,
 *   a `NaN` przechodził dalej do zapisu (audyt 2026-08, §4 merge-helpers:163);
 * - mnożenie gubi grosz na wartościach typu 1.005 (`1.005 * 100` to w double
 *   100.49999999999999 → 1.00 zamiast 1.01);
 * - `Math.round` zaokrągla połówki ku +∞, więc kwoty ujemne (korekty) leciały
 *   w drugą stronę niż dodatnie (-1.005 → -1.00, gdy 1.005 → 1.01).
 *
 * Zwraca null dla wejścia, którego nie da się uznać za kwotę (null/undefined/
 * NaN/Infinity/tekst) — wołający decyduje, czy to błąd, czy pominięcie pozycji.
 */
export function roundKwota(value: unknown, decimals = 2): number | null {
  const num = typeof value === 'number' ? value : Number(value)
  if (value === null || value === undefined || value === '' || !Number.isFinite(num)) return null
  if (num === 0) return 0

  // Zaokrąglamy wartość bezwzględną i przywracamy znak — dzięki temu połówki
  // idą symetrycznie „od zera" dla dodatnich i ujemnych.
  const sign = num < 0 ? -1 : 1
  const abs = Math.abs(num)

  // Przesunięcie przecinka przez ponowne sparsowanie zapisu wykładniczego
  // (trik z MDN) zamiast mnożenia: "1.005e2" parsuje się do dokładnie 100.5,
  // podczas gdy 1.005 * 100 daje 100.49999999999999.
  const shifted = shiftExponent(abs, decimals)
  if (shifted === null) return sign * (Math.round(abs * 10 ** decimals) / 10 ** decimals)
  const back = shiftExponent(Math.round(shifted), -decimals)
  if (back === null) return sign * (Math.round(abs * 10 ** decimals) / 10 ** decimals)
  return sign * back
}

function shiftExponent(value: number, by: number): number | null {
  const [mantissa, exp] = String(value).split('e')
  const shifted = Number(`${mantissa}e${exp ? Number(exp) + by : by}`)
  return Number.isFinite(shifted) ? shifted : null
}
