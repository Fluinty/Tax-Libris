'use client'

import { useRouter } from 'next/navigation'
import { ChevronDown, User, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UserProfile } from '@/types/database'

interface UserDropdownProps {
  userProfile: UserProfile
}

export function UserDropdown({ userProfile }: UserDropdownProps) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const displayName =
    userProfile.full_name || userProfile.email.split('@')[0]

  const handleLogout = async () => {
    await supabase.auth.signOut()
    toast.success('Wylogowano')
    router.push('/login')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[#1E293B] hover:bg-[#F8FAFC] cursor-pointer transition-colors outline-none"
      >
        <div className="w-7 h-7 rounded-full bg-[#1F3A5F] flex items-center justify-center text-white text-xs font-semibold">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <span className="hidden sm:inline text-sm font-medium">
          {displayName}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5 text-xs text-[#64748B]">
          {userProfile.email}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-[#64748B] opacity-50 pointer-events-none"
        >
          <User className="w-4 h-4 mr-2" />
          Profil
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer text-[#EF4444] focus:text-[#EF4444] focus:bg-red-50"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Wyloguj
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
