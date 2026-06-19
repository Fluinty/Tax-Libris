'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FakturaCard } from '@/components/do-akceptacji/FakturaCard'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, ListFilter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ClientPojazd } from '@/types/database'

interface FakturaListClientProps {
  pendingReview: any[]
  pending: any[]
  autoCreated: any[]
  clientOpisyMap: Map<string, any[]>
  clientPojazdyMap?: Record<string, ClientPojazd[]>
}

type FilterType = 'all' | 'zakup' | 'sprzedaz'

export function FakturaListClient({ pendingReview, pending, autoCreated, clientOpisyMap, clientPojazdyMap = {} }: FakturaListClientProps) {
  const [filter, setFilter] = useState<FilterType>('all')
  const router = useRouter()

  // Auto-refresh co 30s — pobiera świeże dane z server component bez przeładowania strony
  useEffect(() => {
    const INTERVAL_MS = 30_000
    let timerId: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timerId) return
      timerId = setInterval(() => router.refresh(), INTERVAL_MS)
    }

    const stop = () => {
      if (timerId) { clearInterval(timerId); timerId = null }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stop()
      } else {
        router.refresh() // natychmiast po powrocie na kartę
        start()
      }
    }

    start()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [router])

  const filterFn = (e: any) => {
    if (filter === 'all') return true
    const isSprzedaz = e.typ_dokumentu === 'sprzedaz'
    if (filter === 'sprzedaz') return isSprzedaz
    return !isSprzedaz // traktujemy null i cokolwiek innego jako 'zakup'
  }

  const filteredPendingReview = pendingReview.filter(filterFn)
    .sort((a, b) => (a.confidence_overall ?? 1) - (b.confidence_overall ?? 1)) // confidence ASC
  const filteredPending = pending.filter(filterFn)
  const filteredAutoCreated = autoCreated.filter(filterFn)

  // Counts
  const countZakup = pendingReview.filter(e => e.typ_dokumentu !== 'sprzedaz').length 
                   + pending.filter(e => e.typ_dokumentu !== 'sprzedaz').length 
                   + autoCreated.filter(e => e.typ_dokumentu !== 'sprzedaz').length
  
  const countSprzedaz = pendingReview.filter(e => e.typ_dokumentu === 'sprzedaz').length 
                      + pending.filter(e => e.typ_dokumentu === 'sprzedaz').length 
                      + autoCreated.filter(e => e.typ_dokumentu === 'sprzedaz').length
                      
  const countAll = countZakup + countSprzedaz

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-6 p-1 bg-white rounded-lg shadow-sm border border-[#E2E8F0] w-fit">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setFilter('all')}
          className={cn("text-sm", filter === 'all' && "bg-[#1E293B] text-white hover:bg-[#1E293B] hover:text-white")}
        >
          Wszystkie ({countAll})
        </Button>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setFilter('zakup')}
          className={cn("text-sm", filter === 'zakup' && "bg-orange-100 text-orange-900 hover:bg-orange-200 hover:text-orange-900")}
        >
          🔻 Zakupy ({countZakup})
        </Button>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setFilter('sprzedaz')}
          className={cn("text-sm", filter === 'sprzedaz' && "bg-green-100 text-green-900 hover:bg-green-200 hover:text-green-900")}
        >
          🔺 Sprzedaż ({countSprzedaz})
        </Button>
      </div>

      {countAll === 0 ? (
        <div className="text-slate-500 text-center py-12 bg-white border border-dashed rounded-lg">
          Brak faktur dla tego klienta.
        </div>
      ) : (filteredPendingReview.length + filteredPending.length + filteredAutoCreated.length) === 0 ? (
        <div className="text-slate-500 text-center py-12 bg-white border border-dashed rounded-lg">
          Brak faktur tego typu w tej sekcji. Spróbuj zmienić filtr.
        </div>
      ) : null}

      {filteredPendingReview.length > 0 && (
        <section className="mb-8">
          <h2 className="sticky top-[120px] z-30 bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2 rounded-lg font-bold shadow-sm mb-4">
            Czeka na akceptację ({filteredPendingReview.length})
          </h2>
          <div className="space-y-4 min-w-0">
            {filteredPendingReview.map((exc, idx) => (
              <FakturaCard 
                key={exc.id} 
                stan="pending_review" 
                exception={exc} 
                isActive={idx === 0} 
                clientOpisy={clientOpisyMap.get(exc.client_nip) ?? []} 
                clientPojazdy={clientPojazdyMap[exc.client_nip] ?? []}
              />
            ))}
          </div>
        </section>
      )}

      {filteredPending.length > 0 && (
        <section className="mb-8">
          <h2 className="bg-red-50 border border-red-200 text-red-900 px-4 py-2 rounded-lg font-bold shadow-sm mb-4">
            Wymaga decyzji ({filteredPending.length})
          </h2>
          <div className="space-y-4 min-w-0">
            {filteredPending.map((exc) => (
              <FakturaCard 
                key={exc.id} 
                stan="pending" 
                exception={exc} 
                isActive={false} 
                clientOpisy={clientOpisyMap.get(exc.client_nip) ?? []} 
                clientPojazdy={clientPojazdyMap[exc.client_nip] ?? []}
              />
            ))}
          </div>
        </section>
      )}

      {filteredAutoCreated.length > 0 && (
        <section>
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="bg-green-50 border border-green-200 text-green-900 px-4 py-2 rounded-lg font-bold shadow-sm w-full flex items-center justify-between mb-4 hover:bg-green-100 transition-colors">
              <span>Zaksięgowane dziś ({filteredAutoCreated.length})</span>
              <ChevronDown className="w-5 h-5" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 min-w-0">
              {filteredAutoCreated.map((exc) => (
                <FakturaCard 
                  key={exc.id} 
                  stan="auto_created" 
                  exception={exc} 
                  isActive={false} 
                  clientOpisy={[]} 
                  clientPojazdy={clientPojazdyMap[exc.client_nip] ?? []}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        </section>
      )}
    </>
  )
}
