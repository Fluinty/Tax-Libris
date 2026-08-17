'use client'

/**
 * ZASADY MODYFIKACJI WIDOKU FAKTURY KSEF:
 * 
 * Ta aplikacja korzysta z DWÓCH bliźniaczych komponentów do renderowania podglądu faktury:
 * 1. FakturaPreview.tsx (TEN PLIK) - "Sticky" panel boczny z podsumowaniem (kanoniczny widok dla księgowej na co dzień).
 * 2. PelnaFakturaSection.tsx - Zwijana, pełna sekcja KSeF na dole formularza.
 * 
 * Wszelkie zmiany wizualne i logiczne w prezentacji faktury (np. warstwy rozliczeń, nowe pola)
 * należy implementować W OBU PLIKACH, aby utrzymać spójność.
 *
 * ŚWIADOME WYJĄTKI od pełnej symetrii (AUDIT §3, decyzja Fala 3 17.08.2026) —
 * każdy poniższy punkt jest celowy i NIE wymaga wyrównywania:
 *  - rabaty per pozycja, dodatkowyOpis z badge, kwota VAT w kolumnach pozycji,
 *    wiersz „Ogółem" — TYLKO w PelnaFakturaSection (wierny obraz KSeF;
 *    Preview to kompakt do codziennej akceptacji, nadmiar kolumn go zabija);
 *  - numer KSeF, strony (sprzedawca/nabywca z adresami), termin+forma
 *    płatności, kolumny Cena/J.m. — TYLKO w FakturaPreview (to informacje
 *    decyzyjne przy akceptacji; Pełna renderuje surowe wiersze podglądu);
 *  - sekcja Rozliczenia ma w obu widokach inny FORMAT (tabela vs lista) —
 *    te same DANE (dodatkoweRozliczenia + wspólny computeLayer2 z @/lib/vat).
 * WSPÓLNE i wymagane w OBU: tabela VAT (getOfficialVatTable), wiersz różnicy
 * Layer 2 (computeLayer2), flagi Korekta/Zaliczka/Marża/MPP + rabat
 * nagłówkowy, waluta z kodWaluty.
 */

import type { ExceptionWithClient, PozycjaXml, PozycjaVAT } from '@/types/database'
import { getOfficialVatTable, computeLayer2, deriveDoZaplaty } from '@/lib/vat'
import { Badge } from '@/components/ui/badge'

interface FakturaPreviewProps {
  exception: ExceptionWithClient
}

// ── Helpers ──────────────────────────────────────────

// Waluta z podglad_faktury (kodWaluty), nie sztywne „zł" — PelnaFaktura
// renderuje kodWaluty, a kanoniczny Preview pokazywał EUR-owej fakturze „zł"
// (AUDIT §3; dziś 0 faktur nie-PLN — prewencja). PLN → „zł" jak dotąd.
function fmtKwota(n: number | string | null | undefined, waluta: string = 'zł'): string {
  const parsed = typeof n === 'string' ? parseFloat(n.replace(',', '.').replace('−', '-')) : Number(n)
  const v = isNaN(parsed) ? 0 : parsed
  return v.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' ' + waluta
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) return d
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return d
  }
}

/** Read a PozycjaXml field with fallback for varying key naming conventions */
function pVal(poz: PozycjaXml, ...keys: string[]): string | null {
  const rec = poz as unknown as Record<string, unknown>
  for (const k of keys) {
    const v = rec[k]
    if (v !== undefined && v !== null && v !== '') return String(v)
  }
  return null
}

