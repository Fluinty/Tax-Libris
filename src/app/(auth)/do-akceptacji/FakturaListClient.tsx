'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FakturaCard } from '@/components/do-akceptacji/FakturaCard'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ClientPojazd } from '@/types/database'
import { fakturaWymagaUwagi } from '@/lib/faktura-uwaga'

interface FakturaListClientProps {
  pendingReview: any[]
  pending: any[]
  autoCreated: any[]
  clientOpisyMap: Map<string, any[]>
  clientPojazdyMap?: Record<string, ClientPojazd[]>
}

type FilterType = 'all' | 'zakup' | 'sprzedaz'
type UwagaFilterType = 'all' | 'czyste' | 'uwaga'
type SortType = 'oldest' | 'newest' | 'conf_desc' | 'conf_asc' | 'amount_desc' | 'highest'

export function FakturaListClient({ pendingReview, pending, autoCreated, clientOpisyMap, clientPojazdyMap = {} }: FakturaListClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [typ, setTyp] = useState<FilterType>(() => (searchParams?.get('typ') as FilterType) || 'all')
  const [uwaga, setUwaga] = useState<UwagaFilterType>(() => (searchParams?.get('uwaga') as UwagaFilterType) || 'all')
  const [sort, setSort] = useState<SortType>(() => (searchParams?.get('sort') as SortType) || 'oldest')

  // Optimistic: track locally-resolved (approved/ignored) ids for instant UI removal
  const [resolvedIds, setResolvedIds] = useState<Set<number>>(new Set())

  const handleResolved = useCallback((id: number) => {
    setResolvedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  // Reset resolvedIds when server delivers fresh props (they already exclude resolved items)
  const propsRef = useRef({ pendingReview, pending, autoCreated })
  useEffect(() => {
    if (
      propsRef.current.pendingReview !== pendingReview ||
      propsRef.current.pending !== pending ||
      propsRef.current.autoCreated !== autoCreated
    ) {
      propsRef.current = { pendingReview, pending, autoCreated }
      setResolvedIds(new Set())
    }
  }, [pendingReview, pending, autoCreated])

  // Synchronize state when URL searchParams change externally (e.g. sidebar navigation)
  useEffect(() => {
    if (!searchParams) return
    const t = (searchParams.get('typ') as FilterType) || 'all'
    const u = (searchParams.get('uwaga') as UwagaFilterType) || 'all'
    const s = (searchParams.get('sort') as SortType) || 'oldest'
    if (t !== typ) setTyp(t)
    if (u !== uwaga) setUwaga(u)
    if (s !== sort) setSort(s)
  }, [searchParams])

  const updateUrlParams = (updates: { typ?: FilterType; uwaga?: UwagaFilterType; sort?: SortType }) => {
    const sp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    
    if (updates.typ !== undefined) {
      if (updates.typ === 'all') sp.delete('typ')
      else sp.set('typ', updates.typ)
    }
    if (updates.uwaga !== undefined) {
      if (updates.uwaga === 'all') sp.delete('uwaga')
      else sp.set('uwaga', updates.uwaga)
    }
    if (updates.sort !== undefined) {
      if (updates.sort === 'oldest') sp.delete('sort')
      else sp.set('sort', updates.sort)
    }

    const qs = sp.toString()
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', newUrl)
  }

  const handleTypChange = (newTyp: FilterType) => {
    setTyp(newTyp)
    updateUrlParams({ typ: newTyp })
  }

  const handleUwagaChange = (newUwaga: UwagaFilterType) => {
    setUwaga(newUwaga)
    updateUrlParams({ uwaga: newUwaga })
  }

  const handleSortChange = (newSort: SortType) => {
    setSort(newSort)
    updateUrlParams({ sort: newSort })
  }

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

  const typFilterFn = (e: any) => {
    if (typ === 'all') return true
    const isSprzedaz = e.typ_dokumentu === 'sprzedaz'
    if (typ === 'sprzedaz') return isSprzedaz
    return !isSprzedaz // traktujemy null i cokolwiek innego jako 'zakup'
  }

  const uwagaFilterFn = (e: any) => {
    if (uwaga === 'all') return true
    const reqAtt = fakturaWymagaUwagi(e)
    if (uwaga === 'czyste') return !reqAtt
    return reqAtt // uwaga === 'uwaga'
  }

  const sortFn = (a: any, b: any) => {
    if (sort === 'oldest') {
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    }
    if (sort === 'newest') {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    }
    if (sort === 'conf_desc') {
      const ca = typeof a.confidence_overall === 'number' ? a.confidence_overall : (typeof a.ai_confidence === 'number' ? a.ai_confidence : 1.0)
      const cb = typeof b.confidence_overall === 'number' ? b.confidence_overall : (typeof b.ai_confidence === 'number' ? b.ai_confidence : 1.0)
      return cb - ca
    }
    if (sort === 'conf_asc') {
      const ca = typeof a.confidence_overall === 'number' ? a.confidence_overall : (typeof a.ai_confidence === 'number' ? a.ai_confidence : 1.0)
      const cb = typeof b.confidence_overall === 'number' ? b.confidence_overall : (typeof b.ai_confidence === 'number' ? b.ai_confidence : 1.0)
      return ca - cb
    }
    if (sort === 'amount_desc' || sort === 'highest') {
      const aa = Number(a.kwota_brutto ?? a.ai_kwoty_per_kolumna?.brutto ?? 0)
      const ab = Number(b.kwota_brutto ?? b.ai_kwoty_per_kolumna?.brutto ?? 0)
      return ab - aa
    }
    return 0
  }

  // Base filter: exclude optimistically-resolved items
  const notResolved = (e: any) => !resolvedIds.has(e.id)

  const allItemsForCounters = [...pendingReview, ...pending, ...autoCreated].filter(notResolved)

  // Counts for Typ tabs (filtered by current uwaga filter)
  const itemsMatchingUwaga = allItemsForCounters.filter(uwagaFilterFn)
  const countZakup = itemsMatchingUwaga.filter(e => e.typ_dokumentu !== 'sprzedaz').length
  const countSprzedaz = itemsMatchingUwaga.filter(e => e.typ_dokumentu === 'sprzedaz').length
  const countAll = countZakup + countSprzedaz

  // Counts for Uwaga tabs (filtered by current typ filter)
  const itemsMatchingTyp = allItemsForCounters.filter(typFilterFn)
  const uwagaCountCzyste = itemsMatchingTyp.filter(e => !fakturaWymagaUwagi(e)).length
  const uwagaCountUwaga = itemsMatchingTyp.filter(e => fakturaWymagaUwagi(e)).length
  const uwagaCountAll = uwagaCountCzyste + uwagaCountUwaga

  // Final filtered & sorted items
  const filteredPendingReview = pendingReview.filter(e => notResolved(e) && typFilterFn(e) && uwagaFilterFn(e)).sort(sortFn)
  const filteredPending = pending.filter(e => notResolved(e) && typFilterFn(e) && uwagaFilterFn(e)).sort(sortFn)
  const filteredAutoCreated = autoCreated.filter(e => notResolved(e) && typFilterFn(e) && uwagaFilterFn(e)).sort(sortFn)

  return (
    <>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6 bg-white p-3 rounded-xl border border-[#E2E8F0] shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          {/* Taby typu dokumentu */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleTypChange('all')}
              className={cn("text-xs sm:text-sm h-8 px-2.5 font-medium", typ === 'all' && "bg-[#1E293B] text-white hover:bg-[#1E293B] hover:text-white shadow-sm")}
            >
              Wszystkie ({countAll})
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleTypChange('zakup')}
              className={cn("text-xs sm:text-sm h-8 px-2.5 font-medium", typ === 'zakup' && "bg-orange-100 text-orange-900 hover:bg-orange-200 hover:text-orange-900 shadow-sm")}
            >
              🔻 Zakupy ({countZakup})
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleTypChange('sprzedaz')}
              className={cn("text-xs sm:text-sm h-8 px-2.5 font-medium", typ === 'sprzedaz' && "bg-green-100 text-green-900 hover:bg-green-200 hover:text-green-900 shadow-sm")}
            >
              🔺 Sprzedaż ({countSprzedaz})
            </Button>
          </div>

          <div className="hidden sm:block h-6 w-px bg-slate-200" />

          {/* Segment filtrów uwagi */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleUwagaChange('all')}
              className={cn("text-xs sm:text-sm h-8 px-2.5 font-medium", uwaga === 'all' && "bg-white text-[#1E293B] shadow-sm hover:bg-white")}
            >
              Wszystkie ({uwagaCountAll})
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleUwagaChange('czyste')}
              className={cn("text-xs sm:text-sm h-8 px-2.5 font-medium text-emerald-800", uwaga === 'czyste' && "bg-emerald-100 text-emerald-900 shadow-sm hover:bg-emerald-100")}
            >
              ✨ Czyste ({uwagaCountCzyste})
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleUwagaChange('uwaga')}
              className={cn("text-xs sm:text-sm h-8 px-2.5 font-medium text-amber-800", uwaga === 'uwaga' && "bg-amber-100 text-amber-900 shadow-sm hover:bg-amber-100")}
            >
              ⚠️ Wymaga uwagi ({uwagaCountUwaga})
            </Button>
          </div>
        </div>

        {/* Sortowanie po prawej */}
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:inline">Sortuj:</span>
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value as SortType)}
            className="h-8.5 text-xs sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#4A90E2] cursor-pointer shadow-2xs"
          >
            <option value="oldest">Najstarsze (domyślnie)</option>
            <option value="newest">Najnowsze</option>
            <option value="conf_desc">Pewność ↓</option>
            <option value="conf_asc">Pewność ↑</option>
            <option value="amount_desc">Kwota ↓</option>
          </select>
        </div>
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
                onResolved={handleResolved}
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
                onResolved={handleResolved}
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
                  onResolved={handleResolved}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        </section>
      )}
    </>
  )
}
