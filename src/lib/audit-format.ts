// ── Kształt CSS dla RecentActivityList — WYPROWADZONY z audit-actions.ts ────
// Słownik akcji (etykieta/ton/ikona) żyje WYŁĄCZNIE w audit-actions.ts;
// ten plik tłumaczy ton na klasy Tailwind i ikonę na iconType widoku.
// Ekstrakcja szczegółów wpisu (extractAuditDetailsInfo) zostaje tutaj —
// to logika prezentacji listy aktywności, nie słownik akcji.

import { resolveAuditAction, type AuditTone, type AuditIconKey } from './audit-actions'

export interface AuditLogLike {
  action?: string
  details?: Record<string, unknown> | null
  error_message?: string | null
  opis_zapisany?: string | null
  pozycja_xml?: string | null
  zapis_id?: number | null
  rule_id?: number | null
}

export interface AuditActionConfig {
  label: string
  badgeClass: string
  textColor: string
  bgColor: string
  circleBg: string
  circleColor: string
  iconType: 'check' | 'purple-check' | 'blue-check' | 'clock' | 'alert' | 'error' | 'file' | 'skip' | 'wrench' | 'trash' | 'default'
}

const TONE_STYLES: Record<AuditTone, Pick<AuditActionConfig, 'badgeClass' | 'textColor' | 'bgColor' | 'circleColor' | 'circleBg'>> = {
  green: {
    badgeClass: 'text-green-700 bg-green-50 border border-green-200',
    textColor: 'text-[#22C55E]', bgColor: 'bg-[#22C55E]/10',
    circleColor: 'text-[#22C55E]', circleBg: 'bg-[#22C55E]/10',
  },
  purple: {
    badgeClass: 'text-purple-700 bg-purple-50 border border-purple-200',
    textColor: 'text-[#8B5CF6]', bgColor: 'bg-[#8B5CF6]/10',
    circleColor: 'text-[#8B5CF6]', circleBg: 'bg-[#8B5CF6]/10',
  },
  blue: {
    badgeClass: 'text-blue-700 bg-blue-50 border border-blue-200',
    textColor: 'text-[#3B82F6]', bgColor: 'bg-[#3B82F6]/10',
    circleColor: 'text-[#3B82F6]', circleBg: 'bg-[#3B82F6]/10',
  },
  orange: {
    badgeClass: 'text-amber-700 bg-amber-50 border border-amber-200',
    textColor: 'text-[#F59E0B]', bgColor: 'bg-[#F59E0B]/10',
    circleColor: 'text-[#F59E0B]', circleBg: 'bg-[#F59E0B]/10',
  },
  red: {
    badgeClass: 'text-red-700 bg-red-50 border border-red-200',
    textColor: 'text-[#EF4444]', bgColor: 'bg-[#EF4444]/10',
    circleColor: 'text-[#EF4444]', circleBg: 'bg-[#EF4444]/10',
  },
  gray: {
    badgeClass: 'text-slate-700 bg-slate-100 border border-slate-200',
    textColor: 'text-[#64748B]', bgColor: 'bg-[#F1F5F9]',
    circleColor: 'text-[#64748B]', circleBg: 'bg-[#F1F5F9]',
  },
}

// iconType widoku z (ikona, ton) — check-circle rozróżnia wariant kolorem
function toIconType(icon: AuditIconKey, tone: AuditTone): AuditActionConfig['iconType'] {
  switch (icon) {
    case 'check': return 'check'
    case 'check-circle': return tone === 'purple' ? 'purple-check' : 'blue-check'
    case 'alert': return 'alert'
    case 'error': return 'error'
    case 'file': return 'file'
    case 'search': return 'file'
    case 'skip': return 'skip'
    case 'wrench': return 'wrench'
    case 'trash': return 'trash'
    case 'restore': return 'blue-check'
    default: return 'default'
  }
}

export function getAuditActionConfig(actionRaw?: string | null): AuditActionConfig {
  const meta = resolveAuditAction(actionRaw)
  // default (nieznana akcja) zachowuje dotychczasowy, bledszy wygląd
  if (meta.icon === 'default') {
    return {
      label: meta.label,
      badgeClass: 'text-slate-600 bg-slate-50 border border-slate-200',
      textColor: 'text-[#94A3B8]', bgColor: 'bg-[#F8FAFC]',
      circleColor: 'text-[#94A3B8]', circleBg: 'bg-[#F8FAFC]',
      iconType: 'default',
    }
  }
  return {
    label: meta.label,
    ...TONE_STYLES[meta.tone],
    iconType: toIconType(meta.icon, meta.tone),
  }
}

