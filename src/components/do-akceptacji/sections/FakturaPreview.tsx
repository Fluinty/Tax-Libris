'use client'

import type { ExceptionWithClient, PozycjaXml, PozycjaVAT } from '@/types/database'

interface FakturaPreviewProps {
  exception: ExceptionWithClient
}

// ── Helpers ──────────────────────────────────────────

function fmtKwota(n: number | string | null | undefined): string {
  const v = Number(n || 0)
  if (isNaN(v)) return '0,00 zł'
  return v.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' zł'
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
        return v ? fmtKwota(v) : ''
      }
      case 'netto': {
        const v = pVal(poz, 'wartoscNetto', 'wartosc_netto')
        return v ? fmtKwota(v) : ''
      }
      case 'vat': {
        const raw = pVal(poz, 'stawkaVat', 'stawka') || ''
        return raw.replace('Stawka', '').trim()
      }
      case 'brutto': {
        const v = pVal(poz, 'wartoscBrutto', 'wartosc_brutto')
        if (v && !isNaN(Number(v))) {
          return fmtKwota(v)
        }
        // Brak wartoscBrutto -> policz netto * (1 + stawka/100) dla liczb lub pokaż netto/"—" dla nienumerycznych (zw, np, oo)
        const nettoStr = pVal(poz, 'wartoscNetto', 'wartosc_netto')
        if (!nettoStr || isNaN(Number(nettoStr))) return '—'
        const netto = Number(nettoStr)
        const rawStawka = (pVal(poz, 'stawkaVat', 'stawka') || '').replace('Stawka', '').trim()
        if (!rawStawka || isNaN(Number(rawStawka))) {
          return fmtKwota(netto)
        }
        const stawkaNum = Number(rawStawka)
        const calcBrutto = Math.round(netto * (1 + stawkaNum / 100) * 100) / 100
        return fmtKwota(calcBrutto)
      }
      default: return ''
    }
  }

  // ── VAT table rows ────────────────────────────────
  const pozycjeVat: PozycjaVAT[] = (zapisVat && zapisVat.pozycje_vat && zapisVat.pozycje_vat.length > 0)
    ? zapisVat.pozycje_vat
    : zapisVat
      ? [{
          stawka_symbol: pozycje?.[0]?.stawkaVat?.replace('Stawka', '').trim() || 'zw',
          stawka_id: '',
          netto: zapisVat.suma_netto ?? e.kwota_brutto ?? 0,
          vat: zapisVat.suma_vat ?? 0,
          brutto: zapisVat.suma_brutto ?? e.kwota_brutto ?? 0,
        }]
      : []

  const sumaNetto = zapisVat?.suma_netto ?? null
  const sumaVat = zapisVat?.suma_vat ?? null
  const sumaBrutto = zapisVat?.suma_brutto ?? e.kwota_brutto

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
        <div className="border-b border-slate-200">
          <table className="w-full text-xs table-fixed">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                {visibleCols.map(col => (
                  <th
                    key={col.key}
                    className={`px-2 py-1.5 font-semibold text-slate-600 uppercase text-[10px] tracking-wider ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${col.key === 'lp' ? 'w-7' : ''} ${col.key === 'nazwa' ? '' : col.key === 'jm' ? 'w-10' : col.key === 'vat' ? 'w-11' : col.key === 'ilosc' ? 'w-10' : 'w-[68px]'}`}
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
                      } ${col.key === 'nazwa' ? 'text-slate-800 break-words' : 'text-slate-600 whitespace-nowrap'}`}
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
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmtKwota(pv.netto)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmtKwota(pv.vat)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmtKwota(pv.brutto)}</td>
                </tr>
              ))}
              {/* Sum row */}
              <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                <td className="px-3 py-1.5 text-slate-700">Razem</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{sumaNetto != null ? fmtKwota(sumaNetto) : '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{sumaVat != null ? fmtKwota(sumaVat) : '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{sumaBrutto != null ? fmtKwota(sumaBrutto) : '—'}</td>
              </tr>
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
      <div className="px-5 py-3 bg-slate-50 flex items-center justify-end gap-3">
        <span className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Do zapłaty:</span>
        <span className="text-lg font-bold text-slate-800 tabular-nums">
          {fmtKwota(e.kwota_brutto)}
        </span>
      </div>
    </div>
  )
}
