import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import { LogsClient } from './LogsClient'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

interface Props {
  searchParams: Promise<{ page?: string }>
}

export default async function LogsPage({ searchParams }: Props) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page || '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  const adminSupabase = createSupabaseAdmin()
  const { nips, ryczaltNips } = await getAllowedNips()

  // ── 1. client_changes_log ──────────────────────────
  // Don't use clients(nazwa) embedded join — FK not exposed via PostgREST in fluinty schema
  let changesQuery = adminSupabase
    .from('client_changes_log')
    .select('id, client_nip, field_name, old_value, new_value, changed_by, changed_at', { count: 'exact' })
    .order('changed_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)
  changesQuery = applyNipFilter(changesQuery, nips, 'client_nip', ryczaltNips)

  const { data: changesRaw, count: changesCount, error: changesErr } = await changesQuery

  // ── 2. audit_log ───────────────────────────────────
  let auditQuery = adminSupabase
    .from('audit_log')
    .select('id, timestamp, action, client_nip, zapis_id, opis_zapisany, pozycja_xml, error_message, details', { count: 'exact' })
    .order('timestamp', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)
  auditQuery = applyNipFilter(auditQuery, nips, 'client_nip', ryczaltNips)

  const { data: auditRaw, count: auditCount, error: auditErr } = await auditQuery

  // ── 3. Build client name map from both sources ─────
  const allNips = new Set<string>()
  for (const row of changesRaw ?? []) if (row.client_nip) allNips.add(row.client_nip)
  for (const row of auditRaw ?? []) if (row.client_nip) allNips.add(row.client_nip)

  const clientMap: Record<string, string> = {}
  if (allNips.size > 0) {
    const { data: clients } = await adminSupabase
      .from('clients')
      .select('nip, nazwa')
      .in('nip', Array.from(allNips))
    for (const c of clients ?? []) {
      clientMap[c.nip] = c.nazwa
    }
  }

  // ── 4. Normalize into unified log entries ──────────
  type UnifiedLog = {
    id: string
    type: 'change' | 'audit'
    timestamp: string
    client_nip: string | null
    client_nazwa: string | null
    // change fields
    field_name?: string
    old_value?: string | null
    new_value?: string | null
    changed_by?: string | null
    // audit fields
    action?: string
    opis_zapisany?: string | null
    pozycja_xml?: string | null
    error_message?: string | null
    zapis_id?: number | null
    details?: Record<string, unknown> | null
  }

  const changeLogs: UnifiedLog[] = (changesRaw ?? []).map(l => ({
    id: `change-${l.id}`,
    type: 'change' as const,
    timestamp: l.changed_at,
    client_nip: l.client_nip,
    client_nazwa: clientMap[l.client_nip] || null,
    field_name: l.field_name,
    old_value: l.old_value,
    new_value: l.new_value,
    changed_by: l.changed_by,
  }))

  const auditLogs: UnifiedLog[] = (auditRaw ?? []).map(a => ({
    id: `audit-${a.id}`,
    type: 'audit' as const,
    timestamp: a.timestamp,
    client_nip: a.client_nip,
    client_nazwa: a.client_nip ? (clientMap[a.client_nip] || null) : null,
    action: a.action,
    opis_zapisany: a.opis_zapisany,
    pozycja_xml: a.pozycja_xml,
    error_message: a.error_message,
    zapis_id: a.zapis_id,
    details: a.details,
  }))

  // Merge and sort by timestamp descending
  const allLogs = [...changeLogs, ...auditLogs]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const totalCount = (changesCount ?? 0) + (auditCount ?? 0)
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1
  const errors = [changesErr?.message, auditErr?.message].filter(Boolean)

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1F3A5F] tracking-tight">Logi Zmian (Audit)</h1>
        <p className="text-[#64748B] mt-1">
          Historia edycji danych klientów oraz operacji na fakturach.
          {totalCount > 0 && <span className="ml-2 text-xs">({totalCount} wpisów)</span>}
        </p>
        {errors.length > 0 && (
          <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
            Błąd pobierania: {errors.join('; ')}
          </div>
        )}
      </div>

      <LogsClient
        logs={allLogs}
        page={page}
        totalPages={totalPages}
      />
    </div>
  )
}
