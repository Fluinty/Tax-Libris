'use client'

import { FileText, Target, AlertTriangle, Car } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function ClientStats({ stats }: { stats: any }) {
  return (
    <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col h-full">
      <h2 className="text-lg font-bold text-[#1E293B] mb-4 flex items-center gap-2">
        📊 Statystyki
      </h2>
      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
          <div className="text-xs text-[#64748B] flex items-center gap-1 mb-1"><FileText className="w-3 h-3" /> Faktur w m-cu</div>
          <div className="text-xl font-bold text-[#1E293B]">{stats.invoicesMonth}</div>
        </div>
        <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
          <div className="text-xs text-[#64748B] flex items-center gap-1 mb-1"><Target className="w-3 h-3" /> Hit rate 30d</div>
          <div className="text-xl font-bold text-[#22C55E]">{stats.hitRate}%</div>
        </div>
        <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
          <div className="text-xs text-[#64748B] flex items-center gap-1 mb-1"><AlertTriangle className="w-3 h-3" /> Wyjątki pending</div>
          <div className="text-xl font-bold text-[#F59E0B]">{stats.exceptionsCount}</div>
        </div>
        <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
          <div className="text-xs text-[#64748B] flex items-center gap-1 mb-1"><Car className="w-3 h-3" /> Pojazdy</div>
          <div className="text-xl font-bold text-[#1E293B]">{stats.activePojazdyCount}</div>
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-[#E2E8F0]">
        <h3 className="text-xs font-semibold text-[#64748B] mb-4">AKTYWNOŚĆ (OSTATNIE 30 DNI)</h3>
        <div className="h-[140px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="data" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => val.split('-').slice(1).join('.')} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                labelStyle={{ fontWeight: 'bold', color: '#1E293B' }}
              />
              <Line type="monotone" dataKey="obsluzone" name="Auto" stroke="#22C55E" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="wyjatki" name="Wyjątki" stroke="#F59E0B" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
