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
- 2026-08-12 | Fix fantomowych eventow WDROZONY droga panelowa (widok v2
  nietkniety): resolveAiBaseline dociaga ai_kwoty/ai_opis z exceptions_queue
  gdy v2 daje NULL; buildEditDiff porownuje wartosciowo z KWOTA_EPS=0.005
  (pol grosza — szum zaokraglen odpada, korekta o grosz przechodzi), "z" w
  diffie to odtad REALNA wartosc AI (a przy bledzie odczytu baseline'u z=null,
  nigdy fabrykowane 0); pusty obiekt {} i pusty string traktowane jak brak
  baseline'u (normalizacja po obu zrodlach); event edited tylko przy niepustym
  realnym diffie; blad odczytu baseline'u -> warning w zwrotce (toast) z
  informacja o mozliwej niedokladnosci flag, nie blokada approve. Historycznych eventow NIE kasujemy — konsumenci filtruja:
  sekcja nauki liczy poprawke tylko z kluczy z realna zmiana vs
  ai_kwoty_per_kolumna KARTY (realDiffKeys), fantomy w calosci pomijane;
  wycofany warunek defense-in-depth z 11.08 (flagi wiarygodle — audyt 30/30);
  zdanie reguly KPiR partycjonowane po ai wartosci karty, nie po payload.z
  | payload.z historycznych eventow to fantomowe 0, jedyna prawda o kwotach
  AI jest na karcie; po fixie nowe eventy sa juz samonosne.
- 2026-08-12 | Read-only server actions z bramka assertNipReadAccess
  (getZapisHistory, getSimilarPozycje, checkExceptionStatus) wg wzorca
  gateFakturaHistory: blokada roli 'klient', scoping po przypisanych NIP-ach,
  fail-closed przy nierozstrzygnietym NIP; identyfikatory z wejscia
  (fakturaId/queueId/zapisId/pozycjaId/exceptionId) walidowane
  Number.isSafeInteger przed uzyciem w filtrach; getZapisHistory dodatkowo
  tnie WSZYSTKIE odczyty .eq(client_nip) do rozstrzygnietego wlasciciela,
  bo zapis_id z Rachmistrza numeruje sie per ksiega klienta i koliduje
  miedzy klientami (wiersze bez client_nip pomijane — fail-closed);
  checkWhitelist (login/actions.ts) USUNIETY jako martwy endpoint — proba
  "generycznej odpowiedzi" nie zamykala enumeracji (boolean allowed dalej
  rozroznial konta), a logowanie idzie bezposrednio przez Supabase auth
  | server actions to publiczne endpointy POST, a service_role omija RLS —
  kazdy odczyt bez jawnej bramki to cross-tenant IDOR (audyt 2026-08 par.1).
- 2026-08-12 | Wszystkie zapisy panelu do kart aktywnych (approveFaktura,
  approveExceptionFull, resolveException, ignoreFaktura, updateJpkSection,
  resetJpkSection, updateFinalZapisVAT) maja guard statusu
  .in('status',['pending','pending_review']).select('id') na OBU tabelach
  (exceptions_queue + faktury) — pusty wynik = blad "Faktura zmienila
  status"; zaden blad zapisu nie jest polykany. Semantyka drugiego zapisu
  (tabele nie sa transakcyjne): w approve*/resolve sync do faktury po
  udanym zapisie queue nie cofa decyzji, ale wraca jako WARNING (toast,
  updateFakturaOnFinish), a dla karty faktury-native (queueId=null) to
  jedyny zapis = pelny blad; w updateJpk*/updateFinalZapisVAT/ignoreFaktura
  porazka drugiej tabeli zwraca jawny komunikat "Zapis czesciowy: ..."
  (nie udaje, ze nic sie nie stalo). resolveExceptionIds sprawdza error obu
  odczytow faktury, a fallback "czysty queue-id" bierze WYLACZNIE przy
  data===null && error===null | bez guardu podwojny Enter/stala lista
  nadpisywaly karte juz zaksiegowana (worker ksieguje z tych pol);
  `if (error && !queueId)` raportowal nieudany zapis jako sukces;
  przejsciowy blad odczytu faktury zamienial faktury.id w queue.id i UPDATE
  mogl trafic w CUDZA karte (v2.id === faktury.id !== queue.id); pelna
  atomowosc wymaga RPC/plpgsql — kandydat na fale 2-3.
