'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CollapsibleJpkSection } from './CollapsibleJpkSection'
import { SourceBadge } from './SourceBadge'
import { GTU_LIST, isGtuActive, toggleGtuBit, formatGtuBadgeList, type GtuSource } from '@/lib/jpk-helpers'
import { updateJpkSection, resetJpkSection } from '@/app/(auth)/do-akceptacji/actions'
import { toast } from 'sonner'
import { Tags, RotateCcw } from 'lucide-react'

interface Props {
  exceptionId: number
  gtuBitmask: number | null | undefined
  gtuSources: GtuSource[] | null | undefined
  gtuBitmaskFinal: number | null | undefined
  isEdited: boolean
  readOnly?: boolean
}

export function GtuSection({ exceptionId, gtuBitmask, gtuSources, gtuBitmaskFinal, isEdited, readOnly = false }: Props) {
  const effectiveBitmask = gtuBitmaskFinal ?? gtuBitmask ?? 0
  const [bitmask, setBitmask] = useState(effectiveBitmask)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [localEdited, setLocalEdited] = useState(false)

  const activeGtus = formatGtuBadgeList(bitmask)
  const sources = gtuSources ?? []

  const getSourceForGtu = (gtuNum: number): GtuSource | undefined => {
    if (localEdited && !isGtuActive(gtuBitmask ?? 0, gtuNum)) return undefined // manual toggle
    return sources.find(s => s.gtu === gtuNum)
  }

  const handleToggle = (gtuNum: number) => {
    setBitmask(prev => toggleGtuBit(prev, gtuNum))
    setDirty(true)
    setLocalEdited(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const res = await updateJpkSection(exceptionId, { gtu_bitmask_final: bitmask, gtu_edited_by_user: true })
    res.success ? (toast.success('GTU zapisane'), setDirty(false)) : toast.error(res.error || 'Błąd')
    setSaving(false)
  }

  const handleReset = async () => {
    setSaving(true)
    const res = await resetJpkSection(exceptionId, 'gtu')
    if (res.success) { setBitmask(gtuBitmask ?? 0); setDirty(false); setLocalEdited(false); toast.success('Przywrócono AI') }
    else toast.error(res.error || 'Błąd')
    setSaving(false)
  }

  const badge = activeGtus.length > 0
    ? <Badge variant="outline" className="text-[10px] h-5 font-normal text-slate-600">{activeGtus.join(', ')}</Badge>
    : null

  const defaultOpen = isEdited || effectiveBitmask > 0

  // Active sources for display
  const activeSources = sources.filter(s => isGtuActive(bitmask, s.gtu))

  return (
    <CollapsibleJpkSection title="Grupy Towarów i Usług (GTU)" badge={badge} defaultOpen={defaultOpen} icon={<Tags className="w-4 h-4" />}>
      {/* Grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {GTU_LIST.map(g => {
          const active = isGtuActive(bitmask, g.num)
          const source = getSourceForGtu(g.num)
          return (
            <label key={g.num} className="flex items-center gap-2 cursor-pointer py-0.5">
              <Checkbox
                checked={active}
                onCheckedChange={() => handleToggle(g.num)}
                disabled={readOnly}
              />
              <span className="text-sm">
                <span className="font-medium text-slate-700">GTU_{String(g.num).padStart(2, '0')}</span>
                <span className="text-slate-500 ml-1">{g.name}</span>
              </span>
              {active && source && <SourceBadge source={source.source} />}
              {active && localEdited && !source && <SourceBadge source="manual" />}
            </label>
          )
        })}
      </div>

      {/* Sources detail */}
      {activeSources.length > 0 && (
        <div className="mt-3 pt-2 border-t border-slate-100">
          <div className="text-xs font-medium text-slate-500 mb-1.5">💡 Źródła klasyfikacji:</div>
          <div className="space-y-1">
            {activeSources.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="font-medium">GTU_{String(s.gtu).padStart(2, '0')}</span>
                <SourceBadge source={s.source} />
                {s.detail && <span className="text-slate-500 italic truncate">„{s.detail}"</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={saving || !isEdited} className="text-slate-500 text-xs"><RotateCcw className="w-3 h-3 mr-1" />Reset do AI</Button>
          <div className="flex-1" />
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty} className="bg-[#1F3A5F] hover:bg-[#2A4D7C] text-white text-xs">{saving ? 'Zapisuję...' : 'Zapisz zmiany'}</Button>
        </div>
      )}
    </CollapsibleJpkSection>
  )
}
