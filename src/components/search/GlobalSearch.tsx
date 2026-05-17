'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Building2, Search, FileText, Car, FileBox } from 'lucide-react'
import { getGlobalSearchData, type SearchData } from '@/app/actions/search'
import { Button } from '@/components/ui/button'

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<SearchData | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  useEffect(() => {
    if (open && !data && !loading) {
      setLoading(true)
      getGlobalSearchData().then(d => {
        setData(d)
        setLoading(false)
      })
    }
  }, [open, data, loading])

  const runCommand = (command: () => void) => {
    setOpen(false)
    command()
  }

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start rounded-[0.5rem] bg-muted/50 text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-40 lg:w-64"
        onClick={() => setOpen(true)}
      >
        <span className="hidden lg:inline-flex">Szukaj...</span>
        <span className="inline-flex lg:hidden">Szukaj...</span>
        <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Wpisz NIP, nazwę, rejestrację, KSeF..." />
        <CommandList>
          <CommandEmpty>
            {loading ? 'Ładowanie danych...' : 'Brak wyników.'}
          </CommandEmpty>

          {data && data.clients.length > 0 && (
            <CommandGroup heading="Klienci">
              {data.clients.map((client) => (
                <CommandItem
                  key={client.nip}
                  value={`${client.nazwa} ${client.nip}`}
                  onSelect={() => runCommand(() => router.push(`/klienci/${client.nip}`))}
                >
                  <Building2 className="mr-2 h-4 w-4 text-blue-500" />
                  <span className="flex-1 font-medium">{client.nazwa}</span>
                  <span className="text-xs text-muted-foreground">NIP {client.nip}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data && data.pojazdy.length > 0 && (
            <CommandGroup heading="Pojazdy">
              {data.pojazdy.map((pojazd) => (
                <CommandItem
                  key={`p-${pojazd.id}`}
                  value={`${pojazd.nr_rejestracyjny} ${pojazd.client_nazwa}`}
                  onSelect={() => runCommand(() => router.push(`/klienci/${pojazd.client_nip}`))}
                >
                  <Car className="mr-2 h-4 w-4 text-orange-500" />
                  <span className="flex-1 font-medium">{pojazd.nr_rejestracyjny}</span>
                  <span className="text-xs text-muted-foreground">{pojazd.client_nazwa}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data && data.opisy.length > 0 && (
            <CommandGroup heading="Opisy księgowe">
              {data.opisy.map((opis) => (
                <CommandItem
                  key={`o-${opis.id}`}
                  value={`${opis.opis} ${opis.client_nazwa}`}
                  onSelect={() => runCommand(() => router.push(`/klienci/${opis.client_nip}`))}
                >
                  <FileText className="mr-2 h-4 w-4 text-green-500" />
                  <span className="flex-1 truncate" title={opis.opis}>{opis.opis}</span>
                  <span className="ml-2 text-xs text-muted-foreground shrink-0">{opis.client_nazwa}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data && data.ksefs.length > 0 && (
            <CommandGroup heading="Faktury KSeF">
              {data.ksefs.map((ksef) => (
                <CommandItem
                  key={`ksef-${ksef.numer_ksef}`}
                  value={`${ksef.numer_ksef} ${ksef.client_nazwa}`}
                  onSelect={() => runCommand(() => router.push(`/klienci/${ksef.client_nip}`))}
                >
                  <FileBox className="mr-2 h-4 w-4 text-slate-500" />
                  <span className="flex-1 truncate" title={ksef.numer_ksef}>{ksef.numer_ksef}</span>
                  <span className="ml-2 text-xs text-muted-foreground shrink-0">{ksef.client_nazwa}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

        </CommandList>
      </CommandDialog>
    </>
  )
}
