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

  // 2. Stwórz regułę (lub UPDATE jeśli istnieje)
  const pattern = isPattern ? `%${exc.pozycja_xml}%` : exc.pozycja_xml
  const { data: rule, error: ruleError } = await supabase
    .from('rules')
    .upsert(
      {
        client_nip: exc.client_nip,
        pattern_pozycji: pattern,
        is_pattern: isPattern,
        opis_zdarzenia: opis,
        typ_dokumentu: exc.typ_dokumentu || 'zakup',
        source: 'learned_from_exception',
        created_by: user.email ?? 'unknown',
        hit_count: 1,
      },
      { onConflict: 'client_nip,pattern_pozycji' }
    )
    .select()
    .single()

  if (ruleError || !rule) {
    return { success: false, error: `Błąd tworzenia reguły: ${ruleError?.message}` }
  }

  // 3. Update exception
  const { data: updatedQueue, error: updateError } = await supabase
    .from('exceptions_queue')
    .update({
      status: 'resolved',
      resolved_opis: opis,
      resolved_by: user.email ?? 'unknown',
      resolved_at: new Date().toISOString(),
      rule_created_id: rule.id,
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

  // 4. Audit log
  await supabase.from('audit_log').insert({
    client_nip: exc.client_nip,
    zapis_id: exc.zapis_id,
    action: 'resolve_exception',
    pozycja_xml: exc.pozycja_xml,
    rule_id: rule.id,
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

export async function toggleAutoWrite(clientNip: string, enabled: boolean) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) throw new Error('Nie jesteś zalogowany')

  const supabase = createSupabaseAdmin()

  // Check if admin
  const { data: profile } = await supabase
    .from('panel_users')
    .select('rola')
    .eq('email', user.email ?? '')
    .eq('aktywny', true)
    .single()

  if (profile?.rola !== 'admin') {
    throw new Error('Brak uprawnień — tylko admin może zmienić to ustawienie')
  }

  const { error } = await supabase
    .from('clients')
    .update({ auto_write_enabled: enabled })
    .eq('nip', clientNip)

  if (error) {
    throw new Error(`Błąd aktualizacji klienta: ${error.message}`)
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
