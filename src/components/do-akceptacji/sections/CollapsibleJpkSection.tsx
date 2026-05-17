'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleJpkSectionProps {
  title: string
  badge?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  icon?: ReactNode
  borderColor?: string
}

export function CollapsibleJpkSection({
  title,
  badge,
  defaultOpen = false,
  children,
  icon,
  borderColor,
}: CollapsibleJpkSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className={cn("border rounded-lg overflow-hidden shadow-sm", borderColor || "border-slate-200")}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-slate-500 shrink-0">{icon}</span>}
          <span className="text-[13px] font-semibold text-slate-700 truncate">{title}</span>
          {badge && <span className="shrink-0">{badge}</span>}
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ml-2",
            isOpen && "rotate-180"
          )}
        />
      </button>
      {isOpen && (
        <div className="p-3 border-t border-slate-200">
          {children}
        </div>
      )}
    </div>
  )
}
