import { createSupabaseAdmin } from '@/lib/supabase/admin'
import demoData from '../../demo_faktury.json'

const DEMO_NIP = demoData.demo_client.nip

export async function resetDemo() {
  const supabase = createSupabaseAdmin()

  // 1. Pobranie IDków do usunięcia powiązanych eventów
  const { data: queueIds } = await supabase.schema('fluinty').from('exceptions_queue').select('id').eq('client_nip', DEMO_NIP)
  const { data: fakturaIds } = await supabase.schema('fluinty').from('faktury').select('id').eq('client_nip', DEMO_NIP)

  // Reset/seed CELOWO bez transakcyjności (AUDIT §4 wycenił RPC na L,
  // decyzja 17.08: nieproporcjonalne dla środowiska demo). Zamiast tego:
  // kolejność minimalizująca stan częściowy (dzieci przed rodzicami przy
  // usuwaniu, rodzice przed dziećmi przy seedzie — jest niżej), każdy krok
  // z jawnym błędem, a wszystkie operacje IDEMPOTENTNE — ponowny reset
  // zaczyna od zera i bezpiecznie domyka stan częściowy.
  const checkError = (step: string, error: any) => {
    if (error) {
      throw new Error(
        `Reset przerwany: nie można usunąć ${step} — ${error.message} ${error.details || ''}. ` +
        `Uruchom reset demo ponownie — operacje są idempotentne i dokończą czyszczenie.`
      )
    }
  }

  // 2. Usunięcie z faktura_events (3 filtry)
  if (queueIds && queueIds.length > 0) {
    const ids = queueIds.map(q => q.id)
    const { error } = await supabase.schema('fluinty').from('faktura_events').delete().in('queue_id', ids)
    checkError('faktura_events (po queue_id)', error)
  }

  if (fakturaIds && fakturaIds.length > 0) {
    const ids = fakturaIds.map(f => f.id)
    const { error } = await supabase.schema('fluinty').from('faktura_events').delete().in('faktura_id', ids)
    checkError('faktura_events (po faktura_id)', error)
  }

  const { error: evErr } = await supabase.schema('fluinty').from('faktura_events').delete().eq('client_nip', DEMO_NIP)
  checkError('faktura_events (po client_nip)', evErr)

  // 3. Usunięcie z anomalie_historii (jeśli istnieje, ignorujemy błąd braku tabeli)
  const { error: anomErr } = await supabase.schema('fluinty').from('anomalie_historii').delete().eq('client_nip', DEMO_NIP)
  if (anomErr) {
    const isTableMissing = anomErr.code === 'PGRST205' || anomErr.code === '42P01' || (anomErr.message && anomErr.message.includes('Could not find the table'))
    if (!isTableMissing) {
      checkError('anomalie_historii', anomErr)
    }
  }

  // 4. Kolejne tabele - ściśle po client_nip
  const { error: pozErr } = await supabase.schema('fluinty').from('faktury_pozycje').delete().eq('client_nip', DEMO_NIP)
  checkError('faktury_pozycje', pozErr)

  const { error: queueErr } = await supabase.schema('fluinty').from('exceptions_queue').delete().eq('client_nip', DEMO_NIP)
  checkError('exceptions_queue', queueErr)

  const { error: fakturyErr } = await supabase.schema('fluinty').from('faktury').delete().eq('client_nip', DEMO_NIP)
  checkError('faktury', fakturyErr)

  // 5. Dziennik zmian klienta (FK do clients) - czyscimy przed pojazdami;
  // tolerancja braku tabeli jak przy anomaliach (rozne srodowiska)
  const { error: logErr } = await supabase.schema('fluinty').from('client_changes_log').delete().eq('client_nip', DEMO_NIP)
  if (logErr) {
    const isTableMissing = logErr.code === 'PGRST205' || logErr.code === '42P01' || (logErr.message && logErr.message.includes('Could not find the table'))
    if (!isTableMissing) {
      checkError('client_changes_log', logErr)
    }
  }

  const { error: pojazdyErr } = await supabase.schema('fluinty').from('client_pojazdy').delete().eq('client_nip', DEMO_NIP)
  checkError('client_pojazdy', pojazdyErr)

  // ARCHITEKTURA (06.08): wiersza clients NIE kasujemy NIGDY - kazda nowa tabela
  // z FK do clients lamala reset (faktura_events -> anomalie -> client_changes_log).
  // Klient demo zyje na stale, seedDemo robi na nim upsert(onConflict: 'nip').
}

