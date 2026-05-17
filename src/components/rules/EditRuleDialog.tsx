'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { updateRule } from '@/app/(auth)/reguly/actions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { RuleWithClient, TypDokumentu } from '@/types/database'

interface Props {
  rule: RuleWithClient
  open: boolean
  onClose: () => void
  ruleDescriptions: { opis_zdarzenia: string; hit_count: number }[]
}

export function EditRuleDialog({ rule, open, onClose, ruleDescriptions }: Props) {
  const [pattern, setPattern] = useState(rule.pattern_pozycji)
  const [isPattern, setIsPattern] = useState(rule.is_pattern)
  const [comboOpen, setComboOpen] = useState(false)
  const [selectedOpis, setSelectedOpis] = useState(rule.opis_zdarzenia)
  const [inputValue, setInputValue] = useState('')
  const [typDokumentu, setTypDokumentu] = useState<TypDokumentu>(rule.typ_dokumentu ?? 'zakup')
  const [isSaving, setIsSaving] = useState(false)

  const effectiveOpis = selectedOpis || inputValue

  const handleSave = async () => {
    if (!effectiveOpis.trim() || !pattern.trim()) return
    setIsSaving(true)
    try {
      await updateRule(rule.id, {
        pattern_pozycji: pattern,
        is_pattern: isPattern,
        opis_zdarzenia: effectiveOpis,
        typ_dokumentu: typDokumentu,
      })
      toast.success('Reguła zaktualizowana')
      onClose()
    } catch (err) {
      toast.error('Błąd', {
        description: err instanceof Error ? err.message : 'Nieznany błąd',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edytuj regułę</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Client (read-only) */}
          <div>
            <Label className="text-xs text-[#64748B] uppercase tracking-wider">
              Klient
            </Label>
            <p className="text-sm font-medium text-[#1E293B] mt-1">
              {rule.client_nazwa} ({rule.client_nip})
            </p>
          </div>

          {/* Pattern */}
          <div>
            <Label htmlFor="edit-pattern" className="text-xs text-[#64748B] uppercase tracking-wider">
              Pattern (pozycja na fakturze)
            </Label>
            <Textarea
              id="edit-pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              rows={2}
              className="mt-1 font-mono text-sm border-[#E2E8F0]"
            />
          </div>

          {/* Is pattern checkbox */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPattern}
              onChange={(e) => setIsPattern(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[#E2E8F0] text-[#1F3A5F] focus:ring-[#4A90E2] cursor-pointer"
            />
            <div>
              <span className="text-sm text-[#1E293B]">
                Pattern LIKE (zamiast dokładnego match)
              </span>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                np. %KAWA% zamiast &quot;KAWA GUATEMALA SHB EP&quot;
              </p>
            </div>
          </label>

          {/* Description with combobox */}
          <div>
            <Label className="text-xs text-[#64748B] uppercase tracking-wider">
              Opis końcowy w KPiR
            </Label>
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger
                className={cn(
                  'flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm mt-1 cursor-pointer',
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
                    placeholder="Wpisz opis..."
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
                      {ruleDescriptions.map((d) => (
                        <CommandItem
                          key={d.opis_zdarzenia}
                          value={d.opis_zdarzenia}
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
                              selectedOpis === d.opis_zdarzenia
                                ? 'opacity-100'
                                : 'opacity-0'
                            )}
                          />
                          <span className="flex-1">{d.opis_zdarzenia}</span>
                          <span className="text-xs text-[#94A3B8] ml-2">×{d.hit_count}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Typ dokumentu */}
          <div>
            <Label className="text-xs text-[#64748B] uppercase tracking-wider">
              Typ dokumentu
            </Label>
            <Select
              value={typDokumentu}
              onValueChange={(val) => val && setTypDokumentu(val as TypDokumentu)}
            >
              <SelectTrigger className="mt-1 h-10 border-[#E2E8F0] cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zakup">🛒 Zakupowa</SelectItem>
                <SelectItem value="sprzedaz">💰 Sprzedażowa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="cursor-pointer"
          >
            Anuluj
          </Button>
          <Button
            onClick={handleSave}
            disabled={!effectiveOpis.trim() || !pattern.trim() || isSaving}
            className="bg-[#1F3A5F] hover:bg-[#152A45] text-white cursor-pointer"
          >
            {isSaving ? 'Zapisuję...' : 'Zapisz ✓'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
