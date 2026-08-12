'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, assertCanWriteClient } from '@/lib/auth-helpers'
import { revalidatePath } from 'next/cache'

// Wspólna warstwa dostępu (docs/DECISIONS.md 2026-08-11: rola 'klient' = zero
// akcji modyfikujących; admin i księgowa = narzędzie pracy biura). Błędy jako
// wartość, nie throw — Next.js maskuje w produkcji treść błędów z Server Actions.
async function checkClientAccess(
  nip: string
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  try {
    const { email } = await assertCanWriteClient(nip)
    return { ok: true, email }
  } catch (e: unknown) {
    // NEXT_REDIRECT (brak sesji / nieaktywny użytkownik panel_users) musi
    // wypłynąć z akcji — przekierowanie na /login wykonuje Next, nie my.
    if (
      e && typeof e === 'object' && 'digest' in e &&
      typeof (e as { digest?: unknown }).digest === 'string' &&
      (e as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw e
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Brak uprawnień do zapisu' }
  }
}

async function logChange(supabase: any, nip: string, field: string, oldVal: any, newVal: any, userEmail: string) {
  if (oldVal !== newVal) {
    const { error } = await supabase.from('client_changes_log').insert({
      client_nip: nip,
      field_name: field,
      old_value: oldVal ? String(oldVal) : null,
      new_value: newVal ? String(newVal) : null,
      changed_by: userEmail
    })
    if (error) {
      // Błąd logu nie przerywa operacji głównej, ale nie znika po cichu
      console.error(
        `[logChange] Nie zapisano wpisu ${field} dla NIP ${nip} (client_changes_log): ${error.message}`,
        { changed_by: userEmail }
      )
    }
  }
}

// Pola bramki auto-write NIGDY nie przechodzą tą ścieżką — zmiana wyłącznie przez
// toggleAutoWrite / updateAutoWriteSettings (kontrola roli admin + zdarzenie
// auto_write_toggled w faktura_events). Bez tej blokady każdy zalogowany użytkownik
// mógłby uzbroić bramkę z pominięciem decyzji admina i śladu audytowego.
const AUTO_WRITE_GATE_FIELDS = ['auto_write_enabled', 'auto_max_kwota']

// Kolumny clients edytowalne z panelu (ClientDataPanel). Wszystko spoza listy
// odrzucamy — server action to publiczny endpoint POST, a patch nie może
// przemycać kolumn systemowych (nip = klucz główny, is_demo steruje ochronami
// demo i statusem approve-flow, forma_opodatkowania wyklucza z widoków).
const CLIENT_EDITABLE_FIELDS = [
  'dodatkowe_info_ksiegowej',
  'pkd_glowny',
  'pkd_dodatkowe',
  'forma_dzialalnosci',
  'platnik_vat',
  'sprzedaz_mieszana',
  'proporcja_vat_odliczalna',
]

export async function updateClientData(
  nip: string,
  patch: any
): Promise<{ success: boolean; error?: string }> {
  const blockedFields = AUTO_WRITE_GATE_FIELDS.filter((f) => f in (patch ?? {}))
  if (blockedFields.length > 0) {
    return {
      success: false,
      error: `Pola ${blockedFields.join(', ')} (clients) można zmieniać wyłącznie przez ustawienia Auto-write (wymagana rola admin)`,
    }
  }
  const unknownFields = Object.keys(patch ?? {}).filter((f) => !CLIENT_EDITABLE_FIELDS.includes(f))
  if (unknownFields.length > 0) {
    return {
      success: false,
      error: `Pola ${unknownFields.join(', ')} (clients) nie są edytowalne z panelu — dozwolone: ${CLIENT_EDITABLE_FIELDS.join(', ')}`,
    }
  }

  const access = await checkClientAccess(nip)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()

  // Pobierz stare wartości
  const { data: oldClient, error: oldError } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('nip', nip)
    .maybeSingle()

  if (oldError) return { success: false, error: `Błąd odczytu klienta (clients): ${oldError.message}` }
  if (!oldClient) return { success: false, error: `Nie znaleziono klienta o NIP ${nip} (clients)` }

  // Zapisz do bazy
  const { error } = await supabaseAdmin
    .from('clients')
    .update(patch)
    .eq('nip', nip)

  if (error) return { success: false, error: `Błąd aktualizacji klienta (clients): ${error.message}` }

  // Logi zmian
  for (const [key, value] of Object.entries(patch)) {
    await logChange(supabaseAdmin, nip, key, oldClient[key], value, access.email)
  }

  revalidatePath(`/klienci/${nip}`)
  return { success: true }
}

export async function addPojazd(
  nip: string,
  pojazd: any
): Promise<{ success: boolean; error?: string }> {
  const access = await checkClientAccess(nip)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()

  // client_nip PO spreadzie (wymusza zweryfikowany NIP), id wycięte z payloadu —
  // inaczej payload mógłby przemycić wiersz do cudzego klienta (mass assignment)
  const { client_nip: _ignoredNip, id: _ignoredId, ...pojazdData } = (pojazd ?? {}) as Record<string, unknown>
  const { error } = await supabaseAdmin.from('client_pojazdy').insert({
    ...pojazdData,
    client_nip: nip,
  })

  if (error) return { success: false, error: `Błąd dodawania pojazdu (client_pojazdy): ${error.message}` }

  await logChange(supabaseAdmin, nip, '+pojazd', null, pojazd.nr_rejestracyjny, access.email)
  revalidatePath(`/klienci/${nip}`)
  return { success: true }
}

export async function updatePojazd(
  id: number,
  nip: string,
  patch: any
): Promise<{ success: boolean; error?: string }> {
  const access = await checkClientAccess(nip)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()

  const { data: old, error: oldError } = await supabaseAdmin
    .from('client_pojazdy').select('*').eq('id', id).maybeSingle()
  if (oldError) return { success: false, error: `Błąd odczytu pojazdu (client_pojazdy): ${oldError.message}` }
  if (!old) return { success: false, error: `Nie znaleziono pojazdu o id ${id} (client_pojazdy)` }
  if (old.client_nip !== nip) {
    return { success: false, error: `Pojazd o id ${id} nie należy do klienta NIP ${nip} (client_pojazdy)` }
  }

  // client_nip/id wycięte z patcha — SET nie może przepiąć wiersza do innego klienta
  const { client_nip: _ignoredNip, id: _ignoredId, ...safePatch } = (patch ?? {}) as Record<string, unknown>
  const { error } = await supabaseAdmin
    .from('client_pojazdy').update(safePatch).eq('id', id).eq('client_nip', nip)
  if (error) return { success: false, error: `Błąd aktualizacji pojazdu (client_pojazdy): ${error.message}` }

  for (const [key, value] of Object.entries(safePatch)) {
    await logChange(supabaseAdmin, nip, `pojazd_${old?.nr_rejestracyjny}_${key}`, old?.[key], value, access.email)
  }
  revalidatePath(`/klienci/${nip}`)
  return { success: true }
}

export async function addOpis(
  nip: string,
  opis: string,
  typ: string
): Promise<{ success: boolean; error?: string }> {
  const access = await checkClientAccess(nip)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()

  const { error } = await supabaseAdmin.from('client_opisy').insert({
    client_nip: nip,
    opis: opis,
    typ_dokumentu: typ,
    created_by: access.email
  })

  if (error) return { success: false, error: `Błąd dodawania opisu (client_opisy): ${error.message}` }

  await logChange(supabaseAdmin, nip, '+opis', null, opis, access.email)
  revalidatePath(`/klienci/${nip}`)
  return { success: true }
}

export async function updateOpis(
  id: number,
  nip: string,
  patch: any
): Promise<{ success: boolean; error?: string }> {
  const access = await checkClientAccess(nip)
  if (!access.ok) return { success: false, error: access.error }

  const supabaseAdmin = createSupabaseAdmin()

  const { data: old, error: oldError } = await supabaseAdmin
    .from('client_opisy').select('*').eq('id', id).maybeSingle()
  if (oldError) return { success: false, error: `Błąd odczytu opisu (client_opisy): ${oldError.message}` }
  if (!old) return { success: false, error: `Nie znaleziono opisu o id ${id} (client_opisy)` }
  if (old.client_nip !== nip) {
    return { success: false, error: `Opis o id ${id} nie należy do klienta NIP ${nip} (client_opisy)` }
  }

  // client_nip/id wycięte z patcha — SET nie może przepiąć wiersza do innego klienta
  const { client_nip: _ignoredNip, id: _ignoredId, ...safePatch } = (patch ?? {}) as Record<string, unknown>
  const { error } = await supabaseAdmin
    .from('client_opisy').update(safePatch).eq('id', id).eq('client_nip', nip)
  if (error) return { success: false, error: `Błąd aktualizacji opisu (client_opisy): ${error.message}` }

  for (const [key, value] of Object.entries(safePatch)) {
    await logChange(supabaseAdmin, nip, `opis_${id}_${key}`, old?.[key], value, access.email)
  }
  revalidatePath(`/klienci/${nip}`)
  return { success: true }
}

// Błędy zwracamy jako wartość (nie throw) — Next.js maskuje w produkcji treść
// błędów rzuconych z Server Actions. Semantyka zdarzenia audytowego i fail-safe
// identyczna jak w toggleAutoWrite (wyjatki/actions.ts).
// Górny limit progu auto-write. Worker porównuje clients.auto_max_kwota w
// auto_write_gate — NaN/Infinity/ujemna wartość rozbroiłaby lub rozdęła bramkę
// produkcyjnego księgowania po cichu.
const AUTO_MAX_KWOTA_LIMIT = 100000

export async function updateAutoWriteSettings(
  nip: string,
  autoWriteEnabled: boolean,
  autoMaxKwota: number
): Promise<{ success: boolean; error?: string }> {
  if (!/^\d{10}$/.test(nip ?? '')) {
    return { success: false, error: `Nieprawidłowy NIP „${nip}" — oczekiwane dokładnie 10 cyfr` }
  }
  if (typeof autoMaxKwota !== 'number' || !Number.isFinite(autoMaxKwota) || autoMaxKwota <= 0 || autoMaxKwota > AUTO_MAX_KWOTA_LIMIT) {
    return {
      success: false,
      error: `Nieprawidłowy próg auto_max_kwota — oczekiwana kwota od 0 (wyłącznie) do ${AUTO_MAX_KWOTA_LIMIT} zł`,
    }
  }

  const { isAdmin, panelUser } = await getAllowedNips()
  if (!panelUser || !isAdmin) {
    return { success: false, error: 'Brak uprawnień do edycji ustawień Auto-write (tylko admin)' }
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: oldClient, error: oldError } = await supabaseAdmin
    .from('clients')
    .select('auto_write_enabled, auto_max_kwota')
    .eq('nip', nip)
    .maybeSingle()

  if (oldError) {
    return { success: false, error: `Błąd odczytu klienta (clients): ${oldError.message}` }
  }
  if (!oldClient) {
    return { success: false, error: `Nie znaleziono klienta o NIP ${nip} (clients)` }
  }

  const { error } = await supabaseAdmin
    .from('clients')
    .update({
      auto_write_enabled: autoWriteEnabled,
      auto_max_kwota: autoMaxKwota
    })
    .eq('nip', nip)

  if (error) {
    return { success: false, error: `Błąd aktualizacji klienta (clients): ${error.message}` }
  }

  const userEmail = panelUser.email || 'admin'

  // Ślad audytowy bramki auto-write — obowiązkowy przy każdej zmianie z panelu
  const { error: eventError } = await supabaseAdmin.from('faktura_events').insert({
    client_nip: nip,
    event_type: 'auto_write_toggled',
    actor: userEmail,
    payload: { client_nip: nip, enabled: autoWriteEnabled, auto_max_kwota: autoMaxKwota },
  })

  if (eventError) {
    if (autoWriteEnabled && !oldClient.auto_write_enabled) {
      // Fail-safe: UZBROJENIE bez śladu audytowego wycofujemy do stanu sprzed zmiany
      const { error: revertError } = await supabaseAdmin
        .from('clients')
        .update({
          auto_write_enabled: oldClient.auto_write_enabled,
          auto_max_kwota: oldClient.auto_max_kwota,
        })
        .eq('nip', nip)
        .eq('auto_write_enabled', autoWriteEnabled)
      if (revertError) {
        return {
          success: false,
          error: `Nie zapisano zdarzenia auto_write_toggled (faktura_events: ${eventError.message}) i nie udało się wycofać zmiany (clients: ${revertError.message}) — stan klienta NIP ${nip} jest NIEOKREŚLONY, zweryfikuj ręcznie`,
        }
      }
      return {
        success: false,
        error: `Nie zapisano zdarzenia auto_write_toggled (faktura_events): ${eventError.message} — zmiana wycofana, klient pozostaje rozbrojony`,
      }
    }
    // Fail-safe w drugą stronę: awaria zapisu zdarzenia przy wyłączaniu/zmianie progu
    // nie przywraca uzbrojenia — zmiana zostaje (z wpisem w client_changes_log),
    // zgłaszamy brak śladu w faktura_events.
    await logChange(supabaseAdmin, nip, 'auto_write_enabled', oldClient.auto_write_enabled, autoWriteEnabled, userEmail)
    await logChange(supabaseAdmin, nip, 'auto_max_kwota', oldClient.auto_max_kwota ?? 5000, autoMaxKwota, userEmail)
    revalidatePath(`/klienci/${nip}`)
    revalidatePath('/klienci')
    return {
      success: false,
      error: `Ustawienia zapisane, ale nie zapisano zdarzenia auto_write_toggled (faktura_events): ${eventError.message} — uzupełnij ślad audytowy ręcznie`,
    }
  }

  await logChange(supabaseAdmin, nip, 'auto_write_enabled', oldClient.auto_write_enabled, autoWriteEnabled, userEmail)
  await logChange(supabaseAdmin, nip, 'auto_max_kwota', oldClient.auto_max_kwota ?? 5000, autoMaxKwota, userEmail)

  revalidatePath(`/klienci/${nip}`)
  revalidatePath('/klienci')
  return { success: true }
}
