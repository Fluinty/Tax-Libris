'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { restoreFaktura } from '@/app/(auth)/do-akceptacji/actions'
import { toast } from 'sonner'

interface Props {
  /** exceptions_queue.id — wiersz /faktury pochodzi wprost z tej tabeli. */
  queueId: number
  ksiegoweNumer: string | null
  nazwaDostawcy: string | null
  klient: string
  kwotaBrutto: number | null
  /** resolved_at — moment pominięcia (wyświetlany w podsumowaniu). */
  pominietoAt: string | null
  /** Data dokumentu — z niej wynika miesiąc księgowania, nie z daty pominięcia. */
  dataDokumentu: string | null
  /** exceptions_queue.skip_reason — ręczna adnotacja „dlaczego pominięto". */
  skipReason: string | null
}

/** Bieżący rok-miesiąc w strefie księgowej (Europe/Warsaw), format YYYY-MM. */
function biezacyOkres(): string {
  const czesci = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const rok = czesci.find(c => c.type === 'year')?.value ?? ''
  const mies = czesci.find(c => c.type === 'month')?.value ?? ''
  return `${rok}-${mies}`
}

/**
 * Czy faktura należy do wcześniejszego okresu niż bieżący miesiąc.
 * Liczone z DATY DOKUMENTU, bo to ona wyznacza miesiąc księgowania — data
 * pominięcia mówi tylko, kiedy ktoś kliknął „Pomiń" (faktura z czerwca
 * dociągnięta z KSeF i pominięta w sierpniu dawała fałszywy spokój).
 * Daty z KSeF są kalendarzowe (YYYY-MM-DD), więc porównujemy prefiks tekstowo —
 * bez konwersji przez Date, która przesuwałaby je o strefę przeglądarki.
 */
function zPoprzedniegoOkresu(dataDokumentu: string | null): boolean {
  if (!dataDokumentu || dataDokumentu.length < 7) return false
  const okres = dataDokumentu.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(okres)) return false
  return okres < biezacyOkres()
}

export function PrzywrocButton({
  queueId,
  ksiegoweNumer,
  nazwaDostawcy,
  klient,
  kwotaBrutto,
  pominietoAt,
  dataDokumentu,
  skipReason,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const stareOkresy = zPoprzedniegoOkresu(dataDokumentu)

  const handleRestore = async () => {
    setIsPending(true)
    try {
      const res = await restoreFaktura(queueId)
      if (res.success) {
        toast.success(
          res.status === 'pending'
            ? 'Przywrócono do kolejki (wymaga wyboru opisu)'
            : 'Przywrócono do kolejki'
        )
        if (res.warning) toast.warning('Uwaga', { description: res.warning })
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.error || 'Nie udało się przywrócić karty')
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się przywrócić karty')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-7 px-2 text-xs gap-1 text-[#64748B] hover:text-[#1F3A5F] hover:bg-blue-50"
        title="Przywróć tę fakturę do kolejki akceptacji"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Przywróć</span>
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Przywrócić fakturę do kolejki?</AlertDialogTitle>
            <AlertDialogDescription>
              Karta wróci na listę „Do akceptacji" i będzie czekać na decyzję księgowej.
              Przywrócenie niczego nie księguje i nie zmienia kwot ani propozycji AI.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="text-sm text-[#475569] space-y-1 rounded-md bg-slate-50 border border-slate-200 p-3">
            <div><span className="text-slate-500">Klient:</span> <span className="font-medium text-slate-800">{klient}</span></div>
            <div><span className="text-slate-500">Faktura:</span> <span className="font-mono text-slate-800">{ksiegoweNumer || '—'}</span></div>
            <div><span className="text-slate-500">Kontrahent:</span> <span className="text-slate-800">{nazwaDostawcy || '—'}</span></div>
            <div>
              <span className="text-slate-500">Kwota:</span>{' '}
              <span className="font-medium tabular-nums text-slate-800">
                {kwotaBrutto != null ? `${kwotaBrutto.toFixed(2)} zł` : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Pominięto:</span>{' '}
              <span className="text-slate-800">
                {pominietoAt ? new Date(pominietoAt).toLocaleString('pl-PL') : '—'}
              </span>
            </div>
          </div>

          {/* Powód pominięcia bywa JEDYNYM zapisem tego, że fakturę już
              zaksięgowano poza panelem (np. ręcznie w Rachmistrzu). Musi być
              widoczny PRZED kliknięciem — przywrócenie kasuje go z karty. */}
          {skipReason && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <div className="space-y-1">
                  <div className="font-semibold">Karta ma zapisany powód pominięcia:</div>
                  <div className="italic break-words">„{skipReason}"</div>
                  <div>
                    Przeczytaj go, zanim przywrócisz — jeśli faktura została już
                    zaksięgowana poza panelem, ponowne zatwierdzenie zaksięguje ją drugi raz.
                    Po przywróceniu powód znika z karty (zostaje w historii).
                  </div>
                </div>
              </div>
            </div>
          )}

          {stareOkresy && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                Faktura jest z wcześniejszego okresu ({dataDokumentu?.slice(0, 7)}). Samo
                przywrócenie jest bezpieczne, ale jej późniejsze zatwierdzenie zaksięguje
                zapis w miesiącu, który może być już zamknięty — sprawdź, zanim ją zatwierdzisz.
              </span>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={isPending}>
              {isPending ? 'Przywracam…' : 'Przywróć do kolejki'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
