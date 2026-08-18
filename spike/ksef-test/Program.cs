// ── SPIKE TEST KSeF 2.0 — kod NIE-produkcyjny ──────────────────────────────
// Cel (docs/SPIKE-TEST-ksef.md): pełny łańcuch biura na środowisku TEST:
// fikcyjny klient nadaje InvoiceRead fikcyjnemu biuru → biuro uwierzytelnia
// się WŁASNYM certem w kontekście klienta → klient wystawia fakturę FA(3) →
// biuro eksportuje paczkę → deszyfruje → parsuje podstawowe pola.
// Po drodze pomiary do dziur Fazy R: #2 (równoległe sesje), #5 (czas budowy
// paczki), #8 (GET /rate-limits).
// WYŁĄCZNIE api-test.ksef.mf.gov.pl, WYŁĄCZNIE fikcyjne NIP-y (TEST jest
// współdzielony między integratorami).

using System.Diagnostics;
using System.Text.Json;
using System.Xml.Linq;
using KSeF.Client.Api.Builders.EntityPermissions;
using KSeF.Client.Api.Services;
using KSeF.Client.Api.Services.Internal;
using KSeF.Client.Clients;
using KSeF.Client.Core.Interfaces.Clients;
using KSeF.Client.Core.Interfaces.Services;
using KSeF.Client.Core.Models.Authorization;
using KSeF.Client.Core.Models.Invoices;
using KSeF.Client.Core.Models.Permissions.Entity;
using KSeF.Client.Core.Models.Permissions.Identifiers;
using KSeF.Client.DI;
using KSeF.Client.Tests.Utils;
using Microsoft.Extensions.DependencyInjection;

const string BaseUrl = "https://api-test.ksef.mf.gov.pl";
Stopwatch total = Stopwatch.StartNew();
List<string> raport = [];
void Log(string s)
{
    string line = $"[{total.Elapsed:mm\\:ss\\.f}] {s}";
    Console.WriteLine(line);
    raport.Add(line);
}

// ── DI: jak TestBase oficjalnych testów E2E (bez HostedService w tle) ──────
ServiceCollection services = new();
services.AddKSeFClient(o => { o.BaseUrl = BaseUrl; });
services.AddSingleton<ICryptographyClient, CryptographyClient>();
services.AddSingleton<ICertificateFetcher, DefaultCertificateFetcher>();
services.AddSingleton<ICryptographyService, CryptographyService>();
services.AddSingleton<CryptographyWarmupHostedService>();
await using ServiceProvider sp = services.BuildServiceProvider();
await sp.GetRequiredService<CryptographyWarmupHostedService>().StartAsync(CancellationToken.None);

IKSeFClient ksef = sp.GetRequiredService<IKSeFClient>();
IAuthorizationClient auth = sp.GetRequiredService<IAuthorizationClient>();
IActiveSessionsClient activeSessions = sp.GetRequiredService<IActiveSessionsClient>();
ILimitsClient limits = sp.GetRequiredService<ILimitsClient>();
ICryptographyService crypto = sp.GetRequiredService<ICryptographyService>();

string nipKlient = MiscellaneousUtils.GetRandomNip();
string nipBiuro = MiscellaneousUtils.GetRandomNip();
Log($"NIP klient (fikcyjny): {nipKlient}; NIP biuro (fikcyjny): {nipBiuro}");

// ── KROK 1: klient uwierzytelnia się we własnym kontekście (Owner) ─────────
Stopwatch sw = Stopwatch.StartNew();
var authKlient = await AuthenticationUtils.AuthenticateAsync(auth, nipKlient,
    AuthenticationTokenContextIdentifierType.Nip);
string tokenKlient = authKlient.AccessToken.Token;
Log($"KROK 1 OK ({sw.ElapsedMilliseconds} ms): klient uwierzytelniony we własnym kontekście (self-signed TINPL)");

// ── KROK 2: klient nadaje NIP-owi biura InvoiceRead (entities/grants) ──────
sw.Restart();
GrantPermissionsEntityRequest grant = GrantEntityPermissionsRequestBuilder
    .Create()
    .WithSubject(new GrantPermissionsEntitySubjectIdentifier
    {
        Type = GrantPermissionsEntitySubjectIdentifierType.Nip,
        Value = nipBiuro,
    })
    .WithPermissions(EntityPermission.New(EntityStandardPermissionType.InvoiceRead, canDelegate: false))
    .WithDescription("SPIKE: biuro czyta faktury klienta (read-only)")
    .WithSubjectDetails(new PermissionsEntitySubjectDetails { FullName = $"Biuro testowe {nipBiuro}" })
    .Build();
