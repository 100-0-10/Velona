using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

namespace Velona.Server;

/// <summary>One development-world checkpoint, saved outside the simulation lock.</summary>
public sealed class PostgresStore : IAsyncDisposable
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly NpgsqlDataSource? source;
    private NpgsqlConnection? lease;
    private readonly long leaseKey;
    public bool Enabled { get; }
    public bool Healthy { get; private set; }
    public DateTimeOffset? LastSavedAtUtc { get; private set; }
    public string WorldKey { get; }

    public PostgresStore(IConfiguration configuration)
    {
        Enabled = configuration.GetValue("Persistence:Enabled", true);
        WorldKey = configuration["Persistence:WorldKey"] ?? "meadow-1";
        if (WorldKey.Length is < 1 or > 64 || WorldKey.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-'))
            throw new InvalidOperationException("Persistence:WorldKey must be 1-64 ASCII letters, digits or hyphens.");
        leaseKey = BitConverter.ToInt64(SHA256.HashData(Encoding.UTF8.GetBytes("Velona:" + WorldKey)), 0);
        if (!Enabled) return;
        var connection = configuration.GetConnectionString("Velona");
        if (string.IsNullOrWhiteSpace(connection))
            throw new InvalidOperationException("PostgreSQL connection is missing. Run scripts/setup-local-db.ps1 or set ConnectionStrings__Velona. Use Persistence__Enabled=false only for isolated prototype tests.");
        source = NpgsqlDataSource.Create(connection);
    }

    public async Task InitializeAsync(CancellationToken cancellation = default)
    {
        if (source is null) return;
        lease = await source.OpenConnectionAsync(cancellation);
        await using (var command = new NpgsqlCommand("SELECT pg_try_advisory_lock($1)", lease))
        {
            command.Parameters.AddWithValue(leaseKey);
            if (await command.ExecuteScalarAsync(cancellation) is not true)
                throw new InvalidOperationException("This Velona world is already running against this database. Stop the other server first.");
        }
        await using var connection = await source.OpenConnectionAsync(cancellation);
        await using var transaction = await connection.BeginTransactionAsync(cancellation);
        await using var migration = new NpgsqlCommand("""
            CREATE SCHEMA IF NOT EXISTS velona;
            CREATE TABLE IF NOT EXISTS velona.schema_history (
                version integer PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS velona.guest_sessions (
                token_hash text PRIMARY KEY,
                player_id text NOT NULL UNIQUE,
                display_name text NOT NULL,
                expires_at timestamptz NOT NULL
            );
            CREATE TABLE IF NOT EXISTS velona.world_checkpoints (
                world_key text PRIMARY KEY,
                payload jsonb NOT NULL,
                saved_at timestamptz NOT NULL
            );
            INSERT INTO velona.schema_history(version) VALUES (1) ON CONFLICT DO NOTHING;
            DELETE FROM velona.guest_sessions WHERE expires_at <= now();
            """, connection, transaction);
        await migration.ExecuteNonQueryAsync(cancellation);
        await transaction.CommitAsync(cancellation);
        Healthy = true;
    }

    public async Task SaveSessionAsync(string hash, GuestSessions.Session session, CancellationToken cancellation = default)
    {
        if (source is null) return;
        await using var command = source.CreateCommand("""
            INSERT INTO velona.guest_sessions(token_hash, player_id, display_name, expires_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (token_hash) DO NOTHING
            """);
        command.Parameters.AddWithValue(hash);
        command.Parameters.AddWithValue(session.PlayerId);
        command.Parameters.AddWithValue(session.Name);
        command.Parameters.AddWithValue(session.ExpiresAt);
        await command.ExecuteNonQueryAsync(cancellation);
    }

    public async Task<Dictionary<string, GuestSessions.Session>> LoadSessionsAsync(CancellationToken cancellation = default)
    {
        var result = new Dictionary<string, GuestSessions.Session>();
        if (source is null) return result;
        await using var command = source.CreateCommand("SELECT token_hash, player_id, display_name, expires_at FROM velona.guest_sessions WHERE expires_at > now()");
        await using var reader = await command.ExecuteReaderAsync(cancellation);
        while (await reader.ReadAsync(cancellation))
            result.Add(reader.GetString(0), new(reader.GetString(1), reader.GetString(2), new DateTimeOffset(reader.GetDateTime(3))));
        return result;
    }

    public async Task<WorldCheckpoint?> LoadWorldAsync(CancellationToken cancellation = default)
    {
        if (source is null) return null;
        await using var command = source.CreateCommand("SELECT payload::text FROM velona.world_checkpoints WHERE world_key = $1");
        command.Parameters.AddWithValue(WorldKey);
        var payload = await command.ExecuteScalarAsync(cancellation) as string;
        return payload is null ? null : JsonSerializer.Deserialize<WorldCheckpoint>(payload, Json)
            ?? throw new InvalidDataException("Saved Velona world could not be loaded.");
    }

    public async Task SaveWorldAsync(WorldCheckpoint checkpoint, CancellationToken cancellation = default)
    {
        if (source is null) return;
        var payload = JsonSerializer.Serialize(checkpoint, Json);
        try
        {
            // Do not silently reconnect as a second writer after losing the lease.
            if (lease is null || lease.State != System.Data.ConnectionState.Open)
                throw new InvalidOperationException("PostgreSQL world lease was lost. Restart the game server after restoring the database connection.");
            await using (var guard = new NpgsqlCommand("SELECT 1", lease))
                await guard.ExecuteScalarAsync(cancellation);
            await using var command = source.CreateCommand("""
                INSERT INTO velona.world_checkpoints(world_key, payload, saved_at) VALUES ($1, $2, $3)
                ON CONFLICT (world_key) DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at
                """);
            command.Parameters.AddWithValue(WorldKey);
            command.Parameters.AddWithValue(NpgsqlDbType.Jsonb, payload);
            command.Parameters.AddWithValue(checkpoint.SavedAtUtc);
            await command.ExecuteNonQueryAsync(cancellation);
            LastSavedAtUtc = checkpoint.SavedAtUtc;
            Healthy = true;
        }
        catch { Healthy = false; throw; }
    }

    public async ValueTask DisposeAsync()
    {
        if (lease is not null)
        {
            try
            {
                await using var release = new NpgsqlCommand("SELECT pg_advisory_unlock($1)", lease);
                release.Parameters.AddWithValue(leaseKey);
                await release.ExecuteScalarAsync();
            }
            finally { await lease.DisposeAsync(); }
        }
        if (source is not null) await source.DisposeAsync();
    }
}

