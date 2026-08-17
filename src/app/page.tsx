import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Bezpośrednio do kolejki — /wyjatki to relikt robiący DRUGIE przekierowanie
    // na /do-akceptacji (AUDIT §3); trasa /wyjatki zostaje dla starych zakładek.
    redirect('/do-akceptacji')
  } else {
    redirect('/login')
  }
}
