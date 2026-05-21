'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown, AlertCircle, Trash2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ZapisVATData, PozycjaVAT, RejestrVAT, RodzajZakupu, RodzajOdliczenia, CelZakupu, ProceduraJPK, GrupaAsortymentu } from '@/types/database'
import { 
  REJESTRY_VAT, TRANSAKCJE_VAT_KRAJOWE, 
  RODZAJ_ZAKUPU_LABELS, RODZAJ_ODLICZENIA_LABELS, CEL_ZAKUPU_LABELS,
  PROCEDURY_JPK, GRUPY_ASORTYMENTU,
  getRodzajZakupuLabel, getRodzajOdliczeniaLabel, getCelZakupuLabel
} from '@/lib/vat'

interface ClientOpis {
  id: number
  nazwa: string
  aktywny: boolean
  typ_dokumentu: string | null
}

interface EditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialOpis: string
  initialKwoty: Record<string, number>
  initialZapisVatData: ZapisVATData | null
  kwotaBrutto: number | null
  kwotaNetto: number | null
  isVatPayer: boolean
  typDokumentu: string | null
  clientOpisy: ClientOpis[]
  onSave: (opis: string, kwoty: Record<string, number>, zapisVat: ZapisVATData | null) => void
}

import { getKolumnyForTyp } from '@/lib/kpir'

// KPIR_COLUMNS removed in favor of getKolumnyForTyp

