'use client'

import { useState } from 'react'
import { Pencil, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { updateClientData } from '@/app/(auth)/klienci/[nip]/actions'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'

export function ClientDataPanel({ client, isAdmin }: { client: any, isAdmin: boolean }) {
  const router = useRouter()
  const [isEditingInfo, setIsEditingInfo] = useState(false)
  const [infoDraft, setInfoDraft] = useState(client.dodatkowe_info_ksiegowej || '')
  
  const [isEditingData, setIsEditingData] = useState(false)
  const [dataDraft, setDataDraft] = useState({
    pkd_glowny: client.pkd_glowny || '',
    pkd_dodatkowe: client.pkd_dodatkowe || '',
    forma_dzialalnosci: client.forma_dzialalnosci || '',
    platnik_vat: client.platnik_vat,
    sprzedaz_mieszana: client.sprzedaz_mieszana,
    proporcja_vat_odliczalna: client.proporcja_vat_odliczalna || 100
  })

  const saveInfo = async () => {
    try {
      await updateClientData(client.nip, { dodatkowe_info_ksiegowej: infoDraft })
      setIsEditingInfo(false)
      toast.success('Zapisano dodatkowe informacje')
      router.refresh()
    } catch (e) {
      toast.error('Błąd podczas zapisywania')
    }
  }

  const saveData = async () => {
    try {
      await updateClientData(client.nip, dataDraft)
      setIsEditingData(false)
      toast.success('Zapisano dane klienta')
      router.refresh()
    } catch (e) {
      toast.error('Błąd podczas zapisywania')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col h-full">
      {/* Sekcja 1: Dane firmy */}
      <div className="p-6 border-b border-[#E2E8F0]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-[#1E293B] flex items-center gap-2">
            📝 Dane klienta
          </h2>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setIsEditingData(true)} className="h-8 text-xs">
              <Pencil className="w-3 h-3 mr-1" /> Edytuj
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="text-[#64748B]">PKD główne:</div>
          <div className="font-medium text-[#1E293B]">{client.pkd_glowny || '—'}</div>
          
          <div className="text-[#64748B]">PKD dodatkowe:</div>
          <div className="font-medium text-[#1E293B] truncate" title={client.pkd_dodatkowe}>{client.pkd_dodatkowe || '—'}</div>
          
          <div className="text-[#64748B]">Forma dział.:</div>
          <div className="font-medium text-[#1E293B]">{client.forma_dzialalnosci || '—'}</div>
          
          <div className="text-[#64748B]">Płatnik VAT:</div>
          <div className="font-medium text-[#1E293B]">{client.platnik_vat ? '✅ TAK' : '❌ NIE'}</div>
          
          <div className="text-[#64748B]">Sprzedaż mieszana:</div>
          <div className="font-medium text-[#1E293B]">
            {client.sprzedaz_mieszana ? `✅ TAK (${client.proporcja_vat_odliczalna}%)` : '❌ NIE'}
          </div>
        </div>
      </div>

      {/* Sekcja 2: Dodatkowe info */}
      <div className="p-6 flex-1 flex flex-col">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-[#64748B] uppercase tracking-wider">
            Dodatkowe info dla AI
          </h3>
          {!isEditingInfo && isAdmin && (
            <Button variant="ghost" size="sm" onClick={() => setIsEditingInfo(true)} className="h-7 text-xs text-[#4A90E2] hover:text-[#1F3A5F]">
              <Pencil className="w-3 h-3 mr-1" /> Edytuj info
            </Button>
          )}
        </div>
        
        {isEditingInfo ? (
          <div className="flex flex-col gap-2 flex-1 mt-2">
            <Textarea 
              value={infoDraft} 
              onChange={e => setInfoDraft(e.target.value)} 
              className="flex-1 min-h-[100px] text-sm resize-none"
              placeholder="Wpisz specyficzne informacje dla automatyzacji..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsEditingInfo(false)}>Anuluj</Button>
              <Button size="sm" className="bg-[#1F3A5F] text-white" onClick={saveInfo}>
                <Save className="w-3 h-3 mr-1" /> Zapisz
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-[#1E293B] bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0] whitespace-pre-wrap min-h-[100px]">
            {client.dodatkowe_info_ksiegowej || <span className="text-[#94A3B8] italic">Brak dodatkowych informacji...</span>}
          </div>
        )}
      </div>

      {/* Modal Edycji Danych Klienta */}
      <Dialog open={isEditingData} onOpenChange={setIsEditingData}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edycja danych klienta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pkd_g">PKD główne</Label>
                <Input id="pkd_g" value={dataDraft.pkd_glowny} onChange={e => setDataDraft({...dataDraft, pkd_glowny: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forma">Forma dział.</Label>
                <Input id="forma" value={dataDraft.forma_dzialalnosci} onChange={e => setDataDraft({...dataDraft, forma_dzialalnosci: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkd_d">PKD dodatkowe (po przecinku)</Label>
              <Input id="pkd_d" value={dataDraft.pkd_dodatkowe} onChange={e => setDataDraft({...dataDraft, pkd_dodatkowe: e.target.value})} />
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Switch id="vat" checked={dataDraft.platnik_vat} onCheckedChange={c => setDataDraft({...dataDraft, platnik_vat: c})} />
              <Label htmlFor="vat">Płatnik VAT</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="mieszana" checked={dataDraft.sprzedaz_mieszana} onCheckedChange={c => setDataDraft({...dataDraft, sprzedaz_mieszana: c})} />
              <Label htmlFor="mieszana">Sprzedaż mieszana</Label>
            </div>
            {dataDraft.sprzedaz_mieszana && (
              <div className="space-y-2 bg-[#F8FAFC] p-3 rounded-md border border-[#E2E8F0]">
                <Label htmlFor="prop">Proporcja VAT odliczalna (%)</Label>
                <Input id="prop" type="number" min="1" max="100" value={dataDraft.proporcja_vat_odliczalna} onChange={e => setDataDraft({...dataDraft, proporcja_vat_odliczalna: parseInt(e.target.value) || 100})} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditingData(false)}>Anuluj</Button>
            <Button className="bg-[#1F3A5F] text-white" onClick={saveData}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
