'use client'

import { Badge } from '@/components/ui/badge'
import { ShieldAlert, ShieldCheck, Lightbulb } from 'lucide-react'
import type { AiReviewLog } from '@/types/database'
import { getMaxSeverity, SEVERITY_STYLES, TYP_LABELS } from '@/lib/ai-review'

interface AiReviewSectionProps {
  review: AiReviewLog
}

export function AiReviewSection({ review }: AiReviewSectionProps) {
  const ostrzezenia = review.review_ostrzezenia ?? []
  const sugestie = review.review_sugestie ?? []
  const maxSeverity = getMaxSeverity(ostrzezenia)

  if (ostrzezenia.length === 0 && review.review_ok) {
    return null // Nothing to show — everything OK
  }

  const headerStyle = maxSeverity === 'error'
    ? 'bg-red-50 border-red-300'
    : maxSeverity === 'warning'
      ? 'bg-amber-50 border-amber-300'
      : 'bg-blue-50 border-blue-300'

  const headerTextColor = maxSeverity === 'error'
    ? 'text-red-800'
    : maxSeverity === 'warning'
      ? 'text-amber-800'
      : 'text-blue-800'

  return (
    <div className={`mt-4 mb-2 rounded-lg border-2 overflow-hidden shadow-sm ${headerStyle}`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${headerTextColor}`}>
        <div className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="w-5 h-5" />
          <span>Audyt AI — pewność {review.review_pewnosc?.toFixed(2) ?? '?'} z 1.0</span>
        </div>
        <Badge className={`text-xs ${SEVERITY_STYLES[maxSeverity ?? 'info'].badgeBg} ${SEVERITY_STYLES[maxSeverity ?? 'info'].badgeText} border-none`}>
          {ostrzezenia.length} {ostrzezenia.length === 1 ? 'uwaga' : ostrzezenia.length < 5 ? 'uwagi' : 'uwag'}
        </Badge>
      </div>

      {/* Description */}
      <div className="px-4 py-2 bg-white/60 text-sm text-slate-600 border-b border-slate-200">
        AI sprawdziło tę fakturę dodatkowym pass'em i znalazło{' '}
        <strong>{ostrzezenia.length}</strong> potencjaln{ostrzezenia.length === 1 ? 'y problem' : ostrzezenia.length < 5 ? 'e problemy' : 'ych problemów'}{' '}
        do weryfikacji:
      </div>

      {/* Warnings list */}
      <div className="px-4 py-3 space-y-2 bg-white/40">
        {ostrzezenia.map((o, i) => {
          const style = SEVERITY_STYLES[o.severity] ?? SEVERITY_STYLES.info
          return (
            <div
              key={i}
              className={`rounded-lg border p-3 ${style.bg} ${style.border}`}
            >
              <div className={`font-semibold text-sm flex items-center gap-2 mb-1 ${style.text}`}>
                <span>{style.icon}</span>
                <span>[{o.severity}]</span>
                <span>{TYP_LABELS[o.typ] ?? o.typ}</span>
              </div>
              <div className={`text-sm ${style.text} opacity-90`}>
                {o.wiadomosc}
              </div>
            </div>
          )
        })}
      </div>

      {/* Suggestions */}
      {sugestie.length > 0 && (
        <div className="px-4 py-3 bg-white/60 border-t border-slate-200">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            Sugestie poprawek:
          </div>
          <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 pl-1">
            {sugestie.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// --- Small inline badge for FakturaCard header ---

interface AiReviewBadgeProps {
  review: AiReviewLog
}

export function AiReviewBadge({ review }: AiReviewBadgeProps) {
  const ostrzezenia = review.review_ostrzezenia ?? []
  if (ostrzezenia.length === 0) return null

  const maxSev = getMaxSeverity(ostrzezenia)
  const style = SEVERITY_STYLES[maxSev ?? 'info']

  return (
    <Badge className={`ml-1 ${style.badgeBg} ${style.badgeText} border-none text-[10px] font-semibold`}>
      ⚠️ AI: {ostrzezenia.length} {ostrzezenia.length === 1 ? 'uwaga' : ostrzezenia.length < 5 ? 'uwagi' : 'uwag'}
    </Badge>
  )
}
