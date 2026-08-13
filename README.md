# Fluinty — Panel Wyjątków KSeF

Panel webowy dla księgowych biura rachunkowego. Pozwala rozwiązywać wyjątki — przypadki gdy automat (worker w Pythonie) nie wie jak opisać pozycję na fakturze KSeF. Po rozwiązaniu wyjątku tworzona jest reguła w bazie i automat uczy się.

## 🛠 Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript (strict mode)
- **Style:** TailwindCSS + shadcn/ui
- **Auth:** Supabase Auth (Magic Link)
- **Database:** Supabase PostgreSQL (schema `fluinty`)
- **Forms:** react-hook-form + zod
- **Icons:** Lucide React
- **Hosting:** Vercel

## 🚀 Setup Lokalny

### 1. Instalacja zależności

```bash
npm install
```

### 2. Konfiguracja zmiennych środowiskowych

```bash
cp .env.example .env.local
```

Uzupełnij klucze Supabase w `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=<twój-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<twój-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<twój-service-role-key>
```

### 3. Uruchomienie

```bash
npm run dev
```

Otwórz [http://localhost:3000](http://localhost:3000)

## 🌐 Deploy na Vercel

1. Push na GitHub
2. Import projektu w Vercel
3. Dodaj zmienne środowiskowe
4. Deploy

## 📐 Struktura aplikacji

```
/                   → redirect do /do-akceptacji lub /login
/login              → logowanie Magic Link (email)
/do-akceptacji      → GŁÓWNA: faktury do akceptacji przez księgową
/klienci            → lista klientów biura
/klienci/[nip]      → szczegóły klienta
/reguly             → reguły dopasowań (zakup/sprzedaż tabs, CRUD, paginacja)
/dashboard          → metryki, wykresy, top klienci/reguły
/faktury            → historia operacji na fakturach
/logs               → logi zmian (audit)
```

## 🔐 Role i bezpieczeństwo

- **admin** — widzi wszystkich klientów, pełny dostęp do ustawień
- **ksiegowa** — widzi tylko przypisanych klientów (`biuro_klienci_nipy`)
- **klient** — widzi tylko swoje dane

Dostęp kontrolowany przez:
1. **Whitelist** — `panel_users.email` + `aktywny=true`
2. **NIP filtering** — `getAllowedNips()` w każdej stronie SSR
3. **RLS** — defense-in-depth na poziomie bazy danych

## 📦 Migracje SQL

Migracje znajdują się w `supabase/migrations/`.

## ⌨️ Skróty klawiszowe (strona Do Akceptacji)

Działają na AKTYWNEJ karcie (dziś: pierwsza karta sekcji „Czeka na akceptację")
i nie działają, gdy fokus stoi w polu formularza, na przycisku albo w otwartym
oknie.

| Skrót | Akcja |
|-------|-------|
| Enter | Zatwierdź aktywną kartę |
| E | Edytuj kwoty (modal) |
| ⌘K / Ctrl+K | Wyszukiwarka globalna |
| Esc | Zamyka otwarte okno lub powiększony podgląd |

**Pominięcie faktury NIE MA skrótu klawiszowego** — wyłącznie przycisk „Pomiń"
na karcie. Do 13.08.2026 robił to Esc; zostało to usunięte, bo pominięcia nie da
się cofnąć z panelu, a Esc jest klawiszem odruchowym (docs/DECISIONS.md).
