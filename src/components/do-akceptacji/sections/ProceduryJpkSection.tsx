'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { CollapsibleJpkSection } from './CollapsibleJpkSection'
import { PROCEDURY_JPK_BITMASK, TYP_DOKUMENTU_JPK, bitmaskToProceduryCodes, isProceduraActive, toggleProceduraBit, getTypDokumentuLabel, getProceduryJpkForTyp, getTypDokumentuJpkForTyp } from '@/lib/jpk-helpers'
import { updateJpkSection, resetJpkSection } from '@/app/(auth)/do-akceptacji/actions'
import { toast } from 'sonner'
import { FileCheck, RotateCcw, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TypDokumentu } from '@/types/database'

interface Props {
  exceptionId: number
  proceduraJpk: number | null | undefined
  typDokumentuJpk: number | null | undefined
  proceduraJpkFinal: number | null | undefined
  typDokumentuJpkFinal: number | null | undefined
  isEdited: boolean
  readOnly?: boolean
  typDokumentu: string | null
}

export function ProceduryJpkSection({ exceptionId, proceduraJpk, typDokumentuJpk, proceduraJpkFinal, typDokumentuJpkFinal, isEdited, readOnly = false, typDokumentu }: Props) {
  const effectiveBitmask = proceduraJpkFinal ?? proceduraJpk ?? 0
  const effectiveTyp = typDokumentuJpkFinal ?? typDokumentuJpk ?? 0

  const [bitmask, setBitmask] = useState(effectiveBitmask)
  const [typDok, setTypDok] = useState(effectiveTyp)
  const [savedBitmask, setSavedBitmask] = useState(effectiveBitmask)
  const [savedTypDok, setSavedTypDok] = useState(effectiveTyp)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const proceduryDostepne = getProceduryJpkForTyp(typDokumentu)
  const typyDokumentowDostepne = getTypDokumentuJpkForTyp(typDokumentu)

  const frequent = proceduryDostepne.filter(p => p.frequent)
  const rare = proceduryDostepne.filter(p => !p.frequent)

  const activeCodes = bitmaskToProceduryCodes(bitmask).filter(kod => proceduryDostepne.some(p => p.kod === kod))
  const typLabel = getTypDokumentuLabel(typDok)

  const handleToggle = (bit: number) => {
    setBitmask(prev => toggleProceduraBit(prev, bit))
    setDirty(true)
  }

  const handleSave = async () => {
    const prevBitmask = savedBitmask
    const prevTypDok = savedTypDok
    setSaving(true)
    try {
      const res = await updateJpkSection(exceptionId, { procedura_jpk_final: bitmask, typ_dokumentu_jpk_final: typDok, jpk_procedury_edited: true })
      if (!res?.success) {
        toast.error(`Nie zapisano zmiany: ${res?.error || 'Błąd zapisu'}`)
        setBitmask(prevBitmask)
        setTypDok(prevTypDok)
        setDirty(false)
      } else {
        toast.success('Procedury JPK zapisane')
        setSavedBitmask(bitmask)
        setSavedTypDok(typDok)
        setDirty(false)
      }
    } catch (e: unknown) {
      toast.error(`Nie zapisano zmiany: ${e instanceof Error ? e.message : 'Błąd zapisu'}`)
      setBitmask(prevBitmask)
      setTypDok(prevTypDok)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    const prevBitmask = bitmask
    const prevTypDok = typDok
    const prevSavedBitmask = savedBitmask
    const prevSavedTypDok = savedTypDok
    const prevDirty = dirty
    setSaving(true)
    try {
      const res = await resetJpkSection(exceptionId, 'procedury')
      if (!res?.success) {
        toast.error(`Nie zapisano zmiany: ${res?.error || 'Błąd resetu'}`)
        setBitmask(prevBitmask)
        setTypDok(prevTypDok)
        setSavedBitmask(prevSavedBitmask)
        setSavedTypDok(prevSavedTypDok)
        setDirty(prevDirty)
      } else {
        const aiBitmask = proceduraJpk ?? 0
        const aiTyp = typDokumentuJpk ?? 0
        setBitmask(aiBitmask)
        setTypDok(aiTyp)
        setSavedBitmask(aiBitmask)
        setSavedTypDok(aiTyp)
        setDirty(false)
        toast.success('Przywrócono AI')
      }
    } catch (e: unknown) {
      toast.error(`Nie zapisano zmiany: ${e instanceof Error ? e.message : 'Błąd resetu'}`)
      setBitmask(prevBitmask)
      setTypDok(prevTypDok)
      setSavedBitmask(prevSavedBitmask)
      setSavedTypDok(prevSavedTypDok)
      setDirty(prevDirty)
    } finally {
      setSaving(false)
    }
  }

  const badge = activeCodes.length > 0
    ? <Badge variant="outline" className="text-[10px] h-5 font-normal text-slate-600">{activeCodes.join(', ')}</Badge>
    : typDok > 0
    ? <Badge variant="outline" className="text-[10px] h-5 font-normal text-slate-600">{TYP_DOKUMENTU_JPK.find(t => t.value === typDok)?.kod}</Badge>
    : null

  const defaultOpen = isEdited || bitmask > 0 || typDok > 0

  return (
    <CollapsibleJpkSection title="Procedury JPK_V7" badge={badge} defaultOpen={defaultOpen} icon={<FileCheck className="w-4 h-4" />}>
      <div className="space-y-4">
        {/* Frequent procedures */}
        {frequent.length > 0 && (
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase mb-1.5 block">Procedury (najczęstsze)</label>
            <div className="space-y-1.5">
              {frequent.map(p => (
                <label key={p.bit} className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox checked={isProceduraActive(bitmask, p.bit)} onCheckedChange={() => handleToggle(p.bit)} disabled={readOnly} />
                  <span className="text-sm"><span className="font-medium text-slate-800">{p.kod}</span> <span className="text-slate-500">— {p.nazwa}</span></span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Rare procedures */}
        {rare.length > 0 && (
          <Collapsible open={showMore} onOpenChange={setShowMore}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors cursor-pointer">
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showMore && "rotate-180")} />
              {showMore ? 'Ukryj' : 'Pokaż więcej procedur'} ({rare.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-1.5 pl-1">
              {rare.map(p => (
                <label key={p.bit} className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox checked={isProceduraActive(bitmask, p.bit)} onCheckedChange={() => handleToggle(p.bit)} disabled={readOnly} />
                  <span className="text-sm"><span className="font-medium text-slate-800">{p.kod}</span> <span className="text-slate-500">— {p.nazwa}</span></span>
                </label>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Typ dokumentu */}
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase mb-1.5 block">Typ dokumentu JPK</label>
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={typDok}
            onChange={e => { setTypDok(Number(e.target.value)); setDirty(true) }}
            disabled={readOnly}
          >
            {typyDokumentowDostepne.map(t => (
              <option key={t.value} value={t.value}>{t.nazwa}</option>
            ))}
          </select>
        </div>
      </div>

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
