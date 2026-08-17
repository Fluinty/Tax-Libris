'use client'

import { useState } from 'react'
import { Globe, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CollapsibleJpkSection } from './CollapsibleJpkSection'
import { updateFinalZapisVAT } from '@/app/(auth)/do-akceptacji/actions'
import { toast } from 'sonner'
import type { ZapisVATData } from '@/types/database'

const TRANSAKCJE_SPRZEDAZ = [
  { id: 1, nazwa: 'Dostawa krajowa' },
  { id: 3, nazwa: 'Dostawa tow. i usług poza terytorium kraju' },
  { id: 4, nazwa: 'Świadczenie usług poza terytorium kraju' },
  { id: 5, nazwa: 'WDT' },
  { id: 9, nazwa: 'Eksport towarów' },
] as const

interface Props {
  exceptionId: number
  zapisVat: ZapisVATData
  readOnly?: boolean
}

export function TransakcjaZagranicznaSection({ exceptionId, zapisVat, readOnly = false }: Props) {
  if (!zapisVat.transakcja_zagraniczna) return null

  const [selTransakcjaId, setSelTransakcjaId] = useState(zapisVat.transakcja_id)
  const [saving, setSaving] = useState(false)

  const selTransakcja = TRANSAKCJE_SPRZEDAZ.find(t => t.id === selTransakcjaId)

  const handleChange = async (newId: number) => {
    const transakcja = TRANSAKCJE_SPRZEDAZ.find(t => t.id === newId)
    if (!transakcja) return

    const prev = selTransakcjaId
    setSelTransakcjaId(newId)
    setSaving(true)

    try {
      const newZapisVat: ZapisVATData = {
        ...zapisVat,
        transakcja_id: transakcja.id,
        transakcja_nazwa: transakcja.nazwa,
      }
      const res = await updateFinalZapisVAT(exceptionId, newZapisVat)
      if (!res?.success) {
        toast.error(res?.error || 'Błąd zapisu transakcji')
        setSelTransakcjaId(prev)
      } else {
        toast.success('Transakcja zaktualizowana')
        // C9: blad zapisu audytu nie przerywa operacji, ale ma byc widoczny (DECISIONS 17.08)
        if (res.warning) toast.warning(res.warning)
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
      setSelTransakcjaId(prev)
    } finally {
      setSaving(false)
    }
  }

  const badge = (
    <Badge variant="outline" className="text-[10px] h-5 font-normal text-purple-700 border-purple-200 bg-purple-50">
      {selTransakcja?.nazwa || zapisVat.transakcja_nazwa}
    </Badge>
  )

  return (
    <CollapsibleJpkSection
      title="Transakcja zagraniczna"
      badge={badge}
      defaultOpen={true}
      icon={<Globe className="w-4 h-4" />}
    >
      <div className="space-y-3">
        <div className="bg-amber-50/60 border border-amber-200 rounded-md p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-amber-900">Wykryto transakcję zagraniczną</div>
            <div className="text-amber-700 text-xs mt-0.5">{zapisVat.transakcja_zagraniczna}</div>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 uppercase mb-1.5 block">
            Typ transakcji VAT
          </label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={selTransakcjaId}
            onChange={e => handleChange(Number(e.target.value))}
            disabled={readOnly || saving}
          >
            {TRANSAKCJE_SPRZEDAZ.map(t => (
              <option key={t.id} value={t.id}>{t.id} — {t.nazwa}</option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            Worker ustawił: <span className="font-medium">{zapisVat.transakcja_nazwa}</span> (id: {zapisVat.transakcja_id}).
            Zmiana zapisze się do final_zapis_vat_data.
          </p>
        </div>
      </div>
    </CollapsibleJpkSection>
  )
}
