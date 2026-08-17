'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { assertCanWritePozycja, assertNipReadAccess } from '@/lib/auth-helpers'

async function getUserEmail(): Promise<string> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email ?? 'system'
}

type WymiarType = 'kolumna_kpir' | 'kup_status' | 'vat_odliczalny' | 'kategoria'

const FIELD_MAP: Record<WymiarType, string> = {
  kolumna_kpir: 'final_kolumna_kpir',
  kup_status: 'final_kup_status',
  vat_odliczalny: 'final_vat_odliczalny',
  kategoria: 'final_kategoria',
}

/**
 * Unified action: update any classification dimension for a single pozycja.
 * Postgres GENERATED columns auto-update effective_* values.
 * Trigger log_korekta_pozycji auto-logs to klasyfikacja_korekty.
 */
export async function updatePozycjaWymiar(
  pozycjaId: number,
  wymiar: WymiarType,
  nowaWartosc: string | number,
  podstawaPrawna?: string
) {
  let poz: { client_nip: string; faktura_id: number | null }
  try {
    poz = await assertCanWritePozycja(pozycjaId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Brak uprawnień' }
  }

  const userEmail = await getUserEmail()
  const supabase = createSupabaseAdmin()

  const updates: Record<string, unknown> = {
    [FIELD_MAP[wymiar]]: nowaWartosc,
  }
  if (podstawaPrawna !== undefined) {
    updates.final_podstawa_prawna = podstawaPrawna
  }

  const { error } = await supabase
    .from('faktury_pozycje')
    .update(updates)
    .eq('id', pozycjaId)

  if (error) {
    return { success: false, error: error.message }
  }

  // Audit log — wzorzec logFakturaEvent (AUDIT §2, C9): edycja pozycji już
  // zapisana, więc błąd audytu NIE cofa operacji, ale nie znika po cichu:
  // console.error (logi Vercel) + `warning` w zwrotce akcji.
  const { error: auditError } = await supabase.from('audit_log').insert({
    action: 'pozycja_wymiar_edit',
    client_nip: poz?.client_nip ?? null,
    zapis_id: null,
    details: {
      pozycja_id: pozycjaId,
      faktura_id: poz?.faktura_id,
      wymiar,
      nowa_wartosc: nowaWartosc,
      podstawa_prawna: podstawaPrawna,
      user: userEmail,
    },
  })
  let auditWarning: string | undefined
  if (auditError) {
    auditWarning = `Nie zapisano wpisu audytu pozycja_wymiar_edit (audit_log): ${auditError.message}`
    console.error('[updatePozycjaWymiar]', auditWarning, { pozycjaId, wymiar })
  }

  // CELOWO bez revalidatePath: zmiana dropdownu pozycji przebudowywała CAŁĄ
  // kolejkę (setki kart, pełny RSC render). Sekcja trzyma stan lokalnie
  // (localPozycje + onClassificationChange w PozycjeFakturySection), a
  // effective_* liczone lokalnie tak samo jak GENERATED w bazie
  // (COALESCE(final, ...)). Świeże dane z serwera przyjdą przy następnej
  // nawigacji/akcji kończącej kartę.
  return { success: true, warning: auditWarning }
}

/**
 * Fetch similar historical positions via RPC match_pozycje (pgvector).
 */
export async function getSimilarPozycje(pozycjaId: number, matchCount = 10) {
  // Publiczny endpoint POST — pozycjaId sterowany przez wołającego.
  if (!Number.isSafeInteger(pozycjaId) || pozycjaId <= 0) return []

  const supabase = createSupabaseAdmin()

  const { data: poz, error: fetchErr } = await supabase
    .from('faktury_pozycje')
    .select('nazwa_embedding, client_nip')
    .eq('id', pozycjaId)
    .single()

  if (fetchErr || !poz?.nazwa_embedding) {
    return []
  }

  // Bramka read-only: bez niej dowolny zalogowany (w tym rola 'klient') po
  // cudzym pozycjaId dostawał historyczne pozycje innego klienta (IDOR).
  const gate = await assertNipReadAccess(poz.client_nip)
  if (!gate.ok) return []

  const { data: similar, error: rpcErr } = await supabase.rpc('match_pozycje', {
    query_embedding: poz.nazwa_embedding,
    p_client_nip: poz.client_nip,
    match_threshold: 0.7,
    match_count: matchCount,
    prefer_korekty: true,
  })

  if (rpcErr) {
    console.error('match_pozycje RPC error:', rpcErr)
    return []
  }

  return similar || []
}
