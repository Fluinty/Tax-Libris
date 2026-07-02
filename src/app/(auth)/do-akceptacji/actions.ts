'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mergeInlineEditsVat, mergeInlineEditsPojazd } from '@/lib/merge-helpers'
import { assertCanWrite } from '@/lib/auth-helpers'

// Helper to get authenticated user email
async function getUserEmail(): Promise<string> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email ?? 'system'
}

// Helper to log audit
async function logAudit(
  supabase: any,
  action: string,
  clientNip: string,
  zapisId: number | null,
  details: any
) {
  await supabase.from('audit_log').insert({
    action,
    client_nip: clientNip,
    zapis_id: zapisId,
    details,
  })
}

// ZATWIERDŹ (dla pending_review - pełna akceptacja tego co AI wymyśliło)
export async function approveFaktura(exceptionId: number, overrideOpis?: string) {
  try {
    await assertCanWrite(exceptionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Brak uprawnień' }
  }

  const userEmail = await getUserEmail()
  const supabase = createSupabaseAdmin()

  // Pobierz dane z fluinty.faktury (gdzie trigger przelicza final_kwoty_per_kolumna)
  const { data: faktura } = await supabase
    .from('faktury')
    .select('id, final_kwoty_per_kolumna, ai_kwoty_per_kolumna')
    .eq('legacy_queue_id', exceptionId)
    .maybeSingle()

  const { data: exception, error: fetchErr } = await supabase
    .from('exceptions_queue')
    .select('*')
    .eq('id', exceptionId)
    .maybeSingle()

  if (fetchErr) {
    return { success: false, error: `Fetch error: ${fetchErr.message} (code: ${fetchErr.code}, details: ${fetchErr.details})` }
  }

  if (!exception) {
    return { success: false, error: `Exception null dla id=${exceptionId}, supabase schema=${(supabase as any).rest?.schemaName || '?'}` }
  }

  // Pobierz pozycje faktury (sesja 33: 3-wymiarowa klasyfikacja) dla auto-korekty rodzaj_odliczenia
  const { data: pozycjeEditable } = faktura
    ? await supabase
        .from('faktury_pozycje')
        .select('effective_vat_odliczalny, effective_kup_status, stawka_vat, wartosc_netto, wartosc_brutto')
        .eq('faktura_id', faktura.id)
    : { data: [] as any[] }

  // Scalenie inline edits (GTU, procedury, pozycje VAT, pojazd)
  const scalonyPojazd = mergeInlineEditsPojazd(exception)
  const scalonyVat = mergeInlineEditsVat(exception, pozycjeEditable ?? [], scalonyPojazd)

  // KLUCZ: użyj final_kwoty_per_kolumna z fluinty.faktury (po triggerze)
  // Fallback do ai_kwoty jeśli Monika nie edytowała per-pozycja
  const kwotyDoZapisu = faktura?.final_kwoty_per_kolumna ?? faktura?.ai_kwoty_per_kolumna ?? exception.ai_kwoty_per_kolumna

  const opisDoZapisu = overrideOpis || exception.ai_proponowany_opis

  // Update OBYDWU tabel - exceptions_queue (legacy worker) i faktury (nowa)
  const { data: updatedQueue, error } = await supabase
    .from('exceptions_queue')
    .update({
      status: 'approved',
      resolved_opis: opisDoZapisu,
      final_kwoty_per_kolumna: kwotyDoZapisu,
      final_zapis_vat_data: scalonyVat,
      final_kpir_pojazdowe_data: scalonyPojazd,
      resolved_by: userEmail,
      resolved_at: new Date().toISOString()
    })
    .eq('id', exceptionId)
    .in('status', ['pending_review', 'pending'])
    .select('id')

  if (error) {
    return { success: false, error: error.message }
  }
  if (!updatedQueue || updatedQueue.length === 0) {
    return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
  }

  // Sync też do fluinty.faktury (audit + future migration off exceptions_queue)
  if (faktura) {
    await supabase
      .from('faktury')
      .update({
        status: 'approved',
        final_opis: opisDoZapisu,
        final_zapis_vat_data: scalonyVat,
        final_kpir_pojazdowe_data: scalonyPojazd,
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('legacy_queue_id', exceptionId)
  }

  await logAudit(supabase, 'approved', exception.client_nip, exception.zapis_id, {
    exception_id: exceptionId,
    faktura_id: faktura?.id,
    resolved_by: userEmail,
    opis: opisDoZapisu,
    kwoty: kwotyDoZapisu,
    zapis_vat: scalonyVat,
    source: faktura && 'final_kwoty_per_kolumna' in faktura && faktura.final_kwoty_per_kolumna ? 'monika_edits' : 'ai_default',
    type: 'ai_accepted'
  })

  revalidatePath('/do-akceptacji')
  return { success: true }
}

// ZATWIERDŹ Z EDYCJĄ (dla pending_review - gdy księgowa zmieni kwoty lub opis - WERSJA LEGACY)
export async function approveWithEdit(exceptionId: number, opis: string, kwoty: Record<string, number>) {
  try {
    await assertCanWrite(exceptionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Brak uprawnień' }
  }

  const userEmail = await getUserEmail()
  const supabase = createSupabaseAdmin()

  const { data: exception, error: fetchErr } = await supabase
    .from('exceptions_queue')
    .select('client_nip, zapis_id')
    .eq('id', exceptionId)
    .single()

  if (fetchErr || !exception) {
    return { success: false, error: 'Nie znaleziono faktury.' }
  }

  const { data: updatedQueue, error } = await supabase
    .from('exceptions_queue')
    .update({
      status: 'approved',
      resolved_opis: opis,
      final_kwoty_per_kolumna: kwoty,
      resolved_by: userEmail,
      resolved_at: new Date().toISOString()
    })
    .eq('id', exceptionId)
    .in('status', ['pending_review', 'pending'])
    .select('id')

  if (error) {
    return { success: false, error: error.message }
  }
  if (!updatedQueue || updatedQueue.length === 0) {
    return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
  }

  await logAudit(supabase, 'approved_with_edit', exception.client_nip, exception.zapis_id, {
    exception_id: exceptionId,
    resolved_by: userEmail,
    opis,
    kwoty,
    type: 'manual_edit'
  })

  revalidatePath('/do-akceptacji')
  return { success: true }
}

// ZATWIERDŹ Z EDYCJĄ PEŁNĄ (KPiR + VAT) z modalu
export async function approveExceptionFull(
  exceptionId: number,
  finalKwotyPerKolumna: Record<string, number>,
  finalZapisVatData: any,
  finalOpis: string
) {
  try {
    await assertCanWrite(exceptionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Brak uprawnień' }
  }

  const userEmail = await getUserEmail()
  const supabase = createSupabaseAdmin()

  const { data: faktura } = await supabase
    .from('faktury')
    .select('id')
    .eq('legacy_queue_id', exceptionId)
    .maybeSingle()

  const { data: exception, error: fetchErr } = await supabase
    .from('exceptions_queue')
    .select('*')
    .eq('id', exceptionId)
    .single()

  if (fetchErr || !exception) {
    return { success: false, error: 'Nie znaleziono faktury.' }
  }

  // Pobierz pozycje faktury dla auto-korekty rodzaj_odliczenia
  const { data: pozycjeEditable } = faktura
    ? await supabase
        .from('faktury_pozycje')
        .select('effective_vat_odliczalny, effective_kup_status, stawka_vat, wartosc_netto, wartosc_brutto')
        .eq('faktura_id', faktura.id)
    : { data: [] as any[] }

  // Scalenie inline edits z modal edits
  // Modal daje finalKwotyPerKolumna + finalZapisVatData + finalOpis
  // Ale GTU/procedury/pojazd mogą być z inline sections — trzeba scalić
  const scalonyPojazd = mergeInlineEditsPojazd(exception)
  const baseVat = finalZapisVatData
    ? mergeInlineEditsVat({ ...exception, final_zapis_vat_data: finalZapisVatData }, pozycjeEditable ?? [], scalonyPojazd)
    : mergeInlineEditsVat(exception, pozycjeEditable ?? [], scalonyPojazd)

  const { data: updatedQueue, error } = await supabase
    .from('exceptions_queue')
    .update({
      status: 'approved',
      resolved_opis: finalOpis,
      final_kwoty_per_kolumna: finalKwotyPerKolumna,
      final_zapis_vat_data: baseVat,
      final_kpir_pojazdowe_data: scalonyPojazd,
      resolved_by: userEmail,
      resolved_at: new Date().toISOString()
    })
    .eq('id', exceptionId)
    .in('status', ['pending_review', 'pending'])
    .select('id')

  if (error) {
    return { success: false, error: error.message }
  }
  if (!updatedQueue || updatedQueue.length === 0) {
    return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
  }

  // Sync też do fluinty.faktury
  if (faktura) {
    await supabase
      .from('faktury')
      .update({
        status: 'approved',
        final_opis: finalOpis,
        final_zapis_vat_data: baseVat,
        final_kpir_pojazdowe_data: scalonyPojazd,
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('legacy_queue_id', exceptionId)
  }

  await logAudit(supabase, 'approved_with_edit_full', exception.client_nip, exception.zapis_id, {
    exception_id: exceptionId,
    faktura_id: faktura?.id,
    resolved_by: userEmail,
    opis: finalOpis,
    kwoty: finalKwotyPerKolumna,
    zapis_vat: finalZapisVatData,
    type: 'manual_edit_full'
  })

  revalidatePath('/do-akceptacji')
  return { success: true }
}

// UPDATE ONLY VAT
export async function updateFinalZapisVAT(
  exceptionId: number,
  zapisVatData: any
) {
  try {
    await assertCanWrite(exceptionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Brak uprawnień' }
  }

  const userEmail = await getUserEmail()
  const supabase = createSupabaseAdmin()
  
  const { data: exception, error: fetchErr } = await supabase
    .from('exceptions_queue')
    .select('client_nip, zapis_id')
    .eq('id', exceptionId)
    .single()

  if (fetchErr || !exception) {
    return { success: false, error: 'Nie znaleziono faktury.' }
  }

  const { error } = await supabase
    .from('exceptions_queue')
    .update({ final_zapis_vat_data: zapisVatData })
    .eq('id', exceptionId);
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  await logAudit(supabase, 'update_final_zapis_vat', exception.client_nip, exception.zapis_id, {
    exception_id: exceptionId,
    user: userEmail,
    payload: { final_zapis_vat_data: zapisVatData }
  });
  
  revalidatePath('/do-akceptacji');
  return { success: true }
}

// ROZWIĄŻ WYJĄTEK (dla pending - brak propozycji AI)
export async function resolveException(exceptionId: number, opis: string) {
  try {
    await assertCanWrite(exceptionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Brak uprawnień' }
  }

  const userEmail = await getUserEmail()
  const supabase = createSupabaseAdmin()

  const { data: exception, error: fetchErr } = await supabase
    .from('exceptions_queue')
    .select('client_nip, zapis_id')
    .eq('id', exceptionId)
    .single()

  if (fetchErr || !exception) {
    return { success: false, error: 'Nie znaleziono faktury.' }
  }

  const { data: updatedQueue, error } = await supabase
    .from('exceptions_queue')
    .update({
      status: 'resolved',
      resolved_opis: opis,
      resolved_by: userEmail,
      resolved_at: new Date().toISOString()
    })
    .eq('id', exceptionId)
    .in('status', ['pending_review', 'pending'])
    .select('id')

  if (error) {
    return { success: false, error: error.message }
  }
  if (!updatedQueue || updatedQueue.length === 0) {
    return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
  }

  await logAudit(supabase, 'resolved', exception.client_nip, exception.zapis_id, {
    exception_id: exceptionId,
    resolved_by: userEmail,
    opis,
    type: 'manual_resolve'
  })

  revalidatePath('/do-akceptacji')
  return { success: true }
}

// POMIŃ
export async function ignoreFaktura(exceptionId: number) {
  try {
    await assertCanWrite(exceptionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Brak uprawnień' }
  }

  const userEmail = await getUserEmail()
  const supabase = createSupabaseAdmin()

  const { data: exception, error: fetchErr } = await supabase
    .from('exceptions_queue')
    .select('client_nip, zapis_id')
    .eq('id', exceptionId)
    .single()

  if (fetchErr || !exception) {
    return { success: false, error: 'Nie znaleziono faktury.' }
  }

  const { error } = await supabase
    .from('exceptions_queue')
    .update({
      status: 'ignored',
      resolved_by: userEmail,
      resolved_at: new Date().toISOString()
    })
    .eq('id', exceptionId)

  if (error) {
    return { success: false, error: error.message }
  }

  await logAudit(supabase, 'ignored', exception.client_nip, exception.zapis_id, {
    exception_id: exceptionId,
    resolved_by: userEmail
  })

  revalidatePath('/do-akceptacji')
  return { success: true }
}

// DODAJ PROPOZYCJĘ DO LISTY KLIENTA (reuse z sesji 5)
export async function addProponowanyToClientOpisy(exceptionId: number) {
  try {
    await assertCanWrite(exceptionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Brak uprawnień' }
  }

  const userEmail = await getUserEmail()
  const supabase = createSupabaseAdmin()

  const { data: exception, error: errFetch } = await supabase
    .from('exceptions_queue')
    .select('client_nip, ai_proponowany_opis, typ_dokumentu')
    .eq('id', exceptionId)
    .single()

  if (errFetch || !exception || !exception.ai_proponowany_opis) {
    return { success: false, error: 'Brak danych propozycji AI' }
  }

  const opisT = exception.ai_proponowany_opis.trim()
  const opisLower = opisT.toLowerCase()

  // Sprawdzamy czy opis istnieje u klienta
  const { data: existing } = await supabase
    .from('client_opisy')
    .select('id, aktywny, opis')
    .eq('client_nip', exception.client_nip)

  const found = existing?.find((e) => e.opis.toLowerCase() === opisLower)

  if (found) {
    if (!found.aktywny) {
      await supabase
        .from('client_opisy')
        .update({ aktywny: true, updated_at: new Date().toISOString() })
        .eq('id', found.id)
      
      await logAudit(supabase, 'opis_reactivated_from_ai', exception.client_nip, null, {
        opis: found.opis,
        user: userEmail,
        exception_id: exceptionId
      })
      return { success: true, message: 'Opis istniał, został aktywowany.' }
    }
    return { success: true, message: 'Opis był już aktywny.' }
  }

  // Insert nowej wartości
  const { error: errInsert } = await supabase
    .from('client_opisy')
    .insert({
      client_nip: exception.client_nip,
      opis: opisT,
      typ_dokumentu: exception.typ_dokumentu ?? 'zakup',
      aktywny: true,
      hit_count: 0,
      created_by: userEmail
    })

  if (errInsert) {
    return { success: false, error: errInsert.message }
  }

  await logAudit(supabase, 'opis_added_from_ai', exception.client_nip, null, {
    opis: opisT,
    user: userEmail,
    exception_id: exceptionId
  })

  return { success: true, message: 'Opis dodany poprawnie.' }
}


// ── SESJA 7: JPK Section Updates ──────────────────────────────────

const RESET_FIELDS: Record<string, Record<string, unknown>> = {
  vat: { pozycje_vat_final: null, pozycje_vat_edited: false },
  rezim: { rezim_paliwowy_final: null, pojazd_id_final: null, rezim_edited: false },
  procedury: { procedura_jpk_final: null, typ_dokumentu_jpk_final: null, jpk_procedury_edited: false },
  gtu: { gtu_bitmask_final: null, gtu_edited_by_user: false },
}

const ALLOWED_JPK_KEYS = [
  'gtu_bitmask_final', 'gtu_edited_by_user',
  'procedura_jpk_final', 'typ_dokumentu_jpk_final', 'jpk_procedury_edited',
  'pozycje_vat_final', 'pozycje_vat_edited',
  'pojazd_id_final', 'rezim_paliwowy_final', 'rezim_edited'
]

// Generic update for any JPK section — pass the exact columns to SET
export async function updateJpkSection(
  exceptionId: number,
  data: Record<string, unknown>
) {
  try {
    await assertCanWrite(exceptionId)
    for (const key of Object.keys(data)) {
      if (!ALLOWED_JPK_KEYS.includes(key)) {
        return { success: false, error: `Niedozwolony klucz: ${key}` }
      }
    }

    const userEmail = await getUserEmail()
    const supabase = createSupabaseAdmin()

    const { error } = await supabase
      .from('exceptions_queue')
      .update(data)
      .eq('id', exceptionId)

    if (error) return { success: false, error: error.message }

    // Audit
    const { data: exc } = await supabase
      .from('exceptions_queue')
      .select('client_nip')
      .eq('id', exceptionId)
      .single()

    if (exc) {
      await logAudit(supabase, 'jpk_section_update', exc.client_nip, null, {
        exception_id: exceptionId,
        fields: Object.keys(data),
        user: userEmail,
      })
    }

    revalidatePath('/do-akceptacji')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Nieznany błąd' }
  }
}

// Reset a JPK section back to AI defaults
export async function resetJpkSection(
  exceptionId: number,
  section: 'vat' | 'rezim' | 'procedury' | 'gtu'
) {
  try {
    await assertCanWrite(exceptionId)
    const fields = RESET_FIELDS[section]
    if (!fields) return { success: false, error: `Nieznana sekcja: ${section}` }

    const userEmail = await getUserEmail()
    const supabase = createSupabaseAdmin()

    const { error } = await supabase
      .from('exceptions_queue')
      .update(fields)
      .eq('id', exceptionId)

    if (error) return { success: false, error: error.message }

    const { data: exc } = await supabase
      .from('exceptions_queue')
      .select('client_nip')
      .eq('id', exceptionId)
      .single()

    if (exc) {
      await logAudit(supabase, 'jpk_section_reset', exc.client_nip, null, {
        exception_id: exceptionId,
        section,
        user: userEmail,
      })
    }

    revalidatePath('/do-akceptacji')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Nieznany błąd' }
  }
}

/**
 * Pre-check: sprawdź aktualny status faktury w exceptions_queue
 * PRZED zatwierdzeniem — wykrywa sytuację gdy ktoś zdążył zaksięgować/zatwierdzić.
 */
export async function checkExceptionStatus(exceptionId: number): Promise<{ status: string | null }> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from('exceptions_queue')
    .select('status')
    .eq('id', exceptionId)
    .maybeSingle()

  if (error) throw new Error(`Supabase error: ${error.message}`)
  return { status: data?.status ?? null }
}