public sealed class CheckpointWriter(GameWorld world, PostgresStore store, ILogger<CheckpointWriter> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!store.Enabled) return;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try { await store.SaveWorldAsync(world.ExportCheckpoint(), stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
                catch (Exception exception) { logger.LogError(exception, "PostgreSQL checkpoint failed; health reports degraded persistence."); }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken);
        if (store.Enabled) await store.SaveWorldAsync(world.ExportCheckpoint(), cancellationToken);
    }
}

public sealed record WorldCheckpoint(int SchemaVersion, DateTimeOffset SavedAtUtc, SavedExplorer[] Players, SavedNode[] Nodes, SavedBoar Boar);
public sealed record SavedExplorer(string Id, string Name, string Color, double X, double Z, double Hp, double Stamina,
    Dictionary<string, int> Inventory, SavedJob? Job, SavedRequest[] Requests, Guid[] SeenRequests,
    DateTimeOffset LastAttack, DateTimeOffset LastGather, DateTimeOffset LastDamage, Dictionary<string, int>? SkillExperience = null);
public sealed record SavedJob(string Id, RecipeDefinition Recipe, DateTimeOffset StartedAtUtc, DateTimeOffset CompletesAtUtc, bool Completed);
public sealed record SavedRequest(string Id, string Fingerprint, ActionResult Result);
public sealed record SavedNode(string Id, DateTimeOffset RespawnAtUtc, Dictionary<string, DateTimeOffset>? OptionRespawnAtUtc = null, Dictionary<string, int>? RemainingQuantities = null);
public sealed record SavedBoar(double X, double Z, double Hp, string State, DateTimeOffset RespawnAtUtc, string[] Participants, string[] Harvested, int Generation = 1, Dictionary<string, int>? HarvestCounts = null);
