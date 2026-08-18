# Spike TEST KSeF 2.0 — wyniki (18.08.2026)

Kontynuacja Fazy R (docs/FAZA-R-ksef-api.md, pkt 8.2). Kod spike'a: `spike/ksef-test/`
(jawnie NIE-produkcyjny, poza buildem panelu). Środowisko: WYŁĄCZNIE
`api-test.ksef.mf.gov.pl`, NIP-y losowe/fikcyjne. Uruchomienie: 18.08.2026 ~12:20
(poza oknem serwisowym 16:00–18:00). Klient: oficjalny CIRFMF po `git pull` do **2.7.0**.

## TL;DR — pełny łańcuch biura DZIAŁA end-to-end w 22 sekundy

Fikcyjny klient nadał fikcyjnemu biuru `InvoiceRead` → klient wystawił fakturę FA(3) →
**biuro uwierzytelnione WŁASNYM certyfikatem w kontekście klienta** pobrało ją eksportem
paczki, zdeszyfrowało i sparsowało. Teza 2 z burzy mózgów potwierdzona już nie tylko
w dokumentacji, ale i **empirycznie**. Żaden krok nie odbiegł istotnie od dokumentacji;
niuanse niżej.

## Przebieg i pomiary (jedno uruchomienie, log: `spike-wynik.log` lokalnie)

