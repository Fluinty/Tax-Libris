'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { ActivityChartData } from '@/types/database'

interface Props {
  data: ActivityChartData[]
}

export function ActivityChart({ data }: Props) {
  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#F1F5F9"
            vertical={false}
          />
          <XAxis
            dataKey="data"
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={{ stroke: '#E2E8F0' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              fontSize: '13px',
            }}
            labelStyle={{ color: '#1E293B', fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ padding: 0 }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: '#64748B' }}
          />
          <Line
            type="monotone"
            dataKey="obsluzone"
            name="Obsłużone"
            stroke="#1F3A5F"
            strokeWidth={2}
            dot={{ fill: '#1F3A5F', r: 3 }}
            activeDot={{ r: 5, fill: '#1F3A5F' }}
          />
          <Line
            type="monotone"
            dataKey="wyjatki"
            name="Wyjątki"
            stroke="#F59E0B"
            strokeWidth={2}
            dot={{ fill: '#F59E0B', r: 3 }}
            activeDot={{ r: 5, fill: '#F59E0B' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
