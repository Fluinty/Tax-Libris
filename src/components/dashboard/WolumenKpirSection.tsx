'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { FileText, BookCheck, Sparkles, Clock } from 'lucide-react'
import type { WolumenKpirViewRow } from '@/types/database'

type PeriodTab = 'today' | 'week' | 'month' | 'all'

interface ClientNameMap {
  [nip: string]: string
}

interface Props {
  viewRows: WolumenKpirViewRow[]
  clientNames: ClientNameMap
}

const PERIOD_TABS: { id: PeriodTab; label: string }[] = [
  { id: 'today', label: 'Dziś' },
  { id: 'week', label: '7 dni' },
  { id: 'month', label: '30 dni' },
  { id: 'all', label: 'Łącznie' },
]

function pickPeriod(row: WolumenKpirViewRow, period: PeriodTab) {
  const suffix = period === 'today' ? '_dzis' : period === 'week' ? '_tydzien' : period === 'month' ? '_miesiac' : '_total'
  return {
    nowe: Number(row[`nowe${suffix}` as keyof WolumenKpirViewRow]) || 0,
    reczne: Number(row[`reczne${suffix}` as keyof WolumenKpirViewRow]) || 0,
    auto: Number(row[`auto${suffix}` as keyof WolumenKpirViewRow]) || 0,
    externalBooked: Number(row[`ext${suffix}` as keyof WolumenKpirViewRow]) || 0,
    czekajace: Number(row.czekajace) || 0, // always current snapshot
  }
}

export function WolumenKpirSection({ viewRows, clientNames }: Props) {
  const [activePeriod, setActivePeriod] = useState<PeriodTab>('today')

  const { totals, clientRows } = useMemo(() => {
    const totalAcc = { nowe: 0, reczne: 0, auto: 0, czekajace: 0, externalBooked: 0 }
    const rows: { nip: string; nazwa: string; nowe: number; reczne: number; auto: number; czekajace: number; externalBooked: number }[] = []

    for (const row of viewRows) {
      const p = pickPeriod(row, activePeriod)
      totalAcc.nowe += p.nowe
      totalAcc.reczne += p.reczne
      totalAcc.auto += p.auto
      totalAcc.czekajace += p.czekajace
      totalAcc.externalBooked += p.externalBooked

      if (p.nowe > 0 || p.reczne > 0 || p.auto > 0 || p.czekajace > 0) {
        rows.push({
          nip: row.client_nip,
          nazwa: clientNames[row.client_nip] ?? row.client_nip,
          ...p,
        })
      }
    }

    rows.sort((a, b) => b.nowe - a.nowe)

    return { totals: totalAcc, clientRows: rows }
  }, [viewRows, clientNames, activePeriod])

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
