'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

/**
 * Samodzielny przycisk wylogowania dla stron BEZ TopBara — dziś jedynie
 * neutralna strona roli 'klient' w layout (auth). Bez niego sesja klienta
 * była nie do zakończenia z UI: TopBar (jedyne miejsce z „Wyloguj") nie
 * renderuje się dla klienta, a middleware odsyła zalogowanych z /login
 * z powrotem do panelu (recenzja Fali 3).
 */
export function WylogujButton() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] border border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors"
    >
      <LogOut className="w-4 h-4" />
      Wyloguj
    </button>
  )
}
