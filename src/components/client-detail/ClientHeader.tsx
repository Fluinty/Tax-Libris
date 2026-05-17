'use client'

import { Building2, ShieldCheck, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toggleAutoWrite } from '@/app/(auth)/wyjatki/actions'
import { toast } from 'sonner'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ClientHeader({ client, isAdmin }: { client: any, isAdmin: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleToggle = async (checked: boolean) => {
    if (!isAdmin) return
    if (checked && !confirm('Czy na pewno chcesz włączyć auto-zapis dla tego klienta?')) return

    setLoading(true)
    try {
      await toggleAutoWrite(client.nip, checked)
      toast.success(checked ? 'Auto-zapis włączony' : 'Auto-zapis wyłączony')
      router.refresh()
    } catch (e) {
      toast.error('Wystąpił błąd')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6 text-[#4A90E2]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#1E293B]">{client.nazwa}</h1>
            {client.pilot && (
              <Badge className="bg-[#E0E7FF] text-[#1F3A5F] hover:bg-[#E0E7FF] border-0">Pilot</Badge>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-[#64748B]">
            <span>NIP: <span className="font-mono">{client.nip}</span></span>
            {client.nazwa_bazy_rachmistrz && (
              <span>Baza: <span className="font-medium text-[#1E293B]">{client.nazwa_bazy_rachmistrz}</span></span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 bg-[#F8FAFC] px-4 py-2 rounded-lg border border-[#E2E8F0]">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-[#64748B] tracking-wider mb-1">Status Automatyzacji</span>
          <div className="flex items-center gap-2">
            {client.auto_write_enabled ? (
              <Badge className="bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/10 border-0 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Auto
              </Badge>
            ) : (
              <Badge className="bg-[#F1F5F9] text-[#64748B] hover:bg-[#F1F5F9] border-0 flex items-center gap-1">
                <User className="w-3 h-3" /> Manual
              </Badge>
            )}
            
            {isAdmin && (
              <div className="flex items-center space-x-2 ml-4 pl-4 border-l border-[#E2E8F0]">
                <Switch 
                  id="auto_write" 
                  checked={client.auto_write_enabled} 
                  onCheckedChange={handleToggle}
                  disabled={loading}
                />
                <Label htmlFor="auto_write" className="text-xs cursor-pointer">Wymuś</Label>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
