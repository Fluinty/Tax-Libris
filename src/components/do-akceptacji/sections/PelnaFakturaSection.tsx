'use client'

/**
 * ZASADY MODYFIKACJI WIDOKU FAKTURY KSEF:
 * 
 * Ta aplikacja korzysta z DWÓCH bliźniaczych komponentów do renderowania podglądu faktury:
 * 1. FakturaPreview.tsx - "Sticky" panel boczny z podsumowaniem (kanoniczny widok dla księgowej na co dzień).
 * 2. PelnaFakturaSection.tsx (TEN PLIK) - Zwijana, pełna sekcja KSeF na dole formularza.
 * 
 * Wszelkie zmiany wizualne i logiczne w prezentacji faktury (np. warstwy rozliczeń, nowe pola)
 * należy implementować W OBU PLIKACH, aby utrzymać spójność.
 */

import { CollapsibleJpkSection } from './CollapsibleJpkSection'
import { Badge } from '@/components/ui/badge'
import { FileText, Car, AlertTriangle } from 'lucide-react'
import { ExceptionItem } from '@/types/database'

interface Props {
  exception: ExceptionItem
  officialVatTable?: any
}

function parseAmount(v: any): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  return parseFloat(v.toString().replace(',', '.')) || 0
}

const REGISTRATION_REGEX = /\b[A-Z]{1,3}\s?[A-Z0-9]{4,5}\b/