- 2026-08-12 | Status 'rolled_back' (36 kart w prod, 22 bez resolved_at) to
  status HISTORYCZNY — relikt recznych rollbackow wykonywanych przez
  wlasciciela na K1 sprzed asynchronicznej sciezki workera
  (rollback_requested -> pending_review | rollback_failed z ARCHITECTURE).
  Panel go nie ustawia i nie ustawial; nowych kart 'rolled_back' nie tworzyc.
  Obsluga w UI (badge/filtr na /faktury, union typu ExceptionItem) i decyzja
  "wskrzesic czy wygasic" — osobne zadanie (fale 2-3, wymaga uzgodnienia
  slownika statusow z workerem na K1) | 22 cofniete i NIEzaksiegowane faktury
  sa dzis niewidzialne w panelu (kolejka bierze pending/pending_review) —
  zanim dostana UI, musi byc jasne, ze to nie jest zywa czesc kontraktu
  panel-worker.
- 2026-08-12 | KONTRAKT final_* PRZYWROCONY: zatwierdzenie BEZ realnej edycji
  zapisuje final_kwoty_per_kolumna = final_zapis_vat_data =
  final_kpir_pojazdowe_data = NULL w OBU tabelach (dotad szly tam kopie ai_*,
  wprost wbrew wpisowi z 2026-08-05). KRYTERIUM JEST PER POLE: zapisujemy
  final_X wtedy i tylko wtedy, gdy rozni sie od tego, co worker i tak wyliczy
  z ai_* (kwoty z tolerancja KWOTA_EPS, zapis VAT i dane pojazdowe porownaniem
  strukturalnym niezaleznym od kolejnosci kluczy). NIE wystarczy globalna flaga
  edycja_realna — final_zapis_vat_data i final_kpir_pojazdowe_data to wartosci
  WYPROWADZONE (ai + edycje inline + wykluczenia art.88/NKUP + auto-korekta
  rodzaj_odliczenia), a nie kopie AI; zerowanie ich przy czystym kliku
  kasowaloby wykluczenia, ktore karta wlasnie pokazala ksiegowej, i worker
  odliczylby VAT np. od noclegu (recenzja wielo-agentowa zlapala to jako
  KRYTYCZNE przed pushem). Porownanie z baseline'em widzi tez zmiany
  przychodzace kanalami BEZ wlasnej flagi edycji: EditModal (rejestr,
  transakcja, rodzaj odliczenia, wiersze VAT) i updateFinalZapisVAT
  (transakcja zagraniczna) — buildEditDiff ich nie widzi, bo ignoruje wlasne
  argumenty finalVat/finalPojazd (audyt par.4, „znane"). Przy nierozstrzygnietym
  baseline (blad odczytu) zapisujemy wartosc — lepiej nadmiarowy final niz
  utracona korekta.
  resolved_opis i final_opis NIE naleza do tej trojki i sa ustawiane ZAWSZE —
  worker pomija karte bez opisu przy ksiegowaniu. Przy okazji domkniete
  „znane" z audytu par.4: approveExceptionFull nie zapisywal
  final_kwoty_per_kolumna do tabeli faktury, wiec zostawala tam stara kopia.
  demo-seed przestaje wypelniac final_* na kartach pending (tylko karty
  zakonczone dostaja final_*).
  Potwierdzenie na workerze (K1, przed wdrozeniem): kwoty czytane jako
  `final or ai` (l. 6692-6693), kwoty_source = „AI (zatwierdzone bez zmian)",
  S40b to `if not final_kwoty`, S40 REBUILD odbudowuje zapis VAT przy
  null+null, guardy rezimowe wymagaja truthy final (przy null = no-op).
  UWAGA na przyszlosc: kryterium jest binarne — edycja SAMEGO OPISU tez
  ustawia edycja_realna=true, wiec wtedy final_* zapisza sie jak dotad
  (kopie AI). Metryki to nie rusza, bo pct_ksiegowa liczy sie z
  edycja_ksiegowa, ktora opis z definicji pomija
  | „final = kopia ai" lamalo kontrakt, zatruwalo badge „kandydat auto"
  i bylo mina dla kazdego konsumenta ufajacego docs; worker jest zbudowany
  pod final=null i przy nim ksieguje z ai_*.
- 2026-08-12 | Rejestr VAT liczy JEDNA funkcja dla podgladu i dla zapisu:
  applyPozycjeVatFinal + computeEffectivePozycjeVat (merge-helpers), wolane
  i przez FakturaCard.renderZapisVat, i przez mergeInlineEditsVat. Przy
  scalaniu dwoch kopii rozstrzygniete swiadomie: (a) wykluczenia art.88/NKUP
  TYLKO dla zakupu (NULL=zakup) — art. 88 dotyczy VAT naliczonego, a w prod
  sa 4 karty sprzedazy z pozycja nkup/brak (3 otwarte), ktorym approve
  wycinal VAT nalezny z rejestru, choc podglad pokazywal pelny; (b) reczna
  tabela VAT ksiegowej NIE jest przeliczana z pozycji (keepManualRows) —
  dotad blok wykluczen nadpisywal ja bezwarunkowo i korekta znikala;
  (c) stawka odliczalna nieobecna w zapisie AI jest DOKLADANA do rejestru
  ze stawka_id=null (worker dopasowuje przy ksiegowaniu) zamiast wypadac
  bez sladu; (d) pusta baza pozycji = brak przeliczenia (nie syntetyzujemy
  rejestru z pozycji — bez stawka_id byłby nie do zaksiegowania);
  (e) podglad pokazuje teraz rowniez pozycje_vat_final, wiec „Zapis VAT" na
  karcie to dokladnie to, co pojdzie do bazy. Zaokraglen w sciezce VAT
  swiadomie NIE dokladamy (dzis ich nie ma; to zmiana payloadu do workera)
  | dwie kopie tej samej logiki rozjechaly sie w piaciu wymiarach naraz,
  a kazdy rozjazd to inna kwota w rejestrze VAT niz ta, ktora zaakceptowala
  ksiegowa.
- 2026-08-12 | normalizujRezim bierze procent WYLACZNIE sprzed znaku '%',
  przy kilku roznych procentach zwraca null, obsluguje polski przecinek
  | regex bez kotwicy lapal pierwsza liczbe zdania, wiec „leasing limit
  150 tys proporcja 75%" dawalo rezim 100% zamiast 75% (koszt zawyzony
  o 1/3); „55,56%" (realna wartosc rezim_proc w prod) bylo dotad null.
  Lepszy brak rezimu niz zly rezim.
