import { PartyPopper, Sparkles } from 'lucide-react'

interface Props {
  typ?: string
}

export function EmptyState({ typ }: Props) {
  const isSprzedaz = typ === 'sprzedaz'

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-[#ECFDF5] flex items-center justify-center mb-4">
        {isSprzedaz ? (
          <Sparkles className="w-8 h-8 text-[#22C55E]" />
        ) : (
          <PartyPopper className="w-8 h-8 text-[#22C55E]" />
        )}
      </div>
      <h2 className="text-xl font-semibold text-[#1E293B] mb-2">
        {isSprzedaz
          ? 'Brak wyjątków sprzedażowych'
          : 'Brak wyjątków zakupowych'}
      </h2>
      <p className="text-sm text-[#64748B] max-w-sm">
        {isSprzedaz
          ? 'Automat ogarnia wszystkie faktury sprzedażowe ✨'
          : 'Wszystko zaksięgowane — automat poradził sobie ze wszystkimi pozycjami! 🎉'}
      </p>
    </div>
  )
}
