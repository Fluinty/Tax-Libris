'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAllowedNips } from '@/lib/auth-helpers'
import { revalidatePath } from 'next/cache'

async function logChange(supabase: any, nip: string, field: string, oldVal: any, newVal: any, userEmail: string) {
  if (oldVal !== newVal) {
    await supabase.from('client_changes_log').insert({
      client_nip: nip,
      field_name: field,
      old_value: oldVal ? String(oldVal) : null,
      new_value: newVal ? String(newVal) : null,
      changed_by: userEmail
    })
  }
}

// Pola bramki auto-write NIGDY nie przechodzą tą ścieżką — zmiana wyłącznie przez
// toggleAutoWrite / updateAutoWriteSettings (kontrola roli admin + zdarzenie
// auto_write_toggled w faktura_events). Bez tej blokady każdy zalogowany użytkownik
// mógłby uzbroić bramkę z pominięciem decyzji admina i śladu audytowego.
const AUTO_WRITE_GATE_FIELDS = ['auto_write_enabled', 'auto_max_kwota']

export async function updateClientData(nip: string, patch: any) {
  const blockedFields = AUTO_WRITE_GATE_FIELDS.filter((f) => f in (patch ?? {}))
  if (blockedFields.length > 0) {
    throw new Error(
      `Pola ${blockedFields.join(', ')} (clients) można zmieniać wyłącznie przez ustawienia Auto-write (wymagana rola admin)`
    )
  }

  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  const userEmail = user?.email || 'unknown'

  const supabaseAdmin = createSupabaseAdmin()

  // Pobierz stare wartości
  const { data: oldClient } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('nip', nip)
    .single()

  if (!oldClient) throw new Error('Klient nie istnieje')

  // Zapisz do bazy
  const { error } = await supabaseAdmin
    .from('clients')
    .update(patch)
    .eq('nip', nip)

  if (error) throw new Error(error.message)

  // Logi zmian
  for (const [key, value] of Object.entries(patch)) {
    await logChange(supabaseAdmin, nip, key, oldClient[key], value, userEmail)
  }

  revalidatePath(`/klienci/${nip}`)
}

export async function addPojazd(nip: string, pojazd: any) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  const userEmail = user?.email || 'unknown'
  const supabaseAdmin = createSupabaseAdmin()

  const { error } = await supabaseAdmin.from('client_pojazdy').insert({
    client_nip: nip,
    ...pojazd
  })

  if (error) throw new Error(error.message)

  await logChange(supabaseAdmin, nip, '+pojazd', null, pojazd.nr_rejestracyjny, userEmail)
  revalidatePath(`/klienci/${nip}`)
}

export async function updatePojazd(id: number, nip: string, patch: any) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  const userEmail = user?.email || 'unknown'
  const supabaseAdmin = createSupabaseAdmin()

  const { data: old } = await supabaseAdmin.from('client_pojazdy').select('*').eq('id', id).single()

  const { error } = await supabaseAdmin.from('client_pojazdy').update(patch).eq('id', id)
  if (error) throw new Error(error.message)

  for (const [key, value] of Object.entries(patch)) {
    await logChange(supabaseAdmin, nip, `pojazd_${old?.nr_rejestracyjny}_${key}`, old?.[key], value, userEmail)
  }
  revalidatePath(`/klienci/${nip}`)
}

export async function addOpis(nip: string, opis: string, typ: string) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  const userEmail = user?.email || 'unknown'
  const supabaseAdmin = createSupabaseAdmin()

  const { error } = await supabaseAdmin.from('client_opisy').insert({
    client_nip: nip,
    opis: opis,
    typ_dokumentu: typ,
    created_by: userEmail
  })

  if (error) throw new Error(error.message)

  await logChange(supabaseAdmin, nip, '+opis', null, opis, userEmail)
  revalidatePath(`/klienci/${nip}`)
}

export async function updateOpis(id: number, nip: string, patch: any) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  const userEmail = user?.email || 'unknown'
  const supabaseAdmin = createSupabaseAdmin()

  const { data: old } = await supabaseAdmin.from('client_opisy').select('*').eq('id', id).single()

  const { error } = await supabaseAdmin.from('client_opisy').update(patch).eq('id', id)
  if (error) throw new Error(error.message)

  for (const [key, value] of Object.entries(patch)) {
    await logChange(supabaseAdmin, nip, `opis_${id}_${key}`, old?.[key], value, userEmail)
  }
  revalidatePath(`/klienci/${nip}`)
}

// Błędy zwracamy jako wartość (nie throw) — Next.js maskuje w produkcji treść
// błędów rzuconych z Server Actions. Semantyka zdarzenia audytowego i fail-safe
// identyczna jak w toggleAutoWrite (wyjatki/actions.ts).
export async function updateAutoWriteSettings(
  nip: string,
  autoWriteEnabled: boolean,
  autoMaxKwota: number
): Promise<{ success: boolean; error?: string }> {
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
