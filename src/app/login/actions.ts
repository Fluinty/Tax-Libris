'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'

/**
 * Check if an email is on the panel_users whitelist and is active.
 * Called BEFORE sending the magic link to prevent spamming non-authorized emails.
 */
export async function checkWhitelist(
  email: string
): Promise<{ allowed: boolean; error?: string }> {
  if (!email || !email.includes('@')) {
    return { allowed: false, error: 'Podaj prawidłowy adres email.' }
  }

  const supabase = createSupabaseAdmin()
  const { data: user, error } = await supabase
    .from('panel_users')
    .select('email, aktywny')
    .eq('email', email.trim().toLowerCase())
    .single()

  if (error || !user) {
    return {
      allowed: false,
      error: 'Ten adres email nie ma dostępu do panelu.',
    }
  }

  if (!user.aktywny) {
    return {
      allowed: false,
      error: 'Twoje konto zostało dezaktywowane. Skontaktuj się z administratorem.',
    }
  }

  return { allowed: true }
}
