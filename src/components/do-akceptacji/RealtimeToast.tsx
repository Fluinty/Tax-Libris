'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface RealtimeToastProps {
  currentPendingCount: number
}

export function RealtimeToast({ currentPendingCount }: RealtimeToastProps) {
  const [prevCount, setPrevCount] = useState(currentPendingCount)
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    if (currentPendingCount > prevCount) {
      const diff = currentPendingCount - prevCount
      toast.info(`Fluinty pre-fillował ${diff} ${diff === 1 ? 'nową fakturę' : 'nowe faktury'} — sprawdź 'Czeka na akceptację'`)
    }
    setPrevCount(currentPendingCount)
  }, [currentPendingCount, prevCount])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return
      }

      if (e.key === '?') {
        setShowShortcuts(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Skróty klawiszowe</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center justify-between p-2 rounded bg-slate-50">
              <span className="font-mono bg-white px-2 py-1 rounded border shadow-sm">↑ / ↓</span>
              <span className="text-slate-600">Nawigacja</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-50">
              <span className="font-mono bg-white px-2 py-1 rounded border shadow-sm">Enter</span>
              <span className="text-slate-600">Zatwierdź</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-50">
              <span className="font-mono bg-white px-2 py-1 rounded border shadow-sm">E</span>
              <span className="text-slate-600">Edytuj kwoty</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-50">
              <span className="font-mono bg-white px-2 py-1 rounded border shadow-sm">Esc</span>
              <span className="text-slate-600">Pomiń fakturę</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
