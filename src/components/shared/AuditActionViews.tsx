'use client'

import React from 'react'
import { Check, CheckCircle2, AlertTriangle, XCircle, FileText, Clock, MinusCircle, Wrench, Trash2 } from 'lucide-react'
import { getAuditActionConfig, extractAuditDetailsInfo, type AuditLogLike, type AuditActionConfig } from '@/lib/audit-format'

export function getAuditIcon(iconType: AuditActionConfig['iconType'], className = 'w-3.5 h-3.5') {
  switch (iconType) {
    case 'check':
      return <Check className={className} />
    case 'purple-check':
    case 'blue-check':
      return <CheckCircle2 className={className} />
    case 'alert':
      return <AlertTriangle className={className} />
    case 'error':
      return <XCircle className={className} />
    case 'file':
      return <FileText className={className} />
    case 'skip':
      return <MinusCircle className={className} />
    case 'wrench':
      return <Wrench className={className} />
    case 'trash':
      return <Trash2 className={className} />
    default:
      return <Clock className={className} />
  }
}

export function AuditBadge({ action }: { action?: string | null }) {
  const config = getAuditActionConfig(action)
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${config.badgeClass}`}>
      {getAuditIcon(config.iconType, 'w-3 h-3 shrink-0')}
      <span>{config.label}</span>
    </span>
  )
}

export function AuditDetailsText({ log }: { log: AuditLogLike }) {
  const info = extractAuditDetailsInfo(log)

  if (info.isError) {
    return (
      <div className="inline items-center flex-wrap break-words">
        <span title={info.fullError} className="cursor-help text-red-600 font-medium">
          {info.shortError}
        </span>
        {info.ddkSuffix && (
          <span className="text-[#94A3B8] ml-1.5 whitespace-nowrap text-xs">
            · {info.ddkSuffix}
          </span>
        )}
      </div>
    )
  }

  const hasMain = info.mainParts.length > 0
  const mainString = info.mainParts.join(' · ')

  if (!hasMain && !info.ddkSuffix) {
    return <span className="text-[#94A3B8]">—</span>
  }

  return (
    <div className="inline items-center flex-wrap break-words">
      {hasMain && <span>{mainString}</span>}
      {!hasMain && info.ddkSuffix && <span className="text-[#94A3B8]">—</span>}
      {info.ddkSuffix && (
        <span className="text-[#94A3B8] ml-1.5 whitespace-nowrap text-xs">
          · {info.ddkSuffix}
        </span>
      )}
    </div>
  )
}
