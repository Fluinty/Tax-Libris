'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mergeInlineEditsVat, mergeInlineEditsPojazd, roundKwoty } from '@/lib/merge-helpers'
import { assertCanWrite, getAllowedNips, assertNipReadAccess } from '@/lib/auth-helpers'

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
// Zwraca komunikat ostrzeżenia (albo null) — błąd zapisu zdarzenia NIE przerywa
// operacji głównej, ale nie znika po cichu: ląduje w console.error (logi Vercel)
// i jako pole `warning` w zwrotce akcji (toast.warning u konsumenta).
async function logFakturaEvent(
  supabase: any,
  fakturaId: number | null,
  queueId: number | null,
  clientNip: string,
  eventType: string,
  actor: string,
  payload: Record<string, unknown> = {}
): Promise<string | null> {
  if (!fakturaId && !queueId) return null
  const { error } = await supabase.from('faktura_events').insert({
    faktura_id: fakturaId,
    queue_id: queueId,
    client_nip: clientNip,
    event_type: eventType,
    actor,
    payload,
  })
  if (error) {
    const warning = `Nie zapisano zdarzenia ${eventType} (faktura_events): ${error.message}`
    console.error('[logFakturaEvent]', warning, { fakturaId, queueId, clientNip, actor })
    return warning
  }
  return null
}

// ── Baseline AI do diffu eventów i flag ──────────────────────
// exceptions_queue_v2 serwuje ai_kwoty_per_kolumna/ai_proponowany_opis wprost
// z tabeli faktury, gdzie bywają NULL — diff liczony z takim baseline'em miał
// `?? 0` po stronie "z" i logował event 'edited' przy każdym zatwierdzeniu
// z wysłanymi kwotami, także równymi propozycji AI (fantomy — patrz
// docs/AUDIT-flagi-vs-eventy.md). Gdy v2 daje NULL, dociągamy ai_* z
// exceptions_queue (tam worker je zapisuje).
// „Brak" baseline'u normalizujemy po obu źródłach: pusty obiekt {} i pusty
// string to też brak (v2 mogłoby je serwować zamiast NULL — kolumny w faktury
// pisze pipeline poza panelem, nie kontrolujemy inwariantu NULL-vs-{}).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function kwotyOrNull(o: any): Record<string, number> | null {
  return o != null && typeof o === 'object' && Object.keys(o).length > 0 ? o : null
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function opisOrNull(s: any): string | null {
  return typeof s === 'string' && s.trim() !== '' ? s : null
}

async function resolveAiBaseline(
  supabase: any,
  exception: any,
  queueId: number | null
): Promise<{
  aiKwoty: Record<string, number> | null
  aiOpis: string | null
  /** true = baseline kwot NIEROZSTRZYGNIĘTY przez błąd odczytu (nie mylić
   *  z legalnym „AI nie miało kwot") — diff nie może wtedy fabrykować z:0 */
  unresolved: boolean
  warning: string | null
}> {
  let aiKwoty = kwotyOrNull(exception.ai_kwoty_per_kolumna)
  let aiOpis = opisOrNull(exception.ai_proponowany_opis)
  let unresolved = false
  let warning: string | null = null
  if ((aiKwoty == null || aiOpis == null) && queueId) {
    const { data, error } = await supabase
      .from('exceptions_queue')
      .select('ai_kwoty_per_kolumna, ai_proponowany_opis')
      .eq('id', queueId)
      .maybeSingle()
    if (error) {
      unresolved = aiKwoty == null
      warning = `Nie odczytano baseline AI (exceptions_queue): ${error.message} — historia zmian i flagi edycji mogą być niedokładne`
      console.error('[resolveAiBaseline]', warning, { queueId })
    } else if (data) {
      aiKwoty = aiKwoty ?? kwotyOrNull(data.ai_kwoty_per_kolumna)
      aiOpis = aiOpis ?? opisOrNull(data.ai_proponowany_opis)
    }
  }
  return { aiKwoty, aiOpis, unresolved, warning }
}

// Tolerancja porównań kwot: wartości formularza przechodzą przez roundKwoty
// (2 miejsca), a baseline ai_* bywa surowy — różnice poniżej pół grosza to
// szum zaokrągleń, nie korekta księgowej. Realna korekta o 1 grosz (0.01)
// przechodzi.
const KWOTA_EPS = 0.005

