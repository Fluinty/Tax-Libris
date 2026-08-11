'use client'

// ── „Czego system nauczył się od księgowej" — sekcja karty klienta ──────────
// Rama narracyjna: poprawki księgowej to inwestycja, która się amortyzuje
// („N poprawek → M zasad → od tego czasu K faktur bez poprawek"), NIE rejestr
// błędów AI. Każde zdanie w UI to fakt policzalny z danych (DECISIONS) —
// „bez poprawek księgowych" zamiast „bez zmian", bo edycja_ksiegowa z definicji
// pomija opis. Dane LAZY — strzał do fetchClientLearning przy PIERWSZYM
// rozwinięciu (wzorzec FakturaHistoriaSection).

import { useState } from 'react'
import {
  ChevronDown,
  GraduationCap,
  Columns3,
  Car,
  Landmark,
  PenLine,
  Circle,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { FakturaHistoryButton } from '@/components/do-akceptacji/sections/FakturaHistoryButton'
import {
  fetchClientLearning,
  type ClientLearningData,
  type LearningRule,
  type LearningCategory,
  type LearningInvoiceRef,
} from '@/app/(auth)/klienci/[nip]/learning-actions'

// ── Odmiana liczebników ────────────────────────────────
function odmiana(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one
  const d = n % 10
  const h = n % 100
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few
  return many
}

const faktur = (n: number) => odmiana(n, 'faktura', 'faktury', 'faktur')
const poprawek = (n: number) => odmiana(n, 'poprawka', 'poprawki', 'poprawek')
const zasad = (n: number) => odmiana(n, 'trwała zasada', 'trwałe zasady', 'trwałych zasad')
const przeszlo = (n: number) => odmiana(n, 'przeszła', 'przeszły', 'przeszło')
const zakonczonych = (n: number) => odmiana(n, 'zakończona', 'zakończone', 'zakończonych')

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const CATEGORY_META: Record<LearningCategory, { label: string; Icon: typeof Circle }> = {
  kpir: { label: 'Kolumny KPiR', Icon: Columns3 },
  vat: { label: 'VAT / JPK', Icon: Landmark },
  rezim: { label: 'Reżim pojazdowy', Icon: Car },
  opis: { label: 'Styl opisów', Icon: PenLine },
  inne: { label: 'Inne', Icon: Circle },
}

// ── Lista konkretnych faktur (rozwinięcie reguły) ──────
function InvoiceList({ title, invoices, total }: { title: string; invoices: LearningInvoiceRef[]; total: number }) {
  if (invoices.length === 0) return null
  return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
        {title}
        {total > invoices.length && (
          <span className="font-normal normal-case"> (ostatnie {invoices.length} z {total})</span>
        )}
      </p>
      <ul className="space-y-0.5">
        {invoices.map((inv) => (
          <li key={inv.queueId} className="flex items-center gap-2 text-[12px] text-slate-600">
            <span className="font-mono text-slate-700">{inv.ksiegoweNumer || `karta #${inv.queueId}`}</span>
            <span className="text-slate-400">{formatDate(inv.data)}</span>
            <FakturaHistoryButton
              queueId={inv.queueId}
              ksiegoweNumer={inv.ksiegoweNumer}
              nazwaDostawcy={inv.nazwaDostawcy}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Pojedyncza reguła ──────────────────────────────────
function RuleRow({ rule }: { rule: LearningRule }) {
  const [open, setOpen] = useState(false)
  const { label, Icon } = CATEGORY_META[rule.category]
  const isOpis = rule.category === 'opis'
  // Dla stylu opisów miarą czystości jest edycja_realna (żadnych poprawek),
  // dla reszty edycja_ksiegowa (bez poprawek księgowych — opis poza miarą)
  const cleanLabel = isOpis ? 'bez żadnych poprawek' : 'bez poprawek księgowych'

  return (
    <li className={cn('px-4 py-3 border-b border-[#F1F5F9] last:border-0', isOpis && 'bg-[#FBFCFE]')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left flex items-start justify-between gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className={cn('w-3.5 h-3.5 shrink-0', isOpis ? 'text-slate-400' : 'text-[#4A90E2]')} />
            <span className={cn('font-semibold truncate max-w-[280px]', isOpis ? 'text-slate-500 text-[12px]' : 'text-[#1E293B] text-[13px]')} title={rule.supplierName}>
              {rule.supplierName}
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wide shrink-0">{label}</span>
            {rule.status === 'utrwalona' ? (
              <Badge className="bg-green-100 text-green-800 border-0 text-[10px] px-1.5 py-0">Utrwalona</Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] px-1.5 py-0" title={`Żadna faktura zakończona po ostatniej poprawce nie przeszła jeszcze ${cleanLabel}`}>
                Świeża — czeka na weryfikację
              </Badge>
            )}
          </div>
          <p className={cn('mt-1 leading-snug break-words', isOpis ? 'text-[12px] text-slate-500' : 'text-[13px] text-slate-700')}>
            {rule.sentence}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {rule.correctionsCount} {poprawek(rule.correctionsCount)}
            {rule.cleanAfterCount > 0 ? (
              <> → po poprawce z {formatDate(rule.lastCorrectionAt)} kolejne {rule.cleanAfterCount}{' '}
                {faktur(rule.cleanAfterCount)} {przeszlo(rule.cleanAfterCount)} {cleanLabel}</>
            ) : (
              <> · ostatnia {formatDate(rule.lastCorrectionAt)} — żadna kolejna faktura nie przeszła jeszcze {cleanLabel}</>
            )}
          </p>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-300 shrink-0 mt-1 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-1 pl-6">
          <InvoiceList title="Poprawione faktury" invoices={rule.correctionInvoices} total={rule.correctionCardsCount} />
          <InvoiceList title="Bez poprawek po ostatniej korekcie" invoices={rule.cleanInvoices} total={rule.cleanAfterCount} />
        </div>
      )}
    </li>
  )
}

// ── Empty state — liczony z flag kart, nie z eventów ───
function EmptyState({ data }: { data: ClientLearningData }) {
  if (data.totalCompleted === 0) {
    return (
      <p className="text-[13px] text-slate-500 px-4 py-6 text-center">
        Ten klient nie ma jeszcze zakończonych faktur w systemie — sekcja wypełni się wraz z pierwszymi księgowaniami.
      </p>
    )
  }
  if (data.editedCompleted === 0 && data.cleanCompleted === data.totalCompleted) {
    return (
      <div className="px-4 py-6 text-center">
        <Sparkles className="w-5 h-5 text-[#4A90E2] mx-auto mb-2" />
        <p className="text-[13px] font-semibold text-[#1E293B]">
          System księguje tego klienta bez poprawek księgowych od pierwszej faktury
        </p>
        <p className="text-[12px] text-slate-500 mt-1">
          {data.totalCompleted} {faktur(data.totalCompleted)}, zero zmian w kwotach, VAT i reżimie
        </p>
      </div>
    )
  }
  if (data.editedCompleted === 0) {
    // Reszta kart bez flag edycji (sprzed ich wprowadzenia) — nie insynuujemy,
    // że były poprawiane; mówimy tylko to, co policzalne
    if (data.cleanCompleted === 0) {
      return (
        <p className="text-[13px] text-slate-500 px-4 py-6 text-center">
          Brak zarejestrowanych korekt księgowej — {data.totalCompleted} {faktur(data.totalCompleted)}{' '}
          {zakonczonych(data.totalCompleted)} przed uruchomieniem szczegółowego zapisu zmian.
        </p>
      )
    }
    return (
      <p className="text-[13px] text-slate-500 px-4 py-6 text-center">
        {data.cleanCompleted} z {data.totalCompleted} {faktur(data.totalCompleted)} {przeszlo(data.cleanCompleted)} bez
        poprawek księgowych; pozostałe zakończono przed uruchomieniem zapisu flag edycji.
      </p>
    )
  }
  // Karty edytowane przed uruchomieniem szczegółowego zapisu zdarzeń (08.2026)
  return (
    <p className="text-[13px] text-slate-500 px-4 py-6 text-center">
      {data.editedCompleted} z {data.totalCompleted} {faktur(data.totalCompleted)} miało poprawki księgowej, ale ich
      szczegóły nie były wtedy jeszcze rejestrowane. Nowe poprawki będą pojawiać się tutaj automatycznie.
    </p>
  )
}

// ── Sekcja ─────────────────────────────────────────────
export function LearningSection({ nip }: { nip: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ClientLearningData | null>(null)

  // LAZY: dane pobierane dopiero przy PIERWSZYM rozwinięciu sekcji.
  // try/finally: odrzucona obietnica (błąd sieci) nie może zostawić sekcji
  // w wiecznym „Ładowanie…" — loaded zostaje false, więc ponowne rozwinięcie
  // próbuje jeszcze raz.
  const handleToggle = async () => {
    const next = !isOpen
    setIsOpen(next)
    if (next && !loaded && !loading) {
      setLoading(true)
      setError(null)
      try {
        const res = await fetchClientLearning(nip)
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

  const rulesKsiegowe = data?.rules.filter((r) => r.category !== 'opis') ?? []
  const rulesOpisy = data?.rules.filter((r) => r.category === 'opis') ?? []

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      {/* Wzorzec accordion WAI-ARIA: button WEWNĄTRZ h2 (h2 w button to
          niewalidny HTML i gubi nagłówek w nawigacji czytnika ekranu) */}
      <h2 className="m-0">
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={isOpen}
          className="w-full p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] transition-colors text-left flex items-center justify-between gap-2"
        >
          <span className="font-bold text-[#1E293B] flex items-center gap-2 text-sm uppercase tracking-wider">
            <GraduationCap className="w-4 h-4 text-[#64748B]" />
            Czego system nauczył się od księgowej
          </span>
          <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200', isOpen && 'rotate-180')} />
        </button>
      </h2>

      {isOpen && (
        <div>
          {loading && <p className="text-[13px] text-slate-400 px-4 py-4">Ładowanie…</p>}

          {!loading && error && <p className="text-[13px] text-red-600 px-4 py-4">{error}</p>}

          {!loading && !error && data && (
            <>
              {data.warning && (
                <p className="text-[11px] text-amber-600 px-4 pt-2">{data.warning}</p>
              )}

              {data.rules.length === 0 && <EmptyState data={data} />}

              {data.rules.length > 0 && (
                <>
                  {/* Nagłówek-kompresja: inwestycja → efekt */}
                  <div className="px-4 py-3 border-b border-[#E2E8F0]">
                    <p className="text-[13px] font-semibold text-[#1E293B]">
                      {data.totalCorrections} {poprawek(data.totalCorrections)} księgowej → {data.rulesCount}{' '}
                      {zasad(data.rulesCount)}
                    </p>
                    {data.cleanAfterTotal > 0 && (
                      <p className="text-[12px] text-slate-500 mt-0.5">
                        od ostatnich poprawek {data.cleanAfterTotal} {faktur(data.cleanAfterTotal)}{' '}
                        {przeszlo(data.cleanAfterTotal)} bez poprawek księgowych
                      </p>
                    )}
                  </div>

                  <ul>
                    {rulesKsiegowe.map((r) => (
                      <RuleRow key={`${r.supplierKey}|${r.category}`} rule={r} />
                    ))}
                  </ul>

                  {rulesOpisy.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-[#FBFCFE] border-t border-b border-[#F1F5F9]">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                          Styl opisów <span className="font-normal normal-case">— nie wpływa na KPiR ani VAT</span>
                        </p>
                      </div>
                      <ul>
                        {rulesOpisy.map((r) => (
                          <RuleRow key={`${r.supplierKey}|${r.category}`} rule={r} />
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
