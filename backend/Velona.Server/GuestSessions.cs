using System.Security.Cryptography;
using System.Text.Encodings.Web;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Velona.Server;

public sealed class GuestSessions(PostgresStore? store = null)
{
    private readonly object gate = new();
    private readonly Dictionary<string, Session> sessions = [];
    public GuestResponse Create(string name, DateTimeOffset now)
    {
        lock (gate)
        {
            foreach (var expired in sessions.Where(x => x.Value.ExpiresAt <= now).Select(x => x.Key).ToArray()) sessions.Remove(expired);
            if (sessions.Count >= 1000) throw new InvalidOperationException("개발 세션이 가득 찼습니다. 서버를 다시 시작해 주세요.");
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            var id = Guid.NewGuid().ToString("N");
            sessions[Hash(token)] = new(id, name, now.AddDays(30));
            return new(id, token, name);
        }
    }
    public Session? Find(string token, DateTimeOffset now)
    {
        lock (gate) return sessions.TryGetValue(Hash(token), out var s) && s.ExpiresAt > now ? s : null;
    }
    public async Task<GuestResponse> CreateAsync(string name, DateTimeOffset now, CancellationToken cancellation = default)
    {
        var response = Create(name, now);
        if (store is null) return response;
        var hash = Hash(response.SessionToken);
        Session session;
        lock (gate) session = sessions[hash];
        try { await store.SaveSessionAsync(hash, session, cancellation); }
        catch { lock (gate) sessions.Remove(hash); throw; }
        return response;
    }
    public async Task RestoreAsync(CancellationToken cancellation = default)
    {
        if (store is null) return;
        var saved = await store.LoadSessionsAsync(cancellation);
        lock (gate) foreach (var pair in saved) sessions[pair.Key] = pair.Value;
    }
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    public sealed record Session(string PlayerId, string Name, DateTimeOffset ExpiresAt);
}

public sealed class GuestAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, GuestSessions sessions)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        string token = Request.Headers.Authorization.ToString();
        token = token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? token[7..] : "";
        if (string.IsNullOrEmpty(token) && Request.Path.StartsWithSegments("/hubs/world")) token = Request.Query["access_token"].ToString();
        if (string.IsNullOrEmpty(token)) return Task.FromResult(AuthenticateResult.NoResult());
        var session = sessions.Find(token, DateTimeOffset.UtcNow);
        if (session is null) return Task.FromResult(AuthenticateResult.Fail("개발 세션이 만료되었습니다."));
        var identity = new ClaimsIdentity([new(ClaimTypes.NameIdentifier, session.PlayerId), new(ClaimTypes.Name, session.Name)], Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }
}
