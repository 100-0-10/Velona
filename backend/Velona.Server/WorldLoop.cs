using Microsoft.AspNetCore.SignalR;

namespace Velona.Server;

public sealed class WorldLoop(GameWorld world, ILogger<WorldLoop> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(50));
        var last = TimeProvider.System.GetTimestamp();
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                var now = TimeProvider.System.GetTimestamp();
                world.Step(TimeProvider.System.GetElapsedTime(last, now));
                last = now;
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        catch (Exception exception)
        {
            logger.LogCritical(exception, "World simulation loop failed.");
            throw;
        }
    }
}

/// <summary>Only one broadcast batch is in flight; a slow socket never pauses simulation.</summary>
public sealed class SnapshotBroadcaster(GameWorld world, IHubContext<WorldHub> hub, ILogger<SnapshotBroadcaster> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(100));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                var snapshots = world.Snapshots();
                using var batch = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                batch.CancelAfter(TimeSpan.FromMilliseconds(250));
                try
                {
                    await Task.WhenAll(snapshots.Select(s => hub.Clients.Client(s.ConnectionId).SendAsync("WorldSnapshot", s.Snapshot, batch.Token)));
                }
                catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
                {
                    logger.LogDebug("Dropped a stale snapshot batch after send timeout.");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
