'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ClientSidebar } from './ClientSidebar'
import { ExceptionCard } from './ExceptionCard'
import { SortDropdown } from './SortDropdown'
import { EmptyState } from './EmptyState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import type { ExceptionWithClient, ClientExceptionCount, Rule } from '@/types/database'

interface Props {
  exceptions: ExceptionWithClient[]
  clientsWithCounts: ClientExceptionCount[]
  totalPending: number
  totalZakup: number
  totalSprzedaz: number
  selectedClient: string | null
  currentSort: string
  currentTyp: string
  rules: Pick<Rule, 'client_nip' | 'opis_zdarzenia' | 'hit_count'>[]
}

export function ExceptionsPageClient({
  exceptions,
  clientsWithCounts,
  totalPending,
  totalZakup,
  totalSprzedaz,
  selectedClient,
  currentSort,
  currentTyp,
  rules,
}: Props) {
  const router = useRouter()
  const [activeIndex, setActiveIndex] = useState(0)
  const displayCount = selectedClient
    ? exceptions.length
    : totalPending

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams()
    params.set('typ', value)
    if (selectedClient) params.set('client', selectedClient)
    if (currentSort !== 'newest') params.set('sort', currentSort)
    router.push(`/wyjatki?${params.toString()}`)
  }

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input or textarea
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.getAttribute('role') === 'combobox'
      ) {
        // Allow Escape and Enter in combobox context
        if (e.key !== 'Escape' && e.key !== 'Enter') return
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((prev) => Math.min(prev + 1, exceptions.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((prev) => Math.max(prev - 1, 0))
          break
        case '/':
          if (!target.closest('[data-search]')) {
            e.preventDefault()
            const searchInput = document.querySelector<HTMLInputElement>('[data-search] input')
            searchInput?.focus()
          }
          break
      }
    },
    [exceptions.length]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Scroll active card into view
  useEffect(() => {
    const activeCard = document.querySelector(`[data-card-index="${activeIndex}"]`)
    activeCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeIndex])

  // Reset active index when exceptions change
  useEffect(() => {
    setActiveIndex(0)
  }, [currentTyp, selectedClient])

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex gap-6">
        {/* Left sidebar — clients */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-20">
            <ClientSidebar
              clients={clientsWithCounts}
              totalPending={totalPending}
              selectedClient={selectedClient}
              currentTyp={currentTyp}
              currentSort={currentSort}
            />
          </div>
        </div>

        {/* Right — exceptions list */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-[#1E293B]">
                Wyjątki do rozwiązania
              </h1>
              <p className="text-sm text-[#64748B] mt-1">
                Łącznie:{' '}
                <span className="font-semibold text-[#1E293B]">
                  {displayCount}
                </span>{' '}
                oczekujących
              </p>
            </div>
            <SortDropdown currentSort={currentSort} selectedClient={selectedClient} currentTyp={currentTyp} />
          </div>

          {/* Tabs */}
          <Tabs value={currentTyp} onValueChange={handleTabChange} className="mb-6">
            <TabsList className="h-9">
              <TabsTrigger value="zakup" className="gap-2 cursor-pointer">
                🛒 Zakupowe
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                  {totalZakup}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="sprzedaz" className="gap-2 cursor-pointer">
                💰 Sprzedażowe
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                  {totalSprzedaz}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value={currentTyp}>
              {exceptions.length === 0 ? (
                <EmptyState typ={currentTyp} />
              ) : (
                <div className="space-y-4">
                  {exceptions.map((exc, index) => (
                    <ExceptionCard
                      key={exc.id}
                      exception={exc}
                      isActive={index === activeIndex}
                      index={index}
                      onActivate={() => setActiveIndex(index)}
                      rules={rules.filter((r) => r.client_nip === exc.client_nip)}
                      allRules={rules}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