var grantOp = await ksef.GrantsPermissionEntityAsync(grant, tokenKlient);
bool grantOk = await PermissionsUtils.ConfirmOperationSuccessAsync(ksef, grantOp, tokenKlient);
Log($"KROK 2 {(grantOk ? "OK" : "BŁĄD")} ({sw.ElapsedMilliseconds} ms): InvoiceRead nadane biuru {nipBiuro} (canDelegate=false)");
if (!grantOk) throw new Exception("Grant InvoiceRead nie powiódł się — przerwanie");

// ── KROK 3: klient wystawia fakturę FA(3) w sesji online ───────────────────
sw.Restart();
var encSesja = crypto.GetEncryptionData();
var sesja = await OnlineSessionUtils.OpenOnlineSessionAsync(ksef, encSesja, tokenKlient);
var wyslana = await OnlineSessionUtils.SendInvoiceAsync(ksef, sesja.ReferenceNumber, tokenKlient,
    nipKlient, "invoice-template-fa-3.xml", encSesja, crypto);
var statusFaktury = await OnlineSessionUtils.GetSessionInvoiceStatusAsync(ksef, sesja.ReferenceNumber,
    wyslana.ReferenceNumber, tokenKlient);
await OnlineSessionUtils.CloseOnlineSessionAsync(ksef, sesja.ReferenceNumber, tokenKlient);
string? ksefNumber = statusFaktury.KsefNumber;
Log($"KROK 3 OK ({sw.ElapsedMilliseconds} ms): faktura FA(3) przyjęta, nr KSeF = {ksefNumber}");

// ── KROK 4: biuro uwierzytelnia się WŁASNYM certem w KONTEKŚCIE KLIENTA ────
// (sedno spike'a — cert ma NIP biura, ContextIdentifier = NIP klienta)
sw.Restart();
var authBiuro = await AuthenticationUtils.AuthenticateAsync(auth, nipBiuro, nipKlient,
    AuthenticationTokenContextIdentifierType.Nip);
string tokenBiuro = authBiuro.AccessToken.Token;
Log($"KROK 4 OK ({sw.ElapsedMilliseconds} ms): biuro (cert {nipBiuro}) uwierzytelnione w kontekście klienta {nipKlient}");

// ── KROK 5 (dziura #8): GET /rate-limits w kontekście klienta ──────────────
sw.Restart();
try
{
    var rateLimits = await limits.GetRateLimitsAsync(tokenBiuro);
    Log($"KROK 5 OK ({sw.ElapsedMilliseconds} ms): GET /rate-limits = " +
        JsonSerializer.Serialize(rateLimits, new JsonSerializerOptions { WriteIndented = false }));
}
catch (Exception e)
{
    Log($"KROK 5 BŁĄD: GET /rate-limits — {e.Message}");
}

