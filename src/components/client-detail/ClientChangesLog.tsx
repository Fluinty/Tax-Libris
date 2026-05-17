'use client'

import { Clock } from 'lucide-react'

export function ClientChangesLog({ logs }: { logs: any[] }) {
  if (!logs || logs.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <h2 className="font-bold text-[#1E293B] flex items-center gap-2 text-sm uppercase tracking-wider">
          <Clock className="w-4 h-4 text-[#64748B]" />
          Ostatnie zmiany danych
        </h2>
      </div>
      <div className="p-0">
        <div className="max-h-[300px] overflow-y-auto no-scrollbar">
          <table className="w-full text-xs">
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3 text-[#64748B] whitespace-nowrap w-[150px]">
                    {new Date(log.changed_at).toLocaleString('pl-PL')}
                  </td>
                  <td className="px-4 py-3 font-medium text-[#1E293B] w-[150px]">
                    {log.field_name}
                  </td>
                  <td className="px-4 py-3 text-[#64748B]">
                    <div className="flex items-center gap-2">
                      <span className="line-through opacity-70 truncate max-w-[150px] block" title={log.old_value || 'brak'}>
                        {log.old_value || 'brak'}
                      </span>
                      <span className="text-[#94A3B8]">→</span>
                      <span className="text-[#1E293B] font-medium truncate max-w-[200px] block" title={log.new_value || 'brak'}>
                        {log.new_value || 'brak'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-[#64748B] truncate w-[150px]" title={log.changed_by}>
                    {log.changed_by}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
