import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import { FileText, CheckCircle2, Clock, XCircle, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import type { ExceptionItem } from '@/types/database'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function FakturyPage({ searchParams }: PageProps) {
  const params = await searchParams
  const statusFilter = params.status ?? 'all'
  const adminSupabase = createSupabaseAdmin()
  const { nips, ryczaltNips } = await getAllowedNips()

  let query = adminSupabase
    .from('exceptions_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(150)

  query = applyNipFilter(query, nips, 'client_nip', ryczaltNips)

  if (statusFilter === 'auto') {
    query = query.or('resolved_by.eq.fluinty_auto,auto_created_by.eq.fluinty_auto')
  } else if (statusFilter === 'resolved') {
    query = query.in('status', ['resolved', 'approved', 'auto_created'])
  } else if (statusFilter === 'pending') {
    query = query.in('status', ['pending', 'pending_review'])
  } else if (statusFilter === 'ignored') {
    query = query.eq('status', 'ignored')
  } else if (statusFilter === 'skipped') {
    query = query.eq('status', 'skipped')
  }

  const { data: rawItems } = await query
  const items = (rawItems ?? []) as ExceptionItem[]

  // Fetch client names
  const clientNips = [...new Set(items.map(i => i.client_nip))]
  const { data: clientsData } = clientNips.length > 0
    ? await adminSupabase.from('clients').select('nip, nazwa').in('nip', clientNips)
    : { data: [] }
  const clientsMap = new Map((clientsData ?? []).map(c => [c.nip, c.nazwa]))

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

  const filterTabs = [
    { id: 'all', label: 'Wszystkie' },
    { id: 'resolved', label: 'Zaksięgowane' },
    { id: 'pending', label: 'Oczekujące' },
    { id: 'ignored', label: 'Odrzucone' },
    { id: 'skipped', label: 'Pominięte' },
    { id: 'auto', label: 'Auto (fluinty_auto)', isPurple: true },
  ]

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F] tracking-tight">Faktury KSeF</h1>
          <p className="text-[#64748B] mt-1">Historia operacji i automatycznych księgowań na fakturach.</p>
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {filterTabs.map(tab => {
          const isActive = statusFilter === tab.id
          return (
            <Link
              key={tab.id}
              href={tab.id === 'all' ? '/faktury' : `/faktury?status=${tab.id}`}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? tab.isPurple
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-[#1F3A5F] text-white shadow-sm'
                  : tab.isPurple
                  ? 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                  : 'bg-white text-[#64748B] hover:bg-[#F8FAFC] border border-[#E2E8F0]'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] text-xs uppercase">
                <th className="px-6 py-4 font-semibold">Data</th>
                <th className="px-6 py-4 font-semibold">Klient</th>
                <th className="px-6 py-4 font-semibold">Numer dokumentu / KSeF</th>
                <th className="px-6 py-4 font-semibold">Kontrahent</th>
                <th className="px-6 py-4 font-semibold text-right">Kwota brutto</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-[#64748B]">
                    {new Date(item.created_at).toLocaleString('pl-PL', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className="px-6 py-4 font-medium text-[#1E293B]">
                    <Link href={`/klienci/${item.client_nip}`} className="hover:text-[#4A90E2]">
                      {clientsMap.get(item.client_nip) || item.client_nip}
                    </Link>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-[#475569]">
                    <div className="font-semibold text-slate-800">{item.ksiegowe_numer || '-'}</div>
                    <div className="text-[11px] text-slate-400 truncate max-w-[200px]" title={item.numer_ksef || ''}>
                      {item.numer_ksef || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[#1E293B] max-w-[220px] truncate" title={item.nazwa_dostawcy || ''}>
                    {item.nazwa_dostawcy || '-'}
                  </td>
                  <td className="px-6 py-4 font-semibold text-right text-[#1E293B] tabular-nums">
                    {item.kwota_brutto ? `${item.kwota_brutto.toFixed(2)} zł` : '-'}
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(item)}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[#64748B]">
                    Brak faktur dla wybranego filtru statusu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
