'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Bot, Check, ChevronsUpDown, Clock, Building2, User, FileText, AlertCircle, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { EditModal } from './EditModal'
import { ConfidenceBadge } from './ConfidenceBadge'
import {
  approveFaktura,
  approveExceptionFull,
  resolveException,
  ignoreFaktura,
  addProponowanyToClientOpisy,
  checkExceptionStatus
} from '@/app/(auth)/do-akceptacji/actions'
import {
  getRodzajZakupuLabel,
  getRodzajOdliczeniaLabel,
  getCelZakupuLabel,
  STRATEGIA_LABELS,
  REZIM_VAT_LABELS,
  REZIM_KPIR_LABELS
} from '@/lib/vat'
import { getConfidenceCardClasses, getWeakDimensionsCount, hasVendorAlarms } from '@/lib/confidence-helpers'
import { mergeInlineEditsVat, mergeInlineEditsPojazd } from '@/lib/merge-helpers'
import { ConfidenceWeakPointsSection } from './sections/ConfidenceWeakPointsSection'
import { PozycjeVatSection } from './sections/PozycjeVatSection'
import { PojazdRezimSection } from './sections/PojazdRezimSection'
import { WeryfikacjaKontrahentaSection } from './sections/WeryfikacjaKontrahentaSection'
import { ProceduryJpkSection } from './sections/ProceduryJpkSection'
import { GtuSection } from './sections/GtuSection'
import { SrodekTrwalySection } from './sections/SrodekTrwalySection'
import { AiReviewSection, AiReviewBadge } from './sections/AiReviewSection'
import { PozycjeFakturySection } from './sections/PozycjeFakturySection'
import { WalidatorBadge } from './sections/WalidatorBadge'
import { WalidatorKupVatBadge } from './sections/WalidatorKupVatBadge'
import { getLatestReview } from '@/lib/ai-review'
import type { ExceptionWithClient, ClientPojazd, PozycjaXml, KlasyfikacjaAiPozycja, TypDokumentu, ZapisVATData, PozycjaVAT } from '@/types/database'

interface ClientOpis {
  id: number
  nazwa: string
  aktywny: boolean
  typ_dokumentu: string | null
}

interface FakturaCardProps {
  exception: ExceptionWithClient
  stan: 'pending_review' | 'pending' | 'auto_created'
  isActive: boolean
  clientOpisy: ClientOpis[]
  clientPojazdy?: ClientPojazd[]
}

import { getKolumnyForTyp, getEtykietaKontrahenta, getEtykietaSekcjiKwot } from '@/lib/kpir'
import { getEtykietaSekcjiVAT, isFakturaZwolniona } from '@/lib/vat'

interface JoinedPozycja extends PozycjaXml {
  kolumna_kpir: number | null
  wartosc_brutto: number | null
  kategoria: string | null
}

function joinPozycjeWithKlasyfikacja(
  pozycje: PozycjaXml[],
  klasyfikacja: KlasyfikacjaAiPozycja[]
): JoinedPozycja[] {
  return pozycje.map(poz => {
    const klas = klasyfikacja.find(c => String(c.lp) === String(poz.lp))
    return {
      ...poz,
      kolumna_kpir: klas?.kolumna_kpir ?? null,
      wartosc_brutto: klas?.wartosc_brutto ?? null,
      kategoria: klas?.kategoria ?? null,
    }
  })
}

function getKolumnaLabel(typ: TypDokumentu | null, numer: number): string {
  const kolumny = getKolumnyForTyp(typ)
  const kol = kolumny.find(k => k.numer === numer)
  return kol ? `Kolumna ${kol.numer} (${kol.labelKrotki})` : `Kolumna ${numer}`
}

