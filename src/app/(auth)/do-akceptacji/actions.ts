'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mergeInlineEditsVat, mergeInlineEditsPojazd, roundKwoty } from '@/lib/merge-helpers'
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

// ── Oś czasu faktury: logowanie zdarzeń ──────────────────────
async function logFakturaEvent(
  supabase: any,
  fakturaId: number | null,
  queueId: number | null,
  clientNip: string,
  eventType: string,
  actor: string,
  payload: Record<string, unknown> = {}
) {
  if (!fakturaId && !queueId) return
  await supabase.from('faktura_events').insert({
    faktura_id: fakturaId,
    queue_id: queueId,
    client_nip: clientNip,
    event_type: eventType,
    actor,
    payload,
  })
}

// Build a diff object comparing final values vs AI originals.
// Returns null if nothing changed.
function buildEditDiff(
  exception: any,
  finalOpis: string | null,
  finalKwoty: Record<string, number> | null,
  finalVat: any | null,
  finalPojazd: any | null,
): Record<string, { z: unknown; na: unknown }> | null {
  const diff: Record<string, { z: unknown; na: unknown }> = {}

  // Opis
  const aiOpis = exception.ai_proponowany_opis
  if (finalOpis && aiOpis && finalOpis !== aiOpis) {
    diff['opis'] = { z: aiOpis, na: finalOpis }
  }

  // Kwoty KPiR
  const aiKwoty = exception.ai_kwoty_per_kolumna || {}
  if (finalKwoty) {
    const allKeys = new Set([...Object.keys(aiKwoty), ...Object.keys(finalKwoty)])
    for (const k of allKeys) {
      const z = aiKwoty[k] ?? 0
      const na = finalKwoty[k] ?? 0
      if (z !== na) diff[`kwota_${k}`] = { z, na }
    }
  }

  // Pozycje VAT edytowane
  if (exception.pozycje_vat_edited) {
    diff['pozycje_vat'] = { z: 'AI', na: 'edytowane' }
  }

  // GTU edytowane
  if (exception.gtu_edited_by_user) {
    diff['gtu'] = { z: exception.gtu_bitmask ?? null, na: exception.gtu_bitmask_final ?? null }
  }

  // Procedury JPK edytowane
  if (exception.jpk_procedury_edited) {
    diff['procedura_jpk'] = { z: exception.procedura_jpk ?? null, na: exception.procedura_jpk_final ?? null }
  }

  return Object.keys(diff).length > 0 ? diff : null
}

