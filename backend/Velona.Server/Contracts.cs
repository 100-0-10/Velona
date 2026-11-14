namespace Velona.Server;

public sealed record GuestRequest(string Name);
public sealed record GuestResponse(string PlayerId, string SessionToken, string Name);
public sealed record ActionResult(bool Success, string Message)
{
    public static ActionResult Ok(string message) => new(true, message);
    public static ActionResult Fail(string message) => new(false, message);
}
public sealed record MoveInput(double X, double Z, long Sequence);
public sealed record PlayerState(string Id, string Name, double X, double Z, double Hp, double MaxHp, double Stamina, double MaxStamina, bool IsDowned, string Color);
public sealed record ResourceNode(string Id, string ItemId, string Name, double X, double Z, bool Available, DateTimeOffset? RespawnAtUtc);
public sealed record MonsterState(string Id, string Name, double X, double Z, double Hp, double MaxHp, string State, string? TargetPlayerId, DateTimeOffset? TelegraphEndsAtUtc, bool CanHarvest, double TelegraphX, double TelegraphZ);
public sealed record InventoryStack(string ItemId, string Name, int Quantity);
public sealed record ProductionJob(string Id, string RecipeId, string Name, DateTimeOffset StartedAtUtc, DateTimeOffset CompletesAtUtc, string State);
public sealed record RecipeDefinition(string Id, string Name, string StationName, InventoryStack[] Inputs, InventoryStack[] Outputs, double DurationSeconds);
public sealed record ItemDefinition(string Id, string Name);
public sealed record CatalogResponse(ItemDefinition[] Items, RecipeDefinition[] Recipes);
public sealed record WorldSnapshot(string ChannelId, string SelfPlayerId, DateTimeOffset ServerTimeUtc, int Capacity, PlayerState[] Players, ResourceNode[] Nodes, MonsterState[] Monsters, InventoryStack[] Inventory, ProductionJob[] Jobs);
public sealed record ChatMessage(string PlayerId, string Name, string Message, DateTimeOffset SentAtUtc);

public sealed class GameOptions
{
    public double ProductionTimeScale { get; set; } = 1;
}
