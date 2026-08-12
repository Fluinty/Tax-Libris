'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { assertNipReadAccess } from '@/lib/auth-helpers'
import type { AuditEntry, ZapisInfo } from '@/lib/audit-formatter'

export async function getZapisHistory(zapisId: number): Promise<{
  audits: AuditEntry[]
  zapisInfo: ZapisInfo | null
}> {
  const empty = { audits: [] as AuditEntry[], zapisInfo: null }
  // Publiczny endpoint POST — zapisId sterowany przez wołającego; wymuszamy int.
  if (!Number.isSafeInteger(zapisId) || zapisId <= 0) return empty

  const supabase = createSupabaseAdmin()

  // ── Bramka dostępu PRZED odczytem danych ────────────────────────────────
  // Wcześniej akcja czytała pełny audit_log dowolnego zapisId bez kontroli
  // (cross-tenant IDOR). Najpierw rozstrzygamy właściciela (metadane: sam
  // client_nip), potem scoping fail-closed, dopiero potem pełny odczyt.
  const { data: nipRow } = await supabase
    .from('audit_log')
    .select('client_nip')
    .eq('zapis_id', zapisId)
    .not('client_nip', 'is', null)
    .limit(1)
    .maybeSingle()

  let clientNip: string | null = nipRow?.client_nip ?? null
  if (!clientNip) {
    const { data: excNip } = await supabase
      .from('exceptions_queue')
      .select('client_nip')
      .eq('zapis_id', zapisId)
      .limit(1)
      .maybeSingle()
    clientNip = excNip?.client_nip ?? null
  }

  const gate = await assertNipReadAccess(clientNip)
  if (!gate.ok) return empty

  // Audit log entries for this zapis
  const { data: audits } = await supabase
    .from('audit_log')
    .select('id, timestamp, action, pozycja_xml, rule_id, opis_zapisany, error_message, duration_ms, details')
    .eq('zapis_id', zapisId)
    .order('timestamp', { ascending: true })

  if (!audits || audits.length === 0) {
    return { audits: [], zapisInfo: null }
  }

  const oldestAudit = audits[0]

  // Fetch client name
  let clientNazwa = 'Nieznany'
  if (clientNip) {
    const { data: client } = await supabase
      .from('clients')
      .select('nazwa')
      .eq('nip', clientNip)
      .single()
    clientNazwa = client?.nazwa ?? 'Nieznany'
  }

  // Fetch exception_queue for richer info
  const { data: exception } = await supabase
    .from('exceptions_queue')
    .select('numer_ksef, ksiegowe_numer, nazwa_dostawcy, pozycja_xml, typ_dokumentu')
    .eq('zapis_id', zapisId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    audits: audits as AuditEntry[],
    zapisInfo: {
      zapis_id: zapisId,
      client_nip: clientNip ?? '',
      client_nazwa: clientNazwa,
      numer_ksef: exception?.numer_ksef ?? null,
      numer_dokumentu: exception?.ksiegowe_numer ?? null,
      pozycja_xml: exception?.pozycja_xml ?? oldestAudit.pozycja_xml,
      nazwa_dostawcy: exception?.nazwa_dostawcy ?? null,
      typ_dokumentu: exception?.typ_dokumentu ?? null,
    },
  }
}