// ── KROK 6 (dziura #5): eksport paczki jako biuro + pomiar czasu budowy ────
// Faktura musi mieć PermanentStorageDate — pętla eksportów aż paczka ją zawiera.
sw.Restart();
var encEksport = crypto.GetEncryptionData();
string? znalezionyXml = null;
InvoiceExportStatusResponse? statusEksportu = null;
DateTime oknoOd = DateTime.UtcNow.AddHours(-1);
for (int proba = 1; proba <= 12 && znalezionyXml is null; proba++)
{
    InvoiceExportRequest export = new()
    {
        Filters = new InvoiceQueryFilters
        {
            SubjectType = InvoiceSubjectType.Subject1, // sprzedażowe klienta
            DateRange = new DateRange
            {
                DateType = DateType.PermanentStorage,
                From = oknoOd,
                To = DateTime.UtcNow,
            },
        },
        Encryption = encEksport.EncryptionInfo,
    };
    var eksportOp = await ksef.ExportInvoicesAsync(export, tokenBiuro, includeMetadata: true);
    Stopwatch swPaczka = Stopwatch.StartNew();
    statusEksportu = await AsyncPollingUtils.PollAsync(
        action: () => ksef.GetInvoiceExportStatusAsync(eksportOp.ReferenceNumber, tokenBiuro),
        condition: s => s?.Status?.Code is 200 or >= 400,
        delay: TimeSpan.FromSeconds(3),
        maxAttempts: 60);
    Log($"  eksport #{proba}: status {statusEksportu?.Status?.Code} po {swPaczka.Elapsed.TotalSeconds:F1} s; " +
        $"faktur w paczce: {statusEksportu?.Package?.InvoiceCount ?? 0}");

    if (statusEksportu?.Status?.Code == 200 && statusEksportu.Package?.Parts is { Count: > 0 } czesci)
    {
        using MemoryStream archiwum = await BatchUtils.DownloadAndDecryptPackagePartsAsync(
            czesci, encEksport, crypto);
        Dictionary<string, string> pliki = await BatchUtils.UnzipTarGzAsync(archiwum);
        Log($"  paczka: {pliki.Count} plików: {string.Join(", ", pliki.Keys.Take(6))}");
        if (ksefNumber is not null && pliki.TryGetValue($"{ksefNumber}.xml", out string? xml))
        {
            znalezionyXml = xml;
        }
    }
    if (znalezionyXml is null)
    {
        Log($"  faktura {ksefNumber} jeszcze nie w paczce (PermanentStorage w drodze) — czekam 20 s");
        await Task.Delay(TimeSpan.FromSeconds(20));
    }
}
Log($"KROK 6 {(znalezionyXml is not null ? "OK" : "BŁĄD")} ({sw.Elapsed.TotalSeconds:F0} s łącznie z czekaniem na PermanentStorage)");

// ── KROK 7: parsowanie FA(3) do podstawowych pól ───────────────────────────
if (znalezionyXml is not null)
{
    XDocument fa = XDocument.Parse(znalezionyXml);
    XNamespace ns = "http://crd.gov.pl/wzor/2025/06/25/13775/";
    string? sprzedawcaNip = fa.Root?.Element(ns + "Podmiot1")?.Element(ns + "DaneIdentyfikacyjne")?.Element(ns + "NIP")?.Value;
    string? nabywcaNip = fa.Root?.Element(ns + "Podmiot2")?.Element(ns + "DaneIdentyfikacyjne")?.Element(ns + "NIP")?.Value;
    XElement? faElem = fa.Root?.Element(ns + "Fa");
    string? numer = faElem?.Element(ns + "P_2")?.Value;
    string? brutto = faElem?.Element(ns + "P_15")?.Value;
    var wiersze = faElem?.Elements(ns + "FaWiersz")
        .Select(w => $"{w.Element(ns + "P_7")?.Value} | netto {w.Element(ns + "P_11")?.Value} | VAT {w.Element(ns + "P_12")?.Value}")
        .ToList() ?? [];
    Log($"KROK 7 OK: FA(3) sparsowana — sprzedawca NIP {sprzedawcaNip}, nabywca NIP {nabywcaNip}, " +
        $"numer {numer}, brutto {brutto}, pozycji: {wiersze.Count}");
    foreach (string w in wiersze) Log($"  pozycja: {w}");
}

// ── KROK 8 (dziura #2): równoległe sesje uwierzytelniania ──────────────────
sw.Restart();
int celSesji = 8;
List<string> tokenySesji = [];
for (int i = 0; i < celSesji; i++)
{
    try
    {
        var kolejna = await AuthenticationUtils.AuthenticateAsync(auth, nipBiuro, nipKlient,
            AuthenticationTokenContextIdentifierType.Nip);
        tokenySesji.Add(kolejna.AccessToken.Token);
    }
    catch (Exception e)
    {
        Log($"  sesja równoległa #{i + 1}: ODMOWA — {e.Message}");
        break;
    }
}
int aktywne = 0;
string? kontynuacja = null;
do
{
    var strona = await activeSessions.GetActiveSessions(tokenBiuro, pageSize: 50, continuationToken: kontynuacja);
    aktywne += strona.Items?.Count ?? 0;
    kontynuacja = strona.ContinuationToken;
} while (!string.IsNullOrEmpty(kontynuacja));
Log($"KROK 8 OK ({sw.ElapsedMilliseconds} ms): otwarto dodatkowo {tokenySesji.Count}/{celSesji} sesji " +
    $"biuro→kontekst klienta; GET /auth/sessions widzi łącznie {aktywne} aktywnych sesji (biuro)");

Log($"SPIKE ZAKOŃCZONY w {total.Elapsed.TotalSeconds:F0} s");
File.WriteAllLines("spike-wynik.log", raport);
