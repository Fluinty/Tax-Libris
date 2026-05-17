'use client'

import { useState } from 'react'
import { Plus, Pencil, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { addOpis, updateOpis } from '@/app/(auth)/klienci/[nip]/actions'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'

export function OpisyTable({ nip, opisy }: { nip: string, opisy: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  
  const [draft, setDraft] = useState({
    opis: '',
    typ_dokumentu: 'FV_KOSZTOWA',
    aktywny: true
  })

  const openAdd = () => {
    setEditingId(null)
    setDraft({ opis: '', typ_dokumentu: 'FV_KOSZTOWA', aktywny: true })
    setIsModalOpen(true)
  }

  const openEdit = (o: any) => {
    setEditingId(o.id)
    setDraft({ opis: o.opis, typ_dokumentu: o.typ_dokumentu || 'FV_KOSZTOWA', aktywny: o.aktywny })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!draft.opis) return toast.error('Opis jest wymagany')
    try {
      if (editingId) {
        await updateOpis(editingId, nip, draft)
        toast.success('Zaktualizowano opis')
      } else {
        await addOpis(nip, draft.opis, draft.typ_dokumentu)
        toast.success('Dodano opis')
      }
      setIsModalOpen(false)
    } catch (e) {
      toast.error('Błąd zapisywania')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="p-4 border-b border-[#E2E8F0] flex justify-between items-center bg-[#F8FAFC]">
        <h2 className="font-bold text-[#1E293B] flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#4A90E2]" />
          Opisy księgowe klienta ({opisy.length})
        </h2>
        <Button onClick={openAdd} size="sm" className="h-8 bg-[#1F3A5F] text-white">
          <Plus className="w-3 h-3 mr-1" /> Dodaj opis
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white border-b border-[#E2E8F0]">
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase w-1/2">Opis</th>
              <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Typ</th>
              <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Użycia</th>
              <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Aktywny</th>
              <th className="text-right px-4 py-3 font-semibold text-[#64748B] text-xs uppercase">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {opisy.map(o => (
              <tr key={o.id} className={`border-b border-[#F1F5F9] hover:bg-[#F8FAFC] ${!o.aktywny ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3 font-medium text-[#1E293B]">{o.opis}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-[10px] font-normal bg-white">
                    {o.typ_dokumentu}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-center text-[#64748B]">{o.hit_count}</td>
                <td className="px-4 py-3 text-center">
                  {o.aktywny ? <span className="text-green-500">✓</span> : <span className="text-slate-300">-</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-[#64748B] hover:text-[#4A90E2]" onClick={() => openEdit(o)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {opisy.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-[#64748B]">Brak dodanych opisów</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edytuj opis' : 'Dodaj nowy opis'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Pełny opis księgowy *</Label>
              <Input value={draft.opis} onChange={e => setDraft({...draft, opis: e.target.value})} placeholder="np. Zakup materiałów biurowych" />
            </div>
            <div className="space-y-2">
              <Label>Typ dokumentu</Label>
              <select 
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={draft.typ_dokumentu} 
                onChange={e => setDraft({...draft, typ_dokumentu: e.target.value})}
              >
                <option value="FV_KOSZTOWA">FV_KOSZTOWA</option>
                <option value="FV_SPRZEDAZOWA">FV_SPRZEDAZOWA</option>
                <option value="PARAGON">PARAGON</option>
                <option value="INNY">INNY</option>
              </select>
            </div>
            {editingId && (
              <div className="flex items-center space-x-2 pt-2 border-t border-[#E2E8F0]">
                <Switch checked={draft.aktywny} onCheckedChange={c => setDraft({...draft, aktywny: c})} />
                <Label>Opis aktywny (dostępny dla AI)</Label>
              </div>
            )}
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