export interface AuditDetailsResult {
  mainParts: string[]
  isError: boolean
  fullError: string
  shortError: string
  ddkSuffix: string
}

export function extractAuditDetailsInfo(log: AuditLogLike): AuditDetailsResult {
  const d = (log.details ?? {}) as Record<string, unknown>

  // 1. zapis_id suffix
  let ddkSuffix = ''
  if (log.zapis_id !== null && log.zapis_id !== undefined && !isNaN(Number(log.zapis_id)) && Number(log.zapis_id) > 0) {
    ddkSuffix = `DDK ${log.zapis_id}`
  }

  // 2. Error check
  if (log.action === 'error') {
    const fullErr = String(
      log.error_message ||
      d.error ||
      d.error_message ||
      d.powod ||
      d.reason ||
      log.opis_zapisany ||
      'Nieznany błąd'
    ).trim()
    const shortErr = fullErr.length > 120 ? fullErr.slice(0, 120) + '…' : fullErr
    return {
      mainParts: [shortErr],
      isError: true,
      fullError: fullErr,
      shortError: shortErr,
      ddkSuffix
    }
  }

  // For non-error actions
  const parts: string[] = []

  // 1. Numer faktury
  const nrKeys = ['numer', 'ksiegowe_numer', 'numerDokumentu', 'numer_faktury', 'invoice_number', 'faktura_numer', 'faktura', 'nr_faktury', 'nr']
  let numerFaktury = ''
  for (const k of nrKeys) {
    if (d[k] !== undefined && d[k] !== null && String(d[k]).trim() !== '') {
      numerFaktury = String(d[k]).trim()
      break
    }
  }
  if (numerFaktury) {
    parts.push(numerFaktury)
  }

  // 2. Nazwa sprzedawcy
  const sprzedawcaKeys = ['nazwa_sprzedawcy', 'sprzedawca', 'nazwa_dostawcy', 'dostawca', 'kontrahent']
  let nazwaSprzedawcy = ''
  for (const k of sprzedawcaKeys) {
    if (d[k] !== undefined && d[k] !== null && String(d[k]).trim() !== '') {
      nazwaSprzedawcy = String(d[k]).trim()
      break
    }
  }
  if (nazwaSprzedawcy && nazwaSprzedawcy !== numerFaktury) {
    parts.push(nazwaSprzedawcy)
  }

  // 3. Kwota
  const kwotaKeys = ['wartosc', 'kwota', 'kwota_brutto', 'brutto', 'netto']
  let kwotaStr = ''
  for (const k of kwotaKeys) {
    if (d[k] !== undefined && d[k] !== null && String(d[k]).trim() !== '') {
      const raw = String(d[k]).trim()
      const numVal = Number(raw.replace(',', '.').replace(/[^\d.-]/g, ''))
      if (!isNaN(numVal) && raw !== '' && /\d/.test(raw)) {
        kwotaStr = numVal.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł'
      } else {
        kwotaStr = raw.endsWith('zł') || raw.endsWith('PLN') ? raw : `${raw} zł`
      }
      break
    }
  }
  if (kwotaStr && !parts.includes(kwotaStr)) {
    parts.push(kwotaStr)
  }

  // 4. Opis
  let opisStr = ''
  const opisKeys = ['opis', 'result', 'pierwsza_pozycja']
  for (const k of opisKeys) {
    if (d[k] !== undefined && d[k] !== null && String(d[k]).trim() !== '') {
      opisStr = String(d[k]).trim()
      break
    }
  }
  if (!opisStr && log.opis_zapisany && log.opis_zapisany.trim() !== '') {
    opisStr = log.opis_zapisany.trim()
  }
  if (!opisStr && log.pozycja_xml && log.pozycja_xml.trim() !== '') {
    opisStr = log.pozycja_xml.trim()
  }
  if (opisStr && !parts.includes(opisStr) && opisStr !== numerFaktury && opisStr !== nazwaSprzedawcy) {
    parts.push(opisStr)
  }

  // 5. Powód
  const powodKeys = ['powod', 'reason', 'info', 'reason_text']
  let powodStr = ''
  for (const k of powodKeys) {
    if (d[k] !== undefined && d[k] !== null && String(d[k]).trim() !== '') {
      powodStr = String(d[k]).trim()
      break
    }
  }
  if (powodStr && !parts.includes(powodStr) && powodStr !== opisStr) {
    parts.push(powodStr)
  }

  return {
    mainParts: parts,
    isError: false,
    fullError: '',
    shortError: '',
    ddkSuffix
  }
}