/** Robustly extract payment term and form from root, ddk_data, or position data */
function extractPaymentInfo(e: ExceptionWithClient): { termin: string | null; forma: string | null } {
  let termin: string | null = null
  let forma: string | null = null

  const findVal = (obj: any, ...keys: string[]): string | null => {
    if (!obj || typeof obj !== 'object') return null
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
        if (typeof obj[k] === 'object') {
          for (const sub of ['Termin', 'termin', 'Data', 'data', 'Sposob', 'sposob', 'Forma', 'forma', 'Nazwa', 'nazwa']) {
            if (obj[k][sub] !== undefined && obj[k][sub] !== null && obj[k][sub] !== '') return String(obj[k][sub])
          }
        } else {
          return String(obj[k])
        }
      }
    }
    return null
  }

  // Check root exception
  termin = termin || findVal(e, 'termin_platnosci', 'terminPlatnosci', 'TerminPlatnosci', 'data_platnosci', 'dataPlatnosci', 'termin')
  forma = forma || findVal(e, 'forma_platnosci', 'formaPlatnosci', 'FormaPlatnosci', 'sposob_platnosci', 'sposobPlatnosci', 'SposobPlatnosci', 'platnosc_forma', 'forma', 'sposob')

  // Check ddk_data
  if (e.ddk_data) {
    termin = termin || findVal(e.ddk_data, 'termin_platnosci', 'terminPlatnosci', 'TerminPlatnosci', 'data_platnosci', 'dataPlatnosci', 'Termin', 'termin')
    forma = forma || findVal(e.ddk_data, 'forma_platnosci', 'formaPlatnosci', 'FormaPlatnosci', 'sposob_platnosci', 'sposobPlatnosci', 'SposobPlatnosci', 'Forma', 'forma', 'Sposob', 'sposob')
    if ((e.ddk_data as any).Platnosc || (e.ddk_data as any).platnosc) {
      const pObj = (e.ddk_data as any).Platnosc || (e.ddk_data as any).platnosc
      termin = termin || findVal(pObj, 'termin_platnosci', 'terminPlatnosci', 'TerminPlatnosci', 'data_platnosci', 'dataPlatnosci', 'Termin', 'termin', 'TerminPlatnosci')
      forma = forma || findVal(pObj, 'forma_platnosci', 'formaPlatnosci', 'FormaPlatnosci', 'sposob_platnosci', 'sposobPlatnosci', 'SposobPlatnosci', 'Forma', 'forma', 'FormaPlatnosci', 'Sposob', 'sposob')
    }
  }

  // Check pozycje_xml_full
  if (e.pozycje_xml_full && Array.isArray(e.pozycje_xml_full)) {
    for (const poz of e.pozycje_xml_full) {
      termin = termin || findVal(poz, 'termin_platnosci', 'terminPlatnosci', 'TerminPlatnosci', 'data_platnosci', 'dataPlatnosci', 'termin')
      forma = forma || findVal(poz, 'forma_platnosci', 'formaPlatnosci', 'FormaPlatnosci', 'sposob_platnosci', 'sposobPlatnosci', 'SposobPlatnosci', 'forma', 'sposob')
      if (termin && forma) break
    }
  }

  return { termin, forma }
}

// ── Component ────────────────────────────────────────

