'use client'

import { useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CollapsibleJpkSection } from './CollapsibleJpkSection'
import { STAWKI_VAT, getStawkaLabel, type StawkaVat } from '@/lib/jpk-helpers'
import { updateJpkSection, resetJpkSection } from '@/app/(auth)/do-akceptacji/actions'
import { toast } from 'sonner'
import { Trash2, Plus, RotateCcw } from 'lucide-react'

interface PozycjaVatRow {
  stawka: string
  netto: number
  vat: number
  brutto: number
  pole_deklaracji?: string | null  // BUG 3: field for declaration column (e.g. "P:42")
}

interface PozycjeVatSectionProps {
  exceptionId: number
  kwotaBrutto: number
  /** Final edited pozycje (if user already edited) */
  pozycjeVatFinal: PozycjaVatRow[] | null | undefined
  /** AI-original pozycje from zapis_vat_data */
  pozycjeVatAi: PozycjaVatRow[] | null | undefined
  isEdited: boolean
  readOnly?: boolean
}

function calcVat(netto: number, stawka: string): number {
  const numericRate = parseFloat(stawka)
  if (isNaN(numericRate) || numericRate <= 0) return 0
  return Math.round(netto * numericRate) / 100
}

function calcBrutto(netto: number, vat: number): number {
  return Math.round((netto + vat) * 100) / 100
}

