import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'
import { RulesPageClient } from '@/components/rules/RulesPageClient'
import type { RuleWithClient, Client } from '@/types/database'

interface PageProps {
  searchParams: Promise<{
    search?: string
    client?: string
    type?: string
    typ?: string
    page?: string
  }>
}

const PAGE_SIZE = 25

export default async function RegulyPage({ searchParams }: PageProps) {
  const params = await searchParams
  const currentPage = Math.max(1, parseInt(params.page ?? '1', 10))
  const typFilter = params.typ ?? 'zakup'
  const supabase = createSupabaseAdmin()
  const { nips, ryczaltNips } = await getAllowedNips()

  // Build query
  let query = supabase
    .from('rules')
    .select('*, clients!inner(nazwa)', { count: 'exact' })

  // typ_dokumentu filter — NULL treated as 'zakup'
  if (typFilter === 'sprzedaz') {
    query = query.eq('typ_dokumentu', 'sprzedaz')
  } else {
    query = query.or('typ_dokumentu.eq.zakup,typ_dokumentu.is.null')
  }

  // Search filter
  if (params.search) {
    query = query.or(
      `pattern_pozycji.ilike.%${params.search}%,opis_zdarzenia.ilike.%${params.search}%`
    )
  }

  // Client filter
  if (params.client) {
    query = query.eq('client_nip', params.client)
  }

  // Type filter (match type)
  if (params.type === 'exact') {
    query = query.eq('is_pattern', false)
  } else if (params.type === 'pattern') {
    query = query.eq('is_pattern', true)
  }

  // NIP filter
  query = applyNipFilter(query, nips, 'client_nip', ryczaltNips)

  // Sort by hit_count DESC, then created_at DESC
  query = query
    .order('hit_count', { ascending: false })
    .order('created_at', { ascending: false })

  // Pagination
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  query = query.range(from, to)

  const { data: rawRules, count } = await query

  const rules: RuleWithClient[] = (rawRules ?? []).map((r) => ({
    ...r,
    client_nazwa: (r.clients as unknown as { nazwa: string })?.nazwa ?? 'Nieznany',
    clients: undefined,
  }))

  const totalRules = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalRules / PAGE_SIZE))

  // Count rules per tab (filtered by NIP)
  let zakupCountQuery = supabase
    .from('rules')
    .select('id', { count: 'exact', head: true })
    .or('typ_dokumentu.eq.zakup,typ_dokumentu.is.null')
  zakupCountQuery = applyNipFilter(zakupCountQuery, nips, 'client_nip', ryczaltNips)
  const { count: zakupCount } = await zakupCountQuery

  let sprzedazCountQuery = supabase
    .from('rules')
    .select('id', { count: 'exact', head: true })
    .eq('typ_dokumentu', 'sprzedaz')
  sprzedazCountQuery = applyNipFilter(sprzedazCountQuery, nips, 'client_nip', ryczaltNips)
  const { count: sprzedazCount } = await sprzedazCountQuery

  // Fetch all active clients for dropdown filter (filtered by NIP)
  let clientsQuery = supabase
    .from('clients')
    .select('nip, nazwa')
    .eq('aktywny', true)
    .order('nazwa', { ascending: true })
  clientsQuery = applyNipFilter(clientsQuery, nips, 'nip', ryczaltNips)
  const { data: clients } = await clientsQuery

  // Fetch unique rule descriptions for autocomplete (for edit modal)
  let descQuery = supabase
    .from('rules')
    .select('opis_zdarzenia, hit_count')
    .order('hit_count', { ascending: false })
  descQuery = applyNipFilter(descQuery, nips, 'client_nip', ryczaltNips)
  const { data: allDescriptions } = await descQuery

  const uniqueDescriptions = Array.from(
    new Map(
      (allDescriptions ?? []).map((d) => [d.opis_zdarzenia, d])
    ).values()
  )

  return (
    <RulesPageClient
      rules={rules}
      totalRules={totalRules}
      currentPage={currentPage}
      totalPages={totalPages}
      totalZakup={zakupCount ?? 0}
      totalSprzedaz={sprzedazCount ?? 0}
      currentTyp={typFilter}
      clients={(clients ?? []) as Pick<Client, 'nip' | 'nazwa'>[]}
      search={params.search ?? ''}
      selectedClient={params.client ?? ''}
      selectedType={params.type ?? ''}
      ruleDescriptions={uniqueDescriptions}
    />
  )
}
