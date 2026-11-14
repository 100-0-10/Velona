using Velona.Server;

namespace Velona.Server.Tests;

public sealed class WorldTests
{
    [Fact]
    public void MovementIsAuthoritativeNormalizedAndStopsAfterStaleInput()
    {
        var f = new Fixture();
        f.World.Join("a", "Alice", "a-connection", "meadow-1");
        f.World.Join("b", "Bob", "b-connection", "meadow-1");
        f.World.Move("a-connection", new(1000, 1000, 1));
        f.Advance(.1);
        var p = f.Snapshot("a-connection").Players.Single(x => x.Id == "a");
        Assert.InRange(Math.Sqrt(p.X * p.X + p.Z * p.Z), .419, .421);
        Assert.Equal(2, f.Snapshot("b-connection").Players.Length);
        f.World.Move("a-connection", new(double.NaN, double.PositiveInfinity, 2));
        f.Advance(.4);
        var stopped = f.Snapshot("a-connection").Players.Single(x => x.Id == "a");
        f.Advance(.2);
        var again = f.Snapshot("a-connection").Players.Single(x => x.Id == "a");
        Assert.Equal(stopped.X, again.X);
        Assert.Equal(stopped.Z, again.Z);
    }

    [Fact]
    public void ReconnectReplacesConnectionAndCannotLeaveGhostOrOldInput()
    {
        var f = new Fixture();
        f.World.Join("a", "Alice", "old", "meadow-1");
        f.World.Move("old", new(1, 0, 7));
        f.World.Join("a", "Alice", "new", "meadow-1");
        f.World.Disconnect("old");
        f.World.Move("old", new(1, 0, 8));
        f.Advance(.1);
        var snapshot = f.Snapshot("new");
        Assert.Single(snapshot.Players);
        Assert.Equal(0, snapshot.Players[0].X);
        Assert.False(f.Gather("old", "fiber-1", "request-old").Success);
        f.World.Move("new", new(1, 0, 0));
        f.Advance(.1);
        Assert.True(f.Snapshot("new").Players[0].X > 0);
    }

    [Fact]
    public void GatheringChecksDistanceAndRetriesCannotDuplicateOrChangeAction()
    {
        var f = new Fixture();
        f.World.Join("a", "Alice", "a", "meadow-1");
        Assert.False(f.Gather("a", "fiber-1", "too-far").Success);
        f.MoveTo("a", 4, -2);
        var first = f.Gather("a", "fiber-1", "same-request");
        Assert.True(first.Success);
        Assert.Equal(first, f.Gather("a", "fiber-1", "same-request"));
        Assert.Equal(3, f.Count("a", "fiber"));
        Assert.False(f.Gather("a", "bark-1", "same-request").Success);
        Assert.False(f.World.Craft("a", "nonexistent", "bad-recipe").Success);
    }

    [Fact]
    public void PersonalHarvestIsOncePerParticipantAndExcludesBystanders()
    {
        var f = new Fixture();
        f.World.Join("a", "Alice", "a", "meadow-1");
        f.World.Join("b", "Bob", "b", "meadow-1");
        f.World.Join("c", "Bystander", "c", "meadow-1");
        f.MoveTo("a", 10, 6);
        f.MoveTo("b", 10, 6);
        Assert.True(f.World.Attack("a", "boar-1", "attack-a-1").Success);
        Assert.True(f.World.Attack("b", "boar-1", "attack-b-1").Success);
        for (var i = 0; i < 4; i++) { f.Advance(1.3); Assert.True(f.World.Attack("a", "boar-1", "attack-a-" + (i + 2)).Success); }
        Assert.Equal("dead", f.Snapshot("a").Monsters[0].State);
        Assert.True(f.World.Harvest("a", "boar-1", "material", "harvest-a").Success);
        Assert.True(f.World.Harvest("b", "boar-1", "material", "harvest-b").Success);
        Assert.Equal(0, f.Count("a", "raw_hide"));
        f.Advance(4);
        Assert.False(f.World.Harvest("a", "boar-1", "material", "harvest-a-again").Success);
        Assert.False(f.World.Harvest("c", "boar-1", "material", "harvest-c").Success);
        Assert.Equal(3, f.Count("a", "raw_hide"));
        Assert.Equal(3, f.Count("b", "raw_hide"));
        Assert.Equal(0, f.Count("a", "meat"));
    }

