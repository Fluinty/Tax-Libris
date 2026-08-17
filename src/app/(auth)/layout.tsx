import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { TopBar } from '@/components/layout/TopBar'
import { WylogujButton } from '@/components/auth/WylogujButton'
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

  // ── Blokada ODCZYTU dla roli 'klient' (AUDIT 2026-08 §2, decyzja) ─────────
  // DECISIONS 2026-08-11 odcina roli 'klient' akcje zapisu, ale strony biura
  // (kolejka, dashboard, /logs z audit_log i e-mailami księgowych, /klienci)
  // były czytelne dla każdego zalogowanego. Layout (auth) jest JEDYNYM wejściem
  // do tych tras, więc blokada tutaj obejmuje je wszystkie server-side —
  // zamiast dzieci renderujemy neutralną stronę (bez redirectu: pętla layoutu
  // nie grozi, a klient na dowolnym URL biura widzi to samo). Portal klienta
  // końcowego to osobny przyszły moduł (DECISIONS) — do tego czasu neutralna
  // informacja, zero danych biura.
  if (panelUser?.rola === 'klient') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4">
        <div className="max-w-md w-full bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-8 text-center">
          <h1 className="text-lg font-bold text-[#1E293B] mb-2">Portal klienta w przygotowaniu</h1>
          <p className="text-sm text-slate-600">
            Twoje konto jest aktywne, ale panel, który próbujesz otworzyć, jest
            przeznaczony dla zespołu biura rachunkowego. Portal dla klientów
            jest w budowie — o jego udostępnieniu poinformuje Cię biuro.
          </p>
          <p className="text-xs text-slate-400 mt-4">
            Zalogowano jako {user.email}
          </p>
          {/* Bez TopBara strona nie miała ŻADNEJ drogi wylogowania
              (middleware odsyła zalogowanych z /login) — recenzja Fali 3 */}
          <WylogujButton />
        </div>
      </div>
    )
  }

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
