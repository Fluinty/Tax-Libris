'use client'

import { useState } from 'react'
import { Sparkles, Save, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { updateAutoWriteSettings } from '@/app/(auth)/klienci/[nip]/actions'
import { toast } from 'sonner'
import type { Client } from '@/types/database'

interface AutoWriteSectionProps {
  client: Client
  isAdmin: boolean
  candidateStats: {
    isCandidate: boolean
    editRatePct: number
    totalCount: number
  }
}

export function AutoWriteSection({ client, isAdmin, candidateStats }: AutoWriteSectionProps) {
  const [enabled, setEnabled] = useState<boolean>(Boolean(client.auto_write_enabled))
  const [maxKwota, setMaxKwota] = useState<number>(Number(client.auto_max_kwota ?? 5000))
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false)
  const [pendingEnabled, setPendingEnabled] = useState<boolean>(Boolean(client.auto_write_enabled))
  const [isSaving, setIsSaving] = useState<boolean>(false)

  const handleSwitchChange = (checked: boolean) => {
    if (!isAdmin) return
    if (checked && !enabled) {
      setPendingEnabled(true)
      setShowConfirmModal(true)
    } else {
      setEnabled(checked)
    }
  }

  const handleConfirmEnable = () => {
    setEnabled(true)
    setShowConfirmModal(false)
  }

  const handleSave = async () => {
    if (!isAdmin) return
    setIsSaving(true)
    try {
      const result = await updateAutoWriteSettings(client.nip, enabled, maxKwota)
      if (result.success) {
        toast.success('Zapisano ustawienia Auto-write')
      } else {
        toast.error(`Błąd zapisu: ${result.error || 'Nieznany błąd'}`)
      }
    } catch (err: any) {
      toast.error(`Błąd zapisu: ${err.message || 'Nieznany błąd'}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-bold text-[#1E293B]">Tryb Auto-write (Automatyczne księgowanie)</h2>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Faktury spełniające warunki pewności AI i limitu kwotowego są księgowane bez akceptacji księgowej.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {candidateStats.isCandidate ? (
            <Badge className="bg-green-100 text-green-800 border-green-300 font-semibold px-2.5 py-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
              Kandydat na auto (edit-rate {candidateStats.editRatePct}%)
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 px-2.5 py-1">
              Edit-rate {candidateStats.editRatePct}% ({candidateStats.totalCount} faktur)
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6">
        <div className="flex items-center justify-between p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-[#1E293B]">Auto-write włączony</div>
            <div className="text-xs text-[#64748B]">Zezwalaj na automatyczne zatwierdzanie faktur</div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleSwitchChange}
            disabled={!isAdmin || isSaving}
            className="cursor-pointer"
          />
        </div>

        <div className="flex flex-col justify-center p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
          <div className="text-sm font-semibold text-[#1E293B] mb-1">Maksymalna kwota brutto (zł)</div>
          <Input
            type="number"
            min={0}
            step={100}
            value={maxKwota}
            onChange={(e) => setMaxKwota(Number(e.target.value))}
            disabled={!isAdmin || isSaving}
            className="h-9 font-medium bg-white"
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between pt-4 border-t border-[#E2E8F0]">
        <div className="text-xs text-[#64748B]">
          {!isAdmin && 'Edycja ustawień Auto-write wymaga uprawnień administratora.'}
        </div>
        {isAdmin && (
          <Button onClick={handleSave} disabled={isSaving} className="bg-purple-600 hover:bg-purple-700 text-white cursor-pointer">
            <Save className="w-4 h-4 mr-1.5" />
            {isSaving ? 'Zapisywanie...' : 'Zapisz ustawienia Auto-write'}
          </Button>
        )}
      </div>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1E293B]">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Potwierdzenie włączenia Auto-write
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-[#475569]">
            Faktury tego klienta spełniające warunki będą księgowane automatycznie bez akceptacji. Kontynuować?
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>
              Anuluj
            </Button>
            <Button onClick={handleConfirmEnable} className="bg-purple-600 hover:bg-purple-700 text-white">
              Włącz Auto-write
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
