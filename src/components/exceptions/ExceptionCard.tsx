'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Check, ChevronsUpDown, X, Clock, Bot } from 'lucide-react'
import { toast } from 'sonner'
import { resolveException, ignoreException, addProponowanyToClientOpisy } from '@/app/(auth)/wyjatki/actions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { ZapisHistorySheet } from '@/components/shared/ZapisHistorySheet'
import type { ExceptionWithClient, Rule } from '@/types/database'

interface Props {
  exception: ExceptionWithClient
  isActive: boolean
  index: number
  onActivate: () => void
  rules: Pick<Rule, 'client_nip' | 'opis_zdarzenia' | 'hit_count'>[]
  allRules: Pick<Rule, 'client_nip' | 'opis_zdarzenia' | 'hit_count'>[]
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMin < 1) return 'teraz'
  if (diffMin < 60) return `${diffMin} min temu`
  if (diffHours < 24) return `${diffHours} godz. temu`
  if (diffDays < 7) return `${diffDays} dni temu`
  return date.toLocaleDateString('pl-PL')
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
  }).format(value)
}

export function ExceptionCard({
  exception,
  isActive,
  index,
  onActivate,
  rules,
  allRules,
}: Props) {
  const [comboOpen, setComboOpen] = useState(false)
  const [selectedOpis, setSelectedOpis] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [isPattern, setIsPattern] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [isIgnoring, setIsIgnoring] = useState(false)
  const [isAddingOpis, setIsAddingOpis] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Deduplicate rules by opis_zdarzenia
  const uniqueDescriptions = Array.from(
    new Map(
      [...rules, ...allRules].map((r) => [r.opis_zdarzenia, r])
    ).values()
  ).sort((a, b) => b.hit_count - a.hit_count)

  const effectiveOpis = selectedOpis || inputValue

  // Keyboard shortcuts when card is active
  const handleCardKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isActive) return

      const target = e.target as HTMLElement
      const isInInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.getAttribute('role') === 'combobox'

      if (e.key === 'Enter' && effectiveOpis && !isInInput) {
        e.preventDefault()
        handleResolve()
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        if (comboOpen) {
          setComboOpen(false)
        } else {
          handleIgnore()
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isActive, effectiveOpis, comboOpen]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleCardKeyDown)
    return () => window.removeEventListener('keydown', handleCardKeyDown)
  }, [handleCardKeyDown])

  const handleResolve = async () => {
    if (!effectiveOpis) return
    setIsResolving(true)
    try {
      await resolveException(exception.id, effectiveOpis, isPattern)
      toast.success('Reguła utworzona', {
        description: `"${effectiveOpis}" dla ${exception.client_nazwa}`,
      })
    } catch (err) {
      toast.error('Błąd', {
        description: err instanceof Error ? err.message : 'Nieznany błąd',
      })
    } finally {
      setIsResolving(false)
    }
  }

  const handleIgnore = async () => {
    setIsIgnoring(true)
    try {
      await ignoreException(exception.id)
      toast.info('Wyjątek pominięty')
    } catch (err) {
      toast.error('Błąd', {
        description: err instanceof Error ? err.message : 'Nieznany błąd',
      })
    } finally {
      setIsIgnoring(false)
    }
  }

  const handleAddProponowanyOpis = async () => {
    if (!exception.ai_proponowany_opis) return
    setIsAddingOpis(true)
    try {
      await addProponowanyToClientOpisy(exception.id)
      toast.success(`Opis "${exception.ai_proponowany_opis}" dodany do listy klienta. Możesz teraz zatwierdzić.`)
      setSelectedOpis(exception.ai_proponowany_opis)
      setInputValue('')
    } catch (err) {
      toast.error('Błąd', {
        description: err instanceof Error ? err.message : 'Nie udało się dodać opisu',
      })
    } finally {
      setIsAddingOpis(false)
    }
  }

  return (
    <Card
      ref={cardRef}
      data-card-index={index}
      onClick={onActivate}
      className={cn(
        'p-5 transition-all duration-200 cursor-pointer border',
        isActive
          ? 'border-[#4A90E2] ring-2 ring-[#4A90E2]/20 shadow-md'
          : 'border-[#E2E8F0] hover:border-[#CBD5E1] hover:shadow-sm'
      )}
    >
      {/* Card header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="font-semibold text-[#1F3A5F]">
            {exception.client_nazwa}
          </span>
          <span className="text-[#CBD5E1]">·</span>
          <span className="text-[#64748B]">
            {exception.ksiegowe_numer ?? 'Brak numeru'}
          </span>
          <span className="text-[#CBD5E1]">·</span>
          <span className="font-medium text-[#1E293B]">
            {formatCurrency(exception.kwota_brutto)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[#94A3B8] shrink-0">
            {formatTimeAgo(exception.created_at)}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation()
              setHistoryOpen(true)
            }}
            className="text-[#94A3B8] hover:text-[#4A90E2] cursor-pointer"
            title="Historia akcji Fluinty"
          >
            <Clock className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Supplier */}
      {exception.nazwa_dostawcy && (
        <div className="text-sm text-[#64748B] mb-3">
          <span className="text-[#94A3B8]">Sprzedawca:</span>{' '}
          <span className="text-[#1E293B]">{exception.nazwa_dostawcy}</span>
          {exception.nip_dostawcy && (
            <span className="text-[#94A3B8]"> (NIP {exception.nip_dostawcy})</span>
          )}
        </div>
      )}

      {/* KSeF position */}
      <div className="mb-4">
        <p className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1.5 font-medium">
          Pozycja KSeF
        </p>
        <div className="border-l-3 border-[#1F3A5F] bg-[#F8FAFC] px-3 py-2 rounded-r-md">
          <p className="text-sm font-mono text-[#1E293B] break-all">
            {exception.pozycja_xml}
          </p>
        </div>
      </div>

      {/* AI Proposal Panel */}
      {(exception.ai_proponowany_opis || exception.ai_uzasadnienie) && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-[#4A90E2]" />
              <span className="text-xs font-bold text-[#1F3A5F] uppercase tracking-wider">Propozycja AI</span>
            </div>
            {exception.ai_confidence !== null && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                exception.ai_confidence >= 0.8 ? "bg-green-100 text-green-700" :
                exception.ai_confidence >= 0.6 ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700"
              )}>
                confidence {Math.round(exception.ai_confidence * 100)}%
              </span>
            )}
          </div>
          
          {exception.ai_proponowany_opis && (
            <div className="mb-2">
              <span className="text-xs text-[#64748B]">Sugerowany opis: </span>
              <span className="text-sm font-bold text-[#1E293B]">"{exception.ai_proponowany_opis}"</span>
            </div>
          )}
          
          {exception.ai_uzasadnienie && (
            <div className="mb-3">
              <span className="text-xs text-[#64748B]">Uzasadnienie: </span>
              <p className="text-xs italic text-[#64748B] line-clamp-3 mt-0.5">
                {exception.ai_uzasadnienie}
              </p>
            </div>
          )}
          
          {exception.ai_proponowany_opis && (
            <div className="flex items-center gap-2 mt-2">
              <Button 
                size="sm" 
                variant="outline"
                className="bg-white border-blue-200 text-blue-700 hover:bg-blue-100 h-8 text-xs font-medium cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  handleAddProponowanyOpis()
                }}
                disabled={isAddingOpis || selectedOpis === exception.ai_proponowany_opis}
              >
                {isAddingOpis ? 'Dodawanie...' : (
                  selectedOpis === exception.ai_proponowany_opis ? (
                    <><Check className="w-3.5 h-3.5 mr-1" /> Wybrano propozycję AI</>
                  ) : (
                    <>+ Dodaj "{exception.ai_proponowany_opis}" do listy klienta</>
                  )
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Description combobox — using native approach for Base UI */}
      <div className="mb-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1.5 font-medium">
          Opis księgowy
        </p>
        <Popover open={comboOpen} onOpenChange={setComboOpen}>
          <PopoverTrigger
            className={cn(
              'flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer',
              'hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              !effectiveOpis && 'text-muted-foreground'
            )}
          >
            {effectiveOpis || 'Wybierz lub wpisz opis...'}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-full min-w-[300px] p-0" side="bottom" sideOffset={4}>
            <Command>
              <CommandInput
                placeholder="Wpisz opis zdarzenia..."
                value={inputValue}
                onValueChange={(val) => {
                  setInputValue(val)
                  setSelectedOpis('')
                }}
              />
              <CommandList>
                <CommandEmpty>
                  {inputValue ? (
                    <button
                      className="w-full px-2 py-1.5 text-sm text-left text-[#4A90E2] hover:bg-[#F8FAFC] cursor-pointer"
                      onClick={() => {
                        setSelectedOpis(inputValue)
                        setComboOpen(false)
                      }}
                    >
                      Użyj: &quot;{inputValue}&quot;
                    </button>
                  ) : (
                    'Brak sugestii'
                  )}
                </CommandEmpty>
                <CommandGroup heading="Sugestie">
                  {uniqueDescriptions.map((rule) => (
                    <CommandItem
                      key={rule.opis_zdarzenia}
                      value={rule.opis_zdarzenia}
                      onSelect={(val) => {
                        setSelectedOpis(val)
                        setInputValue('')
                        setComboOpen(false)
                      }}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selectedOpis === rule.opis_zdarzenia
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                      <span className="flex-1">{rule.opis_zdarzenia}</span>
                      <span className="text-xs text-[#94A3B8] ml-2">
                        ×{rule.hit_count}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Pattern checkbox */}
      <label
        className="flex items-start gap-2 mb-4 cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isPattern}
          onChange={(e) => setIsPattern(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-[#E2E8F0] text-[#1F3A5F] focus:ring-[#4A90E2] cursor-pointer"
        />
        <div>
          <span className="text-sm text-[#1E293B]">
            Stwórz pattern (LIKE) zamiast dokładnego dopasowania
          </span>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            np. &quot;%{exception.pozycja_xml?.split(' ').slice(0, 2).join(' ')}%&quot;
          </p>
        </div>
      </label>

      {/* Actions + keyboard hints */}
      <div className="flex items-center justify-between pt-3 border-t border-[#F1F5F9]">
        <div className="hidden sm:flex items-center gap-3 text-xs text-[#94A3B8]">
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-[#F1F5F9] rounded text-[10px] font-mono border border-[#E2E8F0]">
              Enter
            </kbd>
            zatwierdź
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-[#F1F5F9] rounded text-[10px] font-mono border border-[#E2E8F0]">
              Esc
            </kbd>
            pomiń
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleIgnore()
            }}
            disabled={isIgnoring}
            className="text-[#64748B] hover:text-[#1E293B] cursor-pointer"
          >
            {isIgnoring ? (
              <span className="animate-pulse">Pomijam...</span>
            ) : (
              <>
                <X className="w-4 h-4 mr-1" />
                Pomiń
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleResolve()
            }}
            disabled={!effectiveOpis || isResolving}
            className="bg-[#1F3A5F] hover:bg-[#152A45] text-white cursor-pointer"
          >
            {isResolving ? (
              <span className="animate-pulse">Zapisuję...</span>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1" />
                Zatwierdź
              </>
            )}
          </Button>
        </div>
      </div>

      {/* History Sheet */}
      <ZapisHistorySheet
        zapisId={exception.zapis_id}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </Card>
  )
}
