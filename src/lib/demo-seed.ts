import { createSupabaseAdmin } from '@/lib/supabase/admin'
import demoData from '../../demo_faktury.json'

const DEMO_NIP = demoData.demo_client.nip

export async function resetDemo() {
  const supabase = createSupabaseAdmin()

  // Usuwamy z clients - powinno kaskadowo usunąć wszystko, jeśli są ustawione kaskady,
  // ale bezpieczniej jest usunąć ręcznie powiązane tabele.
  await supabase.from('faktury_pozycje').delete().eq('client_nip', DEMO_NIP)
  await supabase.from('exceptions_queue').delete().eq('client_nip', DEMO_NIP)
  await supabase.from('faktury').delete().eq('client_nip', DEMO_NIP)
  await supabase.from('client_pojazdy').delete().eq('client_nip', DEMO_NIP)
  await supabase.from('clients').delete().eq('nip', DEMO_NIP)
}

export async function seedDemo(): Promise<{ created: number, errors: string[] }> {
  const supabase = createSupabaseAdmin()
  const result = { created: 0, errors: [] as string[] }
  
  // 1. Upewnij się, że mamy czystą kartę
  await resetDemo()

  // 2. Dodanie klienta
  const { error: clientErr } = await supabase.from('clients').insert({
    nip: demoData.demo_client.nip,
    nazwa: demoData.demo_client.nazwa,
    nazwa_bazy_rachmistrz: 'DEMO_FIRMA',
    aktywny: true,
    pilot: false,
    auto_write_enabled: true,
    is_demo: demoData.demo_client.is_demo,
  })
  if (clientErr) {
    result.errors.push(`Błąd klienta: ${clientErr.message} ${clientErr.details || ''}`)
  }

  // 3. Dodanie pojazdu
  const { error: pojazdErr } = await supabase.from('client_pojazdy').insert({
    client_nip: DEMO_NIP,
    nr_rejestracyjny: demoData.demo_pojazd.nr_rejestracyjny,
    sposob_rozliczenia_enum: demoData.demo_pojazd.sposob_rozliczenia_enum,
    typ_napedu: demoData.demo_pojazd.typ_napedu,
    wartosc_nabycia: demoData.demo_pojazd.wartosc_nabycia,
  })
  if (pojazdErr) {
    result.errors.push(`Błąd pojazdu: ${pojazdErr.message} ${pojazdErr.details || ''}`)
  }

  // 4. Dodawanie faktur, pozycji i wyjątków
  for (const [fIndex, f] of demoData.faktury.entries()) {
    let hasError = false;
    
    // 4a. Exceptions queue - musi być pierwsza
    const { data: queueData, error: qErr } = await supabase.from('exceptions_queue').insert({
      client_nip: DEMO_NIP,
      status: f.status === 'booked' ? 'auto_created' : f.status,
      ai_confidence: f.ai_confidence || f.confidence_overall,
      ai_proponowany_opis: f.ai_proponowany_opis,
      ai_uzasadnienie: f.ai_uzasadnienie,
      confidence_reasons: f.confidence_reasons,
      is_potential_duplicate: f.is_potential_duplicate,
      duplicate_source: f.duplicate_source,
      ai_kwoty_per_kolumna: f.ai_kwoty_per_kolumna,
      zapis_vat_data: f.zapis_vat, // POPRAWKA: było ai_zapis_vat_data
      kpir_pojazdowe_data: f.kpir_pojazdowe_data, // bezposrednio z JSON
      pozycje_xml_full: f.pozycje_xml_full,
      ai_klasyfikacja_pozycji: f.ai_klasyfikacja_pozycji,
      // Denormalizowane pola
      zapis_id: 900000 + fIndex,
      ksiegowe_numer: f.ksiegowe_numer,
      numer_ksef: f.numer_ksef,
      nazwa_dostawcy: f.nazwa_dostawcy,
      nip_dostawcy: f.nip_dostawcy,
      kwota_brutto: f.kwota_brutto,
      typ_dokumentu: f.typ_dokumentu,
      data_wystawienia: f.data_wystawienia,
      data_sprzedazy: f.data_sprzedazy,
    }).select().single()

    if (qErr || !queueData) {
      result.errors.push(`Faktura #${fIndex + 1} (queue): ${qErr?.message} ${qErr?.details || ''}`)
      continue
    }

    // 4b. Faktury (z relacją legacy_queue_id)
    const { data: fakturaData, error: fErr } = await supabase.from('faktury').insert({
      client_nip: DEMO_NIP,
      legacy_queue_id: queueData.id,
      ddk_nr: 900000 + fIndex,
      ksiegowe_numer: f.ksiegowe_numer,
      numer_ksef: f.numer_ksef,
      nazwa_dostawcy: f.nazwa_dostawcy,
      nip_dostawcy: f.nip_dostawcy,
      nip_nabywcy: (f as any).nip_nabywcy || DEMO_NIP,
      typ_dokumentu: f.typ_dokumentu,
      data_wystawienia: f.data_wystawienia,
      data_sprzedazy: f.data_sprzedazy,
      kwota_brutto: f.kwota_brutto,
      status: f.status === 'booked' ? 'auto_created' : f.status,
      confidence_overall: f.confidence_overall,
      final_zapis_vat_data: f.zapis_vat,
      final_kwoty_per_kolumna: f.ai_kwoty_per_kolumna,
      ai_zapis_vat_data: f.zapis_vat, // TUTAJ ZOSTAJE ai_zapis_vat_data
      ai_kwoty_per_kolumna: f.ai_kwoty_per_kolumna,
    }).select().single()

    if (fErr || !fakturaData) {
      result.errors.push(`Faktura #${fIndex + 1} (faktury): ${fErr?.message} ${fErr?.details || ''}`)
      continue
    }

    // 4c. Pozycje faktury
    for (const [pIndex, p] of f.pozycje.entries()) {
      const { error: pErr } = await supabase.from('faktury_pozycje').insert({
        faktura_id: fakturaData.id,
        client_nip: DEMO_NIP,
        lp: p.lp,
        nazwa: p.nazwa,
        ilosc: p.ilosc,
        jednostka: p.jm,
        wartosc_netto: p.wartosc_netto,
        stawka_vat: p.stawkaVat,
        wartosc_brutto: p.wartosc_brutto,
        // Wypełniamy tylko ai_* - kolumny effective_* są wyliczane przez bazę z (final_*, ai_*)
        ai_kolumna_kpir: p.kolumna_kpir,
        ai_kup_status: p.kup_status,
        ai_vat_odliczalny: p.vat_odliczalny,
      })
      if (pErr) {
        result.errors.push(`Faktura #${fIndex + 1} poz #${pIndex + 1}: ${pErr.message} ${pErr.details || ''}`)
        hasError = true;
      }
    }
    
    if (!hasError) {
      result.created++;
    }
  }
  
  return result;
}