export async function seedDemo(): Promise<{ created: number, errors: string[] }> {
  const supabase = createSupabaseAdmin()
  const result = { created: 0, errors: [] as string[] }
  
  // 1. Upewnij się, że mamy czystą kartę
  try {
    await resetDemo()
  } catch (err: any) {
    result.errors.push(err.message)
    return result
  }

  // 2. Dodanie klienta (upsert jako pas bezpieczeństwa)
  const { error: clientErr } = await supabase.schema('fluinty').from('clients').upsert({
    nip: demoData.demo_client.nip,
    nazwa: demoData.demo_client.nazwa,
    nazwa_bazy_rachmistrz: 'DEMO_FIRMA',
    aktywny: true,
    pilot: false,
    // bramka: DEMO rozbrojone domyślnie — uzbrojenie tylko świadomie togglem (event audytowy)
    auto_write_enabled: false,
    is_demo: demoData.demo_client.is_demo,
  }, { onConflict: 'nip' })
  if (clientErr) {
    result.errors.push(`Błąd klienta: ${clientErr.message} ${clientErr.details || ''}`)
  }

  // 3. Dodanie pojazdu (sprawdzamy czy istnieje po client_nip i nr_rejestracyjny, by emulować upsert na złożonym kluczu)
  const { data: existingPojazd } = await supabase.schema('fluinty').from('client_pojazdy')
    .select('id')
    .eq('client_nip', DEMO_NIP)
    .eq('nr_rejestracyjny', demoData.demo_pojazd.nr_rejestracyjny)
    .maybeSingle()

  const pojazdPayload = {
    client_nip: DEMO_NIP,
    nr_rejestracyjny: demoData.demo_pojazd.nr_rejestracyjny,
    sposob_rozliczenia_enum: demoData.demo_pojazd.sposob_rozliczenia_enum,
    typ_napedu: demoData.demo_pojazd.typ_napedu,
    wartosc_nabycia: demoData.demo_pojazd.wartosc_nabycia,
  }

  let pojazdErr = null
  if (existingPojazd) {
    const { error } = await supabase.schema('fluinty').from('client_pojazdy').update(pojazdPayload).eq('id', existingPojazd.id)
    pojazdErr = error
  } else {
    const { error } = await supabase.schema('fluinty').from('client_pojazdy').insert(pojazdPayload)
    pojazdErr = error
  }
  
  if (pojazdErr) {
    result.errors.push(`Błąd pojazdu: ${pojazdErr.message} ${pojazdErr.details || ''}`)
  }

  // 4. Dodawanie faktur, pozycji i wyjątków
  for (const [fIndex, f] of demoData.faktury.entries()) {
    let hasError = false;
    
    // 4a. Exceptions queue - musi być pierwsza
    const { data: queueData, error: qErr } = await supabase.schema('fluinty').from('exceptions_queue').insert({
      client_nip: DEMO_NIP,
      status: f.status === 'booked' ? 'auto_created' : f.status,
      ai_confidence: f.ai_confidence || f.confidence_overall,
      confidence_overall: f.confidence_overall,
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
      // Pola v3.1 — weryfikacja kontrahenta, confidence, dane adresowe
      pozycja_xml: f.pozycja_xml,
      adres_sprzedawcy: f.adres_sprzedawcy,
      adres_nabywcy: f.adres_nabywcy,
      rachunek_z_faktury: f.rachunek_z_faktury,
      vendor_vat_active: f.vendor_vat_active,
      vendor_first_occurrence: f.vendor_first_occurrence,
      vendor_invoice_count: f.vendor_invoice_count,
      vendor_vat_checked_at: f.vendor_vat_checked_at,
      rachunek_match_status: f.rachunek_match_status,
      rachunek_match_reason: f.rachunek_match_reason,
    }).select('id').single()

    if (qErr || !queueData) {
      result.errors.push(`Faktura #${fIndex + 1} (queue): ${qErr?.message} ${qErr?.details || ''}`)
      continue
    }

    // 4b. Faktury (z relacją legacy_queue_id)
    const { data: fakturaData, error: fErr } = await supabase.schema('fluinty').from('faktury').insert({
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
      ai_proponowany_opis: f.ai_proponowany_opis,
      ai_uzasadnienie: f.ai_uzasadnienie,
      ai_confidence: f.ai_confidence || f.confidence_overall,
      confidence_reasons: f.confidence_reasons,
      vendor_vat_active: f.vendor_vat_active,
      vendor_vat_checked_at: f.vendor_vat_checked_at,
      vendor_first_occurrence: f.vendor_first_occurrence,
      vendor_invoice_count: f.vendor_invoice_count,
      is_potential_duplicate: f.is_potential_duplicate,
      rachunek_match_status: f.rachunek_match_status,
      // final_* WYŁĄCZNIE dla kart już zakończonych (seed odtwarza wtedy stan
      // po realnej decyzji). Karta pending/pending_review dostaje same ai_* —
      // kopiowanie ai→final łamało kontrakt „final tylko z realnej edycji"
      // (docs/DECISIONS.md) i zatruwało metrykę edycji w demo.
      ...(f.status === 'booked'
        ? { final_zapis_vat_data: f.zapis_vat, final_kwoty_per_kolumna: f.ai_kwoty_per_kolumna }
        : { final_zapis_vat_data: null, final_kwoty_per_kolumna: null }),
      ai_zapis_vat_data: f.zapis_vat, // TUTAJ ZOSTAJE ai_zapis_vat_data
      ai_kwoty_per_kolumna: f.ai_kwoty_per_kolumna,
    }).select('id').single()

    if (fErr || !fakturaData) {
      result.errors.push(`Faktura #${fIndex + 1} (faktury): ${fErr?.message} ${fErr?.details || ''}`)
      continue
    }

    // 4c. Pozycje faktury
    for (const [pIndex, p] of f.pozycje.entries()) {
      const { error: pErr } = await supabase.schema('fluinty').from('faktury_pozycje').insert({
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

  // Częściowy seed (część faktur weszła, część nie) = stan widoczny w UI,
  // ale w pełni naprawialny — komunikat mówi jak, zamiast zostawiać admina
  // z połowicznym demo bez instrukcji.
  if (result.errors.length > 0) {
    result.errors.push(
      'Środowisko demo może być niekompletne — uruchom reset demo ponownie ' +
      '(reset czyści wszystko i zasiewa od zera, operacja jest idempotentna).'
    )
  }

  return result;
}
