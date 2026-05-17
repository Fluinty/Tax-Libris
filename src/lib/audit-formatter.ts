import { formatDistanceToNow, format } from 'date-fns'
import { pl } from 'date-fns/locale'

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

export type ActionColor = 'green' | 'blue' | 'orange' | 'red' | 'gray'

export interface FormattedAction {
  iconName: 'Check' | 'CheckCircle2' | 'AlertTriangle' | 'Search' | 'XCircle' | 'MinusCircle' | 'Wrench' | 'Trash2' | 'HelpCircle'
  color: ActionColor
  title: string
  subtitle: string | null
}

export function formatAuditAction(audit: AuditEntry): FormattedAction {
  const details = (audit.details ?? {}) as Record<string, string>

  switch (audit.action) {
    case 'exception':
      return {
        iconName: 'AlertTriangle',
        color: 'orange',
        title: 'Wykryto wyjątek',
        subtitle: `brak reguły dla pozycji "${audit.pozycja_xml || details.pierwsza_pozycja || 'nieznana'}"`,
      }

    case 'resolve_exception': {
      const resolvedBy = details.resolved_by || 'księgowa'
      const isPatternStr = details.is_pattern === 'true' ? 'pattern LIKE' : 'dokładny match'
      return {
        iconName: 'CheckCircle2',
        color: 'blue',
        title: `${resolvedBy} rozwiązał wyjątek`,
        subtitle: `→ opis: "${audit.opis_zapisany}"\n→ ${isPatternStr}\n→ utworzona reguła #${audit.rule_id}`,
      }
    }

    case 'set_opis': {
      const pozycjiMatch = details.pozycji_matchujacych || '1'
      const opis = audit.opis_zapisany || details.opis
      return {
        iconName: 'Check',
        color: 'green',
        title: 'Worker wpisał opis',
        subtitle: `"${opis}" (reguła #${audit.rule_id}, dopasowano ${pozycjiMatch} pozycję)`,
      }
    }

    case 'dry_run':
      return {
        iconName: 'Search',
        color: 'gray',
        title: 'DRY RUN',
        subtitle: `byłby wpisany opis "${details.opis}"`,
      }

    case 'error':
      return {
        iconName: 'XCircle',
        color: 'red',
        title: 'Błąd',
        subtitle: audit.error_message || details.error || 'nieznany błąd',
      }

    case 'ignore_exception': {
      const ignoredBy = details.ignored_by || details.by || 'księgowa'
      return {
        iconName: 'MinusCircle',
        color: 'gray',
        title: `${ignoredBy} pominął wyjątek`,
        subtitle: null,
      }
    }

    case 'rule_edited':
      return {
        iconName: 'Wrench',
        color: 'gray',
        title: `Edytowano regułę #${audit.rule_id}`,
        subtitle: details.edited_by ? `przez ${details.edited_by}` : null,
      }

    case 'rule_deleted':
      return {
        iconName: 'Trash2',
        color: 'gray',
        title: `Usunięto regułę #${audit.rule_id}`,
        subtitle: details.deleted_by ? `przez ${details.deleted_by}` : null,
      }

    default:
      return {
        iconName: 'HelpCircle',
        color: 'gray',
        title: `Nieznana akcja: ${audit.action}`,
        subtitle: null,
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