    [Fact]
    public void CraftConsumesOnceCompletesOfflineAndReconnectPreservesInventory()
    {
        var f = new Fixture();
        f.World.Join("a", "Alice", "a", "meadow-1");
        f.MoveTo("a", 4, -2);
        Assert.True(f.Gather("a", "fiber-1", "gather").Success);
        var result = f.World.Craft("a", "cord_hand", "craft-once");
        Assert.True(result.Success);
        Assert.Equal(result, f.World.Craft("a", "cord_hand", "craft-once"));
        Assert.Equal(1, f.Count("a", "fiber"));
        Assert.False(f.World.Craft("a", "cord_hand", "second-job").Success);
        f.World.Disconnect("a");
        f.Advance(5);
        f.World.Join("a", "Alice", "returned", "meadow-1");
        Assert.Equal(1, f.Count("returned", "cord"));
        f.Advance(5);
        Assert.Equal(1, f.Count("returned", "cord"));
        Assert.Single(f.Snapshot("returned").Players);
    }

    [Fact]
    public void CatalogKeepsDesignQuantitiesButScalesOnlyDevelopmentDurations()
    {
        var f = new Fixture();
        var bag = f.Catalog.Snapshot().Recipes.Single(x => x.Id == "bag");
        Assert.Equal(3, bag.Inputs.Single(x => x.ItemId == "leather").Quantity);
        Assert.Equal(4, bag.Inputs.Single(x => x.ItemId == "cord").Quantity);
        var tanning = f.Catalog.Snapshot().Recipes.Single(x => x.Id == "tan");
        Assert.Equal(12, tanning.DurationSeconds);
        Assert.Equal("무두질 통", tanning.StationName);
    }

    [Fact]
    public void SessionsExpireAndNamesAreNotIdentityCredentials()
    {
        var sessions = new GuestSessions();
        var now = DateTimeOffset.UtcNow;
        var first = sessions.Create("Same name", now);
        var second = sessions.Create("Same name", now);
        Assert.NotEqual(first.PlayerId, second.PlayerId);
        Assert.NotEqual(first.SessionToken, second.SessionToken);
        Assert.NotNull(sessions.Find(first.SessionToken, now));
        Assert.NotNull(sessions.Find(first.SessionToken, now.AddDays(29)));
        Assert.Null(sessions.Find(first.SessionToken, now.AddDays(31)));
    }

    [Fact]
    public void EvictedRequestIdsAreRejectedRatherThanExecutedAgain()
    {
        var f = new Fixture();
        f.World.Join("a", "Alice", "a", "meadow-1");
        f.MoveTo("a", 4, -2);
        Assert.True(f.Gather("a", "fiber-1", "original-gather").Success);
        for (var i = 0; i < 130; i++) f.World.Craft("a", "not-available", "evict-" + i);
        f.Advance(9);
        Assert.False(f.Gather("a", "fiber-1", "original-gather").Success);
        Assert.Equal(3, f.Count("a", "fiber"));
        Assert.True(f.Gather("a", "fiber-1", "new-gather").Success);
        Assert.Equal(6, f.Count("a", "fiber"));
    }

    [Fact]
    public void FullOutputStackRejectsCraftWithoutSpendingMaterials()
    {
        var f = new Fixture();
        f.World.Join("a", "Alice", "a", "meadow-1");
        f.MoveTo("a", 4, -2);
        for (var i = 0; i < 99; i++)
        {
            if (f.Count("a", "fiber") < 2)
            {
                f.Advance(8.1);
                Assert.True(f.Gather("a", "fiber-1", "fiber-" + i).Success);
            }
            Assert.True(f.World.Craft("a", "cord_hand", "cord-" + i).Success);
            f.Advance(.2);
        }
        Assert.Equal(99, f.Count("a", "cord"));
        f.Advance(8.1);
        Assert.True(f.Gather("a", "fiber-1", "overflow-fiber").Success);
        var before = f.Count("a", "fiber");
        Assert.False(f.World.Craft("a", "cord_hand", "overflow-craft").Success);
        Assert.Equal(before, f.Count("a", "fiber"));
        Assert.Equal(99, f.Count("a", "cord"));
    }