export function PozycjeVatSection({
  exceptionId,
  kwotaBrutto,
  pozycjeVatFinal,
  pozycjeVatAi,
  isEdited,
  readOnly = false,
}: PozycjeVatSectionProps) {
  const initial: PozycjaVatRow[] = pozycjeVatFinal ?? pozycjeVatAi ?? []
  const [rows, setRows] = useState<PozycjaVatRow[]>(initial.length > 0 ? initial : [{ stawka: '23', netto: 0, vat: 0, brutto: 0 }])
  const [savedRows, setSavedRows] = useState<PozycjaVatRow[]>(initial.length > 0 ? initial : [{ stawka: '23', netto: 0, vat: 0, brutto: 0 }])
  const [isSaving, setIsSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const sumBrutto = rows.reduce((a, r) => a + r.brutto, 0)
  const diff = Math.abs(sumBrutto - kwotaBrutto)
  const isMatchingBrutto = diff <= 0.02

  // Check if any row has pole_deklaracji
  const hasPoleDeklaracji = rows.some(r => r.pole_deklaracji)

  const updateRow = useCallback((index: number, field: 'stawka' | 'netto' | 'pole_deklaracji', value: string) => {
    setRows(prev => {
      const next = [...prev]
      const row = { ...next[index] }

      if (field === 'stawka') {
        row.stawka = value
        row.vat = calcVat(row.netto, value)
        row.brutto = calcBrutto(row.netto, row.vat)
      } else if (field === 'pole_deklaracji') {
        row.pole_deklaracji = value || null
      } else {
        const netto = parseFloat(value) || 0
        row.netto = netto
        row.vat = calcVat(netto, row.stawka)
        row.brutto = calcBrutto(netto, row.vat)
      }

      next[index] = row
      return next
    })
    setDirty(true)
  }, [])

  const addRow = () => {
    setRows(prev => [...prev, { stawka: '23', netto: 0, vat: 0, brutto: 0 }])
    setDirty(true)
  }

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index))
    setDirty(true)
  }

  const handleSave = async () => {
    const prevRows = savedRows
    setIsSaving(true)
    if (!isMatchingBrutto) {
      toast.warning(`Suma pozycji (${sumBrutto.toFixed(2)}) nie zgadza się z brutto faktury (${kwotaBrutto.toFixed(2)}). Różnica: ${diff.toFixed(2)} zł`)
    }
    try {
      const res = await updateJpkSection(exceptionId, {
        pozycje_vat_final: rows,
        pozycje_vat_edited: true,
      })
      if (!res?.success) {
        toast.error(`Nie zapisano zmiany: ${res?.error || 'Błąd zapisu'}`)
        setRows(prevRows)
        setDirty(false)
      } else {
        toast.success('Pozycje VAT zapisane')
        setSavedRows(rows)
        setDirty(false)
      }
    } catch (e: unknown) {
      toast.error(`Nie zapisano zmiany: ${e instanceof Error ? e.message : 'Błąd zapisu'}`)
      setRows(prevRows)
      setDirty(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    const prevRows = rows
    const prevSavedRows = savedRows
    const prevDirty = dirty
    setIsSaving(true)
    try {
      const res = await resetJpkSection(exceptionId, 'vat')
      if (!res?.success) {
        toast.error(`Nie zapisano zmiany: ${res?.error || 'Błąd resetu'}`)
        setRows(prevRows)
        setSavedRows(prevSavedRows)
        setDirty(prevDirty)
      } else {
        const aiRows = pozycjeVatAi ?? [{ stawka: '23', netto: 0, vat: 0, brutto: 0 }]
        setRows(aiRows)
        setSavedRows(aiRows)
        setDirty(false)
        toast.success('Przywrócono propozycję AI')
      }
    } catch (e: unknown) {
      toast.error(`Nie zapisano zmiany: ${e instanceof Error ? e.message : 'Błąd resetu'}`)
      setRows(prevRows)
      setSavedRows(prevSavedRows)
      setDirty(prevDirty)
    } finally {
      setIsSaving(false)
    }
  }

  // Badge content
  const badgeContent = rows.length > 0 && rows.some(r => r.brutto > 0)
    ? rows.filter(r => r.brutto > 0).map(r => `VAT ${getStawkaLabel(r.stawka)}: ${r.brutto.toFixed(2)}`).join(', ')
    : null

  const badge = badgeContent ? (
    <Badge variant="outline" className="text-[10px] h-5 font-normal text-slate-600">{badgeContent}</Badge>
  ) : null

  const defaultOpen = isEdited || (initial.length > 0 && initial.some(r => r.brutto > 0))

  // Dynamic grid: add pole_deklaracji column if any row has it
  const gridCols = hasPoleDeklaracji
    ? 'grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_80px_32px]'
    : 'grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px]'

  return (
    <CollapsibleJpkSection title="Pozycje VAT (edycja)" badge={badge} defaultOpen={defaultOpen}>
      {/* Table */}
      <div className="space-y-2">
        <div className={`grid ${gridCols} gap-2 text-[11px] font-semibold text-slate-500 uppercase`}>
          <div>Stawka</div>
          <div>Netto</div>
          <div>VAT</div>
          <div>Brutto</div>
          {hasPoleDeklaracji && <div>Deklar.</div>}
          <div></div>
        </div>
        {rows.map((row, i) => (
          <div key={i} className={`grid ${gridCols} gap-2 items-center`}>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={row.stawka}
              onChange={e => updateRow(i, 'stawka', e.target.value)}
              disabled={readOnly}
            >
              {STAWKI_VAT.map(s => (
                <option key={s} value={s}>{getStawkaLabel(s)}</option>
              ))}
            </select>
            <Input
              type="number"
              step="0.01"
              value={row.netto || ''}
              onChange={e => updateRow(i, 'netto', e.target.value)}
              className="h-8 text-sm"
              disabled={readOnly}
              placeholder="0.00"
            />
            <div className="h-8 flex items-center text-sm text-slate-600 px-2 bg-slate-50 rounded-md border border-slate-200">
              {row.vat.toFixed(2)}
            </div>
            <div className="h-8 flex items-center text-sm font-medium text-slate-800 px-2 bg-slate-50 rounded-md border border-slate-200">
              {row.brutto.toFixed(2)}
            </div>
            {hasPoleDeklaracji && (
              <Input
                type="text"
                value={row.pole_deklaracji || ''}
                onChange={e => updateRow(i, 'pole_deklaracji', e.target.value)}
                className="h-8 text-xs font-mono"
                disabled={readOnly}
                placeholder="—"
                title="Pole na deklaracji VAT-7 (np. P:42)"
              />
            )}
            {!readOnly && rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add row */}
      {!readOnly && (
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-[#4A90E2] mt-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Dodaj stawkę
        </button>
      )}

      {/* Summary */}
      <div className="mt-3 pt-2 border-t border-slate-100 space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">Suma brutto pozycji:</span>
          <span className="font-medium text-slate-800">{sumBrutto.toFixed(2)} zł</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">Brutto faktury:</span>
          <span className="font-medium text-slate-800">{kwotaBrutto.toFixed(2)} zł</span>
          {isMatchingBrutto ? (
            <Badge className="bg-green-100 text-green-800 border-green-200 h-5 text-[10px]">✓</Badge>
          ) : (
            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 h-5 text-[10px]">
              różnica: {diff.toFixed(2)} zł
            </Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      {!readOnly && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={isSaving || !isEdited}
            className="text-slate-500 text-xs"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset do AI
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !dirty}
            className="bg-[#1F3A5F] hover:bg-[#2A4D7C] text-white text-xs"
          >
            {isSaving ? 'Zapisuję...' : 'Zapisz zmiany'}
          </Button>
        </div>
      )}
    </CollapsibleJpkSection>
  )
}
