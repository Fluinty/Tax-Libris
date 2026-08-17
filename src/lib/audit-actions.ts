// ── JEDYNE źródło prawdy o akcjach audit_log (AUDIT 2026-08 §3) ─────────────
// Dotąd audit-format.ts (RecentActivityList) i audit-formatter.ts
// (ZapisHistorySheet) trzymały RÓWNOLEGŁE switche po tym samym zbiorze akcji —
// nowa akcja w jednym nie dostawała etykiety w drugim. Skala: 10 akcji
// panelowych (m.in. pozycja_wymiar_edit ×429, resolved ×241,
// jpk_section_update ×235, approved_with_edit_full ×170, ignored ×105 —
// COUNT 17.08) renderowało się surową nazwą w OBU widokach.
//
// Nową akcję dopisuje się WYŁĄCZNIE tutaj; oba konsumery wyprowadzają z tej
// mapy swoje kształty (CSS-bundle w audit-format, ikona/kolor w
// audit-formatter). Dynamiczne PODTYTUŁY (per szczegóły wpisu) celowo zostają
// u konsumentów — wspólny jest słownik: etykieta, ton, ikona.

export type AuditTone = 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'gray'

export type AuditIconKey =
  | 'check'        // proste "zrobione"
  | 'check-circle' // zatwierdzenie/księgowanie
  | 'alert'        // wymaga uwagi
  | 'error'
  | 'file'         // etap pipeline'u
  | 'skip'         // pominięcie
  | 'wrench'       // edycja/konfiguracja
  | 'trash'
  | 'search'       // dry run / podgląd
  | 'restore'      // przywrócenie do kolejki
  | 'default'

export interface AuditActionMeta {
  label: string
  tone: AuditTone
  icon: AuditIconKey
}

export const AUDIT_ACTION_META: Record<string, AuditActionMeta> = {
  // ── pipeline workera ──
  // 'check-circle': przed scaleniem bliźnięta się różniły (sheet: CheckCircle2,
  // lista: Check) — ujednolicone do kółka zgodnie z semantyką ikon poniżej
  // ('check-circle' = zatwierdzenie/księgowanie, jak approved/external_booked).
  auto_create_full: { label: 'Zaksięgowano w Rachmistrzu', tone: 'green', icon: 'check-circle' },
  resolved_to_auto_create: { label: 'Zaksięgowano w Rachmistrzu (po rozwiązaniu)', tone: 'green', icon: 'check-circle' },
  external_booked: { label: 'Zaksięgowano ręcznie w Rachmistrzu (poza panelem)', tone: 'purple', icon: 'check-circle' },
  pre_fill_pending_review: { label: 'Pre-fill gotowy do akceptacji', tone: 'gray', icon: 'file' },
  exception: { label: 'Wyjątek — wymaga decyzji', tone: 'orange', icon: 'alert' },
  error: { label: 'Błąd', tone: 'red', icon: 'error' },
  dry_run: { label: 'Test (dry run)', tone: 'gray', icon: 'search' },
  dry_run_create: { label: 'Test (dry run)', tone: 'gray', icon: 'search' },
  set_opis: { label: 'Zapis opisu', tone: 'green', icon: 'check' },

  // ── decyzje panelu (logAudit) — dotąd BEZ etykiet w obu widokach ──
  approved: { label: 'Zatwierdzono w panelu', tone: 'blue', icon: 'check-circle' },
  approved_with_edit_full: { label: 'Zatwierdzono z edycją', tone: 'blue', icon: 'check-circle' },
  approved_with_full_edit: { label: 'Zatwierdzono z edycją', tone: 'blue', icon: 'check-circle' },
  resolved: { label: 'Wyjątek rozwiązany w panelu', tone: 'blue', icon: 'check-circle' },
  ignored: { label: 'Pominięto w panelu', tone: 'gray', icon: 'skip' },
  restored: { label: 'Przywrócono do kolejki', tone: 'blue', icon: 'restore' },
  pozycja_wymiar_edit: { label: 'Edycja klasyfikacji pozycji', tone: 'gray', icon: 'wrench' },
  jpk_section_update: { label: 'Edycja sekcji JPK/VAT', tone: 'gray', icon: 'wrench' },
  jpk_section_reset: { label: 'Reset sekcji JPK/VAT do AI', tone: 'gray', icon: 'wrench' },
  opis_added_from_ai: { label: 'Opis AI dodany do listy klienta', tone: 'green', icon: 'check' },
  opis_reactivated_from_ai: { label: 'Opis AI reaktywowany na liście klienta', tone: 'green', icon: 'check' },
  update_final_zapis_vat: { label: 'Edycja zapisu VAT (transakcja zagraniczna)', tone: 'gray', icon: 'wrench' },
  auto_write_toggled: { label: 'Przełączono auto-write klienta', tone: 'purple', icon: 'wrench' },

  // ── legacy (moduł wyjatki / reguły) ──
  resolve_exception: { label: 'Rozwiązanie wyjątku', tone: 'blue', icon: 'check-circle' },
  ignore_exception: { label: 'Pominięcie', tone: 'gray', icon: 'skip' },
  rule_edited: { label: 'Edycja reguły', tone: 'gray', icon: 'wrench' },
  rule_deleted: { label: 'Usunięcie reguły', tone: 'gray', icon: 'trash' },
}

/**
 * Meta dla akcji z fallbackami: dynamiczne `skip_*` (worker koduje powód
 * w nazwie akcji) i default z surową nazwą — jak dotąd, tylko w JEDNYM miejscu.
 */
export function resolveAuditAction(actionRaw?: string | null): AuditActionMeta {
  const action = (actionRaw || '').trim()
  const meta = AUDIT_ACTION_META[action]
  if (meta) return meta
  if (action.startsWith('skip_')) {
    const skipPart = action.slice(5).replace(/_/g, ' ').trim()
    return { label: skipPart ? `Pominięto: ${skipPart}` : 'Pominięto', tone: 'gray', icon: 'skip' }
  }
  return { label: action || '—', tone: 'gray', icon: 'default' }
}
