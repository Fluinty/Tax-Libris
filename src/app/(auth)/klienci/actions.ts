'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function addClient(data: {
  nip: string
  nazwa: string
  nazwa_bazy_rachmistrz: string
  pkd_glowny?: string
  forma_dzialalnosci?: string
  pilot: boolean
}) {
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
    throw new Error(error.message)
  }

  revalidatePath('/klienci')
  return true
}
