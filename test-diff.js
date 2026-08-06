const parseAmount = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return parseFloat(v.toString().replace(',', '.')) || 0;
};

// Mock data
const officialVatTable = [
  { stawka: "23", netto: 30.00, vat: 6.90, brutto: 36.90 }
];
const podglad = {
  kwotaDoZaplaty: -36.44,
  dodatkoweRozliczenia: []
};
const sumBruttoWiersze = 36.90;
const doZaplaty = parseAmount(podglad.kwotaDoZaplaty);

// Logic from component
let vatTableBrutto = sumBruttoWiersze;
if (officialVatTable && Object.keys(officialVatTable).length > 0) {
  vatTableBrutto = 0;
  Object.values(officialVatTable).forEach((vals) => {
    vatTableBrutto += vals.brutto || 0;
  });
}

const dodatkoweRozliczenia = Array.isArray(podglad.dodatkoweRozliczenia) ? podglad.dodatkoweRozliczenia : [];
let sumaDodatkowych = 0;
dodatkoweRozliczenia.forEach((roz) => {
  sumaDodatkowych += parseAmount(roz.kwota);
});

const rozrachunkiDiff = doZaplaty - vatTableBrutto;
const showLayer2 = Math.abs(rozrachunkiDiff) > 0.02;
const layer2Diff = dodatkoweRozliczenia.length > 0 ? (rozrachunkiDiff - sumaDodatkowych) : rozrachunkiDiff;
const showLayer2Row = showLayer2 && Math.abs(layer2Diff) > 0.02;

console.log(JSON.stringify({
  doZaplaty,
  vatTableBrutto,
  rozrachunkiDiff,
  showLayer2,
  sumaDodatkowych,
  layer2Diff,
  showLayer2Row
}, null, 2));
