namespace Velona.Server;

public sealed partial class GameWorld
{
    private static readonly (string Id, string Kind, double X, double Z)[] CampStations =
    [
        ("bench-1", "bench", -2.8, -2), ("prep-1", "prep", -2.8, 0),
        ("tan-1", "tan", 2.4, -2), ("dry-1", "dry", 3.6, 1.8),
        ("leatherwork-1", "leatherwork", .3, -3.8)
    ];
    private const double StationRange = 2.4;
    private Workstation[]? stationCache;

    private Workstation[] StationSnapshot() => stationCache ??= BuildStationSnapshot();

    private Workstation[] BuildStationSnapshot()
    {
        var recipes = catalog.Snapshot().Recipes;
        return CampStations.Select(s => new Workstation(s.Id, s.Kind,
            recipes.First(r => r.StationId == s.Kind).StationName, s.X, s.Z, StationRange,
            recipes.Where(r => r.StationId == s.Kind).Select(r => r.Id).ToArray())).ToArray();
    }

    public ActionResult InspectStation(string connectionId, string stationId, string requestId) =>
        Execute(connectionId, requestId, "station-inspect:" + stationId, p =>
        {
            var station = StationSnapshot().FirstOrDefault(s => s.Id == stationId);
            if (station is null) return ActionResult.Fail("사용할 제작대가 없습니다.");
            if (Distance(p.X, p.Z, station.X, station.Z) > station.InteractionRadius)
                return ActionResult.Fail($"{station.Name} 가까이 이동해 주세요.");
            return ActionResult.Ok($"{station.Name}의 제작법을 살펴봅니다.");
        });

    public ActionResult CraftAtStation(string connectionId, string stationId, string recipeId, string requestId) =>
        Execute(connectionId, requestId, $"craft-at:{stationId}:{recipeId}", p => StartProduction(p, recipeId, stationId));

    private ActionResult StartProduction(Explorer p, string recipeId, string? stationId)
    {
        if (!catalog.TryRecipe(recipeId, out var recipe)) return ActionResult.Fail("이 시제품에서 지원하지 않는 제작법입니다.");
        if (recipe.StationId == "hand")
        {
            if (stationId is not null && stationId != "hand") return ActionResult.Fail("손 제작은 제작대 선택 없이 이용해 주세요.");
        }
        else
        {
            var station = StationSnapshot().FirstOrDefault(s => s.Kind == recipe.StationId && (stationId is null || s.Id == stationId));
            if (station is null) return ActionResult.Fail("해당 제작대에서 만들 수 없는 아이템입니다.");
            if (Distance(p.X, p.Z, station.X, station.Z) > station.InteractionRadius)
                return ActionResult.Fail($"{station.Name} 가까이 이동해 주세요.");
        }
        if (p.Job is { Completed: false }) return ActionResult.Fail("진행 중인 제작 작업이 있습니다.");
        if (recipe.Inputs.Any(i => p.Inventory.GetValueOrDefault(i.ItemId) < i.Quantity)) return ActionResult.Fail("필요한 재료가 부족합니다.");
        if (!CanFit(p, recipe.Inputs, recipe.Outputs)) return ActionResult.Fail("완성품을 보관할 가방 공간이 부족합니다.");
        foreach (var input in recipe.Inputs)
        {
            p.Inventory[input.ItemId] -= input.Quantity;
            if (p.Inventory[input.ItemId] == 0) p.Inventory.Remove(input.ItemId);
        }
        var now = clock.GetUtcNow();
        p.Job = new(Guid.NewGuid().ToString("N"), recipe, now, now.AddSeconds(recipe.DurationSeconds));
        return ActionResult.Ok($"{recipe.Name} 작업을 시작했습니다.");
    }
}