    [Fact]
    public void SerializedCheckpointRestoresInventoryPendingJobAndReplayProtection()
    {
        var f = new Fixture();
        f.World.Join("saved-player", "Saved", "old", "meadow-1");
        f.MoveTo("old", 4, -2);
        Assert.True(f.Gather("old", "fiber-1", "saved-harvest").Success);
        Assert.True(f.World.Craft("old", "cord_hand", "saved-craft").Success);
        var json = System.Text.Json.JsonSerializer.Serialize(f.World.ExportCheckpoint());
        var saved = System.Text.Json.JsonSerializer.Deserialize<WorldCheckpoint>(json)!;
        f.Clock.Now += TimeSpan.FromMinutes(1);
        var restored = new GameWorld(f.Catalog, f.Clock);
        restored.RestoreCheckpoint(saved);
        restored.Join("saved-player", "Saved", "new", "meadow-1");
        restored.Step(TimeSpan.FromMilliseconds(50));
        var after = restored.Snapshots().Single().Snapshot;
        Assert.Equal(1, after.Inventory.Single(i => i.ItemId == "fiber").Quantity);
        Assert.Equal(1, after.Inventory.Single(i => i.ItemId == "cord").Quantity);
        Assert.True(restored.StartGather("new", "node", "fiber-1", "fiber", "saved-harvest").Success);
        Assert.Equal(1, restored.Snapshots().Single().Snapshot.Inventory.Single(i => i.ItemId == "fiber").Quantity);
        var twice = new GameWorld(f.Catalog, f.Clock);
        twice.RestoreCheckpoint(restored.ExportCheckpoint());
        twice.Join("saved-player", "Saved", "again", "meadow-1");
        twice.Step(TimeSpan.FromSeconds(1));
        Assert.Equal(1, twice.Snapshots().Single().Snapshot.Inventory.Single(i => i.ItemId == "cord").Quantity);
        Assert.Single(twice.Snapshots().Single().Snapshot.Players);
    }

    [Fact]
    public void UnsupportedCheckpointVersionCannotOverwriteWorld()
    {
        var f = new Fixture();
        var invalid = f.World.ExportCheckpoint() with { SchemaVersion = 999 };
        Assert.Throws<InvalidDataException>(() => f.World.RestoreCheckpoint(invalid));
    }

    [Fact]
    public void InspectAndStartNeverAwardBeforeDeadlineAndCompletionIsOnce()
    {
        var f = new Fixture();
        f.World.Join("a", "A", "a", "meadow-1"); f.MoveTo("a", 4, -2);
        Assert.True(f.World.Interact("a", "fiber-1", "inspect").Success);
        Assert.Empty(f.Snapshot("a").Inventory);
        Assert.True(f.World.StartGather("a", "node", "fiber-1", "fiber", "start").Success);
        var ends = f.Snapshot("a").Gathering!.CompletesAtUtc;
        Assert.True(f.World.StartGather("a", "node", "fiber-1", "fiber", "start").Success);
        Assert.Equal(ends, f.Snapshot("a").Gathering!.CompletesAtUtc);
        f.Advance(1.9);
        Assert.Empty(f.Snapshot("a").Inventory);
        Assert.Equal(0, f.Snapshot("a").Skills!.Single(s => s.Id == "foraging").Experience);
        f.Advance(.2);
        Assert.Equal(3, f.Count("a", "fiber"));
        Assert.Equal(2, f.Snapshot("a").Skills!.Single(s => s.Id == "foraging").Experience);
        f.Advance(3);
        Assert.Equal(3, f.Count("a", "fiber"));
    }

