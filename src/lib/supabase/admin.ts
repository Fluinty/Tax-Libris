import { createClient } from '@supabase/supabase-js'

// Admin client with service_role key — use only in Server Actions / server-side code
// Bypasses RLS policies
export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: 'fluinty' },
    }
  )
}
