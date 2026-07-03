'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FileText, Pencil, ChevronsUpDown, Search, AlertTriangle, Scale, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { FakturaPozycja, TypDokumentu } from '@/types/database'
import { getKolumnyForTyp } from '@/lib/kpir'
import { formatGtuBadgeList } from '@/lib/jpk-helpers'
import { updatePozycjaWymiar } from '@/app/(auth)/do-akceptacji/pozycje-actions'
import { SimilarPozycjeModal } from './SimilarPozycjeModal'

// ── Label maps ──

const KUP_OPTIONS = [
  { value: 'kup', label: '✅ KUP', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'nkup', label: '❌ NKUP', color: 'bg-red-100 text-red-700 border-red-300' },
] as const

const VAT_OPTIONS = [
  { value: 'pelny', label: '🟢 100%', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'brak', label: '🔴 BRAK', color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'czesciowe_50', label: '🔶 50%', color: 'bg-amber-100 text-amber-700 border-amber-300' },
] as const

function getKupStyle(status: string | null) {
  return KUP_OPTIONS.find(o => o.value === status) ?? KUP_OPTIONS[0]
}

function getVatStyle(status: string | null) {
  return VAT_OPTIONS.find(o => o.value === status) ?? VAT_OPTIONS[0]
}

// ── Component ──

interface Props {
  pozycje: FakturaPozycja[]
  typDokumentu: TypDokumentu | string | null
  readOnly?: boolean
}

