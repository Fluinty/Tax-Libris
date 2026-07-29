'use client'

import { useRouter } from 'next/navigation'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RecentActivityList } from './RecentActivityList'
import { WolumenKpirSection } from './WolumenKpirSection'
import { refreshDashboard } from '@/app/(auth)/dashboard/actions'
import type {
  DashboardMetrics,
  RecentActivity,
  AutomationRateClient,
  WolumenKpirViewRow,
} from '@/types/database'

interface Props {
  metrics: DashboardMetrics
  recentActivity: RecentActivity[]
  topAutomationClients?: AutomationRateClient[]
  wolumenViewRows?: WolumenKpirViewRow[]
  kpirClientNames?: Record<string, string>
}

export function DashboardClient({
  metrics,
  recentActivity,
  topAutomationClients = [],
  wolumenViewRows = [],
  kpirClientNames = {},
}: Props) {
  const router = useRouter()

  const handleRefresh = async () => {
    await refreshDashboard()
    router.refresh()
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[#1E293B]">Dashboard</h1>

        <div className="flex items-center gap-3">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <MetricCard
          label="Automatyzacja (bm)"
          value={`${metrics.automationRate || 0}%`}
          trend={null}
          icon={<Sparkles className="w-5 h-5 text-purple-600" />}
        />
        <MetricCard
          label="Wyjątki pending"
          value={metrics.pendingExceptions.toLocaleString('pl-PL')}
          trend={metrics.exceptionsTrend}
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
      <WolumenKpirSection viewRows={wolumenViewRows} clientNames={kpirClientNames} />

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
