'use client'

import { useState } from 'react'
import {
  ChevronDown,
  History,
  FileDown,
  Sparkles,
  Pencil,
  Car,
  CheckCircle2,
  Landmark,
  Bot,
  AlertTriangle,
  Undo2,
  ExternalLink,
  RefreshCw,
  MessageSquare,
  Search,
  Inbox,
  Circle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchFakturaTimeline, type TimelineEntry } from '@/app/(auth)/do-akceptacji/actions'

interface FakturaHistoriaSectionProps {
  fakturaId?: number
  queueId?: number
}

// ── Actor po ludzku ────────────────────────────────────
function formatActor(actor: string | null): string {
  if (!actor) return 'system'
  if (actor === 'worker' || actor === 'fluinty_auto') return 'system'
  const at = actor.indexOf('@')
  return at > 0 ? actor.substring(0, at) : actor
}

// ── Czas dd.MM HH:mm ───────────────────────────────────
function formatTs(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return (
    d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  )
}

// ── Synteza diffu edycji z payload.diff ────────────────
function opisDiff(payload: any): string | null {
  if (!payload || typeof payload !== 'object' || !payload.diff || typeof payload.diff !== 'object') return null
  const parts = Object.entries(payload.diff).map(([pole, vals]: [string, any]) => {
    if (vals && typeof vals === 'object' && ('z' in vals || 'na' in vals)) {
      return `${pole}: ${vals.z ?? '–'} → ${vals.na ?? '–'}`
    }
    return `${pole}: ${typeof vals === 'object' ? JSON.stringify(vals) : String(vals)}`
  })
  return parts.length ? parts.join(', ') : null
}

// ── Semantyka: kolor kropki + ikona ────────────────────
type Semantyka = { color: string; Icon: typeof Circle }

function semantyka(eventType: string): Semantyka {
  switch (eventType) {
    case 'ksef_received':
      return { color: 'bg-slate-400', Icon: FileDown }
    case 'ai_classified':
      return { color: 'bg-slate-400', Icon: Sparkles }
    case 'card_created':
    case 'queued':
      return { color: 'bg-slate-400', Icon: Inbox }
    case 'edited':
      return { color: 'bg-amber-500', Icon: Pencil }
    case 'rezim_changed':
      return { color: 'bg-amber-500', Icon: Car }
    case 'validator_adjusted':
    case 'duplicate_flagged':
    case 'anomaly_flagged':
    case 'anomaly_detected':
      return { color: 'bg-amber-500', Icon: eventType.startsWith('anomaly') ? Search : AlertTriangle }
    case 'approved':
    case 'card_resolved':
    case 'opis_added_to_list':
    case 'rule_created':
      return { color: 'bg-emerald-500', Icon: CheckCircle2 }
    case 'booked':
      return { color: 'bg-emerald-500', Icon: Landmark }
    case 'auto_booked':
      return { color: 'bg-emerald-500', Icon: Bot }
    case 'external_booked':
      return { color: 'bg-emerald-500', Icon: ExternalLink }
    case 'booking_failed':
      return { color: 'bg-red-500', Icon: AlertTriangle }
    case 'rollback':
    case 'rollback_requested':
      return { color: 'bg-red-500', Icon: Undo2 }
    case 'reprocessed':
      return { color: 'bg-slate-400', Icon: RefreshCw }
    case 'skipped':
      return { color: 'bg-amber-500', Icon: Circle }
    case 'comment':
      return { color: 'bg-slate-400', Icon: MessageSquare }
    default:
      return { color: 'bg-slate-400', Icon: Circle }
  }
}

// ── Zdarzenie po ludzku (po polsku) ────────────────────
function zdanie(entry: TimelineEntry): string {
  const { event_type: t, payload: p } = entry
  const actor = formatActor(entry.actor)

  switch (t) {
    case 'ksef_received':
      return 'Faktura pobrana z KSeF'
    case 'card_created':
    case 'queued':
      return 'Faktura trafiła do kolejki'
    case 'ai_classified': {
      const c = p?.confidence
      return typeof c === 'number'
        ? `AI zaproponowało dekret (pewność ${Math.round(c * 100)}%)`
        : 'AI zaproponowało dekret'
    }
    case 'validator_adjusted':
      return 'Walidator skorygował klasyfikację'
    case 'duplicate_flagged':
      return 'Oznaczono jako możliwy duplikat'
    case 'anomaly_flagged':
    case 'anomaly_detected': {
      const opis = p?.szczegol || p?.opis || p?.message
      return opis ? `Wykryto anomalię: ${opis}` : 'Wykryto anomalię'
    }
    case 'edited': {
      const d = opisDiff(p)
      return d ? `${actor} poprawił(a): ${d}` : `${actor} poprawił(a) dane`
    }
    case 'rezim_changed': {
      const z = p?.z ?? 'brak'
      const na = p?.na ?? 'brak'
      return p?.z != null || p?.na != null
        ? `Zmieniono reżim pojazdowy: ${z} → ${na}`
        : 'Zmieniono reżim pojazdowy'
    }
    case 'approved':
    case 'card_resolved':
      return `Zatwierdzona przez ${actor}`
    case 'skipped':
      return p?.reason ? `Pominięta (${p.reason})` : 'Pominięta'
    case 'opis_added_to_list':
      return 'Dodano opis do listy klienta'
    case 'rule_created':
      return 'Utworzono regułę automatyczną'
    case 'booked': {
      const z = p?.zapis_id
      return z ? `Zaksięgowana w Rachmistrzu (zapis #${z})` : 'Zaksięgowana w Rachmistrzu'
    }
    case 'auto_booked': {
      const z = p?.zapis_id
      return z ? `Zaksięgowana automatycznie (zapis #${z})` : 'Zaksięgowana automatycznie'
    }
    case 'auto_candidate':
      return 'Kandydat do automatycznego księgowania'
    case 'booking_failed': {
      const e = p?.error || p?.message
      return e ? `Błąd księgowania: ${e}` : 'Błąd księgowania'
    }
    case 'external_booked':
      return 'Zaksięgowana ręcznie poza systemem'
    case 'rollback_requested':
      return p?.reason ? `${actor} zlecił(a) cofnięcie (${p.reason})` : `${actor} zlecił(a) cofnięcie`
    case 'rollback':
      return 'Księgowanie cofnięte'
    case 'reprocessed':
      return 'Przetworzona ponownie'
    case 'comment':
      return p?.text || p?.message || p?.opis || 'Komentarz'
    default:
      // Nieznany/przyszły typ — oś nie może się wywalić; pokazujemy surowy typ,
      // payload dostępny w rozwinięciu
      return t
  }
}

