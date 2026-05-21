'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Car } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { addPojazd, updatePojazd } from '@/app/(auth)/klienci/[nip]/actions'
import { toast } from 'sonner'

export function PojazdyTable({ nip, pojazdy }: { nip: string, pojazdy: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  
  const [draft, setDraft] = useState({
    nr_rejestracyjny: '',
    marka_model: '',
    nr_umowy_leasingu: '',
    sposob_rozliczenia: 'pelne_100',
    aktywny: true,
    notatki: ''
  })

  const openAdd = () => {
    setEditingId(null)
    setDraft({
      nr_rejestracyjny: '',
      marka_model: '',
      nr_umowy_leasingu: '',
      sposob_rozliczenia: 'pelne_100',
      aktywny: true,
      notatki: ''
    })
    setIsModalOpen(true)
  }

  const openEdit = (p: any) => {
    setEditingId(p.id)
    setDraft({
      nr_rejestracyjny: p.nr_rejestracyjny,
      marka_model: p.marka_model || '',
      nr_umowy_leasingu: p.nr_umowy_leasingu || '',
      sposob_rozliczenia: p.sposob_rozliczenia,
      aktywny: p.aktywny,
      notatki: p.notatki || ''
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!draft.nr_rejestracyjny) return toast.error('Nr rejestracyjny jest wymagany')
    try {
      if (editingId) {
        await updatePojazd(editingId, nip, draft)
        toast.success('Zaktualizowano pojazd')
      } else {
        await addPojazd(nip, draft)
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

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="p-4 border-b border-[#E2E8F0] flex justify-between items-center bg-[#F8FAFC]">
        <h2 className="font-bold text-[#1E293B] flex items-center gap-2">
          <Car className="w-4 h-4 text-[#4A90E2]" />
          Pojazdy klienta ({pojazdy.length})
        </h2>
        <Button onClick={openAdd} size="sm" className="h-8 bg-[#1F3A5F] text-white">
          <Plus className="w-3 h-3 mr-1" /> Dodaj pojazd
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white border-b border-[#E2E8F0]">
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Nr rej</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Marka/model</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Leasing</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Rozliczenie</th>
              <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Aktywny</th>
              <th className="text-right px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {pojazdy.map(p => (
              <tr key={p.id} className={`border-b border-[#F1F5F9] hover:bg-[#F8FAFC] ${!p.aktywny ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3 font-medium text-[#1E293B]">{p.nr_rejestracyjny}</td>
                <td className="px-4 py-3 text-[#64748B]">{p.marka_model || '-'}</td>
                <td className="px-4 py-3 text-[#64748B]">{p.nr_umowy_leasingu || '-'}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-[10px] font-normal bg-white">
                    {rozliczeniaMap[p.sposob_rozliczenia] || p.sposob_rozliczenia}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-center">
                  {p.aktywny ? <span className="text-green-500">✓</span> : <span className="text-slate-300">-</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-[#64748B] hover:text-[#4A90E2]" onClick={() => openEdit(p)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {pojazdy.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-[#64748B]">Brak dodanych pojazdów</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
            <div className="space-y-2">
              <Label>Sposób rozliczenia</Label>
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