- 2026-08-12 | Escape na karcie NIGDY nie pomija faktury, gdy w DOM jest
  otwarta jakakolwiek nakladka (dialog/sheet/popover/select/tooltip,
  takze cudza i ta w trakcie animacji zamykania) ani gdy fokus jest na
  INPUT/TEXTAREA/SELECT/contentEditable | dotad ochrone dawal wylacznie
  stopPropagation w Base UI, a guard karty sprawdzal tylko INPUT/TEXTAREA
  i showEditModal: Escape na sfokusowanym natywnym selekcie ustawial
  'ignored' bez potwierdzenia i bez drogi powrotu (100 kart w tym stanie).
- 2026-08-12 | Kolejka /do-akceptacji pobiera faktury_pozycje JAWNA lista
  kolumn (POZYCJE_KARTY_COLUMNS) + typ FakturaPozycjaKarta | select('*')
  ciagnal nazwa_embedding (vector 1536): pomiar na realnej kolejce
  (343 karty / 955 pozycji) 18,76 MB -> 0,50 MB, czyli -97,3%, przy kazdym
  wejsciu i auto-refreshu co 30 s. Zawezenie selectu MUSI isc w parze
  z zawezeniem typu, inaczej TypeScript obiecuje pola, ktorych w runtime
  nie ma. Widok exceptions_queue_v2 sprawdzony — nie zawiera embeddingu.
- 2026-08-12 | Martwe server actions USUNIETE zamiast naprawiane:
  resolveException/ignoreException/addProponowanyToClientOpisy
  (wyjatki/actions.ts — caly plik; toggleAutoWrite przeniesiony do
  klienci/actions.ts, gdzie zyja jego importery), approveWithEdit
  (do-akceptacji), updatePozycjaKpir (pozycje-actions) | 'use server' czyni
  kazdy eksport zywym endpointem POST; martwe akcje autoryzowaly inny obiekt
  (faktury.id), niz zapisywaly (exceptions_queue.id) — nakladajace sie
  sekwencje id = dostep do cudzej karty; kod bez importera nie przechodzi
  przez review zmian i gnije w miejscu, gdzie sekwencja id sie naklada.
