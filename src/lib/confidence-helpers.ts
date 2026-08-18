// Confidence scoring helpers

export interface ConfidenceReason {
  dim: string;
  score: number;
  msg: string;
}

/**
 * Returns card border/bg classes based on confidence_overall score
 */
export function getConfidenceCardClasses(score: number | null | undefined): string {
  const s = score ?? 1.0;
  if (s >= 0.95) return 'border-green-200 bg-green-50/30';
  if (s >= 0.85) return 'border-emerald-200 bg-emerald-50/20';
  if (s >= 0.70) return 'border-yellow-200 bg-yellow-50/30';
  return 'border-red-200 bg-red-50/30';
}

/**
 * Returns badge color classes for a confidence score
 */
export function getConfidenceBadgeClasses(score: number | null | undefined): string {
  const s = score ?? 1.0;
  if (s >= 0.95) return 'bg-green-100 text-green-800';
  if (s >= 0.85) return 'bg-emerald-100 text-emerald-800';
  if (s >= 0.70) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

/**
 * Returns human-readable label for a confidence score
 */
export function getConfidenceLabel(score: number | null | undefined): string {
  const s = score ?? 1.0;
  if (s >= 0.95) return 'Idealna';
  if (s >= 0.85) return 'Pewna';
  if (s >= 0.70) return 'Do weryfikacji';
  return 'Wymaga uwagi';
}

/**
 * Count number of weak dimensions (score < 0.85)
 */
export function getWeakDimensionsCount(reasons: ConfidenceReason[] | null | undefined): number {
  if (!reasons || !Array.isArray(reasons)) return 0;
  return reasons.filter(r => r.score < 0.85).length;
}

/**
 * Sort reasons by score ascending (weakest first)
 */
export function sortReasonsByScore(reasons: ConfidenceReason[] | null | undefined): ConfidenceReason[] {
  if (!reasons || !Array.isArray(reasons)) return [];
  return [...reasons].sort((a, b) => a.score - b.score);
}

/**
 * Check if there are any vendor/date alarms for "Akceptuj mimo ostrzeżeń" button
 */
export function hasVendorAlarms(exception: {
  vendor_vat_active?: boolean | null;
  vendor_first_occurrence?: boolean;
  is_potential_duplicate?: boolean;
  date_anomaly?: string | null;
}): boolean {
  if (exception.vendor_vat_active === false) return true;
  if (exception.is_potential_duplicate) return true;
  if (exception.vendor_first_occurrence) return true;
  if (exception.date_anomaly) return true;
  return false;
}

/**
 * Etykiety AKTYWNYCH alarmów — dokładnie te same warunki co hasVendorAlarms
 * (jedno źródło: rozszerzając jeden, rozszerz drugi). Używane w komunikacie
 * dwustopniowego Entera (FakturaCard): pierwszy Enter przy alarmach nie
 * zatwierdza, tylko fokusuje przycisk i wymienia, CO jest nie tak.
 */
export function listVendorAlarmy(exception: {
  vendor_vat_active?: boolean | null;
  vendor_first_occurrence?: boolean;
  is_potential_duplicate?: boolean;
  date_anomaly?: string | null;
}): string[] {
  const alarmy: string[] = [];
  if (exception.vendor_vat_active === false) alarmy.push('kontrahent z nieaktywnym VAT');
  if (exception.is_potential_duplicate) alarmy.push('możliwy duplikat');
  if (exception.vendor_first_occurrence) alarmy.push('pierwsza faktura od tego dostawcy');
  if (exception.date_anomaly) alarmy.push(`anomalia daty (${exception.date_anomaly})`);
  return alarmy;
}

export { fakturaWymagaUwagi } from './faktura-uwaga';

