import { AlertTriangle } from 'lucide-react'

/**
 * Komunikat awarii ODCZYTU strony (AUDIT §2: „awaria bazy = puste UI zamiast
 * komunikatu"). Renderowany server-side zamiast treści strony — CELOWO nie
 * przez `throw`: Next w produkcji MASKUJE message serwerowych wyjątków
 * (error boundary widzi tylko digest), a konwencja CLAUDE.md wymaga
 * komunikatu wskazującego tabelę i przyczynę.
 */
export function BladOdczytu({ tabela, message }: { tabela: string; message?: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4">
      <div className="w-14 h-14 rounded-full bg-[#FEF2F2] flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7 text-[#EF4444]" />
      </div>
      <h1 className="text-lg font-bold text-[#1E293B] mb-1">Błąd odczytu danych</h1>
      <p className="text-sm text-[#64748B] max-w-md text-center">
        Nie udało się odczytać danych z tabeli <span className="font-mono font-semibold">{tabela}</span>.
        {message ? <> Przyczyna: <span className="font-mono">{message}</span>.</> : null}
        {' '}Odśwież stronę; jeśli błąd się powtarza, zgłoś go z tym komunikatem.
      </p>
    </div>
  )
}
