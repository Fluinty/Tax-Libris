'use client'

import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowUpDown } from 'lucide-react'

interface Props {
  currentSort: string
  selectedClient: string | null
  currentTyp: string
}

const sortOptions = [
  { value: 'newest', label: 'Najnowsze' },
  { value: 'oldest', label: 'Najstarsze' },
  { value: 'highest', label: 'Najwyższa kwota' },
  { value: 'lowest', label: 'Najniższa kwota' },
]

export function SortDropdown({ currentSort, selectedClient, currentTyp }: Props) {
  const router = useRouter()

  const currentLabel =
    sortOptions.find((o) => o.value === currentSort)?.label ?? 'Najnowsze'

  const handleSort = (value: string) => {
    const params = new URLSearchParams()
    params.set('typ', currentTyp)
    if (selectedClient) params.set('client', selectedClient)
    if (value !== 'newest') params.set('sort', value)
    router.push(`/wyjatki?${params.toString()}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-1.5 h-8 px-3 text-sm text-[#64748B] border border-[#E2E8F0] rounded-lg bg-white hover:bg-[#F8FAFC] cursor-pointer transition-colors outline-none"
      >
        <ArrowUpDown className="w-3.5 h-3.5" />
        {currentLabel}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {sortOptions.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => handleSort(opt.value)}
            className="cursor-pointer"
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
