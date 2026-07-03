'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { FileText, BookCheck, Sparkles, Clock } from 'lucide-react'
import type { WolumenInvoiceRecord } from '@/types/database'

type PeriodTab = 'today' | 'week' | 'month' | 'all'

interface ClientNameMap {
  [nip: string]: string
}

interface Props {
  records: WolumenInvoiceRecord[]
  clientNames: ClientNameMap
}

const PERIOD_TABS: { id: PeriodTab; label: string }[] = [
  { id: 'today', label: 'Dziś' },
  { id: 'week', label: '7 dni' },
  { id: 'month', label: '30 dni' },
  { id: 'all', label: 'Łącznie' },
]

/**
 * Compute calendar-based period boundaries in Europe/Warsaw timezone.
 *
 * Dziś     = od północy Warsaw time
 * 7 dni    = bieżący tydzień kalendarzowy (poniedziałek 00:00 → teraz)
 * 30 dni   = bieżący miesiąc (1. dnia 00:00 → teraz)
 * Łącznie  = bez ograniczeń
 */
function getPeriodStart(tab: PeriodTab): Date | null {
  if (tab === 'all') return null

  // Get Warsaw "now" as local components
  const nowWarsaw = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Warsaw' })
  )

  if (tab === 'today') {
    nowWarsaw.setHours(0, 0, 0, 0)
    return nowWarsaw
  }
  if (tab === 'week') {
    // Monday 00:00 of this calendar week
    const day = nowWarsaw.getDay() // 0=Sun .. 6=Sat
    const diff = day === 0 ? 6 : day - 1 // days since Monday
    nowWarsaw.setDate(nowWarsaw.getDate() - diff)
    nowWarsaw.setHours(0, 0, 0, 0)
    return nowWarsaw
  }
  if (tab === 'month') {
    nowWarsaw.setDate(1)
    nowWarsaw.setHours(0, 0, 0, 0)
    return nowWarsaw
  }
  return null
}

/** Parse a timestamp to Warsaw local Date for comparison */
function toWarsawDate(iso: string): Date {
  return new Date(
    new Date(iso).toLocaleString('en-US', { timeZone: 'Europe/Warsaw' })
  )
}

interface Aggregated {
  nowe: number
  reczne: number
  auto: number
  czekajace: number // always current, ignores period
  externalBooked: number
}

function aggregate(
  records: WolumenInvoiceRecord[],
  periodStart: Date | null
): { totals: Aggregated; perClient: Map<string, Aggregated> } {
  const perClient = new Map<string, Aggregated>()

  const ensure = (nip: string): Aggregated => {
    let a = perClient.get(nip)
    if (!a) {
      a = { nowe: 0, reczne: 0, auto: 0, czekajace: 0, externalBooked: 0 }
      perClient.set(nip, a)
    }
    return a
  }

  for (const r of records) {
    const c = ensure(r.client_nip)

    // Czekające — current snapshot, always counted (no period filter)
    if (r.status === 'pending' || r.status === 'pending_review') {
      c.czekajace++
    }

    // Nowe — created_at in period, status != 'skipped'
    if (r.status !== 'skipped') {
      const createdWhen = toWarsawDate(r.created_at)
      if (!periodStart || createdWhen >= periodStart) {
        c.nowe++
      }
    }

    // Zaksięgowane (ręcznie / auto) — status='auto_created', wg auto_created_at
    if (r.status === 'auto_created' && r.auto_created_at) {
      const bookedWhen = toWarsawDate(r.auto_created_at)
      if (!periodStart || bookedWhen >= periodStart) {
        if (r.resolved_by === 'fluinty_auto') {
          c.auto++
        } else {
          c.reczne++
        }
      }
    }

    // external_booked — poza panelem
    if (r.status === 'external_booked') {
      if (r.auto_created_at) {
        const bookedWhen = toWarsawDate(r.auto_created_at)
        if (!periodStart || bookedWhen >= periodStart) {
          c.externalBooked++
        }
      } else {
        const createdWhen = toWarsawDate(r.created_at)
        if (!periodStart || createdWhen >= periodStart) {
          c.externalBooked++
        }
      }
    }
  }

  // Sum totals
  const totals: Aggregated = { nowe: 0, reczne: 0, auto: 0, czekajace: 0, externalBooked: 0 }
  for (const a of perClient.values()) {
    totals.nowe += a.nowe
    totals.reczne += a.reczne
    totals.auto += a.auto
    totals.czekajace += a.czekajace
    totals.externalBooked += a.externalBooked
  }

  return { totals, perClient }
}

