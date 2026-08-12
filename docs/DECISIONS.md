# Rejestr decyzji (dlaczego jest tak, a nie inaczej)

Format: DATA | DECYZJA | POWOD. Agent: przy kazdej istotnej decyzji architektonicznej
DOPISZ wpis (commit razem ze zmiana). Nie "naprawiaj" rzeczy z tej listy bez rozmowy.

- 2026-05 | Kazda faktura przez bramke akceptacji ksiegowej (auto_write globalnie off)
  | zaufanie buduje sie metrykami; automat dopiero po progach uzgodnionych z biurem.
- 2026-06 | Ocena zgodnosci z prawem TYLKO z zywym groundingiem (ISAP/MF), nie z wiedzy
  modelu | reviewer v1 polegl na legalnej zmianie stawki VAT, ktorej model nie znal.
- 2026-07 | Reprocess karty = DELETE + ponowne przetworzenie (nie PATCH na pending)
  | pre-filter blokuje wpisy z istniejacym rekordem; DELETE daje czysta karte.
- 2026-07 | Rollback zawsze z zapisVatId | bez niego zapis VAT zostaje sierota
  w rejestrze; rollbacki tylko w otwartym okresie.
- 2026-08-05 | final_* NIE jest kopia ai_* przy zatwierdzeniu bez zmian | kopiowanie
  zatruwalo metryke edycji (Czajecki "201 decyzji" przy realnych ~20). Czysty klik
  = edycja_realna/ksiegowa false.
- 2026-08-05 | Metryka czystosci: os "opis" nie jest korekta ksiegowa; external
  poza mianownikiem | opis nie wplywa na KPiR/VAT; external nie swiadczy o AI.
- 2026-08-06 | Bridge przy ksiegowaniu ustawia TypWynikowegoDokumentuKsiegowego=2
  razem ze StatusKsiegowy=5 | wartosc 0 crashowala nexo przy podgladzie KSeF
  (dowod przyczynowy A2/A3 Belego; backfill 776 rekordow wykonany).
- 2026-08-06 | Roznice "DO ZAPLATY" vs tabela VAT sa OBJASNIANE, nigdy korygowane
  | to legalne rozrachunki FA(3) (raty sprzetu, salda, kapital leasingu fin.);
  sekcja Rozliczenia + wiersz roznicy w OBU komponentach podgladu.
- 2026-08-06 | Wiersz clients klienta DEMO nigdy nie jest kasowany; reset czysci
  tylko dane transakcyjne | 3 kolejne tabele-dzieci lamaly reset przez FK;
  upsert zamiast delete+insert.
- 2026-08-11 | Klient DEMO poza sumami stopki /klienci, ale ZACHOWUJE wlasne metryki
  w wierszu | wiersz sluzy do prezentacji; migracja zerujaca metryki demo celowo
  NIE wykonana (plik z adnotacja w migrations/).
- 2026-08-11 | Funkcje RPC: REVOKE PUBLIC/anon/authenticated + GRANT service_role
  | domyslny EXECUTE dla PUBLIC pozwalal zalogowanemu klientowi pobrac metryki
  wszystkich firm; panel wola wylacznie przez service_role.
- 2026-08-11 | Rola 'klient' nie ma ZADNYCH akcji modyfikujacych w module klienci
  | portal klienta koncowego to osobny przyszly modul z wlasnym zakresem.
- 2026-08-11 | DDL wykonuje czlowiek z plikow migrations/; agent ma (docelowo)
  MCP read-only | jedna baza = produkcja; introspekcja tak, zapis do schematu nie.
- 2026-08-11 | Wszystkie akcje modyfikujace modulu klienci przechodza przez
  assertCanWriteClient (admin: pelny dostep; ksiegowa: w zakresie przypisanych
  NIP-ow, demo tylko gdy jawnie przypisane; rola 'klient': blokada calkowita;
  NIP walidowany — format 10 cyfr + istnienie w clients); addClient i reset demo
  wylacznie admin; payload/patch sanityzowany (whitelist kolumn w
  updateClientData, client_nip/id wycinane z payloadow pojazdow/opisow) | server
  actions to publiczne endpointy POST, a service_role omija RLS — kontrola musi
  byc jawna, server-side, z panel_users po emailu sesji, i obejmowac TRESC
  patcha, nie tylko parametr nip (mass assignment).
- 2026-08-11 | logFakturaEvent nie polyka bledow: console.error + pole `warning`
  w zwrotce akcji (toast.warning), operacja glowna przechodzi | approve nie moze
  padac przez os czasu, ale znikajace zdarzenia lamaly regule niepolykania bledow.
