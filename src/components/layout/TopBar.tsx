import { Sparkles } from 'lucide-react'
import { NavLinks } from './NavLinks'
import { UserDropdown } from './UserDropdown'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import type { UserProfile } from '@/types/database'

interface TopBarProps {
  userProfile: UserProfile
}

export function TopBar({ userProfile }: TopBarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-white border-b border-[#E2E8F0]">
      <div className="h-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <Sparkles className="w-5 h-5 text-[#4A90E2]" />
          <span className="text-xl font-bold text-[#1F3A5F] tracking-tight">
            Fluinty
          </span>
        </div>

        {/* Navigation */}
        <div className="flex flex-1 items-center justify-center px-6">
          <GlobalSearch />
        </div>
        <NavLinks />

        {/* User */}
        <UserDropdown userProfile={userProfile} />
      </div>
    </header>
  )
}