export function FakturaCard({ exception, stan, isActive, clientOpisy, clientPojazdy = [] }: FakturaCardProps) {
  const showAlarms = hasVendorAlarms(exception)
  const weakCount = getWeakDimensionsCount(exception.confidence_reasons)
  const confidenceCardClasses = getConfidenceCardClasses(exception.confidence_overall)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Pending state
  const [selectedOpis, setSelectedOpis] = useState('')
  const [openCombobox, setOpenCombobox] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  // Pending_review — edytowalny opis (inicjalizowany z AI)
  const [editableOpis, setEditableOpis] = useState(exception.ai_proponowany_opis || '')
  
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isActive && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isActive])

  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) || showEditModal) {
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if (stan === 'pending_review') handleApprove()
        if (stan === 'pending') handleResolve()
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault()
        if (stan === 'pending_review') setShowEditModal(true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (stan === 'pending_review' || stan === 'pending') handleIgnore()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, stan, selectedOpis, showEditModal])

  const handleApprove = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)

    // Pre-check: czy status w Supabase nadal pozwala na zatwierdzenie?
    const actionId = exception.legacy_id || exception.legacy_queue_id || exception.id
    try {
      const { status: currentStatus } = await checkExceptionStatus(actionId)
      if (!currentStatus || !['pending', 'pending_review'].includes(currentStatus)) {
        toast.warning('Ta faktura ma już inny status (ktoś ją zaksięgował lub zatwierdził). Odświeżam listę.', { duration: 5000 })
        router.refresh()
        setIsSubmitting(false)
        return
      }
    } catch {
      toast.error('Nie udało się zweryfikować statusu faktury. Spróbuj ponownie.')
      setIsSubmitting(false)
      return
    }

    const res = await approveFaktura(actionId, editableOpis || undefined)
    if (res.success) {
      toast.success('Zatwierdzono do księgowania')
      router.refresh()
    } else {
      toast.error(res.error || 'Wystąpił błąd')
      setIsSubmitting(false)
    }
  }

  const handleEditSave = async (opis: string, kwoty: Record<string, number>, zapisVat: ZapisVATData | null) => {
    setShowEditModal(false)
    setIsSubmitting(true)

    // Pre-check status w Supabase
    const actionId = exception.legacy_id || exception.legacy_queue_id || exception.id
    try {
      const { status: currentStatus } = await checkExceptionStatus(actionId)
      if (!currentStatus || !['pending', 'pending_review'].includes(currentStatus)) {
        toast.warning('Ta faktura ma już inny status (ktoś ją zaksięgował lub zatwierdził). Odświeżam listę.', { duration: 5000 })
        router.refresh()
        setIsSubmitting(false)
        return
      }
    } catch {
      toast.error('Nie udało się zweryfikować statusu faktury. Spróbuj ponownie.')
      setIsSubmitting(false)
      return
    }

    const res = await approveExceptionFull(actionId, kwoty, zapisVat, opis)
    if (res.success) {
      toast.success('Zapisano z edytowanymi kwotami')
      router.refresh()
    } else {
      toast.error(res.error || 'Wystąpił błąd')
      setIsSubmitting(false)
    }
  }

  const handleResolve = async () => {
    if (!selectedOpis) {
      toast.error('Wybierz opis księgowy')
      return
    }
    if (isSubmitting) return
    setIsSubmitting(true)
    const actionId = exception.legacy_id || exception.legacy_queue_id || exception.id
    const res = await resolveException(actionId, selectedOpis)
    if (res.success) {
      toast.success('Wyjątek rozwiązany')
      router.refresh()
    } else {
      toast.error(res.error || 'Wystąpił błąd')
      setIsSubmitting(false)
    }
  }

  const handleIgnore = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    const actionId = exception.legacy_id || exception.legacy_queue_id || exception.id
    const res = await ignoreFaktura(actionId)
    if (res.success) {
      toast.success('Faktura pominięta')
      router.refresh()
    } else {
      toast.error(res.error || 'Wystąpił błąd')
      setIsSubmitting(false)
    }
  }

  const handleAddAiProposalToClient = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    const actionId = exception.legacy_id || exception.legacy_queue_id || exception.id
    const res = await addProponowanyToClientOpisy(actionId)
    if (res.success) {
      toast.success(res.message)
      router.refresh()
      setSelectedOpis(exception.ai_proponowany_opis || '')
    } else {
      toast.error(res.error || 'Błąd dodawania')
    }
    setIsSubmitting(false)
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pl-PL')
  const timeAgo = (d: string) => {
    const hours = Math.round((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60))
    if (hours === 0) return 'przed chwilą'
    return `${hours} godz temu`
  }

  const getConfidenceColor = (conf: number | null) => {
    if (!conf) return 'bg-gray-100 text-gray-800'
    if (conf >= 0.90) return 'bg-green-100 text-green-800'
    if (conf >= 0.70) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const aiKwoty = exception.ai_kwoty_per_kolumna || {}
  const finalKwoty = exception.final_kwoty_per_kolumna || exception.ai_kwoty_per_kolumna || {}

  const renderPozycjeXml = () => {
    if (!exception.pozycje_xml_full || exception.pozycje_xml_full.length === 0) {
      return null
    }

    const pozycje = joinPozycjeWithKlasyfikacja(exception.pozycje_xml_full, exception.ai_klasyfikacja_pozycji || [])
    const dozwoloneKlucze = getKolumnyForTyp(exception.typ_dokumentu).map(k => k.numer)

    const PozycjeList = ({ items }: { items: JoinedPozycja[] }) => (
      <div className="space-y-0">
        {items.map((poz, i) => {
          const isInvalidColumn = poz.kolumna_kpir !== null && !dozwoloneKlucze.includes(poz.kolumna_kpir)
          return (
            <div key={i} className="py-2.5 border-b border-slate-100 last:border-0">
              <div className="font-semibold text-[#1E293B] mb-0.5">
                <span className="text-slate-400 font-normal mr-1">[LP {poz.lp}]</span>
                {poz.nazwaTowaru}
              </div>
              <div className="text-[13px] text-slate-500 mb-1">
                {poz.wartosc_brutto !== null ? `${Number(poz.wartosc_brutto).toFixed(2)} zł brutto` : `${Number(poz.wartoscNetto || 0).toFixed(2)} zł netto`} · ilość: {poz.ilosc} {poz.jednostkaMiary} · VAT {poz.stawkaVat.replace('Stawka', '')}%
              </div>
              <div className="text-sm flex items-center gap-1.5">
                <span className="text-slate-400">→</span>
                {poz.kolumna_kpir === null ? (
                  <Badge variant="outline" className="text-slate-500 border-slate-200 bg-slate-50 font-normal">
                    niesklasyfikowane (AI niedostępny)
                  </Badge>
                ) : isInvalidColumn ? (
                  <Badge variant="outline" className="text-orange-700 border-orange-200 bg-orange-50 font-medium" title="AI zaproponował kolumnę nieodpowiadającą typowi">
                    ⚠️ {getKolumnaLabel(exception.typ_dokumentu, poz.kolumna_kpir)}
                  </Badge>
                ) : (
                  <span className="text-[#1F3A5F] font-medium bg-slate-100 px-2 py-0.5 rounded-md text-[13px]">
                    {getKolumnaLabel(exception.typ_dokumentu, poz.kolumna_kpir)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )

    return (
      <div className="mt-4 mb-2 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-[13px] font-semibold text-slate-700 flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          Pozycje faktury ({pozycje.length})
        </div>
        <div className="p-3">
          {pozycje.length > 5 ? (
            <Collapsible>
              <PozycjeList items={pozycje.slice(0, 5)} />
              <CollapsibleContent>
                <PozycjeList items={pozycje.slice(5)} />
              </CollapsibleContent>
              <CollapsibleTrigger className="w-full mt-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-9 px-3">
                <ChevronsUpDown className="w-4 h-4" />
                Pokaż wszystkie pozycje ({pozycje.length})
              </CollapsibleTrigger>
            </Collapsible>
          ) : (
            <PozycjeList items={pozycje} />
          )}
        </div>
      </div>
    )
  }

  // renderRezimPojazdowy removed — replaced by PojazdRezimSection (sesja 7)

  const isClientVatPayer = exception.client?.platnik_vat !== false

  const renderJpkSections = (isReadOnly: boolean) => {
    // Extract AI pozycje_vat from zapis_vat_data
    const aiPozycjeVat = (exception.zapis_vat_data?.pozycje_vat ?? []).map((p: PozycjaVAT) => ({
      stawka: String(p.stawka_symbol ?? '23'),
      netto: Number(p.netto),
      vat: Number(p.vat),
      brutto: Number(p.brutto),
      pole_deklaracji: (p as any).pole_deklaracji ?? null,
    }))

    // BUG 1 fix: fallback GTU bitmask from zapis_vat_data.grupa_asortymentu
    const gtuBitmaskResolved = exception.gtu_bitmask ?? (typeof exception.zapis_vat_data?.grupa_asortymentu === 'number' ? exception.zapis_vat_data.grupa_asortymentu : null) ?? null

    return (
      <div className="mt-4 space-y-3">
        {/* Pozycje VAT — ukryj dla klientów zwolnionych z VAT */}
        {isClientVatPayer && (
          <PozycjeVatSection
            exceptionId={exception.id}
            kwotaBrutto={exception.kwota_brutto ?? 0}
            pozycjeVatFinal={exception.pozycje_vat_final}
            pozycjeVatAi={aiPozycjeVat.length > 0 ? aiPozycjeVat : null}
            isEdited={exception.pozycje_vat_edited ?? false}
            readOnly={isReadOnly}
          />
        )}
        {/* Pojazd i reżim paliwowy — UKRYJ dla sprzedaży */}
        {exception.typ_dokumentu !== 'sprzedaz' && (
          <PojazdRezimSection
            exceptionId={exception.id}
            clientNip={exception.client_nip}
            clientPojazdy={clientPojazdy}
            aiPojazdId={exception.kpir_pojazdowe_data?.wydatki_dotycza_pojazdu ? (exception.pojazd_id ?? null) : null}
            aiRezim={exception.kpir_pojazdowe_data?.strategia === 'pelne_100' ? '100' : exception.kpir_pojazdowe_data?.strategia === 'prywatne_20' ? '20' : exception.kpir_pojazdowe_data ? '50_75' : null}
            pojazdIdFinal={exception.pojazd_id_final}
            rezimFinal={exception.rezim_paliwowy_final}
            isEdited={exception.rezim_edited ?? false}
            readOnly={isReadOnly}
            kwotaBrutto={exception.kwota_brutto ?? 0}
            kpirPojazdoweData={exception.kpir_pojazdowe_data}
          />
        )}
        {exception.typ_dokumentu === 'zakup' && exception.srodek_trwaly_status && (
          <SrodekTrwalySection exception={exception} />
        )}
        <WeryfikacjaKontrahentaSection exception={exception} />
        {/* Procedury JPK i GTU — tylko dla płatników VAT */}
        {isClientVatPayer && (
          <ProceduryJpkSection
            exceptionId={exception.id}
            proceduraJpk={exception.procedura_jpk}
            typDokumentuJpk={exception.typ_dokumentu_jpk}
            proceduraJpkFinal={exception.procedura_jpk_final}
            typDokumentuJpkFinal={exception.typ_dokumentu_jpk_final}
            isEdited={exception.jpk_procedury_edited ?? false}
            readOnly={isReadOnly}
            typDokumentu={exception.typ_dokumentu}
          />
        )}
        {/* GTU 1-13 — UKRYJ dla zakupu i dla zwolnionych z VAT */}
        {isClientVatPayer && exception.typ_dokumentu === 'sprzedaz' && (
          <GtuSection
            exceptionId={exception.id}
            gtuBitmask={gtuBitmaskResolved}
            gtuSources={exception.gtu_sources as any}
            gtuBitmaskFinal={exception.gtu_bitmask_final}
            isEdited={exception.gtu_edited_by_user ?? false}
            readOnly={isReadOnly}
          />
        )}
      </div>
    )
  }

  const renderZapisVat = () => {
    if (exception.client && exception.client.platnik_vat === false) {
      return (
        <div className="mt-4 mb-2 bg-blue-50 border border-blue-200 rounded-lg overflow-hidden shadow-sm p-3">
          <div className="text-sm text-blue-700 flex items-center gap-2">
            ℹ️ Klient zwolniony z VAT — rejestr VAT nie jest prowadzony
          </div>
        </div>
      )
    }

    const zapisVat = exception.final_zapis_vat_data || exception.zapis_vat_data;
    
    // Check if worker processed it (if undefined, maybe it's legacy)
    if (zapisVat === undefined) {
       return (
         <div className="mt-4 mb-2 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden shadow-sm p-3">
           <div className="text-sm text-slate-600 flex items-center gap-2">
             <AlertCircle className="w-4 h-4 text-slate-400" />
             ℹ️ Brak danych VAT (legacy)
           </div>
         </div>
       )
    }

    // Now it's either null or object
    const pozycjeXml = exception.pozycje_xml_full || [];
    const hasStawkiVat = pozycjeXml.some(p => !['zw', 'np', 'oo'].includes(p.stawkaVat?.toLowerCase() || ''));

    if (zapisVat === null) {
      if (hasStawkiVat) {
        return (
          <div className="mt-4 mb-2 bg-orange-50 border border-orange-200 text-orange-800 rounded-lg overflow-hidden shadow-sm p-3">
            <div className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
              ⚠️ Worker nie wygenerował zapisu VAT mimo że faktura ma stawki VAT &gt;0%. Sprawdź w workerze.
            </div>
          </div>
        )
      } else {
        return (
          <div className="mt-4 mb-2 bg-blue-50 border border-blue-200 rounded-lg overflow-hidden shadow-sm p-3">
            <div className="text-sm text-blue-700 flex items-center gap-2">
              ℹ️ Faktura zwolniona z VAT — brak pozycji opodatkowanych
            </div>
          </div>
        )
      }
    }

    const title = getEtykietaSekcjiVAT(exception.typ_dokumentu, true);
    
    // Walidacje
    const diff = Math.abs((zapisVat.suma_brutto || 0) - (exception.kwota_brutto || 0));
    const isSumInvalid = diff > 0.5;

    // AI proposed bad transaction per typ
    const isZakup = exception.typ_dokumentu === 'zakup';
    const isBadTransakcja = isZakup ? (zapisVat.transakcja_id === 1) : (zapisVat.transakcja_id === 16 || zapisVat.transakcja_id === 15);

    // Wykryj czy jakies pozycje maja czesciowe odliczenie VAT (50% / 25%)
    const pozycjeEditable = exception.pozycje_editable ?? []
    const hasCzesciowe50 = pozycjeEditable.some(p => p.effective_vat_odliczalny === 'czesciowe_50')
    const hasCzesciowe25 = pozycjeEditable.some(p => p.effective_vat_odliczalny === 'czesciowe_25')
    const hasCzescioweVat = hasCzesciowe50 || hasCzesciowe25
    const czescioweProcent = hasCzesciowe50 ? '50%' : '25%'
    // Niespojnosc: pozycje maja czesciowe, ale naglowek mowi "Calkowite" (1)
    const isOdliczenieNiespojna = hasCzescioweVat && Number(zapisVat.rodzaj_odliczenia) === 1

    // Przelicz effective pozycje_vat na podstawie flag KUP/VAT per pozycja
    // brak odliczenia (art.88) lub NKUP -> wyklucz z rejestru VAT
    // czesciowe_50/25 -> pelna kwota (rozdzielenie robi system ksiegowy)
    let effectivePozycjeVat = zapisVat.pozycje_vat ?? []
    let excludedStawki: string[] = []
    let effectiveSumaNetto = Number(zapisVat.suma_netto ?? 0)
    let effectiveSumaVat = Number(zapisVat.suma_vat ?? 0)
    let effectiveSumaBrutto = Number(zapisVat.suma_brutto ?? 0)
    const hasExclusions = isZakup && pozycjeEditable.length > 0 && pozycjeEditable.some(
      p => p.effective_vat_odliczalny === 'brak' || p.effective_kup_status === 'nkup'
    )

    if (hasExclusions) {
      // Filtruj pozycje odliczalne
      const deductible = pozycjeEditable.filter(p =>
        p.effective_vat_odliczalny !== 'brak' && p.effective_kup_status !== 'nkup'
      )

      // Grupuj po stawce VAT
      const groups = new Map<string, { netto: number; vat: number; brutto: number }>()
      for (const p of deductible) {
        const rawStawka = p.stawka_vat || '0'
        const stawka = rawStawka.startsWith('Stawka') ? rawStawka.replace('Stawka', '') : rawStawka
        const existing = groups.get(stawka) || { netto: 0, vat: 0, brutto: 0 }
        const netto = Number(p.wartosc_netto || 0)
        const brutto = Number(p.wartosc_brutto || 0)
        existing.netto += netto
        existing.vat += (brutto - netto)
        existing.brutto += brutto
        groups.set(stawka, existing)
      }

      // Zachowaj oryginalne stawka_id i pole_deklaracji z workerowego zapisVat
      const origPozycje = zapisVat.pozycje_vat ?? []
      effectivePozycjeVat = []
      excludedStawki = []

      for (const orig of origPozycje) {
        const stawkaNum = orig.stawka_symbol.startsWith('Stawka')
          ? orig.stawka_symbol.replace('Stawka', '')
          : orig.stawka_symbol
        const group = groups.get(stawkaNum)
        if (group && (group.netto !== 0 || group.brutto !== 0)) {
          effectivePozycjeVat.push({ ...orig, netto: group.netto, vat: group.vat, brutto: group.brutto })
        } else {
          excludedStawki.push(stawkaNum)
        }
      }

      effectiveSumaNetto = effectivePozycjeVat.reduce((s, p) => s + Number(p.netto), 0)
      effectiveSumaVat = effectivePozycjeVat.reduce((s, p) => s + Number(p.vat), 0)
      effectiveSumaBrutto = effectivePozycjeVat.reduce((s, p) => s + Number(p.brutto), 0)
    }

    return (
      <div className="mt-4 mb-2 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-[13px] font-semibold text-slate-700 flex items-center gap-2">
          {title}
        </div>
        <div className="p-3 text-sm space-y-2">
          <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-1">
            <div className="text-slate-500">Rejestr:</div>
            <div className="font-medium text-slate-800">{zapisVat.rejestr_nazwa}</div>
            
            <div className="text-slate-500">Transakcja VAT:</div>
            <div className="font-medium text-slate-800 flex flex-wrap items-center gap-2">
              {zapisVat.transakcja_nazwa}
              {isBadTransakcja && <span className="text-orange-600 text-xs">⚠️ AI wybrał transakcję nieodpowiadającą typowi dokumentu — sprawdź ręcznie</span>}
            </div>

            {isZakup ? (
              <>
                {zapisVat.rodzaj_zakupu !== undefined && (
                  <>
                    <div className="text-slate-500">Rodzaj zakupu:</div>
                    <div className="font-medium text-slate-800">{getRodzajZakupuLabel(zapisVat.rodzaj_zakupu)}</div>
                  </>
                )}
                {zapisVat.rodzaj_odliczenia !== undefined && (
                  <>
                    <div className="text-slate-500">Rodzaj odliczenia:</div>
                    <div className="font-medium text-slate-800 flex flex-wrap items-center gap-2">
                      {hasCzescioweVat ? (
                        <>
                          <span className="text-amber-700 font-semibold">Częściowe ({czescioweProcent})</span>
                          <Badge variant="outline" className="text-[9px] h-4 font-mono text-amber-600 border-amber-300 bg-amber-50">
                            art. 86a VAT
                          </Badge>
                        </>
                      ) : (
                        getRodzajOdliczeniaLabel(zapisVat.rodzaj_odliczenia)
                      )}
                    </div>
                  </>
                )}
                {zapisVat.cel_zakupu !== undefined && (
                  <>
                    <div className="text-slate-500">Cel zakupu:</div>
                    <div className="font-medium text-slate-800">{getCelZakupuLabel(zapisVat.cel_zakupu)}</div>
                  </>
                )}
              </>
            ) : (
              <>
                {zapisVat.procedura_jpk !== undefined && (
                  <>
                    <div className="text-slate-500">Procedura JPK:</div>
                    <div className="font-medium text-slate-800">{zapisVat.procedura_jpk || '—'}</div>
                  </>
                )}
                {zapisVat.grupa_asortymentu !== undefined && (
                  <>
                    <div className="text-slate-500">Grupa asortymentu:</div>
                    <div className="font-medium text-slate-800">{zapisVat.grupa_asortymentu || '—'}</div>
                  </>
                )}
                {zapisVat.typ_dokumentu !== undefined && (
                  <>
                    <div className="text-slate-500">Typ dokumentu:</div>
                    <div className="font-medium text-slate-800">{zapisVat.typ_dokumentu || 'zwykła faktura'}</div>
                  </>
                )}
              </>
            )}
          </div>

          <div className="mt-3">
            <div className="text-slate-500 mb-1 flex items-center gap-2">
              Pozycje per stawka:
              {hasCzescioweVat && (
                <Badge variant="outline" className="text-[9px] h-4 font-normal text-amber-600 border-amber-300 bg-amber-50">
                  VAT {czescioweProcent} — Insert auto-rozdzieli na 2 pozycje przy księgowaniu
                </Badge>
              )}
            </div>
            <div className="pl-2 border-l-2 border-slate-200 space-y-1">
              {effectivePozycjeVat.map((poz: PozycjaVAT, i: number) => (
                <div key={i} className="font-mono text-xs flex items-center gap-1 mb-1">
                  <span className="inline-block w-16 font-medium">
                    {poz.stawka_symbol.startsWith('Stawka') 
                      ? `${poz.stawka_symbol.replace('Stawka', '')}%`
                      : poz.stawka_symbol}
                  </span>
                  <span className="text-slate-600">netto</span> {Number(poz.netto).toFixed(2)} zł
                  {' '}+{' '}
                  <span className="text-slate-600">VAT</span> {Number(poz.vat).toFixed(2)} zł
                  {' '}={' '}
                  <span className="font-medium text-slate-800">brutto {Number(poz.brutto).toFixed(2)} zł</span>
                  {poz.pole_deklaracji && (
                    <Badge variant="outline" className="ml-2 text-[9px] h-4 font-mono text-indigo-600 border-indigo-200 bg-indigo-50">
                      {poz.pole_deklaracji}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Warning o wykluczonych stawkach */}
          {excludedStawki.length > 0 && (
            <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-md text-xs flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
              <span>
                Stawka {excludedStawki.map(s => ['zw','np','oo'].includes(s.toLowerCase()) ? s : `${s}%`).join(', ')} wyłączona z rejestru VAT (pozycja nieodliczalna — NKUP/art.88). VAT trafia w koszty KPiR.
              </span>
            </div>
          )}

          {isOdliczenieNiespojna && (
            <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2.5 rounded-md text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              <div>
                <span className="font-semibold">Niespójność VAT:</span>{' '}
                Pozycja oznaczona jako odliczenie {czescioweProcent}, ale rodzaj odliczenia na poziomie zapisu VAT = Całkowite.
                <span className="block text-xs text-amber-600 mt-1">
                  Worker został zaktualizowany — następne faktury będą prawidłowo. Przy zatwierdzeniu zostanie auto-poprawione na „Częściowe".
                </span>
              </div>
            </div>
          )}

          {isSumInvalid && !hasExclusions && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-800 px-3 py-2.5 rounded-md text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
              <span>
                Suma stawek VAT nie zgadza się z kwotą brutto faktury 
                <span className="font-medium ml-1">(różnica: {diff.toFixed(2)} zł)</span>
              </span>
            </div>
          )}

          <div className="mt-3 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-slate-500 text-xs">Razem netto</div>
                <div className="font-medium tabular-nums">{effectiveSumaNetto.toFixed(2)} zł</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Razem VAT</div>
                <div className="font-medium tabular-nums">{effectiveSumaVat.toFixed(2)} zł</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Razem brutto</div>
                <div className="font-medium tabular-nums flex items-center">
                  {effectiveSumaBrutto.toFixed(2)} zł
                  {!hasExclusions && !isSumInvalid && <span className="ml-1 text-green-600">✓</span>}
                  {hasExclusions && <span className="ml-1 text-amber-500 text-xs">(po wykluczeniach)</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Card 
      ref={cardRef}
      className={cn(
        "p-5 transition-all relative overflow-hidden w-full max-w-full [&>*]:min-w-0",
        isActive ? "ring-2 ring-[#1F3A5F] shadow-md" : confidenceCardClasses,
        stan === 'auto_created' && "bg-green-50/30 border-green-200"
      )}
    >
      {/* HEADER WSPÓLNY */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-4 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1 min-w-0">
            {exception.typ_dokumentu === 'sprzedaz' ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-none mr-1">
                <ArrowUp className="w-3 h-3 mr-1" />
                SPRZEDAŻ
              </Badge>
            ) : (
              <Badge 
                className="bg-orange-100 text-orange-800 hover:bg-orange-100 border-none mr-1"
                title={exception.typ_dokumentu === null ? "Typ nieokreślony - traktowany jako zakup" : undefined}
              >
                <ArrowDown className="w-3 h-3 mr-1" />
                ZAKUP
              </Badge>
            )}
            <User className="w-4 h-4 text-[#64748B]" />
            <span className="font-semibold text-[#1F3A5F]">{exception.client_nazwa}</span>
            <span className="text-[#94A3B8]">·</span>
            <span className="text-[#64748B] text-sm">
              Faktura z: {mounted ? (() => {
                const d = exception.ddk_data?.dataDokumentu ?? exception.pozycje_xml_full?.[0]?.dataSprzedazy ?? exception.data_wystawienia ?? exception.created_at
                return d ? formatDate(d) : '?'
              })() : '...'}
            </span>
            <span className="text-[#94A3B8]">·</span>
            <span className="font-bold text-[#1E293B]">
              {exception.kwota_brutto ? `${exception.kwota_brutto.toFixed(2)} zł` : 'Brak kwoty'}
            </span>
            <Badge variant="secondary" className="ml-2 font-mono text-xs">
              {mounted ? (stan === 'auto_created' ? timeAgo(exception.resolved_at || '') : 'teraz') : '...'}
            </Badge>
            {exception.confidence_overall != null && (
              <ConfidenceBadge score={exception.confidence_overall} className="ml-1" />
            )}
            {weakCount > 0 && (
              <Badge className="ml-1 bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px]">
                ⚠ {weakCount} {weakCount === 1 ? 'wymiar' : 'wymiary'}
              </Badge>
            )}
            {(() => {
              const latestReview = getLatestReview(exception.ai_review_log)
              return latestReview ? <AiReviewBadge review={latestReview} /> : null
            })()}
          </div>
          <div className="flex items-center gap-2 text-sm text-[#475569] min-w-0">
            <Building2 className="w-4 h-4 shrink-0" />
            <span className="font-medium truncate">{getEtykietaKontrahenta(exception.typ_dokumentu)}: {exception.nazwa_dostawcy || 'Brak nazwy'}</span>
            <span className="text-[#94A3B8] shrink-0">
              (NIP: {exception.nip_dostawcy || 'brak'})
            </span>
          </div>
          {/* Data sprzedazy vs data wystawienia — istotne dla sprzedazy */}
          {mounted && exception.typ_dokumentu === 'sprzedaz' && exception.data_sprzedazy && exception.data_wystawienia && (() => {
            const ds = exception.data_sprzedazy
            const dw = exception.data_wystawienia
            const areDifferent = ds !== dw
            return (
              <div className={`flex items-center gap-2 text-sm mt-1 ${areDifferent ? 'text-amber-700' : 'text-slate-500'}`}>
                <FileText className="w-4 h-4 shrink-0" />
                <span>Wystawienie: <span className="font-medium">{formatDate(dw)}</span></span>
                <span className="text-slate-300">|</span>
                <span>Sprzedaż: <span className="font-medium">{formatDate(ds)}</span></span>
                {areDifferent && (
                  <Badge variant="outline" className="text-[10px] h-4 text-amber-600 border-amber-300 bg-amber-50 font-normal">
                    przychód wg daty sprzedaży
                  </Badge>
                )}
              </div>
            )
          })()}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 self-start">
          {stan === 'auto_created' && (
            <Badge className="bg-green-100 text-green-800 border-none">Zaksięgowane</Badge>
          )}
          {(exception.resolved_by === 'fluinty_auto' || exception.auto_created_by === 'fluinty_auto') && (
            <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-semibold">AUTO</Badge>
          )}
        </div>
      </div>

      {/* A3 AI Review section — show BEFORE confidence and classification */}
      {(() => {
        const latestReview = getLatestReview(exception.ai_review_log)
        return latestReview ? <AiReviewSection review={latestReview} /> : null
      })()}

      {/* Confidence weak points */}
      <ConfidenceWeakPointsSection
        confidenceOverall={exception.confidence_overall}
        confidenceReasons={exception.confidence_reasons}
      />

      {/* WARIANT PENDING REVIEW (AI Pre-fill) */}
      {stan === 'pending_review' && (
        <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-blue-200/50">
            <div className="flex items-center gap-2 text-[#4A90E2] font-semibold">
              <Bot className="w-4 h-4" />
              <span>AI ZAPROPONOWAŁ</span>
            </div>
            {exception.ai_confidence && (
              <Badge className={cn("border-none", getConfidenceColor(exception.ai_confidence))}>
                confidence {Math.round(exception.ai_confidence * 100)}%
              </Badge>
            )}
          </div>
          
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium text-[#475569] block mb-1">Opis księgowy:</span>
              <Input
                value={editableOpis}
                onChange={(e) => setEditableOpis(e.target.value)}
                className="h-9 text-sm font-medium text-[#1E293B] border-slate-200 focus:border-[#4A90E2] focus:ring-[#4A90E2]/20"
                placeholder="Wpisz opis księgowy..."
              />
            </div>
            
            <div>
              <span className="text-sm font-medium text-[#475569] block mb-1">{getEtykietaSekcjiKwot(exception.typ_dokumentu)}:</span>
              <div className="space-y-1">
                {(() => {
                  const getKolumnaPozycjeSumy = (colNumer: number): { netto: number; brutto: number } | null => {
                    if (exception.pozycje_editable && exception.pozycje_editable.length > 0) {
                      const matched = exception.pozycje_editable.filter(p => {
                        const effCol = p.effective_kolumna_kpir ?? p.final_kolumna_kpir ?? p.ai_kolumna_kpir;
                        return effCol === colNumer && p.effective_kup_status !== 'nkup';
                      });
                      if (matched.length === 0) return null;
                      const netto = matched.reduce((acc, p) => acc + Number(p.wartosc_netto || 0), 0);
                      const brutto = matched.reduce((acc, p) => acc + Number(p.wartosc_brutto || 0), 0);
                      if ((netto === 0 && brutto === 0) || isNaN(netto) || isNaN(brutto)) return null;
                      return { netto, brutto };
                    }
                    if (exception.pozycje_xml_full && exception.pozycje_xml_full.length > 0) {
                      const joined = joinPozycjeWithKlasyfikacja(exception.pozycje_xml_full, exception.ai_klasyfikacja_pozycji || []);
                      const matched = joined.filter(p => p.kolumna_kpir === colNumer);
                      if (matched.length === 0) return null;
                      const netto = matched.reduce((acc, p) => acc + Number(p.wartoscNetto || 0), 0);
                      const brutto = matched.reduce((acc, p) => acc + Number(p.wartosc_brutto || 0), 0);
                      if ((netto === 0 && brutto === 0) || isNaN(netto) || isNaN(brutto)) return null;
                      return { netto, brutto };
                    }
                    return null;
                  };

                  const formatKwota = (n: number) => {
                    const rounded = Math.round(n * 100) / 100;
                    return rounded.toLocaleString('pl-PL', {
                      minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
                      maximumFractionDigits: 2
                    });
                  };

                  return getKolumnyForTyp(exception.typ_dokumentu).map((col) => {
                    const val = finalKwoty[col.klucz]
                    const isZero = !val || Number(val) === 0
                    
                    // Zmiana 2: jeśli wartość to 0, nie pokazujemy kolumny by zmniejszyć szum wizualny
                    if (isZero) return null;

                    const sumyPozycji = getKolumnaPozycjeSumy(col.numer);

                    return (
                      <div key={col.numer} className="py-0.5">
                        <div className="flex text-sm">
                          <span className="w-48 shrink-0 text-[#64748B]">
                            Kolumna {col.numer} ({col.labelKrotki}):
                          </span>
                          <span className="font-medium text-[#1E293B]">
                            {Number(val).toFixed(2)} zł
                          </span>
                        </div>
                        {sumyPozycji && (
                          <div className="text-xs text-slate-500 pl-48 mt-0.5">
                            netto {formatKwota(sumyPozycji.netto)} zł · brutto {formatKwota(sumyPozycji.brutto)} zł
                          </div>
                        )}
                      </div>
                    )
                  });
                })()}
              </div>
              
              {/* WARNING BANNER dla niepoprawnych kolumn w aiKwoty */}
              {(() => {
                const dozwoloneKlucze = getKolumnyForTyp(exception.typ_dokumentu).map(k => k.klucz);
                const showWarning = Object.entries(aiKwoty).some(([klucz, kwota]) => Number(kwota) > 0 && !dozwoloneKlucze.includes(klucz));
                return showWarning && (
                  <div className="mt-2 bg-orange-50 border border-orange-200 text-orange-800 px-3 py-2 rounded-md text-sm flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-orange-600" />
                    <span>⚠️ AI zaproponował kwotę w kolumnie nieodpowiadającej typowi dokumentu — sprawdź ręcznie</span>
                  </div>
                );
              })()}

              {(() => {
                const sumaKolumn = Object.values(finalKwoty).reduce((a, b) => Number(a) + Number(b), 0);
                const brutto = exception.kwota_brutto || 0;
                const isRezim = Math.abs(sumaKolumn - brutto) > 0.01;
                const pojazdowe = exception.kpir_pojazdowe_data;

                const STRATEGIA_REZIM_LABELS: Record<string, string> = {
                  'mieszany_50_75': '50% VAT + 75% × (netto + ½VAT) KPiR',
                  'mieszane_50': '50% VAT + 75% × (netto + ½VAT) KPiR',
                  'mieszane_75_50': '50% VAT + 75% × (netto + ½VAT) KPiR',
                  'pojazd_firmowy_100': '100% VAT + 100% KPiR',
                  'pelne_100': '100% VAT + 100% KPiR',
                  'pojazd_prywatny_20': '0% VAT + 20% brutto KPiR',
                  'prywatne_20': '0% VAT + 20% brutto KPiR',
                };

                return (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#1E293B]">Suma KPiR: {sumaKolumn.toFixed(2)} zł</span>
                      {!isRezim && (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200 h-5">
                          ✓ zgadza się z kwotą faktury
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Brutto faktury: {brutto.toFixed(2)} zł
                      {pojazdowe && (
                        <span className="ml-1">
                          (reżim: {STRATEGIA_REZIM_LABELS[pojazdowe.strategia] ?? pojazdowe.strategia})
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Pozycje faktury — v8 editable or legacy read-only */}
            {exception.walidator_usluga_warningi && exception.walidator_usluga_warningi.length > 0 && (
              <WalidatorBadge warnings={exception.walidator_usluga_warningi} />
            )}
            {exception.typ_dokumentu !== 'sprzedaz' && exception.walidator_kup_vat_warningi && exception.walidator_kup_vat_warningi.length > 0 && (
              <WalidatorKupVatBadge warnings={exception.walidator_kup_vat_warningi} />
            )}
            {exception.pozycje_editable && exception.pozycje_editable.length > 0 ? (
              <PozycjeFakturySection
                pozycje={exception.pozycje_editable}
                typDokumentu={exception.typ_dokumentu}
                readOnly={false}
              />
            ) : (
              renderPozycjeXml()
            )}
            {renderZapisVat()}
            {renderJpkSections(false)}

            {exception.ai_uzasadnienie && (
              <div className="text-sm text-[#64748B] italic mt-2">
                Uzasadnienie: {exception.ai_uzasadnienie}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-col sm:flex-row items-center justify-between border-t border-blue-200/50 pt-4">
            <div className="text-xs text-[#64748B] mb-3 sm:mb-0">
              <kbd className="bg-white border rounded px-1.5 py-0.5 mr-1 font-mono shadow-sm">Enter</kbd> zatwierdź · 
              <kbd className="bg-white border rounded px-1.5 py-0.5 mx-1 font-mono shadow-sm">E</kbd> edytuj · 
              <kbd className="bg-white border rounded px-1.5 py-0.5 mx-1 font-mono shadow-sm">Esc</kbd> pomiń
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEditModal(true)} disabled={isSubmitting}>
                Edytuj
              </Button>
              <Button variant="ghost" className="text-[#64748B]" onClick={handleIgnore} disabled={isSubmitting}>
                Pomiń
              </Button>
              <Button 
                className={cn("text-white", showAlarms ? "bg-yellow-600 hover:bg-yellow-700" : "bg-[#1F3A5F] hover:bg-[#2A4D7C]")} 
                onClick={handleApprove} 
                disabled={isSubmitting}
              >
                {showAlarms ? 'Akceptuj mimo ostrzeżeń ⚠' : 'Zatwierdź i księguj'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* WARIANT PENDING (Decyzja księgowej - brak na liście/niepewny AI) */}
      {stan === 'pending' && (
        <>
          {(exception.ai_proponowany_opis || exception.ai_uzasadnienie) && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-slate-600 font-semibold">
                  <Bot className="w-4 h-4" />
                  <span>AI NIE ZNALAZŁ NA LIŚCIE</span>
                </div>
                {exception.ai_confidence && (
                  <Badge className={getConfidenceColor(exception.ai_confidence)}>
                    confidence {Math.round(exception.ai_confidence * 100)}%
                  </Badge>
                )}
              </div>
              
              {exception.ai_proponowany_opis && (
                <div className="mb-2">
                  <span className="text-sm font-medium text-[#475569]">Sugerowany opis: </span>
                  <span className="text-[#1E293B] font-medium">"{exception.ai_proponowany_opis}"</span>
                  <div className="text-xs text-amber-600 mt-0.5 font-medium">
                    (NIE MA NA LIŚCIE OPISÓW TEGO KLIENTA)
                  </div>
                </div>
              )}
              
              {exception.ai_uzasadnienie && (
                <div className="text-sm text-[#64748B] italic mb-3">
                  Uzasadnienie: {exception.ai_uzasadnienie}
                </div>
              )}

              {exception.ai_proponowany_opis && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-white"
                  onClick={handleAddAiProposalToClient}
                  disabled={isSubmitting}
                >
                  + Dodaj "{exception.ai_proponowany_opis}" do listy klienta
                </Button>
              )}
            </div>
          )}

          {/* Pozycje faktury — v8 editable or legacy read-only */}
          {exception.walidator_usluga_warningi && exception.walidator_usluga_warningi.length > 0 && (
            <WalidatorBadge warnings={exception.walidator_usluga_warningi} />
          )}
          {exception.typ_dokumentu !== 'sprzedaz' && exception.walidator_kup_vat_warningi && exception.walidator_kup_vat_warningi.length > 0 && (
            <WalidatorKupVatBadge warnings={exception.walidator_kup_vat_warningi} />
          )}
          {exception.pozycje_editable && exception.pozycje_editable.length > 0 ? (
            <PozycjeFakturySection
              pozycje={exception.pozycje_editable}
              typDokumentu={exception.typ_dokumentu}
              readOnly={false}
            />
          ) : (
            renderPozycjeXml()
          )}
          {renderZapisVat()}
          {renderJpkSections(false)}

          <div className="space-y-2 mb-4">
            <label className="text-sm font-medium text-[#1E293B]">OPIS KSIĘGOWY (wybierz z listy lub dodaj):</label>
            <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
              <PopoverTrigger render={
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCombobox}
                  className="w-full justify-between"
                  disabled={isSubmitting}
                >
                  {selectedOpis || "Wybierz lub wpisz opis..."}
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
                          setSelectedOpis(searchValue)
                          setOpenCombobox(false)
                        }}
                      >
                        Brak wyników. Użyj "{searchValue}"
                      </button>
                    </CommandEmpty>
                    <CommandGroup>
                      {clientOpisy.filter(o => o.aktywny).map((op) => (
                        <CommandItem
                          key={op.id}
                          value={op.nazwa}
                          onSelect={(currentValue) => {
                            setSelectedOpis(currentValue)
                            setOpenCombobox(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedOpis === op.nazwa ? "opacity-100" : "opacity-0"
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

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="ghost" className="text-[#64748B]" onClick={handleIgnore} disabled={isSubmitting}>
              Pomiń
            </Button>
            <Button 
              className="bg-[#1F3A5F] hover:bg-[#2A4D7C] text-white" 
              onClick={handleResolve} 
              disabled={isSubmitting || !selectedOpis}
            >
              Zatwierdź
            </Button>
          </div>
        </>
      )}

      {/* WARIANT AUTO CREATED / APPROVED (Podgląd) */}
      {(stan === 'auto_created' || exception.status === 'approved') && (
        <div className="mt-4 pt-4 border-t border-[#E2E8F0]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[#64748B] block mb-1">Wykorzystany opis:</span>
              <span className="font-medium text-[#1E293B]">"{exception.resolved_opis}"</span>
            </div>
            <div>
              <span className="text-[#64748B] block mb-1">Kwoty KPiR:</span>
              <div className="space-y-1">
                {getKolumnyForTyp(exception.typ_dokumentu).map((col) => {
                  const val = finalKwoty[col.klucz]
                  const isZero = !val || Number(val) === 0
                  return (
                    <div key={col.numer} className={cn("flex", isZero && "text-slate-400")}>
                      <span className={cn("w-32 shrink-0", isZero ? "text-slate-400" : "text-[#64748B]")}>
                        Kolumna {col.numer}:
                      </span>
                      <span className={cn("font-medium", isZero ? "text-slate-400" : "text-[#1E293B]")}>
                        {Number(val || 0).toFixed(2)} zł
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="sm:col-span-2 -mx-2 sm:mx-0">
              {/* Pozycje faktury — v8 read-only or legacy */}
              {exception.walidator_usluga_warningi && exception.walidator_usluga_warningi.length > 0 && (
                <WalidatorBadge warnings={exception.walidator_usluga_warningi} />
              )}
              {exception.typ_dokumentu !== 'sprzedaz' && exception.walidator_kup_vat_warningi && exception.walidator_kup_vat_warningi.length > 0 && (
                <WalidatorKupVatBadge warnings={exception.walidator_kup_vat_warningi} />
              )}
              {exception.pozycje_editable && exception.pozycje_editable.length > 0 ? (
                <PozycjeFakturySection
                  pozycje={exception.pozycje_editable}
                  typDokumentu={exception.typ_dokumentu}
                  readOnly={true}
                />
              ) : (
                renderPozycjeXml()
              )}
              {renderZapisVat()}
              {renderJpkSections(true)}
            </div>

            <div className="sm:col-span-2 flex items-center gap-4 text-xs text-[#64748B]">
              <div className="flex items-center gap-1">
                <User className="w-3 h-3" />
                Zatwierdził/a: {exception.resolved_by || 'system'}
              </div>
              {mounted && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {exception.resolved_at ? new Date(exception.resolved_at).toLocaleTimeString() : '?'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Edycji */}
      {showEditModal && (
        <EditModal 
          open={showEditModal} 
          onOpenChange={setShowEditModal}
          initialOpis={exception.ai_proponowany_opis || ''}
          initialKwoty={exception.final_kwoty_per_kolumna || exception.ai_kwoty_per_kolumna || {}}
          initialZapisVatData={mergeInlineEditsVat(exception, exception.pozycje_editable, mergeInlineEditsPojazd(exception)) || exception.zapis_vat_data || null}
          kwotaBrutto={exception.kwota_brutto}
          kwotaNetto={exception.zapis_vat_data?.suma_netto ?? null}
          isVatPayer={exception.client?.platnik_vat !== false}
          pozycjeEditable={exception.pozycje_editable}
          typDokumentu={exception.typ_dokumentu}
          clientOpisy={clientOpisy}
          onSave={handleEditSave}
        />
      )}
    </Card>
  )
}