    [Fact]
    public void SharedReservationCancelsOnMovementAndAnotherPlayerCanGather()
    {
        var f = new Fixture();
        f.World.Join("a", "A", "a", "meadow-1"); f.World.Join("b", "B", "b", "meadow-1");
        f.MoveTo("a", 4, -2); f.MoveTo("b", 4, -2);
        Assert.True(f.World.StartGather("a", "node", "fiber-1", "fiber", "a-start").Success);
        Assert.False(f.World.StartGather("b", "node", "fiber-1", "fiber", "b-busy").Success);
        f.World.Move("a", new(-1, 0, 9999));
        Assert.Equal("cancelled", f.Snapshot("a").Gathering!.State);
        Assert.True(f.World.StartGather("b", "node", "fiber-1", "fiber", "b-start").Success);
        f.Advance(2.1);
        Assert.Equal(0, f.Count("a", "fiber")); Assert.Equal(3, f.Count("b", "fiber"));
    }

    [Fact]
    public void DifferentMaterialsOnSameTreeCanBeWorkedIndependently()
    {
        var f = new Fixture();
        f.World.Join("a", "A", "a", "meadow-1"); f.World.Join("b", "B", "b", "meadow-1");
        f.MoveTo("a", 4.5, 2); f.MoveTo("b", 4.5, 2);
        Assert.True(f.World.StartGather("a", "node", "bark-1", "bark", "bark").Success);
        Assert.True(f.World.StartGather("b", "node", "bark-1", "log", "log").Success);
        f.Advance(3.1);
        Assert.Equal(3, f.Count("a", "bark")); Assert.Equal(0, f.Count("b", "log"));
        f.Advance(2);
        Assert.Equal(2, f.Count("b", "log"));
    }

    [Fact]
    public void CancelAndDisconnectNeverProduceOfflineGatherRewards()
    {
        var f = new Fixture();
        f.World.Join("a", "A", "a", "meadow-1"); f.MoveTo("a", 4, -2);
        Assert.True(f.World.StartGather("a", "node", "fiber-1", "fiber", "start").Success);
        Assert.True(f.World.CancelGather("a", "cancel").Success);
        f.Advance(3); Assert.Empty(f.Snapshot("a").Inventory);
        Assert.True(f.World.StartGather("a", "node", "fiber-1", "fiber", "start-again").Success);
        f.World.Disconnect("a"); f.Advance(10); f.World.Join("a", "A", "a2", "meadow-1");
        Assert.Empty(f.Snapshot("a2").Inventory);
        Assert.Equal(0, f.Snapshot("a2").Skills!.Single(s => s.Id == "foraging").Experience);
    }

    [Fact]
    public void SkillLevelChangesActualDurationAndRareMaterialsRemainGated()
    {
        var f = new Fixture();
        f.World.Join("a", "A", "a", "meadow-1"); f.MoveTo("a", 4.5, 2);
        var basic = f.Snapshot("a").Nodes.Single(n => n.Id == "bark-1").Options!;
        Assert.Equal(3, basic.Single(o => o.Id == "bark").DurationSeconds);
        Assert.Equal(8, basic.Single(o => o.Id == "resin").BaseDurationSeconds);
        Assert.False(f.World.StartGather("a", "node", "bark-1", "resin", "locked").Success);
        var checkpoint = f.World.ExportCheckpoint();
        var saved = checkpoint.Players[0] with { SkillExperience = new() { ["logging"] = 450 } };
        var world = new GameWorld(f.Catalog, f.Clock);
        world.RestoreCheckpoint(checkpoint with { Players = [saved] }); world.Join("a", "A", "restored", "meadow-1");
        var options = world.Snapshots().Single().Snapshot.Nodes.Single(n => n.Id == "bark-1").Options!;
        Assert.Equal(10, options.Single(o => o.Id == "resin").SkillLevel);
        Assert.Equal(6.56, options.Single(o => o.Id == "resin").DurationSeconds);
        Assert.True(world.StartGather("restored", "node", "bark-1", "bark", "fast").Success);
        f.Clock.Now += TimeSpan.FromSeconds(2.4); world.Step(TimeSpan.FromMilliseconds(50));
        Assert.Empty(world.Snapshots().Single().Snapshot.Inventory);
        f.Clock.Now += TimeSpan.FromSeconds(.1); world.Step(TimeSpan.FromMilliseconds(50));
        Assert.Equal(3, world.Snapshots().Single().Snapshot.Inventory.Single(i => i.ItemId == "bark").Quantity);
    }

