'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import {
  Check,
  Pencil,
  AlertTriangle,
  XCircle,
  Wrench,
  Trash2,
  Clock,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { ZapisHistorySheet } from '@/components/shared/ZapisHistorySheet'
import type { RecentActivity } from '@/types/database'

interface Props {
  activities: RecentActivity[]
}

function getActionConfig(action: string) {
  switch (action) {
    case 'set_opis':
      return {
        icon: <Check className="w-4 h-4" />,
        color: 'text-[#22C55E]',
        bg: 'bg-[#22C55E]/10',
      }
    case 'resolve_exception':
      return {
        icon: <Pencil className="w-4 h-4" />,
        color: 'text-[#4A90E2]',
        bg: 'bg-[#4A90E2]/10',
      }
    case 'exception':
      return {
        icon: <AlertTriangle className="w-4 h-4" />,
        color: 'text-[#F59E0B]',
        bg: 'bg-[#F59E0B]/10',
      }
    case 'error':
      return {
        icon: <XCircle className="w-4 h-4" />,
        color: 'text-[#EF4444]',
        bg: 'bg-[#EF4444]/10',
      }
    case 'rule_edited':
      return {
        icon: <Wrench className="w-4 h-4" />,
        color: 'text-[#64748B]',
        bg: 'bg-[#F1F5F9]',
      }
    case 'rule_deleted':
      return {
        icon: <Trash2 className="w-4 h-4" />,
        color: 'text-[#64748B]',
        bg: 'bg-[#F1F5F9]',
      }
    default:
      return {
        icon: <Check className="w-4 h-4" />,
        color: 'text-[#94A3B8]',
        bg: 'bg-[#F8FAFC]',
      }
  }
}

function formatDescription(activity: RecentActivity): string {
  const d = (activity.details ?? {}) as Record<string, string>

  switch (activity.action) {
    case 'set_opis': {
      const opis = activity.opis_zapisany || d.opis || d.result || '?'
      return `${activity.client_nazwa} → "${opis}" (auto)`
    }
    case 'resolve_exception': {
      const opis = activity.opis_zapisany || d.opis || ''
      const by = d.resolved_by || d.by || ''
      return `${activity.client_nazwa} → reguła${opis ? ` "${opis}"` : ''} utworzona${by ? ` przez ${by}` : ''}`
    }
    case 'exception': {
      const pozycja = activity.pozycja_xml || d.pierwsza_pozycja || d.pozycja_xml || '?'
      const truncated = pozycja.length > 50 ? pozycja.slice(0, 50) + '…' : pozycja
      return `${activity.client_nazwa} → wyjątek: "${truncated}"`
    }
    case 'dry_run': {
      const opis = activity.opis_zapisany || d.opis || '?'
      return `${activity.client_nazwa} → DRY RUN: "${opis}"`
    }
    case 'error': {
      const errMsg = activity.error_message || d.error || 'Nieznany błąd'
      return `${activity.client_nazwa} → BŁĄD: ${errMsg}`
    }
    case 'ignore_exception': {
      const by = d.ignored_by || d.by || 'księgowa'
      return `${activity.client_nazwa} → pominięto (przez ${by})`
    }
    case 'rule_edited': {
      const by = d.edited_by || ''
      return `${activity.client_nazwa} → reguła #${activity.rule_id ?? '?'} edytowana${by ? ` przez ${by}` : ''}`
    }
    case 'rule_deleted': {
      const by = d.deleted_by || ''
      return `${activity.client_nazwa} → reguła #${activity.rule_id ?? '?'} usunięta${by ? ` przez ${by}` : ''}`
    }
    default:
      return `${activity.client_nazwa} → ${activity.action}`
  }
}

export function RecentActivityList({ activities }: Props) {
  const [historyZapisId, setHistoryZapisId] = useState<number | null>(null)

  return (
    <>
      <div className="space-y-1">
        {activities.map((activity) => {
          const config = getActionConfig(activity.action)
          const timeAgo = formatDistanceToNow(new Date(activity.timestamp), {
            addSuffix: true,
            locale: pl,
          })
          const fullTime = new Date(activity.timestamp).toLocaleString('pl-PL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })

          return (
            <div
              key={activity.id}
              className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-[#F8FAFC] transition-colors"
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${config.bg} ${config.color}`}
              >
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#1E293B] break-words">
                  {formatDescription(activity)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {activity.zapis_id && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setHistoryZapisId(activity.zapis_id)}
                    className="text-[#94A3B8] hover:text-[#4A90E2] cursor-pointer"
                    title="Historia zapisu"
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Tooltip>
                  <TooltipTrigger className="cursor-default">
                    <span className="text-xs text-[#94A3B8] whitespace-nowrap">
                      {timeAgo}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{fullTime}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )
        })}
      </div>

      {/* Shared history sheet */}
      {historyZapisId && (
        <ZapisHistorySheet
          zapisId={historyZapisId}
          open={!!historyZapisId}
          onOpenChange={(open) => {
            if (!open) setHistoryZapisId(null)
          }}
        />
      )}
    </>
  )
}
