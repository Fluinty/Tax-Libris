'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FileText, Pencil, ChevronsUpDown, Search, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { FakturaPozycja, TypDokumentu } from '@/types/database'
import { getKolumnyForTyp } from '@/lib/kpir'
import { updatePozycjaKpir } from '@/app/(auth)/do-akceptacji/pozycje-actions'
import { SimilarPozycjeModal } from './SimilarPozycjeModal'

interface Props {
  pozycje: FakturaPozycja[]
  typDokumentu: TypDokumentu | string | null
  readOnly?: boolean
}

export function PozycjeFakturySection({ pozycje, typDokumentu, readOnly = false }: Props) {
  const [isPending, startTransition] = useTransition()
  const [similarModalPozycjaId, setSimilarModalPozycjaId] = useState<number | null>(null)
  const kolumny = getKolumnyForTyp(typDokumentu)

  const editedCount = pozycje.filter(p => p.edytowane_przez_monike).length
  const walidatorCount = pozycje.filter(p => p.walidator_zmiana).length

  const handleKolumnaChange = (pozycjaId: number, newKolumna: string) => {
    startTransition(async () => {
      const result = await updatePozycjaKpir(pozycjaId, parseInt(newKolumna))
      if (result.success) {
        toast.success('Kolumna KPiR zaktualizowana')
      } else {
        toast.error('Błąd', { description: result.error })
      }
    })
  }

  const PozycjaRow = ({ poz }: { poz: FakturaPozycja }) => {
    const effectiveKol = poz.effective_kolumna_kpir
    const kolDef = kolumny.find(k => k.numer === effectiveKol)
    const isInvalid = effectiveKol != null && !kolumny.some(k => k.numer === effectiveKol)

    return (
      <div className={`py-2.5 px-3 border-b border-slate-100 last:border-0 ${poz.edytowane_przez_monike ? 'bg-blue-50/50' : ''}`}>
        <div className="flex items-start gap-3">
          {/* LP + Nazwa */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[#1E293B] text-sm mb-0.5 flex items-center gap-1.5">
              <span className="text-slate-400 font-normal text-xs">[LP {poz.lp}]</span>
              <span className="truncate">{poz.nazwa}</span>
              {poz.edytowane_przez_monike && (
                <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0 shrink-0">
                  <Pencil className="w-2.5 h-2.5 mr-0.5" />edytowane
                </Badge>
              )}
              {poz.walidator_zmiana && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 shrink-0">
                  <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />walidator
                </Badge>
              )}
            </div>
            <div className="text-[12px] text-slate-500">
              {poz.wartosc_netto != null ? `${Number(poz.wartosc_netto).toFixed(2)} zł netto` : ''}
              {poz.ilosc != null && ` · ilość: ${poz.ilosc} ${poz.jednostka || ''}`}
              {poz.stawka_vat && ` · VAT ${poz.stawka_vat}%`}
            </div>
          </div>

          {/* Kolumna KPiR dropdown */}
          <div className="shrink-0 w-[200px]">
            {readOnly ? (
              <span className={`text-sm font-medium px-2 py-1 rounded-md ${isInvalid ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-[#1F3A5F]'}`}>
                {kolDef ? `Kol. ${kolDef.numer} (${kolDef.labelKrotki})` : effectiveKol != null ? `Kol. ${effectiveKol}` : '—'}
              </span>
            ) : (
              <Select
                value={effectiveKol?.toString() ?? ''}
                onValueChange={(v) => v && handleKolumnaChange(poz.id, v)}
                disabled={isPending}
              >
                <SelectTrigger className={`h-8 text-xs w-full ${isInvalid ? 'border-orange-300 bg-orange-50' : ''}`}>
                  <SelectValue placeholder="Kolumna..." />
                </SelectTrigger>
                <SelectContent>
                  {kolumny.map(k => (
                    <SelectItem key={k.numer} value={k.numer.toString()}>
                      Kol. {k.numer} — {k.labelKrotki}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Podobne button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-slate-500 hover:text-[#4A90E2] shrink-0 px-2"
            onClick={() => setSimilarModalPozycjaId(poz.id)}
          >
            <Search className="w-3.5 h-3.5 mr-1" />
            Podobne
          </Button>
        </div>
      </div>
    )
  }

  if (!pozycje.length) return null

  return (
    <>
      <div className="mt-4 mb-2 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-[13px] font-semibold text-slate-700 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          Pozycje faktury ({pozycje.length})
          {editedCount > 0 && (
            <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">
              {editedCount} edytowanych
            </Badge>
          )}
          {walidatorCount > 0 && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
              {walidatorCount} przepięte
            </Badge>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          {pozycje.length > 5 ? (
            <Collapsible>
              {pozycje.slice(0, 5).map(poz => (
                <PozycjaRow key={poz.id} poz={poz} />
              ))}
              <CollapsibleContent>
                {pozycje.slice(5).map(poz => (
                  <PozycjaRow key={poz.id} poz={poz} />
                ))}
              </CollapsibleContent>
              <CollapsibleTrigger className="w-full py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-2 text-xs font-medium transition-colors">
                <ChevronsUpDown className="w-3.5 h-3.5" />
                Pokaż wszystkie pozycje ({pozycje.length})
              </CollapsibleTrigger>
            </Collapsible>
          ) : (
            pozycje.map(poz => (
              <PozycjaRow key={poz.id} poz={poz} />
            ))
          )}
        </div>
      </div>

      {/* Similar positions modal */}
      {similarModalPozycjaId && (
        <SimilarPozycjeModal
          pozycjaId={similarModalPozycjaId}
          pozycjaNazwa={pozycje.find(p => p.id === similarModalPozycjaId)?.nazwa || ''}
          open={!!similarModalPozycjaId}
          onOpenChange={(open) => !open && setSimilarModalPozycjaId(null)}
        />
      )}
    </>
  )
}
