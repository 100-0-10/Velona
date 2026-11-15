using System.Text.Json;
using Velona.Server;

namespace Velona.Server.Tests;

public sealed class GatheringQueueTests
{
    [Fact]
    public void ClicksReserveFiniteUnitsAndCompleteSequentiallyOnce()
    {
        var f = new Fixture(); f.Join("a"); f.MoveTo("a", 4, -2);
        Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "first").Success);
        var first = f.Snapshot("a").Gathering!;
        Assert.True(f.World.StartGather("a", "node", "fiber-1", "fiber", "first").Success);
        Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "second").Success);
        Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "third").Success);
        Assert.False(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "fourth").Success);
        Assert.Equal(2, f.Snapshot("a").GatheringQueue!.Length);
        Assert.Equal(3, f.Option("a", "fiber-1", "fiber").ReservedQuantity);
        Assert.Equal(0, f.Option("a", "fiber-1", "fiber").RemainingQuantity);
        f.Advance(1.95); Assert.Equal(0, f.Count("a", "fiber"));
        f.Advance(.1); Assert.Equal(1, f.Count("a", "fiber"));
        Assert.NotEqual(first.Id, f.Snapshot("a").Gathering!.Id);
        Assert.Single(f.Snapshot("a").GatheringQueue!);
        f.Advance(4.1);
        Assert.Equal(3, f.Count("a", "fiber"));
        Assert.Equal(6, f.Snapshot("a").Skills!.Single(s => s.Id == "foraging").Experience);
        Assert.Equal("completed", f.Snapshot("a").Gathering!.State);
        Assert.Empty(f.Snapshot("a").GatheringQueue!);
        Assert.False(f.Option("a", "fiber-1", "fiber").CanQueue);
        f.Advance(8.1); Assert.Equal(3, f.Option("a", "fiber-1", "fiber").RemainingQuantity);
        Assert.Equal(3, f.Count("a", "fiber"));
    }

    [Fact]
    public void PlayersReserveDifferentUnitsAndPendingCancellationRefundsOnlyItsUnit()
    {
        var f = new Fixture();
        foreach (var player in new[] { "a", "b", "c" }) { f.Join(player); f.MoveTo(player, 4, -2); }
        Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "a1").Success);
        Assert.True(f.World.EnqueueGather("b", "node", "fiber-1", "fiber", "b1").Success);
        Assert.True(f.World.EnqueueGather("b", "node", "fiber-1", "fiber", "b2").Success);
        Assert.False(f.World.EnqueueGather("c", "node", "fiber-1", "fiber", "c-blocked").Success);
        var pendingId = f.Snapshot("b").GatheringQueue!.Single().Id;
        Assert.False(f.World.CancelQueuedGather("a", pendingId, "foreign-cancel").Success);
        Assert.True(f.World.CancelQueuedGather("b", pendingId, "remove").Success);
        Assert.True(f.World.CancelQueuedGather("b", pendingId, "remove").Success);
        Assert.False(f.World.CancelQueuedGather("b", f.Snapshot("b").Gathering!.Id, "active-is-not-pending").Success);
        Assert.True(f.World.EnqueueGather("c", "node", "fiber-1", "fiber", "c1").Success);
        f.Advance(2.1);
        foreach (var player in new[] { "a", "b", "c" }) Assert.Equal(1, f.Count(player, "fiber"));
        Assert.Equal(0, f.Option("a", "fiber-1", "fiber").RemainingQuantity);
    }

    [Fact]
    public void MovementDisconnectAndExplicitCancelReleaseAllReservationsWithoutOfflineRewards()
    {
        var f = new Fixture(); f.Join("a"); f.MoveTo("a", 4, -2);
        for (var i = 0; i < 3; i++) Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "move-" + i).Success);
        f.World.Move("a", new(-1, 0, 9999));
        Assert.Empty(f.Snapshot("a").GatheringQueue!);
        Assert.Equal("cancelled", f.Snapshot("a").Gathering!.State);
        Assert.Equal(3, f.Option("a", "fiber-1", "fiber").RemainingQuantity);
        for (var i = 0; i < 3; i++) Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "cancel-" + i).Success);
        Assert.True(f.World.CancelGather("a", "cancel-all").Success);
        Assert.Equal(3, f.Option("a", "fiber-1", "fiber").RemainingQuantity);
        for (var i = 0; i < 3; i++) Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "disconnect-" + i).Success);
        f.World.Disconnect("a"); f.Advance(30); f.World.Join("a", "a", "returned", "meadow-1");
        Assert.Empty(f.Snapshot("returned").GatheringQueue!);
        Assert.Empty(f.Snapshot("returned").Inventory);
        Assert.Equal(0, f.Snapshot("returned").Skills!.Single(s => s.Id == "foraging").Experience);
        Assert.Equal(3, f.Option("returned", "fiber-1", "fiber").RemainingQuantity);
    }

    [Fact]
    public void QueueHasServerLimitAndRejectsSwitchingTargetBeforeDrain()
    {
        var f = new Fixture();
        f.Catalog.Gathering.Profiles["plant"][0] = f.Catalog.Gathering.Profiles["plant"][0] with { Quantity = 30 };
        f.Join("a"); f.MoveTo("a", 4, -2);
        for (var i = 0; i < 20; i++) Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "unit-" + i).Success);
        Assert.False(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "overflow").Success);
        Assert.Equal(19, f.Snapshot("a").GatheringQueue!.Length);
        Assert.Equal(20, f.Snapshot("a").GatherQueueLimit);
        Assert.True(f.World.CancelQueuedGather("a", f.Snapshot("a").GatheringQueue![0].Id, "remove-one").Success);
        Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "replacement").Success);
        f.World.CancelGather("a", "clear"); f.MoveTo("a", 8, 2);
        Assert.True(f.World.EnqueueGather("a", "node", "bark-1", "bark", "tree-one").Success);
        Assert.False(f.World.EnqueueGather("a", "node", "bark-2", "bark", "different-tree").Success);
        Assert.True(f.World.EnqueueGather("a", "node", "bark-1", "log", "same-tree-other-material").Success);
    }

    [Fact]
    public void ActualAttackAndIncomingHitCancelQueuedWorkAndReleaseStock()
    {
        var f = new Fixture(); f.Join("a"); f.MoveTo("a", 4, -2);
        f.Restore(checkpoint => checkpoint with { Boar = checkpoint.Boar with { X = 6, Z = -2, State = "idle" } });
        for (var i = 0; i < 3; i++) Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "fiber-" + i).Success);
        Assert.True(f.World.Attack("a", "boar-1", "actual-hit").Success);
        Assert.Empty(f.Snapshot("a").GatheringQueue!);
        Assert.Equal(3, f.Option("a", "fiber-1", "fiber").RemainingQuantity);
        f.MoveTo("a", 8, 2);
        f.Restore(checkpoint => checkpoint with { Boar = checkpoint.Boar with { X = 8, Z = 4, State = "idle" } });
        Assert.True(f.World.EnqueueGather("a", "node", "bark-1", "bark", "bark").Success);
        Assert.True(f.World.EnqueueGather("a", "node", "bark-1", "log", "log").Success);
        f.Advance(3);
        Assert.True(f.Snapshot("a").Players.Single(p => p.Id == "a").Hp < 120);
        Assert.Empty(f.Snapshot("a").GatheringQueue!);
        Assert.Equal("cancelled", f.Snapshot("a").Gathering!.State);
        Assert.Equal(3, f.Option("a", "bark-1", "bark").RemainingQuantity);
        Assert.Equal(0, f.Count("a", "bark")); Assert.Equal(0, f.Count("a", "log"));
    }

    [Fact]
    public void PendingRewardsReserveStackCapacityAndCancelMakesSpaceAvailable()
    {
        var f = new Fixture(); f.Join("a"); f.MoveTo("a", 4, -2);
        f.Restore(checkpoint => checkpoint with { Players = [checkpoint.Players[0] with { Inventory = new() { ["fiber"] = 98 } }] });
        Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "last-slot").Success);
        Assert.False(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "would-overflow").Success);
        Assert.True(f.World.CancelGather("a", "free-slot").Success);
        Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "new-reservation").Success);
        f.Advance(2.1); Assert.Equal(99, f.Count("a", "fiber"));
        Assert.False(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "full-stack").Success);
        Assert.Equal(2, f.Option("a", "fiber-1", "fiber").RemainingQuantity);
    }

    [Fact]
    public void CheckpointKeepsConsumedUnitsAndRefundsPendingWorkWithoutReplayRewards()
    {
        var f = new Fixture(); f.Join("a"); f.MoveTo("a", 4, -2);
        foreach (var id in new[] { "one", "two", "three" }) Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", id).Success);
        f.Advance(2.1);
        Assert.Equal(1, f.Count("a", "fiber")); Assert.Single(f.Snapshot("a").GatheringQueue!);
        f.Restore(checkpoint => JsonSerializer.Deserialize<WorldCheckpoint>(JsonSerializer.Serialize(checkpoint))!);
        var snapshot = f.Snapshot("a");
        Assert.Null(snapshot.Gathering); Assert.Empty(snapshot.GatheringQueue!);
        Assert.Equal(1, f.Count("a", "fiber"));
        Assert.Equal(2, f.Option("a", "fiber-1", "fiber").RemainingQuantity);
        Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "two").Success);
        Assert.Null(f.Snapshot("a").Gathering);
        Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "new-one").Success);
        Assert.True(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "new-two").Success);
        Assert.False(f.World.EnqueueGather("a", "node", "fiber-1", "fiber", "new-three").Success);
        f.Advance(4.1); Assert.Equal(3, f.Count("a", "fiber"));
    }

    [Fact]
    public void CorpseCountsArePersonalFiniteAndPersistPartialHarvest()
    {
        var f = new Fixture(); f.Join("a"); f.Join("b"); f.Join("bystander");
        foreach (var player in new[] { "a", "b", "bystander" }) f.MoveTo(player, 4, -2);
        f.Restore(checkpoint => checkpoint with { Boar = checkpoint.Boar with { X = 6, Z = -2, Hp = 0, State = "dead", Participants = ["a", "b"], RespawnAtUtc = f.Clock.Now.AddSeconds(20) } });
        Assert.False(f.World.EnqueueGather("bystander", "corpse", "boar-1", "hide", "no-right").Success);
        for (var i = 0; i < 3; i++)
        {
            Assert.True(f.World.EnqueueGather("a", "corpse", "boar-1", "hide", "a-hide-" + i).Success);
            Assert.True(f.World.EnqueueGather("b", "corpse", "boar-1", "hide", "b-hide-" + i).Success);
        }
        Assert.False(f.World.EnqueueGather("a", "corpse", "boar-1", "hide", "too-many").Success);
        f.Advance(3.6); Assert.Equal(1, f.Count("a", "raw_hide")); Assert.Equal(1, f.Count("b", "raw_hide"));
        f.Restore(checkpoint => checkpoint);
        Assert.Equal(2, f.Snapshot("a").Monsters[0].Options!.Single(o => o.Id == "hide").RemainingQuantity);
        Assert.Empty(f.Snapshot("a").GatheringQueue!);
        Assert.True(f.World.EnqueueGather("a", "corpse", "boar-1", "hide", "after-restart").Success);
        f.Advance(3.6); Assert.Equal(2, f.Count("a", "raw_hide"));
    }

    [Fact]
    public void CorpseRejectsReservationsThatCannotFinishBeforeExpiry()
    {
        var f = new Fixture(); f.Join("a"); f.MoveTo("a", 4, -2);
        f.Restore(checkpoint => checkpoint with { Boar = checkpoint.Boar with { X = 6, Z = -2, Hp = 0, State = "dead", Participants = ["a"], RespawnAtUtc = f.Clock.Now.AddSeconds(8) } });
        Assert.True(f.World.EnqueueGather("a", "corpse", "boar-1", "hide", "one").Success);
        Assert.True(f.World.EnqueueGather("a", "corpse", "boar-1", "hide", "two").Success);
        Assert.False(f.World.EnqueueGather("a", "corpse", "boar-1", "hide", "too-late").Success);
        Assert.True(f.World.CancelQueuedGather("a", f.Snapshot("a").GatheringQueue!.Single().Id, "remove").Success);
        Assert.True(f.World.EnqueueGather("a", "corpse", "boar-1", "meat", "shorter").Success);
        f.Advance(6.2); Assert.Equal(1, f.Count("a", "raw_hide")); Assert.Equal(1, f.Count("a", "meat"));
        f.Advance(2); Assert.False(f.World.EnqueueGather("a", "corpse", "boar-1", "hide", "expired").Success);
    }

    [Fact]
    public void LegacyHarvestMarkersNeverGrantPreviouslyAwardedBundlesAgain()
    {
        var f = new Fixture(); f.Join("a"); f.MoveTo("a", 4, -2);
        f.Restore(checkpoint => checkpoint with { Boar = checkpoint.Boar with { X = 6, Z = -2, Hp = 0, State = "dead", Participants = ["a"], Harvested = ["a|hide"], RespawnAtUtc = f.Clock.Now.AddSeconds(20) } });
        Assert.False(f.World.EnqueueGather("a", "corpse", "boar-1", "hide", "legacy-hide").Success);
        Assert.True(f.World.EnqueueGather("a", "corpse", "boar-1", "meat", "new-part").Success);
        f.World.CancelGather("a", "cancel");
        f.Restore(checkpoint => checkpoint with { Boar = checkpoint.Boar with { Harvested = ["a"] } });
        Assert.False(f.World.EnqueueGather("a", "corpse", "boar-1", "meat", "legacy-all").Success);
    }

    private sealed class Fixture
    {
        public ManualClock Clock { get; } = new();
        public ContentCatalog Catalog { get; } = new(Path.Combine(AppContext.BaseDirectory, "Content", "Design"), .05);
        public GameWorld World { get; private set; }
        private readonly Dictionary<string, long> sequences = [];
        private readonly List<string> joined = [];
        public Fixture() { World = new(Catalog, Clock); }
        public void Join(string id) { World.Join(id, id, id, "meadow-1"); joined.Add(id); }
        public WorldSnapshot Snapshot(string connection) => World.Snapshots().Single(s => s.ConnectionId == connection).Snapshot;
        public GatherOption Option(string connection, string node, string id) => Snapshot(connection).Nodes.Single(n => n.Id == node).Options!.Single(o => o.Id == id);
        public int Count(string connection, string item) => Snapshot(connection).Inventory.FirstOrDefault(i => i.ItemId == item)?.Quantity ?? 0;
        public void Advance(double seconds)
        {
            for (var t = 0d; t < seconds - .000001; t += .05) { Clock.Now += TimeSpan.FromSeconds(.05); World.Step(TimeSpan.FromSeconds(.05)); }
        }
        public void Restore(Func<WorldCheckpoint, WorldCheckpoint> transform)
        {
            var saved = transform(World.ExportCheckpoint()); World = new(Catalog, Clock); World.RestoreCheckpoint(saved);
            foreach (var id in joined) World.Join(id, id, id, "meadow-1");
        }
        public void MoveTo(string id, double x, double z)
        {
            for (var i = 0; i < 250; i++)
            {
                var p = Snapshot(id).Players.Single(p => p.Id == id); var dx = x - p.X; var dz = z - p.Z; var length = Math.Sqrt(dx * dx + dz * dz);
                sequences[id] = sequences.GetValueOrDefault(id) + 1;
                if (length < .15) { World.Move(id, new(0, 0, sequences[id])); return; }
                World.Move(id, new(dx / Math.Max(.21, length), dz / Math.Max(.21, length), sequences[id])); Advance(.05);
            }
            Assert.Fail("Could not reach gathering test position.");
        }
    }
    private sealed class ManualClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 11, 15, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
