import { CheckCircle2, Clock, Sparkles, XCircle, FileDigit } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { FakturaHistoryButton } from '@/components/do-akceptacji/sections/FakturaHistoryButton'
import type { ExceptionItem } from '@/types/database'

const getStatusBadge = (item: ExceptionItem) => {
  const isAuto = item.resolved_by === 'fluinty_auto' || item.auto_created_by === 'fluinty_auto'
  const isResolved = item.status === 'resolved' || item.status === 'approved' || item.status === 'auto_created'
  const isPending = item.status === 'pending' || item.status === 'pending_review'

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {isResolved && (
        <Badge className="bg-green-100 text-green-800 border-0 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Zaksięgowano
        </Badge>
      )}
      {isPending && (
        <Badge className="bg-amber-100 text-amber-800 border-0 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          Oczekuje
        </Badge>
      )}
      {item.status === 'ignored' && (
        <Badge className="bg-red-100 text-red-800 border-0 flex items-center gap-1">
          <XCircle className="w-3.5 h-3.5" />
          Odrzucona
        </Badge>
      )}
      {item.status === 'skipped' && (
        <Badge className="bg-slate-100 text-slate-800 border-0 flex items-center gap-1" title="Pominięte przez system — do ręcznego księgowania">
          <XCircle className="w-3.5 h-3.5" />
          Pominięte
        </Badge>
      )}
      {isAuto && (
        <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-semibold flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-purple-600" />
          AUTO
        </Badge>
      )}
    </div>
  )
}

export function RecentExceptionsTable({ items }: { items: ExceptionItem[] }) {
  if (!items || items.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <h2 className="font-bold text-[#1E293B] flex items-center gap-2 text-sm uppercase tracking-wider">
          <FileDigit className="w-4 h-4 text-[#64748B]" />
          Ostatnie wpisy
        </h2>
      </div>
      <div className="p-0 overflow-x-auto">
        <div className="max-h-[300px] overflow-y-auto no-scrollbar">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] uppercase sticky top-0 z-10">
                <th className="px-4 py-3 font-semibold">Numer dokumentu</th>
                <th className="px-4 py-3 font-semibold">Kontrahent</th>
                <th className="px-4 py-3 font-semibold text-right">Kwota brutto</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Data</th>
                <th className="px-4 py-3 font-semibold w-12 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-4 py-3 font-mono text-[#1E293B] font-medium">
                    {item.ksiegowe_numer || '-'}
                  </td>
                  <td className="px-4 py-3 text-[#1E293B] truncate max-w-[200px]" title={item.nazwa_dostawcy || ''}>
                    {item.nazwa_dostawcy || '-'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-right text-[#1E293B] tabular-nums whitespace-nowrap">
                    {item.kwota_brutto ? `${item.kwota_brutto.toFixed(2)} zł` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(item)}
                  </td>
                  <td className="px-4 py-3 text-[#64748B] whitespace-nowrap">
                    {new Date(item.created_at).toLocaleString('pl-PL')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <FakturaHistoryButton
                      queueId={item.id}
                      currentStatus={item.status}
                      ksiegoweNumer={item.ksiegowe_numer}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
