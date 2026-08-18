# Spike TEST KSeF 2.0 — kod NIE-produkcyjny

Jednorazowy spike badawczy (wyniki: `docs/SPIKE-TEST-ksef.md`). **Nie jest częścią
panelu** — Next.js/tsc nie widzą tego katalogu; nic stąd nie wolno importować do `src/`.

Co robi (`Program.cs`, sekwencyjnie, z pomiarami czasu):
1. fikcyjny klient (losowy NIP, self-signed cert `TINPL-<NIP>`) uwierzytelnia się
   we własnym kontekście na środowisku **TEST** (`api-test.ksef.mf.gov.pl`),
2. nadaje NIP-owi fikcyjnego biura uprawnienie podmiotowe `InvoiceRead`
   (`POST /permissions/entities/grants`, `canDelegate=false`),
3. wystawia fakturę FA(3) w sesji online (szablon z oficjalnego repo klienta),
4. biuro uwierzytelnia się **własnym** certem w **kontekście klienta** (sedno tezy 2),
5. `GET /rate-limits` (dziura #8 z Fazy R),
6. eksport paczki (Subject1) → polling statusu (pomiar — dziura #5) → pobranie
   części → deszyfrowanie AES-256-CBC → unzip → wyszukanie faktury po nr KSeF,
7. parsowanie FA(3) XML do podstawowych pól (NIP-y, numer, brutto, pozycje),
8. próba utrzymania kilku równoległych sesji uwierzytelniania (dziura #2).

## Wymagania i budowanie

- .NET SDK 9+,
- lokalny klon oficjalnego klienta: `C:\Users\Adamn\ksef-client-csharp` na tagu
  **2.7.0** (ścieżki względne w `.csproj` — klon leży obok katalogu OneDrive;
  na innej maszynie popraw ścieżki),
- klon multi-targetuje `net10.0`, więc przy SDK 9 budować TAK (kolejność ważna):

```bash
dotnet restore -p:TargetFrameworks=net9.0
dotnet restore C:/Users/Adamn/ksef-client-csharp/KSeF.Client.Core/KSeF.Client.Core.csproj '-p:TargetFrameworks="netstandard2.0;net9.0"'
dotnet build --no-restore -p:TargetFrameworks=net9.0
dotnet run --no-build -p:TargetFrameworks=net9.0
```

## Zasady

- WYŁĄCZNIE środowisko TEST i WYŁĄCZNIE losowe/fikcyjne NIP-y — TEST jest
  współdzielony między integratorami (dane widoczne dla innych); zakaz
  odwzorowywania realnych klientów biura,
- okno serwisowe TEST: codziennie 16:00–18:00 — nie planować uruchomień,
- wynik uruchomienia ląduje w `spike-wynik.log` (gitignored).
