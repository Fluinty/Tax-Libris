'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const SOURCE_COLORS: Record<string, string> = {
  default:  'bg-blue-100 text-blue-800 border-blue-200',
  keywords: 'bg-green-100 text-green-800 border-green-200',
  ai:       'bg-yellow-100 text-yellow-800 border-yellow-200',
  manual:   'bg-gray-100 text-gray-800 border-gray-200',
}

const SOURCE_LABELS: Record<string, string> = {
  default:  'DEFAULT',
  keywords: 'KEYWORDS',
  ai:       'AI',
  manual:   'RĘCZNIE',
}

interface SourceBadgeProps {
  source: string
  className?: string
}

export function SourceBadge({ source, className }: SourceBadgeProps) {
  const colors = SOURCE_COLORS[source] || SOURCE_COLORS.manual
  const label = SOURCE_LABELS[source] || source.toUpperCase()

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] h-4 px-1.5 font-medium", colors, className)}
    >
      {label}
    </Badge>
  )
}
