'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Users, Bot } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { ClientExceptionCount } from '@/types/database'

interface Props {
  clients: ClientExceptionCount[]
  totalPending: number
  selectedClient: string | null
  currentTyp: string
  currentSort: string
}

export function ClientSidebar({ clients, totalPending, selectedClient, currentTyp, currentSort }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const filteredClients = clients.filter((c) =>
    c.nazwa.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelectClient = (nip: string | null) => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    if (nip) params.set('client', nip); else params.delete('client')
    if (currentSort !== 'oldest') params.set('sort', currentSort); else params.delete('sort')
    router.push(`/do-akceptacji?${params.toString()}`)
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-4" data-search>
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-[#64748B]" />
        <h2 className="text-sm font-semibold text-[#1E293B]">Klienci</h2>
      </div>

      {/* Search input */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#64748B]" />
        <Input
          placeholder="Szukaj..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm border-[#E2E8F0] rounded-lg"
        />
      </div>

      {/* "Wszyscy" option */}
      <button
        onClick={() => handleSelectClient(null)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer',
          !selectedClient
            ? 'bg-[#E0E7FF] text-[#1F3A5F]'
            : 'text-[#1E293B] hover:bg-[#F8FAFC]'
        )}
      >
        <span>Wszyscy</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {clients.some(c => c.has_ai_proposal) && (
            <Bot className="w-3.5 h-3.5 text-[#4A90E2]" />
          )}
          <span
            className={cn(
              'text-xs font-bold px-2 py-0.5 rounded-full',
              !selectedClient
                ? 'bg-[#1F3A5F] text-white'
                : 'bg-[#F1F5F9] text-[#64748B]'
            )}
          >
            {totalPending}
          </span>
        </div>
      </button>

      <Separator className="my-2" />

      {/* Client list */}
      <div className="space-y-0.5 max-h-[calc(100vh-320px)] overflow-y-auto">
        {filteredClients.map((client) => (
          <button
            key={client.client_nip}
            onClick={() => handleSelectClient(client.client_nip)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer',
              selectedClient === client.client_nip
                ? 'bg-[#E0E7FF] text-[#1F3A5F] font-medium'
                : 'text-[#1E293B] hover:bg-[#F8FAFC]'
            )}
          >
            <span className="truncate mr-2">{client.nazwa}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {client.has_ai_proposal && (
                <Bot className="w-3.5 h-3.5 text-[#4A90E2]" />
              )}
              <span
                className={cn(
                  'text-xs font-bold px-2 py-0.5 rounded-full',
                  selectedClient === client.client_nip
                    ? 'bg-[#1F3A5F] text-white'
                    : 'bg-[#F1F5F9] text-[#64748B]'
                )}
              >
                {client.pending_count}
              </span>
            </div>
          </button>
        ))}
        {filteredClients.length === 0 && (
          <p className="text-xs text-[#64748B] text-center py-4">
            Brak wyników
          </p>
        )}
      </div>
    </div>
  )
}
