'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * Check if an email is on the panel_users whitelist and is active.
 * Called BEFORE sending the magic link to prevent spamming non-authorized emails.
 */
export async function checkWhitelist(
  email: string
): Promise<{ allowed: boolean; error?: string }> {
  // Endpoint nieuwierzytelniony — nie może być wyrocznią istnienia/statusu konta.
  // Jedna generyczna odpowiedź niezależnie od tego, czy e-mail istnieje w
  // panel_users i czy jest aktywny (rozróżnienie dopiero po zalogowaniu).
  const generic = {
    allowed: false,
    error: 'Jeśli ten adres ma dostęp do panelu, wyślemy link logowania na skrzynkę.',
  }

  if (!email || !email.includes('@')) {
    return generic
  }

  const supabase = createSupabaseAdmin()
  const { data: user } = await supabase
    .from('panel_users')
    .select('aktywny')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()

  if (!user || !user.aktywny) {
    return generic
  }

  return { allowed: true }
}
