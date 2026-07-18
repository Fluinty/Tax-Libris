'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CollapsibleJpkSection } from './CollapsibleJpkSection'
import { updateJpkSection, resetJpkSection } from '@/app/(auth)/do-akceptacji/actions'
import { toast } from 'sonner'
import { Car, RotateCcw, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClientPojazd } from '@/types/database'

const REZIM_OPTIONS = [
  { value: '100', label: '100% (firmowy / VAT-26)', desc: 'Pojazd firmowy zgłoszony VAT-26 — pełny VAT, pełny koszt KPiR' },
  { value: '50_75', label: '75% (użytek mieszany)', desc: '50% VAT odliczone + 75% × (netto + ½ VAT) do KPiR — art. 23 ust. 1 pkt 46a PIT' },
  { value: '20', label: '20% (pojazd prywatny)', desc: '50% VAT odliczone + 20% × (netto + ½ nieodliczonego VAT) do KPiR' },
] as const

// Mapowanie procent_do_ujecia_w_kosztach (int enum) -> rezim UI value
const PROCENT_ENUM_TO_REZIM: Record<number, string> = {
  0: '100',
  1: '50_75',
  2: '20',
}

const PROCENT_LABELS: Record<number, string> = {
  0: '100% (firmowy / VAT-26)',
  1: '75% (użytek mieszany)',
  2: '20% (pojazd prywatny)',
}

interface KpirPojazdoweData {
  wydatki_dotycza_pojazdu: boolean
  procent_do_ujecia_w_kosztach: number
  wydatki_pozostale_wartosc_faktury: number
  koszt_kpir_obliczony: number
  strategia: string
  rezim_proc: string
  typ_wydatku?: string
  pojazd_nr_rej?: string
  leasingodawca?: string
  wartosc_nabycia_pojazdu?: number
}

interface Props {
  exceptionId: number
  clientNip: string
  clientPojazdy: ClientPojazd[]
  aiPojazdId: number | null | undefined
  aiRezim: string | null | undefined
  pojazdIdFinal: number | null | undefined
  rezimFinal: string | null | undefined
  isEdited: boolean
  readOnly?: boolean
  kwotaBrutto: number
  kpirPojazdoweData?: KpirPojazdoweData | null
}

function mapSposobToRezim(s: string): string {
  if (s === 'pelne_100') return '100'
  if (s.startsWith('mieszane') || s === 'wynajem_75') return '50_75'
  return '50_75'
}

