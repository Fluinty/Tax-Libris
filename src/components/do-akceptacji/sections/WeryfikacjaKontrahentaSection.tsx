'use client'

import { Badge } from '@/components/ui/badge'
import { CollapsibleJpkSection } from './CollapsibleJpkSection'
import { Shield, CheckCircle2, AlertTriangle, XCircle, Clock, Copy, CalendarX } from 'lucide-react'
import type { ExceptionWithClient } from '@/types/database'

interface Props {
  exception: ExceptionWithClient
}

function StatusIcon({ status }: { status: 'ok' | 'warn' | 'error' | 'pending' }) {
  if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
  if (status === 'warn') return <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
  if (status === 'error') return <XCircle className="w-4 h-4 text-red-600 shrink-0" />
  return <Clock className="w-4 h-4 text-slate-400 shrink-0" />
}

function getOverallStatus(e: ExceptionWithClient): 'ok' | 'warn' | 'error' | 'pending' {
  if (e.vendor_vat_active === false) return 'error'
  if (e.date_anomaly === 'future') return 'error'
  if (e.is_potential_duplicate || e.vendor_first_occurrence || e.date_anomaly === 'too_old') return 'warn'
  if (e.vendor_vat_active === null || e.vendor_vat_active === undefined) return 'pending'
  return 'ok'
}

function getBadge(status: 'ok' | 'warn' | 'error' | 'pending', e: ExceptionWithClient) {
  if (status === 'error') {
    if (e.vendor_vat_active === false) return <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px] h-5">🔴 NIEAKTYWNY VAT!</Badge>
    if (e.date_anomaly === 'future') return <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px] h-5">🔴 Anomalia daty</Badge>
    return <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px] h-5">🔴 Problem</Badge>
  }
  if (status === 'warn') {
    if (e.vendor_first_occurrence) return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px] h-5">⚠ Nowy kontrahent</Badge>
    if (e.is_potential_duplicate) return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px] h-5">⚠ Możliwy duplikat</Badge>
    return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px] h-5">⚠ Do sprawdzenia</Badge>
  }
  if (status === 'pending') return <Badge variant="outline" className="text-[10px] h-5 text-slate-500">⏳ Niesprawdzony</Badge>
  return <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px] h-5">✓ OK</Badge>
}