export function PozycjeFakturySection({ pozycje, typDokumentu, readOnly = false }: Props) {
  const [isPending, startTransition] = useTransition()
  const [similarModalPozycjaId, setSimilarModalPozycjaId] = useState<number | null>(null)
  const router = useRouter()
  const kolumny = getKolumnyForTyp(typDokumentu)
  const isSprzedaz = typDokumentu === 'sprzedaz'

  const editedCount = pozycje.filter(p => p.edytowane_przez_monike).length
  const walidatorCount = pozycje.filter(p => p.walidator_zmiana).length
  const nkupCount = pozycje.filter(p => p.effective_kup_status === 'nkup').length

  const handleWymiarChange = (pozycjaId: number, wymiar: 'kolumna_kpir' | 'kup_status' | 'vat_odliczalny', value: string) => {
    startTransition(async () => {
      const val = wymiar === 'kolumna_kpir' ? parseInt(value) : value
      const result = await updatePozycjaWymiar(pozycjaId, wymiar, val)
      if (result.success) {
        const labels: Record<string, string> = {
          kolumna_kpir: 'Kolumna KPiR',
          kup_status: 'Status KUP',
          vat_odliczalny: 'VAT odliczalny',
        }
        toast.success(`${labels[wymiar]} zaktualizowane`)
        // Odśwież stronę po zmianie KUP/VAT żeby przeliczyć pozycje VAT
        if (wymiar === 'kup_status' || wymiar === 'vat_odliczalny') {
          router.refresh()
        }
      } else {
        toast.error('Błąd', { description: result.error })
      }
    })
  }

  const PozycjaRow = ({ poz }: { poz: FakturaPozycja }) => {
    const effectiveKol = poz.effective_kolumna_kpir
    const kolDef = kolumny.find(k => k.numer === effectiveKol)
    const isInvalid = effectiveKol != null && !kolumny.some(k => k.numer === effectiveKol)
    const kupStyle = getKupStyle(poz.effective_kup_status)
    const vatStyle = getVatStyle(poz.effective_vat_odliczalny)
    const podstawaPrawna = poz.final_podstawa_prawna || poz.ai_podstawa_prawna

    return (
      <div className={`py-2.5 px-3 border-b border-slate-100 last:border-0 ${poz.edytowane_przez_monike ? 'bg-blue-50/50' : ''}`}>
        {/* Row 1: LP + Nazwa + badges */}
        <div className="flex items-start gap-2 mb-1.5">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[#1E293B] text-sm mb-0.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-400 font-normal text-xs">[LP {poz.lp}]</span>
              <TooltipProvider delay={300}>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="truncate max-w-[400px] cursor-help block text-left">{poz.nazwa}</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md text-sm">
                    {poz.nazwa}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
              {isSprzedaz && (poz.effective_gtu_bits ?? 0) > 0 && formatGtuBadgeList(poz.effective_gtu_bits!).map(gtuCode => (
                <Badge key={gtuCode} variant="outline" className="bg-slate-100 text-slate-600 border-slate-300 text-[10px] px-1.5 py-0 shrink-0 font-mono">
                  {gtuCode}
                </Badge>
              ))}
            </div>
            <div className="text-[12px] text-slate-500">
              {poz.wartosc_netto != null ? `${Number(poz.wartosc_netto).toFixed(2)} zł netto` : ''}
              {poz.wartosc_brutto != null && ` / ${Number(poz.wartosc_brutto).toFixed(2)} zł brutto`}
              {poz.ilosc != null && ` · ilość: ${poz.ilosc} ${poz.jednostka || ''}`}
              {poz.stawka_vat && ` · VAT ${poz.stawka_vat}%`}
            </div>
          </div>
          {/* Podobne button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-slate-500 hover:text-[#4A90E2] shrink-0 px-2"
            onClick={() => setSimilarModalPozycjaId(poz.id)}
          >
            <Search className="w-3.5 h-3.5 mr-1" />
            Podobne
          </Button>
        </div>

        {/* Row 2: 3 dimension controls */}
        <div className="flex items-center gap-2 flex-wrap ml-8">
          {/* Dim 1: Kolumna KPiR */}
          {readOnly ? (
            <span className={`text-xs font-medium px-2 py-1 rounded-md ${isInvalid ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-[#1F3A5F]'}`}>
              {kolDef ? `Kol. ${kolDef.numer} (${kolDef.labelKrotki})` : effectiveKol != null ? `Kol. ${effectiveKol}` : '—'}
            </span>
          ) : (
            <Select
              value={effectiveKol?.toString() ?? ''}
              onValueChange={(v) => v && handleWymiarChange(poz.id, 'kolumna_kpir', v)}
              disabled={isPending}
            >
              <SelectTrigger className={`h-7 text-xs w-[200px] ${isInvalid ? 'border-orange-300 bg-orange-50' : ''}`}>
                {kolDef ? (
                  <span className="truncate">{kolDef.numer} — {kolDef.labelKrotki}</span>
                ) : effectiveKol != null ? (
                  <span>Kol. {effectiveKol}</span>
                ) : (
                  <SelectValue placeholder="Kolumna..." />
                )}
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

          {/* Dim 2: KUP/NKUP — tylko dla zakupow */}
          {!isSprzedaz && (
            readOnly ? (
              <TooltipProvider delay={300}>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className={`${kupStyle.color} text-[11px] px-2 py-0.5 cursor-help`}>
                      {kupStyle.label}
                    </Badge>
                  </TooltipTrigger>
                  {podstawaPrawna && (
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      <div className="flex items-center gap-1.5 mb-1 font-medium text-slate-700">
                        <Scale className="w-3 h-3" />
                        Podstawa prawna
                      </div>
                      <p className="text-slate-600">{podstawaPrawna}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            ) : (
              <div>
                <Select
                  value={poz.effective_kup_status ?? 'kup'}
                  onValueChange={(v) => v && handleWymiarChange(poz.id, 'kup_status', v)}
                  disabled={isPending}
                >
                  <SelectTrigger className={`h-7 text-xs w-[105px] border ${kupStyle.color}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KUP_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          )}

          {/* Dim 3: VAT odliczalny — tylko dla zakupow */}
          {!isSprzedaz && (
            readOnly ? (
              <TooltipProvider delay={300}>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className={`${vatStyle.color} text-[11px] px-2 py-0.5 cursor-help`}>
                      VAT {vatStyle.label}
                    </Badge>
                  </TooltipTrigger>
                  {podstawaPrawna && (
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      <div className="flex items-center gap-1.5 mb-1 font-medium text-slate-700">
                        <ShieldCheck className="w-3 h-3" />
                        Podstawa prawna VAT
                      </div>
                      <p className="text-slate-600">{podstawaPrawna}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            ) : (
              <div>
                <Select
                  value={poz.effective_vat_odliczalny ?? 'pelny'}
                  onValueChange={(v) => v && handleWymiarChange(poz.id, 'vat_odliczalny', v)}
                  disabled={isPending}
                >
                  <SelectTrigger className={`h-7 text-xs w-[115px] border ${vatStyle.color}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        VAT {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          )}
        </div>
      </div>
    )
  }

  if (!pozycje.length) return null

  return (
    <>
      <div className="mt-4 mb-2 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-[13px] font-semibold text-slate-700 flex items-center gap-2 flex-wrap">
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
          {!isSprzedaz && nkupCount > 0 && (
            <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">
              {nkupCount} NKUP
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
