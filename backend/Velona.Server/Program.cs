using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Velona.Server;

var builder = WebApplication.CreateBuilder(args);
builder.Services.Configure<GameOptions>(builder.Configuration.GetSection("Game"));
builder.Services.AddSingleton<PostgresStore>();
builder.Services.AddSingleton<GuestSessions>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(provider => new ContentCatalog(
    Path.Combine(AppContext.BaseDirectory, "Content", "Design"),
    provider.GetRequiredService<IOptions<GameOptions>>().Value.ProductionTimeScale));
builder.Services.AddSingleton<GameWorld>();
builder.Services.AddHostedService<CheckpointWriter>();
builder.Services.AddHostedService<WorldLoop>();
builder.Services.AddHostedService<SnapshotBroadcaster>();
builder.Services.AddAuthentication("Guest").AddScheme<AuthenticationSchemeOptions, GuestAuthenticationHandler>("Guest", _ => { });
builder.Services.AddAuthorization();
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 8192;
    options.MaximumParallelInvocationsPerClient = 1;
    options.EnableDetailedErrors = false;
});
var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
{
    if (origins.Length > 0) policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
}));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("guest", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var app = builder.Build();
var store = app.Services.GetRequiredService<PostgresStore>();
await store.InitializeAsync();
await app.Services.GetRequiredService<GuestSessions>().RestoreAsync();
var gameWorld = app.Services.GetRequiredService<GameWorld>();
var savedWorld = await store.LoadWorldAsync();
if (savedWorld is not null) gameWorld.RestoreCheckpoint(savedWorld);
await store.SaveWorldAsync(gameWorld.ExportCheckpoint());
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/health", (IHostEnvironment environment, IOptions<GameOptions> options, PostgresStore persistence) => Results.Json(new
{
    status = persistence.Enabled && !persistence.Healthy ? "degraded" : "ok", service = "Velona.Server", version = "0.1.0", environment = environment.EnvironmentName,
    developmentGuestSessions = environment.IsDevelopment(), productionTimeScale = options.Value.ProductionTimeScale,
    persistence = persistence.Enabled ? "postgresql" : "in-memory-test-only", lastSavedAtUtc = persistence.LastSavedAtUtc, channelCapacity = GameWorld.Capacity
}, statusCode: persistence.Enabled && !persistence.Healthy ? 503 : 200));
app.MapPost("/api/guest", async (GuestRequest request, GuestSessions sessions, IHostEnvironment environment, CancellationToken cancellation) =>
{
    if (!environment.IsDevelopment()) return Results.Problem("Guest sessions are only enabled in Development.", statusCode: 403);
    var name = request.Name?.Trim() ?? "";
    if (name.Length is < 1 or > 16 || name.Any(char.IsControl)) return Results.BadRequest(new { message = "이름은 1~16자로 입력해 주세요." });
    try { return Results.Ok(await sessions.CreateAsync(name, DateTimeOffset.UtcNow, cancellation)); }
    catch (InvalidOperationException e) { return Results.Problem(e.Message, statusCode: 503); }
}).RequireRateLimiting("guest");
app.MapGet("/api/catalog", (ContentCatalog catalog) => Results.Ok(catalog.Snapshot()));
app.MapHub<WorldHub>("/hubs/world");
app.Run();

public partial class Program;
