import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import { FileText, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function FakturyPage() {
  const adminSupabase = createSupabaseAdmin()
  const { nips } = await getAllowedNips()

  // Pobierz ostatnie 100 operacji związanych z fakturami (filtered by allowed NIPs)
  let logsQuery = adminSupabase
    .from('audit_log')
    .select('id, timestamp, action, client_nip, zapis_id, opis_zapisany, error_message, pozycja_xml, details, clients (nazwa)')
    .in('action', ['auto_create_full', 'set_opis', 'exception', 'error'])
    .order('timestamp', { ascending: false })
    .limit(100)
  logsQuery = applyNipFilter(logsQuery, nips)

  const { data: logs } = await logsQuery

  const getStatusIcon = (action: string) => {
    switch (action) {
      case 'auto_create_full':
      case 'set_opis':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'exception':
        return <Clock className="w-5 h-5 text-amber-500" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      default:
        return <FileText className="w-5 h-5 text-slate-500" />
    }
  }

  const getStatusBadge = (action: string) => {
    switch (action) {
      case 'auto_create_full':
        return <Badge className="bg-green-100 text-green-800 border-0">Zaksięgowano auto</Badge>
      case 'set_opis':
        return <Badge className="bg-green-100 text-green-800 border-0">Dodano opis</Badge>
      case 'exception':
        return <Badge className="bg-amber-100 text-amber-800 border-0">Wyjątek (oczekuje)</Badge>
      case 'error':
        return <Badge className="bg-red-100 text-red-800 border-0">Błąd</Badge>
      default:
        return <Badge variant="outline">{action}</Badge>
    }
  }

  const extractKsef = (details: any) => {
    if (!details) return '-'
    if (typeof details === 'string') {
      try { const parsed = JSON.parse(details); return parsed.numer_ksef || '-' } catch { return '-' }
    }
    return details.numer_ksef || '-'
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1F3A5F] tracking-tight">Faktury KSeF (Ostatnie 100)</h1>
        <p className="text-[#64748B] mt-1">Historia operacji na fakturach (automatyczne księgowania i wyjątki).</p>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] text-xs uppercase">
                <th className="px-6 py-4 font-semibold">Data i czas</th>
                <th className="px-6 py-4 font-semibold">Klient</th>
                <th className="px-6 py-4 font-semibold">Numer KSeF</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Opis / Komunikat</th>
              </tr>
            </thead>
            <tbody>
              {logs?.map((log) => (
                <tr key={log.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-[#64748B]">
                    {new Date(log.timestamp).toLocaleString('pl-PL')}
                  </td>
                  <td className="px-6 py-4 font-medium text-[#1E293B]">
                    <Link href={`/klienci/${log.client_nip}`} className="hover:text-[#4A90E2]">
                      {(Array.isArray(log.clients) ? log.clients[0]?.nazwa : (log.clients as any)?.nazwa) || log.client_nip}
                    </Link>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-[#64748B]">
                    {extractKsef(log.details)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(log.action)}
                      {getStatusBadge(log.action)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[#1E293B] max-w-md truncate" title={log.opis_zapisany || log.error_message || '-'}>
                    {log.opis_zapisany || log.error_message || '-'}
                  </td>
                </tr>
              ))}
              {!logs?.length && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#64748B]">
                    Brak danych w historii audytu.
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
