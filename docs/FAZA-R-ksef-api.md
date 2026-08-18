# Faza R — KSeF API 2.0: raport researchu

Data: 2026-08-18. Zakres wg zlecenia z burzy mózgów „Portal klienta + własny ingest KSeF"
(§6 dokumentu decyzji): model uprawnień biura, mechanika auth, API pobierania faktur,
środowiska testowe, rekomendacja D8, rozbieżności z tezami.

**Metoda:** 5 równoległych strumieni badawczych (4 × dokumentacja oficjalna, 1 × analiza
lokalnego klienta C#), następnie niezależna weryfikacja 30 kluczowych twierdzeń przez
ponowne pobranie cytowanych źródeł (4 twierdzenia skorygowano brzmieniowo — wersje po
korekcie poniżej). Źródła WYŁĄCZNIE oficjalne: `ksef.podatki.gov.pl`, `gov.pl/web/finanse`,
`github.com/CIRFMF/ksef-docs` (oficjalne repo dokumentacji MF, żywe — ostatni push
21.07.2026), `github.com/CIRFMF/ksef-client-csharp` (oficjalny klient, żywy — 2.7.0
z 22.07.2026) + lokalny klon klienta. Proxy InsERT wykluczone zgodnie z decyzją.

**Pułapka nazwana:** w sieci wiszą doki KSeF 1.0 (API 1.x, stare tokeny sesyjne, hosty
`ksef-test.mf.gov.pl/web`) udające aktualne — strony `www.podatki.gov.pl/ksef/*` są dziś
404/przekierowaniem. Wiarygodne dla 2.0 są tylko `ksef.podatki.gov.pl` i repa CIRFMF.

---

## TL;DR

1. **Teza 2 POTWIERDZONA u źródła**: uprawnienie `InvoiceRead` nadane biuru przez klienta
   obejmuje **wszystkie** faktury klienta — sprzedażowe i zakupowe; biuro uwierzytelnia się
   **własnym certyfikatem** w kontekście NIP klienta; istnieje czysty **read-only**.
2. Jeden certyfikat KSeF biura obsługuje wszystkich klientów, ale **sesja jest per
   kontekst** — N klientów = N równoległych uwierzytelnień (refreshToken ≤7 dni per klient).
3. **Tokeny umierają z końcem 2026** — fundament integracji to XAdES + certyfikat KSeF.
4. **Limity API są ciasne**: eksport paczek i zapytania o metadane po **20/h** na
   kontekst+IP; GET pojedynczej faktury 64/h. Ingest = cykliczne paczki co ≥15 min per typ
   podmiotu, nie polling. Świeżość portalu z własnego ingestu: rząd **15–60 minut**, nie sekund.
5. Incremental sync ma **oficjalny mechanizm gwarantowanej kompletności** (data
   `PermanentStorage` + znacznik HWM) — dokładnie to, czego potrzebuje Ingest Service.
6. Model uprawnień biura jest **w całości testowalny na środowisku TEST** bez żadnych
   produkcyjnych certyfikatów (self-signed + endpointy `/testdata`); dostęp samoobsługowy.
7. **D8: rekomendacja .NET** — oficjalny klient C# za własną fasadą; lokalny klon jest
   15 release'ów w tyle (rc5.5 z 30.10.2025 vs 2.7.0) i ma martwe URL-e — obowiązkowy pull.

---

## 1. Model uprawnień biura (teza 2 — POTWIERDZONA)

**Zakres `InvoiceRead`.** „Uprawnienie do dostępu do faktur w KSeF obejmuje dostęp do
wszystkich faktur danego podatnika, w tym jego faktur sprzedażowych jak i faktur
zakupowych" — [Podręcznik KSeF 2.0 cz. I](https://ksef.podatki.gov.pl/media/cq3laefg/podrecznik-ksef-2-0-cz-i-rozpoczecie-korzystania-z-ksef.pdf),
s. 54 (wrzesień 2025, stan prawny na 1.02.2026).

**Read-only istnieje.** „Wystawianie faktur" (`InvoiceWrite`) i „dostęp do faktur"
(`InvoiceRead`) to odrębne uprawnienia — można nadać wyłącznie jedno
([aktualność MF 27.04.2026](https://ksef.podatki.gov.pl/ksef-news/uprawnienia-i-autoryzacja/)).

**Jak klient nadaje biuru.** Uprawnienie podmiotowe NIP→NIP:
`POST /permissions/entities/grants` (`InvoiceRead`/`InvoiceWrite`, każde z flagą
`canDelegate`) — przez Aplikację Podatnika albo API; wymaga `CredentialsManage`
po stronie nadającego ([uprawnienia.md](https://github.com/CIRFMF/ksef-docs/blob/main/uprawnienia.md),
OpenAPI 2.7.0). FAQ MF: klient **nie** nadaje uprawnień pojedynczym pracownikom biura —
nadaje biuru całościowo, a biuro samo wskazuje osoby.

**Pracownicy biura: uprawnienia pośrednie.** Biuro, uwierzytelnione WE WŁASNYM kontekście,
nadaje pracownikom `InvoiceRead`/`InvoiceWrite` do obsługi klientów przez
`POST /permissions/indirect/grants` — selektywnie (NIP konkretnego klienta) albo generalnie
(wszyscy partnerzy). Warunek: klient nadał biuru dane uprawnienie z `canDelegate=true`.
Odebranie uprawnień biuru dezaktywuje uprawnienia pośrednie pracowników. Osoba
z uprawnieniem pośrednim nie deleguje dalej (Podręcznik cz. I, s. 73–77, przykłady 28–29).

**Praca „w kontekście" — mechanika.** Uwierzytelnienie wskazuje `ContextIdentifier`
(NIP klienta); podpis XAdES składany **własnym** środkiem biura; system w chwili
uwierzytelnienia weryfikuje aktywne uprawnienia w docelowym kontekście
([uwierzytelnianie.md](https://github.com/CIRFMF/ksef-docs/blob/main/uwierzytelnianie.md)).
`accessToken` (JWT, krótki — czytać `exp`) i `refreshToken` (≤7 dni, wielokrotnego użytku,
`POST /auth/token/refresh`) są wydawane dla wskazanego kontekstu. Dokumentacja nie
przewiduje „przełączania kontekstu" w ramach sesji — **dla każdego klienta osobny cykl
uwierzytelnienia** (wniosek złożeniowy: brak takiego endpointu w OpenAPI 2.7.0).

**Certyfikat a kontekst.** Certyfikat KSeF jest nośnikiem tożsamości i **nie przenosi
uprawnień** ([certyfikaty-KSeF.md](https://github.com/CIRFMF/ksef-docs/blob/main/certyfikaty-KSeF.md));
MF wprost o biurach: certyfikat pozwala „uwierzytelnić się w różnych kontekstach" zamiast
logowania do każdego konta osobno (aktualność 27.04.2026). Czyli: **jeden certyfikat
biura + uprawnienia nadane przez klientów = odczyt wszystkich klientów**, bez żadnych
certyfikatów po stronie klienta końcowego.

**Katalog uprawnień 2.0** (potwierdzony podwójnie: docs + enumy oficjalnego klienta):
- osobowe (`persons/grants`): `CredentialsManage`, `CredentialsRead`, `InvoiceWrite`,
  `InvoiceRead`, `Introspection`, `SubunitManage`, `EnforcementOperations`;
- podmiotowe do faktur (`entities/grants`): `InvoiceRead`/`InvoiceWrite` + `canDelegate`;
- podmiotowe procesowe (`authorizations/grants`): `SelfInvoicing`, `RRInvoicing`,
  `TaxRepresentative`, `PefInvoicing`;
- właścicielskie (Owner) — automatyczne dla NIP podatnika, nieodbieralne;
- pośrednie (`indirect/grants`) — model dla pracowników biur.

## 2. Uwierzytelnianie

**Certyfikaty KSeF** ([certyfikaty-KSeF.md](https://github.com/CIRFMF/ksef-docs/blob/main/certyfikaty-KSeF.md),
[strona MF](https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/certyfikaty-ksef/)):
- wydaje **sam system KSeF** (nie są kwalifikowane, honorowane tylko w KSeF);
- dwa typy, certyfikat ma dokładnie jeden: **Authentication** (do API — ten dla nas)
  i **Offline** (tylko QR kod II);
- ważność **≤2 lata**; wniosek w całości przez API: `GET /certificates/limits` →
  `GET /certificates/enrollments/data` (DN z certyfikatu użytego do uwierzytelnienia) →
  CSR PKCS#10 (RSA-2048 / EC P-256; **klucz prywatny nigdy nie opuszcza naszej maszyny**) →
  `POST /certificates/enrollments`;
- limity: NIP — 300 wniosków / **100 aktywnych**; PESEL/fingerprint — 12/6
  ([limity.md](https://github.com/CIRFMF/ksef-docs/blob/main/limity/limity.md));
- **brak procedury odnowienia** — przed wygaśnięciem nowy enrollment (100 aktywnych
  pozwala na zakładkę czasową); `POST /certificates/{serial}/revoke` nieodwracalny;
- bootstrap: **pierwszy** wniosek wymaga uwierzytelnienia podpisem kwalifikowanym /
  pieczęcią (NIP biura) / Profilem Zaufanym; dalej można działać certyfikatem KSeF —
  MF wprost **zaleca** go na produkcji (weryfikacja wewnętrzna, bez OCSP/CRL u dostawców).

**Tokeny.** Tokeny KSeF 1.0 **niekompatybilne** z 2.0. Nowe tokeny 2.0
([tokeny-ksef.md](https://github.com/CIRFMF/ksef-docs/blob/main/tokeny-ksef.md)) są
generowane per kontekst z niezmiennym zestawem uprawnień — ale
[FAQ MF](https://ksef.podatki.gov.pl/pytania-i-odpowiedzi-ksef-20/): **„tokeny będą
działać do końca 2026 r."** Wniosek twardy: **nie budować ingestu na tokenach** —
docelowy mechanizm to XAdES certyfikatem KSeF.

**Przebieg uwierzytelnienia** ([uwierzytelnianie.md](https://github.com/CIRFMF/ksef-docs/blob/main/uwierzytelnianie.md)):
`POST /auth/challenge` (ważny 10 min) → `POST /auth/xades-signature` (XML
`AuthTokenRequest` z `ContextIdentifier`, podpisany XAdES enveloped, RSA/ECDSA-SHA256)
→ `GET /auth/{referenceNumber}` → `POST /auth/token/redeem` → `accessToken` +
`refreshToken`. XAdES podpisuje **tylko** AuthTokenRequest, nie każde żądanie — po
uwierzytelnieniu działa `Authorization: Bearer`. Pełna automatyzacja bez interakcji
człowieka jest możliwa (certyfikat + podpis programowy).

**Sesje.** `GET /auth/sessions` (lista), `DELETE /auth/sessions/...`; unieważnienie
dezaktywuje refreshToken, ale wydane accessTokeny żyją do `exp`. Sesje **wysyłkowe**
(online 12 h / wsadowe) są odrębnym bytem — dla czystego odczytu nieistotne.

**Kryptografia odczytu.** Eksport paczek: klient **sam generuje** AES-256 + IV 128-bit,
szyfruje klucz RSAES-OAEP (MGF1/SHA-256) kluczem publicznym MF
(`GET /security/public-key-certificates` — rotowane, **nie hardkodować**) i wysyła
w żądaniu; paczka wraca zaszyfrowana tym kluczem → deszyfrowanie **AES-256-CBC/PKCS#7**
po naszej stronie ([pobieranie-faktur.md](https://github.com/CIRFMF/ksef-docs/blob/main/pobieranie-faktur/pobieranie-faktur.md),
[klucze-publiczne](https://github.com/CIRFMF/ksef-docs/blob/main/bezpieczenstwo/klucze-publiczne-do-szyfrowania.md)).
`GET /invoices/ksef/{nr}` zwraca XML bez dodatkowej warstwy szyfrowania (ochrona = TLS;
wniosek z braku pola `encryption` + implementacji oficjalnego klienta — wprost niezapisane).

## 3. Pobieranie faktur (InvoiceRead)

**Trzy tryby** (OpenAPI 2.7.0, [open-api.json](https://github.com/CIRFMF/ksef-docs/blob/main/open-api.json)):

| Tryb | Endpoint | Limity (kontekst+IP, sliding window) | Zastosowanie |
|---|---|---|---|
| pojedyncza faktura | `GET /invoices/ksef/{nr}` | 8/s, 16/min, **64/h** | dogrywki, nie sync |
| metadane | `POST /invoices/query/metadata` | 8/s, 16/min, **20/h** | delta-detekcja |
| eksport paczek | `POST /invoices/exports` + `GET /invoices/exports/{ref}` | 8/s, 16/min, **20/h** (status: 10/s, 60/min, 600/h) | **główny tor ingestu** |

Po przekroczeniu — HTTP 429 z `Retry-After`. Bieżące wartości czytać z **`GET /rate-limits`**
(schema `EffectiveApiRateLimits`) — throttling konfigurować z API, nie hardkodować
([limity-api.md](https://github.com/CIRFMF/ksef-docs/blob/main/limity/limity-api.md), 22.11.2025;
uwaga: oficjalny klient C# ma w testach konserwatywniejsze wartości dla eksportu — 4/s, 8/min —
rozbieżność nierozstrzygnięta, patrz Dziury).

**Kierunek zapytania — `subjectType`:** `Subject1` = sprzedażowe kontekstu, `Subject2` =
**zakupowe**, `Subject3`/`SubjectAuthorized` — osobne przypadki. Faktury pobiera się
**oddzielnie per typ podmiotu**
([przyrostowe-pobieranie-faktur.md](https://github.com/CIRFMF/ksef-docs/blob/main/pobieranie-faktur/przyrostowe-pobieranie-faktur.md), 21.11.2025).

**Filtry:** `dateRange` (**max 3 miesiące**; `dateType`: `Issue`/`Invoicing`/
`PermanentStorage`), `ksefNumber`, `invoiceNumber`, `amount`, `sellerNip`,
`buyerIdentifier`, `currencyCodes[]`, `invoicingMode`, `formType` (FA/PEF/RR),
`invoiceTypes[]`, `hasAttachment`. Paginacja metadanych: `pageOffset` + `pageSize`
10–250, cap **10 000 rekordów** na zestaw filtrów (`hasMore` + `isTruncated`).

**Incremental sync — mechanizm oficjalny (kluczowe dla Ingest Service):**
- delta **wyłącznie po dacie `PermanentStorage`** (data trwałego zapisu w repozytorium);
  `Issue`/`Invoicing` „mogą prowadzić do nieprzewidywalnych zachowań" (cytat z dok.);
- odpowiedzi niosą **`permanentStorageHwmDate`** — system **gwarantuje**, że dane poniżej
  tego znacznika są kompletne (ponowne zapytania nie zwrócą w przyszłości dodatkowych
  faktur poniżej HWM); `restrictToPermanentStorageHwmDate=true` włącza twardą spójność;
- algorytm okien przylegających per `subjectType`: `IsTruncated=true` → następne okno od
  `LastPermanentStorageDate`; inaczej od `PermanentStorageHwmDate`;
- zalecenia MF: interwał **≥15 min na typ podmiotu**, ≤20 eksportów/h łącznie;
  dedup po numerach KSeF z `_metadata.json` (okna przylegające mogą się stykać);
- wzorcowa implementacja: `IncrementalInvoiceRetrievalE2ETests.cs` w oficjalnym kliencie.

**Format paczki eksportu:** ZIP w częściach ≤50 MB (AES-256-CBC/PKCS#7), limit
**10 000 faktur / 1 GB** na paczkę (`isTruncated` powyżej), pliki `{ksefNumber}.xml` +
`_metadata.json`; **części pobiera się pod dynamicznymi URL-ami poza limitami API i bez
tokenu**; status eksportu żyje 7 dni, paczka do `packageExpirationDate`; max 10
równoczesnych eksportów per kontekst. Treść: XML w schemie przyjęcia — **rozpoznawać po
`formCode` z metadanych** (FA(2) możliwe dla starszych, nie zakładać FA(3) na sztywno).

**Konsekwencja dla portalu:** świeżość danych z własnego ingestu to rząd 15–60 minut
(cykl eksportów per klient per typ), nie realtime. Initial backfill historyczny =
iteracja okien ≤3-miesięcznych.

## 4. Środowiska

([srodowiska.md](https://github.com/CIRFMF/ksef-docs/blob/main/srodowiska.md);
[komunikat o adresach](https://www.gov.pl/web/finanse/przypominamy-o-zmianie-adresow-srodowisk-ksef--komunikat-dla-integratorow), 15.01.2026)

| Środowisko | API | Charakter |
|---|---|---|
| TEST | `api-test.ksef.mf.gov.pl` (`/v2`) | wersje RC (wyprzedza PRD), self-signed certy, fikcyjne NIP-y, `/testdata` |
| DEMO (= przedprodukcja) | `api-demo.ksef.mf.gov.pl` | konfiguracja produkcyjna, **realne** dane uwierzytelniające, faktury bez skutków prawnych |
| PRD | `api.ksef.mf.gov.pl` | produkcja (ścieżka `/v2` — przez analogię do OpenAPI; wprost niezapisana, patrz Dziury) |

Stare adresy (`ksef-test.mf.gov.pl` itd.) **wyłączone 17.01.2026** bez przekierowań.

**Dostęp do TEST: samoobsługowy**, bez wniosku (otwarte testy od 30.09.2025 —
[komunikat](https://www.gov.pl/web/finanse/start-otwartych-testow-api-ksef-20)).
NIP-y **fikcyjne obowiązkowo**; dane na TEST są **współdzielone między integratorami**
(każdy znający NIP testowy widzi jego dane) — nie odwzorowywać realnych klientów.
Okno serwisowe TEST/DEMO: codziennie 16:00–18:00. TEST wspiera FA(2)+FA(3);
DEMO/PRD tylko FA(3)/FA_PEF(3).

**Model uprawnień biura testowalny w CAŁOŚCI na TEST bez produkcyjnych certyfikatów**,
dwiema drogami ([testowe-certyfikaty-i-podpisy-xades.md](https://github.com/CIRFMF/ksef-docs/blob/main/auth/testowe-certyfikaty-i-podpisy-xades.md)):
1. „naturalną": self-signed cert z NIP fikcyjnego „klienta" (serial `TINPL-<NIP>`) →
   uwierzytelnienie w jego kontekście → nadanie „biuru" `InvoiceRead` (+ pośrednie) →
   self-signed cert „biura" → odczyt w kontekście klienta;
2. skrótem przez `/testdata` (tworzenie podmiotów, nadawanie uprawnień, zmiana limitów) —
   gotowy `TestDataClient.cs` w oficjalnym kliencie.

Lokalne artefakty w klonie (cert + podpisany XML z 7.11.2025) potwierdzają, że flow
self-signed + XAdES był już u nas przećwiczony end-to-end na TEST.

## 5. D8 — runtime Ingest Service: rekomendacja **.NET z oficjalnym klientem za własną fasadą**

**Ocena oficjalnego klienta** (`CIRFMF/ksef-client-csharp`, MIT):
- **pokrycie**: komplet naszego flow — `IAuthCoordinator.AuthAsync(Nip, nipKlienta,
  CertificateSubject|Fingerprint, xmlSigner)` (cały łańcuch challenge→XAdES→tokeny),
  `QueryInvoiceMetadataAsync`, `ExportInvoicesAsync`/`GetInvoiceExportStatusAsync`,
  `GetInvoiceAsync`; pełna macierz uprawnień (buildery grants: person/entity/indirect/…);
- **krypto gotowe w obie strony**: `CryptographyService` (AES-256-CBC/PKCS7 szyfrowanie
  **i deszyfrowanie** paczek, RSA-OAEP-SHA256, ECIES, CSR), `SignatureService` (XAdES
  enveloped RSA/ECDSA-SHA256) — to jest dokładnie ta część, której przepisywanie w TS
  byłoby najdroższe i najryzykowniejsze (XAdES w Node to ból);
- **żywotność**: upstream aktywny (2.7.0 z 22.07.2026, rytm ~1 release/mies., merge'owane
  zewnętrzne PR-y), utrzymywany przez MF — zmiany API dostajemy „za darmo";
- **zastrzeżenia**: god-interface ~50 metod, brak token-store/auto-refresh (tylko
  zdobywanie tokenów), brak retry/Polly, ciężkie zależności zbędne dla headless ingestu
  (MAUI Graphics/Skia, QRCoder) → **własna fasada** z 6–8 metodami: auth-per-kontekst
  z magazynem refreshTokenów, eksport przyrostowy z HWM, deszyfrowanie, dedup, zapis;
- **stan lokalnego klonu: NIE nadaje się bez aktualizacji** — rc5.5 (30.10.2025) jest
  15 release'ów za upstreamem, sprzed przejścia na stabilne 2.0.0, z martwymi URL-ami
  środowisk i bez stałej PRD. Pierwszy krok implementacji: `git pull` do 2.7.0
  i powtórka inwentaryzacji interfejsów (changelogi release'ów puste — trzeba diffem).

**Odrzucone alternatywy:**
- **Python (reuse parsera workera)** — reuse iluzoryczny: parser workera żyje na K1 poza
  repo i parsuje DDK (format nexo), nie surowe FA(3); auth/krypto/XAdES trzeba by napisać
  od zera. Parsowanie FA(3)→nasze struktury to i tak nowy kod niezależnie od języka —
  można go umieścić w fasadzie .NET albo jako osobny krok;
- **TS od zera** — przepisywanie XAdES + AES/RSA-OAEP + modele całego API bez wsparcia
  MF; zysk jednorodności stacku nie równoważy ryzyka kryptografii pisanej ręcznie.

**Deployment** — spójnie z D5: maszyna biura (Windows, obok Bridge) — .NET 8/9 to
naturalne środowisko; certyfikat i klucz prywatny nie opuszczają maszyny biura
(CSR generowany lokalnie — model enrollmentu wprost to wspiera).

## 6. Rozbieżności z tezami burzy mózgów

1. **Teza 2 potwierdzona z wzmocnieniem**: klient nie tylko nie wgrywa certyfikatu —
   nadanie uprawnień robi z Aplikacji Podatnika (lub my przez API w jego kontekście,
   jeśli da nam `CredentialsManage`), a pracownicy biura dostają uprawnienia pośrednie
   od biura bez angażowania klienta. Onboarding = dosłownie „biuro zakłada konto".
2. **Korekta mechaniki „jeden certyfikat czyta wszystkich"**: certyfikat jeden, ale
   **sesja per kontekst** — dla N klientów N cykli uwierzytelnienia i N par tokenów
   (refresh ≤7 dni). Ingest musi zarządzać magazynem sesji per klient; to koszt
   implementacyjny, nie blokada.
3. **Świeżość portalu z własnego ingestu ≠ realtime**: limity 20/h (eksport, metadata)
   per kontekst+IP + zalecenie MF ≥15 min/typ podmiotu ⇒ realny cykl 15–60 min.
   Obietnica „faktura w portalu chwilę po wystawieniu" jest niewykonalna w 2.0 —
   kalibrować komunikację z biurem/prospektem.
4. **Tokeny to ślepa uliczka**: działają do końca 2026 — każda architektura oparta
   o tokeny wymaga przebudowy za ~4 miesiące. Budować od razu na certyfikatach.
5. **Okno filtrów ≤3 miesiące** — backfill historyczny = iteracja okien; do planu P2b.
6. **TEST jest współdzielony** — zakaz odwzorowywania realnych NIP-ów klientów
   w testach (dane widoczne dla innych integratorów).
7. **FA(2) w paczkach możliwe** (starsze faktury) — parser musi patrzeć na `formCode`
   z metadanych, nie zakładać FA(3).
8. Drobna rozbieżność źródeł MF: Podręcznik cz. I (IX 2025) wymienia ePUAP jako kanał
   ZAW-FA, FAQ mówi, że ePUAP nie jest akceptowany od 1.01.2026 — obowiązuje nowszy FAQ.

## 7. Dziury w dokumentacji (jawne — to też wynik)

1. **Retencja danych na TEST** — nieudokumentowana; fikcyjny „klient" i uprawnienia mogą
   zniknąć bez zapowiedzi. Mitygacja: skrypt odtwarzający stan testowy przez `/testdata`.
2. **Limit równoległych sesji uwierzytelniania** — brak liczby (czy biuro może trzymać
   200 aktywnych sesji naraz?). Do ustalenia empirycznie na TEST.
3. **Dokładny TTL accessTokena** — tylko „np. kilkanaście minut"; czytać `exp` z JWT.
4. **Odnowienie certyfikatu KSeF** — brak endpointu `renew`; „nowy enrollment przed
   wygaśnięciem" to inferencja (spójna z limitem 100 aktywnych).
5. **SLA/czas budowy paczki eksportu** — nieudokumentowane (testy MF pollują ~2 min).
6. **Retencja faktur w API** (jak daleko wstecz sięga eksport) — nieznaleziona;
   sprawdzić w FAQ przed planem backfillu.
7. **Produkcyjny bazowy URL z pełną ścieżką** — `https://api.ksef.mf.gov.pl/v2` przez
   analogię do TEST w OpenAPI; wprost niezapisany.
8. **Rozbieżność limitów eksportu** doki (8/s, 16/min) vs oficjalny klient (4/s, 8/min
   w profilu testowym) — czytać `GET /rate-limits` w runtime.
9. **Zakres zmian rc5.5→2.7.0 klienta C#** — release'y bez opisów; wymaga diffu po pullu.
10. **Paczki NuGet**: GitHub Packages CIRFMF wymaga PAT; obecność na nuget.org
    niezweryfikowana.
11. **Finalne rozporządzenie ws. korzystania z KSeF** (wzór ZAW-FA(3)) — w chwili druku
    Podręcznika w toku legislacyjnym; nie zweryfikowano publikacji w Dz.U.
12. **Nagłówek `x-ksef-feature: include-metadata`** przy eksporcie — jest w kodzie
    klienta, nie ma go w OpenAPI 2.7.0; niejasne, czy wciąż potrzebny.

## 8. Następne kroki (propozycja, poza zakresem tego raportu)

1. Aktualizacja klonu klienta do 2.7.0 + inwentaryzacja zmian względem rc5.5.
2. Spike na TEST (samoobsługowy, od zaraz): odtworzenie pełnego łańcucha biura —
   fikcyjny klient nadaje `InvoiceRead` fikcyjnemu biuru → eksport paczki w kontekście
   klienta → deszyfrowanie → FA(3) w ręku. Domyka dziury 2, 5 i walidację D8 w praktyce.
3. Decyzja o strukturze przechowywania surowych FA(3) (Supabase jsonb vs Storage) —
   wejście do projektu P2a.
