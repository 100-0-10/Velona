using System.Text.Json;

namespace Velona.Server;

public sealed record GatherDefinition(string Id, string ItemId, int Quantity, double BaseSeconds, string SkillId, int RequiredLevel, string Rarity, int Experience);
public sealed class GatheringCatalog
{
    public int MaxLevel { get; }
    public int ExperienceFactor { get; }
    public double ReductionPerLevel { get; }
    public double MaximumReduction { get; }
    public Dictionary<string, string> Skills { get; } = [];
    public Dictionary<string, GatherDefinition[]> Profiles { get; } = [];

    public GatheringCatalog(string directory)
    {
        using var file = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "gathering.json")));
        var root = file.RootElement.GetProperty("records");
        MaxLevel = root.GetProperty("max_level").GetInt32();
        ExperienceFactor = root.GetProperty("experience_factor").GetInt32();
        ReductionPerLevel = root.GetProperty("reduction_per_level").GetDouble();
        MaximumReduction = root.GetProperty("maximum_reduction").GetDouble();
        if (MaxLevel is < 1 or > 100 || ExperienceFactor <= 0 || ReductionPerLevel < 0 || MaximumReduction is < 0 or >= 1)
            throw new InvalidDataException("Invalid gathering progression settings.");
        foreach (var skill in root.GetProperty("skills").EnumerateArray()) Skills.Add(skill.GetProperty("id").GetString()!, skill.GetProperty("name").GetString()!);
        foreach (var profile in root.GetProperty("profiles").EnumerateObject())
        {
            Profiles.Add(profile.Name, profile.Value.EnumerateArray().Select(o => new GatherDefinition(
                o.GetProperty("id").GetString()!, o.GetProperty("item_id").GetString()!, o.GetProperty("quantity").GetInt32(),
                o.GetProperty("base_seconds").GetDouble(), o.GetProperty("skill_id").GetString()!, o.GetProperty("required_level").GetInt32(),
                o.GetProperty("rarity").GetString()!, o.GetProperty("experience").GetInt32())).ToArray());
        }
        foreach (var defs in Profiles.Values)
        {
            if (defs.Select(d => d.Id).Distinct().Count() != defs.Length) throw new InvalidDataException("Duplicate gather option.");
            foreach (var d in defs)
                if (!Skills.ContainsKey(d.SkillId) || d.Quantity is < 1 or > 99 || !double.IsFinite(d.BaseSeconds) || d.BaseSeconds <= 0 || d.Experience <= 0 || d.RequiredLevel < 1 || d.RequiredLevel > MaxLevel)
                    throw new InvalidDataException("Invalid gather option.");
        }
    }
    public int Threshold(int level) => ExperienceFactor * level * (level - 1) / 2;
    public int Level(int experience)
    {
        var level = 1;
        while (level < MaxLevel && experience >= Threshold(level + 1)) level++;
        return level;
    }
    public double Reduction(int experience) => Math.Min(MaximumReduction, ReductionPerLevel * (Level(experience) - 1));
    public double Duration(GatherDefinition definition, int experience) => Math.Round(definition.BaseSeconds * (1 - Reduction(experience)), 3);
}
