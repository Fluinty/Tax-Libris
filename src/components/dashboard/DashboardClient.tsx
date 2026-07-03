'use client'

import { useRouter } from 'next/navigation'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  FileCheck,
  BookOpen,
  AlertTriangle,
  Activity,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ActivityChart } from './ActivityChart'
import { RecentActivityList } from './RecentActivityList'
import { WolumenKpirSection } from './WolumenKpirSection'
import { refreshDashboard } from '@/app/(auth)/dashboard/actions'
import type {
  DashboardMetrics,
  ActivityChartData,
  TopClient,
  TopRule,
  RecentActivity,
  Client,
  AutomationRateClient,
  WolumenInvoiceRecord,
} from '@/types/database'

interface Props {
  metrics: DashboardMetrics
  chartData: ActivityChartData[]
  topClients: TopClient[]
  topRules: TopRule[]
  recentActivity: RecentActivity[]
  topAutomationClients?: AutomationRateClient[]
  wolumenRecords?: WolumenInvoiceRecord[]
  kpirClientNames?: Record<string, string>
  clients: Pick<Client, 'nip' | 'nazwa'>[]
  selectedClient: string
  selectedPeriod: string
}

const periodOptions = [
  { value: '1d', label: 'Dziś' },
  { value: '7d', label: 'Ostatnie 7 dni' },
  { value: '30d', label: 'Ostatnie 30 dni' },
  { value: 'all', label: 'Cały okres' },
]

