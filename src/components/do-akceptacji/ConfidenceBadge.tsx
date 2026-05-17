'use client'

import { Badge } from '@/components/ui/badge'
import { getConfidenceBadgeClasses, getConfidenceLabel } from '@/lib/confidence-helpers'
import { cn } from '@/lib/utils'

interface ConfidenceBadgeProps {
  score: number | null | undefined
  className?: string
}

export function ConfidenceBadge({ score, className }: ConfidenceBadgeProps) {
  const s = score ?? 1.0
  const label = getConfidenceLabel(score)
  const colors = getConfidenceBadgeClasses(score)

  return (
    <Badge className={cn("border-none text-xs", colors, className)}>
      {Math.round(s * 100)}% · {label}
    </Badge>
  )
}