| Krok | Wynik | Czas |
|---|---|---|
| 1. Auth klienta (self-signed `TINPL-<NIP>`, własny kontekst) | OK | 0,5 s |
| 2. `POST /permissions/entities/grants` — `InvoiceRead` dla NIP biura, `canDelegate=false` | OK (status operacji 200) | 2,1 s |
| 3. Faktura FA(3) w sesji online (szablon oficjalny) → nr KSeF `1139530106-20260818-55447C800001-5A` | OK | 1,4 s |
| 4. **Auth biura: cert z NIP-em biura, `ContextIdentifier` = NIP klienta** | **OK** | 1,5 s |
| 5. `GET /rate-limits` w kontekście klienta | OK (dump niżej) | 0,07 s |
| 6. Eksport paczki (Subject1, `PermanentStorage`, szyfrowanie AES-256) | OK — status 200, **1 faktura w pierwszej paczce** | budowa paczki **3,1 s** |
| 7. Pobranie części (bez tokenu) → deszyfrowanie → rozpakowanie → parsowanie FA(3) | OK — NIP-y, numer, brutto 53,63, 2 pozycje | <0,1 s |
| 8. Równoległe sesje uwierzytelniania (dziura #2) | **8/8 dodatkowych otwartych; `GET /auth/sessions` = 9 aktywnych** | 12,5 s |

Uprawnienie nadane w kroku 2 było aktywne natychmiast (auth biura w kroku 4 przeszedł
~3 s po grancie) — bez propagacji/opóźnień na TEST.

## Domknięcie dziur z Fazy R

**#2 — limit równoległych sesji uwierzytelniania:** przy 9 jednoczesnych aktywnych
sesjach (ten sam podmiot-biuro, ten sam kontekst klienta) — zero odmów. Limitu nie
osiągnięto; wiadomo, że jest ≥9. Dla ingestu biura (sesja per klient, sekwencyjnie
odświeżana refreshTokenem) to wystarczający zapas — limit dokładny pozostaje
nieznany, ale przestał być ryzykiem projektowym.

**#5 — czas budowy paczki eksportu:** 3,1 s dla paczki z 1 fakturą na TEST; faktura
wystawiona sekundy wcześniej była już w eksporcie (PermanentStorage niemal
natychmiastowy). Zastrzeżenie: to TEST przy znikomym wolumenie — na PRD zakładać
sekundy–minuty (jak w Fazie R), nie ekstrapolować 3 s.

**#8 — `GET /rate-limits`:** działa, zwraca pełną strukturę per kategoria. Dump
(TEST, 18.08.2026): OnlineSession 10/30/120; BatchSession 10/20/60; InvoiceSend
10/30/180; InvoiceStatus 30/120/1200; SessionList 5/10/60; SessionInvoiceList
10/20/200; SessionMisc 10/120/1200; **InvoiceMetadata 8/16/20; InvoiceExport 8/16/20;
InvoiceExportStatus 10/60/600; InvoiceDownload 8/16/64**; Other 10/30/120;
CollectiveIdentifier 10/60/120 (format: /s, /min, /h). **Niuans:** wartości są
identyczne z produkcyjnymi z `limity-api.md`, mimo że `srodowiska.md` deklaruje na
TEST limity 10× wyższe — najwyraźniej `/rate-limits` raportuje konfigurację nominalną
(albo domyślne TEST-owe zmieniono). Wniosek bez zmian: throttling ingestu czytać
z `GET /rate-limits` w runtime, nie z dokumentacji.

**#10 — paczki NuGet:** na nuget.org NIE ma `KSeF.Client` (sprawdzone bezpośrednio);
dystrybucja wyłącznie przez GitHub Packages CIRFMF (wymagany PAT z `read:packages`).
Paczki: `KSeF.Client`, `KSeF.Client.Core`, `KSeF.Client.ClientFactory` (nowa —
nie istniała w rc5.5). Dla Ingest Service: ProjectReference do klonu albo PAT.

## Obserwacje odbiegające od dokumentacji / warte zapamiętania

1. **Format paczki eksportu to w praktyce tar (z nagłówkami PAX), nie „ZIP"** —
   w rozpakowanej paczce jest wpis `./PaxHeaders.1/.`, a oficjalny util klienta nazywa
   się `BatchUtils.UnzipTarGzAsync`. OpenAPI mówi o „ZIP dzielonym na części". Dla
   implementacji: używać utila klienta / biblioteki tar, nie zakładać `System.IO.Compression.ZipArchive`.
2. **`/rate-limits` na TEST = wartości produkcyjne** (patrz #8) — rozbieżność
   z deklaracją „TEST ma 10×" w `srodowiska.md`.
3. Odpowiedź auth przechodzi przez status 100 → 200 (polling; util loguje po polsku
   „Uwierzytelnianie w toku/zakończone sukcesem") — przewidziane w dokumentacji,
   działa w ~1 s.
4. Nabywca w szablonie oficjalnym ma NIP `1111111111` — szablon nadaje się do testów
   Subject1 (sprzedażowe wystawcy); do testów Subject2 (zakupowe) trzeba szablonu
   `invoice-template-fa-3-with-custom-Subject2.xml` z NIP-em nabywcy = kontekst.

## Budowanie przy SDK 9 (blocker środowiskowy — rozwiązany lokalnie)

Klon 2.7.0 multi-targetuje `net48;net8.0;net9.0;net10.0`, a maszyna ma SDK 9.0.306 —
restore wywala się na `net10.0` (NETSDK1045). Rozwiązanie bez zmian w klonie i bez
instalacji SDK 10 (sekwencja w `spike/ksef-test/README.md`): restore z globalnym
`-p:TargetFrameworks=net9.0`, PONOWNY restore samego `KSeF.Client.Core` z listą
`"netstandard2.0;net9.0"` (bo build negocjuje z Core netstandard2.0, a globalny
override zostawia tylko net9.0 w assets), potem `build/run --no-restore`.
Docelowo (Ingest Service produkcyjny): po prostu SDK 10 na maszynie ingestu.

## Inwentaryzacja zmian klienta rc5.5 → 2.7.0 (obszary auth/eksport/krypto)

Diff RC5.5..2.7.0 to 758 plików; poniżej wyłącznie to, co dotyka konsumenta
w naszym zakresie.

**BREAKING (kod pisany pod rc5.5 się nie skompiluje / zmieni zachowanie):**
- `IKSeFClient` rozbity na **14 sub-interfejsów** (`IAuthorizationClient`,
  `IInvoiceDownloadClient`, `IGrantPermissionClient`, `IPermissionOperationClient`,
  `IActiveSessionsClient`…) — wywołania przez agregat `IKSeFClient` kompilują się
  dalej, łamią się mocki/własne implementacje;
- `ISignatureService` i `IQrCodeService` **usunięte** — `SignatureService.Sign(...)`
  jest teraz statyczne (łamie wstrzykiwanie);
- `IAuthCoordinator.AuthAsync` — zamieniona kolejność dwóch ostatnich parametrów;
  `SubmitXadesAuthRequestAsync` — nowy środkowy parametr `enforceXadesCompliance`;
- `TokenInfo.ValidUntil` i `DateRange.From/To`: `DateTime` → `DateTimeOffset`;
- `InvoiceExportStatusResponse.Status`: `StatusInfo` → `OperationStatusInfo`;
- `ExportInvoicesAsync(..., includeMetadata, ...)` — `[Obsolete]` (parametr
  ignorowany od 27.10.2025; spike jeszcze go używa — w Ingest Service brać nowe
  przeciążenie bez `includeMetadata`);
- `ApiConfiguration` przeniesione do `KSeF.Client.DI`, usunięte `ApiPrefix`;
  **CircuitBreaker domyślnie WŁĄCZONY**, HTTP/2 preferowane, timeout 5 min.

**NOWE istotne dla ingestu:**
- `InvoiceExportRequest.CompressionType` (`TarGz` | `Zip`, **domyślnie TarGz** — to
  wyjaśnia obserwację nr 1 wyżej) i `OnlyMetadata`;
- komplet HWM w modelach: `DateRange.RestrictToPermanentStorageHwmDate`,
  `PagedInvoiceResponse.PermanentStorageHwmDate`,
  `InvoiceExportPackage.PermanentStorageHwmDate/LastPermanentStorageDate/IsTruncated`;
- `IKSeFClientFactory` (nowy projekt `KSeF.Client.ClientFactory`):
  `KSeFClient(Environment.Test|Demo|Prod)` — wielośrodowiskowość bez ręcznej konfiguracji;
- `ICertificateFetcher` + `SetExternalMaterials` (praca offline z certyfikatami MF);
- multitarget rozszerzony o `netstandard2.0` i `net10.0`.

**Hosty:** `KsefEnvironmentsUris` ma już nowe adresy (api-test/api-demo/api) + nową
stałą **PROD** (w rc5.5 nie istniała); doszły `KsefQREnvironmentsUris`
i `LighthouseEnvironmentsUris`.

**Zastrzeżenie do kodu spike'a:** spike referencjonuje `KSeF.Client.Tests.Utils`
(projekt testowy, nie-NuGet) — świadomy skrót jednorazowy. Ingest Service ma
KOPIOWAĆ wzorce (auth flow, download+decrypt) do własnej fasady, nie
referencjonować projektu testowego.

## Wnioski dla P2a

1. Cały łańcuch biura jest odtwarzalny na TEST w kilkadziesiąt sekund — nadaje się
   na test regresyjny/smoke Ingest Service (skrypt = ten spike).
2. Oficjalny klient 2.7.0 obsłużył wszystko bez jednej łatki — rekomendacja D8
   (fasada nad oficjalnym klientem) potwierdzona w praktyce.
3. Do świeżego środowiska co uruchomienie: NIP-y losowe = czysty stan bez sprzątania;
   pełny scenariusz „klient nadaje → biuro czyta" nie wymaga `/testdata`.
