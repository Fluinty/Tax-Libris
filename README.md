# Fluinty — Panel Wyjątków KSeF

Panel webowy dla księgowych biura rachunkowego **Tax-Libris**. Pozwala rozwiązywać wyjątki — przypadki gdy automat (worker w Pythonie) nie wie jak opisać pozycję na fakturze KSeF. Po rozwiązaniu wyjątku tworzona jest reguła w bazie i automat uczy się.

## 🛠 Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript (strict mode)
- **Style:** TailwindCSS + shadcn/ui
- **Auth:** Supabase Auth (email + password)
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
NEXT_PUBLIC_SUPABASE_URL=https://hqfpervludkqrfgmjnuo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<twój-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<twój-service-role-key>
```

### 3. Setup bazy danych

**Schemat `fluinty` musi być w "Exposed schemas" w Supabase API settings.**

W Supabase SQL Editor uruchom trigger tworzący `user_profiles`:

```sql
-- Trigger: auto-create user profile on signup
CREATE OR REPLACE FUNCTION fluinty.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO fluinty.user_profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'accountant'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION fluinty.handle_new_user();
```

### 4. Pierwszy admin

1. W Supabase Studio → Auth → Users → **Invite User**
2. Po dodaniu użytkownika:

```sql
UPDATE fluinty.user_profiles SET role = 'admin' WHERE email = 'twoj@email.pl';
```

### 5. Uruchomienie

```bash
npm run dev
```

Otwórz [http://localhost:3000](http://localhost:3000)

## 🌐 Deploy na Vercel

1. Push na GitHub
2. Import projektu w Vercel
3. Dodaj zmienne środowiskowe (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
4. Deploy

## 📐 Struktura aplikacji

```
/                   → redirect do /wyjatki lub /login
/login              → logowanie email + password
/wyjatki            → GŁÓWNA: lista wyjątków (zakup/sprzedaż tabs, historia per zapis)
/klienci            → lista klientów biura
/reguly             → reguły dopasowań (zakup/sprzedaż tabs, CRUD, paginacja)
/dashboard          → metryki, wykresy, top klienci/reguły, ostatnia aktywność
```

## 📦 Migracje SQL

Migracje znajdują się w `supabase/migrations/`. Wykonuj je w Supabase SQL Editor → "Run without RLS".

### `20260428_typ_dokumentu.sql` (Sesja 3)

Dodaje kolumnę `typ_dokumentu` do `fluinty.rules` i `fluinty.exceptions_queue` z heurystycznym backfillem. **Musisz ją wykonać** zanim panel rozdzieli reguły/wyjątki na zakupowe i sprzedażowe.

```bash
# Skopiuj zawartość pliku i wklej w Supabase SQL Editor:
cat supabase/migrations/20260428_typ_dokumentu.sql
```

## 🔐 Role

- **accountant** — domyślna rola — widzi wszystko, nie może zmieniać `auto_write_enabled`
- **admin** — pełny dostęp, może zmieniać ustawienia klientów

## ⌨️ Skróty klawiszowe (strona Wyjątki)

| Skrót | Akcja |
|-------|-------|
| ↑ / ↓ | Nawigacja między kartami |
| Enter | Zatwierdź aktywną kartę |
| Esc | Pomiń aktywną kartę |
| / | Focus na wyszukiwarkę klientów |

## 🏗 Trade-offs & Decyzje

1. **RLS wyłączone** — na MVP używamy `service_role` w Server Actions. RLS do dodania.
2. **Brak dark mode** — branding Tax-Libris jest light-only, dark mode jako opcja w przyszłości.
3. **Aggregate queries** — counts reguł/wyjątków robione w JS zamiast SQL aggregates (prostsze, wystarczające na ~300 klientów).
4. **No real-time** — lista wyjątków odświeża się po akcji (revalidatePath), nie przez Supabase Realtime.
5. **NULL typ_dokumentu → zakup** — stare rekordy sprzed migracji traktowane jako zakupowe (domyślna heurystyka).

## 🔮 Backlog — Do dodania

- [ ] RLS policies na tabelach
- [ ] Supabase Realtime (live updates listy wyjątków)
- [ ] Bulk actions (zatwierdzanie wielu wyjątków naraz)
- [ ] Mobile navigation (hamburger menu)
- [ ] Eksport danych (CSV/Excel)
- [ ] Dark mode (opcjonalny)
