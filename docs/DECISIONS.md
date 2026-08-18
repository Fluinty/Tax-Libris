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
- 2026-08-13 | UZUPELNIENIE do wpisu o 'rolled_back' — SKAD SIE WZIELA CZESC
  TYCH KART, i sprostowanie tezy o ryczaltowcach. Przy przegladzie 100 kart
  'ignored' (13.08) napisalem najpierw, ze 54 z nich pominieto slusznie, bo
  "panel wyklucza klientow na ryczalcie (applyNipFilter), a zadna karta tych
  klientow nie zostala zaksiegowana". OBA CZLONY SA FALSZYWE:
  1. Filtr ryczaltu wszedl commitem f74e4c0 z 2026-06-30 11:03:07, a wszystkie
     54 pominiecia sa z 29.06 07:10-09:20 — DZIEN WCZESNIEJ. W chwili
     pominiecia te karty byly normalnie widoczne w panelu, wiec filtr niczego
     w tamtym momencie nie tlumaczy.
  2. Karty tych klientow BYLY ksiegowane w Rachmistrzu: 11 z nich ma
     naglowek_id_rachmistrz (Pilarczyk 6770051077 -> 118002, 118004, 118006,
     118008, 118010; Kicka 8942368371 -> 109722, 109724, 109726, 109728;
     Swierkot 6521724577 -> 110060, 110062) i wlasnie te karty maja dzis
     status 'rolled_back'.
  Faktyczny przebieg (jedna akcja porzadkowa, nie seria omylek): 29.06 rano
  reczne wyczyszczenie z kolejki trzech ryczaltowcow (07:10-09:20) -> 09:32-09:35
  worker ksieguje 11 pozostalych ich kart -> cofniecie tych zapisow
  ('rolled_back') -> 30.06 11:03 filtr wykluczajacy ryczalt z calego panelu.
  Kontrapunkt do zapamietania: klientow na ryczalcie jest 14, wyczyszczono
  TRZECH; pozostalych 11 ma otwarte karty, ktorych nikt nie pomijal — bo po
  30.06 sa dla panelu niewidoczni. "Ryczalt => pomijamy" NIGDY nie bylo
  polityka biura, bylo jednorazowe czyszczenie
  | teza brzmiala wiarygodnie i zgadzala sie z kodem, ktory widzialem DZIS —
  ale kod byl mlodszy od zdarzenia, ktore mial tlumaczyc. Przy analizie
  zdarzen historycznych sprawdzac date commita wzgledem daty zdarzenia
  (git show -s --format=%ci), nie tylko stan biezacy repo.
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
- 2026-08-12 | Statusy w `faktury` i w `exceptions_queue` POTRAFIA SIE ROZJECHAC
  (przyklad z 12.08: queue 2125 i 2127 maja `external_booked`, a odpowiadajace
  im wiersze `faktury` — `pending`; 13.08 rozjazd na 60 ze 100 kart `ignored`).
  Zrodlem prawdy o stanie karty jest `exceptions_queue` — to z niej ksieguje
  worker i to z niej widok v2 bierze kolumne `status`; kazda analize statusow
  prowadzic na queue, nie na faktury.
  SPROSTOWANIE 13.08.2026: pierwotna wersja tego wpisu twierdzila, ze „widok v2
  serwuje status z faktury, wiec karty wygladaja w kolejce na otwarte" — to
  NIEPRAWDA i nikt tego wtedy nie sprawdzil zapytaniem. Weryfikacja: faktury.id
  440 ma faktury.status='pending', a exceptions_queue_v2 pokazuje 'ignored';
  zadna ze 100 kart 'ignored' nie jest widoczna w kolejce (344 karty pending*,
  z tego 0 ignored w queue). Kierunek jest odwrotny: v2 idzie za queue, a to
  `faktury` niesie nieaktualny status.
- 2026-08-12 | SEMANTYKA `final_* != null` PO FALI 2: to NIE znaczy „ksiegowa
  edytowala". Znaczy tylko tyle, ze wartosc WYPROWADZONA przez panel rozni sie
  od surowego `ai_*` — a rozni sie takze bez udzialu ksiegowej: wykluczenia
  art. 88 / NKUP liczone z klasyfikacji pozycji i auto-korekta
  `rodzaj_odliczenia` 1->2 przy pozycjach czesciowych trafiaja do
  `final_zapis_vat_data` przy zwyklym „Zatwierdz i ksieguj".
  JEDYNE zrodlo prawdy o edycji ksiegowej to flagi `edycja_realna` /
  `edycja_ksiegowa` oraz eventy `faktura_events` (edited / rezim_changed).
  Kazdy przyszly konsument — metryki, badge „kandydat auto", sekcja nauki,
  raporty dla biura, przyszla bramka auto-write — ma pytac o FLAGI i EVENTY,
  nigdy o `final_kwoty_per_kolumna IS NOT NULL` czy `final_zapis_vat_data
  IS NOT NULL`. Analogicznie w druga strone: `final = null` nie znaczy „brak
  danych", tylko „worker ma uzyc ai_*"
  OTWARTE (zlecenie na K1, task.md): czy workerowy S40 REBUILD (sciezka
  null+null) stosuje te same wykluczenia art. 88 / NKUP co panel. Jesli tak —
  kryterium dla `final_zapis_vat_data` da sie uproscic do samej edycji
  ksiegowej; jesli nie — obecne porownanie per pole jest jedynym poprawnym
  | przed Fala 2 `final != null` bylo (nieprawdziwym, bo panel kopiowal ai->final)
  skrotem na „byla edycja"; po zmianie kontraktu ten skrot jest juz nie tylko
  nieprawdziwy, ale i mylacy w druga strone — bez tego wpisu pierwszy konsument
  policzy wykluczenia art. 88 jako „korekty ksiegowej" i zanizy czystosc
  ksiegowa, ktora jest fundamentem decyzji o auto-write.