export function FakturaPreview({ exception }: FakturaPreviewProps) {
  const e = exception
  const isSprzedaz = e.typ_dokumentu === 'sprzedaz'
  const pozycje = e.pozycje_xml_full
  const zapisVat = e.zapis_vat_data

  // Party resolution: for sprzedaz, client=Sprzedawca, kontrahent=Nabywca; reverse for zakup
  // Address matching: adres_sprzedawcy is always Sprzedawca address, adres_nabywcy is always Nabywca address
  const sprzedawca = isSprzedaz
    ? { nazwa: e.client?.nazwa || e.client_nazwa, nip: e.client_nip, adres: e.adres_sprzedawcy || null }
    : { nazwa: e.nazwa_dostawcy || 'Brak danych', nip: e.nip_dostawcy || 'brak', adres: e.adres_sprzedawcy || null }

  const nabywca = isSprzedaz
    ? { nazwa: e.nazwa_dostawcy || 'Brak danych', nip: e.nip_dostawcy || 'brak', adres: e.adres_nabywcy || null }
    : { nazwa: e.client?.nazwa || e.client_nazwa, nip: e.client_nip, adres: e.adres_nabywcy || null }

  // ── Detect which columns have data ────────────────
  const hasAnyPozycje = pozycje && pozycje.length > 0

  type ColKey = 'lp' | 'nazwa' | 'ilosc' | 'jm' | 'cena' | 'netto' | 'vat' | 'brutto'
  const colHasData: Record<ColKey, boolean> = {
    lp: false, nazwa: false, ilosc: false, jm: false,
    cena: false, netto: false, vat: false, brutto: false,
  }

  if (hasAnyPozycje) {
    for (const p of pozycje) {
      if (pVal(p, 'lp')) colHasData.lp = true
      if (pVal(p, 'nazwaTowaru', 'nazwa')) colHasData.nazwa = true
      if (pVal(p, 'ilosc')) colHasData.ilosc = true
      if (pVal(p, 'jednostkaMiary', 'jednostka', 'jm')) colHasData.jm = true
      if (pVal(p, 'cenaNetto', 'cenaJednostkowa', 'cenaBrutto')) colHasData.cena = true
      if (pVal(p, 'wartoscNetto', 'wartosc_netto')) colHasData.netto = true
      if (pVal(p, 'stawkaVat', 'stawka')) colHasData.vat = true
      if (pVal(p, 'wartoscBrutto', 'wartosc_brutto', 'wartoscNetto', 'wartosc_netto')) colHasData.brutto = true
    }
  }

  // Hide cena column when all items have ilosc=1 (redundant with netto)
  const allIloscOne = hasAnyPozycje && pozycje.every(p => {
    const qty = Number(pVal(p, 'ilosc') || 1)
    return qty === 1
  })
  if (allIloscOne) colHasData.cena = false

  const columns: { key: ColKey; label: string; align?: string }[] = [
    { key: 'lp', label: 'LP' },
    { key: 'nazwa', label: 'Nazwa' },
    { key: 'ilosc', label: 'Ilość', align: 'right' },
    { key: 'jm', label: 'J.m.' },
    { key: 'cena', label: 'Cena', align: 'right' },
    { key: 'netto', label: 'Netto', align: 'right' },
    { key: 'vat', label: 'VAT' },
    { key: 'brutto', label: 'Brutto', align: 'right' },
  ]
  const visibleCols = columns.filter(c => colHasData[c.key])

  function getCellValue(poz: PozycjaXml, key: ColKey): string {
    switch (key) {
      case 'lp': return pVal(poz, 'lp') || ''
      case 'nazwa': return pVal(poz, 'nazwaTowaru', 'nazwa') || ''
      case 'ilosc': return pVal(poz, 'ilosc') || ''
      case 'jm': return pVal(poz, 'jednostkaMiary', 'jednostka', 'jm') || ''
      case 'cena': {
        const v = pVal(poz, 'cenaNetto', 'cenaJednostkowa', 'cenaBrutto')
        return v ? fmt(v) : ''
      }
      case 'netto': {
        const v = pVal(poz, 'wartoscNetto', 'wartosc_netto')
        return v ? fmt(v) : ''
      }
      case 'vat': {
        const raw = pVal(poz, 'stawkaVat', 'stawka') || ''
        return raw.replace('Stawka', '').trim()
      }
      case 'brutto': {
        const v = pVal(poz, 'wartoscBrutto', 'wartosc_brutto')
        if (v && !isNaN(Number(v))) {
          return fmt(v)
        }
        // Brak wartoscBrutto -> policz netto * (1 + stawka/100) dla liczb lub pokaż netto/"—" dla nienumerycznych (zw, np, oo)
        const nettoStr = pVal(poz, 'wartoscNetto', 'wartosc_netto')
        if (!nettoStr || isNaN(Number(nettoStr))) return '—'
        const netto = Number(nettoStr)
        const rawStawka = (pVal(poz, 'stawkaVat', 'stawka') || '').replace('Stawka', '').trim()
        if (!rawStawka || isNaN(Number(rawStawka))) {
          return fmt(netto)
        }
        const stawkaNum = Number(rawStawka)
        const calcBrutto = Math.round(netto * (1 + stawkaNum / 100) * 100) / 100
        return fmt(calcBrutto)
      }
      default: return ''
    }
  }

  // ── VAT table rows — WSPÓLNA funkcja z @/lib/vat (AUDIT §3) ──────────────
  // Dotąd inline-duplikat getOfficialVatTable BEZ normalizeStawka — ta sama
  // faktura mogła grupować stawki inaczej niż PozycjeVatSection/PelnaFaktura
  // (np. „Stawka 23" vs „23"). Fallbacki na zapisVat bez zmian.
  const pozycjeVat: PozycjaVAT[] = (() => {
    if (hasAnyPozycje) {
      const official = getOfficialVatTable(pozycje)
      if (official && official.length > 0) return official as PozycjaVAT[]
    }
    // Fallback: use zapisVat data if no pozycje available
    if (zapisVat && zapisVat.pozycje_vat && zapisVat.pozycje_vat.length > 0) {
      return zapisVat.pozycje_vat
    }
    if (zapisVat) {
      return [{
        stawka_symbol: 'zw',
        stawka_id: '',
        netto: zapisVat.suma_netto ?? e.kwota_brutto ?? 0,
        vat: zapisVat.suma_vat ?? 0,
        brutto: zapisVat.suma_brutto ?? e.kwota_brutto ?? 0,
      }]
    }
    return []
  })()

  const sumaNetto = pozycjeVat.reduce((a, p) => a + p.netto, 0) || null
  const sumaVat = pozycjeVat.reduce((a, p) => a + p.vat, 0) || null
  const sumaBrutto = pozycjeVat.reduce((a, p) => a + p.brutto, 0) || e.kwota_brutto

  // ── Rozliczenia poza fakturą (KSeF Layer 2) — WSPÓLNY computeLayer2 ──────
  // Ta sama baza co PelnaFaktura: doZaplaty z podglądu KSeF (fallback
  // kwota_brutto karty) minus brutto tabeli VAT — dotąd Preview liczył
  // z `kwota_brutto − suma XML` i przy rozjeździe jeden z widoków pokazywał
  // saldo, a drugi nie (AUDIT §3).
  const podglad = (e.podglad_faktury as any) || {}
  const dodatkoweRozliczenia = Array.isArray(podglad.dodatkoweRozliczenia) ? podglad.dodatkoweRozliczenia : []
  const doZaplaty = deriveDoZaplaty(podglad.kwotaDoZaplaty, e.kwota_brutto)
  const { layer2Diff, showLayer2Row } = computeLayer2(doZaplaty, sumaBrutto ?? 0, dodatkoweRozliczenia)

  // ── Flagi dokumentu (Korekta/Zaliczka/Marża/MPP + rabat nagłówkowy) ──────
  // Dotąd TYLKO w zwijanej PelnaFakturze — księgowa mogła zatwierdzić
  // korektę/MPP nie widząc tego bez rozwinięcia (AUDIT §3; dziś 0 korekt
  // w danych — prewencja przed korektami KSeF). Te same warunki co tam.
  const wierszePodglad = Array.isArray(podglad.wiersze) ? podglad.wiersze : []
  const flagaMpp = wierszePodglad.some((it: any) => it?.wymagaPodzielonejPlatnosci === 'True')
  const flagaKorekta = podglad.korekta === 'True'
  const flagaZaliczka = podglad.zaliczka === 'True'
  const flagaMarza = podglad.fakturaMarza === 'True'
  const sumBruttoWiersze = wierszePodglad.reduce((a: number, it: any) => {
    const v = typeof it?.wartoscBrutto === 'string'
      ? parseFloat(String(it.wartoscBrutto).replace(',', '.').replace('−', '-'))
      : Number(it?.wartoscBrutto)
    return a + (Number.isFinite(v) ? v : 0)
  }, 0)
  const rabatNaglowkowy = wierszePodglad.length > 0 && Math.abs(sumBruttoWiersze - doZaplaty) > 0.02
    ? sumBruttoWiersze - doZaplaty
    : 0

  // Waluta dokumentu: kodWaluty z podglądu KSeF; PLN i brak → „zł" jak dotąd
  const waluta = podglad.kodWaluty && podglad.kodWaluty !== 'PLN' ? String(podglad.kodWaluty) : 'zł'
  const fmt = (n: number | string | null | undefined) => fmtKwota(n, waluta)

  // ── Payment info ──────────────────────────────────
  const { termin, forma } = extractPaymentInfo(e)

  return (
    <div className="bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden text-[13px] leading-relaxed print:shadow-none">
      {/* ── Document title ─────────────────────────── */}
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-800 tracking-tight font-serif">
          Faktura VAT {e.ksiegowe_numer || '(brak numeru)'}
        </h2>
        {e.numer_ksef && (
          <div className="text-[11px] text-slate-500 font-mono mt-0.5 break-all">
            KSeF: {e.numer_ksef}
          </div>
        )}
        {/* Flagi dokumentu — te same co w PelnaFakturaSection (AUDIT §3):
            korekta/zaliczka/marza/MPP musza byc widoczne BEZ rozwijania */}
        {(flagaKorekta || flagaZaliczka || flagaMarza || flagaMpp) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {flagaKorekta && <Badge variant="outline" className="border-red-200 text-red-700 bg-red-50">Korekta {podglad.przyczynaKorekty ? `(${podglad.przyczynaKorekty})` : ''}</Badge>}
            {flagaZaliczka && <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">Zaliczka</Badge>}
            {flagaMarza && <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50">Marża</Badge>}
            {flagaMpp && <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50">MPP</Badge>}
          </div>
        )}
        {rabatNaglowkowy > 0 && (
          <div className="mt-2 text-[11px] px-2 py-1 rounded bg-yellow-50 border border-yellow-200 text-yellow-800">
            Rabat/korekta z podsumowania (nagłówkowy): <strong>-{fmt(rabatNaglowkowy)}</strong>
          </div>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-slate-600 text-xs">
          <span>Data wystawienia: <strong>{fmtDate(e.data_wystawienia)}</strong></span>
          {e.data_sprzedazy && (
            <span>Data sprzedaży: <strong>{fmtDate(e.data_sprzedazy)}</strong></span>
          )}
        </div>
      </div>

      {/* ── Parties ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-0 border-b border-slate-200">
        <div className="px-5 py-3 border-r border-slate-200">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Sprzedawca</div>
          <div className="font-semibold text-slate-800">{sprzedawca.nazwa}</div>
          <div className="text-slate-500 text-xs">NIP: {sprzedawca.nip}</div>
          {sprzedawca.adres && (
            <div className="text-slate-400 text-[11px] mt-1 whitespace-pre-line leading-snug">{sprzedawca.adres}</div>
          )}
        </div>
        <div className="px-5 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Nabywca</div>
          <div className="font-semibold text-slate-800">{nabywca.nazwa}</div>
          <div className="text-slate-500 text-xs">NIP: {nabywca.nip}</div>
          {nabywca.adres && (
            <div className="text-slate-400 text-[11px] mt-1 whitespace-pre-line leading-snug">{nabywca.adres}</div>
          )}
        </div>
      </div>

      {/* ── Pozycje table ──────────────────────────── */}
      {hasAnyPozycje ? (
        <div className="border-b border-slate-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                {visibleCols.map(col => (
                  <th
                    key={col.key}
                    className={`px-2 py-1.5 font-semibold text-slate-600 uppercase text-[10px] tracking-wider whitespace-nowrap ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${col.key === 'lp' ? 'w-8' : col.key === 'nazwa' ? '' : col.key === 'jm' ? 'w-10' : col.key === 'vat' ? 'w-12' : col.key === 'ilosc' ? 'w-12' : 'w-20'}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pozycje.map((poz, idx) => (
                <tr
                  key={idx}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50"
                >
                    {visibleCols.map(col => (
                      <td
                        key={col.key}
                        className={`px-2 py-1 ${
                          col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                        } ${col.key === 'nazwa' ? 'text-slate-800 max-w-[260px] truncate' : 'text-slate-600 whitespace-nowrap'}`}
                        title={col.key === 'nazwa' ? getCellValue(poz, col.key) : undefined}
                      >
                        {getCellValue(poz, col.key)}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-b border-slate-200 px-5 py-6 text-center">
          <div className="text-slate-400 text-sm">
            📄 Brak danych pozycji z KSeF
          </div>
          <div className="text-slate-400 text-xs mt-1">
            System nie posiada danych szczegółowych pozycji faktury.
          </div>
        </div>
      )}

      {/* ── VAT summary table ──────────────────────── */}
      {zapisVat !== null && zapisVat !== undefined && (
        <div className="border-b border-slate-200">
          <div className="bg-slate-50/60 px-3 py-1.5 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
            Zestawienie VAT
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-1.5 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Stawka</th>
                <th className="px-3 py-1.5 text-right font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Netto</th>
                <th className="px-3 py-1.5 text-right font-semibold text-slate-500 text-[10px] uppercase tracking-wider">VAT</th>
                <th className="px-3 py-1.5 text-right font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Brutto</th>
              </tr>
            </thead>
            <tbody>
              {pozycjeVat.map((pv, idx) => (
                <tr key={idx} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5 text-slate-600 font-medium">
                    {pv.stawka_symbol || 'zw'}{!isNaN(Number(pv.stawka_symbol)) && pv.stawka_symbol !== '' ? '%' : ''}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmt(pv.netto)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmt(pv.vat)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmt(pv.brutto)}</td>
                </tr>
              ))}
              {/* Sum row */}
              <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                <td className="px-3 py-1.5 text-slate-700">Razem</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{sumaNetto != null ? fmt(sumaNetto) : '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{sumaVat != null ? fmt(sumaVat) : '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{sumaBrutto != null ? fmt(sumaBrutto) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Dodatkowe rozliczenia (Warstwa 1) ──────────────────────── */}
      {dodatkoweRozliczenia.length > 0 && (
        <div className="border-b border-slate-200">
          <div className="bg-slate-50/60 px-3 py-1.5 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex justify-between items-center">
            <span>Rozliczenia</span>
            <span className="text-[9px] font-normal text-slate-400 normal-case hidden sm:inline">Pozycje rozrachunkowe — nie stanowią kosztu ani przychodu, nie podlegają księgowaniu.</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-1.5 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Typ</th>
                <th className="px-3 py-1.5 text-left font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Opis</th>
                <th className="px-3 py-1.5 text-right font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Kwota</th>
              </tr>
            </thead>
            <tbody>
              {dodatkoweRozliczenia.map((roz: any, idx: number) => (
                <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{roz.typ || 'Inne'}</td>
                  <td className="px-3 py-1.5 text-slate-800">{roz.opis || '-'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-700 whitespace-nowrap">{fmt(roz.kwota)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Payment info / Footer ──────────────────── */}
      {(termin || forma) && (
        <div className="px-5 py-2.5 bg-slate-50/80 border-b border-slate-200 text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
          {termin && <span>Termin płatności: <strong className="text-slate-700">{fmtDate(termin)}</strong></span>}
          {termin && forma && <span className="text-slate-300">·</span>}
          {forma && <span>Forma: <strong className="text-slate-700">{forma}</strong></span>}
        </div>
      )}
      <div className="px-5 py-3 bg-slate-50 flex flex-col items-end gap-1">
        {showLayer2Row && (
          <div 
            className="text-[11px] text-slate-500" 
            title={layer2Diff > 0 ? "Raty, zaległości lub inne rozrachunki doliczone przez wystawcę — nie stanowią kosztu." : "Wystawca rozliczył nadpłatę — kwota do zapłaty jest niższa niż wartość faktury."}
          >
            {dodatkoweRozliczenia.length > 0 
              ? "Pozostałe saldo:" 
              : (layer2Diff > 0 ? "Rozliczenia/saldo poza fakturą:" : "Nadpłata/saldo na koncie:")} 
            <span className="font-medium text-slate-700 ml-1">
              {layer2Diff > 0 ? '+' : ''}{fmt(layer2Diff)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Do zapłaty:</span>
          <span className="text-lg font-bold text-slate-800 tabular-nums whitespace-nowrap">
            {fmt(e.kwota_brutto)}
          </span>
        </div>
      </div>
    </div>
  )
}
