'use server'

import { createSupabaseAdmin } from '@/lib/supabase/admin'

export interface SearchData {
  clients: { nip: string; nazwa: string }[]
  opisy: { id: number; opis: string; client_nip: string; client_nazwa: string }[]
  pojazdy: { id: number; nr_rejestracyjny: string; client_nip: string; client_nazwa: string }[]
  ksefs: { numer_ksef: string; client_nip: string; client_nazwa: string; zapis_id: number }[]
}

export async function getGlobalSearchData(): Promise<SearchData> {
  const supabase = createSupabaseAdmin()

  // Pobierz NIP-y ryczałtowców do wykluczenia
  const { data: ryczaltData } = await supabase
    .from('clients')
    .select('nip')
    .eq('forma_opodatkowania', 'ryczalt')
  const ryczaltNips = new Set((ryczaltData ?? []).map(c => c.nip))

  // Klienci (bez ryczałtowców)
  const { data: clientsData } = await supabase
    .from('clients')
    .select('nip, nazwa')
    .eq('aktywny', true)
    .neq('forma_opodatkowania', 'ryczalt')

  const clients = clientsData || []
  const clientMap = new Map(clients.map(c => [c.nip, c.nazwa]))

  // Opisy
  const { data: opisyData } = await supabase
    .from('client_opisy')
    .select('id, opis, client_nip')
    .eq('aktywny', true)

  const opisy = (opisyData || [])
    .filter(o => !ryczaltNips.has(o.client_nip))
    .map(o => ({
      id: o.id,
      opis: o.opis,
      client_nip: o.client_nip,
      client_nazwa: clientMap.get(o.client_nip) || 'Nieznany',
    }))

  // Pojazdy
  const { data: pojazdyData } = await supabase
    .from('client_pojazdy')
    .select('id, nr_rejestracyjny, client_nip')
    .eq('aktywny', true)

  const pojazdy = (pojazdyData || [])
    .filter(p => !ryczaltNips.has(p.client_nip))
    .map(p => ({
      id: p.id,
      nr_rejestracyjny: p.nr_rejestracyjny,
      client_nip: p.client_nip,
      client_nazwa: clientMap.get(p.client_nip) || 'Nieznany',
    }))

  // KSeF (distinct z wyjątków, żeby nie przeciążać bierzemy najnowsze np. 1000)
  const { data: ksefData } = await supabase
    .from('exceptions_queue')
    .select('numer_ksef, client_nip, zapis_id')
    .not('numer_ksef', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000)

  // deduplikacja po numer_ksef
  const ksefMap = new Map()
  for (const row of ksefData || []) {
    if (row.numer_ksef && !ksefMap.has(row.numer_ksef) && !ryczaltNips.has(row.client_nip)) {
      ksefMap.set(row.numer_ksef, {
        numer_ksef: row.numer_ksef,
        client_nip: row.client_nip,
        client_nazwa: clientMap.get(row.client_nip) || 'Nieznany',
        zapis_id: row.zapis_id
      })
    }
  }
  const ksefs = Array.from(ksefMap.values())

  return {
    clients,
    opisy,
    pojazdy,
    ksefs
  }
}