export function EditModal({
  open,
  onOpenChange,
  initialOpis,
  initialKwoty,
  initialZapisVatData,
  kwotaBrutto,
  kwotaNetto,
  isVatPayer,
  typDokumentu,
  clientOpisy,
  onSave
}: EditModalProps) {
  const [opis, setOpis] = useState(initialOpis)
  const [kwoty, setKwoty] = useState<Record<string, string>>({})
  const [openCombobox, setOpenCombobox] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  const defaultVat = (): Partial<ZapisVATData> => ({
    rejestr_id: typDokumentu === 'zakup' ? 2 : 1,
    rejestr_nazwa: typDokumentu === 'zakup' ? 'Rejestr zakupów VAT' : 'Rejestr sprzedaży VAT',
    transakcja_id: typDokumentu === 'zakup' ? 16 : 1,
    transakcja_nazwa: typDokumentu === 'zakup' ? 'Nabycie krajowe' : 'Dostawa krajowa',
    pozycje_vat: [],
    suma_netto: 0,
    suma_vat: 0,
    suma_brutto: 0,
  })

  const [isZwolnionaVat, setIsZwolnionaVat] = useState<boolean>(initialZapisVatData === null)
  const [zapisVat, setZapisVat] = useState<Partial<ZapisVATData>>(initialZapisVatData || defaultVat())

  useEffect(() => {
    if (open) {
      setOpis(initialOpis)
      const mappedKwoty: Record<string, string> = {}
      getKolumnyForTyp(typDokumentu).forEach(col => {
        mappedKwoty[col.klucz] = initialKwoty[col.klucz] !== undefined ? initialKwoty[col.klucz].toFixed(2) : '0.00'
      })
      setKwoty(mappedKwoty)
      setSearchValue('')
      
      setIsZwolnionaVat(initialZapisVatData === null)
      setZapisVat(initialZapisVatData || defaultVat())
    }
  }, [open, initialOpis, initialKwoty, initialZapisVatData, typDokumentu])

  const handleKwotaChange = (colId: string, value: string) => {
    // Only allow numbers, dot, comma
    if (/^[\d.,]*$/.test(value)) {
      setKwoty(prev => ({ ...prev, [colId]: value }))
    }
  }

  // Obliczenia sumy
  const totalSum = Object.values(kwoty).reduce((acc, val) => {
    const num = parseFloat(val.replace(',', '.'))
    return acc + (isNaN(num) ? 0 : num)
  }, 0)

  // Bug #3 fix: VAT-owiec księguje netto w KPiR, zwolniony księguje brutto
  const kwotaReferencyjna = isVatPayer ? (kwotaNetto ?? kwotaBrutto) : kwotaBrutto
  const labelKwoty = isVatPayer ? 'Kwota netto z faktury' : 'Kwota brutto z faktury'
  const isMatched = kwotaReferencyjna !== null && Math.abs(totalSum - kwotaReferencyjna) <= 0.5
  const diff = kwotaReferencyjna !== null ? kwotaReferencyjna - totalSum : 0

  // Obliczenia sumy VAT
  const totalSumVatBrutto = zapisVat.pozycje_vat?.reduce((acc, poz) => acc + (poz.brutto || 0), 0) || 0
  const isVatMatched = isZwolnionaVat || (kwotaBrutto !== null && Math.abs(totalSumVatBrutto - kwotaBrutto) <= 0.5)

  const handleSave = () => {
    const parsedKwoty: Record<string, number> = {}
    Object.entries(kwoty).forEach(([k, v]) => {
      const num = parseFloat(v.replace(',', '.'))
      if (!isNaN(num) && num > 0) {
        parsedKwoty[k] = num
      }
    })
    
    // Finalize ZapisVATData
    let finalZapisVat: ZapisVATData | null = null
    if (!isZwolnionaVat) {
      finalZapisVat = {
        ...zapisVat,
        suma_netto: zapisVat.pozycje_vat?.reduce((acc, poz) => acc + Number(poz.netto), 0) || 0,
        suma_vat: zapisVat.pozycje_vat?.reduce((acc, poz) => acc + Number(poz.vat), 0) || 0,
        suma_brutto: zapisVat.pozycje_vat?.reduce((acc, poz) => acc + Number(poz.brutto), 0) || 0,
      } as ZapisVATData
    }
    
    onSave(opis, parsedKwoty, finalZapisVat)
  }

  const handlePozycjaVatChange = (index: number, field: keyof PozycjaVAT, value: string) => {
    if (!zapisVat.pozycje_vat) return
    const newPozycje = [...zapisVat.pozycje_vat]
    
    if (field === 'stawka_symbol') {
      newPozycje[index] = { ...newPozycje[index], stawka_symbol: value }
    } else {
      if (/^[\d.,]*$/.test(value)) {
        const numVal = parseFloat(value.replace(',', '.')) || 0
        newPozycje[index] = { ...newPozycje[index], [field]: numVal }
        
        // Auto-calculate
        if (field === 'netto') {
          const rateMatch = newPozycje[index].stawka_symbol.match(/\d+/)
          const rate = rateMatch ? parseInt(rateMatch[0]) : 0
          if (rate > 0) {
            newPozycje[index].vat = Number((numVal * (rate / 100)).toFixed(2))
            newPozycje[index].brutto = Number((numVal + newPozycje[index].vat).toFixed(2))
          } else {
            newPozycje[index].vat = 0
            newPozycje[index].brutto = numVal
          }
        }
      }
    }
    setZapisVat({ ...zapisVat, pozycje_vat: newPozycje })
  }

  const handleAddPozycjaVat = () => {
    const newPozycje = [...(zapisVat.pozycje_vat || []), {
      stawka_symbol: '23',
      stawka_id: 'default',
      netto: 0,
      vat: 0,
      brutto: 0
    }]
    setZapisVat({ ...zapisVat, pozycje_vat: newPozycje })
  }

  const handleRemovePozycjaVat = (index: number) => {
    const newPozycje = [...(zapisVat.pozycje_vat || [])]
    newPozycje.splice(index, 1)
    setZapisVat({ ...zapisVat, pozycje_vat: newPozycje })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Stop propagation so global shortcuts don't fire while typing in modal
    e.stopPropagation()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0" onKeyDown={handleKeyDown}>
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>Edytuj propozycję AI</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 space-y-6 py-4">
          {/* Opis księgowy */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#1E293B]">Opis księgowy:</label>
            <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
              <PopoverTrigger render={
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCombobox}
                  className="w-full justify-between"
                >
                  {opis || "Wybierz lub wpisz opis..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              } />
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput 
                    placeholder="Szukaj opisu..." 
                    value={searchValue}
                    onValueChange={setSearchValue}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <button
                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100"
                        onClick={() => {
                          setOpis(searchValue)
                          setOpenCombobox(false)
                        }}
                      >
                        Brak wyników. Użyj "{searchValue}"
                      </button>
                    </CommandEmpty>
                    <CommandGroup>
                      {clientOpisy
                        .filter(o => o.aktywny)
                        .filter(o => o.typ_dokumentu === null || o.typ_dokumentu === typDokumentu || (typDokumentu === null && o.typ_dokumentu === 'zakup'))
                        .map((op) => (
                        <CommandItem
                          key={op.id}
                          value={op.nazwa}
                          onSelect={(currentValue) => {
                            setOpis(currentValue)
                            setOpenCombobox(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              opis === op.nazwa ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {op.nazwa}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Kwoty KPiR */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#1E293B]">Kwoty per kolumna KPiR:</label>
            <div className="border border-[#E2E8F0] rounded-lg p-4 space-y-3 bg-[#F8FAFC]">
              {getKolumnyForTyp(typDokumentu).map(col => (
                <div key={col.numer} className="flex items-center justify-between">
                  <span className="text-sm text-[#475569]">Kolumna {col.numer} ({col.label})</span>
                  <div className="flex items-center gap-2">
                    <Input
                      className="w-32 text-right"
                      value={kwoty[col.klucz] || ''}
                      onChange={(e) => handleKwotaChange(col.klucz, e.target.value)}
                    />
                    <span className="text-sm text-[#475569] w-4">zł</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Zapis VAT */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#1E293B]">Ewidencja VAT</label>
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="zwolniona" 
                  checked={isZwolnionaVat} 
                  onCheckedChange={(c) => setIsZwolnionaVat(c === true)}
                />
                <label htmlFor="zwolniona" className="text-sm text-slate-600 cursor-pointer">
                  Faktura zwolniona z VAT (tylko KPiR)
                </label>
              </div>
            </div>

            {!isZwolnionaVat && (
              <div className="border border-[#E2E8F0] rounded-lg p-4 space-y-4 bg-white">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Rejestr VAT</label>
                    <Select 
                      value={String(zapisVat.rejestr_id)} 
                      onValueChange={(val) => {
                        const r = REJESTRY_VAT.find(x => String(x.id) === val)
                        if (r) setZapisVat({ ...zapisVat, rejestr_id: r.id, rejestr_nazwa: r.nazwa as RejestrVAT })
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REJESTRY_VAT.map(r => (
                          <SelectItem key={r.id} value={String(r.id)}>{r.nazwa}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500">Transakcja</label>
                    <Select 
                      value={String(zapisVat.transakcja_id)} 
                      onValueChange={(val) => {
                        const t = TRANSAKCJE_VAT_KRAJOWE.find(x => String(x.id) === val)
                        if (t) setZapisVat({ ...zapisVat, transakcja_id: t.id, transakcja_nazwa: t.nazwa })
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRANSAKCJE_VAT_KRAJOWE.filter(t => t.dla === typDokumentu || !typDokumentu).map(t => (
                          <SelectItem key={t.id} value={String(t.id)}>{t.nazwa}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {typDokumentu === 'zakup' ? (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Rodzaj zakupu</label>
                      <Select value={String(zapisVat.rodzaj_zakupu ?? '')} onValueChange={(v) => setZapisVat({...zapisVat, rodzaj_zakupu: Number(v) as RodzajZakupu})}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Wybierz...">
                            {zapisVat.rodzaj_zakupu !== undefined && zapisVat.rodzaj_zakupu !== null && zapisVat.rodzaj_zakupu !== '' ? getRodzajZakupuLabel(zapisVat.rodzaj_zakupu) : "Wybierz..."}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(RODZAJ_ZAKUPU_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Odliczenie</label>
                      <Select value={String(zapisVat.rodzaj_odliczenia ?? '')} onValueChange={(v) => setZapisVat({...zapisVat, rodzaj_odliczenia: Number(v) as RodzajOdliczenia})}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Wybierz...">
                            {zapisVat.rodzaj_odliczenia !== undefined && zapisVat.rodzaj_odliczenia !== null && zapisVat.rodzaj_odliczenia !== '' ? getRodzajOdliczeniaLabel(zapisVat.rodzaj_odliczenia) : "Wybierz..."}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(RODZAJ_ODLICZENIA_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Cel zakupu</label>
                      <Select value={String(zapisVat.cel_zakupu ?? '')} onValueChange={(v) => setZapisVat({...zapisVat, cel_zakupu: Number(v) as CelZakupu})}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Wybierz...">
                            {zapisVat.cel_zakupu !== undefined && zapisVat.cel_zakupu !== null && zapisVat.cel_zakupu !== '' ? getCelZakupuLabel(zapisVat.cel_zakupu) : "Wybierz..."}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CEL_ZAKUPU_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Procedura JPK</label>
                      <Select value={zapisVat.procedura_jpk || 'none'} onValueChange={(v) => setZapisVat({...zapisVat, procedura_jpk: v === 'none' ? null : v as ProceduraJPK})}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Brak" /></SelectTrigger>
                        <SelectContent>
                          {PROCEDURY_JPK.map(r => <SelectItem key={r.kod || 'none'} value={r.kod || 'none'}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Grupa asort.</label>
                      <Select value={String(zapisVat.grupa_asortymentu ?? '') || 'none'} onValueChange={(v) => setZapisVat({...zapisVat, grupa_asortymentu: v === 'none' ? null : v as GrupaAsortymentu})}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Brak" /></SelectTrigger>
                        <SelectContent>
                          {GRUPY_ASORTYMENTU.map(r => <SelectItem key={r.kod || 'none'} value={r.kod || 'none'}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="space-y-2 mt-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-500">Pozycje VAT (kwoty w PLN)</label>
                    <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={handleAddPozycjaVat}>
                      <Plus className="w-3 h-3 mr-1" /> Dodaj stawkę
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    {zapisVat.pozycje_vat?.map((poz, i) => (
                      <div key={i} className="grid grid-cols-[70px_1fr_1fr_1fr_36px] gap-2 items-end bg-slate-50 p-2 rounded border border-slate-100">
                        <Select value={poz.stawka_symbol || ''} onValueChange={(v) => handlePozycjaVatChange(i, 'stawka_symbol', v || '')}>
                          <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="23">23%</SelectItem>
                            <SelectItem value="8">8%</SelectItem>
                            <SelectItem value="5">5%</SelectItem>
                            <SelectItem value="0">0%</SelectItem>
                            <SelectItem value="zw">zw</SelectItem>
                            <SelectItem value="np">np</SelectItem>
                            <SelectItem value="oo">oo</SelectItem>
                          </SelectContent>
                        </Select>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Netto</label>
                          <Input className="h-8 text-xs text-right" value={poz.netto === 0 && poz.netto.toString() !== '0' ? '' : poz.netto} onChange={e => handlePozycjaVatChange(i, 'netto', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">VAT</label>
                          <Input className="h-8 text-xs text-right bg-slate-100/50" value={poz.vat === 0 && poz.vat.toString() !== '0' ? '' : poz.vat} onChange={e => handlePozycjaVatChange(i, 'vat', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Brutto</label>
                          <Input className="h-8 text-xs text-right font-medium bg-slate-100" value={poz.brutto} readOnly />
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500 self-end" onClick={() => handleRemovePozycjaVat(i)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    {(!zapisVat.pozycje_vat || zapisVat.pozycje_vat.length === 0) && (
                      <div className="text-center text-xs text-slate-400 py-2 italic border border-dashed rounded">
                        Brak zdefiniowanych pozycji VAT
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center bg-slate-50 p-2 rounded text-sm font-medium">
                  <span className="text-slate-600">Razem VAT brutto:</span>
                  <div className="flex items-center gap-2">
                    <span className={cn(isVatMatched ? "text-slate-800" : "text-red-600")}>
                      {totalSumVatBrutto.toFixed(2)} zł
                    </span>
                    {!isVatMatched && kwotaBrutto !== null && (
                      <span className="text-xs text-red-500 font-normal">
                        (niezg. {(kwotaBrutto - totalSumVatBrutto).toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Podsumowanie */}
          <div className={cn(
            "flex items-center justify-between p-3 rounded-lg border",
            isMatched ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
          )}>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#1E293B]">Razem: {totalSum.toFixed(2)} zł</span>
              {isMatched ? (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">
                  ✓ zgadza się
                </Badge>
              ) : (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Niezgodność: brakuje {diff.toFixed(2)} zł
                </Badge>
              )}
            </div>
            {kwotaReferencyjna !== null && (
              <span className="text-sm text-[#64748B]">{labelKwoty}: {kwotaReferencyjna.toFixed(2)} zł</span>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!isMatched || !opis}
            className="bg-[#1F3A5F] hover:bg-[#2A4D7C] text-white"
          >
            Zatwierdź zmiany
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
