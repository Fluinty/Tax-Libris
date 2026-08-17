'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getAllowedNips, applyNipFilter } from '@/lib/auth-helpers'

export interface SearchData {
  clients: { nip: string; nazwa: string }[]
  opisy: { id: number; opis: string; client_nip: string; client_nazwa: string }[]
  pojazdy: { id: number; nr_rejestracyjny: string; client_nip: string; client_nazwa: string }[]
  ksefs: { numer_ksef: string; client_nip: string; client_nazwa: string; zapis_id: number }[]
  /** AUDIT §2 (C8): bledy odczytu per zrodlo — search degraduje czesciowo,
   *  ale nie polyka bledow po cichu (konsument moze pokazac ostrzezenie) */
  errors?: string[]
}

export async function getGlobalSearchData(): Promise<SearchData> {
  const supabase = createSupabaseAdmin()
  const { nips, isAdmin, ryczaltNips, demoNips } = await getAllowedNips()

  // Klienci (bez ryczałtowców)
  let clientsQuery = supabase
    .from('clients')
    .select('nip, nazwa')
    .eq('aktywny', true)
  clientsQuery = applyNipFilter(clientsQuery, nips, 'nip', ryczaltNips, demoNips, isAdmin)

  const { data: clientsData, error: clientsError } = await clientsQuery
  const clients = clientsData || []
  const clientMap = new Map(clients.map(c => [c.nip, c.nazwa]))

  const ryczaltNipsSet = new Set(ryczaltNips)

  // Opisy
  let opisyQuery = supabase
    .from('client_opisy')
    .select('id, opis, client_nip')
    .eq('aktywny', true)
  opisyQuery = applyNipFilter(opisyQuery, nips, 'client_nip', ryczaltNips, demoNips, isAdmin)
  const { data: opisyData, error: opisyError } = await opisyQuery

  const opisy = (opisyData || [])
    .filter(o => !ryczaltNipsSet.has(o.client_nip))
    .map(o => ({
      id: o.id,
      opis: o.opis,
      client_nip: o.client_nip,
      client_nazwa: clientMap.get(o.client_nip) || 'Nieznany',
    }))

  // Pojazdy
  let pojazdyQuery = supabase
    .from('client_pojazdy')
    .select('id, nr_rejestracyjny, client_nip')
    .eq('aktywny', true)
  pojazdyQuery = applyNipFilter(pojazdyQuery, nips, 'client_nip', ryczaltNips, demoNips, isAdmin)
  const { data: pojazdyData, error: pojazdyError } = await pojazdyQuery

  const pojazdy = (pojazdyData || [])
    .filter(p => !ryczaltNipsSet.has(p.client_nip))
    .map(p => ({
      id: p.id,
      nr_rejestracyjny: p.nr_rejestracyjny,
      client_nip: p.client_nip,
      client_nazwa: clientMap.get(p.client_nip) || 'Nieznany',
    }))

  let ksefQuery = supabase
    .from('exceptions_queue')
    .select('numer_ksef, client_nip, zapis_id')
    .not('numer_ksef', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000)
  ksefQuery = applyNipFilter(ksefQuery, nips, 'client_nip', ryczaltNips, demoNips, isAdmin)

  const { data: ksefData, error: ksefError } = await ksefQuery

  // deduplikacja po numer_ksef
  const ksefMap = new Map()
  for (const row of ksefData || []) {
    if (row.numer_ksef && !ksefMap.has(row.numer_ksef) && !ryczaltNipsSet.has(row.client_nip)) {
      ksefMap.set(row.numer_ksef, {
        numer_ksef: row.numer_ksef,
        client_nip: row.client_nip,
        client_nazwa: clientMap.get(row.client_nip) || 'Nieznany',
        zapis_id: row.zapis_id
      })
    }
  }
  const ksefs = Array.from(ksefMap.values())

  // Bledy odczytu: kazde zrodlo osobno (wyszukiwarka dziala czesciowo na
  // reszcie zrodel), ale kazdy blad jest zalogowany i zwrocony — zero
  // cichego polykania (CLAUDE.md).
  const errors = [
    clientsError && `clients: ${clientsError.message}`,
    opisyError && `client_opisy: ${opisyError.message}`,
    pojazdyError && `client_pojazdy: ${pojazdyError.message}`,
    ksefError && `exceptions_queue: ${ksefError.message}`,
  ].filter((e): e is string => Boolean(e))
  for (const e of errors) console.error('[getGlobalSearchData] blad odczytu:', e)

  return {
    clients,
    opisy,
    pojazdy,
    ksefs,
    ...(errors.length > 0 ? { errors } : {}),
  }
}
