'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toggleAutoWrite } from '@/app/(auth)/wyjatki/actions'
import type { ClientWithCounts } from '@/types/database'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { addClient } from '@/app/(auth)/klienci/actions'

interface Props {
  clients: ClientWithCounts[]
  isAdmin: boolean
}

export function ClientsTableClient({ clients, isAdmin }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [loadingNips, setLoadingNips] = useState<Set<string>>(new Set())
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)

  const [formData, setFormData] = useState({
    nip: '',
    nazwa: '',
    nazwa_bazy_rachmistrz: '',
    pkd_glowny: '',
    forma_dzialalnosci: '',
    pilot: false,
  })

  const filtered = clients.filter(
    (c) =>
      c.nazwa.toLowerCase().includes(search.toLowerCase()) ||
      c.nip.includes(search)
  )

  const handleToggleAuto = async (nip: string, enabled: boolean) => {
    setLoadingNips((prev) => new Set(prev).add(nip))
    try {
      await toggleAutoWrite(nip, enabled)
      toast.success(enabled ? 'Auto-zapis włączony' : 'Auto-zapis wyłączony')
    } catch (err) {
      toast.error('Błąd', {
        description: err instanceof Error ? err.message : 'Nieznany błąd',
      })
    } finally {
      setLoadingNips((prev) => {
        const next = new Set(prev)
        next.delete(nip)
        return next
      })
    }
  }

  const handleRowClick = (nip: string) => {
    router.push(`/klienci/${nip}`)
  }

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.nip.length !== 10) {
      toast.error('NIP musi mieć 10 znaków')
      return
    }
    setAdding(true)
    try {
      await addClient(formData)
      toast.success('Dodano klienta')
      setIsAddOpen(false)
      setFormData({ nip: '', nazwa: '', nazwa_bazy_rachmistrz: '', pkd_glowny: '', forma_dzialalnosci: '', pilot: false })
      router.refresh()
    } catch (err) {
      toast.error('Błąd', { description: err instanceof Error ? err.message : 'Nie udało się dodać klienta' })
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <Input
            placeholder="Szukaj klienta po nazwie lub NIP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 border-[#E2E8F0]"
          />
        </div>
        {isAdmin && (
          <Button onClick={() => setIsAddOpen(true)} className="bg-[#1F3A5F] hover:bg-[#152A45] text-white">
            <Plus className="w-4 h-4 mr-2" />
            Dodaj klienta
          </Button>
        )}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Dodaj nowego klienta</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nip">NIP (10 cyfr)</Label>
              <Input id="nip" value={formData.nip} onChange={e => setFormData({ ...formData, nip: e.target.value })} required minLength={10} maxLength={10} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nazwa">Nazwa firmy</Label>
              <Input id="nazwa" value={formData.nazwa} onChange={e => setFormData({ ...formData, nazwa: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="baza">Nazwa bazy Rachmistrz</Label>
              <Input id="baza" value={formData.nazwa_bazy_rachmistrz} onChange={e => setFormData({ ...formData, nazwa_bazy_rachmistrz: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pkd">PKD główne</Label>
                <Input id="pkd" value={formData.pkd_glowny} onChange={e => setFormData({ ...formData, pkd_glowny: e.target.value })} placeholder="np. 62.01.Z" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forma">Forma dział.</Label>
                <Input id="forma" value={formData.forma_dzialalnosci} onChange={e => setFormData({ ...formData, forma_dzialalnosci: e.target.value })} placeholder="np. JDG, Sp. z o.o." />
              </div>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Switch id="pilot" checked={formData.pilot} onCheckedChange={c => setFormData({ ...formData, pilot: c })} />
              <Label htmlFor="pilot">Program Pilot</Label>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={adding} className="bg-[#1F3A5F] hover:bg-[#152A45] text-white">
                {adding ? 'Zapisywanie...' : 'Dodaj klienta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider">
                  Klient
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider">
                  NIP
                </th>
                <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider">
                  Faktur/mies
                </th>
                <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider">
                  Reguły
                </th>
                <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider">
                  Wyjątki
                </th>
                <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider">
                  Auto
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr
                  key={client.nip}
                  onClick={() => handleRowClick(client.nip)}
                  className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] cursor-pointer transition-colors duration-150"
                >
                  <td className="px-4 py-3 font-medium text-[#1E293B]">
                    <div className="flex items-center gap-2">
                      {client.nazwa}
                      {client.pilot && (
                        <Badge className="text-[10px] px-1.5 py-0 h-4 bg-[#4A90E2]/10 text-[#4A90E2] border-0">
                          Pilot
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#64748B] font-mono text-xs">
                    {client.nip}
                  </td>
                  <td className="px-4 py-3 text-center text-[#64748B]">
                    {client.avg_faktur_mies ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-[#1E293B] font-medium">
                      {client.rules_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {client.exceptions_count > 0 ? (
                      <Badge className="bg-[#FEF3C7] text-[#92400E] border-0 font-semibold">
                        {client.exceptions_count}
                      </Badge>
                    ) : (
                      <span className="inline-flex items-center justify-center">
                        <Check className="w-4 h-4 text-[#22C55E]" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    {isAdmin ? (
                      <Switch
                        checked={client.auto_write_enabled}
                        onCheckedChange={(checked) =>
                          handleToggleAuto(client.nip, checked)
                        }
                        disabled={loadingNips.has(client.nip)}
                        className="cursor-pointer"
                      />
                    ) : client.auto_write_enabled ? (
                      <Check className="w-4 h-4 text-[#22C55E] mx-auto" />
                    ) : (
                      <X className="w-4 h-4 text-[#94A3B8] mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-[#64748B]"
                  >
                    Brak wyników wyszukiwania
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
