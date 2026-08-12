'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAllowedNips } from '@/lib/auth-helpers'
import { revalidatePath } from 'next/cache'

// Zakładanie klientów i reset demo to operacje administracyjne — UI pokazuje je
// wyłącznie adminowi, więc server-side egzekwujemy to samo (akcje są publicznymi
// endpointami). Błędy jako wartość, nie throw (produkcyjne maskowanie Next.js).

export async function addClient(data: {
  nip: string
  nazwa: string
  nazwa_bazy_rachmistrz: string
  pkd_glowny?: string
  forma_dzialalnosci?: string
  pilot: boolean
}): Promise<{ success: boolean; error?: string }> {
  const { isAdmin, panelUser } = await getAllowedNips()
  if (!panelUser || !isAdmin) {
    return { success: false, error: 'Brak uprawnień — tylko admin może dodawać klientów' }
  }
  if (!/^\d{10}$/.test(data.nip ?? '')) {
    return { success: false, error: `Nieprawidłowy NIP „${data.nip}" — oczekiwane dokładnie 10 cyfr` }
  }

  const supabase = createSupabaseAdmin()

  // Prosty insert dla MVP
  const { error } = await supabase.from('clients').insert({
    nip: data.nip,
    nazwa: data.nazwa,
    nazwa_bazy_rachmistrz: data.nazwa_bazy_rachmistrz,
    pkd_glowny: data.pkd_glowny || null,
    forma_dzialalnosci: data.forma_dzialalnosci || null,
    pilot: data.pilot,
    aktywny: true,
    auto_write_enabled: false,
    sprzedaz_mieszana: false,
    platnik_vat: true,
  })

  if (error) {
    return { success: false, error: `Błąd dodawania klienta (clients): ${error.message}` }
  }

  revalidatePath('/klienci')
  return { success: true }
}

// Toggle AUTO na /klienci i /klienci/[nip] — bramka produkcyjnego księgowania
// (clients.auto_write_enabled, drugi klucz obok config 'auto_write_global').
// Przeniesione z wyjatki/actions.ts przy usuwaniu martwego modułu (2026-08-12).
// Błędy zwracamy jako wartość (nie throw) — Next.js maskuje w produkcji treść
// błędów rzuconych z Server Actions, a komunikaty bramki muszą dotrzeć do admina.
export async function toggleAutoWrite(
  clientNip: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { success: false, error: 'Nie jesteś zalogowany' }

  const supabase = createSupabaseAdmin()

  // Check if admin
  const { data: profile, error: profileError } = await supabase
    .from('panel_users')
    .select('rola')
    .eq('email', user.email ?? '')
    .eq('aktywny', true)
    .maybeSingle()

  if (profileError) {
    return { success: false, error: `Błąd odczytu uprawnień (panel_users): ${profileError.message}` }
  }
  if (profile?.rola !== 'admin') {
    return { success: false, error: 'Brak uprawnień — tylko admin może zmienić to ustawienie' }
  }

  const { data: updated, error } = await supabase
    .from('clients')
    .update({ auto_write_enabled: enabled })
    .eq('nip', clientNip)
    .select('nip')

  if (error) {
    return { success: false, error: `Błąd aktualizacji klienta (clients): ${error.message}` }
  }
  if (!updated || updated.length === 0) {
    return { success: false, error: `Nie znaleziono klienta o NIP ${clientNip} (clients)` }
  }

  // Ślad audytowy bramki auto-write — obowiązkowy przy każdej zmianie z panelu
  const { error: eventError } = await supabase.from('faktura_events').insert({
    client_nip: clientNip,
    event_type: 'auto_write_toggled',
    actor: user.email ?? 'unknown',
    payload: { client_nip: clientNip, enabled },
  })

  if (eventError) {
    if (enabled) {
      // Fail-safe: WŁĄCZENIE bez śladu audytowego wycofujemy — klient wraca do
      // stanu rozbrojonego. Guard .eq na starą wartość, żeby nie nadpisać
      // równoległej zmiany innego admina.
      const { error: revertError } = await supabase
        .from('clients')
        .update({ auto_write_enabled: false })
        .eq('nip', clientNip)
        .eq('auto_write_enabled', true)
      if (revertError) {
        revalidatePath('/klienci')
        return {
          success: false,
          error: `Nie zapisano zdarzenia auto_write_toggled (faktura_events: ${eventError.message}) i nie udało się wycofać włączenia (clients: ${revertError.message}) — stan klienta NIP ${clientNip} jest NIEOKREŚLONY, zweryfikuj ręcznie`,
        }
      }
      revalidatePath('/klienci')
      return {
        success: false,
        error: `Nie zapisano zdarzenia auto_write_toggled (faktura_events): ${eventError.message} — włączenie wycofane, klient pozostaje rozbrojony`,
      }
    }
    // Fail-safe w drugą stronę: awaria zapisu zdarzenia przy WYŁĄCZANIU nie może
    // z powrotem uzbroić klienta — rozbrojenie zostaje, zgłaszamy brak śladu.
    revalidatePath('/klienci')
    return {
      success: false,
      error: `Klient został wyłączony, ale nie zapisano zdarzenia auto_write_toggled (faktura_events): ${eventError.message} — uzupełnij ślad audytowy ręcznie`,
    }
  }

  revalidatePath('/klienci')

  return { success: true }
}

export async function resetDemoClient() {
  const { isAdmin, panelUser } = await getAllowedNips()
  if (!panelUser || !isAdmin) {
    return { created: 0, errors: ['Brak uprawnień — tylko admin może resetować środowisko DEMO'] }
  }

  const { seedDemo } = await import('@/lib/demo-seed')
  const result = await seedDemo()
  revalidatePath('/klienci')
  revalidatePath('/do-akceptacji')
  return result
}
