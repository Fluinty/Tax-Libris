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
 */
export async function getAllowedNips(): Promise<{
  nips: string[] | null
  isAdmin: boolean
  email: string
  panelUser: PanelUser
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

  const isAdmin = panelUser.biuro_klienci_nipy === null
  
  return {
    nips: panelUser.biuro_klienci_nipy,
    isAdmin,
    email: user.email,
    panelUser: panelUser as PanelUser,
  }
}

/**
 * Apply NIP filter to a Supabase query builder.
 * If admin (nips === null), does nothing (shows all).
 * If non-admin, adds .in('client_nip', nips) filter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyNipFilter<T extends any>(
  query: T,
  nips: string[] | null,
  column: string = 'client_nip'
): T {
  if (nips === null) return query // admin sees all
  if (nips.length === 0) {
    // Edge case: user has no NIPs assigned — show nothing
    return (query as any).in(column, ['__no_access__'])
  }
  return (query as any).in(column, nips)
}
