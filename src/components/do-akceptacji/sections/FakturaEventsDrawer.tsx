'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { fetchFakturaEvents } from '@/app/(auth)/do-akceptacji/actions'

// ── Event type labels (Polish) ──────────────────────────────────
const EVENT_LABELS: Record<string, string> = {
  ksef_received: 'Odebrano z KSeF',
  ai_classified: 'AI sklasyfikowało fakturę',
  validator_adjusted: 'Walidator skorygował klasyfikację',
  anomaly_flagged: 'Wykryto anomalię',
  duplicate_flagged: 'Oznaczono jako potencjalny duplikat',
  queued: 'Przekazano do akceptacji',
  edited: 'Księgowa zmieniła dane',
  approved: 'Zatwierdzono do księgowania',
  skipped: 'Pominięto',
  rezim_changed: 'Zmieniono reżim pojazdowy',
  opis_added_to_list: 'Dodano opis do listy klienta',
  rule_created: 'Utworzono regułę automatyczną',
  booked: 'Zaksięgowano w Rachmistrzu',
  auto_booked: 'Zaksięgowano automatycznie',
  booking_failed: 'Błąd księgowania',
  external_booked: 'Zaksięgowano z zewnątrz',
  rollback: 'Wycofano zapis',
  reprocessed: 'Przetworzono ponownie',
  comment: 'Komentarz',
}

// ── Color mapping ──────────────────────────────────────
function getDotColor(eventType: string): string {
  switch (eventType) {
    case 'booked':
    case 'auto_booked':
    case 'external_booked':
      return 'bg-emerald-500'
    case 'approved':
    case 'edited':
    case 'rezim_changed':
    case 'opis_added_to_list':
      return 'bg-blue-500'
    case 'validator_adjusted':
    case 'anomaly_flagged':
    case 'duplicate_flagged':
    case 'skipped':
      return 'bg-amber-500'
    case 'booking_failed':
    case 'rollback':
      return 'bg-red-500'
    default:
      return 'bg-slate-400'
  }
}

// ── Actor display ──────────────────────────────────────
function formatActor(actor: string | null): string {
  if (!actor) return 'system'
  if (actor === 'worker' || actor === 'fluinty_auto') return 'system'
  const atIdx = actor.indexOf('@')
  return atIdx > 0 ? actor.substring(0, atIdx) : actor
}

// ── Payload description builder ────────────────────────
function buildPayloadDescription(eventType: string, payload: any): string | null {
  if (!payload) return null
  
  switch (eventType) {
    case 'booked':
    case 'auto_booked':
      return payload.zapis_id ? `Zapis #${payload.zapis_id}` : null
    case 'ai_classified':
      return [
        payload.opis && `Opis: ${payload.opis}`,
        payload.confidence != null && `Pewność: ${Math.round(payload.confidence * 100)}%`,
      ].filter(Boolean).join(' · ') || null
    case 'edited':
      if (payload.diff && typeof payload.diff === 'object') {
        return Object.entries(payload.diff)
          .map(([pole, vals]: [string, any]) => `${pole}: ${vals.z ?? '–'} → ${vals.na ?? '–'}`)
          .join(', ')
      }
      return null
    case 'rezim_changed':
      return payload.z != null || payload.na != null
        ? `${payload.z ?? 'brak'} → ${payload.na ?? 'brak'}`
        : null
    case 'booking_failed':
      return payload.error || payload.message || null
    case 'skipped':
      return payload.reason || null
    case 'approved':
      return payload.opis || null
    default:
      return null
  }
}

// ── Diff renderer ──────────────────────────────────────
function DiffDetails({ payload }: { payload: any }) {
  if (!payload || typeof payload !== 'object') return null

  return (
    <div className="mt-1.5 text-xs font-mono text-slate-600 bg-slate-50 rounded-md p-2 space-y-0.5 max-h-40 overflow-auto">
      {Object.entries(payload).map(([key, value]) => (
        <div key={key} className="flex gap-1">
          <span className="text-slate-400 shrink-0">{key}:</span>
          <span className="text-slate-700 break-all">
            {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '–')}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Time formatter ─────────────────────────────────────
function formatEventTime(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

// ── Interface ──────────────────────────────────────────
interface FakturaEvent {
  id: number
  event_type: string
  actor: string | null
  payload: any
  created_at: string
}

interface FakturaEventsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fakturaId?: number
  queueId?: number
  currentStatus?: string
  ksiegoweNumer?: string | null
}

export function FakturaEventsDrawer({
  open,
  onOpenChange,
  fakturaId,
  queueId,
  currentStatus,
  ksiegoweNumer,
}: FakturaEventsDrawerProps) {
  const [events, setEvents] = useState<FakturaEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    setError(null)

    const load = async () => {
      const result = await fetchFakturaEvents({ fakturaId, queueId })

      if (cancelled) return

      if (result.error) {
        setError(result.error)
        setEvents([])
      } else {
        setEvents(result.events as FakturaEvent[])
      }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [open, fakturaId, queueId])

  const statusLabel: Record<string, string> = {
    pending: 'Oczekuje',
    pending_review: 'Do akceptacji',
    approved: 'Zatwierdzono',
    auto_created: 'Auto-zatwierdzono',
    resolved: 'Rozwiązano',
    ignored: 'Pominięto',
    booked: 'Zaksięgowano',
    external_booked: 'Zaksięgowano (zewn.)',
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md w-full overflow-y-auto">
        <SheetHeader className="border-b border-slate-200 pb-3">
          <SheetTitle className="text-base">Historia faktury</SheetTitle>
          <SheetDescription>
            <span className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {ksiegoweNumer || '(brak numeru)'}
              </Badge>
              {currentStatus && (
                <Badge className="text-xs bg-slate-100 text-slate-700 border-none">
                  {statusLabel[currentStatus] || currentStatus}
                </Badge>
              )}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500">
              Wczytywanie historii…
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-md p-3">
              Błąd: {error}
            </div>
          )}

          {!loading && !error && events.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <div className="text-sm text-slate-500">
                Brak historii — zdarzenia zbierane od sierpnia 2026.
              </div>
            </div>
          )}

          {!loading && !error && events.length > 0 && (
            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />

              <div className="space-y-4">
                {events.map((event) => {
                  const label = EVENT_LABELS[event.event_type] || event.event_type
                  const dotColor = getDotColor(event.event_type)
                  const actor = formatActor(event.actor)
                  const shortDesc = buildPayloadDescription(event.event_type, event.payload)

                  return (
                    <div key={event.id} className="relative pl-6">
                      {/* Dot */}
                      <div className={`absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-white shadow-sm ${dotColor}`} />

                      {/* Content */}
                      <div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-800">{label}</span>
                          <span className="text-xs text-slate-400">
                            {formatEventTime(event.created_at)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {actor}
                        </div>
                        {shortDesc && (
                          <div className="text-xs text-slate-600 mt-1 bg-slate-50 rounded px-2 py-1">
                            {shortDesc}
                          </div>
                        )}
                        {event.payload && Object.keys(event.payload).length > 0 && (
                          <details className="mt-1">
                            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                              pokaż szczegóły
                            </summary>
                            <DiffDetails payload={event.payload} />
                          </details>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