- 2026-08-12 | Rejestr VAT liczy JEDNA funkcja dla podgladu i dla zapisu:
  applyPozycjeVatFinal + computeEffectivePozycjeVat (merge-helpers), wolane
  i przez FakturaCard.renderZapisVat, i przez mergeInlineEditsVat. Przy
  scalaniu dwoch kopii rozstrzygniete swiadomie: (a) wykluczenia art.88/NKUP
  TYLKO dla zakupu (NULL=zakup) — art. 88 dotyczy VAT naliczonego; w prod jest
  39 kart zakupu z pozycja nkup/brak i niepustym rejestrem VAT (4 otwarte)
  oraz 0 takich kart sprzedazy, wiec scenariusz sprzedazowy jest PROSPEKTYWNY:
  takie karty nie maja rejestru VAT (zapis_vat_data NULL), a przy pustej bazie
  wykluczenia i tak sie nie uruchamiaja (SPROSTOWANIE 12.08.2026 — pierwotne
  uzasadnienie mowilo o „4 kartach sprzedazy, ktorym approve wycinal VAT
  nalezny"; weryfikacja per wiersz tego nie potwierdzila, decyzja zostaje
  sluszna merytorycznie); (b) reczna
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
- 2026-08-12 | [NIEAKTUALNE — uchylone 2026-08-13, patrz ostatni wpis pliku:
  Esc nie pomija juz faktury NIGDY, na zadnej sciezce; ponizsza regula warunkowa
  NIE obowiazuje i nie wolno jej odtwarzac]
  Escape na karcie NIGDY nie pomija faktury, gdy w DOM jest
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
- 2026-08-13 | Escape NIE POMIJA JUZ FAKTURY — w ogole, na zadnej sciezce.
  Klawisz obsluguja wylacznie same nakladki (Base UI zamyka dialog/sheet/
  popover/select i zatrzymuje propagacje); handler karty nie ma juz galezi
  Escape. Pominiecie zostaje dostepne WYLACZNIE przyciskiem „Pomin" na karcie;
  domyslnie NIE MA dla niego skrotu klawiszowego, a gdyby kiedys mial wrocic —
  inna litera niz Esc i z potwierdzeniem w UI. Legenda na karcie i okno
  „Skroty klawiszowe" (RealtimeToast) juz Esc jako „pomin" nie obiecuja.
  Poprzednie podejscie (12.08: trojwarstwowy guard blokujacy Esc, gdy otwarta
  jest nakladka) NIE moglo tego naprawic i test na demo to potwierdzil: na
  karcie BEZ nakladki wszystkie trzy warunki przechodzily i pominiecie sie
  wykonywalo — dwa odruchowe Esc daly dwie karty w 'ignored'. Rozwinieta sekcja
  tez nie chronila, bo Collapsible renderuje sie inline (data-slot
  collapsible-content), a nie jako nakladka
  | pominiecie to decyzja z konsekwencjami — 100 kart w 'ignored' (COUNT na
  produkcji 13.08.2026, zweryfikowany przy tej zmianie)
  i zero drogi powrotnej z panelu (przywrocenie do kolejki to osobny, jeszcze
  niezrobiony punkt raportu rozwojowego) — a Esc jest klawiszem odruchowym:
  naciska sie go, zeby zamknac cokolwiek. Zadnym guardem nie da sie naprawic
  zle dobranego skrotu; wlasciwa poprawka to usuniecie zachowania, nie kolejna
  warstwa warunkow.
