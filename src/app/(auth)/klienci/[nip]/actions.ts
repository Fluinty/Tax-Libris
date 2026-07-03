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

export async function updateClientData(nip: string, patch: any) {
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

export async function updateAutoWriteSettings(nip: string, autoWriteEnabled: boolean, autoMaxKwota: number) {
  const { isAdmin, panelUser } = await getAllowedNips()
  if (!panelUser || !isAdmin) {
    throw new Error('Brak uprawnień do edycji ustawień Auto-write (tylko admin)')
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: oldClient } = await supabaseAdmin
    .from('clients')
    .select('auto_write_enabled, auto_max_kwota')
    .eq('nip', nip)
    .single()

  if (!oldClient) throw new Error('Klient nie istnieje')

  const { error } = await supabaseAdmin
    .from('clients')
    .update({
      auto_write_enabled: autoWriteEnabled,
      auto_max_kwota: autoMaxKwota
    })
    .eq('nip', nip)

  if (error) throw new Error(error.message)

  const userEmail = panelUser.email || 'admin'
  await logChange(supabaseAdmin, nip, 'auto_write_enabled', oldClient.auto_write_enabled, autoWriteEnabled, userEmail)
  await logChange(supabaseAdmin, nip, 'auto_max_kwota', oldClient.auto_max_kwota ?? 5000, autoMaxKwota, userEmail)

  revalidatePath(`/klienci/${nip}`)
  return { success: true }
}
