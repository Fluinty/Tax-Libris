'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { Clock } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { ZapisHistorySheet } from '@/components/shared/ZapisHistorySheet'
import type { RecentActivity } from '@/types/database'
import { getAuditActionConfig } from '@/lib/audit-format'
import { AuditBadge, AuditDetailsText, getAuditIcon } from '@/components/shared/AuditActionViews'

interface Props {
  activities: RecentActivity[]
}

export function RecentActivityList({ activities }: Props) {
  const [historyZapis, setHistoryZapis] = useState<{ zapisId: number; clientNip: string | null } | null>(null)

  return (
    <>
      <div className="space-y-1">
        {activities.map((activity) => {
          const config = getAuditActionConfig(activity.action)
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
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${config.circleBg} ${config.circleColor}`}
              >
                {getAuditIcon(config.iconType, 'w-4 h-4')}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="font-semibold text-sm text-[#1E293B] truncate max-w-[200px]"
                    title={activity.client_nazwa || activity.client_nip || ''}
                  >
                    {activity.client_nazwa || activity.client_nip || '—'}
                  </span>
                  <AuditBadge action={activity.action} />
                </div>
                <div className="text-xs text-[#64748B]">
                  <AuditDetailsText log={activity} />
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {activity.zapis_id && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => activity.zapis_id && setHistoryZapis({ zapisId: activity.zapis_id, clientNip: activity.client_nip ?? null })}
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
      {historyZapis && (
        <ZapisHistorySheet
          zapisId={historyZapis.zapisId}
          clientNip={historyZapis.clientNip}
          open={!!historyZapis}
          onOpenChange={(open) => {
            if (!open) setHistoryZapis(null)
          }}
        />
      )}
    </>
  )
}
