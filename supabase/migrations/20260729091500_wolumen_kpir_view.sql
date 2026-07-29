CREATE OR REPLACE VIEW fluinty.wolumen_kpir_view AS
SELECT
  client_nip,

  -- CZEKAJĄCE — bieżący snapshot, bez filtru czasowego
  COUNT(*) FILTER (WHERE status IN ('pending','pending_review')) AS czekajace,

  -- NOWE — created_at w okresie, status != 'skipped'
  COUNT(*) FILTER (WHERE status <> 'skipped' AND created_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS nowe_dzis,
  COUNT(*) FILTER (WHERE status <> 'skipped' AND created_at >= date_trunc('week', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS nowe_tydzien,
  COUNT(*) FILTER (WHERE status <> 'skipped' AND created_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS nowe_miesiac,
  COUNT(*) FILTER (WHERE status <> 'skipped') AS nowe_total,

  -- RĘCZNIE — status='auto_created', auto_created_at NOT NULL, resolved_by != 'fluinty_auto', wg auto_created_at
  COUNT(*) FILTER (WHERE status = 'auto_created' AND auto_created_at IS NOT NULL AND (resolved_by IS NULL OR resolved_by <> 'fluinty_auto') AND auto_created_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS reczne_dzis,
  COUNT(*) FILTER (WHERE status = 'auto_created' AND auto_created_at IS NOT NULL AND (resolved_by IS NULL OR resolved_by <> 'fluinty_auto') AND auto_created_at >= date_trunc('week', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS reczne_tydzien,
  COUNT(*) FILTER (WHERE status = 'auto_created' AND auto_created_at IS NOT NULL AND (resolved_by IS NULL OR resolved_by <> 'fluinty_auto') AND auto_created_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS reczne_miesiac,
  COUNT(*) FILTER (WHERE status = 'auto_created' AND auto_created_at IS NOT NULL AND (resolved_by IS NULL OR resolved_by <> 'fluinty_auto')) AS reczne_total,

  -- AUTO — status='auto_created', auto_created_at NOT NULL, resolved_by = 'fluinty_auto', wg auto_created_at
  COUNT(*) FILTER (WHERE status = 'auto_created' AND auto_created_at IS NOT NULL AND resolved_by = 'fluinty_auto' AND auto_created_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS auto_dzis,
  COUNT(*) FILTER (WHERE status = 'auto_created' AND auto_created_at IS NOT NULL AND resolved_by = 'fluinty_auto' AND auto_created_at >= date_trunc('week', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS auto_tydzien,
  COUNT(*) FILTER (WHERE status = 'auto_created' AND auto_created_at IS NOT NULL AND resolved_by = 'fluinty_auto' AND auto_created_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS auto_miesiac,
  COUNT(*) FILTER (WHERE status = 'auto_created' AND auto_created_at IS NOT NULL AND resolved_by = 'fluinty_auto') AS auto_total,

  -- EXTERNAL_BOOKED — wg auto_created_at jeśli present, else created_at
  COUNT(*) FILTER (WHERE status = 'external_booked' AND COALESCE(auto_created_at, created_at) >= date_trunc('day', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS ext_dzis,
  COUNT(*) FILTER (WHERE status = 'external_booked' AND COALESCE(auto_created_at, created_at) >= date_trunc('week', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS ext_tydzien,
  COUNT(*) FILTER (WHERE status = 'external_booked' AND COALESCE(auto_created_at, created_at) >= date_trunc('month', now() AT TIME ZONE 'Europe/Warsaw') AT TIME ZONE 'Europe/Warsaw') AS ext_miesiac,
  COUNT(*) FILTER (WHERE status = 'external_booked') AS ext_total

FROM fluinty.exceptions_queue
GROUP BY client_nip;