// Helper to resolve fakturaId, queueId and coalesced exception object
async function resolveExceptionIds(
  supabase: any,
  exceptionId: number
): Promise<{ fakturaId: number | null; queueId: number | null; exception: any; faktura: any; isDemo: boolean }> {
  // Deterministycznie, bez .or() - sekwencje id faktury i exceptions_queue nakladaja sie,
  // wiec .or(id.eq.X, legacy_queue_id.eq.X) potrafi zwrocic 2 wiersze i zepsuc maybeSingle().
  const FAKTURA_COLS = 'id, legacy_queue_id, final_kwoty_per_kolumna, ai_kwoty_per_kolumna, client_nip, clients(is_demo)'

  // 1. Priorytet: exceptionId to faktury.id (tak przekazuje karta po F4)
  let { data: faktura } = await supabase
    .from('faktury')
    .select(FAKTURA_COLS)
    .eq('id', exceptionId)
    .maybeSingle()

  // 2. Fallback: exceptionId to stare queue.id (wywolania z /wyjatki)
  if (!faktura) {
    const r = await supabase
      .from('faktury')
      .select(FAKTURA_COLS)
      .eq('legacy_queue_id', exceptionId)
      .maybeSingle()
    faktura = r.data
  }

  const fakturaId: number | null = faktura?.id ?? null
  // faktura po id, bez legacy -> nowy rekord, nie piszemy do queue;
  // faktury brak wcale -> exceptionId to czysty queue-id (bardzo stare rekordy)
  const queueId: number | null = faktura ? (faktura.legacy_queue_id ?? null) : exceptionId

  const { data: exception } = fakturaId
    ? await supabase.from('exceptions_queue_v2').select('*').eq('id', fakturaId).maybeSingle()
    : await supabase.from('exceptions_queue').select('*, clients(is_demo)').eq('id', queueId).maybeSingle()

  // Wyciąganie flagi is_demo z faktury (lub z exception dla starych wpisów)
  let isDemo = false
  if (faktura?.clients && !Array.isArray(faktura.clients)) {
    isDemo = Boolean((faktura.clients as any).is_demo)
  } else if (exception?.clients && !Array.isArray(exception.clients)) {
    isDemo = Boolean((exception.clients as any).is_demo)
  }

  return { fakturaId, queueId, exception, faktura, isDemo }
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

  const { fakturaId, queueId, exception, faktura, isDemo } = await resolveExceptionIds(supabase, exceptionId)

  if (!exception) {
    return { success: false, error: `Exception null dla id=${exceptionId}, supabase schema=${(supabase as any).rest?.schemaName || '?'}` }
  }

  // Pobierz pozycje faktury (sesja 33: 3-wymiarowa klasyfikacja) dla auto-korekty rodzaj_odliczenia
  const { data: pozycjeEditable } = fakturaId
    ? await supabase
        .from('faktury_pozycje')
        .select('effective_vat_odliczalny, effective_kup_status, stawka_vat, wartosc_netto, wartosc_brutto')
        .eq('faktura_id', fakturaId)
    : { data: [] as any[] }

  // KLUCZ: użyj final_kwoty_per_kolumna z fluinty.faktury (po triggerze)
  // Fallback do ai_kwoty jeśli Monika nie edytowała per-pozycja
  const kwotyDoZapisuRaw = faktura?.final_kwoty_per_kolumna ?? faktura?.ai_kwoty_per_kolumna ?? exception.ai_kwoty_per_kolumna
  const kwotyDoZapisu = kwotyDoZapisuRaw ? roundKwoty(kwotyDoZapisuRaw) : kwotyDoZapisuRaw

  // Scalenie inline edits (GTU, procedury, pozycje VAT, pojazd)
  const scalonyPojazd = mergeInlineEditsPojazd(exception, pozycjeEditable ?? [], kwotyDoZapisu)
  const scalonyVat = mergeInlineEditsVat(exception, pozycjeEditable ?? [], scalonyPojazd)

  const opisDoZapisu = overrideOpis || exception.ai_proponowany_opis

  const targetStatus = isDemo ? 'auto_created' : 'approved'

  // Update OBYDWU tabel - exceptions_queue (legacy worker) i faktury (nowa)
  if (queueId) {
    const { data: updatedQueue, error } = await supabase
      .from('exceptions_queue')
      .update({
        status: targetStatus,
        resolved_opis: opisDoZapisu,
        final_kwoty_per_kolumna: kwotyDoZapisu,
        final_zapis_vat_data: scalonyVat,
        final_kpir_pojazdowe_data: scalonyPojazd,
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('id', queueId)
      .in('status', ['pending_review', 'pending'])
      .select('id')

    if (error) {
      return { success: false, error: error.message }
    }
    if (!updatedQueue || updatedQueue.length === 0) {
      return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
    }
  }

  // Sync też do fluinty.faktury (audit + future migration off exceptions_queue)
  if (fakturaId) {
    await supabase
      .from('faktury')
      .update({
        status: targetStatus,
        final_opis: opisDoZapisu,
        final_kwoty_per_kolumna: kwotyDoZapisu,
        final_zapis_vat_data: scalonyVat,
        final_kpir_pojazdowe_data: scalonyPojazd,
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('id', fakturaId)
  }

  await logAudit(supabase, 'approved', exception.client_nip, exception.zapis_id ?? null, {
    exception_id: exceptionId,
    faktura_id: fakturaId,
    resolved_by: userEmail,
    opis: opisDoZapisu,
    kwoty: kwotyDoZapisu,
    zapis_vat: scalonyVat,
    source: faktura && 'final_kwoty_per_kolumna' in faktura && faktura.final_kwoty_per_kolumna ? 'monika_edits' : 'ai_default',
    type: 'ai_accepted',
    ...(isDemo ? { demo: true } : {})
  })

  // ── Oś czasu: edited → approved ──
  const diff1 = buildEditDiff(exception, opisDoZapisu, kwotyDoZapisu, scalonyVat, scalonyPojazd)
  if (diff1) await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'edited', userEmail, { diff: diff1 })
  if (exception.rezim_edited) {
    const aiRezim = exception.kpir_pojazdowe_data?.strategia ?? null
    await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'rezim_changed', userEmail, { z: aiRezim, na: scalonyPojazd?.strategia ?? null })
  }
  await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'approved', userEmail, { opis: opisDoZapisu, kwoty_final: kwotyDoZapisu ?? null })

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

  const { fakturaId, queueId, exception, isDemo } = await resolveExceptionIds(supabase, exceptionId)

  if (!exception) {
    return { success: false, error: 'Nie znaleziono faktury.' }
  }

  // Pobierz pozycje faktury dla auto-korekty rodzaj_odliczenia
  const { data: pozycjeEditable } = fakturaId
    ? await supabase
        .from('faktury_pozycje')
        .select('effective_vat_odliczalny, effective_kup_status, stawka_vat, wartosc_netto, wartosc_brutto')
        .eq('faktura_id', fakturaId)
    : { data: [] as any[] }

  const roundedKwoty = kwoty ? roundKwoty(kwoty) : kwoty
  const scalonyPojazd = mergeInlineEditsPojazd(exception, pozycjeEditable ?? [], roundedKwoty)
  const baseVat = mergeInlineEditsVat(exception, pozycjeEditable ?? [], scalonyPojazd)

  const targetStatus = isDemo ? 'auto_created' : 'approved'

  if (queueId) {
    const { data: updatedQueue, error } = await supabase
      .from('exceptions_queue')
      .update({
        status: targetStatus,
        resolved_opis: opis,
        final_kwoty_per_kolumna: roundedKwoty,
        final_zapis_vat_data: baseVat,
        final_kpir_pojazdowe_data: scalonyPojazd,
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('id', queueId)
      .in('status', ['pending_review', 'pending'])
      .select('id')

    if (error) {
      return { success: false, error: error.message }
    }
    if (!updatedQueue || updatedQueue.length === 0) {
      return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
    }
  }

  if (fakturaId) {
    await supabase
      .from('faktury')
      .update({
        status: targetStatus,
        final_opis: opis,
        final_kwoty_per_kolumna: roundedKwoty,
        final_zapis_vat_data: baseVat,
        final_kpir_pojazdowe_data: scalonyPojazd,
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('id', fakturaId)
  }

  await logAudit(supabase, 'approved_with_edit', exception.client_nip, exception.zapis_id ?? null, {
    exception_id: exceptionId,
    faktura_id: fakturaId,
    resolved_by: userEmail,
    opis,
    kwoty,
    type: 'manual_edit',
    ...(isDemo ? { demo: true } : {})
  })

  // ── Oś czasu: edited → approved ──
  const diff2 = buildEditDiff(exception, opis, roundedKwoty, baseVat, scalonyPojazd)
  if (diff2) await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'edited', userEmail, { diff: diff2 })
  if (exception.rezim_edited) {
    const aiRezim = exception.kpir_pojazdowe_data?.strategia ?? null
    await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'rezim_changed', userEmail, { z: aiRezim, na: scalonyPojazd?.strategia ?? null })
  }
  await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'approved', userEmail, { opis, kwoty_final: roundedKwoty ?? null })

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

  const { fakturaId, queueId, exception, isDemo } = await resolveExceptionIds(supabase, exceptionId)

  if (!exception) {
    return { success: false, error: 'Nie znaleziono faktury.' }
  }

  // Pobierz pozycje faktury dla auto-korekty rodzaj_odliczenia
  const { data: pozycjeEditable } = fakturaId
    ? await supabase
        .from('faktury_pozycje')
        .select('effective_vat_odliczalny, effective_kup_status, stawka_vat, wartosc_netto, wartosc_brutto')
        .eq('faktura_id', fakturaId)
    : { data: [] as any[] }

  const roundedKwoty = finalKwotyPerKolumna ? roundKwoty(finalKwotyPerKolumna) : finalKwotyPerKolumna

  // Scalenie inline edits z modal edits
  // Modal daje finalKwotyPerKolumna + finalZapisVatData + finalOpis
  // Ale GTU/procedury/pojazd mogą być z inline sections — trzeba scalić
  const scalonyPojazd = mergeInlineEditsPojazd(exception, pozycjeEditable ?? [], roundedKwoty)
  const baseVat = finalZapisVatData
    ? mergeInlineEditsVat({ ...exception, final_zapis_vat_data: finalZapisVatData }, pozycjeEditable ?? [], scalonyPojazd)
    : mergeInlineEditsVat(exception, pozycjeEditable ?? [], scalonyPojazd)

  const targetStatus = isDemo ? 'auto_created' : 'approved'

  if (queueId) {
    const { data: updatedQueue, error } = await supabase
      .from('exceptions_queue')
      .update({
        status: targetStatus,
        resolved_opis: finalOpis,
        final_kwoty_per_kolumna: roundedKwoty,
        final_zapis_vat_data: baseVat,
        final_kpir_pojazdowe_data: scalonyPojazd,
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('id', queueId)
      .in('status', ['pending_review', 'pending'])
      .select('id')

    if (error) {
      return { success: false, error: error.message }
    }
    if (!updatedQueue || updatedQueue.length === 0) {
      return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
    }
  }

  // Sync też do fluinty.faktury
  if (fakturaId) {
    await supabase
      .from('faktury')
      .update({
        status: targetStatus,
        final_opis: finalOpis,
        final_zapis_vat_data: baseVat,
        final_kpir_pojazdowe_data: scalonyPojazd,
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('id', fakturaId)
  }

  await logAudit(supabase, 'approved_with_full_edit', exception.client_nip, exception.zapis_id ?? null, {
    exception_id: exceptionId,
    faktura_id: fakturaId,
    resolved_by: userEmail,
    opis: finalOpis,
    kwoty: finalKwotyPerKolumna,
    zapis_vat: baseVat,
    type: 'manual_full_edit',
    ...(isDemo ? { demo: true } : {})
  })

  // ── Oś czasu: edited → approved ──
  const diff3 = buildEditDiff(exception, finalOpis, roundedKwoty, baseVat, scalonyPojazd)
  if (diff3) await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'edited', userEmail, { diff: diff3 })
  if (exception.rezim_edited) {
    const aiRezim = exception.kpir_pojazdowe_data?.strategia ?? null
    await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'rezim_changed', userEmail, { z: aiRezim, na: scalonyPojazd?.strategia ?? null })
  }
  await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'approved', userEmail, { opis: finalOpis, kwoty_final: roundedKwoty ?? null })

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
  
  const { fakturaId, queueId, exception } = await resolveExceptionIds(supabase, exceptionId)

  if (!exception) {
    return { success: false, error: 'Nie znaleziono faktury.' }
  }

  if (queueId) {
    const { error } = await supabase
      .from('exceptions_queue')
      .update({ final_zapis_vat_data: zapisVatData })
      .eq('id', queueId)
    if (error) return { success: false, error: error.message }
  }

  if (fakturaId) {
    const { error } = await supabase
      .from('faktury')
      .update({ final_zapis_vat_data: zapisVatData })
      .eq('id', fakturaId)
    if (error && !queueId) return { success: false, error: error.message }
  }

  await logAudit(supabase, 'update_final_zapis_vat', exception.client_nip, exception.zapis_id ?? null, {
    exception_id: exceptionId,
    faktura_id: fakturaId,
    user: userEmail,
    payload: { final_zapis_vat_data: zapisVatData }
  })

  revalidatePath('/do-akceptacji')
  return { success: true }
}

// ROZWIĄŻ WYJĄTEK (dla pending - brak propozycji AI)
export async function resolveException(exceptionId: number, opis: string, kwoty: Record<string, number> = {}, zapisVatData: any = null) {
  try {
    await assertCanWrite(exceptionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Brak uprawnień' }
  }

  const userEmail = await getUserEmail()
  const supabase = createSupabaseAdmin()

  const { fakturaId, queueId, exception } = await resolveExceptionIds(supabase, exceptionId)

  if (!exception) {
    return { success: false, error: 'Nie znaleziono faktury.' }
  }

  const { data: pozycjeEditable } = fakturaId
    ? await supabase
        .from('faktury_pozycje')
        .select('effective_vat_odliczalny, effective_kup_status, stawka_vat, wartosc_netto, wartosc_brutto')
        .eq('faktura_id', fakturaId)
    : { data: [] as any[] }

  const roundedKwoty = kwoty ? roundKwoty(kwoty) : kwoty
  const scalonyPojazd = mergeInlineEditsPojazd(exception, pozycjeEditable ?? [], roundedKwoty)
  const baseVat = zapisVatData
    ? mergeInlineEditsVat({ ...exception, final_zapis_vat_data: zapisVatData }, pozycjeEditable ?? [], scalonyPojazd)
    : mergeInlineEditsVat(exception, pozycjeEditable ?? [], scalonyPojazd)

  if (queueId) {
    const { data: updatedQueue, error } = await supabase
      .from('exceptions_queue')
      .update({
        status: 'resolved',
        resolved_opis: opis,
        final_kwoty_per_kolumna: roundedKwoty,
        final_zapis_vat_data: baseVat,
        final_kpir_pojazdowe_data: scalonyPojazd,
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('id', queueId)
      .in('status', ['pending_review', 'pending'])
      .select('id')

    if (error) {
      return { success: false, error: error.message }
    }
    if (!updatedQueue || updatedQueue.length === 0) {
      return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
    }
  }

  if (fakturaId) {
    await supabase
      .from('faktury')
      .update({
        status: 'resolved',
        final_opis: opis,
        final_kwoty_per_kolumna: roundedKwoty,
        final_zapis_vat_data: baseVat,
        final_kpir_pojazdowe_data: scalonyPojazd,
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('id', fakturaId)
  }

  await logAudit(supabase, 'resolved', exception.client_nip, exception.zapis_id ?? null, {
    exception_id: exceptionId,
    faktura_id: fakturaId,
    resolved_by: userEmail,
    opis,
    type: 'manual_resolve'
  })

  // ── Oś czasu: edited → approved ──
  const diff4 = buildEditDiff(exception, opis, roundedKwoty, baseVat, scalonyPojazd)
  if (diff4) await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'edited', userEmail, { diff: diff4 })
  if (exception.rezim_edited) {
    const aiRezim = exception.kpir_pojazdowe_data?.strategia ?? null
    await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'rezim_changed', userEmail, { z: aiRezim, na: scalonyPojazd?.strategia ?? null })
  }
  await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'approved', userEmail, { opis, kwoty_final: roundedKwoty ?? null })

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

  const { fakturaId, queueId, exception } = await resolveExceptionIds(supabase, exceptionId)

  if (!exception) {
    return { success: false, error: 'Nie znaleziono faktury.' }
  }

  if (queueId) {
    const { error } = await supabase
      .from('exceptions_queue')
      .update({
        status: 'ignored',
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('id', queueId)

    if (error) {
      return { success: false, error: error.message }
    }
  }

  if (fakturaId) {
    await supabase
      .from('faktury')
      .update({
        status: 'ignored',
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('id', fakturaId)
  }

  await logAudit(supabase, 'ignored', exception.client_nip, exception.zapis_id ?? null, {
    exception_id: exceptionId,
    faktura_id: fakturaId,
    resolved_by: userEmail
  })

  // ── Oś czasu: skipped ──
  await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'skipped', userEmail, { reason: 'panel', by: userEmail })

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

  const { exception } = await resolveExceptionIds(supabase, exceptionId)

  if (!exception || !exception.ai_proponowany_opis) {
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

  // ── Oś czasu: opis_added_to_list ──
  const { fakturaId: fId2, queueId: qId2 } = await resolveExceptionIds(supabase, exceptionId)
  await logFakturaEvent(supabase, fId2, qId2, exception.client_nip, 'opis_added_to_list', userEmail, { opis: opisT })

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
  'pojazd_id_final', 'rezim_paliwowy_final', 'rezim_edited',
  'ksieguj_jako_st',
  'final_kwoty_per_kolumna',
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

    const { fakturaId, queueId, exception } = await resolveExceptionIds(supabase, exceptionId)

    if (!exception) {
      return { success: false, error: 'Nie znaleziono faktury.' }
    }

    if (fakturaId) {
      const { error } = await supabase
        .from('faktury')
        .update(data)
        .eq('id', fakturaId)

      if (error && !queueId) return { success: false, error: error.message }
    }

    if (queueId) {
      const { error } = await supabase
        .from('exceptions_queue')
        .update(data)
        .eq('id', queueId)

      if (error && !fakturaId) return { success: false, error: error.message }
    }

    await logAudit(supabase, 'jpk_section_update', exception.client_nip, exception.zapis_id ?? null, {
      exception_id: exceptionId,
      faktura_id: fakturaId,
      fields: Object.keys(data),
      user: userEmail,
    })

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

    const { fakturaId, queueId, exception } = await resolveExceptionIds(supabase, exceptionId)

    if (!exception) {
      return { success: false, error: 'Nie znaleziono faktury.' }
    }

    if (fakturaId) {
      const { error } = await supabase
        .from('faktury')
        .update(fields)
        .eq('id', fakturaId)

      if (error && !queueId) return { success: false, error: error.message }
    }

    if (queueId) {
      const { error } = await supabase
        .from('exceptions_queue')
        .update(fields)
        .eq('id', queueId)

      if (error && !fakturaId) return { success: false, error: error.message }
    }

    await logAudit(supabase, 'jpk_section_reset', exception.client_nip, exception.zapis_id ?? null, {
      exception_id: exceptionId,
      faktura_id: fakturaId,
      section,
      user: userEmail,
    })

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
  // Deterministycznie: najpierw v2 po id (= faktury.id, tak przekazuje karta),
  // potem stare queue po id (wywolania legacy). Bez .or() - patrz resolveExceptionIds.
  const { data } = await supabase
    .from('exceptions_queue_v2')
    .select('status')
    .eq('id', exceptionId)
    .maybeSingle()
  if (data) return { status: data.status ?? null }

  const { data: queueData } = await supabase
    .from('exceptions_queue')
    .select('status')
    .eq('id', exceptionId)
    .maybeSingle()

  return { status: queueData?.status ?? null }
}

/**
 * Pobierz zdarzenia osi czasu faktury.
 */
export async function fetchFakturaEvents(params: { fakturaId?: number; queueId?: number }) {
  const { fakturaId, queueId } = params;
  if (!fakturaId && !queueId) return { events: [], error: 'Brak ID faktury' };

  const supabase = createSupabaseAdmin()
  
  let query = supabase
    .from('faktura_events')
    .select('id, event_type, actor, payload, created_at')
  
  if (fakturaId && queueId) {
    query = query.or(`faktura_id.eq.${fakturaId},queue_id.eq.${queueId}`)
  } else if (fakturaId) {
    query = query.eq('faktura_id', fakturaId)
  } else if (queueId) {
    query = query.eq('queue_id', queueId)
  }

  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return { events: [], error: error.message }
  return { events: data || [], error: null }
}