// Build a diff object comparing final values vs AI originals (value-level).
// Returns null if nothing changed.
function buildEditDiff(
  exception: any,
  baseline: { aiKwoty: Record<string, number> | null; aiOpis: string | null; unresolved: boolean },
  finalOpis: string | null,
  finalKwoty: Record<string, number> | null,
  finalVat: any | null,
  finalPojazd: any | null,
): Record<string, { z: unknown; na: unknown }> | null {
  const diff: Record<string, { z: unknown; na: unknown }> = {}

  // Opis
  const aiOpis = (baseline.aiOpis ?? '').trim()
  const finOpis = (finalOpis ?? '').trim()
  if (finOpis && aiOpis && finOpis !== aiOpis) {
    diff['opis'] = { z: aiOpis, na: finOpis }
  }

  // Kwoty KPiR — porównanie wartościowe z epsilon; "z" to REALNA wartość AI.
  // Przy nierozstrzygniętym baselinie (błąd odczytu) z = null — event nie może
  // twierdzić, że AI proponowało 0, skoro tego nie wiemy.
  const aiKwoty = baseline.aiKwoty || {}
  if (finalKwoty) {
    const allKeys = new Set([...Object.keys(aiKwoty), ...Object.keys(finalKwoty)])
    for (const k of allKeys) {
      const z = Number(aiKwoty[k] ?? 0)
      const na = Number(finalKwoty[k] ?? 0)
      if (Math.abs(z - na) > KWOTA_EPS) diff[`kwota_${k}`] = { z: baseline.unresolved ? null : z, na }
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

// Whitelist kluczy z buildEditDiff, które dotyczą TYLKO opisu (nie są korektą księgową).
// Weryfikacja: buildEditDiff produkuje klucze: 'opis', 'kwota_${k}', 'pozycje_vat', 'gtu', 'procedura_jpk'.
const OPIS_ONLY_KEYS = new Set(['opis'])

// Oblicza flagi edycji na podstawie diffa, reżimu i pozycji VAT.
// edycja_realna  = cokolwiek zmienione (opis, kwoty, VAT, GTU, procedury, reżim, pozycje VAT)
// edycja_ksiegowa = jak wyżej, ALE BEZ zmian samego opisu
function computeEditFlags(
  diff: Record<string, { z: unknown; na: unknown }> | null,
  rezimEdited: boolean,
  pozycjeVatEdited: boolean,
): { edycja_realna: boolean; edycja_ksiegowa: boolean } {
  const hasDiff = diff !== null
  const edycja_realna = hasDiff || rezimEdited || pozycjeVatEdited

  const diffKeys = diff ? Object.keys(diff) : []
  const hasNonOpisChange = diffKeys.some(k => !OPIS_ONLY_KEYS.has(k))
  const edycja_ksiegowa = hasNonOpisChange || rezimEdited || pozycjeVatEdited

  return { edycja_realna, edycja_ksiegowa }
}

// Helper to resolve fakturaId, queueId and coalesced exception object.
// Zwrócony error != null oznacza BŁĄD ODCZYTU — konsument MUSI przerwać
// (return { success: false, error }), nic z pozostałych pól nie jest wiarygodne.
async function resolveExceptionIds(
  supabase: any,
  exceptionId: number
): Promise<{ fakturaId: number | null; queueId: number | null; exception: any; faktura: any; isDemo: boolean; error: string | null }> {
  // Deterministycznie, bez .or() - sekwencje id faktury i exceptions_queue nakladaja sie,
  // wiec .or(id.eq.X, legacy_queue_id.eq.X) potrafi zwrocic 2 wiersze i zepsuc maybeSingle().
  const FAKTURA_COLS = 'id, legacy_queue_id, final_kwoty_per_kolumna, ai_kwoty_per_kolumna, client_nip, clients(is_demo)'
  const fail = (error: string) =>
    ({ fakturaId: null, queueId: null, exception: null, faktura: null, isDemo: false, error })

  // 1. Priorytet: exceptionId to faktury.id (tak przekazuje karta po F4)
  const r1 = await supabase
    .from('faktury')
    .select(FAKTURA_COLS)
    .eq('id', exceptionId)
    .maybeSingle()
  if (r1.error) {
    return fail(`Błąd odczytu faktury (faktury, id=${exceptionId}): ${r1.error.message}`)
  }
  let faktura = r1.data

  // 2. Fallback: exceptionId to stare queue.id (wywolania z /wyjatki)
  if (!faktura) {
    const r2 = await supabase
      .from('faktury')
      .select(FAKTURA_COLS)
      .eq('legacy_queue_id', exceptionId)
      .maybeSingle()
    if (r2.error) {
      return fail(`Błąd odczytu faktury (faktury, legacy_queue_id=${exceptionId}): ${r2.error.message}`)
    }
    faktura = r2.data
  }

  const fakturaId: number | null = faktura?.id ?? null
  // faktura po id, bez legacy -> nowy rekord, nie piszemy do queue;
  // faktury brak wcale -> exceptionId to czysty queue-id (bardzo stare rekordy).
  // KRYTYCZNE: ten fallback wolno wziąć WYŁĄCZNIE przy data===null && error===null
  // (oba odczyty wyżej sprawdzone) — przejściowy błąd odczytu zamieniałby
  // faktury.id w queue.id i kolejny UPDATE mógłby zatwierdzić CUDZĄ kartę.
  const queueId: number | null = faktura ? (faktura.legacy_queue_id ?? null) : exceptionId

  const excRes = fakturaId
    ? await supabase.from('exceptions_queue_v2').select('*').eq('id', fakturaId).maybeSingle()
    : await supabase.from('exceptions_queue').select('*, clients(is_demo)').eq('id', queueId).maybeSingle()
  if (excRes.error) {
    const table = fakturaId ? 'exceptions_queue_v2' : 'exceptions_queue'
    return fail(`Błąd odczytu karty (${table}, id=${fakturaId ?? queueId}): ${excRes.error.message}`)
  }
  const exception = excRes.data

  // Wyciąganie flagi is_demo z faktury (lub z exception dla starych wpisów)
  let isDemo = false
  if (faktura?.clients && !Array.isArray(faktura.clients)) {
    isDemo = Boolean((faktura.clients as any).is_demo)
  } else if (exception?.clients && !Array.isArray(exception.clients)) {
    isDemo = Boolean((exception.clients as any).is_demo)
  }

  return { fakturaId, queueId, exception, faktura, isDemo, error: null }
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

  const { fakturaId, queueId, exception, faktura, isDemo, error: resolveError } = await resolveExceptionIds(supabase, exceptionId)
  if (resolveError) {
    return { success: false, error: resolveError }
  }

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
  // ALE: jeśli reżim był edytowany i kwoty zostały wyczyszczone (inline save → null),
  // zachowaj null — worker (S47) przeliczy z klasyfikacji
  const rezimClearedKwoty = exception.rezim_edited === true && faktura?.final_kwoty_per_kolumna == null
  const kwotyDoZapisuRaw = rezimClearedKwoty
    ? null
    : (faktura?.final_kwoty_per_kolumna ?? faktura?.ai_kwoty_per_kolumna ?? exception.ai_kwoty_per_kolumna)
  const kwotyDoZapisu = kwotyDoZapisuRaw ? roundKwoty(kwotyDoZapisuRaw) : kwotyDoZapisuRaw

  // Scalenie inline edits (GTU, procedury, pozycje VAT, pojazd)
  const scalonyPojazd = mergeInlineEditsPojazd(exception, pozycjeEditable ?? [], kwotyDoZapisu)
  const scalonyVat = mergeInlineEditsVat(exception, pozycjeEditable ?? [], scalonyPojazd)

  const opisDoZapisu = overrideOpis || exception.ai_proponowany_opis

  const targetStatus = isDemo ? 'auto_created' : 'approved'

  // ── Oblicz diff i flagi edycji PRZED zapisem ──
  const baseline1 = await resolveAiBaseline(supabase, exception, queueId)
  const diff1 = buildEditDiff(exception, baseline1, opisDoZapisu, kwotyDoZapisu, scalonyVat, scalonyPojazd)
  const editFlags = computeEditFlags(diff1, !!exception.rezim_edited, !!exception.pozycje_vat_edited)

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
        resolved_at: new Date().toISOString(),
        edycja_realna: editFlags.edycja_realna,
        edycja_ksiegowa: editFlags.edycja_ksiegowa,
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
        resolved_at: new Date().toISOString(),
        edycja_realna: editFlags.edycja_realna,
        edycja_ksiegowa: editFlags.edycja_ksiegowa,
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
  const eventWarnings: (string | null)[] = [baseline1.warning]
  if (diff1) eventWarnings.push(await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'edited', userEmail, { diff: diff1 }))
  if (exception.rezim_edited) {
    const aiRezim = exception.kpir_pojazdowe_data?.strategia ?? null
    eventWarnings.push(await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'rezim_changed', userEmail, { z: aiRezim, na: scalonyPojazd?.strategia ?? null }))
  }
  eventWarnings.push(await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'approved', userEmail, { opis: opisDoZapisu, kwoty_final: kwotyDoZapisu ?? null }))

  revalidatePath('/do-akceptacji')
  return { success: true, warning: eventWarnings.filter(Boolean).join('; ') || undefined }
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

  const { fakturaId, queueId, exception, isDemo, error: resolveError } = await resolveExceptionIds(supabase, exceptionId)
  if (resolveError) {
    return { success: false, error: resolveError }
  }

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

  // ── Oblicz diff i flagi edycji PRZED zapisem ──
  const baseline2 = await resolveAiBaseline(supabase, exception, queueId)
  const diff2 = buildEditDiff(exception, baseline2, opis, roundedKwoty, baseVat, scalonyPojazd)
  const editFlags = computeEditFlags(diff2, !!exception.rezim_edited, !!exception.pozycje_vat_edited)

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
        resolved_at: new Date().toISOString(),
        edycja_realna: editFlags.edycja_realna,
        edycja_ksiegowa: editFlags.edycja_ksiegowa,
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
        resolved_at: new Date().toISOString(),
        edycja_realna: editFlags.edycja_realna,
        edycja_ksiegowa: editFlags.edycja_ksiegowa,
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
  const eventWarnings: (string | null)[] = [baseline2.warning]
  if (diff2) eventWarnings.push(await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'edited', userEmail, { diff: diff2 }))
  if (exception.rezim_edited) {
    const aiRezim = exception.kpir_pojazdowe_data?.strategia ?? null
    eventWarnings.push(await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'rezim_changed', userEmail, { z: aiRezim, na: scalonyPojazd?.strategia ?? null }))
  }
  eventWarnings.push(await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'approved', userEmail, { opis, kwoty_final: roundedKwoty ?? null }))

  revalidatePath('/do-akceptacji')
  return { success: true, warning: eventWarnings.filter(Boolean).join('; ') || undefined }
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

  const { fakturaId, queueId, exception, isDemo, error: resolveError } = await resolveExceptionIds(supabase, exceptionId)
  if (resolveError) {
    return { success: false, error: resolveError }
  }

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

  // ── Oblicz diff i flagi edycji PRZED zapisem ──
  const baseline3 = await resolveAiBaseline(supabase, exception, queueId)
  const diff3 = buildEditDiff(exception, baseline3, finalOpis, roundedKwoty, baseVat, scalonyPojazd)
  const editFlags = computeEditFlags(diff3, !!exception.rezim_edited, !!exception.pozycje_vat_edited)

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
        resolved_at: new Date().toISOString(),
        edycja_realna: editFlags.edycja_realna,
        edycja_ksiegowa: editFlags.edycja_ksiegowa,
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
        resolved_at: new Date().toISOString(),
        edycja_realna: editFlags.edycja_realna,
        edycja_ksiegowa: editFlags.edycja_ksiegowa,
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
  const eventWarnings: (string | null)[] = [baseline3.warning]
  if (diff3) eventWarnings.push(await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'edited', userEmail, { diff: diff3 }))
  if (exception.rezim_edited) {
    const aiRezim = exception.kpir_pojazdowe_data?.strategia ?? null
    eventWarnings.push(await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'rezim_changed', userEmail, { z: aiRezim, na: scalonyPojazd?.strategia ?? null }))
  }
  eventWarnings.push(await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'approved', userEmail, { opis: finalOpis, kwoty_final: roundedKwoty ?? null }))

  revalidatePath('/do-akceptacji')
  return { success: true, warning: eventWarnings.filter(Boolean).join('; ') || undefined }
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
  
  const { fakturaId, queueId, exception, error: resolveError } = await resolveExceptionIds(supabase, exceptionId)
  if (resolveError) {
    return { success: false, error: resolveError }
  }

  if (!exception) {
    return { success: false, error: 'Nie znaleziono faktury.' }
  }

  // Guard statusu + jawny błąd KTÓREGOKOLWIEK z dwóch zapisów. Wcześniej
  // `if (error && !queueId)` połykał nieudany zapis, a bez warunku statusu można
  // było nadpisać final_* karty już zaksięgowanej (worker księguje z tych pól).
  if (queueId) {
    const { data: updatedQueue, error } = await supabase
      .from('exceptions_queue')
      .update({ final_zapis_vat_data: zapisVatData })
      .eq('id', queueId)
      .in('status', ['pending', 'pending_review'])
      .select('id')
    if (error) return { success: false, error: `Błąd zapisu VAT (exceptions_queue): ${error.message}` }
    if (!updatedQueue || updatedQueue.length === 0) {
      return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
    }
  }

  if (fakturaId) {
    const { data: updatedFaktura, error } = await supabase
      .from('faktury')
      .update({ final_zapis_vat_data: zapisVatData })
      .eq('id', fakturaId)
      .in('status', ['pending', 'pending_review'])
      .select('id')
    if (error) return { success: false, error: `Błąd zapisu VAT (faktury): ${error.message}` }
    if (!updatedFaktura || updatedFaktura.length === 0) {
      return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
    }
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

  const { fakturaId, queueId, exception, isDemo, error: resolveError } = await resolveExceptionIds(supabase, exceptionId)
  if (resolveError) {
    return { success: false, error: resolveError }
  }

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

  // Demo nie ma workera — jak w approve* karta od razu dostaje status końcowy
  // 'auto_created' (status 'resolved' nie występuje w prod i karta demo by utknęła).
  const targetStatus = isDemo ? 'auto_created' : 'resolved'

  // ── Oblicz diff i flagi edycji PRZED zapisem ──
  const baseline4 = await resolveAiBaseline(supabase, exception, queueId)
  const diff4 = buildEditDiff(exception, baseline4, opis, roundedKwoty, baseVat, scalonyPojazd)
  const editFlags = computeEditFlags(diff4, !!exception.rezim_edited, !!exception.pozycje_vat_edited)

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
        resolved_at: new Date().toISOString(),
        edycja_realna: editFlags.edycja_realna,
        edycja_ksiegowa: editFlags.edycja_ksiegowa,
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
        resolved_at: new Date().toISOString(),
        edycja_realna: editFlags.edycja_realna,
        edycja_ksiegowa: editFlags.edycja_ksiegowa,
      })
      .eq('id', fakturaId)
  }

  await logAudit(supabase, 'resolved', exception.client_nip, exception.zapis_id ?? null, {
    exception_id: exceptionId,
    faktura_id: fakturaId,
    resolved_by: userEmail,
    opis,
    type: 'manual_resolve',
    ...(isDemo ? { demo: true } : {})
  })

  // ── Oś czasu: edited → approved ──
  const eventWarnings: (string | null)[] = [baseline4.warning]
  if (diff4) eventWarnings.push(await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'edited', userEmail, { diff: diff4 }))
  if (exception.rezim_edited) {
    const aiRezim = exception.kpir_pojazdowe_data?.strategia ?? null
    eventWarnings.push(await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'rezim_changed', userEmail, { z: aiRezim, na: scalonyPojazd?.strategia ?? null }))
  }
  eventWarnings.push(await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'approved', userEmail, { opis, kwoty_final: roundedKwoty ?? null }))

  revalidatePath('/do-akceptacji')
  return { success: true, warning: eventWarnings.filter(Boolean).join('; ') || undefined }
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

  const { fakturaId, queueId, exception, error: resolveError } = await resolveExceptionIds(supabase, exceptionId)
  if (resolveError) {
    return { success: false, error: resolveError }
  }

  if (!exception) {
    return { success: false, error: 'Nie znaleziono faktury.' }
  }

  // Guard statusu na OBU tabelach — Escape na karcie, którą ktoś zdążył
  // zatwierdzić/zaksięgować, nie może nadpisać statusu na 'ignored'
  // (Rachmistrz miałby zapis, a panel mówiłby „pominięto").
  if (queueId) {
    const { data: updatedQueue, error } = await supabase
      .from('exceptions_queue')
      .update({
        status: 'ignored',
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('id', queueId)
      .in('status', ['pending', 'pending_review'])
      .select('id')

    if (error) {
      return { success: false, error: `Błąd pomijania (exceptions_queue): ${error.message}` }
    }
    if (!updatedQueue || updatedQueue.length === 0) {
      return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
    }
  }

  if (fakturaId) {
    const { data: updatedFaktura, error } = await supabase
      .from('faktury')
      .update({
        status: 'ignored',
        resolved_by: userEmail,
        resolved_at: new Date().toISOString()
      })
      .eq('id', fakturaId)
      .in('status', ['pending', 'pending_review'])
      .select('id')

    if (error) {
      return { success: false, error: `Błąd pomijania (faktury): ${error.message}` }
    }
    if (!updatedFaktura || updatedFaktura.length === 0) {
      return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
    }
  }

  await logAudit(supabase, 'ignored', exception.client_nip, exception.zapis_id ?? null, {
    exception_id: exceptionId,
    faktura_id: fakturaId,
    resolved_by: userEmail
  })

  // ── Oś czasu: skipped ──
  const skipWarning = await logFakturaEvent(supabase, fakturaId, queueId, exception.client_nip, 'skipped', userEmail, { reason: 'panel', by: userEmail })

  revalidatePath('/do-akceptacji')
  return { success: true, warning: skipWarning ?? undefined }
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

  const { exception, error: resolveError } = await resolveExceptionIds(supabase, exceptionId)
  if (resolveError) {
    return { success: false, error: resolveError }
  }

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
  // Błąd ponownego rozwiązania id nie cofa dodanego opisu — jak w logFakturaEvent
  // ląduje jako warning (toast), nie jako porażka całej akcji.
  const resolved2 = await resolveExceptionIds(supabase, exceptionId)
  const opisWarning = resolved2.error
    ? `Nie zapisano zdarzenia opis_added_to_list: ${resolved2.error}`
    : await logFakturaEvent(supabase, resolved2.fakturaId, resolved2.queueId, exception.client_nip, 'opis_added_to_list', userEmail, { opis: opisT })

  return { success: true, message: 'Opis dodany poprawnie.', warning: opisWarning ?? undefined }
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

    const { fakturaId, queueId, exception, error: resolveError } = await resolveExceptionIds(supabase, exceptionId)
    if (resolveError) {
      return { success: false, error: resolveError }
    }

    if (!exception) {
      return { success: false, error: 'Nie znaleziono faktury.' }
    }

    // Guard statusu + jawny błąd KTÓREGOKOLWIEK z dwóch zapisów. Wcześniej
    // `if (error && !queueId)`/`(error && !fakturaId)` połykały nieudany zapis
    // (księgowa myślała, że zmieniła GTU/VAT/reżim — a księgowała się stara
    // wartość), a bez warunku statusu można było nadpisać final_* karty już
    // zaksięgowanej.
    if (fakturaId) {
      const { data: updatedFaktura, error } = await supabase
        .from('faktury')
        .update(data)
        .eq('id', fakturaId)
        .in('status', ['pending', 'pending_review'])
        .select('id')

      if (error) return { success: false, error: `Błąd zapisu sekcji (faktury): ${error.message}` }
      if (!updatedFaktura || updatedFaktura.length === 0) {
        return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
      }
    }

    if (queueId) {
      const { data: updatedQueue, error } = await supabase
        .from('exceptions_queue')
        .update(data)
        .eq('id', queueId)
        .in('status', ['pending', 'pending_review'])
        .select('id')

      if (error) return { success: false, error: `Błąd zapisu sekcji (exceptions_queue): ${error.message}` }
      if (!updatedQueue || updatedQueue.length === 0) {
        return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
      }
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

    const { fakturaId, queueId, exception, error: resolveError } = await resolveExceptionIds(supabase, exceptionId)
    if (resolveError) {
      return { success: false, error: resolveError }
    }

    if (!exception) {
      return { success: false, error: 'Nie znaleziono faktury.' }
    }

    // Guard statusu + jawny błąd KTÓREGOKOLWIEK z dwóch zapisów (jak w
    // updateJpkSection — reset sekcji to też zapis do pól, z których worker księguje).
    if (fakturaId) {
      const { data: updatedFaktura, error } = await supabase
        .from('faktury')
        .update(fields)
        .eq('id', fakturaId)
        .in('status', ['pending', 'pending_review'])
        .select('id')

      if (error) return { success: false, error: `Błąd resetu sekcji (faktury): ${error.message}` }
      if (!updatedFaktura || updatedFaktura.length === 0) {
        return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
      }
    }

    if (queueId) {
      const { data: updatedQueue, error } = await supabase
        .from('exceptions_queue')
        .update(fields)
        .eq('id', queueId)
        .in('status', ['pending', 'pending_review'])
        .select('id')

      if (error) return { success: false, error: `Błąd resetu sekcji (exceptions_queue): ${error.message}` }
      if (!updatedQueue || updatedQueue.length === 0) {
        return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
      }
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
  // Publiczny endpoint POST — bez bramki dowolny zalogowany (w tym rola 'klient')
  // enumerował statusy kart wszystkich klientów biura po id.
  if (!Number.isSafeInteger(exceptionId) || exceptionId <= 0) return { status: null }

  const supabase = createSupabaseAdmin()
  // Deterministycznie: najpierw v2 po id (= faktury.id, tak przekazuje karta),
  // potem stare queue po id (wywolania legacy). Bez .or() - patrz resolveExceptionIds.
  const { data } = await supabase
    .from('exceptions_queue_v2')
    .select('status, client_nip')
    .eq('id', exceptionId)
    .maybeSingle()
  if (data) {
    const gate = await assertNipReadAccess(data.client_nip ?? null)
    if (!gate.ok) return { status: null }
    return { status: data.status ?? null }
  }

  const { data: queueData } = await supabase
    .from('exceptions_queue')
    .select('status, client_nip')
    .eq('id', exceptionId)
    .maybeSingle()

  if (!queueData) return { status: null }
  const gate = await assertNipReadAccess(queueData.client_nip ?? null)
  if (!gate.ok) return { status: null }
  return { status: queueData.status ?? null }
}

// ── Kontrola dostępu do historii faktury (współdzielona, read-only) ──────────
// Server actions to publiczne endpointy POST z dowolnym fakturaId/queueId, a
// createSupabaseAdmin() omija RLS — dostęp trzeba egzekwować jawnie. Model jak
// w assertCanWrite (izolacja klientów biura): rola 'klient' = zero dostępu;
// nie-admin tylko przypisane NIP-y, bez kart demo gdy ma dostęp all-but-demo.
//
// UWAGA na sparowane klucze: fakturaId i queueId są w pełni sterowane przez
// wołającego. Gdyby rozwiązać jeden „autorytatywny" NIP i zaufać OR-owi, atakujący
// mógłby sparować WŁASNY fakturaId z CUDZYM queueId i wyciągnąć dane ofiary. Dlatego
// rozwiązujemy client_nip NIEZALEŻNIE dla każdego klucza i wymagamy zgodności.
// Fail-closed: błąd odczytu lub nierozstrzygnięty NIP dla nie-admina = odmowa.
async function resolveNipForKey(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  col: 'faktura_id' | 'queue_id',
  val: number,
  cardTable: 'faktury' | 'exceptions_queue',
): Promise<{ nip: string | null } | { error: string }> {
  const ev = await supabase.from('faktura_events').select('client_nip').eq(col, val).limit(1).maybeSingle()
  if (ev.error) {
    console.error(`[gateFakturaHistory] odczyt NIP (faktura_events.${col}=${val}): ${ev.error.message}`)
    return { error: `Błąd odczytu uprawnień (faktura_events): ${ev.error.message}` }
  }
  if (ev.data?.client_nip) return { nip: ev.data.client_nip }
  // brak eventów — fallback do wiersza karty
  const card = await supabase.from(cardTable).select('client_nip').eq('id', val).maybeSingle()
  if (card.error) {
    console.error(`[gateFakturaHistory] odczyt NIP (${cardTable}.id=${val}): ${card.error.message}`)
    return { error: `Błąd odczytu uprawnień (${cardTable}): ${card.error.message}` }
  }
  return { nip: card.data?.client_nip ?? null }
}

async function gateFakturaHistory(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  params: { fakturaId?: number; queueId?: number }
): Promise<{ ok: true; clientNip: string | null } | { ok: false; error: string }> {
  const { fakturaId, queueId } = params
  if (!fakturaId && !queueId) return { ok: false, error: 'Brak ID faktury' }
  // fakturaId/queueId sterowane przez wołającego i trafiają do interpolowanego
  // .or() — wymuszamy bezpieczny int, żeby string z przecinkiem nie wstrzyknął
  // dodatkowych filtrów PostgREST.
  if (fakturaId !== undefined && (!Number.isSafeInteger(fakturaId) || fakturaId <= 0)) {
    return { ok: false, error: 'Nieprawidłowy identyfikator faktury' }
  }
  if (queueId !== undefined && (!Number.isSafeInteger(queueId) || queueId <= 0)) {
    return { ok: false, error: 'Nieprawidłowy identyfikator faktury' }
  }

  const { nips, isAdmin, panelUser, demoNips } = await getAllowedNips()
  if (!panelUser || panelUser.rola === 'klient') {
    return { ok: false, error: 'Brak uprawnień do podglądu historii' }
  }

  let nipF: string | null = null
  let nipQ: string | null = null
  if (fakturaId) {
    const r = await resolveNipForKey(supabase, 'faktura_id', fakturaId, 'faktury')
    if ('error' in r) return { ok: false, error: r.error }
    nipF = r.nip
  }
  if (queueId) {
    const r = await resolveNipForKey(supabase, 'queue_id', queueId, 'exceptions_queue')
    if ('error' in r) return { ok: false, error: r.error }
    nipQ = r.nip
  }

  // Sparowane klucze muszą wskazywać ten sam NIP — inaczej to niespójna para
  // (atak przez enumerację albo nieaktualne id). Odmawiamy.
  if (fakturaId && queueId && nipF && nipQ && nipF !== nipQ) {
    return { ok: false, error: 'Niespójne identyfikatory faktury — odmowa dostępu' }
  }
  const clientNip = nipF ?? nipQ

  if (!isAdmin) {
    // Fail-closed: nie-admin bez rozstrzygniętego NIP = odmowa
    if (!clientNip) return { ok: false, error: 'Brak dostępu do historii tej faktury' }
    if (nips !== null && !nips.includes(clientNip)) {
      return { ok: false, error: 'Brak dostępu do historii tej faktury' }
    }
    if (nips === null && demoNips.includes(clientNip)) {
      return { ok: false, error: 'Brak dostępu do historii tej faktury' }
    }
  }

  return { ok: true, clientNip }
}

/**
 * Pobierz zdarzenia osi czasu faktury.
 */
export async function fetchFakturaEvents(params: { fakturaId?: number; queueId?: number }) {
  const { fakturaId, queueId } = params;
  if (!fakturaId && !queueId) return { events: [], error: 'Brak ID faktury' };

  const supabase = createSupabaseAdmin()

  const gate = await gateFakturaHistory(supabase, params)
  if (!gate.ok) return { events: [], error: gate.error }

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
  // Defense-in-depth: OR mógłby dociągnąć wiersze innego klienta — twardo tniemy
  // do NIP-a rozstrzygniętego przez gate
  if (gate.clientNip) query = query.eq('client_nip', gate.clientNip)

  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return { events: [], error: `Błąd odczytu zdarzeń (faktura_events): ${error.message}` }
  return { events: data || [], error: null }
}

// ── Oś czasu faktury: jedna chronologiczna historia ─────────────────
// WYŁĄCZNIE ODCZYT. Kręgosłup = fluinty.faktura_events; zdarzenia implicytne
// (narodziny/decyzja/rollback/auto) dokładane z kolumn karty tylko gdy NIE ma
// odpowiadającego eventu w oknie ±5 s (events wygrywa, bo bogatszy). Anomalie
// pochodzą z kolumny jsonb exceptions_queue.anomalie_historii (osobnej tabeli
// anomalii historycznych brak w tym środowisku — patrz meta.anomaliesSource).
export interface TimelineEntry {
  key: string
  ts: string
  event_type: string
  actor: string | null
  payload: any
  source: 'event' | 'implicit' | 'anomaly'
}

export async function fetchFakturaTimeline(params: {
  fakturaId?: number
  queueId?: number
}): Promise<{ entries: TimelineEntry[]; error: string | null; meta?: { anomaliesSource: string | null } }> {
  const { fakturaId, queueId } = params
  if (!fakturaId && !queueId) return { entries: [], error: 'Brak ID faktury' }

  const supabase = createSupabaseAdmin()

  // Kontrola dostępu (rola + scoping NIP) — współdzielona z fetchFakturaEvents
  const gate = await gateFakturaHistory(supabase, params)
  if (!gate.ok) return { entries: [], error: gate.error }

  // 1) Zdarzenia z faktura_events (OR po obu kluczach, dedup po id, rosnąco)
  let evQuery = supabase.from('faktura_events').select('id, event_type, actor, payload, created_at')
  if (fakturaId && queueId) evQuery = evQuery.or(`faktura_id.eq.${fakturaId},queue_id.eq.${queueId}`)
  else if (fakturaId) evQuery = evQuery.eq('faktura_id', fakturaId)
  else evQuery = evQuery.eq('queue_id', queueId!)
  // Defense-in-depth: tnij do NIP-a rozstrzygniętego przez gate (OR + sparowane klucze)
  if (gate.clientNip) evQuery = evQuery.eq('client_nip', gate.clientNip)

  const { data: rawEvents, error: evError } = await evQuery.order('created_at', { ascending: true }).limit(300)
  if (evError) return { entries: [], error: `Błąd odczytu zdarzeń (faktura_events): ${evError.message}` }

  const seen = new Set<number>()
  const events: TimelineEntry[] = []
  for (const e of rawEvents ?? []) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    events.push({ key: `ev-${e.id}`, ts: e.created_at, event_type: e.event_type, actor: e.actor, payload: e.payload, source: 'event' })
  }

  // 2) Kolumny implicytne karty (starsze karty mogą nie mieć eventów).
  //    Błędu odczytu NIE połykamy (CLAUDE.md); anomalie_historii jest kolumną
  //    exceptions_queue — na tabeli faktury NIE istnieje, więc jej tam nie selektujemy.
  let card: any = null
  if (queueId) {
    let cardQuery = supabase
      .from('exceptions_queue')
      .select('created_at, resolved_at, resolved_by, rollback_at, rollback_by, auto_created_at, auto_created_by, status, anomalie_historii')
      .eq('id', queueId)
    if (gate.clientNip) cardQuery = cardQuery.eq('client_nip', gate.clientNip)
    const { data, error } = await cardQuery.maybeSingle()
    if (error) console.error(`[fetchFakturaTimeline] odczyt karty (exceptions_queue id=${queueId}): ${error.message}`)
    card = data
  }
  if (!card && fakturaId) {
    let cardQuery = supabase
      .from('faktury')
      .select('created_at, resolved_at, resolved_by, auto_created_at, auto_created_by, status')
      .eq('id', fakturaId)
    if (gate.clientNip) cardQuery = cardQuery.eq('client_nip', gate.clientNip)
    const { data, error } = await cardQuery.maybeSingle()
    if (error) console.error(`[fetchFakturaTimeline] odczyt karty (faktury id=${fakturaId}): ${error.message}`)
    card = data
  }

  const WINDOW_MS = 5000
  const near = (types: string[], iso: string | null | undefined): boolean => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return events.some((ev) => types.includes(ev.event_type) && Math.abs(new Date(ev.ts).getTime() - t) <= WINDOW_MS)
  }
  const ever = (types: string[]): boolean => events.some((ev) => types.includes(ev.event_type))

  const implicit: TimelineEntry[] = []
  if (card) {
    if (card.created_at && !near(['ksef_received', 'ai_classified', 'queued'], card.created_at)) {
      implicit.push({ key: 'imp-created', ts: card.created_at, event_type: 'card_created', actor: null, payload: null, source: 'implicit' })
    }
    if (card.resolved_at && !near(['approved', 'auto_booked', 'booked', 'skipped', 'external_booked'], card.resolved_at)) {
      implicit.push({ key: 'imp-resolved', ts: card.resolved_at, event_type: 'card_resolved', actor: card.resolved_by ?? null, payload: null, source: 'implicit' })
    }
    if (card.auto_created_at && !near(['auto_booked', 'booked'], card.auto_created_at)) {
      implicit.push({ key: 'imp-auto', ts: card.auto_created_at, event_type: 'auto_booked', actor: card.auto_created_by ?? null, payload: null, source: 'implicit' })
    }
    if (card.rollback_at && !ever(['rollback'])) {
      implicit.push({ key: 'imp-rollback', ts: card.rollback_at, event_type: 'rollback', actor: card.rollback_by ?? null, payload: null, source: 'implicit' })
    }
  }

  // 3) Anomalie historyczne — kolumna jsonb bez własnego timestampu; kotwiczymy
  //    przy narodzinach karty (albo pierwszym evencie), żeby usiadły na początku osi
  const anomalie = Array.isArray(card?.anomalie_historii) ? card.anomalie_historii : []
  const anchorTs = card?.created_at ?? events[0]?.ts ?? null
  const anomalieEntries: TimelineEntry[] = anchorTs
    ? anomalie.map((a: any, i: number) => ({
        key: `anom-${i}`,
        ts: anchorTs,
        event_type: 'anomaly_detected',
        actor: null,
        payload: a,
        source: 'anomaly' as const,
      }))
    : []

  // 4) Scal + sort rosnąco; przy równym ts: event, potem anomalia, potem implicit
  const rank: Record<TimelineEntry['source'], number> = { event: 0, anomaly: 1, implicit: 2 }
  const entries = [...events, ...implicit, ...anomalieEntries].sort((a, b) => {
    const d = new Date(a.ts).getTime() - new Date(b.ts).getTime()
    return d !== 0 ? d : rank[a.source] - rank[b.source]
  })

  return {
    entries,
    error: null,
    meta: { anomaliesSource: anomalie.length ? 'exceptions_queue.anomalie_historii' : null },
  }
}
