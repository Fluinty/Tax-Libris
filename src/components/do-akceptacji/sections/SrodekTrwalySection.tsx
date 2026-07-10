'use client'

import React, { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { CollapsibleJpkSection } from './CollapsibleJpkSection'
import { updateJpkSection } from '@/app/(auth)/do-akceptacji/actions'
import type { ExceptionItem } from '@/types/database'

export function SrodekTrwalySection({ exception }: { exception: ExceptionItem }) {
  const status = exception.srodek_trwaly_status;
  const kwota = exception.srodek_trwaly_kwota;
  const kwotaTyp = exception.srodek_trwaly_kwota_typ;
  const keyword = exception.srodek_trwaly_keyword;
  const pozycja = exception.srodek_trwaly_pozycja;
  const reason = exception.srodek_trwaly_reason;
  
  const [ksiegujSt, setKsiegujSt] = useState(exception.ksieguj_jako_st === true)
  const [saving, setSaving] = useState(false)

  if (!status) return null;

  const isMocny = status === 'mocny_alert';
  const headerColor = isMocny ? 'text-orange-700' : 'text-yellow-700';
  const bgColor = isMocny ? 'bg-orange-50 border-orange-200' : 'bg-yellow-50 border-yellow-200';
  const iconStr = isMocny ? '🟠' : '🟡';

  const handleToggleSt = async (checked: boolean) => {
    const prev = ksiegujSt
    setKsiegujSt(checked)
    setSaving(true)
    try {
      const res = await updateJpkSection(exception.id, { ksieguj_jako_st: checked })
      if (!res?.success) {
        toast.error(`Nie zapisano: ${res?.error || 'Błąd zapisu'}`)
        setKsiegujSt(prev)
      } else {
        toast.success(checked ? 'Oznaczono jako środek trwały' : 'Usunięto oznaczenie środka trwałego')
      }
    } catch {
      toast.error('Błąd połączenia')
      setKsiegujSt(prev)
    } finally {
      setSaving(false)
    }
  }
  
  return (
    <CollapsibleJpkSection
      title={`${iconStr} Środek trwały — sprawdź`}
      defaultOpen={isMocny}
      borderColor={isMocny ? 'border-orange-400' : 'border-yellow-400'}
    >
      <div className={`p-3 rounded border ${bgColor}`}>
        <div className={`font-medium ${headerColor} mb-2`}>
          {isMocny ? 'Możliwy środek trwały (pojedyncza pozycja) — wymaga uwagi' : 'Wysoka kwota pojedynczej pozycji — sprawdź czy nie ŚT'}
        </div>
        
        {/* Co wykryto */}
        <div className="text-sm space-y-1">
          <div>
            <span className="text-gray-600">Kwota:</span>{' '}
            <span className="font-medium tabular-nums">
              {kwota?.toLocaleString('pl-PL', {
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2
              }) ?? '—'} zł {kwotaTyp}
            </span>
            <span className="text-gray-500 text-xs ml-2">(próg: 10 000 zł netto)</span>
          </div>
          
          {keyword && (
            <div>
              <span className="text-gray-600">Wykryto:</span>{' '}
              <span className="font-medium font-mono bg-orange-100 px-1 rounded">{keyword}</span>
              <span className="text-gray-500 text-xs ml-2">(możliwy środek trwały)</span>
            </div>
          )}
          
          {pozycja && (
            <div>
              <span className="text-gray-600">W pozycji:</span>{' '}
              <span className="text-sm italic">&quot;{pozycja}&quot;</span>
            </div>
          )}
          
          {reason && (
            <div className="mt-2 pt-2 border-t border-orange-200/50">
              <span className="text-gray-600">Uzasadnienie:</span>{' '}
              <span className="text-sm italic text-orange-800">{reason}</span>
            </div>
          )}
        </div>

        {/* Przełącznik "Księguj jako środek trwały" */}
        <div className="mt-3 pt-3 border-t border-orange-200">
          <div className="flex items-center gap-3">
            <Switch
              checked={ksiegujSt}
              onCheckedChange={handleToggleSt}
              disabled={saving}
              id="ksieguj-st-switch"
            />
            <label
              htmlFor="ksieguj-st-switch"
              className="text-sm font-medium text-gray-800 cursor-pointer select-none"
            >
              Księguj jako środek trwały
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-1.5 ml-[44px] leading-relaxed">
            KPiR bez kosztu (koszt pójdzie odpisami amortyzacyjnymi), VAT jako zakup inwestycyjny (K_40/K_41).
            Po zaksięgowaniu wprowadź ŚT do ewidencji środków trwałych w Rachmistrzu.
          </p>
        </div>

        {/* Żółta adnotacja gdy toggle ON */}
        {ksiegujSt && (
          <div className="mt-3 bg-amber-50 border border-amber-300 rounded-md px-3 py-2 text-sm text-amber-800 flex items-start gap-2">
            <span className="shrink-0 mt-0.5">⚠️</span>
            <span>
              Ta faktura zaksięguje się z <strong>zerową kwotą KPiR</strong> — koszt zostanie ujęty przez odpisy amortyzacyjne.
              Pozycje VAT trafią do pól K_40/K_41 (zakup inwestycyjny).
            </span>
          </div>
        )}
        
        {/* Co księgowa ma zrobić */}
        <div className="mt-3 pt-3 border-t border-orange-200">
          <div className="text-sm font-medium text-gray-700 mb-1">
            Co sprawdzić:
          </div>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
            <li>Czy klient zamierza używać tego &gt;1 rok? Jeśli TAK → ewidencja środków trwałych</li>
            <li>
              Czy &gt; 10 000 zł {kwotaTyp}? <strong>{(kwota ?? 0) > 10000 ? 'TAK' : 'NIE'}</strong>
              {(kwota ?? 0) > 10000 && (
                <span> ({kwota?.toLocaleString('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits: 2})} zł)</span>
              )}
              {' → '} obowiązkowo amortyzacja (art. 22f ust. 3 PIT)
            </li>
            <li>Możliwa amortyzacja jednorazowa (mały podatnik / fabrycznie nowy ŚT)</li>
            <li>JPK_V7: pole K_40/K_41 zamiast K_42/K_43 (zakup inwestycyjny)</li>
          </ul>
        </div>
        
        {/* Akcja */}
        {!ksiegujSt && (
          <div className="mt-3 text-xs text-gray-500">
            💡 Jeśli to środek trwały — włącz przełącznik powyżej lub kliknij <strong>&quot;Pomiń&quot;</strong> i ręcznie wpisz do ewidencji ŚT w Rachmistrzu.
            Jeśli to nie ŚT (np. krótki czas użycia, drobne komponenty) — zaakceptuj fakturę normalnie.
          </div>
        )}
      </div>
    </CollapsibleJpkSection>
  );
}
