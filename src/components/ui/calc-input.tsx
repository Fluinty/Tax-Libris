'use client'

import { useState, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { parseCalcExpression, hasOperator } from '@/lib/calc-expression'
import { parsePolishNumber } from '@/lib/parse-number'

interface CalcInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value' | 'type'> {
  value: string | number
  onChange: (value: string) => void
}

/**
 * Numeric input that supports simple arithmetic expressions.
 * On blur or Enter: if input contains an operator (+, -, *, /),
 * parses the expression and replaces with the computed result.
 * Plain numbers behave identically to a standard input.
 */
export function CalcInput({ value, onChange, ...props }: CalcInputProps) {
  const [localValue, setLocalValue] = useState(String(value ?? ''))
  const [error, setError] = useState<string | null>(null)
  const errorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPropValue = useRef(String(value ?? ''))
  const isFocused = useRef(false)

  // Sync from props when they change externally (not from our own edits).
  // NIGDY podczas pisania: rodzice trzymają kwotę jako LICZBĘ i przy stanie
  // przejściowym ("123,", "-") wstrzymują update stanu — echo w propsie
  // ("123") różni się wtedy od surowego localValue ("123,") i sync kasowałby
  // właśnie wpisany przecinek/kropkę/minus (dalsze klawisze doklejałyby się
  // do "123" → 12345 zamiast 123,45 w księgowaniu). Zewnętrzne zmiany
  // (recalc, reset do AI) i tak wymagają kliknięcia poza input, więc
  // synchronizacja po blur wystarcza.
  if (!isFocused.current && String(value ?? '') !== lastPropValue.current) {
    lastPropValue.current = String(value ?? '')
    setLocalValue(String(value ?? ''))
    setError(null)
  }

  const clearError = useCallback(() => {
    if (errorTimeout.current) clearTimeout(errorTimeout.current)
    setError(null)
  }, [])

  const evaluate = useCallback(() => {
    const input = localValue.trim()

    if (!input) {
      clearError()
      return
    }

    // Czysta liczba: na blur/Enter kanonizujemy zapis (polski przecinek,
    // spacje tysięcy) do "1234.56" i dopiero taki string propagujemy —
    // rodzic nie zobaczy "1 234,56", którego parseFloat ucinał do 1.
    // Nieparsowalna wartość (np. "12.34.56") dostaje widoczny błąd zamiast
    // cichego przejścia dalej.
    if (!hasOperator(input)) {
      const num = parsePolishNumber(input)
      if (num === null) {
        setError('Nieprawidłowa liczba')
        if (errorTimeout.current) clearTimeout(errorTimeout.current)
        errorTimeout.current = setTimeout(() => setError(null), 3000)
        return
      }
      clearError()
      const str = String(num)
      if (str !== localValue) {
        setLocalValue(str)
        lastPropValue.current = str
        onChange(str)
      }
      return
    }

    const result = parseCalcExpression(input)
    if (result.error || result.value === null) {
      setError(result.error || 'Nieprawidłowe wyrażenie')
      if (errorTimeout.current) clearTimeout(errorTimeout.current)
      errorTimeout.current = setTimeout(() => setError(null), 3000)
      return
    }

    clearError()
    const str = String(result.value)
    setLocalValue(str)
    lastPropValue.current = str
    onChange(str)
  }, [localValue, onChange, clearError])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setLocalValue(val)
    clearError()

    // For plain numbers, propagate immediately
    if (!hasOperator(val)) {
      lastPropValue.current = val
      onChange(val)
    }
  }

  const handleFocus = () => {
    isFocused.current = true
  }

  const handleBlur = () => {
    isFocused.current = false
    evaluate()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      evaluate()
    }
  }

  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        value={localValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {error && (
        <div className="absolute left-0 top-full mt-0.5 text-[10px] text-red-500 whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  )
}
