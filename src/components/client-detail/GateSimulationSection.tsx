'use client'

// ── „Symulacja automatu" — sekcja karty klienta ─────────────────────────────
// Retro-symulacja bramki auto-write na kartach JUŻ zakończonych: „gdyby automat
// działał od początku: zaksięgowałby N faktur, z czego X błędnie (precyzja Y%)".
// Narzędzie POMIARU przed decyzją o uzbrojeniu fali 1 — sekcja niczego nie
// zmienia. Definicje: src/lib/gate-simulation.ts; dane: fetchGateSimulation.
// Dane LAZY — strzał przy PIERWSZYM rozwinięciu (wzorzec LearningSection).

import { useState } from 'react'
import { ChevronDown, Bot, AlertTriangle, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { FakturaHistoryButton } from '@/components/do-akceptacji/sections/FakturaHistoryButton'
import {
  fetchGateSimulation,
  type GateSimulationData,
  type GateSimBadCard,
} from '@/app/(auth)/klienci/[nip]/gate-simulation-actions'

// Poniżej tej precyzji bramka wymaga zacieśnienia przed uzbrojeniem
const PROG_OSTRZEGAWCZY = 0.98

function odmiana(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one
  const d = n % 10
  const h = n % 100
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few
  return many
}
const faktur = (n: number) => odmiana(n, 'fakturę', 'faktury', 'faktur')
const kandydatow = (n: number) => odmiana(n, 'kandydat', 'kandydatów', 'kandydatów')
const zakonczonychKartach = (n: number) =>
  odmiana(n, 'zakończonej karcie', 'zakończonych kartach', 'zakończonych kartach')
const zakonczonychKart = (n: number) =>
  odmiana(n, 'zakończonej karty', 'zakończonych kart', 'zakończonych kart')

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function pct(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`
}

function zl(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(2)} zł`
}

// Pewność w polskiej notacji (0,95), obcięta do 2 miejsc — bez ogona floata
function konf(v: number | null): string {
  return v == null ? '—' : (Math.round(v * 100) / 100).toString().replace('.', ',')
}

// ── Karta błędna dla automatu ──────────────────────────
function BadCardRow({ card }: { card: GateSimBadCard }) {
  return (
    <li className="px-4 py-2.5 border-b border-[#F1F5F9] last:border-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[12px] font-semibold text-slate-700">
          {card.ksiegoweNumer || `karta #${card.queueId}`}
        </span>
        <span className="text-[12px] text-slate-500 truncate max-w-[220px]" title={card.nazwaDostawcy ?? ''}>
          {card.nazwaDostawcy || '—'}
        </span>
        <span className="text-[12px] tabular-nums text-slate-700">{zl(card.kwotaBrutto)}</span>
        <span className="text-[11px] text-slate-400">{formatDate(card.dataWystawienia)}</span>
        {card.confidence != null && (
          <span className="text-[11px] text-slate-400">pewność {konf(card.confidence)}</span>
        )}
        <FakturaHistoryButton
          queueId={card.queueId}
          ksiegoweNumer={card.ksiegoweNumer}
          nazwaDostawcy={card.nazwaDostawcy}
        />
      </div>
      {card.poprawki.length > 0 ? (
        <ul className="mt-1 pl-1 space-y-0.5">
          {card.poprawki.map((p, i) => (
            <li key={i} className="text-[12px] text-slate-600 font-mono break-words">
              {p}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[11px] text-slate-400">
          Szczegóły poprawki nie były wtedy rejestrowane (flaga edycji księgowej: tak)
        </p>
      )}
    </li>
  )
}

// ── Sekcja ─────────────────────────────────────────────
export function GateSimulationSection({ nip }: { nip: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<GateSimulationData | null>(null)
  const [showBad, setShowBad] = useState(false)

  const handleToggle = async () => {
    const next = !isOpen
    setIsOpen(next)
    if (next && !loaded && !loading) {
      setLoading(true)
      setError(null)
      try {
        const res = await fetchGateSimulation(nip)
        if (res.error || !res.data) {
          setError(res.error || 'Nieznany błąd')
          setData(null)
        } else {
          setData(res.data)
        }
        setLoaded(true)
      } catch {
        setError('Błąd połączenia z serwerem — zwiń i rozwiń sekcję, aby spróbować ponownie')
        setData(null)
      } finally {
        setLoading(false)
      }
    }
  }

  // Porownanie na wartosci ZAOKRAGLONEJ tak samo jak wyswietlana (1 miejsce
  // po przecinku w %) — inaczej przy precyzji 97,96% naglowek pokazywalby
  // „98,0%", a badge obok „ponizej 98%": dwa sprzeczne zdania w punkcie
  // decyzyjnym.
  const wymagaZaciesnienia =
    data != null &&
    data.precyzja != null &&
    Math.round(data.precyzja * 1000) / 1000 < PROG_OSTRZEGAWCZY

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <h2 className="m-0">
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={isOpen}
          className="w-full p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] transition-colors text-left flex items-center justify-between gap-2"
        >
          <span className="font-bold text-[#1E293B] flex items-center gap-2 text-sm uppercase tracking-wider">
            <Bot className="w-4 h-4 text-[#64748B]" />
            Symulacja automatu
          </span>
          <ChevronDown
            className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}
          />
        </button>
      </h2>

      {isOpen && (
        <div>
          {loading && <p className="text-[13px] text-slate-400 px-4 py-4">Ładowanie…</p>}

          {!loading && error && <p className="text-[13px] text-red-600 px-4 py-4">{error}</p>}

          {!loading && !error && data && (
            <>
              {data.warning && <p className="text-[11px] text-amber-600 px-4 pt-2">{data.warning}</p>}

              {/* T3: klient bez kart zakończonych — uczciwie, bez zer udających dane */}
              {data.totalCompleted === 0 ? (
                <p className="text-[13px] text-slate-500 px-4 py-6 text-center">
                  Ten klient nie ma jeszcze faktur zakończonych przez system — symulacja
                  nie ma na czym liczyć. Sekcja wypełni się wraz z pierwszymi księgowaniami.
                </p>
              ) : (
                <>
                  {/* Nagłówek-kompresja. Fraza „wszystkie bez poprawek" TYLKO gdy
                      czystych === przeszloby > 0 — przy kartach bez flagi edycji
                      (bezFlagi) nic o nich nie wiemy, a przy przeszloby=0 zdanie
                      „zaksięgowałby 0 faktur, wszystkie…" byłoby nonsensem. */}
                  <div className="px-4 py-3 border-b border-[#E2E8F0]">
                    <p className="text-[13px] font-semibold text-[#1E293B]">
                      Gdyby automat działał od początku: zaksięgowałby {data.przeszloby}{' '}
                      {faktur(data.przeszloby)}
                      {data.blednych > 0 && (
                        <>
                          , z czego <span className="text-red-700">{data.blednych} błędnie</span>
                        </>
                      )}
                      {data.blednych === 0 && data.przeszloby > 0 && data.czystych === data.przeszloby && (
                        <>, wszystkie bez poprawek księgowej</>
                      )}
                      {data.bezFlagi > 0 && (
                        <> (w tym {data.bezFlagi} bez danych o poprawkach)</>
                      )}
                      {data.przeszloby > 0 && data.precyzja != null && (
                        <> (precyzja {pct(data.precyzja)})</>
                      )}
                    </p>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      Bramka: pewność ≥ 0,95 · kwota ≤ {data.maxKwota} zł · zero czerwonych flag —
                      na {data.totalCompleted} {zakonczonychKartach(data.totalCompleted)}.
                      {data.czystoscOgolem != null && (
                        <>
                          {' '}Dla porównania czystość ogółem: {pct(data.czystoscOgolem)} — decyzja
                          o automacie stoi na precyzji bramki, nie na tej liczbie.
                        </>
                      )}
                    </p>
                    {wymagaZaciesnienia && (
                      <Badge className="mt-2 bg-amber-100 text-amber-800 border-0 flex items-center gap-1 w-fit">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        precyzja poniżej 98% — bramka wymaga zacieśnienia przed uzbrojeniem
                      </Badge>
                    )}
                  </div>

                  {/* Przypadek: bramka nikogo nie przepuszcza */}
                  {data.przeszloby === 0 && (
                    <p className="text-[13px] text-slate-500 px-4 py-4">
                      {data.totalCompleted === 1
                        ? 'Jedyna zakończona karta nie przeszłaby bramki'
                        : `Żadna z ${data.totalCompleted} ${zakonczonychKart(data.totalCompleted)} nie przeszłaby bramki`}{' '}
                      — automat nie zaksięgowałby u tego klienta niczego.
                    </p>
                  )}

                  {/* Lista błędnych — rozwijana */}
                  {data.blednych > 0 && (
                    <div className="border-b border-[#F1F5F9]">
                      <button
                        type="button"
                        onClick={() => setShowBad((v) => !v)}
                        aria-expanded={showBad}
                        className="w-full px-4 py-2.5 text-left flex items-center justify-between gap-2 hover:bg-[#FAFBFC]"
                      >
                        <span className="text-[12px] font-semibold text-red-700">
                          Faktury, które automat zaksięgowałby błędnie ({data.blednych})
                        </span>
                        <ChevronDown
                          className={cn('w-3.5 h-3.5 text-slate-300 transition-transform', showBad && 'rotate-180')}
                        />
                      </button>
                      {showBad && (
                        <ul>
                          {data.bledneKarty.map((c) => (
                            <BadCardRow key={c.queueId} card={c} />
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                </>
              )}

              {/* Tryb obserwatora — POZA rozgałęzieniem totalCompleted: kandydaci
                  powstają na kartach pending, więc świeży klient może mieć żywe
                  eventy zanim księgowa cokolwiek zakończy. */}
              <div className="px-4 py-2.5 flex items-center gap-2 text-[12px] text-slate-500">
                <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {data.obserwatorCount > 0 ? (
                  <span>
                    Tryb obserwatora: {data.obserwatorCount} {kandydatow(data.obserwatorCount)} od{' '}
                    {formatDate(data.obserwatorOd)} (ostatni {formatDate(data.obserwatorOstatni)}) —
                    karty, które żywa bramka wskazałaby do automatycznego księgowania.
                  </span>
                ) : (
                  <span>
                    Tryb obserwatora: brak kandydatów — żywa bramka nie wskazała jeszcze u tego
                    klienta żadnej karty.
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
