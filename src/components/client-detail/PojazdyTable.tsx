'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Car, Trash2, RotateCcw } from 'lucide-react'
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
  const [canEdit, setCanEdit] = useState<boolean>(isAdmin ?? false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  
  const activePojazdy = pojazdy.filter(p => p.aktywny)
  const inactivePojazdy = pojazdy.filter(p => !p.aktywny)
  const [showInactive, setShowInactive] = useState(false)
  
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
    leasingodawca_nip: string
    vat26: boolean
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
    leasingodawca_nip: '',
    vat26: false,
  })

  useEffect(() => {
    if (isAdmin !== undefined) {
      setCanEdit(isAdmin)
      return
    }
    const checkAdmin = async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.email) return
        
        const { data: profile, error } = await supabase
          .schema('fluinty')
          .from('panel_users')
          .select('rola')
          .eq('email', user.email)
          .eq('aktywny', true)
          .single()
          
        if (error || !profile) {
          console.warn(`[PojazdyTable] Fallback-check failed for email: ${user.email}. Result:`, { profile, error })
          return
        }
        
        if (profile.rola === 'admin' || profile.rola === 'ksiegowa') {
          setCanEdit(true)
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
      leasingodawca_nip: '',
      vat26: false,
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
      leasingodawca_nip: p.leasingodawca_nip || '',
      vat26: p.vat26 ?? false,
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
        leasingodawca_nip: draft.leasingodawca_nip || null,
        vat26: draft.vat26,
      }
      const result = editingId
        ? await updatePojazd(editingId, nip, payload)
        : await addPojazd(nip, payload)
      if (!result.success) {
        toast.error('Błąd zapisywania', { description: result.error })
        return
      }
      toast.success(editingId ? 'Zaktualizowano pojazd' : 'Dodano pojazd')
      setIsModalOpen(false)
    } catch (e) {
      toast.error('Błąd zapisywania')
    }
  }

  const handleDelete = async (p: any) => {
    if (!window.confirm('Pojazd zostanie dezaktywowany — historyczne faktury pozostaną nietknięte. Kontynuować?')) return
    try {
      const result = await updatePojazd(p.id, nip, {
        aktywny: false,
        data_zakonczenia: new Date().toISOString()
      })
      if (!result.success) {
        toast.error('Błąd usuwania pojazdu', { description: result.error })
        return
      }
      toast.success('Pojazd został dezaktywowany')
    } catch (e) {
      toast.error('Błąd usuwania pojazdu')
    }
  }

  const handleRestore = async (p: any) => {
    try {
      const result = await updatePojazd(p.id, nip, {
        aktywny: true,
        data_zakonczenia: null
      })
      if (!result.success) {
        toast.error('Błąd przywracania pojazdu', { description: result.error })
        return
      }
      toast.success('Pojazd został reaktywowany')
    } catch (e) {
      toast.error('Błąd przywracania pojazdu')
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
          Aktywne pojazdy ({activePojazdy.length})
        </h2>
        {canEdit && (
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
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Rozliczenie (Enum)</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Napęd</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Własność</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Zastosowanie</th>
              <th className="text-right px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Wartość nabycia</th>
              {canEdit && <th className="text-right px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Akcje</th>}
            </tr>
          </thead>
          <tbody>
            {activePojazdy.map(p => (
              <tr key={p.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                <td className="px-4 py-3 font-medium text-[#1E293B]">
                  {p.nr_rejestracyjny}
                  {p.vat26 && <Badge variant="secondary" className="ml-2 text-[10px] h-4 bg-purple-50 text-purple-700">VAT-26</Badge>}
                </td>
                <td className="px-4 py-3 text-[#64748B]">{p.marka_model || '-'}</td>
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
                  {p.forma_wlasnosci === 'leasing' && p.leasingodawca_nip && <div className="text-[10px] text-slate-400">NIP: {p.leasingodawca_nip}</div>}
                </td>
                <td className="px-4 py-3 text-[#64748B]">
                  {zastosowanieLabels[p.zastosowanie] || p.zastosowanie || '-'}
                </td>
                <td className="px-4 py-3 text-right font-medium text-[#1E293B]">
                  {p.wartosc_nabycia ? `${p.wartosc_nabycia.toLocaleString('pl-PL')} zł` : '-'}
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[#64748B] hover:text-[#4A90E2]" onClick={() => openEdit(p)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[#64748B] hover:text-red-500 ml-1" onClick={() => handleDelete(p)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {activePojazdy.length === 0 && (
              <tr><td colSpan={canEdit ? 8 : 7} className="text-center py-8 text-[#64748B]">Brak dodanych aktywnych pojazdów</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Nieaktywne pojazdy */}
      {inactivePojazdy.length > 0 && (
        <div className="mt-4 border-t border-[#E2E8F0]">
          <button 
            className="w-full text-left p-3 text-sm font-medium text-slate-500 hover:bg-slate-50 flex items-center justify-between"
            onClick={() => setShowInactive(!showInactive)}
          >
            <span>Nieaktywne pojazdy ({inactivePojazdy.length})</span>
            <span>{showInactive ? 'Zwiń' : 'Rozwiń'}</span>
          </button>
          {showInactive && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm opacity-60">
                <tbody>
                  {inactivePojazdy.map(p => (
                    <tr key={p.id} className="border-t border-[#F1F5F9] bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-[#1E293B]">{p.nr_rejestracyjny}</td>
                      <td className="px-4 py-3 text-[#64748B]">{p.marka_model || '-'}</td>
                      <td className="px-4 py-3 text-[#64748B]">Zakończono: {p.data_zakonczenia?.split('T')[0] || '-'}</td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRestore(p)}>
                            <RotateCcw className="w-3 h-3 mr-1" /> Reaktywuj
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>NIP leasingodawcy</Label>
                <Input value={draft.leasingodawca_nip} onChange={e => setDraft({...draft, leasingodawca_nip: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Nr umowy leasingu</Label>
                <Input value={draft.nr_umowy_leasingu} onChange={e => setDraft({...draft, nr_umowy_leasingu: e.target.value})} />
              </div>
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

            {canEdit && (
              <div className="border-t border-[#E2E8F0] pt-4 space-y-4">
                <h4 className="font-semibold text-xs text-[#64748B] uppercase tracking-wider">Dane księgowe</h4>
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

                <div className="flex flex-col gap-3 pt-1">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={!!draft.ewidencja_przebiegu}
                      onCheckedChange={c => setDraft({ ...draft, ewidencja_przebiegu: c })}
                    />
                    <Label>Ewidencja przebiegu</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={!!draft.vat26}
                      onCheckedChange={c => setDraft({ ...draft, vat26: c })}
                    />
                    <Label>VAT-26 (pełne odliczenie VAT)</Label>
                  </div>
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