export function PojazdRezimSection({ exceptionId, clientNip, clientPojazdy, aiPojazdId, aiRezim, pojazdIdFinal, rezimFinal, isEdited, readOnly = false, kwotaBrutto, kpirPojazdoweData }: Props) {
  // BUG 2 fix: initialize from kpirPojazdoweData if available
  const workerSaysVehicle = kpirPojazdoweData?.wydatki_dotycza_pojazdu === true

  const isExplicitFalse = isEdited && pojazdIdFinal === null && rezimFinal === null
  const effectiveId = isEdited ? (pojazdIdFinal ?? null) : (pojazdIdFinal ?? aiPojazdId ?? null)
  const effectiveRezim = isEdited ? (rezimFinal ?? '50_75') : (rezimFinal ?? aiRezim ?? (workerSaysVehicle ? (PROCENT_ENUM_TO_REZIM[kpirPojazdoweData!.procent_do_ujecia_w_kosztach] ?? '50_75') : '50_75'))
  const [enabled, setEnabled] = useState(isExplicitFalse ? false : (isEdited ? true : (effectiveId !== null || workerSaysVehicle)))
  const [selId, setSelId] = useState<number | null>(effectiveId)
  const [selRezim, setSelRezim] = useState(effectiveRezim)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const active = clientPojazdy.filter(p => p.aktywny)
  const archived = clientPojazdy.filter(p => !p.aktywny)
  const selPojazd = clientPojazdy.find(p => p.id === selId)

  const handleSwitchChange = async (v: boolean) => {
    const prevEnabled = enabled
    const prevSelId = selId
    const prevDirty = dirty
    setEnabled(v)
    if (!v) setSelId(null)
    setDirty(true)
    setSaving(true)
    try {
      const res = await updateJpkSection(exceptionId, {
        pojazd_id_final: v ? selId : null,
        rezim_paliwowy_final: v ? selRezim : null,
        rezim_edited: true
      })
      if (!res?.success) {
        toast.error(`Nie zapisano zmiany: ${res?.error || 'Błąd zapisu'}`)
        setEnabled(prevEnabled)
        setSelId(prevSelId)
        setDirty(prevDirty)
      } else {
        toast.success('Zapisano')
        setDirty(false)
      }
    } catch (e: unknown) {
      toast.error(`Nie zapisano zmiany: ${e instanceof Error ? e.message : 'Błąd zapisu'}`)
      setEnabled(prevEnabled)
      setSelId(prevSelId)
      setDirty(prevDirty)
    } finally {
      setSaving(false)
    }
  }

  const handleVehicleChange = async (p: ClientPojazd) => {
    const prevSelId = selId
    const prevSelRezim = selRezim
    const prevDirty = dirty
    const newRezim = mapSposobToRezim(p.sposob_rozliczenia)
    setSelId(p.id)
    setSelRezim(newRezim)
    setDirty(true)
    setSaving(true)
    try {
      const res = await updateJpkSection(exceptionId, {
        pojazd_id_final: p.id,
        rezim_paliwowy_final: newRezim,
        rezim_edited: true
      })
      if (!res?.success) {
        toast.error(`Nie zapisano zmiany: ${res?.error || 'Błąd zapisu'}`)
        setSelId(prevSelId)
        setSelRezim(prevSelRezim)
        setDirty(prevDirty)
      } else {
        toast.success('Zapisano')
        setDirty(false)
      }
    } catch (e: unknown) {
      toast.error(`Nie zapisano zmiany: ${e instanceof Error ? e.message : 'Błąd zapisu'}`)
      setSelId(prevSelId)
      setSelRezim(prevSelRezim)
      setDirty(prevDirty)
    } finally {
      setSaving(false)
    }
  }

  const handleRezimChange = async (val: string) => {
    const prevSelRezim = selRezim
    const prevDirty = dirty
    setSelRezim(val)
    setDirty(true)
    setSaving(true)
    try {
      const res = await updateJpkSection(exceptionId, {
        pojazd_id_final: selId,
        rezim_paliwowy_final: val,
        rezim_edited: true
      })
      if (!res?.success) {
        toast.error(`Nie zapisano zmiany: ${res?.error || 'Błąd zapisu'}`)
        setSelRezim(prevSelRezim)
        setDirty(prevDirty)
      } else {
        toast.success('Zapisano')
        setDirty(false)
      }
    } catch (e: unknown) {
      toast.error(`Nie zapisano zmiany: ${e instanceof Error ? e.message : 'Błąd zapisu'}`)
      setSelRezim(prevSelRezim)
      setDirty(prevDirty)
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    const prevEnabled = enabled
    const prevSelId = selId
    const prevSelRezim = selRezim
    const prevDirty = dirty
    setSaving(true)
    try {
      const res = await updateJpkSection(exceptionId, { pojazd_id_final: enabled ? selId : null, rezim_paliwowy_final: enabled ? selRezim : null, rezim_edited: true })
      if (!res?.success) {
        toast.error(`Nie zapisano zmiany: ${res?.error || 'Błąd zapisu'}`)
        setEnabled(prevEnabled)
        setSelId(prevSelId)
        setSelRezim(prevSelRezim)
        setDirty(prevDirty)
      } else {
        toast.success('Reżim zapisany')
        setDirty(false)
      }
    } catch (e: unknown) {
      toast.error(`Nie zapisano zmiany: ${e instanceof Error ? e.message : 'Błąd zapisu'}`)
      setEnabled(prevEnabled)
      setSelId(prevSelId)
      setSelRezim(prevSelRezim)
      setDirty(prevDirty)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    const prevEnabled = enabled
    const prevSelId = selId
    const prevSelRezim = selRezim
    const prevDirty = dirty
    setSaving(true)
    try {
      const res = await resetJpkSection(exceptionId, 'rezim')
      if (!res?.success) {
        toast.error(`Nie zapisano zmiany: ${res?.error || 'Błąd resetu'}`)
        setEnabled(prevEnabled)
        setSelId(prevSelId)
        setSelRezim(prevSelRezim)
        setDirty(prevDirty)
      } else {
        setEnabled(aiPojazdId != null || workerSaysVehicle)
        setSelId(aiPojazdId ?? null)
        setSelRezim(aiRezim ?? (workerSaysVehicle ? (PROCENT_ENUM_TO_REZIM[kpirPojazdoweData!.procent_do_ujecia_w_kosztach] ?? '50_75') : '50_75'))
        setDirty(false)
        toast.success('Przywrócono AI')
      }
    } catch (e: unknown) {
      toast.error(`Nie zapisano zmiany: ${e instanceof Error ? e.message : 'Błąd resetu'}`)
      setEnabled(prevEnabled)
      setSelId(prevSelId)
      setSelRezim(prevSelRezim)
      setDirty(prevDirty)
    } finally {
      setSaving(false)
    }
  }

  const badgeText = enabled && selPojazd ? `${selPojazd.marka_model || selPojazd.nr_rejestracyjny} • ${selRezim === '100' ? '100%' : selRezim === '50_75' ? '50/75' : '20%'}` : (enabled && workerSaysVehicle) ? `Pojazd • ${selRezim === '100' ? '100%' : selRezim === '50_75' ? '50/75' : '20%'}` : null
  const badge = badgeText ? <Badge variant="outline" className="text-[10px] h-5 font-normal text-orange-700 border-orange-200 bg-orange-50">{badgeText}</Badge> : null

  return (
    <CollapsibleJpkSection title="Pojazd i reżim paliwowy" badge={badge} defaultOpen={isEdited || effectiveId !== null || workerSaysVehicle} icon={<Car className="w-4 h-4" />}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm text-slate-700">Faktura dotyczy pojazdu?</span>
        <Switch checked={enabled} onCheckedChange={handleSwitchChange} disabled={readOnly || saving} size="sm" />
      </div>
      {enabled && (
        <div className="space-y-4">
          {/* Worker-computed data summary (BUG 2) */}
          {kpirPojazdoweData && kpirPojazdoweData.wydatki_dotycza_pojazdu && (
            <div className="bg-blue-50/60 border border-blue-200 rounded-md p-3 space-y-1.5">
              <div className="text-xs font-medium text-blue-700 uppercase mb-2 flex items-center gap-1.5">
                🤖 Wyliczenie AI (worker)
              </div>
              <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">W koszty:</span>
                <span className="font-medium text-slate-800">
                  {PROCENT_LABELS[kpirPojazdoweData.procent_do_ujecia_w_kosztach] ?? `${kpirPojazdoweData.procent_do_ujecia_w_kosztach}`}
                </span>
                <span className="text-slate-500">Wartość brutto faktury:</span>
                <span className="font-medium text-slate-800">
                  {kpirPojazdoweData.wydatki_pozostale_wartosc_faktury?.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                </span>
                <span className="text-slate-500">Wyliczony koszt KPiR:</span>
                <span className="font-semibold text-emerald-700">
                  {kpirPojazdoweData.koszt_kpir_obliczony?.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                </span>
                {kpirPojazdoweData.strategia && (
                  <>
                    <span className="text-slate-500">Strategia:</span>
                    <span className="font-medium text-slate-600 italic">{kpirPojazdoweData.strategia}</span>
                  </>
                )}
                {kpirPojazdoweData.rezim_proc && (
                  <>
                    <span className="text-slate-500">Reżim %:</span>
                    <span className="font-medium text-slate-600">{kpirPojazdoweData.rezim_proc}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Leasing rate dedicated section */}
          {kpirPojazdoweData && kpirPojazdoweData.typ_wydatku === 'rata_leasingowa' && (
            <div className="bg-indigo-50/60 border border-indigo-200 rounded-md p-3 space-y-1.5">
              <div className="text-xs font-medium text-indigo-700 uppercase mb-2 flex items-center gap-1.5">
                📋 Rata leasingowa
              </div>
              <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                {kpirPojazdoweData.leasingodawca && (
                  <>
                    <span className="text-slate-500">Leasingodawca:</span>
                    <span className="font-medium text-slate-800">{kpirPojazdoweData.leasingodawca}</span>
                  </>
                )}
                {(kpirPojazdoweData.pojazd_nr_rej || selPojazd) && (
                  <>
                    <span className="text-slate-500">Pojazd:</span>
                    <span className="font-medium text-slate-800">
                      {selPojazd ? `${selPojazd.marka_model || ''} ${selPojazd.nr_rejestracyjny}` : kpirPojazdoweData.pojazd_nr_rej}
                    </span>
                  </>
                )}
                {kpirPojazdoweData.wartosc_nabycia_pojazdu != null && (
                  <>
                    <span className="text-slate-500">Wartość nabycia:</span>
                    <span className="font-medium text-slate-800">
                      {kpirPojazdoweData.wartosc_nabycia_pojazdu.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                    </span>
                  </>
                )}
                {kpirPojazdoweData.rezim_proc && (
                  <>
                    <span className="text-slate-500">Proporcja KUP:</span>
                    <span className="font-semibold text-indigo-700">{kpirPojazdoweData.rezim_proc}</span>
                  </>
                )}
                <span className="text-slate-500">Koszt KPiR:</span>
                <span className="font-semibold text-emerald-700">
                  {kpirPojazdoweData.koszt_kpir_obliczony?.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                </span>
                <span className="text-slate-500">VAT odliczony:</span>
                <span className="font-medium text-slate-800">50% (bez limitu)</span>
              </div>
            </div>
          )}

          {/* TODO: Alert "leasing_bez_danych" — czeka na flagę z workera */}

          {/* Vehicle selection */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase mb-1.5 block">Pojazd</label>
            {active.length === 0 && archived.length === 0 ? (
              <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded-md">
                Klient nie ma pojazdów.{' '}
                <a href={`/klienci/${clientNip}?tab=pojazdy`} className="text-[#4A90E2] hover:underline inline-flex items-center gap-1">Dodaj <ExternalLink className="w-3 h-3" /></a>
              </div>
            ) : (
              <div className="space-y-1">
                {[...active, ...archived].map(p => (
                  <label key={p.id} className={cn("flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-colors", selId === p.id ? "border-[#4A90E2] bg-blue-50/50" : "border-slate-200 hover:border-slate-300", !p.aktywny && "opacity-60")}>
                    <input type="radio" name={`pojazd-${exceptionId}`} checked={selId === p.id} onChange={() => handleVehicleChange(p)} disabled={readOnly || saving} className="accent-[#4A90E2]" />
                    <div className="text-sm">
                      <span className="font-medium text-slate-800">{p.marka_model || 'Pojazd'}</span>
                      <span className="text-slate-500 ml-2">{p.nr_rejestracyjny}</span>
                      {!p.aktywny && <Badge variant="outline" className="ml-2 text-[10px] h-4">archiwalny</Badge>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Regime selection */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase mb-1.5 block">Reżim VAT i KPiR</label>
            <div className="space-y-1">
              {REZIM_OPTIONS.map(o => (
                <label key={o.value} className={cn("flex items-start gap-3 p-2 rounded-md border cursor-pointer transition-colors", selRezim === o.value ? "border-[#4A90E2] bg-blue-50/50" : "border-slate-200 hover:border-slate-300")}>
                  <input type="radio" name={`rezim-${exceptionId}`} checked={selRezim === o.value} onChange={() => handleRezimChange(o.value)} disabled={readOnly || saving} className="accent-[#4A90E2] mt-0.5" />
                  <div><div className="text-sm font-medium text-slate-800">{o.label}</div><div className="text-xs text-slate-500">{o.desc}</div></div>
                </label>
              ))}
            </div>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500 font-medium">Podgląd obliczeń</summary>
            <div className="mt-2 font-mono text-xs text-slate-600 bg-slate-50 p-2 rounded-md">
              Brutto: {kwotaBrutto.toFixed(2)} zł · Reżim: {selRezim === '100' ? '100% VAT + 100% KPiR' : selRezim === '50_75' ? '50% VAT + 75% × (netto+½VAT) KPiR' : '50% VAT + 20% × (netto+½VAT) KPiR'}
            </div>
          </details>
        </div>
      )}
      {!readOnly && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={saving || !isEdited} className="text-slate-500 text-xs"><RotateCcw className="w-3 h-3 mr-1" />Reset do AI</Button>
          <div className="flex-1" />
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty} className="bg-[#1F3A5F] hover:bg-[#2A4D7C] text-white text-xs">{saving ? 'Zapisuję...' : 'Zapisz'}</Button>
        </div>
      )}
    </CollapsibleJpkSection>
  )
}
