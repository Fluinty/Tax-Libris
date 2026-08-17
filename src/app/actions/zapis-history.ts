'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { assertNipReadAccess } from '@/lib/auth-helpers'
import type { AuditEntry, ZapisInfo } from '@/lib/audit-formatter'

export async function getZapisHistory(
  zapisId: number,
  clientNipHint?: string | null
): Promise<{
  audits: AuditEntry[]
  zapisInfo: ZapisInfo | null
  error?: string
}> {
  const empty = { audits: [] as AuditEntry[], zapisInfo: null }
  // Publiczny endpoint POST — zapisId sterowany przez wołającego; wymuszamy int.
  if (!Number.isSafeInteger(zapisId) || zapisId <= 0) return empty

  const supabase = createSupabaseAdmin()

  // ── Bramka dostępu PRZED odczytem danych ────────────────────────────────
  // zapis_id to numer zapisu w Rachmistrzu, numerowany PER KSIĘGA KLIENTA —
  // kolizje między klientami są strukturalnie oczekiwane. Dlatego:
  // 1) właściciela rozstrzygamy dla PARY (zapis_id, client_nip): hint z UI
  //    (też niezaufany — z propsów) potwierdzamy w danych; bez hintu bierzemy
  //    pierwszy NIP z audit_log/exceptions_queue,
  // 2) KAŻDY odczyt danych niżej jest twardo cięty .eq('client_nip', …) do
  //    rozstrzygniętego NIP-a — wiersze innych klientów (i wiersze bez NIP-a,
  //    których właściciela nie da się ustalić) nie wchodzą do odpowiedzi.
  // Błędy odczytów bramki NIE są połykane: fail-closed + komunikat z tabelą.
  const nipHint = clientNipHint && /^\d{10}$/.test(clientNipHint) ? clientNipHint : null

  let nipQuery = supabase
    .from('audit_log')
    .select('client_nip')
    .eq('zapis_id', zapisId)
    .not('client_nip', 'is', null)
  if (nipHint) nipQuery = nipQuery.eq('client_nip', nipHint)
  const { data: nipRow, error: nipError } = await nipQuery.limit(1).maybeSingle()
  if (nipError) {
    console.error(`[getZapisHistory] odczyt NIP (audit_log, zapis_id=${zapisId}): ${nipError.message}`)
    return { ...empty, error: `Błąd odczytu uprawnień (audit_log): ${nipError.message}` }
  }

  let clientNip: string | null = nipRow?.client_nip ?? null
  if (!clientNip) {
    let excQuery = supabase
      .from('exceptions_queue')
      .select('client_nip')
      .eq('zapis_id', zapisId)
    if (nipHint) excQuery = excQuery.eq('client_nip', nipHint)
    const { data: excNip, error: excError } = await excQuery.limit(1).maybeSingle()
    if (excError) {
      console.error(`[getZapisHistory] odczyt NIP (exceptions_queue, zapis_id=${zapisId}): ${excError.message}`)
      return { ...empty, error: `Błąd odczytu uprawnień (exceptions_queue): ${excError.message}` }
    }
    clientNip = excNip?.client_nip ?? null
  }

  const gate = await assertNipReadAccess(clientNip)
  if (!gate.ok) return empty

  // Po bramce clientNip jest rozstrzygnięty i zweryfikowany — admin z
  // nierozstrzygniętym NIP-em (assertNipReadAccess przepuszcza) nie może
  // czytać bez scopingu, więc brak NIP-a = pusta odpowiedź.
  if (!clientNip) return empty

  // Audit log entries for this zapis — WYŁĄCZNIE wiersze tego klienta
  const { data: audits, error: auditsError } = await supabase
    .from('audit_log')
    .select('id, timestamp, action, pozycja_xml, rule_id, opis_zapisany, error_message, duration_ms, details')
    .eq('zapis_id', zapisId)
    .eq('client_nip', clientNip)
    .order('timestamp', { ascending: true })
  if (auditsError) {
    return { ...empty, error: `Błąd odczytu historii (audit_log): ${auditsError.message}` }
  }

  if (!audits || audits.length === 0) {
    return { audits: [], zapisInfo: null }
  }

  const oldestAudit = audits[0]

  // Fetch client name
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('nazwa')
    .eq('nip', clientNip)
    .single()
  // Dekoracja naglowka — degradacja do 'Nieznany', ale blad NIE znika po cichu
  if (clientError) console.error(`[getZapisHistory] odczyt klienta (clients, nip=${clientNip}): ${clientError.message}`)
  const clientNazwa = client?.nazwa ?? 'Nieznany'

  // Fetch exception_queue for richer info — też cięte do klienta
  const { data: exception, error: excInfoError } = await supabase
    .from('exceptions_queue')
    .select('numer_ksef, ksiegowe_numer, nazwa_dostawcy, pozycja_xml, typ_dokumentu')
    .eq('zapis_id', zapisId)
    .eq('client_nip', clientNip)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (excInfoError) console.error(`[getZapisHistory] odczyt karty (exceptions_queue, zapis_id=${zapisId}): ${excInfoError.message}`)

  return {
    audits: audits as AuditEntry[],
    zapisInfo: {
      zapis_id: zapisId,
      client_nip: clientNip,
      client_nazwa: clientNazwa,
      numer_ksef: exception?.numer_ksef ?? null,
      numer_dokumentu: exception?.ksiegowe_numer ?? null,
      pozycja_xml: exception?.pozycja_xml ?? oldestAudit.pozycja_xml,
      nazwa_dostawcy: exception?.nazwa_dostawcy ?? null,
      typ_dokumentu: exception?.typ_dokumentu ?? null,
    },
  }
}
