import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { TopBar } from '@/components/layout/TopBar'
import type { UserProfile } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user profile from fluinty.panel_users (by email)
  const admin = createSupabaseAdmin()
  const { data: panelUser } = await admin
    .from('panel_users')
    .select('email, rola, biuro_klienci_nipy')
    .eq('email', user.email ?? '')
    .eq('aktywny', true)
    .single()

  const userProfile: UserProfile = {
    email: user.email ?? '',
    full_name: user.email?.split('@')[0] ?? 'Użytkownik',
    role: panelUser?.rola ?? 'ksiegowa',
    biuro_klienci_nipy: panelUser?.biuro_klienci_nipy ?? null,
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <TopBar userProfile={userProfile} />
      <main className="flex-1 pt-16">
        {children}
      </main>
    </div>
  )
}
