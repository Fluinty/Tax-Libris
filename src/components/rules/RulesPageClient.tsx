'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Pencil, Trash2, BookOpen, ArrowRight, ChevronLeft, ChevronRight, ShoppingCart, DollarSign } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { EditRuleDialog } from './EditRuleDialog'
import { DeleteRuleDialog } from './DeleteRuleDialog'
import type { RuleWithClient, Client } from '@/types/database'
import Link from 'next/link'

interface Props {
  rules: RuleWithClient[]
  totalRules: number
  currentPage: number
  totalPages: number
  totalZakup: number
  totalSprzedaz: number
  currentTyp: string
  clients: Pick<Client, 'nip' | 'nazwa'>[]
  search: string
  selectedClient: string
  selectedType: string
  ruleDescriptions: { opis_zdarzenia: string; hit_count: number }[]
}

export function RulesPageClient({
  rules,
  totalRules,
  currentPage,
  totalPages,
  totalZakup,
  totalSprzedaz,
  currentTyp,
  clients,
  search: initialSearch,
  selectedClient,
  selectedType,
  ruleDescriptions,
}: Props) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [editRule, setEditRule] = useState<RuleWithClient | null>(null)
  const [deleteRule, setDeleteRule] = useState<RuleWithClient | null>(null)

  // URL builder preserving all params
  const updateUrl = useCallback(
    (overrides: Record<string, string>) => {
      const params = new URLSearchParams()
      const values = {
        search,
        client: selectedClient,
        type: selectedType,
        typ: currentTyp,
        page: '1',
        ...overrides,
      }
      Object.entries(values).forEach(([k, v]) => {
        if (v) params.set(k, v)
      })
      router.push(`/reguly?${params.toString()}`)
    },
    [router, search, selectedClient, selectedType, currentTyp]
  )

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== initialSearch) {
        updateUrl({ search, page: '1' })
      }
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const handleClientChange = (value: string | null) => {
    updateUrl({ client: !value || value === '__all__' ? '' : value, page: '1' })
  }

  const handleTypeChange = (value: string | null) => {
    updateUrl({ type: !value || value === '__all__' ? '' : value, page: '1' })
  }

  const handlePageChange = (page: number) => {
    updateUrl({ page: String(page) })
  }

  const handleTabChange = (value: string) => {
    updateUrl({ typ: value, page: '1', search: '', client: '', type: '' })
    setSearch('')
  }

  function truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[#1E293B]">Reguły</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Łącznie:{' '}
          <span className="font-semibold text-[#1E293B]">{totalRules}</span>{' '}
          reguł w aktywnej zakładce
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={currentTyp} onValueChange={handleTabChange} className="mb-6">
        <TabsList className="h-9">
          <TabsTrigger value="zakup" className="gap-2 cursor-pointer">
            🛒 Zakupowe
            <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
              {totalZakup}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="sprzedaz" className="gap-2 cursor-pointer">
            💰 Sprzedażowe
            <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
              {totalSprzedaz}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={currentTyp}>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
              <Input
                placeholder="Szukaj patternu lub opisu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-9 border-[#E2E8F0]"
              />
            </div>

            <Select
              value={selectedClient || '__all__'}
              onValueChange={handleClientChange}
            >
              <SelectTrigger className="w-[180px] h-9 border-[#E2E8F0] cursor-pointer">
                <SelectValue placeholder="Klient" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Wszyscy klienci</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.nip} value={c.nip}>
                    {c.nazwa}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedType || '__all__'}
              onValueChange={handleTypeChange}
            >
              <SelectTrigger className="w-[160px] h-9 border-[#E2E8F0] cursor-pointer">
                <SelectValue placeholder="Typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Wszystkie typy</SelectItem>
                <SelectItem value="exact">Dokładny match</SelectItem>
                <SelectItem value="pattern">Pattern LIKE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table or empty state */}
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-full bg-[#F1F5F9] flex items-center justify-center mb-4">
                <BookOpen className="w-10 h-10 text-[#CBD5E1]" />
              </div>
              <h2 className="text-xl font-semibold text-[#1E293B] mb-2">
                Brak reguł {currentTyp === 'sprzedaz' ? 'sprzedażowych' : 'zakupowych'}
              </h2>
              <p className="text-sm text-[#64748B] max-w-md mb-4">
                Reguły powstają automatycznie gdy księgowa rozwiązuje wyjątki.
              </p>
              <Link href="/wyjatki">
                <Button
                  variant="outline"
                  className="cursor-pointer"
                >
                  Idź do Wyjątków
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#F8FAFC]">
                      <TableHead className="text-xs uppercase tracking-wider text-[#64748B] font-semibold">
                        Klient
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-[#64748B] font-semibold">
                        Pattern
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-[#64748B] font-semibold">
                        Opis
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-[#64748B] font-semibold text-center">
                        Typ dok.
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-[#64748B] font-semibold text-center">
                        Match
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-[#64748B] font-semibold text-center">
                        Hits
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-[#64748B] font-semibold">
                        Data
                      </TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-[#64748B] font-semibold text-center">
                        Akcje
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id} className="hover:bg-[#F8FAFC]">
                        <TableCell className="font-medium text-[#1E293B]">
                          {rule.client_nazwa}
                        </TableCell>
                        <TableCell className="text-[#1E293B]">
                          {rule.pattern_pozycji.length > 50 ? (
                            <Tooltip>
                              <TooltipTrigger className="text-left cursor-default">
                                <span className="font-mono text-xs">
                                  {truncate(rule.pattern_pozycji, 50)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm">
                                <p className="font-mono text-xs break-all">
                                  {rule.pattern_pozycji}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="font-mono text-xs">
                              {rule.pattern_pozycji}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-[#64748B]">
                          {rule.opis_zdarzenia.length > 40 ? (
                            <Tooltip>
                              <TooltipTrigger className="text-left cursor-default">
                                {truncate(rule.opis_zdarzenia, 40)}
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm">
                                <p>{rule.opis_zdarzenia}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            rule.opis_zdarzenia
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 text-xs">
                            {rule.typ_dokumentu === 'sprzedaz' ? (
                              <>
                                <DollarSign className="w-3 h-3 text-[#22C55E]" />
                                <span className="text-[#22C55E]">Sprzed.</span>
                              </>
                            ) : (
                              <>
                                <ShoppingCart className="w-3 h-3 text-[#4A90E2]" />
                                <span className="text-[#4A90E2]">Zakup</span>
                              </>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="secondary"
                            className={
                              rule.is_pattern
                                ? 'bg-[#4A90E2]/10 text-[#4A90E2] border-0'
                                : 'bg-[#F1F5F9] text-[#64748B] border-0'
                            }
                          >
                            {rule.is_pattern ? 'Pattern' : 'Dokładny'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-bold text-[#1E293B] tabular-nums">
                          {rule.hit_count}
                        </TableCell>
                        <TableCell className="text-xs text-[#94A3B8]">
                          {formatDistanceToNow(new Date(rule.created_at), {
                            addSuffix: true,
                            locale: pl,
                          })}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setEditRule(rule)}
                              className="text-[#64748B] hover:text-[#4A90E2] cursor-pointer"
                              aria-label="Edytuj regułę"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setDeleteRule(rule)}
                              className="text-[#64748B] hover:text-[#EF4444] cursor-pointer"
                              aria-label="Usuń regułę"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-[#64748B]">
                  Strona {currentPage} z {totalPages} ({totalRules} reguł)
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                    className="cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Poprzednia
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="cursor-pointer"
                  >
                    Następna
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      {editRule && (
        <EditRuleDialog
          rule={editRule}
          open={!!editRule}
          onClose={() => setEditRule(null)}
          ruleDescriptions={ruleDescriptions}
        />
      )}

      {/* Delete dialog */}
      {deleteRule && (
        <DeleteRuleDialog
          rule={deleteRule}
          open={!!deleteRule}
          onClose={() => setDeleteRule(null)}
        />
      )}
    </div>
  )
}
