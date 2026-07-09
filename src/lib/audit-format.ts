export interface AuditLogLike {
  action?: string
  details?: Record<string, unknown> | null
  error?: string | null
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

export function getAuditActionConfig(actionRaw?: string | null): AuditActionConfig {
  const action = (actionRaw || '').trim()

  switch (action) {
    case 'auto_create_full':
      return {
        label: 'Zaksięgowano w Rachmistrzu',
        badgeClass: 'text-green-700 bg-green-50 border border-green-200',
        textColor: 'text-[#22C55E]',
        bgColor: 'bg-[#22C55E]/10',
        circleColor: 'text-[#22C55E]',
        circleBg: 'bg-[#22C55E]/10',
        iconType: 'check'
      }

    case 'external_booked':
      return {
        label: 'Zaksięgowano ręcznie w Rachmistrzu (poza panelem)',
        badgeClass: 'text-purple-700 bg-purple-50 border border-purple-200',
        textColor: 'text-[#8B5CF6]',
        bgColor: 'bg-[#8B5CF6]/10',
        circleColor: 'text-[#8B5CF6]',
        circleBg: 'bg-[#8B5CF6]/10',
        iconType: 'purple-check'
      }

    case 'approved':
      return {
        label: 'Zatwierdzono w panelu',
        badgeClass: 'text-blue-700 bg-blue-50 border border-blue-200',
        textColor: 'text-[#3B82F6]',
        bgColor: 'bg-[#3B82F6]/10',
        circleColor: 'text-[#3B82F6]',
        circleBg: 'bg-[#3B82F6]/10',
        iconType: 'blue-check'
      }

    case 'pre_fill_pending_review':
      return {
        label: 'Pre-fill gotowy do akceptacji',
        badgeClass: 'text-slate-700 bg-slate-100 border border-slate-200',
        textColor: 'text-[#64748B]',
        bgColor: 'bg-[#F1F5F9]',
        circleColor: 'text-[#64748B]',
        circleBg: 'bg-[#F1F5F9]',
        iconType: 'file'
      }

    case 'exception':
      return {
        label: 'Wyjątek — wymaga decyzji',
        badgeClass: 'text-amber-700 bg-amber-50 border border-amber-200',
        textColor: 'text-[#F59E0B]',
        bgColor: 'bg-[#F59E0B]/10',
        circleColor: 'text-[#F59E0B]',
        circleBg: 'bg-[#F59E0B]/10',
        iconType: 'alert'
      }

    case 'error':
      return {
        label: 'Błąd',
        badgeClass: 'text-red-700 bg-red-50 border border-red-200',
        textColor: 'text-[#EF4444]',
        bgColor: 'bg-[#EF4444]/10',
        circleColor: 'text-[#EF4444]',
        circleBg: 'bg-[#EF4444]/10',
        iconType: 'error'
      }

    case 'dry_run_create':
    case 'dry_run':
      return {
        label: 'Test (dry run)',
        badgeClass: 'text-slate-600 bg-transparent border border-slate-300',
        textColor: 'text-[#64748B]',
        bgColor: 'bg-[#F1F5F9]',
        circleColor: 'text-[#64748B]',
        circleBg: 'bg-[#F1F5F9]',
        iconType: 'file'
      }

    case 'set_opis':
      return {
        label: 'Zapis opisu',
        badgeClass: 'text-green-700 bg-green-50 border border-green-200',
        textColor: 'text-[#22C55E]',
        bgColor: 'bg-[#22C55E]/10',
        circleColor: 'text-[#22C55E]',
        circleBg: 'bg-[#22C55E]/10',
        iconType: 'check'
      }

    case 'resolve_exception':
      return {
        label: 'Rozwiązanie wyjątku',
        badgeClass: 'text-blue-700 bg-blue-50 border border-blue-200',
        textColor: 'text-[#4A90E2]',
        bgColor: 'bg-[#4A90E2]/10',
        circleColor: 'text-[#4A90E2]',
        circleBg: 'bg-[#4A90E2]/10',
        iconType: 'blue-check'
      }

    case 'ignore_exception':
      return {
        label: 'Pominięcie',
        badgeClass: 'text-slate-700 bg-slate-100 border border-slate-200',
        textColor: 'text-[#64748B]',
        bgColor: 'bg-[#F1F5F9]',
        circleColor: 'text-[#64748B]',
        circleBg: 'bg-[#F1F5F9]',
        iconType: 'skip'
      }

    case 'rule_edited':
      return {
        label: 'Edycja reguły',
        badgeClass: 'text-slate-700 bg-slate-100 border border-slate-200',
        textColor: 'text-[#64748B]',
        bgColor: 'bg-[#F1F5F9]',
        circleColor: 'text-[#64748B]',
        circleBg: 'bg-[#F1F5F9]',
        iconType: 'wrench'
      }

    case 'rule_deleted':
      return {
        label: 'Usunięcie reguły',
        badgeClass: 'text-slate-700 bg-slate-100 border border-slate-200',
        textColor: 'text-[#64748B]',
        bgColor: 'bg-[#F1F5F9]',
        circleColor: 'text-[#64748B]',
        circleBg: 'bg-[#F1F5F9]',
        iconType: 'trash'
      }

    default: {
      if (action.startsWith('skip_')) {
        const skipPart = action.slice(5).replace(/_/g, ' ').trim()
        return {
          label: skipPart ? `Pominięto: ${skipPart}` : 'Pominięto',
          badgeClass: 'text-slate-700 bg-slate-100 border border-slate-200',
          textColor: 'text-[#64748B]',
          bgColor: 'bg-[#F1F5F9]',
          circleColor: 'text-[#64748B]',
          circleBg: 'bg-[#F1F5F9]',
          iconType: 'skip'
        }
      }

      return {
        label: action || '—',
        badgeClass: 'text-slate-600 bg-slate-50 border border-slate-200',
        textColor: 'text-[#94A3B8]',
        bgColor: 'bg-[#F8FAFC]',
        circleColor: 'text-[#94A3B8]',
        circleBg: 'bg-[#F8FAFC]',
        iconType: 'default'
      }
    }
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
      log.error ||
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
