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
import { addClient, resetDemoClient } from '@/app/(auth)/klienci/actions'

interface Props {
  clients: ClientWithCounts[]
  isAdmin: boolean
  okres: string
}

const OKRES_OPTIONS = [
  { key: 'dzis', label: 'Dziś' },
  { key: '7d', label: '7 dni' },
  { key: '30d', label: '30 dni' },
  { key: 'all', label: 'Wszystko' },
]

function CzystoscBadge({ pct, czyste, ai }: { pct: number | null; czyste: number; ai: number }) {
  if (ai === 0 || pct === null) {
    return <span className="text-slate-400">—</span>
  }
  let color = 'text-red-600 bg-red-50'
  if (pct >= 70) color = 'text-emerald-700 bg-emerald-50'
  else if (pct >= 50) color = 'text-amber-700 bg-amber-50'

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${color}`}>
      {pct.toFixed(1)}%
      <span className="font-normal text-[10px] opacity-70">({czyste}/{ai})</span>
    </span>
  )
}

function AutoBadge({ verdict }: { verdict: string | null }) {
  // '-' and null = no badge
  if (!verdict || verdict === '-') return null
  if (verdict === 'TAK') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px]" title="≥50 faktur AI i >50% czystości księgowej w wybranym okresie">
        Gotowy do auto
      </Badge>
    )
  }
  if (verdict === 'blisko') {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]" title="≥50 faktur AI i >50% czystości księgowej w wybranym okresie">
        Blisko progu
      </Badge>
    )
  }
  return null
}

export function ClientsTableClient({ clients, isAdmin, okres }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [loadingNips, setLoadingNips] = useState<Set<string>>(new Set())
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [resettingDemo, setResettingDemo] = useState(false)

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

  const handlePendingClick = (e: React.MouseEvent, nip: string) => {
    e.stopPropagation()
    router.push(`/do-akceptacji?nip=${nip}`)
  }

  const handleOkresChange = (key: string) => {
    const params = new URLSearchParams(window.location.search)
    if (key === 'all') {
      params.delete('okres')
    } else {
      params.set('okres', key)
    }
    const qs = params.toString()
    router.push(`/klienci${qs ? `?${qs}` : ''}`)
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

  const handleInitDemo = async () => {
    if (!confirm('Czy na pewno chcesz zainicjować środowisko DEMO? To utworzy klienta "Demo Firma" i wygeneruje testowe faktury.')) return
    setResettingDemo(true)
    try {
      const result = await resetDemoClient()
      if (result.errors && result.errors.length > 0) {
        toast.error(`Wystąpiły błędy (${result.errors.length})`, { description: result.errors[0] })
      } else {
        toast.success(`Utworzono ${result.created} faktur demo`)
      }
      router.refresh()
    } catch (err) {
      toast.error('Błąd inicjacji DEMO', { description: err instanceof Error ? err.message : 'Nieznany błąd' })
    } finally {
      setResettingDemo(false)
    }
  }

  const hasDemoClient = clients.some(c => (c as any).is_demo)

  // Summary row calculations
  const sumAi = filtered.reduce((s, c) => s + c.ai_count, 0)
  const sumExt = filtered.reduce((s, c) => s + c.external_count, 0)
  const sumKorekty = filtered.reduce((s, c) => s + c.decyzje_ksiegowe, 0)
  const sumPending = filtered.reduce((s, c) => s + c.pending_count, 0)
  const sumSkipped = filtered.reduce((s, c) => s + c.skipped_count, 0)
  const sumCzyste = filtered.reduce((s, c) => s + c.czyste_ksiegowo, 0)
  const avgPct = sumAi > 0 ? (sumCzyste / sumAi) * 100 : null

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
        <div className="flex items-center gap-2">
          {isAdmin && !hasDemoClient && (
            <Button onClick={handleInitDemo} disabled={resettingDemo} variant="outline" className="text-purple-600 border-purple-200 hover:bg-purple-50">
              <Plus className="w-4 h-4 mr-2" />
              {resettingDemo ? 'Inicjowanie...' : 'Zainicjuj Demo'}
            </Button>
          )}
          {isAdmin && (
            <Button onClick={() => setIsAddOpen(true)} className="bg-[#1F3A5F] hover:bg-[#152A45] text-white">
              <Plus className="w-4 h-4 mr-2" />
              Dodaj klienta
            </Button>
          )}
        </div>
      </div>

      {/* Segmented time filter */}
      <div className="flex items-center gap-1 mb-4 p-1 bg-slate-100 rounded-lg w-fit">
        {OKRES_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => handleOkresChange(opt.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              okres === opt.key
                ? 'bg-white text-[#1E293B] shadow-sm'
                : 'text-[#64748B] hover:text-[#1E293B]'
            }`}
          >
            {opt.label}
          </button>
        ))}
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
                <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider" title="Faktury zaksięgowane przez system w wybranym okresie">
                  Zaksięg. AI
                </th>
                <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider" title="Zaksięgowane przez księgową poza systemem — nie wliczają się do oceny AI">
                  Ręcznie
                </th>
                <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider" title="Odsetek zaksięgowanych BEZ korekt wpływających na KPiR/VAT. Poprawki samego opisu nie są korektą księgową.">
                  Czystość księg.
                </th>
                <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider" title="Korekty wpływające na KPiR/VAT">
                  Korekty
                </th>
                <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider" title="Czeka na akceptację teraz (all-time)">
                  Do akceptacji
                </th>
                <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider" title="Pominięte faktury w wybranym okresie">
                  Pominięte
                </th>
                <th className="text-center px-4 py-3 font-semibold text-[#64748B] text-xs uppercase tracking-wider" title="≥50 faktur AI i >50% czystości księgowej w wybranym okresie">
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
                      {(client as any).is_demo && (
                        <Badge className="text-[10px] px-1.5 py-0 h-4 bg-purple-100 text-purple-800 border-0">
                          DEMO
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-[#64748B]">
                    {client.ai_count}
                  </td>
                  <td className="px-4 py-3 text-center text-[#64748B]">
                    {client.external_count}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CzystoscBadge pct={client.pct_ksiegowa} czyste={client.czyste_ksiegowo} ai={client.ai_count} />
                  </td>
                  <td className="px-4 py-3 text-center" title={`z opisami: ${client.decyzje_realne}`}>
                    {client.decyzje_ksiegowe > 0 ? (
                      <span className="font-semibold text-purple-700">{client.decyzje_ksiegowe}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => handlePendingClick(e, client.nip)}>
                    {client.pending_count > 0 ? (
                      <Badge className="bg-[#FEF3C7] text-[#92400E] border-0 font-semibold cursor-pointer hover:bg-[#FDE68A]">
                        {client.pending_count}
                      </Badge>
                    ) : (
                      <span className="inline-flex items-center justify-center">
                        <Check className="w-4 h-4 text-[#22C55E]" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-[#64748B]">
                    {client.skipped_count > 0 ? client.skipped_count : <span className="text-slate-400">0</span>}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    {isAdmin ? (
                      <div className="flex items-center justify-center gap-2">
                        <AutoBadge verdict={client.auto_verdict} />
                        <Switch
                          checked={client.auto_write_enabled}
                          onCheckedChange={(checked) =>
                            handleToggleAuto(client.nip, checked)
                          }
                          disabled={loadingNips.has(client.nip)}
                          className="cursor-pointer"
                        />
                      </div>
                    ) : (
                      <AutoBadge verdict={client.auto_verdict} />
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-[#64748B]"
                  >
                    Brak wyników wyszukiwania
                  </td>
                </tr>
              )}
            </tbody>
            {/* Summary row */}
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-[#F8FAFC] border-t-2 border-[#E2E8F0] font-semibold text-[#1E293B]">
                  <td className="px-4 py-3 text-xs uppercase text-[#64748B]">
                    Suma ({filtered.length} klientów)
                  </td>
                  <td className="px-4 py-3 text-center">{sumAi}</td>
                  <td className="px-4 py-3 text-center">{sumExt}</td>
                  <td className="px-4 py-3 text-center">
                    <CzystoscBadge pct={avgPct} czyste={sumCzyste} ai={sumAi} />
                  </td>
                  <td className="px-4 py-3 text-center">{sumKorekty}</td>
                  <td className="px-4 py-3 text-center">{sumPending}</td>
                  <td className="px-4 py-3 text-center">{sumSkipped}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