export function WolumenKpirSection({ records, clientNames }: Props) {
  const [activePeriod, setActivePeriod] = useState<PeriodTab>('today')

  const { totals, clientRows } = useMemo(() => {
    const periodStart = getPeriodStart(activePeriod)
    const { totals: t, perClient } = aggregate(records, periodStart)

    // Build sorted rows (only clients with any nonzero value)
    const rows = Array.from(perClient.entries())
      .filter(([, a]) => a.nowe > 0 || a.reczne > 0 || a.auto > 0 || a.czekajace > 0)
      .map(([nip, a]) => ({
        nip,
        nazwa: clientNames[nip] ?? nip,
        ...a,
      }))
      .sort((a, b) => b.nowe - a.nowe)

    return { totals: t, clientRows: rows }
  }, [records, clientNames, activePeriod])

  const tiles = [
    {
      label: 'Nowe faktury',
      value: totals.nowe,
      icon: <FileText className="w-5 h-5 text-[#4A90E2]" />,
      color: 'text-[#4A90E2]',
    },
    {
      label: 'Zaksięgowane ręcznie',
      value: totals.reczne,
      icon: <BookCheck className="w-5 h-5 text-[#22C55E]" />,
      color: 'text-[#22C55E]',
    },
    {
      label: 'Zaksięgowane auto',
      value: totals.auto,
      icon: <Sparkles className="w-5 h-5 text-purple-600" />,
      color: 'text-purple-600',
    },
    {
      label: 'Czekające teraz',
      value: totals.czekajace,
      icon: <Clock className="w-5 h-5 text-[#F59E0B]" />,
      color: 'text-[#F59E0B]',
    },
  ]

  return (
    <Card className="p-6 mb-8 border-[#E2E8F0]">
      {/* Header + Period Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h2 className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
          📊 Wolumen faktur (KPiR)
        </h2>
        <div className="flex items-center gap-1 bg-[#F1F5F9] rounded-lg p-0.5">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActivePeriod(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activePeriod === tab.id
                  ? 'bg-white text-[#1E293B] shadow-sm'
                  : 'text-[#64748B] hover:text-[#1E293B]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-[#64748B] uppercase tracking-wider leading-tight">
                {tile.label}
              </span>
              {tile.icon}
            </div>
            <p className="text-2xl font-bold text-[#1F3A5F] tabular-nums">
              {tile.value.toLocaleString('pl-PL')}
            </p>
          </div>
        ))}
      </div>

      {/* Per-client table */}
      {clientRows.length === 0 ? (
        <p className="text-sm text-[#94A3B8] text-center py-6">
          Brak faktur KPiR w wybranym okresie
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0]">
                <th className="text-left py-2.5 text-xs text-[#64748B] font-medium uppercase tracking-wider">
                  Klient
                </th>
                <th className="text-right py-2.5 text-xs text-[#64748B] font-medium uppercase tracking-wider">
                  Nowe
                </th>
                <th className="text-right py-2.5 text-xs text-[#64748B] font-medium uppercase tracking-wider">
                  Ręcznie
                </th>
                <th className="text-right py-2.5 text-xs text-[#64748B] font-medium uppercase tracking-wider">
                  Auto
                </th>
                <th className="text-right py-2.5 text-xs text-[#64748B] font-medium uppercase tracking-wider">
                  Czekające
                </th>
              </tr>
            </thead>
            <tbody>
              {clientRows.map((row) => (
                <tr
                  key={row.nip}
                  className="border-b border-[#F8FAFC] last:border-0 hover:bg-[#F8FAFC] transition-colors"
                >
                  <td className="py-2 text-[#1E293B] font-medium">{row.nazwa}</td>
                  <td className="py-2 text-right tabular-nums text-[#4A90E2] font-semibold">
                    {row.nowe.toLocaleString('pl-PL')}
                  </td>
                  <td className="py-2 text-right tabular-nums text-[#22C55E] font-semibold">
                    {row.reczne.toLocaleString('pl-PL')}
                  </td>
                  <td className="py-2 text-right tabular-nums text-purple-700 font-semibold">
                    {row.auto.toLocaleString('pl-PL')}
                  </td>
                  <td className="py-2 text-right tabular-nums text-[#F59E0B] font-semibold">
                    {row.czekajace.toLocaleString('pl-PL')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* external_booked annotation */}
      {totals.externalBooked > 0 && (
        <p className="text-xs text-[#94A3B8] mt-3 text-right">
          Poza panelem (external_booked): {totals.externalBooked.toLocaleString('pl-PL')}
        </p>
      )}
    </Card>
  )
}