- 2026-08-11 | Os czasu faktury (sekcja Historia): faktura_events jako kregoslup,
  zdarzenia implicytne (created/resolved/rollback/auto_created) dokladane z kolumn
  karty TYLKO gdy brak eventu o tej semantyce w oknie +-5 s (events wygrywa, bo
  bogatszy); anomalie z kolumny jsonb exceptions_queue.anomalie_historii (osobnej
  tabeli anomalii historycznych w tym srodowisku brak); dane LAZY przy pierwszym
  rozwinieciu | rozproszony slad (events + kolumny kart + anomalie) laczymy w jedna
  chronologie bez dublowania; lista kart bez dodatkowych zapytan (wymog wydajnosci).
  UWAGA: kolumny klasyfikacja_korekty NIE MA — szczegol edycji zyje w
  faktura_events.edited.payload.diff (pole: z -> na) i stamtad go renderujemy.
- 2026-08-11 | Historia faktury (fetchFakturaEvents + fetchFakturaTimeline) za
  wspolnym gateFakturaHistory: blokada roli 'klient' + scoping po NIP jak w
  assertCanWrite. Przy parze fakturaId+queueId rozwiazujemy client_nip NIEZALEZNIE
  dla kazdego klucza i wymagamy zgodnosci (mismatch => odmowa), plus .eq(client_nip)
  na zapytaniach danych; fail-closed przy bledzie odczytu lub nierozstrzygnietym
  NIP dla nie-admina | server actions to publiczne endpointy POST z dowolnymi id,
  a service_role omija RLS: pojedynczy 'autorytatywny' NIP + zaufanie OR-owi
  pozwalal sparowac wlasny fakturaId z cudzym queueId (IDOR miedzy klientami biura).
- 2026-08-11 | Sekcja "Czego system nauczyl sie od ksiegowej" (/klienci/[nip],
  fetchClientLearning): rama odwrocona — poprawki ksiegowej = inwestycja
  ("N poprawek -> M zasad -> K faktur bez zmian"), NIE rejestr bledow AI; "regula"
  to agregat dostawca (nip_dostawcy, fallback znormalizowana nazwa) x kategoria
  (kwota_* -> KPiR, gtu/jpk -> VAT, rezim_changed -> rezim, opis -> styl opisu,
  reszta -> inne) z trescia z NAJNOWSZEJ korekty; dowod skutecznosci = karty
  dostawcy zakonczone PO ostatniej korekcie z edycja_ksiegowa=false (dla stylu
  opisu: edycja_realna=false, bo edycja_ksiegowa z definicji pomija opis)
  ORAZ bez wlasnego eventu korekty — rekonesans 11.08 wykazal 26 kart z eventami
  edited (diff kwot) przy flagach false/false, wiec same flagi nie wystarcza
  za dowod czystosci (rozbieznosc zgloszona osobno do zbadania);
  empty-state liczony z FLAG KART, nie z eventow (edited istnieje dopiero od
  05.08.2026 — klient edytowany wczesniej dostalby falszywe "zero zmian");
  komunikaty mowia o "poprawkach ksiegowych", nie o "zmianach" (edycja_ksiegowa
  z definicji pomija opis); "Kwoty ksiegowane do" tylko gdy diff z=0->na!=0,
  sama korekta wysokosci = "Poprawiona kwota w" (inaczej zdanie klamie o tresci
  korekty); naglowek "N poprawek" liczy kazdy event RAZ, takze przy diffie
  wielokategorii; wylacznie fakty policzalne, zadnych obietnic mechanizmu;
  dane LAZY, stala liczba zapytan (2-3, bez N+1), limity DESC (przy scieciu
  zostaja najnowsze), gate read-only wg wzorca gateFakturaHistory
  | dowod dla wlascicielki biura, ze poprawki sie amortyzuja (argument
  sprzedazowy auto-write), a surowa lista "final != ai" u sceptyka dziala
  odwrotnie.
- 2026-08-12 | AUDYT rozbieznosci flag vs eventow (docs/AUDIT-flagi-vs-eventy.md):
  metryka czystosci NIE jest zawyzona — 30/30 "rozbieznych" kart ma final_kwoty
  rowne ai_kwoty (flagi mowia prawde); to eventy 'edited' nadraportowuja, bo
  baseline diffu (ai_kwoty z widoku exceptions_queue_v2) pochodzi z faktury,
  gdzie jest NULL (kazdy diff to z:0). Uzasadnienie defense-in-depth z wpisu
  2026-08-11 ("flagi niewiarygodne") bylo odwrotne do stanu faktycznego —
  sekcja nauki do korekty: poprawka = event z REALNA zmiana wartosci vs AI.
  Definicji metryki NIE zmieniac na flaga+eventy (skrzywdziloby klientow
  potwierdzajacych kwoty zgodne z AI, np. Medical Group 100->30 p.p.)
  | pct_ksiegowa to fundament decyzji auto-write; fix nalezy sie zrodlu
  sygnalu (baseline diffu / logowanie edited), nie definicji metryki.
