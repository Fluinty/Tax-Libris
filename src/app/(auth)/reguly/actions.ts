'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function updateRule(
  ruleId: number,
  patch: {
    pattern_pozycji: string
    is_pattern: boolean
    opis_zdarzenia: string
    typ_dokumentu?: 'zakup' | 'sprzedaz'
  }
) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) throw new Error('Nie jesteś zalogowany')

  const supabase = createSupabaseAdmin()

  // Fetch old rule for audit log
  const { data: oldRule, error: fetchError } = await supabase
    .from('rules')
    .select('*')
    .eq('id', ruleId)
    .single()

  if (fetchError || !oldRule) {
    throw new Error('Nie znaleziono reguły')
  }

  const { error: updateError } = await supabase
    .from('rules')
    .update({
      pattern_pozycji: patch.pattern_pozycji,
      is_pattern: patch.is_pattern,
      opis_zdarzenia: patch.opis_zdarzenia,
      ...(patch.typ_dokumentu ? { typ_dokumentu: patch.typ_dokumentu } : {}),
    })
    .eq('id', ruleId)

  if (updateError) {
    throw new Error(`Błąd aktualizacji reguły: ${updateError.message}`)
  }

  // Audit log
  await supabase.from('audit_log').insert({
    client_nip: oldRule.client_nip,
    action: 'rule_edited',
    rule_id: ruleId,
    opis_zapisany: patch.opis_zdarzenia,
    details: {
      old: {
        pattern_pozycji: oldRule.pattern_pozycji,
        is_pattern: oldRule.is_pattern,
        opis_zdarzenia: oldRule.opis_zdarzenia,
      },
      new: patch,
      edited_by: user.email,
    },
  })

  revalidatePath('/reguly')
  return { success: true }
}

export async function deleteRule(ruleId: number) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) throw new Error('Nie jesteś zalogowany')

  const supabase = createSupabaseAdmin()

  // Fetch rule for audit log
  const { data: rule, error: fetchError } = await supabase
    .from('rules')
    .select('*')
    .eq('id', ruleId)
    .single()

  if (fetchError || !rule) {
    throw new Error('Nie znaleziono reguły')
  }

  // Fix FK: set rule_created_id = NULL in exceptions_queue
  await supabase
    .from('exceptions_queue')
    .update({ rule_created_id: null })
    .eq('rule_created_id', ruleId)

  // Hard delete rule
  const { error: deleteError } = await supabase
    .from('rules')
    .delete()
    .eq('id', ruleId)

  if (deleteError) {
    throw new Error(`Błąd usuwania reguły: ${deleteError.message}`)
  }

  // Audit log
  await supabase.from('audit_log').insert({
    client_nip: rule.client_nip,
    action: 'rule_deleted',
    rule_id: ruleId,
    pozycja_xml: rule.pattern_pozycji,
    opis_zapisany: rule.opis_zdarzenia,
    details: {
      deleted_rule: rule,
      deleted_by: user.email,
    },
  })

  revalidatePath('/reguly')
  return { success: true }
}
