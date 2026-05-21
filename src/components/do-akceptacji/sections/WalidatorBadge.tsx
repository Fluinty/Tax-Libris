'use client'

import { ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { WalidatorWarning } from '@/types/database'

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

function powodLabel(powod: string): string {
  switch (powod) {
    case 'usluga_obca_bez_materialu':
      return 'Usługa bez materiału na FV'
    case 'usluga_obca_z_materialem_na_fakturze':
      return 'Usługa z materiałem (kol. 11)'
    default:
      return powod
  }
}

function pluralize(count: number): string {
  if (count === 1) return 'pozycję'
  if (count >= 2 && count <= 4) return 'pozycje'
  return 'pozycji'
}

interface Props {
  warnings: WalidatorWarning[]
}

export function WalidatorBadge({ warnings }: Props) {
  if (!warnings || warnings.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-amber-900">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        Walidator usługi obcej przepiął {warnings.length} {pluralize(warnings.length)}
      </div>
      <ul className="mt-2 space-y-1 text-amber-800">
        {warnings.map((w, i) => (
          <li key={i} className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs text-amber-600">LP={w.lp}</span>
            <span className="truncate max-w-[280px]">&quot;{truncate(w.nazwa, 50)}&quot;</span>
            <span className="text-amber-600">—</span>
            <span>z kol.{w.stara_kolumna} → kol.{w.nowa_kolumna}</span>
            <Badge variant="outline" className="ml-1 text-[10px] text-amber-700 border-amber-300 bg-amber-100/50">
              {powodLabel(w.powod)}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-700 leading-relaxed">
        AI klasyfikator zaklasyfikował te pozycje jako materiał (kol. 10/11). 
        Walidator wykrył że to usługa obca bez powiązanego materiału i przepiął na kol. 13 
        (lub kol. 11 jeśli na fakturze jest też materiał). 
        Sprawdź czy poprawnie — możesz cofnąć w sekcji &quot;Pozycje faktury&quot;.
      </p>
    </div>
  )
}
