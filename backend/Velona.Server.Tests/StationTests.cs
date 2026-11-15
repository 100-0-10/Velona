using Velona.Server;

namespace Velona.Server.Tests;

public sealed class StationTests
{
    [Fact]
    public void RemoteAndMismatchedStationsNeverSpendMaterialsOrStartProduction()
    {
        var (world, _) = Seed(0, 0, new() { ["trim_hide"] = 2, ["bark_powder"] = 2 });
        Assert.False(world.InspectStation("a", "tan-1", "far-inspect").Success);
        Assert.False(world.CraftAtStation("a", "tan-1", "tan", "remote").Success);
        Assert.False(world.Craft("a", "tan", "legacy-remote").Success);
        Assert.False(world.CraftAtStation("a", "bench-1", "tan", "wrong-type").Success);
        Assert.False(world.CraftAtStation("a", "fabricated-station", "tan", "forged").Success);
        var snapshot = Snapshot(world);
        Assert.Empty(snapshot.Jobs);
        Assert.Equal(2, snapshot.Inventory.Single(i => i.ItemId == "trim_hide").Quantity);
        Assert.Equal(2, snapshot.Inventory.Single(i => i.ItemId == "bark_powder").Quantity);
    }

    [Fact]
    public void MatchingStationConsumesOnceAndProcessingContinuesAfterLeaving()
    {
        var (world, clock) = Seed(2.4, -2, new() { ["trim_hide"] = 2, ["bark_powder"] = 2 });
        Assert.True(world.InspectStation("a", "tan-1", "inspect").Success);
        var started = world.CraftAtStation("a", "tan-1", "tan", "once");
        Assert.True(started.Success);
        Assert.Equal(started, world.CraftAtStation("a", "tan-1", "tan", "once"));
        Assert.False(world.CraftAtStation("a", "tan-1", "tan", "second").Success);
        Assert.Equal(1, Snapshot(world).Inventory.Single(i => i.ItemId == "trim_hide").Quantity);
        world.Disconnect("a"); clock.Now += TimeSpan.FromSeconds(13); world.Step(TimeSpan.FromMilliseconds(50));
        world.Join("a", "A", "returned", "meadow-1");
        Assert.Equal(1, Snapshot(world).Inventory.Single(i => i.ItemId == "wet_leather").Quantity);
        clock.Now += TimeSpan.FromSeconds(30); world.Step(TimeSpan.FromMilliseconds(50));
        Assert.Equal(1, Snapshot(world).Inventory.Single(i => i.ItemId == "wet_leather").Quantity);
    }

    [Fact]
    public void HandCraftingWorksOutsideCampButCannotMasqueradeAsAStationRecipe()
    {
        var (world, clock) = Seed(-18, -8, new() { ["fiber"] = 2 });
        Assert.False(world.CraftAtStation("a", "bench-1", "cord_hand", "wrong-hand").Success);
        Assert.True(world.CraftAtStation("a", "hand", "cord_hand", "hand").Success);
        Assert.DoesNotContain(Snapshot(world).Inventory, i => i.ItemId == "fiber");
        clock.Now += TimeSpan.FromSeconds(1); world.Step(TimeSpan.FromMilliseconds(50));
        Assert.Equal(1, Snapshot(world).Inventory.Single(i => i.ItemId == "cord").Quantity);
    }

    private static WorldSnapshot Snapshot(GameWorld world) => world.Snapshots().Single().Snapshot;
    private static (GameWorld World, ManualClock Clock) Seed(double x, double z, Dictionary<string, int> inventory)
    {
        var clock = new ManualClock();
        var catalog = new ContentCatalog(Path.Combine(AppContext.BaseDirectory, "Content", "Design"), .05);
        var original = new GameWorld(catalog, clock); original.Join("a", "A", "seed", "meadow-1");
        var checkpoint = original.ExportCheckpoint();
        var saved = checkpoint.Players[0] with { X = x, Z = z, Inventory = inventory };
        var world = new GameWorld(catalog, clock); world.RestoreCheckpoint(checkpoint with { Players = [saved] });
        world.Join("a", "A", "a", "meadow-1"); return (world, clock);
    }
    private sealed class ManualClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 11, 15, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
