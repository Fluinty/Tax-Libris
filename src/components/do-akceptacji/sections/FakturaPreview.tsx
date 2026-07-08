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

// ── Component ────────────────────────────────────────

export function FakturaPreview({ exception }: FakturaPreviewProps) {
  const e = exception
  const isSprzedaz = e.typ_dokumentu === 'sprzedaz'
  const pozycje = e.pozycje_xml_full
  const zapisVat = e.zapis_vat_data

  // Party resolution: for sprzedaz, client=Sprzedawca, kontrahent=Nabywca; reverse for zakup
  const sprzedawca = isSprzedaz
    ? { nazwa: e.client?.nazwa || e.client_nazwa, nip: e.client_nip }
    : { nazwa: e.nazwa_dostawcy || 'Brak danych', nip: e.nip_dostawcy || 'brak' }

  const nabywca = isSprzedaz
    ? { nazwa: e.nazwa_dostawcy || 'Brak danych', nip: e.nip_dostawcy || 'brak' }
    : { nazwa: e.client?.nazwa || e.client_nazwa, nip: e.client_nip }

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
      if (pVal(p, 'wartoscBrutto', 'wartosc_brutto')) colHasData.brutto = true
    }
  }

  const columns: { key: ColKey; label: string; align?: string }[] = [
    { key: 'lp', label: 'LP' },
    { key: 'nazwa', label: 'Nazwa towaru / usługi' },
    { key: 'ilosc', label: 'Ilość', align: 'right' },
    { key: 'jm', label: 'J.m.' },
    { key: 'cena', label: 'Cena jedn.', align: 'right' },
    { key: 'netto', label: 'Netto', align: 'right' },
    { key: 'vat', label: 'VAT %' },
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
        return v ? fmtKwota(v) : ''
      }
      default: return ''
    }
  }

  // ── VAT table ─────────────────────────────────────
  const pozycjeVat: PozycjaVAT[] = zapisVat?.pozycje_vat || []
  const sumaNetto = zapisVat?.suma_netto ?? null
  const sumaVat = zapisVat?.suma_vat ?? null
  const sumaBrutto = zapisVat?.suma_brutto ?? e.kwota_brutto

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
        </div>
        <div className="px-5 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Nabywca</div>
          <div className="font-semibold text-slate-800">{nabywca.nazwa}</div>
          <div className="text-slate-500 text-xs">NIP: {nabywca.nip}</div>
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
                    className={`px-3 py-2 font-semibold text-slate-600 uppercase text-[10px] tracking-wider whitespace-nowrap ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${col.key === 'nazwa' ? 'min-w-[140px]' : ''}`}
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
                      className={`px-3 py-1.5 ${
                        col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                      } ${col.key === 'nazwa' ? 'text-slate-800' : 'text-slate-600'}`}
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
      {pozycjeVat.length > 0 && (
        <div className="border-b border-slate-200 overflow-x-auto">
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
                  <td className="px-3 py-1.5 text-slate-600">{pv.stawka_symbol || '—'}%</td>
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

      {/* ── Footer — total ─────────────────────────── */}
      <div className="px-5 py-3 bg-slate-50 flex items-center justify-end gap-3">
        <span className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Do zapłaty:</span>
        <span className="text-lg font-bold text-slate-800 tabular-nums">
          {fmtKwota(e.kwota_brutto)}
        </span>
      </div>
    </div>
  )
}
