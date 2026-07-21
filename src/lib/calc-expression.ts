/**
 * Mini-parser for simple arithmetic expressions.
 * Supports: numbers (123, 12.34, 12,34), operators + - * /, spaces.
 * Respects operator precedence: * / before + -.
 * NO eval(), NO new Function().
 */

export interface CalcResult {
  value: number | null
  error: string | null
}

/** Check if input contains an arithmetic operator (beyond just a number) */
export function hasOperator(input: string): boolean {
  // Remove leading minus (negative number) before checking
  const trimmed = input.trim()
  const withoutLeadingMinus = trimmed.startsWith('-') ? trimmed.slice(1) : trimmed
  return /[+\-*/]/.test(withoutLeadingMinus)
}

export function parseCalcExpression(input: string): CalcResult {
  const trimmed = input.trim()
  if (!trimmed) return { value: null, error: 'Puste wyrażenie' }

  // Normalize: replace comma with dot
  const normalized = trimmed.replace(/,/g, '.')

  // If it's just a plain number, return it
  if (!hasOperator(normalized)) {
    const num = parseFloat(normalized)
    if (isNaN(num)) return { value: null, error: 'Nieprawidłowe wyrażenie' }
    return { value: Math.round(num * 100) / 100, error: null }
  }

  // Tokenize
  const tokens = tokenize(normalized)
  if (!tokens) return { value: null, error: 'Nieprawidłowe wyrażenie' }

  // Parse with precedence
  try {
    const result = parseExpression(tokens, 0)
    if (result.pos !== tokens.length) {
      return { value: null, error: 'Nieprawidłowe wyrażenie' }
    }
    return { value: Math.round(result.value * 100) / 100, error: null }
  } catch {
    return { value: null, error: 'Nieprawidłowe wyrażenie' }
  }
}

// ── Tokenizer ──

type Token = { type: 'number'; value: number } | { type: 'op'; value: string }

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = []
  let i = 0
  const s = input.replace(/\s+/g, '')

  while (i < s.length) {
    // Number (including leading minus for negative at start or after operator)
    if (
      s[i] >= '0' && s[i] <= '9' ||
      s[i] === '.' ||
      (s[i] === '-' && (tokens.length === 0 || tokens[tokens.length - 1].type === 'op'))
    ) {
      let numStr = ''
      if (s[i] === '-') {
        numStr += '-'
        i++
      }
      while (i < s.length && (s[i] >= '0' && s[i] <= '9' || s[i] === '.')) {
        numStr += s[i]
        i++
      }
      const num = parseFloat(numStr)
      if (isNaN(num)) return null
      tokens.push({ type: 'number', value: num })
    } else if ('+-*/'.includes(s[i])) {
      tokens.push({ type: 'op', value: s[i] })
      i++
    } else {
      return null // Invalid character
    }
  }

  return tokens.length > 0 ? tokens : null
}

// ── Recursive descent parser with precedence ──

interface ParseResult {
  value: number
  pos: number
}

function parseExpression(tokens: Token[], pos: number): ParseResult {
  let left = parseTerm(tokens, pos)

  while (left.pos < tokens.length) {
    const tok = tokens[left.pos]
    if (tok.type !== 'op' || (tok.value !== '+' && tok.value !== '-')) break

    const right = parseTerm(tokens, left.pos + 1)
    left = {
      value: tok.value === '+' ? left.value + right.value : left.value - right.value,
      pos: right.pos,
    }
  }

  return left
}

function parseTerm(tokens: Token[], pos: number): ParseResult {
  let left = parseFactor(tokens, pos)

  while (left.pos < tokens.length) {
    const tok = tokens[left.pos]
    if (tok.type !== 'op' || (tok.value !== '*' && tok.value !== '/')) break

    const right = parseFactor(tokens, left.pos + 1)
    if (tok.value === '/' && right.value === 0) {
      throw new Error('Division by zero')
    }
    left = {
      value: tok.value === '*' ? left.value * right.value : left.value / right.value,
      pos: right.pos,
    }
  }

  return left
}

function parseFactor(tokens: Token[], pos: number): ParseResult {
  if (pos >= tokens.length) throw new Error('Unexpected end')
  const tok = tokens[pos]
  if (tok.type !== 'number') throw new Error('Expected number')
  return { value: tok.value, pos: pos + 1 }
}
