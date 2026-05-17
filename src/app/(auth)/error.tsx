'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Auth page error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-16 h-16 rounded-full bg-[#FEF2F2] flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-[#EF4444]" />
      </div>
      <h1 className="text-xl font-bold text-[#1E293B] mb-2">
        Coś poszło nie tak
      </h1>
      <p className="text-sm text-[#64748B] mb-6 max-w-md text-center">
        Wystąpił nieoczekiwany błąd. Spróbuj odświeżyć stronę.
      </p>
      <Button
        onClick={reset}
        variant="outline"
        className="cursor-pointer"
      >
        <RotateCcw className="w-4 h-4 mr-2" />
        Spróbuj ponownie
      </Button>
    </div>
  )
}