    [Fact]
    public void SaveRestoresSkillAndCooldownButNotActiveGathering()
    {
        var f = new Fixture();
        f.World.Join("a", "A", "a", "meadow-1"); f.MoveTo("a", 4, -2);
        Assert.True(f.Gather("a", "fiber-1", "first").Success);
        var checkpoint = f.World.ExportCheckpoint();
        var restored = new GameWorld(f.Catalog, f.Clock); restored.RestoreCheckpoint(checkpoint);
        restored.Join("a", "A", "new", "meadow-1");
        var snapshot = restored.Snapshots().Single().Snapshot;
        Assert.Equal(2, snapshot.Skills!.Single(s => s.Id == "foraging").Experience);
        Assert.False(snapshot.Nodes.Single(n => n.Id == "fiber-1").Options!.Single(o => o.Id == "fiber").Available);
        f.Advance(10);
        Assert.True(f.World.StartGather("a", "node", "fiber-1", "fiber", "unfinished").Success);
        var active = new GameWorld(f.Catalog, f.Clock); active.RestoreCheckpoint(f.World.ExportCheckpoint());
        active.Join("a", "A", "again", "meadow-1");
        f.Clock.Now += TimeSpan.FromSeconds(20); active.Step(TimeSpan.FromMilliseconds(50));
        Assert.Null(active.Snapshots().Single().Snapshot.Gathering);
        Assert.Equal(3, active.Snapshots().Single().Snapshot.Inventory.Single(i => i.ItemId == "fiber").Quantity);
    }

    private sealed class Fixture
    {
        public ManualClock Clock { get; } = new();
        public ContentCatalog Catalog { get; } = new(Path.Combine(AppContext.BaseDirectory, "Content", "Design"), .05);
        public GameWorld World { get; }
        private readonly Dictionary<string, long> sequences = [];
        public Fixture() { World = new(Catalog, Clock); }
        public WorldSnapshot Snapshot(string connection) => World.Snapshots().Single(x => x.ConnectionId == connection).Snapshot;
        public int Count(string connection, string item) => Snapshot(connection).Inventory.FirstOrDefault(x => x.ItemId == item)?.Quantity ?? 0;
        public ActionResult Gather(string connection, string node, string request)
        {
            var option = node.StartsWith("fiber") ? "fiber" : node.StartsWith("bark") ? "bark" : node.StartsWith("log") ? "log" : "stone";
            var result = World.StartGather(connection, "node", node, option, request);
            if (result.Success) Advance(5.1);
            return result;
        }
        public void Advance(double seconds)
        {
            for (var elapsed = 0d; elapsed < seconds - .000001; elapsed += .05)
            { Clock.Now += TimeSpan.FromSeconds(.05); World.Step(TimeSpan.FromSeconds(.05)); }
        }
        public void MoveTo(string connection, double x, double z)
        {
            for (var i = 0; i < 250; i++)
            {
                var snapshot = Snapshot(connection); var p = snapshot.Players.Single(y => y.Id == snapshot.SelfPlayerId);
                var dx = x - p.X; var dz = z - p.Z;
                if (Math.Sqrt(dx * dx + dz * dz) < .2) { World.Move(connection, new(0, 0, Next(connection))); return; }
                World.Move(connection, new(dx / Math.Max(.21, Math.Sqrt(dx * dx + dz * dz)), dz / Math.Max(.21, Math.Sqrt(dx * dx + dz * dz)), Next(connection)));
                Advance(.05);
            }
            Assert.Fail("Could not reach test position.");
        }
        private long Next(string connection) { sequences[connection] = sequences.GetValueOrDefault(connection) + 1; return sequences[connection]; }
    }
    private sealed class ManualClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 11, 15, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
