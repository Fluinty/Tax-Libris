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
