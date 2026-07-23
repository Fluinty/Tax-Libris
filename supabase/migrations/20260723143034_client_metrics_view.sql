CREATE OR REPLACE VIEW fluinty.client_metrics_view AS
SELECT 
  client_nip,
  COUNT(*) FILTER (WHERE status IN ('pending', 'pending_review')) AS pending_count,
  COUNT(*) FILTER (WHERE status IN ('auto_created', 'resolved', 'approved', 'external_booked')) AS history_count,
  COUNT(*) FILTER (
    WHERE status IN ('auto_created', 'resolved', 'approved', 'external_booked') 
    AND (
      final_kwoty_per_kolumna IS NOT NULL 
      OR final_zapis_vat_data IS NOT NULL 
      OR pozycje_vat_edited = true 
      OR (resolved_opis IS NOT NULL AND resolved_opis IS DISTINCT FROM ai_proponowany_opis)
    )
  ) AS decisions_count
FROM fluinty.exceptions_queue
GROUP BY client_nip;
