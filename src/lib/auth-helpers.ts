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
    // User authenticated in Supabase Auth but not in panel_users whitelist
    // Sign them out and redirect
    redirect('/login')
  }

  // Pobierz NIP-y klientów na ryczałcie — wykluczani z całego panelu
  const { data: ryczaltClients } = await admin
    .from('clients')
    .select('nip')
    .eq('forma_opodatkowania', 'ryczalt')
  const ryczaltNips = (ryczaltClients ?? []).map(c => c.nip)

  const isAdmin = panelUser.biuro_klienci_nipy === null

  // Dla nie-adminów: usuń ryczałtowców z listy dozwolonych NIP-ów
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
  }
}

/**
 * Apply NIP filter to a Supabase query builder.
 * If admin (nips === null), only excludes ryczalt clients.
 * If non-admin, adds .in('client_nip', nips) filter (ryczalt already removed from nips).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyNipFilter<T extends any>(
  query: T,
  nips: string[] | null,
  column: string = 'client_nip',
  ryczaltNips: string[] = []
): T {
  if (nips === null) {
    // Admin sees all EXCEPT ryczałtowców
    if (ryczaltNips.length > 0) {
      return (query as any).not(column, 'in', `(${ryczaltNips.join(',')})`)
    }
    return query
  }
  if (nips.length === 0) {
    // Edge case: user has no NIPs assigned — show nothing
    return (query as any).in(column, ['__no_access__'])
  }
  // Non-admin: ryczalt already filtered out of nips in getAllowedNips
  return (query as any).in(column, nips)
}