function RachunekRow({ exception }: Props) {
  const status = exception.rachunek_match_status;
  const reason = exception.rachunek_match_reason;
  const rachunek = exception.rachunek_z_faktury;
  
  if (!status) return null;

  // Format rachunku: "12 3456 7890 1234 5678 9012 3456" (4 cyfry + spacje)
  const formatRachunek = (rb: string) => {
    if (!rb) return '';
    return rb.replace(/(.{2})(.{4})(.{4})(.{4})(.{4})(.{4})(.{4})/, '$1 $2 $3 $4 $5 $6 $7');
  };
  
  // Style wg statusu
  const styles: Record<string, {icon: string, color: string, bg: string}> = {
    ok: { icon: '✅', color: 'text-green-700', bg: 'bg-green-50' },
    wirtualny_match: { icon: '✅', color: 'text-green-700', bg: 'bg-green-50' },
    mismatch: { icon: '🔴', color: 'text-red-700', bg: 'bg-red-50 border border-red-300' },
    no_account_in_invoice: { icon: 'ℹ️', color: 'text-slate-600', bg: 'bg-slate-50' },
    below_threshold: { icon: 'ℹ️', color: 'text-slate-600', bg: 'bg-slate-50' },
    skip_foreign: { icon: 'ℹ️', color: 'text-slate-600', bg: 'bg-slate-50' },
    error: { icon: '⚠️', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  };
  const s = styles[status] || styles.error;
  
  return (
    <div className={`flex items-start gap-2 p-2 mt-2 rounded ${s.bg}`}>
      <span aria-hidden="true" className="shrink-0">{s.icon}</span>
      <div className="flex-1">
        <div className={`font-medium text-xs ${s.color}`}>
          Rachunek bankowy {status === 'mismatch' ? '— NIEZGODNY' : status === 'ok' || status === 'wirtualny_match' ? '— zgodny' : ''}
        </div>
        {rachunek && (
          <div className="text-xs text-slate-500 font-mono mt-0.5">
            {formatRachunek(rachunek)}
          </div>
        )}
        <div className="text-xs text-slate-700 mt-1">{reason}</div>
        {status === 'mismatch' && (
          <div className="text-[10px] text-red-600 mt-1">
            ⚠️ Płatność na rachunek spoza Białej Listy → utrata prawa do zaliczenia w koszty + 30% sankcja VAT.
            Klient powinien skontaktować się ze sprzedawcą lub zgłosić do US w 7 dni od płatności.
          </div>
        )}
      </div>
    </div>
  );
}

export function WeryfikacjaKontrahentaSection({ exception: e }: Props) {
  const status = getOverallStatus(e)
  const defaultOpen = status === 'error' || status === 'warn'

  const formatDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('pl-PL') : '—'
  const formatDateTime = (d: string | null | undefined) => d ? new Date(d).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null

  return (
    <CollapsibleJpkSection
      title="Weryfikacja kontrahenta i dokumentu"
      badge={getBadge(status, e)}
      defaultOpen={defaultOpen}
      icon={<Shield className="w-4 h-4" />}
    >
      <div className="space-y-4 text-sm">
        {/* KSeF */}
        <div>
          <div className="text-xs font-medium text-slate-500 uppercase mb-1.5 flex items-center gap-1.5">📄 Numer KSeF</div>
          {e.numer_ksef ? (
            <div className="space-y-1">
              <div className="font-mono text-xs text-slate-700 bg-slate-50 px-2 py-1 rounded">{e.numer_ksef}</div>
              <div className="flex items-center gap-1.5"><StatusIcon status="ok" /><span className="text-green-700">Faktura ujęta w KSeF</span></div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5"><StatusIcon status="warn" /><span className="text-yellow-700">BFK — Brak Faktury KSeF</span></div>
          )}
        </div>

        <div className="border-t border-slate-100" />

        {/* Sprzedawca / Nabywca */}
        <div>
          <div className="text-xs font-medium text-slate-500 uppercase mb-1.5 flex items-center gap-1.5">
            🏢 {e.typ_dokumentu === 'sprzedaz' ? 'Nabywca' : 'Sprzedawca'}
          </div>
          <div className="font-medium text-slate-800 mb-1">{e.nazwa_dostawcy || 'Nieznany'}</div>
          <div className="text-slate-500 text-xs mb-2">NIP: {e.nip_dostawcy || 'brak'}</div>

          {e.typ_dokumentu !== 'sprzedaz' && (
            <>
              {/* VAT status */}
              {e.vendor_vat_active === true && (
                <div className="flex items-center gap-1.5 mb-1">
                  <StatusIcon status="ok" />
                  <span className="text-green-700">Czynny VAT</span>
                  {e.vendor_vat_checked_at && <span className="text-slate-400 text-xs">(sprawdzono: {formatDateTime(e.vendor_vat_checked_at)})</span>}
                </div>
              )}
              {e.vendor_vat_active === false && (
                <div className="bg-red-50 border border-red-200 rounded-md p-2 mb-1">
                  <div className="flex items-center gap-1.5 text-red-800 font-medium"><StatusIcon status="error" />Sprzedawca NIE jest czynnym podatnikiem VAT!</div>
                  <div className="text-red-700 text-xs mt-1">⚠ Faktura nie daje prawa do odliczenia VAT</div>
                  <a href="https://ppuslugi.mf.gov.pl/_/" target="_blank" rel="noopener noreferrer" className="text-xs text-red-600 hover:underline mt-1 inline-block">Sprawdź na białej liście MF →</a>
                </div>
              )}
              {(e.vendor_vat_active === null || e.vendor_vat_active === undefined) && (
                <div className="flex items-center gap-1.5 mb-1"><StatusIcon status="pending" /><span className="text-slate-500">Status VAT: niesprawdzony</span></div>
              )}

              {/* First occurrence */}
              {e.vendor_first_occurrence ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 mt-1">
                  <div className="flex items-center gap-1.5 text-yellow-800 font-medium"><StatusIcon status="warn" />Pierwsze wystąpienie tego sprzedawcy</div>
                  <div className="text-yellow-700 text-xs mt-1">To pierwsza faktura od tego NIPu dla tego klienta. Zweryfikuj przed akceptacją.</div>
                </div>
              ) : e.vendor_invoice_count ? (
                <div className="flex items-center gap-1.5"><StatusIcon status="ok" /><span className="text-green-700">Znany kontrahent ({e.vendor_invoice_count} wcześniejszych faktur)</span></div>
              ) : null}

              {/* Rachunek Bankowy */}
              {e.rachunek_match_status && <RachunekRow exception={e} />}
            </>
          )}
        </div>

        <div className="border-t border-slate-100" />

        {/* Daty */}
        <div>
          <div className="text-xs font-medium text-slate-500 uppercase mb-1.5 flex items-center gap-1.5">📅 Daty</div>
          {(() => {
            // Próbuj: ddk_data.dataDokumentu → data_wystawienia → created_at
            const dataWystawienia = e.ddk_data?.dataDokumentu ?? e.data_wystawienia ?? null
            // Próbuj: pozycje_xml_full[0].dataSprzedazy → ddk_data.dataSprzedazy → data_sprzedazy
            const dataSprzedazy = e.pozycje_xml_full?.[0]?.dataSprzedazy ?? e.ddk_data?.dataSprzedazy ?? e.data_sprzedazy ?? null
            return (
              <div className="grid grid-cols-[120px_1fr] gap-1 text-xs mb-2">
                <span className="text-slate-500">Data wystawienia:</span>
                <span className="text-slate-800">{formatDate(dataWystawienia)}</span>
                <span className="text-slate-500">Data sprzedaży:</span>
                <span className="text-slate-800">{formatDate(dataSprzedazy)}</span>
              </div>
            )
          })()}
          {!e.date_anomaly ? (
            <div className="flex items-center gap-1.5"><StatusIcon status="ok" /><span className="text-green-700">Daty w normie</span></div>
          ) : e.date_anomaly === 'future' ? (
            <div className="bg-red-50 border border-red-200 rounded-md p-2">
              <div className="flex items-center gap-1.5 text-red-800 font-medium"><CalendarX className="w-4 h-4 shrink-0" />Anomalia daty: faktura z PRZYSZŁOŚCI</div>
              <div className="text-red-700 text-xs mt-1">Sprawdź czy data nie jest błędna.</div>
            </div>
          ) : e.date_anomaly === 'too_old' ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2">
              <div className="flex items-center gap-1.5 text-yellow-800 font-medium"><CalendarX className="w-4 h-4 shrink-0" />Faktura starsza niż 90 dni</div>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2">
              <div className="flex items-center gap-1.5 text-yellow-800 font-medium"><CalendarX className="w-4 h-4 shrink-0" />Anomalia daty: {e.date_anomaly}</div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100" />

        {/* Duplikaty */}
        <div>
          <div className="text-xs font-medium text-slate-500 uppercase mb-1.5 flex items-center gap-1.5">🔁 Duplikaty</div>
          {e.is_potential_duplicate ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2">
              <div className="flex items-center gap-1.5 text-yellow-800 font-medium"><Copy className="w-4 h-4 shrink-0" />Możliwy duplikat</div>
              <div className="text-yellow-700 text-xs mt-1">Podobna faktura już zaksięgowana{e.duplicate_of_zapis_id ? ` (zapis #${e.duplicate_of_zapis_id})` : ''}</div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5"><StatusIcon status="ok" /><span className="text-green-700">Brak podobnych faktur w księdze</span></div>
          )}
        </div>
      </div>
    </CollapsibleJpkSection>
  )
}
