'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function getUserEmail(): Promise<string> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email ?? 'system'
}

/**
 * Update kolumna_kpir for a single pozycja.
 * Sets final_kolumna_kpir; effective_kolumna_kpir is GENERATED ALWAYS by Postgres.
 * Trigger recompute_final_kwoty auto-updates header kwoty.
 */
export async function updatePozycjaKpir(
  pozycjaId: number,
  newKolumna: number,
  newKategoria?: string
) {
  const userEmail = await getUserEmail()
  const supabase = createSupabaseAdmin()

  const updateData: Record<string, unknown> = {
    final_kolumna_kpir: newKolumna,
  }
  if (newKategoria !== undefined) {
    updateData.final_kategoria = newKategoria
  }

  const { error } = await supabase
    .from('faktury_pozycje')
    .update(updateData)
    .eq('id', pozycjaId)

  if (error) {
    return { success: false, error: error.message }
  }

  // Audit
  await supabase.from('audit_log').insert({
    action: 'pozycja_kpir_edit',
    details: {
      pozycja_id: pozycjaId,
      new_kolumna: newKolumna,
      new_kategoria: newKategoria,
      user: userEmail,
    },
  })

  revalidatePath('/do-akceptacji')
  return { success: true }
}

/**
 * Fetch similar historical positions via RPC match_pozycje (pgvector).
 */
export async function getSimilarPozycje(pozycjaId: number, matchCount = 10) {
  const supabase = createSupabaseAdmin()

  // 1. Get embedding + client_nip for this pozycja
  const { data: poz, error: fetchErr } = await supabase
    .from('faktury_pozycje')
    .select('nazwa_embedding, client_nip')
    .eq('id', pozycjaId)
    .single()

  if (fetchErr || !poz?.nazwa_embedding) {
    return []
  }

  // 2. RPC similarity search
  const { data: similar, error: rpcErr } = await supabase.rpc('match_pozycje', {
    query_embedding: poz.nazwa_embedding,
    p_client_nip: poz.client_nip,
    match_threshold: 0.7,
    match_count: matchCount,
    prefer_korekty: true,
  })

  if (rpcErr) {
    console.error('match_pozycje RPC error:', rpcErr)
    return []
  }

  return similar || []
}
