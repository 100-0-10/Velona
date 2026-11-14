using System.Text.Json;

namespace Velona.Server;

public sealed class ContentCatalog
{
    public static readonly string[] RuntimeRecipeIds = ["cord_hand", "bark_powder", "trim_hide", "tan", "dry_leather", "bag"];
    private readonly Dictionary<string, string> names;
    private readonly Dictionary<string, RecipeDefinition> recipes;
    public ContentCatalog(string directory, double productionTimeScale)
    {
        if (!double.IsFinite(productionTimeScale) || productionTimeScale is <= 0 or > 10)
            throw new InvalidOperationException("Game:ProductionTimeScale must be finite and between 0 and 10.");
        using var itemDoc = Read(directory, "items.json");
        using var stationDoc = Read(directory, "stations.json");
        using var recipeDoc = Read(directory, "recipes.json");
        names = itemDoc.RootElement.GetProperty("records").EnumerateArray().ToDictionary(x => x.GetProperty("id").GetString()!, x => x.GetProperty("name").GetString()!);
        var stationNames = stationDoc.RootElement.GetProperty("records").EnumerateArray().ToDictionary(x => x.GetProperty("id").GetString()!, x => x.GetProperty("name").GetString()!);
        recipes = [];
        foreach (var r in recipeDoc.RootElement.GetProperty("records").EnumerateArray())
        {
            var id = r.GetProperty("id").GetString()!;
            if (!RuntimeRecipeIds.Contains(id)) continue;
            var outputs = Stacks(r.GetProperty("outputs"));
            recipes.Add(id, new(id, outputs[0].Name, stationNames[r.GetProperty("station_id").GetString()!], Stacks(r.GetProperty("inputs")), outputs,
                Math.Max(0.1, r.GetProperty("duration_seconds").GetDouble() * productionTimeScale)));
        }
        if (recipes.Count != RuntimeRecipeIds.Length) throw new InvalidDataException("Initial runtime recipe subset is incomplete.");
    }
    public string Name(string id) => names.GetValueOrDefault(id, id);
    public bool TryRecipe(string id, out RecipeDefinition recipe)
    {
        recipe = null!;
        return !string.IsNullOrWhiteSpace(id) && recipes.TryGetValue(id, out recipe!);
    }
    public CatalogResponse Snapshot() => new(names.Select(x => new ItemDefinition(x.Key, x.Value)).ToArray(), RuntimeRecipeIds.Select(x => recipes[x]).ToArray());
    private InventoryStack[] Stacks(JsonElement element) => element.EnumerateObject().Select(p => new InventoryStack(p.Name, Name(p.Name), p.Value.GetInt32())).ToArray();
    private static JsonDocument Read(string path, string file) => JsonDocument.Parse(File.ReadAllText(Path.Combine(path, file)));
}
