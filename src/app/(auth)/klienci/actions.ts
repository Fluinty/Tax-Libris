'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'
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
