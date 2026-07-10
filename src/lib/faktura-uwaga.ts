export function fakturaWymagaUwagi(exception: any): boolean {
  if (!exception) return false;

  const conf = typeof exception.confidence_overall === 'number'
    ? exception.confidence_overall
    : typeof exception.ai_confidence === 'number'
    ? exception.ai_confidence
    : 1.0;

  if (conf < 0.9) return true;
  if (exception.status === 'pending') return true;
  if (exception.is_potential_duplicate) return true;
  if (exception.vendor_vat_active === false) return true;
  if (Boolean(exception.date_anomaly)) return true;
  if (exception.rachunek_match_status === 'mismatch') return true;
  if (exception.srodek_trwaly_status === 'mocny_alert') return true;
  if (exception.wymaga_mpp) return true;
  if (Array.isArray(exception.anomalie_historii) && exception.anomalie_historii.length > 0) return true;
  if (Array.isArray(exception.walidator_usluga_warningi) && exception.walidator_usluga_warningi.length > 0) return true;
  if (Array.isArray(exception.walidator_kup_vat_warningi) && exception.walidator_kup_vat_warningi.length > 0) return true;

  return false;
}
