'use client'

import { Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface AnomaliaHistorii {
  typ: string
  szczegol: string
  severity: string
}

interface AnomalieHistoriiSectionProps {
  anomalie: AnomaliaHistorii[] | null | undefined
}

const TYP_LABELS: Record<string, string> = {
  vendor_kolumna_odchylenie: 'Kontrahent',
  pozycja_kolumna_odchylenie: 'Pozycja',
  kwota_odstajaca: 'Kwota',
}

export function AnomalieHistoriiSection({ anomalie }: AnomalieHistoriiSectionProps) {
  if (!anomalie || anomalie.length === 0) return null

  return (
    <div className="mb-4 bg-blue-50/70 border border-blue-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-blue-200/60 flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-500" />
        <span className="text-[13px] font-semibold text-blue-800">
          Warto zerknąć — inaczej niż zwykle
        </span>
        <Badge className="bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-100 h-5 min-w-[20px] justify-center text-[11px] font-semibold">
          {anomalie.length}
        </Badge>
      </div>
      <ul className="px-3 py-2.5 space-y-1.5">
        {anomalie.map((a, i) => {
          const label = TYP_LABELS[a.typ]
          return (
            <li key={i} className="flex items-start gap-2 text-sm text-blue-900/80">
              <span className="text-blue-400 mt-0.5 shrink-0">•</span>
              <span>
                {label && (
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mr-1.5">
                    {label}
                  </span>
                )}
                {a.szczegol}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
