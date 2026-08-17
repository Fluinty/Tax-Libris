# Fluinty — panel Tax-Libris

Panel akceptacji faktur dla biura rachunkowego. AI klasyfikuje faktury z KSeF,
księgowa zatwierdza w panelu, lokalny worker księguje w InsERT Rachmistrz nexo
przez Bridge. Panel działa na Vercel i nigdy nie dosięga Bridge'a — operacje
wymagające Rachmistrza są asynchroniczne (panel ustawia status w Supabase,
worker wykonuje).

> **Źródłem prawdy o architekturze i decyzjach jest katalog `docs/`** —
> README to tylko mapa wejściowa. Przed pracą w repo przeczytaj
> [docs/DECISIONS.md](docs/DECISIONS.md) (rejestr decyzji, nie archiwum)
> oraz [CLAUDE.md](CLAUDE.md) (zasady żelazne dot. danych produkcyjnych).

## Stack

- **Next.js 15.5** (App Router, server actions) + TypeScript strict
- **TailwindCSS** + shadcn/ui, Lucide, Recharts, Sonner
- **Supabase** — PostgreSQL (schema `fluinty`, zawsze jawnie), Auth (e-mail + hasło)
- **react-hook-form + zod**
- **Hosting:** Vercel

## Setup lokalny

```bash
npm install
cp .env.example .env.local   # uzupełnij klucze Supabase
npm run dev
```

Wymagane zmienne: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` — wyłącznie w env, nigdy w kodzie.

`npm run build` jest bramką jakości (lint ma znany, nienaprawiany błąd konfiguracji).

## Trasy

```
/                → redirect do /do-akceptacji (lub /login)
/login           → logowanie e-mail + hasło (whitelist panel_users)
/do-akceptacji   → GŁÓWNA: kolejka kart do akceptacji przez księgową
/klienci         → lista klientów biura
/klienci/[nip]   → karta klienta (auto-write, symulacja bramki, pojazdy, opisy)
/faktury         → historia operacji na fakturach (filtry statusów, przywracanie)
/dashboard       → metryki, automatyzacja, wolumen KPiR
/logs            → logi zmian (client_changes_log + audit)
/wyjatki         → legacy redirect do /do-akceptacji
```

## Role i bezpieczeństwo

- **admin** — wszyscy klienci, ustawienia auto-write
- **ksiegowa** — tylko przypisani klienci (`panel_users.biuro_klienci_nipy`)
- **klient** — dostęp do panelu ZABLOKOWANY server-side (neutralna strona
  „Portal klienta w przygotowaniu" w layoucie `(auth)`); portal klienta nie istnieje

Dostęp: whitelist `panel_users` (email + `aktywny`) → `getAllowedNips()` w każdej
stronie SSR → RLS jako defense-in-depth.

## Migracje SQL

Nowe migracje idą do katalogu `migrations/`. Katalog `supabase/migrations/`
też istnieje i zawiera historyczne, JUŻ WYKONANE migracje (20260428 →
20260806_edycja_flags.sql — m.in. definicje flag `edycja_realna`/`edycja_ksiegowa`,
wciąż żywy kontrakt); przy audycie wykonanego DDL uwzględnij oba katalogi.
Migracje uruchamia wyłącznie człowiek — nigdy agent ani CI. Stan wykonania
i kolejność: nagłówki plików + docs/DECISIONS.md.

## Skróty klawiszowe (/do-akceptacji)

Działają na AKTYWNEJ karcie i nie działają, gdy fokus stoi w polu formularza,
na przycisku albo w otwartym oknie.

| Skrót | Akcja |
|-------|-------|
| Enter | Zatwierdź aktywną kartę |
| E | Edytuj kwoty (modal) |
| ⌘K / Ctrl+K | Wyszukiwarka globalna |
| Esc | Zamyka otwarte okno lub powiększony podgląd |

**Pominięcie faktury nie ma skrótu** — wyłącznie przycisk „Pomiń". Do 13.08.2026
robił to Esc; usunięte, bo pominięcia nie da się było cofnąć z panelu, a Esc jest
klawiszem odruchowym (docs/DECISIONS.md).

## Dokumentacja

| Plik | Co zawiera |
|------|------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | przepływ danych KSeF → AI → panel → worker → Rachmistrz |
| [docs/DECISIONS.md](docs/DECISIONS.md) | rejestr decyzji architektonicznych (czytać przed zmianami) |
| [docs/PRODUCT.md](docs/PRODUCT.md) | wymagania produktowe |
| [docs/AUDIT-2026-08.md](docs/AUDIT-2026-08.md) | audyt sierpniowy (źródło Fal 1-3) |
| [docs/ANALIZA-zaciesnienia-bramki.md](docs/ANALIZA-zaciesnienia-bramki.md) | retro-symulacja bramki auto-write |
| [docs/ANALIZA-wzorce-bledow-bramki.md](docs/ANALIZA-wzorce-bledow-bramki.md) | wzorce błędnych kart, warianty zacieśnienia |