- 2026-08-13 | PRZYWRACANIE POMINIETYCH KART: akcja „Przywroc do kolejki" na
  /faktury?status=ignored, wylacznie dla kart pominietych Z PANELU (status
  'ignored' ORAZ resolved_by niepuste i rozne od 'fluinty_auto'). Kart 'skipped'
  NIE dotykamy — to
  pominiecia workera (13.08: wszystkie 115 ma resolved_by NULL, powody w evencie:
  faktura_korygujaca, faktura_zaliczkowa, obca_waluta_EUR). Karta wraca do
  'pending_review' gdy ma ai_proponowany_opis, inaczej do 'pending' (13.08:
  100/100 kart 'ignored' ma opis AI). Zerujemy resolved_by / resolved_at /
  skip_reason; ai_* i final_* nietkniete.
  SKIP_REASON — ostrozniej niz „po prostu wyzerowac": kolumna istnieje TYLKO
  w exceptions_queue (w `faktury` jej nie ma — PostgREST 42703, sprawdzone
  13.08), a dla trzech kart niesie jedyny zapis tego, ze faktura zostala
  zaksiegowana POZA panelem (13.08, zapytanie
  `exceptions_queue?status=eq.ignored&skip_reason=not.is.null`: karty 1286
  i 1289 „zaksiegowano bezposrednio w Rachmistrzu (DDK nie ma juz statusu
  pending w Insercie)", karta 2274 „ST czerwcowy, VAT rozliczony recznie przez
  ksiegowa"). Ciche skasowanie tego pola przy przywracaniu prowadzi wprost do
  podwojnego ksiegowania, dlatego: (1) dialog pokazuje powod na czerwono PRZED
  kliknieciem, (2) trafia on do payloadu eventu i audit_log jako
  `skip_reason_przed`, razem z `pominieta_przez`/`pominieto_at` — bez tego po
  przywroceniu nie dalo sie odtworzyc, kto i dlaczego pominal karte (dla 100
  kart sprzed wdrozenia osi czasu nie ma nawet eventu 'skipped').
  Guard `.eq('status','ignored')` na exceptions_queue; tabela `faktury`
  guardowana SZERZEJ: `.in('status', ['ignored','pending','pending_review'])`.
  Szerzej, bo rozjazd jest tu regula, nie wyjatkiem (13.08, statusy w `faktury`
  dla 100 kart 'ignored': 40x ignored, 38x pending, 22x pending_review) i celem
  jest zrownanie obu tabel. Ale NIE bez guardu: przy statusie terminalnym
  (approved/external_booked) patch wyzerowalby resolved_by/resolved_at wiersza
  juz zamknietego, kasujac informacje kto go zaksiegowal. Dzis takich
  przypadkow nie ma (0/100), rozjazd jest jednak udokumentowany w obie strony,
  wiec zamiast nadpisac — ostrzezenie w toascie (wzorzec updateFakturaOnFinish).
  Autoryzacja: najpierw bramka roli (getAllowedNips + odrzucenie roli 'klient')
  PRZED odczytem karty, dopiero potem assertCanWriteClient(NIP KARTY).
  Kolejnosc ma znaczenie: przy odczycie przed bramka komunikaty „nie znaleziono
  karty" vs „brak uprawnien" byly dla dowolnego zalogowanego wyrocznia
  istnienia id w calej kolejce biura (ten sam wyciek, co naprawiony wczesniej
  w checkExceptionStatus). NIE assertCanWrite(id): to rozwiazuje id najpierw
  jako faktury.id, a sekwencje obu tabel sie
  nakladaja, wiec dla queue-id autoryzowaloby na NIP-ie cudzej karty. Z tego
  samego powodu akcja NIE uzywa resolveExceptionIds — fakture znajduje po
  legacy_queue_id, i dodatkowo odmawia zapisu, gdy `faktury.client_nip` rozni
  sie od NIP-u karty kolejki (nieaktualny klucz obcy = zapis do cudzej faktury;
  wzorzec z gateFakturaHistory. 13.08: 100/100 kart ma wiersz w `faktury`
  i zero niezgodnosci NIP — guard jest prospektywny).
  Zdarzenie osi czasu: NOWY typ 'restored' (nie 'queued' — to zdarzenie
  pipeline'u ingestu, drugie „Dodana do kolejki" myliloby czytajacego historie
  i konsumentow rozrozniajacych zdarzenia systemowe od decyzji czlowieka).
  Wymaga migracji CHECK: migrations/2026-08-restored.sql (STATUS: DO WYKONANIA
  RECZNIE). Do czasu jej wykonania akcja dziala, a brak eventu wraca jako
  ostrzezenie w toascie — logFakturaEvent nie wywraca operacji.
  Migracja NIE odtwarza ograniczenia z listy 21 wartosci ani z szablonu:
  czyta aktualna definicje i DOKLEJA jeden element do jej tablicy (replace na
  `ARRAY[...]`), wiec ksztalt predykatu, rzutowania i ewentualne NOT VALID
  zostaja bit w bit. Powod: listy nie da sie odczytac przez PostgREST, a typ
  „dozwolony-ale-nieuzywany" ma zero wierszy, wiec skan ADD CONSTRAINT nie
  wykrylby jego cichego skasowania. Blok jest fail-closed — przerywa przy
  wiecej niz jednym CHECK-u na event_type, przy definicji bez ARRAY[...],
  przy literalach lub AND/OR poza lista i gdy liczba elementow nie zgadza sie
  z liczba przecinkow.
  Ostrzezenie (nie blokada) w dialogu, gdy faktura jest z wczesniejszego
  okresu — samo przywrocenie nie ksieguje, ale pozniejsze zatwierdzenie moze
  trafic w zamkniety miesiac (DECISIONS 2026-07 o rollbackach). Liczone
  z DATY DOKUMENTU (data_wystawienia, fallback data_sprzedazy), nie z daty
  pominiecia: miesiac ksiegowania wynika z dokumentu, wiec faktura czerwcowa
  dociagnieta z KSeF i pominieta w sierpniu nie moze uchodzic za biezaca.
  Porownanie tekstowe prefiksu YYYY-MM z biezacym miesiacem w Europe/Warsaw —
  bez new Date(), ktore przesuwaloby daty kalendarzowe o strefe przegladarki.
  Metryki: przywrocenie przenosi karte ze skipped_count do pending_count,
  pct_ksiegowa bez zmian, do ai_count wchodzi dopiero po realnym zatwierdzeniu.
  Podstawa: odczyt pg_get_functiondef('fluinty.client_metrics') z 12.08
  (ai_count filtruje status IN auto_created/resolved/approved) — DO
  POTWIERDZENIA jednym pg_get_functiondef przy najblizszej sesji z MCP
  (startowanej z katalogu projektu), zgodnie z regula o twierdzeniach popartych
  zapytaniem.
  Duplikaty przy ponownym ingescie: karta wracajaca do 'pending' nie zostanie
  zdublowana, bo pre-filter workera blokuje wpisy z istniejacym rekordem —
  oparte na DECISIONS 2026-07, NIETESTOWANE
  | 'ignored' bylo slepym zaulkiem: 100 kart w produkcji i zero drogi powrotnej
  z panelu (ROADMAP §1 „drzwi jednokierunkowe", 213 kart ignored+skipped);
  pomylkowe pominiecie wymagalo interwencji wlasciciela na K1.
- 2026-08-13 | REGULA METODOLOGICZNA: `naglowek_id_rachmistrz` = NULL (ani
  `zapis_id_rachmistrz`, ani `faktury.rachmistrz_*`) NIE DOWODZI, ze dokument
  nie trafil do ksiag. Dowod: karta #1430 (DDK 100239, FS 3435/MK, klient
  6481825609) ma NULL we wszystkich tych polach i status 'ignored', a w
  audit_log sa DWA udane `auto_create_full` dla tego samego DDK —
  naglowek_id 112525 (2026-07-20T12:26:32) i 112529 (2026-07-21T07:39:50).
  Kolumna bywa czyszczona/nieustawiana przy zmianach statusu, wiec jej pustka
  jest brakiem informacji, nie informacja o braku.
  SKUTEK: kazda analiza „czy ten dokument jest juz zaksiegowany" musi isc
  przez Rachmistrza/Bridge (K1) albo — jako poszlaka, nie dowod — przez
  audit_log (akcje auto_create_full / external_booked / approved / resolved
  z `details.naglowek_id`). Nigdy przez pola rachmistrz_* w Supabase.
  UWAGA przy czytaniu audit_log pod tym katem: dla akcji `auto_create_full`
  kolumna `audit_log.zapis_id` trzyma NOWY numer DDK powstaly przy ksiegowaniu,
  a DDK zrodlowy siedzi w `details.ddk_nr` — kluczowanie wylacznie po kolumnie
  gubi wtedy WSZYSTKIE zdarzenia zaksiegowania (934 wiersze w bazie, 100%
  rozjazdu dla tej akcji). Klucz dokumentu to para (client_nip, DDK), bo sam
  DDK koliduje miedzy klientami; `details.exception_id` jest nieufny — raz
  niesie exceptions_queue.id, raz faktury.id, a sekwencje obu tabel sie
  nakladaja
  | przy przegladzie 100 kart 'ignored' (13.08) pole rachmistrz_* bylo
  pierwszym kandydatem na kryterium „czy juz zaksiegowane"; dla 100/100 kart
  jest NULL, co wygladalo na czysty wynik, a #1430 pokazalo, ze jest bezwartosciowe.
- 2026-08-17 | PRECYZJA BRAMKI, nie czystosc ogolem, jest metryka decyzyjna dla
  auto-write. Definicja: na kartach ZAKONCZONYCH (auto_created/approved/resolved;
  external_booked poza symulacja — nie przeszly przez system) odtwarzamy warunki
  auto_write_gate (pewnosc >= 0.95, kwota <= COALESCE(auto_max_kwota, 5000),
  zero czerwonych flag) i liczymy: precyzja = czyste / (czyste + bledne) wsrod
  kart PRZECHODZACYCH bramke, gdzie „bledna" = przeszlaby bramke AND
  edycja_ksiegowa = true. Karty z edycja_ksiegowa IS NULL (sprzed flag) sa POZA
  licznikiem i mianownikiem — null to brak danych, nie czystosc.
  Powod: progi uzgodnione z biurem (>=50 dekretow AI, >50% czystosci) mierza
  czystosc OGOLEM, a ksiegowac bedzie BRAMKA — podzbior kart. Te dwie liczby
  rozjezdzaja sie w praktyce: Czajecki 91,9% czystosci ogolem, ale wsrod kart
  przechodzacych bramke 41 przeszlo / 6 blednych = 85,4% precyzji (retro 12.08,
  odtworzone co do karty przez src/lib/gate-simulation.ts 17.08). Globalnie
  17.08: 181 kart przechodzi / 48 blednych = 73,5% — obecna bramka nie nadaje
  sie do uzbrojenia.
  Implementacja: src/lib/gate-simulation.ts (jedno zrodlo prawdy predykatu,
  PARAMETRYZOWANE progi do analiz wariantow), fetchGateSimulation +
  GateSimulationSection na /klienci/[nip] (lazy, gate jak fetchClientLearning),
  docs/ANALIZA-zaciesnienia-bramki.md (warianty zaciesnienia).
  Predykat ZWALIDOWANY na zywym obserwatorze 17.08: 33/33 eventow auto_candidate
  (od 12.08) wskazuje karty przechodzace takze w symulacji; w druga strone zero
  falszywych przepuszczen na realnych klientach (2 rozjazdy = klient DEMO,
  ktorego worker pomija). Ustalenie z analizy wariantow, ktore trzeba znac:
  PODNIESIENIE PROGU PEWNOSCI NIE ZACIESNIA BRAMKI (0.97 => precyzja SPADA do
  72,0% przy wolumenie -72%, bo 131 ze 181 przechodzacych kart ma conf rowne
  0.95, a bledne maja te same wartosci co czyste); sygnal jest w historii
  dostawcy (69% blednych od dostawcow z >=1 inna korekta u tego klienta).
  To narzedzie POMIARU — zadnych zmian w bramce, client_metrics ani flagach;
  zmiana auto_write_gate w workerze to osobne zlecenie na K1 za zgoda wlasciciela
  | decyzja o uzbrojeniu fali 1 na zlej metryce = automat mylacy sie w co
  czwartym ksiegowaniu od pierwszego dnia.
- 2026-08-17 | KONTRAKT SYNCHRONIZACJI STATUSOW faktury <-> exceptions_queue
  (wariant b, zatwierdzony przez wlasciciela). Zrodlem prawdy jest
  exceptions_queue; faktury.status ma NADAZAC, bo (1) guardy zapisu panelu
  (`.in('status', pending*)` na faktury) to druga linia obrony i przy stale
  statusie dziala tylko queue-owa polowa — a w updateJpkSection/resetJpkSection
  zapis do faktury idzie PIERWSZY, wiec stale pending* przepuszcza zapis
  czesciowy do karty zamknietej (po backfillu: czysty stop na wejsciu),
  (2) faktury.status to docelowy nosnik statusu dla przyszlych kart
  faktury-native (bez wiersza queue). UWAGA: os czasu NIE jest konsumentem —
  fetchFakturaTimeline selektuje status, ale zdarzenia implicytne liczy
  wylacznie z kolumn czasowych i czyta najpierw queue (sprawdzone 17.08;
  wczesniejsza mapa konsumentow twierdzila inaczej). PREMISA "v2 serwuje
  stale statusy" jest FALSZYWA: pg_get_viewdef 17.08 pokazuje
  COALESCE(eq.status, f.status), a wierszy faktury bez pary w queue jest 0 —
  kolejka zawsze pokazywala prawde z queue.
  Kontrakt: PANEL pisze status do OBU tabel z guardem przy kazdej zmianie
  (od fali 1: approve*/resolve przez updateFakturaOnFinish, ignoreFaktura,
  restoreFaktura — zweryfikowane 17.08, zadna akcja panelu nie pomija synca).
  WORKER synchronizuje faktury przy auto_created (780/780 zgodnych w prod),
  ale NIE przy external_booked i rollbacku — stad caly rozjazd: 338 kart
  (macierz 17.08: external_booked 253, ignored-legacy 60 sprzed fali 1,
  rolled_back 25; kierunek WYLACZNIE queue-dalej-niz-faktury, zero odwrotnych).
  Domkniecie po stronie workera = zlecenie na K1 (osobny blok, poza tym repo).
  Backfill jednorazowy: migrations/2026-08-status-backfill.sql (STATUS: DO
  WYKONANIA RECZNIE) — WYLACZNIE kolumna status; resolved_by/resolved_at
  celowo nietkniete (dla external_booked queue.resolved_by bywa wartoscia
  systemowa wykrycia, nie osoba ktora zaksiegowala — kopiowanie utrwaliloby
  falszywa atrybucje; decyzja wlasciciela 17.08). Migracja fail-closed:
  kierunek rozjazdu sprawdzany zapytaniem o dozwolone pary, kazda para spoza
  listy (w tym odwrotna) przerywa z lista wierszy. Po drodze rozszerza CHECK
  faktury_status_check o 'rolled_back' (constraint go nie znal, a queue tak
  — pg_get_constraintdef 17.08); union ExceptionItem.status dostal
  external_booked i rolled_back (COUNT 17.08: 436 i 36 w exceptions_queue,
  434 i 25 przez v2). Trigger trg_log_korekta_faktury sprawdzony: reaguje tylko na
  final_*, zmiana statusu nie smieci do klasyfikacja_korekty.
  CELOWO BEZ TRIGGERA SQL synchronizujacego status automatycznie — i to jest
  decyzja, nie zaniedbanie: rozjazd bywa diagnostycznie CENNY (analiza 100
  kart ignored z 13.08 odtworzyla sekcje kolejki sprzed pominiecia WYLACZNIE
  dzieki temu, ze faktury.status pamietal stan sprzed decyzji — 60/60
  zgodnosci z rekonstrukcja z audit_log). Trigger zabralby ten sygnal i ukryl
  bledy synca zamiast je pokazywac. NIE "usprawniac" tego triggerem
  | jedna tabela klamiaca o statusie to pulapka na kazdego przyszlego
  konsumenta i analityka (CLAUDE.md: kazda analiza statusow na queue), a dwie
  tabele mowiace to samo — warunek zaufania do guardow i osi czasu.
- 2026-08-17 | WZORZEC PULAPKI (z domkniecia backfillu, Z6): LUZNA MAPA
  badge'ow/etykiet indeksowana statusem przechodzi TypeScript BEZ BLEDU —
  `Record<string, string>` i lancuchy `item.status === 'x' && <Badge/>`
  nie sa wyczerpujace, wiec status spoza mapy renderuje sie jako PUSTA
  kolumna/brak etykiety, a kompilator milczy. SKUTEK PRAKTYCZNY: kazde
  rozszerzenie unionu statusow (i kazde pojawienie sie nowego statusu
  w danych) wymaga GREPU PO MAPACH ETYKIET — po literalach statusow
  w komponentach i po `Record<...>` — nie tylko po exhaustive-switchach,
  ktorych w tym repo dla statusow kart w ogole nie ma (sprawdzone 17.08).
  Przyklad z 17.08: external_booked (436 wierszy) i rolled_back (36) —
  razem 472 wiersze renderowaly pusta kolumne statusu, bo trzy luzne mapy
  ich nie znaly: getStatusBadge w src/app/(auth)/faktury/page.tsx,
  getStatusBadge w src/components/client-detail/RecentExceptionsTable.tsx,
  statusLabel w src/components/do-akceptacji/sections/FakturaEventsDrawer.tsx
  (tam tez brakowalo 'skipped'). Wszystkie trzy uzupelnione przy backfillu
  | union w types mowi, co MOZE przyjsc, ale o tym, co uzytkownik ZOBACZY,
  decyduja mapy w komponentach — i one nie maja kompilatorowej siatki.
- 2026-08-17 | MODEL SWIEZOSCI KARTY po pakiecie perf (commit 71f8379):
  inline-edycja pozycji (updatePozycjaWymiar) CELOWO nie robi revalidatePath —
  zmiana dropdownu nie przebudowuje calej kolejki (~2,4 MB odczytu v2 +
  pelny RSC render na kazde kliknieciecie). Swiezosc utrzymuje stan lokalny:
  PozycjeFakturySection renderuje z localPozycje, karta trzyma currentPozycje
  (resync z propem przy kazdym refreshu — wzorzec ref-compare), a caly tor
  VAT karty (effVatMemo, hasCzesciowe, podsumy per kolumna, prefill
  EditModala) czyta currentPozycje, NIE surowy prop. Zapis do bazy bez zmian:
  approve*/resolve czytaja pozycje SWIEZO z DB przed scaleniem, wiec dane
  ksiegowane sa poprawne niezaleznie od stanu ekranu.
  ZAAKCEPTOWANE RYZYKO REZYDUALNE (decyzja wlasciciela 17.08, wariant a):
  baza zapisu wysylana z klienta (exception.final_zapis_vat_data z propow)
  moze byc przeterminowana w oknie do 30 s (auto-refresh) przy sekwencji
  edycja -> refresh dostarcza propsy -> COFNIECIE edycji -> approve <30 s
  na tej samej karcie. Skutkiem jest zapis stanu, ktory ksiegowa sama
  ustawila chwile wczesniej — ryzyko klasy kosmetycznej; okno istnialo
  zawsze (przed pakietem 1-2 s, teraz do 30 s). Pelne domkniecie (akcja
  zwraca swieze final_* po triggerach DB i karta wpina je do stanu) w
  backlogu z adnotacja: wraca jako pilne, jesli scenariusz wystapi w danych.
  Przy okazji pakietu naprawiony REALNY bug produkcyjny (nie wydajnosc):
  batch faktury_pozycje bez stronicowania vs serwerowy max-rows=1000 —
  pending mial 17.08 1046 wierszy pozycji, 46 wierszy z 8 kart znikalo
  PO CICHU (karty z niekompletnymi pozycjami; nkupCount/tabela VAT liczone
  z niepelnej listy). Teraz range() w petli
  | pelny rebuild kolejki przy kazdym dropdownie kosztowal 2-4 s na
  klikniecie przy 100+ kartach dziennie, a jedyny konsument swiezosci
  (ekran karty) da sie utrzymac lokalnie; okno wyscigu o skutku
  "zapis wlasnego sprzed chwili" nie uzasadnia tego kosztu.
- 2026-08-17 | KOREKTA LICZBY: precyzja obecnej bramki (W0) to 137/181 =
  75,7%, nie 73,5% z ANALIZA-zaciesnienia-bramki — 4 z 48 kart "blednych"
  to FANTOMY FLAGI (rodzina E z ANALIZA-wzorce-bledow-bramki: #1889, #1890,
  #1893, #1323 — final==ai co do pol grosza, rezim rozny wylacznie formatem
  zapisu '75%'->'50_75'; flagi edycja_* ustawione przed fixem KWOTA_EPS
  z 12.08). Flag w danych NIE czyscic (zapis historyczny); przy kazdym
  cytowaniu precyzji W0 uzywac 75,7% | liczba 73,5% nie moze zyc jako
  "aktualna" — fundament decyzji o uzbrojeniu.
- 2026-08-17 | BLOKADA ODCZYTU ROLI 'klient' (Fala 3, AUDIT §1): rola
  panel_users.rola='klient' NIE wchodzi do panelu — layout (auth)
  (src/app/(auth)/layout.tsx) zwraca neutralna strone "Portal klienta
  w przygotowaniu" ZAMIAST dzieci, dla KAZDEJ trasy pod (auth). Jedno
  miejsce egzekwowania, celowo bez redirectu (redirect na /login robilby
  petle — uzytkownik JEST zalogowany, tylko nie ma czym ogladac panelu).
  Dotad rola istniala w whitelist, ale zadna strona jej nie filtrowala:
  zalogowany klient widzial pelna kolejke biura ze wszystkimi klientami.
  Strona neutralna, bez tresci diagnostycznej | portal klienta nie
  istnieje, a do czasu jego budowy 'klient' na whitelist nie moze byc
  furtka do danych cudzych firm; pojedynczy punkt w layoucie nie do
  ominiecia przez dopisanie nowej strony.
- 2026-08-17 | SWIADOME WYJATKI symetrii Preview<->Pelna (Fala 3, AUDIT §3):
  oba podglady faktury maja WSPOLNE zrodla dla danych ksiegowych — tabela
  VAT z getOfficialVatTable (z normalizeStawka), wiersz roznicy Layer 2
  z computeLayer2 (@/lib/vat), flagi Korekta/Zaliczka/Marza/MPP + rabat
  naglowkowy, waluta z kodWaluty — a pozostale rozbieznosci sa CELOWE
  i skatalogowane w komentarzu naglowkowym FakturaPreview.tsx (rabaty per
  pozycja i „Ogolem" tylko w Pelnej; strony/termin/platnosc tylko w Preview;
  Rozliczenia: te same dane, inny format). Kazda przyszla zmiana prezentacji:
  do OBU widokow albo swiadomie do jednego Z DOPISKIEM do tej tabeli
  | bez katalogu kazda roznica wyglada jak bug i kusi "wyrownanie",
  a te roznice sa produktem (kompakt do akceptacji vs wierny obraz KSeF).
- 2026-08-17 | WZORZEC ZAPISU AUDYTU (Fala 3, C9): logAudit w
  do-akceptacji/actions.ts i insert audit_log w pozycje-actions.ts dziala
  jak logFakturaEvent — blad zapisu audytu NIE przerywa operacji glownej
  (zapis do exceptions_queue/faktury juz przeszedl; cofanie go z powodu
  telemetrii byloby gorsze niz brak wpisu), ale NIE znika po cichu:
  console.error (logi Vercel) + `warning` w zwrotce akcji, doklejany do
  eventWarnings tam, gdzie juz istnieja. Dotad wynik insertu byl w ogole
  nieczytany | audit_log bywa JEDYNYM nosnikiem historii (wpis o restored
  z 17.08), wiec jego awaria musi byc widoczna — ale nie moze blokowac
  ksiegowania.
- 2026-08-17 | KOREKTA STATUSU MIGRACJI: wszystkie trzy migracje strumienia
  sierpniowego SA WYKONANE na produkcji (17.08.2026) — 2026-08-fala1.sql
  i 2026-08-restored.sql potwierdzone przez wlasciciela (restored: CHECK
  zwrocil 22 typy eventow), 2026-08-status-backfill.sql wykonana z maszyny
  agenta za JEDNORAZOWA jawna zgoda wlasciciela (KROK 3 po backfillu:
  0 wierszy rozjechanych; regula read-only wrocila natychmiast po operacji).
  Adnotacje "STATUS: DO WYKONANIA RECZNIE" przy wpisach z 12-17.08 oraz
  w naglowkach plikow migracji sa HISTORYCZNE — plikow migracji celowo nie
  ruszamy (decyzja wlasciciela 17.08: koniec zmian w migracjach) | czytelnik
  rejestru nie moze czekac na migracje, ktora juz przeszla, ani probowac
  wykonac jej drugi raz.
- 2026-08-17 | UZUPELNIENIE blokady roli 'klient' (recenzja Fali 3): layout
  (auth) NIE jest "jedynym wejsciem" do danych biura — server actions to
  publiczne POST-y niezalezne od layoutu (auth-helpers mowi to wprost:
  "kontrola musi byc jawna i fail-closed"). Recenzja znalazla jedyna akcje
  odczytu bez bramki roli: getGlobalSearchData (search.ts) — klient
  z biuro_klienci_nipy=NULL dostawalby tor "wszyscy poza demo/ryczalt"
  (lista klientow, opisy, pojazdy, do 1000 numerow KSeF). Dodany jawny
  check roli na wejsciu (pusta zwrotka, bez bledu). KONTRAKT: kazda NOWA
  akcja odczytu dostaje jawna bramke roli jak zapisowe (assertNipReadAccess
  / check rola==='klient') — bramka layoutu chroni tylko strony. Przy okazji:
  neutralna strona klienta dostala przycisk "Wyloguj" (bez TopBara nie bylo
  ZADNEJ drogi wylogowania — middleware odsyla zalogowanych z /login)
  | rola bez pokrycia toru akcji to iluzja blokady, a kazdy przyszly
  portal klienta zacznie od tego samego modelu.
- 2026-08-17 | WSPOLNA BAZA "do zaplaty" Layer 2 (recenzja Fali 3):
  deriveDoZaplaty w @/lib/vat — jedno wyprowadzenie w OBU podgladach
  (legalne 0 ORAZ brak/nieparsowalna wartosc -> fallback kwota_brutto karty).
  Dotad Preview mial fallback, a Pelna liczyla z surowego 0 — rozjazd
  latentny (0 kart w prod 17.08; 2 karty z doZaplaty=0 maja tez brutto=0).
  W Pelnej surowa wartosc kwotaDoZaplaty zostaje WYLACZNIE do wyswietlenia
  (wierny obraz KSeF), obliczenia (saldo + alert rabatu) ida z bazy wspolnej
  | komentarze "ta sama baza" z A3 byly falszywe w tej klasie danych —
  teraz sa prawdziwe, a przyszly rozjazd pipeline'u nie rozjedzie widokow.
- 2026-08-17 | SPROSTOWANIE DIAGNOZY "przecinki zeruja tabele VAT"
  + parseXmlKwota jako unifikacja parserow (NIE fix zachowania):
  DWA zrodla "pozycje_xml_full" o ROZNYCH formatach liczb. Surowa tabela
  exceptions_queue trzyma XML workera w formacie polskim (COUNT 17.08:
  1285/1753 kart z przecinkiem "83,33", 157 calkowite, 311 tylko
  cenaBrutto, zero kropek). ALE PANEL TEGO NIE CZYTA: jedyny renderer kart
  (do-akceptacji/page.tsx) czyta widok exceptions_queue_v2, ktory
  PRZEBUDOWUJE pozycje_xml_full z fluinty.faktury_pozycje
  (pg_get_viewdef 17.08: wartoscNetto = wartosc_netto::text, numeric ->
  zawsze kropka; bez kluczy wartoscBrutto/cenaBrutto). Pomiar przez v2
  (17.08): 5163 pozycji z kropka / 14 calkowitych / 96 null (40 kart,
  1 aktywna) / ZERO przecinkow z 5273. SKUTEK: raportowane wczesniej
  "zerowanie tabeli VAT na 1285 kartach (319 aktywnych)" NIE ZACHODZILO
  w panelu — diagnoza mierzona na surowej tabeli, ktorej panel nie czyta
  (klasa bledu c751b52: teza z kodu, dane sprawdzone na zlym zrodle;
  wykryte przez recenzje adwersaryjna PRZED pushem). Nikt nie zglaszal
  zerowej tabeli, bo nikt jej nie widzial. Przecinki DOCIERAJA do
  komponentow innym torem — przez podglad_faktury (pomiar recenzji 17.08:
  kwotaDoZaplaty z przecinkiem na 341/376 kart z podgladem) — ale tamtejsze
  parsery juz przed zmiana robily replace(',', '.').
  CO ZATEM ROBI parseXmlKwota: ujednolica ~8 rozsianych parserow
  (Number/parseFloat+replace) do jednego wejscia obslugujacego OBA formaty
  (kropka z v2, przecinek z surowego XML/podgladu; strict parsePolishNumber
  + prewencyjna normalizacja minusa U+2212 — 0 wystapien w prod 17.08).
  Na zmierzonych danych zmiana jest BEHAWIORALNIE OBOJETNA (T4: karty
  calkowite i null bit-w-bit identyczne przed/po). Wartosc kontraktu to
  odpornosc na zmiane zrodla — np. karmienie komponentow surowa tabela
  (dokladnie blad tej diagnozy) albo zmiane definicji v2 — nie naprawa
  dzisiejszego zachowania. KONTRAKT: kazdy nowy konsument pol liczbowych
  XML/podglad_faktury przechodzi przez parseXmlKwota. Poza zakresem
  (celowo): EditModal (input uzytkownika), merge-helpers (procenty
  rezimu), audit-format (kwoty details audytu)
  | rozjazd format-zrodlo (tabela: przecinki, widok: kropki) wlasnie
  kosztowal pelna, bledna diagnoze z harnessem "potwierdzajacym" zera,
  ktorych produkcja nigdy nie renderowala — jedna funkcja z twardym
  kontraktem i TEN wpis maja gwarantowac, ze nastepna analiza pozycji
  zacznie od pytania "ktore zrodlo czyta konsument?".
- 2026-08-17 | ZNANY KOMPROMIS: brutto WYPROWADZANE w tabeli VAT podgladow
  (badanie officialMatch, read-only): widok v2 nie serwuje wartoscBrutto
  pozycji, wiec getOfficialVatTable liczy brutto per pozycja jako
  round(netto x (1+stawka/100)) — a faktury bywaja liczone od SUM netto
  stawki, stad groszowe rozjazdy wobec realnych brutto pozycji.
  Pomiar 17.08 (396 aktywnych kart z pozycjami): 24 karty z roznica
  > 0,5 gr, 3 karty > 1 gr, 1 karta > 2 gr; przy progu pol grosza
  pojedyncze karty moga migrowac miedzy pomiarem numeric (SQL) a double
  (przegladarka) — klasa wyniku bez zmian. Derived brutto per pozycja
  moze rozniec sie o grosze od faktury; TABELA WORKERA (zapis_vat_data)
  POZOSTAJE PRAWDA KSIEGOWA — zwykly approve bez edycji VAT bierze ja,
  nie officialMatch, a sciezka "Przelicz stawki VAT" -> pozycje_vat_final
  ma 9 uzyc w calej historii (0 aktywnych, 0 na kartach rozbieznych).
  Kompromis AKCEPTOWANY (decyzja wlasciciela 17.08), kod bez zmian.
  BACKLOG / zlecenie K1 (bez pilnosci): karta 2154 (FS 433/06/2026) —
  zbadac, skad worker wzial wartosc_brutto=492 przy netto=300
  w pojedynczej pozycji faktury_pozycje (podejrzenie: cena sprzed rabatu
  z XML); ksiegowanie karty poprawne (derived = tabela workera = naglowek
  369,00; ai_kwoty_per_kolumna licza z netto 300), rozjazd czysto ekranowy
  | groszowa precyzja wyprowadzonej tabeli to koszt braku wartoscBrutto
  w v2, a nie blad logiki — naprawianie jej zapisem z pozycji wprowadziloby
  wieksze rozjazdy niz te grosze (przypadek 2154: "realne" brutto pozycji
  bywa bledne, wyprowadzone zgadza sie z nexo).
- 2026-08-17 | ENTER PRZY ALARMACH — dwustopniowy (ROADMAP §3, ogony audytu):
  karta z aktywnym alarmem hasVendorAlarms (vendor_vat_active===false,
  is_potential_duplicate, vendor_first_occurrence, date_anomaly —
  confidence-helpers.ts; DOKLADNIE te, ktore zmieniaja przycisk w zolte
  "Akceptuj mimo ostrzezen") nie zatwierdza sie pierwszym Enterem: pierwszy
  fokusuje przycisk + toast z lista alarmow (listVendorAlarmy — te same
  warunki, jedno zrodlo), drugi trafia w sfokusowany przycisk i guard
  skrotow oddaje go przegladarce (natywna aktywacja = identyczna sciezka
  co klik). CELOWO bez dialogu: klik nie ma dialogu, wiec Enter nie moze
  miec WIEKSZEJ frykcji niz klik ("ta sama swiadoma decyzja"). Karta bez
  alarmow: pojedynczy Enter bez zmian. rachunek_match_status='mismatch'
  NIE zmienia przycisku, wiec nie wchodzi do listy (fakturaWymagaUwagi to
  INNY, szerszy predykat — sortowanie/oznaczenie, nie frykcja przycisku);
  ewentualne rozszerzenie przycisku o mismatch = osobna decyzja
  | frykcja przy kliku byla iluzoryczna, skoro rytm Enter-Enter ja omijal.
- 2026-08-17 | KONTRAKT OPISU przy zatwierdzaniu (AUDIT §4): `undefined`
  = bez zmiany -> zapis bierze propozycje AI; `''` (po trim) = celowe
  wyczyszczenie -> WALIDACJA z komunikatem (resolved_opis jest obowiazkowy —
  worker bez opisu pomija karte). Dotad approveFaktura robil `override || ai`
  (wyczyszczenie po cichu wracalo do AI, a klient dodatkowo zamienial ''
  na undefined), gdy approveExceptionFull zapisywal pusty string. Teraz
  OBIE sciezki + resolveException identycznie: pusty final opis = blad;
  klient (FakturaCard) przekazuje undefined tylko gdy opis == propozycja AI.
  Domkniete tez z drugiej strony: undefined + brak propozycji AI = ta sama
  walidacja, nie zapis NULL | trzy zachowania jednego pola na dwoch
  sciezkach to pulapka na kazdego, kto liczy na "opis zawsze jest".
- 2026-08-17 | DIFF WIDZI RECZNA EDYCJE VAT + NIECIAGLOSC METRYKI (AUDIT §4):
  buildEditDiff dostawal finalVat/finalPojazd i IGNOROWAL oba — edycja VAT
  z EditModalu i updateFinalZapisVAT (transakcja zagraniczna) nie wchodzila
  do diffu, wiec edycja_realna/edycja_ksiegowa/event 'edited' jej nie
  widzialy (zapis final_* poprawny po fali 2; slad edycji niepelny).
  Fix (dopiszVatDoDiffu): porownujemy scalenie Z final_zapis_vat_data vs
  scalenie BEZ niego (sameJson, reuse z fali 2) — auto-wyprowadzenia
  (wykluczenia art. 88/NKUP, auto-korekta rodzaju odliczenia) i kanaly
  z wlasnymi flagami licza sie po OBU stronach i SIE KASUJA, wiec roznica
  = wylacznie reka ksiegowej; naiwne sameJson(scalony, AI) daloby fantomy
  klasy 75,7%-vs-73,5%. Pojazd CELOWO bez czlonu: oba reczne wejscia
  (pojazd_id_final/rezim_paliwowy_final) sa pod flaga rezim_edited
  + eventem rezim_changed — czlon dublowalby slad. ZNANE OGRANICZENIE
  (recenzja 18.08): na kartach z aktywnym wykluczeniem (effective 'brak'/
  NKUP) recompute mergeInlineEditsVat NADPISUJE wiersze payloadu modala
  wartosciami wyprowadzonymi PO OBU stronach porownania — reczna edycja
  pozycji VAT w EditModalu jest tam kasowana przez tor zapisu (keepManualRows
  chroni wylacznie inline pozycje_vat_final — defekt FALI 2, sprzed tego
  zakresu) i diff jej nie widzi, bo do zapisu nie dociera. Domkniecie =
  zmiana toru zapisu (keepManualRows dla payloadu modala) — wymaga osobnej
  zgody wlasciciela, w backlogu. Porownanie diffu zaokragla kwoty do grosza
  (zaokraglijKwotyDoPorownania) — sumy modala licza sie niezaokraglonym
  reduce i szum double (~1e-13; 5 kart w probce 200, pomiar 18.08) robilby
  fantomy "edytowane recznie" bez reki. NIECIAGLOSC METRYKI:
  od tego commita edycja_ksiegowa lapie wiecej realnych edycji (VAT
  z modalu/transakcji zagranicznej), wiec czystosc ksiegowa i precyzja
  bramki liczone przez flagi NIE sa porownywalne 1:1 z liczbami sprzed
  — kazde zestawienie przed/po wymaga adnotacji o dacie tego commita
  | metryka, ktora nie widzi realnych edycji VAT, zawyzala czystosc:
  lepiej jawna nieciaglosc niz ciagla nieprawda.