function hasPayload(p: any): boolean {
  if (p == null) return false
  if (typeof p === 'object') return Object.keys(p).length > 0
  return true
}

// ── Pojedynczy wiersz osi ──────────────────────────────
function TimelineRow({ entry, isLast }: { entry: TimelineEntry; isLast: boolean }) {
  const [open, setOpen] = useState(false)
  const { color, Icon } = semantyka(entry.event_type)
  const actor = formatActor(entry.actor)
  const expandable = hasPayload(entry.payload)

  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {/* Linia osi + kropka */}
      <div className="relative flex flex-col items-center">
        <span className={cn('mt-1 flex h-5 w-5 items-center justify-center rounded-full text-white shrink-0', color)}>
          <Icon className="h-3 w-3" />
        </span>
        {!isLast && <span className="w-px flex-1 bg-slate-200 mt-1" aria-hidden />}
      </div>

      {/* Treść */}
      <div className="min-w-0 flex-1 -mt-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] text-slate-700 leading-snug break-words">{zdanie(entry)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {formatTs(entry.ts)} · {actor}
            </p>
          </div>
          {expandable && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="shrink-0 text-slate-300 hover:text-slate-500 p-0.5"
              title="Pokaż szczegóły techniczne"
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
            </button>
          )}
        </div>

        {open && expandable && (
          <pre className="mt-1.5 text-[11px] font-mono text-slate-600 bg-slate-50 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
            {typeof entry.payload === 'object' ? JSON.stringify(entry.payload, null, 2) : String(entry.payload)}
          </pre>
        )}
      </div>
    </li>
  )
}

export function FakturaHistoriaSection({ fakturaId, queueId }: FakturaHistoriaSectionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<TimelineEntry[]>([])

  // LAZY: dane pobierane dopiero przy PIERWSZYM rozwinięciu sekcji.
  // try/finally: odrzucona obietnica (błąd sieci) nie może zostawić sekcji
  // w wiecznym „Ładowanie…" — loaded zostaje false, więc ponowne rozwinięcie
  // próbuje jeszcze raz (wzorzec jak w LearningSection).
  const handleToggle = async () => {
    const next = !isOpen
    setIsOpen(next)
    if (next && !loaded && !loading) {
      setLoading(true)
      setError(null)
      try {
        const res = await fetchFakturaTimeline({ fakturaId, queueId })
        if (res.error) {
          setError(res.error)
          setEntries([])
        } else {
          setEntries(res.entries)
        }
        setLoaded(true)
      } catch {
        setError('Błąd połączenia z serwerem — zwiń i rozwiń sekcję, aby spróbować ponownie')
        setEntries([])
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden shadow-sm border-slate-200 mt-3">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-slate-500 shrink-0">
            <History className="w-4 h-4" />
          </span>
          <span className="text-[13px] font-semibold text-slate-700 truncate">Historia</span>
          {loaded && !error && entries.length > 0 && (
            <span className="shrink-0 text-[11px] font-medium text-slate-400">({entries.length})</span>
          )}
        </div>
        <ChevronDown
          className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ml-2', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div className="p-3 border-t border-slate-200">
          {loading && <p className="text-[13px] text-slate-400 py-2">Ładowanie historii…</p>}

          {!loading && error && (
            <p className="text-[13px] text-red-600 py-2">{error}</p>
          )}

          {!loading && !error && loaded && entries.length === 0 && (
            <p className="text-[13px] text-slate-400 py-2">Brak zapisanych zdarzeń dla tej faktury.</p>
          )}

          {!loading && !error && entries.length > 0 && (
            <ul className="relative">
              {entries.map((e, i) => (
                <TimelineRow key={e.key} entry={e} isLast={i === entries.length - 1} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
