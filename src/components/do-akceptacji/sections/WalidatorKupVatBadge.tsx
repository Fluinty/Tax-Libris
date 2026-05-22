'use client'

import { ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { WalidatorKupVatWarning } from '@/types/database'

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

const POWOD_LABELS: Record<string, string> = {
  noclegi_art88: 'Usługi noclegowe — art. 88 ust. 1 pkt 4',
  gastro_art88: 'Usługi gastronomiczne — art. 88 ust. 1 pkt 4',
  catering_wyjatek: 'Catering — wyjątek, VAT odliczalny',
  reprezentacja_art23: 'Reprezentacja — art. 23 ust. 1 pkt 23',
  kary_art23: 'Kary/mandaty — art. 23 ust. 1 pkt 15',
  wlasciciel_art23: 'Składki właściciela — art. 23 ust. 1 pkt 10',
}

function powodLabel(powod: string): string {
  return POWOD_LABELS[powod] || powod
}

function pluralize(count: number): string {
  if (count === 1) return 'pozycję'
  if (count >= 2 && count <= 4) return 'pozycje'
  return 'pozycji'
}

function poleLabel(pole: string): string {
  return pole === 'vat_odliczalny' ? 'VAT' : 'KUP'
}

interface Props {
  warnings: WalidatorKupVatWarning[]
}

export function WalidatorKupVatBadge({ warnings }: Props) {
  if (!warnings || warnings.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-amber-900">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        Walidator KUP/VAT skorygował {warnings.length} {pluralize(warnings.length)}
      </div>
      <ul className="mt-2 space-y-1.5 text-amber-800">
        {warnings.map((w, i) => (
          <li key={i} className="flex items-center gap-1.5 flex-wrap text-[13px]">
            <span className="font-mono text-xs text-amber-600">LP={w.lp}</span>
            <span className="truncate max-w-[250px]">&quot;{truncate(w.nazwa, 50)}&quot;</span>
            <span className="text-amber-600">—</span>
            <span className="font-medium">{poleLabel(w.pole)}</span>
            <code className="text-xs bg-amber-100 px-1 rounded">{w.stara_wartosc}</code>
            <span>→</span>
            <code className="text-xs bg-amber-200 px-1 rounded font-medium">{w.nowa_wartosc}</code>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="ml-1 text-[10px] text-amber-700 border-amber-300 bg-amber-100/50 cursor-help">
                    {powodLabel(w.powod)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  {w.podstawa_prawna}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-700 leading-relaxed">
        AI klasyfikator zaklasyfikował te pozycje jako pełen VAT/KUP, ale walidator 
        wykrył wyjątek (art. 88 VAT / art. 23 PIT). Sprawdź czy poprawnie — 
        możesz cofnąć w sekcji &quot;Pozycje faktury&quot;.
      </p>
    </div>
  )
}
