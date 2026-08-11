# Fluinty — po co ten produkt istnieje

## Problem
Od lutego 2026 kazda faktura w Polsce przechodzi przez KSeF (rzadowy system e-faktur).
Biura rachunkowe dostaja je elektronicznie — ale ktos nadal musi kazda RECZNIE
zadekretowac: kolumna KPiR, opis, rozbicie VAT, rezimy pojazdowe. Przy ~300 firmach
to ~10 000 faktur miesiecznie przepisywanych przez ksiegowe.

## Rozwiazanie
Fluinty automatyzuje dekretacje: AI czyta fakture z KSeF, laczy ja z kontekstem
klienta (historia ksiegowan, PKD, pojazdy i ich rezimy, zapamietane opisy, notatki
ksiegowej), proponuje gotowy dekret z procentem pewnosci i uzasadnieniem po polsku.
Ksiegowa zatwierdza jednym klikiem albo poprawia — kazda poprawka zasila baze
wiedzy klienta. Zapis laduje bezposrednio w InsERT Rachmistrz nexo (KPiR + rejestr
VAT), bez przepisywania.

## Klient i model
- Klient: biura rachunkowe prowadzace KPiR/ryczalt na InsERT Rachmistrz nexo.
- Pierwszy klient produkcyjny: Tax-Libris (Katowice), ~300 firm. Umowa: min. 12 mies.,
  onboarding 200 PLN/klient od 09.2026.
- Decydentka po stronie biura: wlascicielka (Monika). Uzytkowniczki: ksiegowe.
  Historyczne ryzyko adopcji: czesc ksiegowych ksieguje reczne obok systemu.

## Stan (08.2026)
- Produkcja: 43 bazy klientow, >1000 kart przetworzonych, ~70-90% czystosci
  ksiegowej u najlepszych klientow (bez korekt wplywajacych na KPiR/VAT).
- Bramka auto-write zbudowana i ROZBROJONA (kill-switch 'off') — start automatu
  dopiero po zielonym swietle biura; uzgodnione progi: >=50 faktur AI i >50%
  czystosci ksiegowej; fala 1: klienci Czajecki i Czyz.
- Demo: klient DEMO (nip 9999999901) z seedem i resetem — do prezentacji.

## Kierunek strategiczny
1. Auto-write dla najlepszych klientow (zaufanie zbudowane metrykami, nie obietnica).
2. Portal klienta koncowego + wlasny ingest z KSeF API 2.0 (uprawnienie InvoiceRead
   nadawane biuru; klient akceptuje/odrzuca/komentuje faktury ZANIM trafia do
   ksiegowej) — uniezaleznienie od platnego modulu KSeF w nexo. Dual-mode: nowi
   klienci przez KSeF API, istniejacy zostaja na sciezce nexo.
3. Dlugoterminowo: standalone KPiR (zastapienie Rachmistrza) — na razie tylko wizja.

## Czego NIE robimy
- Zadnego auto-ksiegowania bez dwoch niezaleznych decyzji (kill-switch + flaga klienta).
- Zadnych ocen prawnych z wiedzy modelu (poprzedni reviewer polegl na zmianie stawki
  VAT, ktorej model nie znal) — ocena prawa tylko z zywym groundingiem, albo wcale.
- Nie konkurujemy z OCR-ami (Scanye itp.) — w swiecie KSeF OCR umiera, dekretacja
  z kontekstem i zapis do ksiag to nasza przewaga.
