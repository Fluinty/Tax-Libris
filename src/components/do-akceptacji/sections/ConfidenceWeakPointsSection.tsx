'use client'

import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CollapsibleJpkSection } from './CollapsibleJpkSection'
import { sortReasonsByScore, type ConfidenceReason } from '@/lib/confidence-helpers'

interface ConfidenceWeakPointsSectionProps {
  confidenceOverall: number | null | undefined
  confidenceReasons: ConfidenceReason[] | null | undefined
}

export function ConfidenceWeakPointsSection({
  confidenceOverall,
  confidenceReasons,
}: ConfidenceWeakPointsSectionProps) {
  const sorted = sortReasonsByScore(confidenceReasons)
  const weakDims = sorted.filter(r => r.score < 0.85)
  const okDims = sorted.filter(r => r.score >= 0.85)
  const score = confidenceOverall ?? 1.0

  // Don't render at all if no reasons data
  if (!confidenceReasons || confidenceReasons.length === 0) return null

  // If all dimensions are OK, just show a small badge  
  if (weakDims.length === 0) return null

  const badge = (
    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px] h-5">
      {weakDims.length} {weakDims.length === 1 ? 'wymiar' : weakDims.length < 5 ? 'wymiary' : 'wymiarów'}
    </Badge>
  )

  const dimIcons: Record<string, string> = {
    ai_klasyfikacja: '🤖',
    biala_lista: '📋',
    duplikat: '🔁',
    data: '📅',
    kontrahent: '👤',
    rachunek: '🏦',         // NOWE
    srodek_trwaly: '🏗️',    // NOWE
  };

  return (
    <CollapsibleJpkSection
      title="⚠ Co AI nie jest pewne"
      badge={badge}
      defaultOpen={score < 0.85}
      icon={<AlertCircle className="w-4 h-4 text-yellow-600" />}
    >
      <div className="space-y-2">
        {weakDims.map((reason, i) => {
          const icon = dimIcons[reason.dim] || '⚠️';
          return (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="shrink-0 mt-0.5" aria-hidden="true">{icon}</span>
              <div>
                <span className="font-medium text-slate-800">{reason.dim}</span>
                <span className="text-slate-400 mx-1">({Math.round(reason.score * 100)}%)</span>
                <span className="text-slate-600">— {reason.msg}</span>
              </div>
            </div>
          )
        })}
        {okDims.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-green-700 mt-1">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Pozostałe {okDims.length} {okDims.length === 1 ? 'wymiar' : okDims.length < 5 ? 'wymiary' : 'wymiarów'} OK</span>
          </div>
        )}
      </div>
    </CollapsibleJpkSection>
  )
}