export function PelnaFakturaSection({ exception, officialVatTable }: Props) {
  const podglad = exception.podglad_faktury

  if (!podglad) {
    return (
      <CollapsibleJpkSection title="Pełna faktura (KSeF)" icon={<FileText className="w-4 h-4" />}>
        <div className="text-sm text-slate-500 p-2">Pełny podgląd dostępny dla nowych faktur.</div>
      </CollapsibleJpkSection>
    )
  }

  const {
    numerFaktury, dataWystawienia, miejsceWystawienia, okresOd, okresDo,
    kwotaNaleznosciOgolem, kwotaDoZaplaty, kodWaluty,
    korekta, zaliczka, fakturaMarza, przyczynaKorekty,
    wiersze
  } = podglad

  const naleznosc = parseAmount(kwotaNaleznosciOgolem)
  const doZaplaty = parseAmount(kwotaDoZaplaty)
  const items = Array.isArray(wiersze) ? wiersze : []
  
  let mpp = false
  let sumBruttoWiersze = 0
  items.forEach(it => {
    if (it.wymagaPodzielonejPlatnosci === 'True') mpp = true
    sumBruttoWiersze += parseAmount(it.wartoscBrutto)
  })

  let vatTableBrutto = sumBruttoWiersze
  if (officialVatTable && Object.keys(officialVatTable).length > 0) {
    vatTableBrutto = 0
    Object.values(officialVatTable).forEach((vals: any) => {
      vatTableBrutto += parseAmount(vals?.brutto)
    })
  }

  const dodatkoweRozliczenia = Array.isArray(podglad.dodatkoweRozliczenia) ? podglad.dodatkoweRozliczenia : []
  let sumaDodatkowych = 0
  dodatkoweRozliczenia.forEach((roz: any) => {
    const parsed = parseAmount(roz.kwota)
    if (!isNaN(parsed)) {
      const isOdliczenie = roz.typ?.toLowerCase().includes('odliczenie')
      sumaDodatkowych += parsed * (isOdliczenie ? -1 : 1)
    }
  })

  const rozrachunkiDiff = doZaplaty - vatTableBrutto
  const showLayer2 = Math.abs(rozrachunkiDiff) > 0.02
  const layer2Diff = dodatkoweRozliczenia.length > 0 ? (rozrachunkiDiff - sumaDodatkowych) : rozrachunkiDiff
  const showLayer2Row = showLayer2 && Math.abs(layer2Diff) > 0.02

  // Diff rounding (to avoid float issues)
  const discountDiff = Math.abs(sumBruttoWiersze - doZaplaty) > 0.02 ? (sumBruttoWiersze - doZaplaty) : 0

  return (
    <CollapsibleJpkSection title="Pełna faktura (KSeF)" icon={<FileText className="w-4 h-4" />}>
      <div className="space-y-4 text-sm">
        {/* NAGŁÓWEK / PODSUMOWANIE */}
        <div className="bg-slate-50 p-3 rounded-md border border-slate-100 flex flex-wrap gap-4 items-start">
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold text-slate-800">{numerFaktury || 'Brak numeru'}</div>
            <div className="text-slate-500 text-xs">
              Wystawiono: {dataWystawienia} {miejsceWystawienia ? `(${miejsceWystawienia})` : ''}
              {(okresOd || okresDo) && ` | Okres: ${okresOd || '?'} – ${okresDo || '?'}`}
            </div>
          </div>
          <div className="text-right">
            {showLayer2Row && (
              <div 
                className="text-[11px] text-slate-500 mb-1" 
                title={layer2Diff > 0 ? "Raty, zaległości lub inne rozrachunki doliczone przez wystawcę — nie stanowią kosztu." : "Wystawca rozliczył nadpłatę — kwota do zapłaty jest niższa niż wartość faktury."}
              >
                {dodatkoweRozliczenia.length > 0 
                  ? "Pozostałe saldo:" 
                  : (layer2Diff > 0 ? "Rozliczenia/saldo poza fakturą:" : "Nadpłata/saldo na koncie:")} 
                <span className="font-medium text-slate-700 ml-1">
                  {layer2Diff > 0 ? '+' : ''}{layer2Diff.toFixed(2)} {kodWaluty || 'PLN'}
                </span>
              </div>
            )}
            <div className="text-xs text-slate-500">Do zapłaty:</div>
            <div className="font-bold text-lg text-slate-900 whitespace-nowrap">{doZaplaty.toFixed(2)} {kodWaluty || 'PLN'}</div>
            {Math.abs(naleznosc - doZaplaty) > 0.01 && (
              <div className="text-xs text-slate-500 mt-1">Ogółem: {naleznosc.toFixed(2)}</div>
            )}
          </div>
        </div>

        {/* FLAGI */}
        {(korekta === 'True' || zaliczka === 'True' || fakturaMarza === 'True' || mpp) && (
          <div className="flex flex-wrap gap-2">
            {korekta === 'True' && <Badge variant="outline" className="border-red-200 text-red-700 bg-red-50">Korekta {przyczynaKorekty ? `(${przyczynaKorekty})` : ''}</Badge>}
            {zaliczka === 'True' && <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">Zaliczka</Badge>}
            {fakturaMarza === 'True' && <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50">Marża</Badge>}
            {mpp && <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50">MPP</Badge>}
          </div>
        )}

        {/* RABAT Z PODSUMOWANIA */}
        {discountDiff > 0 && (
          <div className="flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">Rabat/korekta z podsumowania (nagłówkowy):</span>
            <span className="font-bold">-{discountDiff.toFixed(2)} {kodWaluty || 'PLN'}</span>
          </div>
        )}

        {/* POZYCJE */}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                  <th className="py-2 px-2 font-medium">Lp</th>
                  <th className="py-2 px-2 font-medium">Nazwa towaru/usługi</th>
                  <th className="py-2 px-2 font-medium text-right">Ilość</th>
                  <th className="py-2 px-2 font-medium text-right">Netto</th>
                  <th className="py-2 px-2 font-medium text-right">VAT</th>
                  <th className="py-2 px-2 font-medium text-right">Brutto</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any, i: number) => {
                  const r = parseAmount(it.wartoscRabatu)
                  const hasRabat = r !== 0
                  
                  return (
                    <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                      <td className="py-2 px-2 text-slate-500 align-top">{it.lp || i+1}</td>
                      <td className="py-2 px-2 align-top">
                        <div className="font-medium text-slate-800">{it.nazwaTowaru || '-'}</div>
                        {hasRabat && <div className="text-xs text-orange-600 mt-0.5">Rabat w pozycji: -{r.toFixed(2)}</div>}
                        {it.dodatkoweInfo && <div className="text-xs text-slate-500 mt-0.5">{it.dodatkoweInfo}</div>}
                        
                        {Array.isArray(it.dodatkowyOpis) && it.dodatkowyOpis.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {it.dodatkowyOpis.map((desc: any, idx: number) => {
                              const val = String(desc.Wartosc || desc.wartosc || '')
                              const isReg = REGISTRATION_REGEX.test(val)
                              return (
                                <div key={idx} className="text-xs text-slate-600 flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium">{desc.Klucz || desc.klucz}:</span> 
                                  <span>{val}</span>
                                  {isReg && <Badge variant="secondary" className="text-[10px] h-4 px-1 py-0"><Car className="w-3 h-3 mr-1" /> nr rej</Badge>}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-600 align-top whitespace-nowrap">
                        {it.ilosc} {it.jednostkaMiary}
                      </td>
                      <td className="py-2 px-2 text-right font-medium text-slate-700 align-top">
                        {parseAmount(it.wartoscNetto).toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-500 align-top whitespace-nowrap">
                        {parseAmount(it.wartoscVat).toFixed(2)} <span className="text-[10px]">({it.stawkaVat})</span>
                      </td>
                      <td className="py-2 px-2 text-right font-medium text-slate-900 align-top">
                        {parseAmount(it.wartoscBrutto).toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* TABELA VAT OFICJALNA */}
        {officialVatTable && Object.keys(officialVatTable).length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Tabela VAT z podsumowania KSeF</div>
            <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-4 text-xs">
              <div className="font-medium text-slate-400 border-b pb-1">Stawka</div>
              <div className="font-medium text-slate-400 text-right border-b pb-1">Netto</div>
              <div className="font-medium text-slate-400 text-right border-b pb-1">VAT</div>
              <div className="font-medium text-slate-400 text-right border-b pb-1">Brutto</div>
              {Object.entries(officialVatTable).map(([rate, vals]: [string, any]) => (
                <div key={rate} className="col-span-4 grid grid-cols-[80px_1fr_1fr_1fr] gap-4">
                  <div className="font-medium text-slate-700">{rate}</div>
                  <div className="text-right text-slate-600">{vals.netto.toFixed(2)}</div>
                  <div className="text-right text-slate-600">{vals.vat.toFixed(2)}</div>
                  <div className="text-right font-medium text-slate-800">{vals.brutto.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DODATKOWE ROZLICZENIA (Warstwa 1) */}
        {dodatkoweRozliczenia.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Rozliczenia poza fakturą VAT</div>
            <div className="bg-slate-50 rounded-md border border-slate-100 overflow-hidden">
              <table className="w-full text-left text-sm border-collapse">
                <tbody>
                  {dodatkoweRozliczenia.map((roz: any, i: number) => {
                    const kwotaRoz = parseAmount(roz.kwota)
                    return (
                      <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                        <td className="py-2 px-3 text-slate-700">
                          {roz.opis || '-'}
                          {roz.typ && <span className="text-xs text-slate-400 ml-2">({roz.typ})</span>}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-slate-800 whitespace-nowrap">
                          {kwotaRoz > 0 ? '+' : ''}{kwotaRoz.toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-slate-400 mt-1.5 px-1">
              Pozycje rozrachunkowe — nie stanowią kosztu ani przychodu, nie podlegają księgowaniu.
            </div>
          </div>
        )}
      </div>
    </CollapsibleJpkSection>
  )
}
