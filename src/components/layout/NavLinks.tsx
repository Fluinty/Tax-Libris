'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, Users, FileText, ScrollText, BarChart3 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const navItems = [
  {
    href: '/do-akceptacji',
    label: 'Do akceptacji',
    icon: ClipboardList,
    soon: false,
  },
  {
    href: '/klienci',
    label: 'Klienci',
    icon: Users,
    soon: false,
  },
  {
    href: '/faktury',
    label: 'Faktury',
    icon: FileText,
    soon: false,
  },
  {
    href: '/logs',
    label: 'Logs',
    icon: ScrollText,
    soon: false,
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: BarChart3,
    soon: false, // The prompt implies Dashboard is live and Reguły was legacy
  },
]

export function NavLinks() {
  const pathname = usePathname()

  return (
    <nav className="hidden md:flex items-center gap-1">
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href)
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-[#E0E7FF] text-[#1F3A5F]'
                : 'text-[#64748B] hover:text-[#1E293B] hover:bg-[#F8FAFC]'
            )}
          >
            <Icon className="w-4 h-4" />
            <span>{item.label}</span>
            {item.soon && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0]"
              >
                Soon
              </Badge>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
