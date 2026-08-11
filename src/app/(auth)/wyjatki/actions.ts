'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { assertCanWrite } from '@/lib/auth-helpers'

export async function resolveException(
  exceptionId: number,
  opis: string,
  isPattern: boolean
) {
  try {
    await assertCanWrite(exceptionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Brak uprawnień' }
  }

  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { success: false, error: 'Nie jesteś zalogowany' }

  const supabase = createSupabaseAdmin()

  // 1. Pobierz exception
  const { data: exc, error: excError } = await supabase
    .from('exceptions_queue')
    .select('*')
    .eq('id', exceptionId)
    .single()

  if (excError || !exc) {
    return { success: false, error: 'Nie znaleziono wyjątku' }
  }

  // 2. Update exception
  const { data: updatedQueue, error: updateError } = await supabase
    .from('exceptions_queue')
    .update({
      status: 'resolved',
      resolved_opis: opis,
      resolved_by: user.email ?? 'unknown',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', exceptionId)
    .in('status', ['pending_review', 'pending'])
    .select('id')

  if (updateError) {
    return { success: false, error: `Błąd aktualizacji wyjątku: ${updateError.message}` }
  }
  if (!updatedQueue || updatedQueue.length === 0) {
    return { success: false, error: 'Faktura zmieniła status — odśwież listę' }
  }

  // 3. Audit log
  await supabase.from('audit_log').insert({
    client_nip: exc.client_nip,
    zapis_id: exc.zapis_id,
    action: 'resolve_exception',
    pozycja_xml: exc.pozycja_xml,
    opis_zapisany: opis,
    details: {
      resolved_by: user.email,
      exception_id: exceptionId,
      is_pattern: isPattern,
    },
  })

  revalidatePath('/wyjatki')

  return { success: true, ruleName: opis }
}

export async function ignoreException(exceptionId: number) {
  try {
    await assertCanWrite(exceptionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Brak uprawnień' }
  }

  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { success: false, error: 'Nie jesteś zalogowany' }

  const supabase = createSupabaseAdmin()

  // Get exception info for audit log
  const { data: exc } = await supabase
    .from('exceptions_queue')
    .select('client_nip, zapis_id, pozycja_xml')
    .eq('id', exceptionId)
    .single()

  const { error } = await supabase
    .from('exceptions_queue')
    .update({
      status: 'ignored',
      resolved_by: user.email ?? 'unknown',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', exceptionId)

  if (error) {
    return { success: false, error: `Błąd pomijania wyjątku: ${error.message}` }
  }

  // Audit log
  await supabase.from('audit_log').insert({
    client_nip: exc?.client_nip,
    zapis_id: exc?.zapis_id,
    action: 'ignore_exception',
    pozycja_xml: exc?.pozycja_xml,
    details: {
      exception_id: exceptionId,
      by: user.email,
    },
  })

  revalidatePath('/wyjatki')

  return { success: true }
}

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

export async function addProponowanyToClientOpisy(
  exceptionId: number
) {
  try {
    await assertCanWrite(exceptionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Brak uprawnień' }
  }

  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { success: false, error: 'Nie jesteś zalogowany' }
  const userEmail = user.email ?? 'unknown'

  const supabase = createSupabaseAdmin()
  
  // Pobierz exception
  const { data: exc } = await supabase
    .from('exceptions_queue')
    .select('*')
    .eq('id', exceptionId)
    .single()
  
  if (!exc?.ai_proponowany_opis) return { error: 'No AI proposal' }
  
  // Sprawdź czy już istnieje (trim, case-insensitive logic in JS or let DB handle if exact. The prompt says "case-insensitive trim", so we fetch all and check or use ILIKE, but let's fetch all active and inactive)
  const { data: opisy } = await supabase
    .from('client_opisy')
    .select('id, opis, aktywny')
    .eq('client_nip', exc.client_nip)
    
  const propClean = exc.ai_proponowany_opis.trim().toLowerCase()
  const existing = opisy?.find(o => o.opis.trim().toLowerCase() === propClean)
  
  if (existing) {
    // Aktywuj jeśli nieaktywny
    if (!existing.aktywny) {
      await supabase
        .from('client_opisy')
        .update({ aktywny: true })
        .eq('id', existing.id)
    }
    return { success: true, opisId: existing.id, message: 'Już istnieje, aktywowano' }
  }
  
  // Nowy opis
  const { data: newOpis } = await supabase
    .from('client_opisy')
    .insert({
      client_nip: exc.client_nip,
      opis: exc.ai_proponowany_opis,
      typ_dokumentu: exc.typ_dokumentu,
      aktywny: true,
      created_by: userEmail
    })
    .select()
    .single()
  
  // Audit log
  await supabase.from('audit_log').insert({
    action: 'opis_added_from_ai',
    client_nip: exc.client_nip,
    details: {
      opis: exc.ai_proponowany_opis,
      from_exception_id: exceptionId,
      added_by: userEmail
    }
  })
  
  revalidatePath('/wyjatki')
  return { success: true, opisId: newOpis?.id }
}
