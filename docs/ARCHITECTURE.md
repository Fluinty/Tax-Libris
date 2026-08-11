# Fluinty — jak system dziala (mapa dla agentow)

## Ogolny przeplyw
KSeF -> Rachmistrz nexo (modul e-Faktury pobiera dokumenty) -> Bridge (czyta nowe
DDK przez Sfere) -> Worker AI (klasyfikacja + kontekst klienta) -> Supabase (karta
w exceptions_queue) -> Panel (ksiegowa zatwierdza/poprawia) -> Worker (ksieguje
przez Bridge) -> Rachmistrz (zapis KPiR + rejestr VAT).

## Komponenty
- **Bridge** (.NET, localhost:5000, maszyna produkcyjna): jedyna warstwa dotykajaca
  Sfery/SQL Rachmistrza. Endpointy m.in.: /ddk/pending, /documents/{id}/pozycje
  (z podgladFaktury), /zapisy/utworz-pelny, /zapisy/rollback. Token w naglowku
  X-Fluinty-Token.
- **Worker** (Python, C:\spike\worker_v3.py, ta sama maszyna): cykl per klient —
  pobiera pending DDK, klasyfikuje (Gemini + walidatory + kontekst), wstawia karty,
  wykonuje zlecenia panelu (ksiegowanie zatwierdzonych, rollbacki), sync tabel.
- **Supabase** (schemat fluinty, EU): zrodlo prawdy dla panelu. Kluczowe tabele:
  clients, exceptions_queue (karty), faktury (+pozycje), faktura_events (audyt,
  CHECK na event_type!), client_pojazdy, config (kill-switch), panel_users (role).
  RPC: client_metrics(since).
- **Panel** (Next.js na Vercel): kolejka akceptacji, dashboard klientow z metrykami,
  karta klienta (pojazdy, opisy). NIGDY nie dosiega Bridge — operacje wymagajace
  Rachmistrza sa asynchroniczne przez statusy (np. rollback_requested).

## Cykl zycia karty (statusy exceptions_queue)
pending (AI niepewny) / pending_review (gotowy dekret, czeka na klik) ->
approved/resolved (klik ksiegowej) -> auto_created (zaksiegowane w Rachmistrzu;
takze wynik przyszlego auto-write) | external_booked (ksiegowa zaksiegowala
recznie poza systemem) | skipped/ignored | rollback_requested -> (worker) ->
pending_review | rollback_failed.

## Kluczowe pojecia
- **DDK** = DokumentDoKsiegowania w nexo (dokument z KSeF czekajacy na ksiegowanie);
  ddkNr to jego numer, w kartach pole zapis_id.
- **legacy_id**: widok v2 karty ma id = faktury.id; prawdziwy klucz queue to
  legacy_id. PATCH zawsze po legacy_id.
- **ai_* vs final_***: propozycja AI vs realna edycja ksiegowej. Czysty klik NIE
  kopiuje ai->final. Flagi edycja_realna/edycja_ksiegowa ustawiane przy kazdym
  zakonczeniu (opis nie jest korekta ksiegowa).
- **Rezim pojazdowy**: koszty aut licza sie wg proporcji (75/50 mieszany, limit
  150 tys. przy leasingu, vat26 = pelny VAT); dane w client_pojazdy.
- **Czystosc ksiegowa**: % kart zakonczonych przez system bez korekt kwot/VAT/
  pozycji/rezimu. Fundament decyzji o auto-write. External poza mianownikiem.
- **Podglad faktury**: podglad_faktury w tabeli faktury — pelny obraz z KSeF
  (pozycje, tabela VAT, strony, dodatkoweRozliczenia = salda/raty poza faktura VAT).
  Renderowany przez DWA komponenty: FakturaPreview (sticky, kanoniczny) i
  PelnaFakturaSection (zwijany) — zmiany ida do OBU.

## Bramka auto-write (stan: rozbrojona)
Dwa niezalezne klucze: fluinty.config key 'auto_write_global' ('off'!) AND
clients.auto_write_enabled (toggle admina z eventem audytowym). Worker: funkcja
auto_write_gate (confidence>=0.95, zero czerwonych flag, kwota<=auto_max_kwota).
Tryb obserwatora: kandydaci logowani jako event 'auto_candidate' bez ksiegowania.

## Srodowiska i ograniczenia
- Jedna baza Supabase = produkcja (brak stagingu). DDL wykonuje czlowiek w SQL
  Editorze z plikow migrations/ przygotowanych przez agentow.
- Maszyna produkcyjna (K1): worker+Bridge+dostep SQL do ATLAS\INSERTGTX (43 bazy
  nexo). Zasady w C:\CLAUDE.md — tryb ostrozny, zapisy tylko za zgoda.
- Repo panelu: github.com/Fluinty/Tax-Libris; pracuja dwa agenty (Claude Code,
  Antigravity) — fetch przed praca, konflikt = stop i zglos.
