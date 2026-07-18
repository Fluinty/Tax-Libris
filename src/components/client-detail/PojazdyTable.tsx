'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Car } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { addPojazd, updatePojazd } from '@/app/(auth)/klienci/[nip]/actions'
import { toast } from 'sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export function PojazdyTable({ nip, pojazdy, isAdmin }: { nip: string, pojazdy: any[], isAdmin?: boolean }) {
  const [isAdminState, setIsAdminState] = useState<boolean>(isAdmin ?? false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  
  const [draft, setDraft] = useState<{
    nr_rejestracyjny: string
    marka_model: string
    nr_umowy_leasingu: string
    sposob_rozliczenia: string
    aktywny: boolean
    notatki: string
    sposob_rozliczenia_enum: number | null
    forma_wlasnosci: string | null
    typ_pojazdu: string | null
    zastosowanie: string | null
    ewidencja_przebiegu: boolean | null
    wartosc_netto_zakupu: number | string | null
    data_rozpoczecia_uzytkowania: string | null
    typ_napedu: string | null
    wartosc_nabycia: number | string | null
  }>({
    nr_rejestracyjny: '',
    marka_model: '',
    nr_umowy_leasingu: '',
    sposob_rozliczenia: 'pelne_100',
    aktywny: true,
    notatki: '',
    sposob_rozliczenia_enum: null,
    forma_wlasnosci: null,
    typ_pojazdu: null,
    zastosowanie: null,
    ewidencja_przebiegu: null,
    wartosc_netto_zakupu: null,
    data_rozpoczecia_uzytkowania: null,
    typ_napedu: 'spalinowy',
    wartosc_nabycia: null,
  })

  useEffect(() => {
    if (isAdmin !== undefined) {
      setIsAdminState(isAdmin)
      return
    }
    const checkAdmin = async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.email) return
        const { data: profile } = await supabase
          .from('panel_users')
          .select('rola')
          .eq('email', user.email)
          .eq('aktywny', true)
          .single()
        if (profile?.rola === 'admin') {
          setIsAdminState(true)
        }
      } catch (err) {
        console.error('Błąd weryfikacji roli w PojazdyTable:', err)
      }
    }
    checkAdmin()
  }, [isAdmin])

  const openAdd = () => {
    setEditingId(null)
    setDraft({
      nr_rejestracyjny: '',
      marka_model: '',
      nr_umowy_leasingu: '',
      sposob_rozliczenia: 'pelne_100',
      aktywny: true,
      notatki: '',
      sposob_rozliczenia_enum: null,
      forma_wlasnosci: null,
      typ_pojazdu: null,
      zastosowanie: null,
      ewidencja_przebiegu: null,
      wartosc_netto_zakupu: null,
      data_rozpoczecia_uzytkowania: null,
      typ_napedu: 'spalinowy',
      wartosc_nabycia: null,
    })
    setIsModalOpen(true)
  }

  const openEdit = (p: any) => {
    setEditingId(p.id)
    setDraft({
      nr_rejestracyjny: p.nr_rejestracyjny || '',
      marka_model: p.marka_model || '',
      nr_umowy_leasingu: p.nr_umowy_leasingu || '',
      sposob_rozliczenia: p.sposob_rozliczenia || 'pelne_100',
      aktywny: p.aktywny ?? true,
      notatki: p.notatki || '',
      sposob_rozliczenia_enum: p.sposob_rozliczenia_enum ?? null,
      forma_wlasnosci: p.forma_wlasnosci ?? null,
      typ_pojazdu: p.typ_pojazdu ?? null,
      zastosowanie: p.zastosowanie ?? null,
      ewidencja_przebiegu: p.ewidencja_przebiegu ?? null,
      wartosc_netto_zakupu: p.wartosc_netto_zakupu ?? null,
      data_rozpoczecia_uzytkowania: p.data_rozpoczecia_uzytkowania ?? null,
      typ_napedu: p.typ_napedu ?? 'spalinowy',
      wartosc_nabycia: p.wartosc_nabycia ?? null,
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!draft.nr_rejestracyjny) return toast.error('Nr rejestracyjny jest wymagany')
    try {
      const payload = {
        nr_rejestracyjny: draft.nr_rejestracyjny,
        marka_model: draft.marka_model || null,
        nr_umowy_leasingu: draft.nr_umowy_leasingu || null,
        sposob_rozliczenia: draft.sposob_rozliczenia,
        aktywny: draft.aktywny,
        notatki: draft.notatki || null,
        sposob_rozliczenia_enum: draft.sposob_rozliczenia_enum,
        forma_wlasnosci: draft.forma_wlasnosci || null,
        typ_pojazdu: draft.typ_pojazdu || null,
        zastosowanie: draft.zastosowanie || null,
        ewidencja_przebiegu: draft.ewidencja_przebiegu,
        wartosc_netto_zakupu: draft.wartosc_netto_zakupu === null || draft.wartosc_netto_zakupu === '' ? null : Number(draft.wartosc_netto_zakupu),
        data_rozpoczecia_uzytkowania: draft.data_rozpoczecia_uzytkowania || null,
        typ_napedu: draft.typ_napedu || null,
        wartosc_nabycia: draft.wartosc_nabycia === null || draft.wartosc_nabycia === '' ? null : Number(draft.wartosc_nabycia),
      }
      if (editingId) {
        await updatePojazd(editingId, nip, payload)
        toast.success('Zaktualizowano pojazd')
      } else {
        await addPojazd(nip, payload)
        toast.success('Dodano pojazd')
      }
      setIsModalOpen(false)
    } catch (e) {
      toast.error('Błąd zapisywania')
    }
  }

  const rozliczeniaMap: Record<string, string> = {
    'pelne_100': '100% kosztu, 100% VAT',
    'mieszane_50': '50% VAT, 100% kosztu',
    'mieszane_75_50': '50% VAT, 75% kosztu',
    'wynajem_75': '75% kosztu (wynajem)',
    'inne': 'Inne (ręczne)'
  }

  function getRozliczenieEnumLabel(val: number | null | undefined): string {
    if (val === 0 || Number(val) === 0) return 'Służbowy 100/100'
    if (val === 1 || Number(val) === 1) return 'Mieszany 50/75'
    if (val === 2 || Number(val) === 2) return 'Prywatny 50/20'
    return '— (fallback klienta)'
  }

  const napedLabels: Record<string, string> = {
    'spalinowy': 'Spalinowy',
    'hybrydowy': 'Hybrydowy',
    'elektryczny': 'Elektryczny',
  }

  const LEASING_LIMITS: Record<string, number> = {
    'spalinowy': 100_000,
    'hybrydowy': 150_000,
    'elektryczny': 225_000,
  }

  function getLeasingPreview(): { limit: number; proporcja: number; procent: string } | null {
    const wn = draft.wartosc_nabycia
    if (wn === null || wn === '') return null
    const val = Number(wn)
    if (isNaN(val) || val <= 0) return null
    const limit = LEASING_LIMITS[draft.typ_napedu || 'spalinowy'] || 100_000
    const proporcja = Math.min(limit / val, 1)
    return { limit, proporcja, procent: (proporcja * 100).toFixed(2) }
  }

  const wlasnoscLabels: Record<string, string> = {
    'firmowy_st': 'Firmowy (ST)',
    'leasing': 'Leasing',
    'najem_dlugoterminowy': 'Najem długoterminowy',
    'najem_krotkoterminowy': 'Najem krótkoterminowy',
    'prywatny_wspolnika': 'Prywatny wspólnika',
    'uzyczenie': 'Użyczenie'
  }

  const zastosowanieLabels: Record<string, string> = {
    'mieszane': 'Mieszane',
    'tylko_firmowe': 'Tylko firmowe'
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="p-4 border-b border-[#E2E8F0] flex justify-between items-center bg-[#F8FAFC]">
        <h2 className="font-bold text-[#1E293B] flex items-center gap-2">
          <Car className="w-4 h-4 text-[#4A90E2]" />
          Pojazdy klienta ({pojazdy.length})
        </h2>
        {isAdminState && (
          <Button onClick={openAdd} size="sm" className="h-8 bg-[#1F3A5F] text-white">
            <Plus className="w-3 h-3 mr-1" /> Dodaj pojazd
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white border-b border-[#E2E8F0]">
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Nr rej</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Marka/model</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Leasing</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Rozliczenie</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Napęd</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Własność</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Zastosowanie</th>
              <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Aktywny</th>
              {isAdminState && <th className="text-right px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Akcje</th>}
            </tr>
          </thead>
          <tbody>
            {pojazdy.map(p => (
              <tr key={p.id} className={`border-b border-[#F1F5F9] hover:bg-[#F8FAFC] ${!p.aktywny ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3 font-medium text-[#1E293B]">{p.nr_rejestracyjny}</td>
                <td className="px-4 py-3 text-[#64748B]">{p.marka_model || '-'}</td>
                <td className="px-4 py-3 text-[#64748B]">{p.nr_umowy_leasingu || '-'}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-xs font-normal bg-white">
                    {getRozliczenieEnumLabel(p.sposob_rozliczenia_enum)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-[#64748B]">
                  {napedLabels[p.typ_napedu] || p.typ_napedu || '-'}
                </td>
                <td className="px-4 py-3 text-[#64748B]">
                  {wlasnoscLabels[p.forma_wlasnosci] || p.forma_wlasnosci || '-'}
                </td>
                <td className="px-4 py-3 text-[#64748B]">
                  {zastosowanieLabels[p.zastosowanie] || p.zastosowanie || '-'}
                </td>
                <td className="px-4 py-3 text-center">
                  {p.aktywny ? <span className="text-green-500">✓</span> : <span className="text-slate-300">-</span>}
                </td>
                {isAdminState && (
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[#64748B] hover:text-[#4A90E2]" onClick={() => openEdit(p)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {pojazdy.length === 0 && (
              <tr><td colSpan={isAdminState ? 9 : 8} className="text-center py-8 text-[#64748B]">Brak dodanych pojazdów</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edytuj pojazd' : 'Dodaj nowy pojazd'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nr rejestracyjny *</Label>
                <Input value={draft.nr_rejestracyjny} onChange={e => setDraft({...draft, nr_rejestracyjny: e.target.value.toUpperCase()})} />
              </div>
              <div className="space-y-2">
                <Label>Marka i model</Label>
                <Input value={draft.marka_model} onChange={e => setDraft({...draft, marka_model: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nr umowy leasingu</Label>
              <Input value={draft.nr_umowy_leasingu} onChange={e => setDraft({...draft, nr_umowy_leasingu: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Typ napędu</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={draft.typ_napedu || 'spalinowy'}
                  onChange={e => setDraft({ ...draft, typ_napedu: e.target.value })}
                >
                  <option value="spalinowy">Spalinowy</option>
                  <option value="hybrydowy">Hybrydowy</option>
                  <option value="elektryczny">Elektryczny</option>
                </select>
                {draft.typ_napedu === 'hybrydowy' && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 leading-snug">
                    ⚠️ Limit 150 tys. dotyczy tylko aut z emisją CO₂ ≤ 50 g/km (zwykle plug-in). Zwykła hybryda = limit jak spalinowy — w razie wątpliwości wybierz Spalinowy.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Wartość nabycia (leasing)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={draft.wartosc_nabycia ?? ''}
                  onChange={e => setDraft({ ...draft, wartosc_nabycia: e.target.value })}
                />
                <p className="text-[11px] text-slate-500 leading-snug">
                  Wartość z umowy leasingu: netto + nieodliczony VAT. Wypełnij tylko dla aut w leasingu — uruchamia proporcjonalne rozliczanie rat.
                </p>
                {(() => {
                  const preview = getLeasingPreview()
                  if (!preview) return null
                  return (
                    <div className="text-xs font-medium text-blue-700 bg-blue-50 rounded px-2 py-1.5">
                      Proporcja KUP: {preview.limit.toLocaleString('pl-PL')} / {Number(draft.wartosc_nabycia).toLocaleString('pl-PL')} = {preview.procent}%
                      {preview.proporcja >= 1 && <span className="text-emerald-600 ml-1">(100% — wartość ≤ limit)</span>}
                    </div>
                  )
                })()}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sposób rozliczenia (opisowe/legacy)</Label>
              <select 
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={draft.sposob_rozliczenia} 
                onChange={e => setDraft({...draft, sposob_rozliczenia: e.target.value})}
              >
                {Object.entries(rozliczeniaMap).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {isAdminState && (
              <div className="border-t border-[#E2E8F0] pt-4 space-y-4">
                <h4 className="font-semibold text-xs text-[#64748B] uppercase tracking-wider">Dane podatkowe (tylko Admin)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Rozliczenie reżimu (enum)</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={draft.sposob_rozliczenia_enum ?? ''}
                      onChange={e => setDraft({ ...draft, sposob_rozliczenia_enum: e.target.value === '' ? null : Number(e.target.value) })}
                    >
                      <option value="">— (fallback klienta)</option>
                      <option value="0">0 — Służbowy 100/100</option>
                      <option value="1">1 — Mieszany 50/75</option>
                      <option value="2">2 — Prywatny 50/20</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Forma własności</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={draft.forma_wlasnosci ?? ''}
                      onChange={e => setDraft({ ...draft, forma_wlasnosci: e.target.value || null })}
                    >
                      <option value="">— Brak —</option>
                      <option value="firmowy_st">Firmowy (ST)</option>
                      <option value="leasing">Leasing</option>
                      <option value="najem_dlugoterminowy">Najem długoterminowy</option>
                      <option value="najem_krotkoterminowy">Najem krótkoterminowy</option>
                      <option value="prywatny_wspolnika">Prywatny wspólnika</option>
                      <option value="uzyczenie">Użyczenie</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Typ pojazdu</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={draft.typ_pojazdu ?? ''}
                      onChange={e => setDraft({ ...draft, typ_pojazdu: e.target.value || null })}
                    >
                      <option value="">— Brak —</option>
                      <option value="osobowy">Osobowy</option>
                      <option value="ciezarowy">Ciężarowy</option>
                      <option value="motocykl">Motocykl</option>
                      <option value="inny">Inny</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Zastosowanie</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={draft.zastosowanie ?? ''}
                      onChange={e => setDraft({ ...draft, zastosowanie: e.target.value || null })}
                    >
                      <option value="">— Brak —</option>
                      <option value="mieszane">Mieszane</option>
                      <option value="tylko_firmowe">Tylko firmowe</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Wartość netto zakupu</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={draft.wartosc_netto_zakupu ?? ''}
                      onChange={e => setDraft({ ...draft, wartosc_netto_zakupu: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data rozpoczęcia użytkowania</Label>
                    <Input
                      type="date"
                      value={draft.data_rozpoczecia_uzytkowania ?? ''}
                      onChange={e => setDraft({ ...draft, data_rozpoczecia_uzytkowania: e.target.value || null })}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <Switch
                    checked={!!draft.ewidencja_przebiegu}
                    onCheckedChange={c => setDraft({ ...draft, ewidencja_przebiegu: c })}
                  />
                  <Label>Ewidencja przebiegu</Label>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notatki</Label>
              <Textarea value={draft.notatki} onChange={e => setDraft({...draft, notatki: e.target.value})} className="h-20 resize-none" />
            </div>
            <div className="flex items-center space-x-2 pt-2 border-t border-[#E2E8F0]">
              <Switch checked={draft.aktywny} onCheckedChange={c => setDraft({...draft, aktywny: c})} />
              <Label>Pojazd w aktywnym użytku</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Anuluj</Button>
            <Button className="bg-[#1F3A5F] text-white" onClick={handleSave}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
