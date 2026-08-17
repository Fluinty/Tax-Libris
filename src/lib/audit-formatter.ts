// ── Kształt dla ZapisHistorySheet — WYPROWADZONY z audit-actions.ts ─────────
// Słownik akcji (etykieta/ton/ikona) żyje WYŁĄCZNIE w audit-actions.ts.
// Tutaj zostają wyłącznie DYNAMICZNE tytuły/podtytuły budowane ze szczegółów
// wpisu (kto rozwiązał, numer faktury, treść błędu) — czysta prezentacja.
// Nowa akcja dopisana w audit-actions dostaje tu automatycznie tytuł, kolor
// i ikonę przez ścieżkę domyślną.

import { formatDistanceToNow, format } from 'date-fns'
import { pl } from 'date-fns/locale'
import { resolveAuditAction, type AuditIconKey, type AuditTone } from './audit-actions'

export interface AuditEntry {
  id: number
  timestamp: string
  action: string
  pozycja_xml: string | null
  rule_id: number | null
  opis_zapisany: string | null
  error_message: string | null
  duration_ms: number | null
  details: Record<string, unknown> | null
}

export interface ZapisInfo {
  zapis_id: number
  client_nip: string
  client_nazwa: string
  numer_ksef: string | null
  numer_dokumentu: string | null
  pozycja_xml: string | null
  nazwa_dostawcy: string | null
  typ_dokumentu: 'zakup' | 'sprzedaz' | null
}

export type ActionColor = 'green' | 'blue' | 'orange' | 'red' | 'gray' | 'purple'

export interface FormattedAction {
  iconName: 'Check' | 'CheckCircle2' | 'AlertTriangle' | 'Search' | 'XCircle' | 'MinusCircle' | 'Wrench' | 'Trash2' | 'HelpCircle' | 'FileText' | 'RotateCcw'
  color: ActionColor
  title: string
  subtitle: string | null
}

const ICON_NAMES: Record<AuditIconKey, FormattedAction['iconName']> = {
  'check': 'Check',
  'check-circle': 'CheckCircle2',
  'alert': 'AlertTriangle',
  'error': 'XCircle',
  'file': 'FileText',
  'skip': 'MinusCircle',
  'wrench': 'Wrench',
  'trash': 'Trash2',
  'search': 'Search',
  'restore': 'RotateCcw',
  'default': 'HelpCircle',
}

const TONE_COLORS: Record<AuditTone, ActionColor> = {
  green: 'green', blue: 'blue', purple: 'purple', orange: 'orange', red: 'red', gray: 'gray',
}

const numerFaktury = (details: Record<string, string>, audit: AuditEntry) =>
  details.numer_faktury || details.numer_dokumentu || details.ksiegowe_numer || details.invoice_number ||
  details.faktura_numer || details.numer || details.faktura || audit.pozycja_xml || ''

export function formatAuditAction(audit: AuditEntry): FormattedAction {
  const meta = resolveAuditAction(audit.action)
  const details = (audit.details ?? {}) as Record<string, string>
  const base: FormattedAction = {
    iconName: ICON_NAMES[meta.icon],
    color: TONE_COLORS[meta.tone],
    title: meta.label,
    subtitle: null,
  }

  // Dynamiczne tytuły/podtytuły per akcja — reszta (etykieta/kolor/ikona)
  // z bazowej mapy, więc akcje bez wpisu tutaj też wyglądają poprawnie.
  switch (audit.action) {
    case 'exception':
      return { ...base, subtitle: `brak reguły dla pozycji "${audit.pozycja_xml || details.pierwsza_pozycja || 'nieznana'}"` }

    case 'resolve_exception': {
      const resolvedBy = details.resolved_by || 'księgowa'
      const isPatternStr = details.is_pattern === 'true' ? 'pattern LIKE' : 'dokładny match'
      return {
        ...base,
        title: `${resolvedBy} rozwiązał wyjątek`,
        subtitle: `→ opis: "${audit.opis_zapisany}"\n→ ${isPatternStr}\n→ utworzona reguła #${audit.rule_id}`,
      }
    }

    case 'set_opis': {
      const pozycjiMatch = details.pozycji_matchujacych || '1'
      const opis = audit.opis_zapisany || details.opis
      return { ...base, title: 'Worker wpisał opis', subtitle: `"${opis}" (reguła #${audit.rule_id}, dopasowano ${pozycjiMatch} pozycję)` }
    }

    case 'auto_create_full':
    case 'resolved_to_auto_create': {
      const nr = numerFaktury(details, audit)
      return { ...base, subtitle: nr ? `Faktura: ${nr}` : 'Automatyczne księgowanie' }
    }

    case 'external_booked': {
      const nr = numerFaktury(details, audit)
      return { ...base, subtitle: nr ? `Faktura: ${nr}` : null }
    }

    case 'approved':
    case 'approved_with_edit_full':
    case 'approved_with_full_edit':
    case 'resolved':
      return { ...base, subtitle: details.by || details.resolved_by ? `przez ${details.by || details.resolved_by}` : null }

    case 'ignored':
      return { ...base, subtitle: details.resolved_by ? `przez ${details.resolved_by}` : null }

    case 'restored':
      return { ...base, subtitle: details.restored_by ? `przez ${details.restored_by}` : null }

    case 'dry_run_create':
    case 'dry_run':
      return { ...base, subtitle: `byłby wpisany opis "${details.opis || audit.opis_zapisany || ''}"` }

    case 'error':
      return { ...base, subtitle: audit.error_message || details.error || 'nieznany błąd' }

    case 'ignore_exception': {
      const ignoredBy = details.ignored_by || details.by || 'księgowa'
      return { ...base, title: `${ignoredBy} pominął wyjątek` }
    }

    case 'rule_edited':
      return { ...base, title: `Edytowano regułę #${audit.rule_id}`, subtitle: details.edited_by ? `przez ${details.edited_by}` : null }

    case 'rule_deleted':
      return { ...base, title: `Usunięto regułę #${audit.rule_id}`, subtitle: details.deleted_by ? `przez ${details.deleted_by}` : null }

    default: {
      if (audit.action && audit.action.startsWith('skip_')) {
        return { ...base, subtitle: details.reason || details.powod || null }
      }
      return base
    }
  }
}

export function formatRelativeTime(timestamp: string): string {
  return formatDistanceToNow(new Date(timestamp), {
    locale: pl,
    addSuffix: true,
  })
}

export function formatExactTime(timestamp: string): string {
  return format(new Date(timestamp), 'dd.MM.yyyy HH:mm:ss', { locale: pl })
}
