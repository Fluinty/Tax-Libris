'use client'

import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import {
  Clock,
  Pencil,
  Check,
  AlertTriangle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuditBadge, AuditDetailsText } from '@/components/shared/AuditActionViews'

interface UnifiedLog {
  id: string
  type: 'change' | 'audit'
  timestamp: string
  client_nip: string | null
  client_nazwa: string | null
  field_name?: string
  old_value?: string | null
  new_value?: string | null
  changed_by?: string | null
  action?: string
  opis_zapisany?: string | null
  pozycja_xml?: string | null
  error_message?: string | null
  zapis_id?: number | null
  details?: Record<string, unknown> | null
}

interface Props {
  logs: UnifiedLog[]
  page: number
  totalPages: number
}

function formatTimestamp(timestamp: string) {
  return (
    <>
      <div>{new Date(timestamp).toLocaleDateString('pl-PL')}</div>
      <div className="text-[10px] text-[#94A3B8]">
        {new Date(timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
        {' · '}
        {formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: pl })}
      </div>
    </>
  )
}

export function LogsClient({ logs, page, totalPages }: Props) {
  const router = useRouter()

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-12 text-center">
        <Clock className="w-12 h-12 text-[#CBD5E1] mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-[#1E293B] mb-1">Brak logów</h2>
        <p className="text-sm text-[#64748B]">Nie znaleziono żadnych wpisów w historii zmian.</p>
      </div>
    )
  }

  const goToPage = (p: number) => {
    router.push(`/logs?page=${p}`)
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
        <h2 className="font-bold text-[#1E293B] flex items-center gap-2 text-sm uppercase tracking-wider">
          <Clock className="w-4 h-4 text-[#64748B]" />
          Historia zmian i operacji
        </h2>
        <div className="text-xs text-[#94A3B8]">
          Strona {page} z {totalPages}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B] font-semibold">
              <th className="px-4 py-3 w-[140px]">Czas</th>
              <th className="px-4 py-3 w-[150px]">Typ / Akcja</th>
              <th className="px-4 py-3 w-[180px]">Klient</th>
              <th className="px-4 py-3">Szczegóły</th>
              <th className="px-4 py-3 w-[140px] text-right">Autor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-[#F8FAFC]/60 transition-colors">
                {/* Time */}
                <td className="px-4 py-3 text-[#64748B] whitespace-nowrap font-mono align-top">
                  {formatTimestamp(log.timestamp)}
                </td>

                {/* Type badge */}
                <td className="px-4 py-3 align-top">
                  {log.type === 'change' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                      <Pencil className="w-3 h-3" />
                      Edycja
                    </span>
                  ) : (
                    <AuditBadge action={log.action} />
                  )}
                </td>

                {/* Client */}
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-[#1E293B] truncate max-w-[170px]" title={log.client_nazwa || log.client_nip || ''}>
                    {log.client_nazwa || log.client_nip || '—'}
                  </div>
                  {log.client_nazwa && log.client_nip && (
                    <div className="text-[10px] text-[#94A3B8]">{log.client_nip}</div>
                  )}
                </td>

                {/* Details */}
                <td className="px-4 py-3 align-top">
                  {log.type === 'change' ? (
                    <div>
                      <div className="font-medium text-[#1E293B] mb-0.5">{log.field_name}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="line-through opacity-60 truncate max-w-[180px]" title={log.old_value || 'brak'}>
                          {log.old_value || 'brak'}
                        </span>
                        <span className="text-[#94A3B8]">→</span>
                        <span className="text-[#1E293B] font-medium truncate max-w-[220px]" title={log.new_value || 'brak'}>
                          {log.new_value || 'brak'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[#475569] max-w-[500px]">
                      <AuditDetailsText log={log} />
                    </div>
                  )}
                </td>

                {/* Author */}
                <td className="px-4 py-3 text-right text-[#64748B] truncate align-top" title={log.changed_by || ''}>
                  {log.type === 'change' ? (log.changed_by || '—') : 'system'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Poprzednia
          </Button>
          <span className="text-xs text-[#64748B]">
            Strona {page} z {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
            className="gap-1"
          >
            Następna
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