export function DashboardClient({
  metrics,
  chartData,
  topClients,
  topRules,
  recentActivity,
  topAutomationClients = [],
  wolumenRecords = [],
  kpirClientNames = {},
  clients,
  selectedClient,
  selectedPeriod,
}: Props) {
  const router = useRouter()

  const updateUrl = (overrides: Record<string, string>) => {
    const params = new URLSearchParams()
    const values = {
      client: selectedClient,
      period: selectedPeriod,
      ...overrides,
    }
    Object.entries(values).forEach(([k, v]) => {
      if (v && v !== '__all__') params.set(k, v)
    })
    router.push(`/dashboard?${params.toString()}`)
  }

  const handleRefresh = async () => {
    await refreshDashboard()
    router.refresh()
  }

  function truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
  }

  const showTrends = selectedPeriod !== 'all'

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#1E293B]">Dashboard</h1>

        <div className="flex items-center gap-3">
          <Select
            value={selectedClient || '__all__'}
            onValueChange={(v) => updateUrl({ client: !v || v === '__all__' ? '' : v })}
          >
            <SelectTrigger className="w-[180px] h-9 border-[#E2E8F0] cursor-pointer">
              <SelectValue placeholder="Klient" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Wszyscy razem</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.nip} value={c.nip}>
                  {c.nazwa}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedPeriod}
            onValueChange={(v) => updateUrl({ period: v ?? '7d' })}
          >
            <SelectTrigger className="w-[160px] h-9 border-[#E2E8F0] cursor-pointer">
              <SelectValue placeholder="Okres" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="cursor-pointer h-9"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Odśwież
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <MetricCard
          label="Hit rate"
          value={`${metrics.hitRate}%`}
          trend={showTrends ? metrics.hitRateTrend : null}
          trendSuffix="pp"
          icon={<Activity className="w-5 h-5 text-[#4A90E2]" />}
        />
        <MetricCard
          label="Automatyzacja (bm)"
          value={`${metrics.automationRate || 0}%`}
          trend={null}
          icon={<Sparkles className="w-5 h-5 text-purple-600" />}
        />
        <MetricCard
          label="Faktury obsłużone"
          value={metrics.invoicesProcessed.toLocaleString('pl-PL')}
          trend={showTrends ? metrics.invoicesTrend : null}
          icon={<FileCheck className="w-5 h-5 text-[#22C55E]" />}
        />
        <MetricCard
          label="Reguły aktywne"
          value={metrics.activeRules.toLocaleString('pl-PL')}
          trend={showTrends ? metrics.rulesTrend : null}
          trendPrefix="+"
          trendLabel="nowych"
          icon={<BookOpen className="w-5 h-5 text-[#1F3A5F]" />}
        />
        <MetricCard
          label="Wyjątki pending"
          value={metrics.pendingExceptions.toLocaleString('pl-PL')}
          trend={showTrends ? metrics.exceptionsTrend : null}
          invertColor
          icon={<AlertTriangle className="w-5 h-5 text-[#F59E0B]" />}
        />
      </div>

      {/* Top Automation Clients Table */}
      <Card className="p-6 mb-8 border-[#E2E8F0]">
        <h2 className="text-sm font-semibold text-[#1E293B] mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          Top 10 klientów wg automatyzacji (bieżący miesiąc)
        </h2>
        {topAutomationClients.length === 0 ? (
          <p className="text-sm text-[#94A3B8] text-center py-6">
            Brak automatycznych księgowań w bieżącym miesiącu
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9]">
                  <th className="text-left py-2 text-xs text-[#64748B] font-medium uppercase tracking-wider">Klient</th>
                  <th className="text-right py-2 text-xs text-[#64748B] font-medium uppercase tracking-wider">Auto</th>
                  <th className="text-right py-2 text-xs text-[#64748B] font-medium uppercase tracking-wider">Procesowalne</th>
                  <th className="text-right py-2 text-xs text-[#64748B] font-medium uppercase tracking-wider">%</th>
                </tr>
              </thead>
              <tbody>
                {topAutomationClients.map((c, i) => (
                  <tr key={i} className="border-b border-[#F8FAFC] last:border-0">
                    <td className="py-2 text-[#1E293B] font-medium">{c.klient}</td>
                    <td className="py-2 text-right tabular-nums text-purple-700 font-semibold">{c.auto.toLocaleString('pl-PL')}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{c.procesowalne.toLocaleString('pl-PL')}</td>
                    <td className="py-2 text-right tabular-nums font-bold text-[#1E293B]">{c.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Wolumen faktur (KPiR) */}
      <WolumenKpirSection records={wolumenRecords} clientNames={kpirClientNames} />

      {/* Chart */}
      {chartData.length > 0 ? (
        <Card className="p-6 mb-8 border-[#E2E8F0]">
          <h2 className="text-sm font-semibold text-[#1E293B] mb-4 flex items-center gap-2">
            📈 Aktywność w czasie
          </h2>
          <ActivityChart data={chartData} />
        </Card>
      ) : (
        <Card className="p-6 mb-8 border-[#E2E8F0] flex items-center justify-center text-[#94A3B8] text-sm h-[200px]">
          Brak danych do wykresu dla wybranego okresu
        </Card>
      )}

      {/* Top clients + Top rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Top Clients */}
        <Card className="p-6 border-[#E2E8F0]">
          <h2 className="text-sm font-semibold text-[#1E293B] mb-4">
            Top klienci
          </h2>
          {topClients.length === 0 ? (
            <p className="text-sm text-[#94A3B8] text-center py-8">
              Brak danych
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F1F5F9]">
                    <th className="text-left py-2 text-xs text-[#64748B] font-medium uppercase tracking-wider">
                      Klient
                    </th>
                    <th className="text-right py-2 text-xs text-[#64748B] font-medium uppercase tracking-wider">
                      Faktury
                    </th>
                    <th className="text-right py-2 text-xs text-[#64748B] font-medium uppercase tracking-wider">
                      Hit rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topClients.map((c, i) => (
                    <tr key={i} className="border-b border-[#F8FAFC] last:border-0">
                      <td className="py-2 text-[#1E293B] font-medium">{c.klient}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-[#1E293B]">
                        {c.obsluzone.toLocaleString('pl-PL')}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        <span
                          className={
                            c.hit_rate >= 80
                              ? 'text-[#22C55E] font-semibold'
                              : c.hit_rate >= 50
                              ? 'text-[#F59E0B] font-medium'
                              : 'text-[#EF4444] font-medium'
                          }
                        >
                          {c.hit_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Top Rules */}
        <Card className="p-6 border-[#E2E8F0]">
          <h2 className="text-sm font-semibold text-[#1E293B] mb-4">
            Top reguły
          </h2>
          {topRules.length === 0 ? (
            <p className="text-sm text-[#94A3B8] text-center py-8">
              Brak danych
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F1F5F9]">
                    <th className="text-left py-2 text-xs text-[#64748B] font-medium uppercase tracking-wider">
                      Pattern
                    </th>
                    <th className="text-left py-2 text-xs text-[#64748B] font-medium uppercase tracking-wider">
                      Opis
                    </th>
                    <th className="text-left py-2 text-xs text-[#64748B] font-medium uppercase tracking-wider">
                      Klient
                    </th>
                    <th className="text-right py-2 text-xs text-[#64748B] font-medium uppercase tracking-wider">
                      Hits
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topRules.map((r) => (
                    <tr key={r.id} className="border-b border-[#F8FAFC] last:border-0">
                      <td
                        className="py-2 text-[#1E293B] font-mono text-xs max-w-[200px] truncate"
                        title={r.pattern_pozycji}
                      >
                        {truncate(r.pattern_pozycji, 40)}
                      </td>
                      <td className="py-2 text-[#64748B]" title={r.opis_zdarzenia}>
                        {truncate(r.opis_zdarzenia, 30)}
                      </td>
                      <td className="py-2 text-[#1E293B]">{r.klient}</td>
                      <td className="py-2 text-right font-bold tabular-nums text-[#1E293B]">
                        {r.hit_count.toLocaleString('pl-PL')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="p-6 border-[#E2E8F0]">
        <h2 className="text-sm font-semibold text-[#1E293B] mb-4">
          📋 Ostatnia aktywność
        </h2>
        {recentActivity.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-[#94A3B8]">
              Brak danych dla wybranego okresu
            </p>
            <p className="text-xs text-[#CBD5E1] mt-1">
              Spróbuj wybrać dłuższy okres lub innego klienta.
            </p>
          </div>
        ) : (
          <RecentActivityList activities={recentActivity} />
        )}
      </Card>
    </div>
  )
}

// ==================== MetricCard ====================

function MetricCard({
  label,
  value,
  trend,
  trendSuffix = '',
  trendPrefix = '',
  trendLabel = '',
  invertColor = false,
  icon,
}: {
  label: string
  value: string
  trend: number | null
  trendSuffix?: string
  trendPrefix?: string
  trendLabel?: string
  invertColor?: boolean
  icon?: React.ReactNode
}) {
  const isPositive = (trend ?? 0) > 0
  const isNegative = (trend ?? 0) < 0

  // For "pending exceptions", positive = bad (more pending), negative = good
  const goodColor = invertColor
    ? isNegative
      ? 'text-[#22C55E]'
      : 'text-[#EF4444]'
    : isPositive
    ? 'text-[#22C55E]'
    : 'text-[#EF4444]'

  return (
    <Card className="p-5 border-[#E2E8F0]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[#64748B] uppercase tracking-wider">
          {label}
        </span>
        {icon}
      </div>
      <p className="text-3xl font-bold text-[#1F3A5F] tabular-nums">{value}</p>
      {trend !== null && trend !== 0 && (
        <div className={`flex items-center gap-1 mt-2 text-xs ${goodColor}`}>
          {(invertColor ? isNegative : isPositive) ? (
            <TrendingUp className="w-3.5 h-3.5" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5" />
          )}
          <span className="font-medium">
            {trendPrefix}
            {trend > 0 ? '+' : ''}
            {trend}
            {trendSuffix}
          </span>
          {trendLabel && <span className="text-[#94A3B8]">{trendLabel}</span>}
        </div>
      )}
    </Card>
  )
}
