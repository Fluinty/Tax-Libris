import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import type { PanelUser } from '@/types/database'

/**
 * Get the allowed NIPs for the currently authenticated user.
 * 
 * - Admin (biuro_klienci_nipy IS NULL) → returns { nips: null, isAdmin: true }
 * - Ksiegowa/klient → returns { nips: [...], isAdmin: false }
 * - Not authenticated → redirects to /login
 * 
 * Also fetches NIP-y klientów na ryczałcie (forma_opodatkowania='ryczalt')
 * do wykluczenia z UI — ryczałtowcy nie są obsługiwani przez system.
 */
export async function getAllowedNips(): Promise<{
  nips: string[] | null
  isAdmin: boolean
  email: string
  panelUser: PanelUser
  ryczaltNips: string[]
  demoNips: string[]
}> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    redirect('/login')
  }

  const admin = createSupabaseAdmin()
  const { data: panelUser, error } = await admin
    .from('panel_users')
    .select('*')
    .eq('email', user.email)
    .eq('aktywny', true)
    .single()

  if (error || !panelUser) {
    redirect('/login')
  }

  // Pobierz NIP-y klientów na ryczałcie (do wykluczenia) oraz dema
  const { data: excludedClients } = await admin
    .from('clients')
    .select('nip, forma_opodatkowania, is_demo')
    .or('forma_opodatkowania.eq.ryczalt,is_demo.eq.true')

  const ryczaltNips = (excludedClients ?? []).filter(c => c.forma_opodatkowania === 'ryczalt').map(c => c.nip)
  const demoNips = (excludedClients ?? []).filter(c => c.is_demo).map(c => c.nip)

  const isAdmin = panelUser.rola === 'admin'

  // Dla nie-adminów z jawnie przypisanymi NIP-ami: usuń ryczałtowców
  let finalNips = panelUser.biuro_klienci_nipy
  if (finalNips && ryczaltNips.length > 0) {
    finalNips = finalNips.filter((n: string) => !ryczaltNips.includes(n))
  }
  
  return {
    nips: finalNips,
    isAdmin,
    email: user.email,
    panelUser: panelUser as PanelUser,
    ryczaltNips,
    demoNips,
  }
}

/**
 * Apply NIP filter to a Supabase query builder.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyNipFilter<T extends any>(
  query: T,
  nips: string[] | null,
  column: string = 'client_nip',
  ryczaltNips: string[] = [],
  demoNips: string[] = [],
  isAdmin: boolean = false
): T {
  if (nips === null) {
    let toExclude = [...ryczaltNips]
    if (!isAdmin) {
      toExclude = [...toExclude, ...demoNips]
    }
    
    if (toExclude.length > 0) {
      return (query as any).not(column, 'in', `(${toExclude.join(',')})`)
    }
    return query
  }
  if (nips.length === 0) {
    return (query as any).in(column, ['__no_access__'])
  }
  return (query as any).in(column, nips)
}

/**
 * Verify that the currently authenticated user has write permission for the given exceptionId.
 */
export async function assertCanWrite(exceptionId: number) {
  const { nips, isAdmin, panelUser } = await getAllowedNips()
  if (!panelUser || panelUser.rola === 'klient') throw new Error('Brak uprawnień do zapisu')
  const admin = createSupabaseAdmin()
  let { data } = await admin.from('faktury').select('client_nip, status').eq('id', exceptionId).maybeSingle()
  if (!data) {
    const res = await admin.from('faktury').select('client_nip, status').eq('legacy_queue_id', exceptionId).maybeSingle()
    data = res.data
  }
  if (!data) {
    const res = await admin.from('exceptions_queue').select('client_nip, status').eq('id', exceptionId).maybeSingle()
    data = res.data
  }
  if (!data) throw new Error('Nie znaleziono faktury')
  if (!isAdmin && !nips?.includes(data.client_nip)) throw new Error('Brak dostępu do tego klienta')
  return data
}

/**
 * Verify that the currently authenticated user has write permission for the given pozycjaId.
 */
export async function assertCanWritePozycja(pozycjaId: number) {
  const { nips, isAdmin, panelUser } = await getAllowedNips()
  if (!panelUser || panelUser.rola === 'klient') throw new Error('Brak uprawnień do zapisu')
  const admin = createSupabaseAdmin()
  const { data } = await admin.from('faktury_pozycje').select('client_nip, faktura_id').eq('id', pozycjaId).single()
  if (!data) throw new Error('Nie znaleziono pozycji')
  if (!isAdmin && !nips?.includes(data.client_nip)) throw new Error('Brak dostępu do tego klienta')
  return data
}
