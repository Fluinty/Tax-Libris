'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Check,
  CheckCircle2,
  AlertTriangle,
  Search,
  XCircle,
  MinusCircle,
  Wrench,
  Trash2,
  HelpCircle,
  FileText,
  Loader2,
  ShoppingCart,
  DollarSign,
  RotateCcw,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { getZapisHistory } from '@/app/actions/zapis-history'
import {
  formatAuditAction,
  formatRelativeTime,
  formatExactTime,
} from '@/lib/audit-formatter'
import type { AuditEntry, ZapisInfo, ActionColor } from '@/lib/audit-formatter'

interface Props {
  zapisId: number
  /** NIP klienta, w którego kontekście otwarto historię — zapis_id z Rachmistrza
   *  numeruje się PER KSIĘGA i koliduje między klientami; serwer potwierdza
   *  parę (zapisId, nip) w danych i tnie odpowiedź do tego klienta. */
  clientNip?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const iconMap = {
  Check: Check,
  CheckCircle2: CheckCircle2,
  AlertTriangle: AlertTriangle,
  Search: Search,
  XCircle: XCircle,
  MinusCircle: MinusCircle,
  Wrench: Wrench,
  Trash2: Trash2,
  HelpCircle: HelpCircle,
  FileText: FileText,
  RotateCcw: RotateCcw,
} as const

const colorMap: Record<ActionColor, { text: string; bg: string; dot: string }> = {
  green: { text: 'text-[#22C55E]', bg: 'bg-[#22C55E]/10', dot: 'bg-[#22C55E]' },
  blue: { text: 'text-[#4A90E2]', bg: 'bg-[#4A90E2]/10', dot: 'bg-[#4A90E2]' },
  orange: { text: 'text-[#F59E0B]', bg: 'bg-[#F59E0B]/10', dot: 'bg-[#F59E0B]' },
  red: { text: 'text-[#EF4444]', bg: 'bg-[#EF4444]/10', dot: 'bg-[#EF4444]' },
  gray: { text: 'text-[#64748B]', bg: 'bg-[#F1F5F9]', dot: 'bg-[#94A3B8]' },
  purple: { text: 'text-[#8B5CF6]', bg: 'bg-[#8B5CF6]/10', dot: 'bg-[#8B5CF6]' },
}

export function ZapisHistorySheet({ zapisId, clientNip, open, onOpenChange }: Props) {
  const [audits, setAudits] = useState<AuditEntry[]>([])
  const [zapisInfo, setZapisInfo] = useState<ZapisInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getZapisHistory(zapisId, clientNip ?? null)
      if (result.error) {
        setError(result.error)
        return
      }
      setAudits(result.audits)
      setZapisInfo(result.zapisInfo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd')
    } finally {
      setLoading(false)
    }
  }, [zapisId, clientNip])

  useEffect(() => {
    if (open && zapisId) {
      fetchHistory()
    }
  }, [open, zapisId, fetchHistory])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[500px] max-w-[90vw] sm:max-w-[500px] overflow-y-auto"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="text-lg font-bold text-[#1E293B]">
            Historia zapisu #{zapisId}
          </SheetTitle>
          <SheetDescription>
            Chronologia akcji Fluinty dla tego zapisu
          </SheetDescription>
        </SheetHeader>

        <Separator className="mb-4" />

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#4A90E2] animate-spin" />
            <span className="ml-2 text-sm text-[#64748B]">Ładuję historię...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <XCircle className="w-10 h-10 text-[#EF4444] mb-3" />
            <p className="text-sm text-[#1E293B] font-medium">Błąd pobierania danych</p>
            <p className="text-xs text-[#64748B] mt-1">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && audits.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <HelpCircle className="w-10 h-10 text-[#CBD5E1] mb-3" />
            <p className="text-sm text-[#1E293B] font-medium">Brak historii</p>
            <p className="text-xs text-[#64748B] mt-1">
              Nie znaleziono wpisów w audit_log dla zapisu #{zapisId}
            </p>
          </div>
        )}

        {/* Content */}
        {!loading && !error && audits.length > 0 && (
          <div className="space-y-6">
            {/* Info Section */}
            {zapisInfo && (
              <div className="bg-[#F8FAFC] rounded-lg p-4 border border-[#E2E8F0]">
                <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-3">
                  Info o zapisie
                </h3>
                <div className="space-y-2 text-sm">
                  <InfoRow label="Klient" value={zapisInfo.client_nazwa} />
                  {zapisInfo.numer_dokumentu && (
                    <InfoRow label="Faktura" value={zapisInfo.numer_dokumentu} />
                  )}
                  {zapisInfo.numer_ksef && (
                    <InfoRow
                      label="KSeF"
                      value={
                        zapisInfo.numer_ksef.length > 30
                          ? zapisInfo.numer_ksef.slice(0, 30) + '…'
                          : zapisInfo.numer_ksef
                      }
                      title={zapisInfo.numer_ksef}
                    />
                  )}
                  {zapisInfo.nazwa_dostawcy && (
                    <InfoRow label="Sprzedawca" value={zapisInfo.nazwa_dostawcy} />
                  )}
                  {zapisInfo.pozycja_xml && (
                    <InfoRow
                      label="Pozycja XML"
                      value={
                        zapisInfo.pozycja_xml.length > 60
                          ? zapisInfo.pozycja_xml.slice(0, 60) + '…'
                          : zapisInfo.pozycja_xml
                      }
                      title={zapisInfo.pozycja_xml}
                      mono
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[#94A3B8] w-24 shrink-0">Typ:</span>
                    <span className="flex items-center gap-1.5 text-[#1E293B]">
                      {zapisInfo.typ_dokumentu === 'sprzedaz' ? (
                        <>
                          <DollarSign className="w-3.5 h-3.5 text-[#22C55E]" />
                          Sprzedaż
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-3.5 h-3.5 text-[#4A90E2]" />
                          Zakup
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Chronology */}
            <div>
              <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-4">
                Chronologia
              </h3>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[13px] top-3 bottom-3 w-px bg-[#E2E8F0]" />

                <div className="space-y-4">
                  {audits.map((audit) => {
                    const formatted = formatAuditAction(audit)
                    const IconComponent = iconMap[formatted.iconName]
                    const colors = colorMap[formatted.color]

                    return (
                      <div key={audit.id} className="relative flex gap-3 pl-0">
                        {/* Icon circle */}
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 ${colors.bg} ${colors.text}`}
                        >
                          <IconComponent className="w-3.5 h-3.5" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pb-1">
                          <p className="text-sm font-medium text-[#1E293B]">
                            {formatted.title}
                          </p>
                          {formatted.subtitle && (
                            <div className="mt-0.5">
                              {formatted.subtitle.split('\n').map((line, i) => (
                                <p key={i} className="text-xs text-[#64748B]">
                                  {line}
                                </p>
                              ))}
                            </div>
                          )}
                          {audit.duration_ms != null && (
                            <p className="text-[10px] text-[#94A3B8] mt-0.5">
                              ⏱ {audit.duration_ms}ms
                            </p>
                          )}
                          <Tooltip>
                            <TooltipTrigger className="cursor-default">
                              <p className="text-[11px] text-[#94A3B8] mt-1">
                                ⏱ {formatExactTime(audit.timestamp)} ({formatRelativeTime(audit.timestamp)})
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{formatExactTime(audit.timestamp)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// Small helper for info rows
function InfoRow({
  label,
  value,
  title,
  mono,
}: {
  label: string
  value: string
  title?: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[#94A3B8] w-24 shrink-0">{label}:</span>
      <span
        className={`text-[#1E293B] break-all ${mono ? 'font-mono text-xs' : ''}`}
        title={title}
      >
        {value}
      </span>
    </div>
  )
}
