import type { AiReviewLog, AiReviewOstrzezenie } from '@/types/database'

// --- Severity helpers ---

export type MaxSeverity = 'error' | 'warning' | 'info' | null

export function getMaxSeverity(ostrzezenia: AiReviewOstrzezenie[] | null | undefined): MaxSeverity {
  if (!ostrzezenia?.length) return null
  if (ostrzezenia.some(o => o.severity === 'error')) return 'error'
  if (ostrzezenia.some(o => o.severity === 'warning')) return 'warning'
  return 'info'
}

export function getLatestReview(reviews: AiReviewLog[] | null | undefined): AiReviewLog | null {
  if (!reviews?.length) return null
  // Take most recent by data_utworzenia, or just first (usually only 1 per queue_id)
  return reviews.reduce((latest, r) =>
    new Date(r.data_utworzenia) > new Date(latest.data_utworzenia) ? r : latest
  )
}

// --- Label maps ---

export const TYP_LABELS: Record<string, string> = {
  'vat_stawka': 'Stawka VAT',
  'kategoria': 'Kategoria',
  'kolumna_kpir': 'Kolumna KPiR',
  'brak_mpp': 'Brak MPP',
  'brak_gtu': 'Brak GTU',
  'anomalia': 'Anomalia logiczna',
  'inne': 'Inne',
}

export const SEVERITY_STYLES: Record<string, {
  bg: string
  border: string
  text: string
  icon: string
  badgeBg: string
  badgeText: string
}> = {
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    icon: '🔴',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-800',
  },
  warning: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-800',
    icon: '🟡',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-800',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    icon: '🔵',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
  },
}
