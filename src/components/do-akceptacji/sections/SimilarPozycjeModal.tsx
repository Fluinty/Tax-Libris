'use client'

import { useEffect, useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Loader2, Search } from 'lucide-react'
import { getSimilarPozycje } from '@/app/(auth)/do-akceptacji/pozycje-actions'
import { getKolumnyForTyp } from '@/lib/kpir'

interface SimilarResult {
  id: number
  nazwa: string
  effective_kolumna_kpir: number | null
  effective_kategoria: string | null
  effective_gtu_bits: number | null
  edytowane_przez_monike: boolean
  similarity: number
  faktura_id: number
  created_at: string
}

interface Props {
  pozycjaId: number
  pozycjaNazwa: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SimilarPozycjeModal({ pozycjaId, pozycjaNazwa, open, onOpenChange }: Props) {
  const [results, setResults] = useState<SimilarResult[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!open || !pozycjaId) return
    setIsLoading(true)
    getSimilarPozycje(pozycjaId, 10)
      .then(data => setResults(data as SimilarResult[]))
      .catch(() => setResults([]))
      .finally(() => setIsLoading(false))
  }, [open, pozycjaId])

  const kolumny = getKolumnyForTyp('zakup') // default for label lookup
  const allKolumny = [...getKolumnyForTyp('zakup'), ...getKolumnyForTyp('sprzedaz')]

  function kolLabel(numer: number | null): string {
    if (numer == null) return '—'
    const k = allKolumny.find(k => k.numer === numer)
    return k ? `kol. ${k.numer}` : `kol. ${numer}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4 text-[#4A90E2]" />
            Podobne historyczne pozycje
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1 truncate">
            Dla: &quot;{pozycjaNazwa}&quot;
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Szukam podobnych pozycji...
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Brak podobnych pozycji w historii tego klienta.
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((r, i) => {
                const simPct = Math.round(r.similarity * 100)
                return (
                  <div
                    key={r.id}
                    className={`rounded-lg border p-3 text-sm transition-colors ${
                      r.edytowane_przez_monike
                        ? 'border-green-200 bg-green-50/50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {r.edytowane_przez_monike && (
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[#1E293B] truncate">
                          {r.nazwa}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              r.edytowane_przez_monike
                                ? 'bg-green-100 text-green-700 border-green-300'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {kolLabel(r.effective_kolumna_kpir)}
                          </Badge>
                          {r.effective_kategoria && (
                            <span className="text-slate-400">{r.effective_kategoria}</span>
                          )}
                          <span className="text-slate-300">·</span>
                          <span className={`font-mono ${simPct >= 85 ? 'text-green-600' : simPct >= 70 ? 'text-amber-600' : 'text-slate-400'}`}>
                            sim={simPct}%
                          </span>
                          {r.edytowane_przez_monike && (
                            <span className="text-green-600 font-medium">Monika ✓</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t bg-slate-50 text-[11px] text-slate-400 shrink-0">
          Wyniki na bazie embeddingów Gemini (1536 dim) z historii tego klienta.
          ✅ = pozycja skorygowana ręcznie przez księgową (ground truth).
        </div>
      </DialogContent>
    </Dialog>
  )
}
