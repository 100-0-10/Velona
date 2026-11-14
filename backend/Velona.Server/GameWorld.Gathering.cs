namespace Velona.Server;

public sealed partial class GameWorld
{
    public ActionResult StartGather(string connectionId, string sourceKind, string sourceId, string optionId, string requestId) =>
        Execute(connectionId, requestId, $"gather-start:{sourceKind}:{sourceId}:{optionId}", p =>
        {
            if (p.Gathering is { State: "running" }) return ActionResult.Fail("이미 채집 중입니다. 작업을 마치거나 취소해 주세요.");
            var now = clock.GetUtcNow();
            GatherDefinition? definition;
            Node? node = null;
            if (sourceKind == "node")
            {
                node = nodes.FirstOrDefault(n => n.Id == sourceId);
                if (node is null || Distance(p.X, p.Z, node.X, node.Z) > 2.8) return ActionResult.Fail("채집 대상 가까이 이동해 주세요.");
                definition = NodeDefinitions(node).FirstOrDefault(d => d.Id == optionId);
            }
            else if (sourceKind == "corpse")
            {
                if (sourceId != "boar-1" || boar.State != "dead" || boar.RespawnAt <= now || !boar.Participants.Contains(p.Id))
                    return ActionResult.Fail("해체할 수 있는 사체가 없습니다.");
                if (Distance(p.X, p.Z, boar.X, boar.Z) > 3.5) return ActionResult.Fail("사체 가까이 이동해 주세요.");
                definition = catalog.Gathering.Profiles["boar"].FirstOrDefault(d => d.Id == optionId);
            }
            else return ActionResult.Fail("올바른 채집 대상을 선택해 주세요.");
            if (definition is null) return ActionResult.Fail("목록에 없는 재료입니다.");
            var option = BuildOption(p, definition, now, node);
            if (!option.Available) return ActionResult.Fail(option.UnavailableReason ?? "지금은 채집할 수 없습니다.");
            if (!CanFit(p, [], [new(definition.ItemId, catalog.Name(definition.ItemId), definition.Quantity)]))
                return ActionResult.Fail("획득할 재료를 보관할 공간이 부족합니다.");
            if (node is not null) Stock(node, definition.Id).ReservedBy = p.Id;
            p.InputX = p.InputZ = 0;
            p.Gathering = new(Guid.NewGuid().ToString("N"), sourceKind, sourceId, definition, now, now.AddSeconds(option.DurationSeconds), boar.Generation);
            return ActionResult.Ok($"{catalog.Name(definition.ItemId)} 채집을 시작했습니다.");
        });

    public ActionResult CancelGather(string connectionId, string requestId) => Execute(connectionId, requestId, "gather-cancel", p =>
    {
        if (p.Gathering is not { State: "running" }) return ActionResult.Fail("진행 중인 채집이 없습니다.");
        CancelGathering(p, "채집을 취소했습니다.");
        return ActionResult.Ok("채집을 취소했습니다. 재료는 소모되지 않았습니다.");
    });

    private GatherDefinition[] NodeDefinitions(Node node) => catalog.Gathering.Profiles[
        node.ItemId == "fiber" ? "plant" : node.ItemId == "stone" ? "rock" : "tree"];

    private static GatherStock Stock(Node node, string id)
    {
        if (!node.Stocks.TryGetValue(id, out var stock)) node.Stocks.Add(id, stock = new() { AvailableAt = node.RespawnAt });
        return stock;
    }

    private bool CorpseTaken(string playerId, string optionId) =>
        boar.Harvested.Contains(playerId) || boar.Harvested.Contains(playerId + "|" + optionId);

    private GatherOption BuildOption(Explorer p, GatherDefinition d, DateTimeOffset now, Node? node)
    {
        var experience = p.SkillExperience.GetValueOrDefault(d.SkillId);
        var level = catalog.Gathering.Level(experience);
        var duration = catalog.Gathering.Duration(d, experience);
        string? reason = level < d.RequiredLevel ? $"{catalog.Gathering.Skills[d.SkillId]} Lv.{d.RequiredLevel} 필요" : null;
        DateTimeOffset? availableAt = null;
        if (node is not null)
        {
            var stock = Stock(node, d.Id);
            if (stock.ReservedBy is not null) reason ??= "다른 작업이 진행 중입니다.";
            if (stock.AvailableAt > now) { availableAt = stock.AvailableAt; reason ??= "다시 채집할 수 있을 때까지 기다려 주세요."; }
        }
        else
        {
            if (boar.State != "dead" || !boar.Participants.Contains(p.Id)) reason ??= "해체 권리가 없습니다.";
            if (CorpseTaken(p.Id, d.Id)) reason ??= "이미 획득한 부위입니다.";
            if (boar.RespawnAt < now.AddSeconds(duration)) reason ??= "사체가 사라지기 전에 끝낼 시간이 부족합니다.";
        }
        return new(d.Id, d.ItemId, catalog.Name(d.ItemId), d.Quantity, d.Rarity, d.SkillId,
            catalog.Gathering.Skills[d.SkillId], d.RequiredLevel, level, d.BaseSeconds, duration, d.Experience, reason is null, reason, availableAt);
    }

    private ResourceNode NodeSnapshot(Node n, Explorer p, DateTimeOffset now)
    {
        var options = NodeDefinitions(n).Select(d => BuildOption(p, d, now, n)).ToArray();
        var name = n.ItemId == "fiber" ? "풀숲" : n.ItemId == "stone" ? "바위" : "숲의 나무";
        var earliest = options.Where(o => o.AvailableAtUtc.HasValue).Select(o => o.AvailableAtUtc).OrderBy(d => d).FirstOrDefault();
        return new(n.Id, n.ItemId, name, n.X, n.Z, options.Any(o => o.Available), earliest, options);
    }

    private GatherOption[] CorpseOptions(Explorer p, DateTimeOffset now) => boar.State == "dead"
        ? catalog.Gathering.Profiles["boar"].Select(d => BuildOption(p, d, now, null)).ToArray() : [];

    private SkillProgress[] SkillSnapshot(Explorer p) => catalog.Gathering.Skills.Select(s =>
    {
        var experience = p.SkillExperience.GetValueOrDefault(s.Key);
        var level = catalog.Gathering.Level(experience);
        return new SkillProgress(s.Key, s.Value, level, experience,
            level >= catalog.Gathering.MaxLevel ? null : catalog.Gathering.Threshold(level + 1),
            Math.Round(catalog.Gathering.Reduction(experience) * 100, 2));
    }).ToArray();

    private GatheringJob? GatheringSnapshot(Explorer p) => p.Gathering is not { } g ? null : new(
        g.Id, g.SourceKind, g.SourceId, g.Definition.Id, g.Definition.ItemId, catalog.Name(g.Definition.ItemId),
        g.Definition.Quantity, g.Definition.SkillId, g.Definition.BaseSeconds, g.StartedAt, g.CompletesAt, g.State, g.Message);

    private void CancelGathering(Explorer p, string message)
    {
        if (p.Gathering is not { State: "running" } g) return;
        if (g.SourceKind == "node")
        {
            var n = nodes.FirstOrDefault(n => n.Id == g.SourceId);
            if (n is not null && Stock(n, g.Definition.Id).ReservedBy == p.Id) Stock(n, g.Definition.Id).ReservedBy = null;
        }
        g.State = "cancelled";
        g.Message = message;
    }

    private void AdvanceGathering(Explorer p, DateTimeOffset now)
    {
        if (p.Gathering is not { State: "running" } g) return;
        if (p.ConnectionId is null || p.Hp <= 0) { CancelGathering(p, "접속 종료 또는 쓰러짐으로 채집이 중단됐습니다."); return; }
        Node? node = null;
        if (g.SourceKind == "node")
        {
            node = nodes.FirstOrDefault(n => n.Id == g.SourceId);
            if (node is null || Distance(p.X, p.Z, node.X, node.Z) > 2.8 || Stock(node, g.Definition.Id).ReservedBy != p.Id)
            { CancelGathering(p, "대상에서 멀어져 채집이 중단됐습니다."); return; }
        }
        else if (boar.State != "dead" || boar.Generation != g.Generation || boar.RespawnAt <= now
            || Distance(p.X, p.Z, boar.X, boar.Z) > 3.5 || !boar.Participants.Contains(p.Id) || CorpseTaken(p.Id, g.Definition.Id))
        { CancelGathering(p, "사체가 사라지거나 대상에서 멀어져 해체가 중단됐습니다."); return; }
        if (now < g.CompletesAt) return;
        if (!CanFit(p, [], [])) { CancelGathering(p, "가방 공간이 부족해 채집이 중단됐습니다."); return; }
        Add(p, g.Definition.ItemId, g.Definition.Quantity);
        p.SkillExperience[g.Definition.SkillId] = Math.Min(catalog.Gathering.Threshold(catalog.Gathering.MaxLevel),
            p.SkillExperience.GetValueOrDefault(g.Definition.SkillId) + g.Definition.Experience);
        if (node is not null)
        {
            var stock = Stock(node, g.Definition.Id);
            stock.ReservedBy = null; stock.AvailableAt = now.AddSeconds(8);
        }
        else boar.Harvested.Add(p.Id + "|" + g.Definition.Id);
        g.State = "completed";
        g.Message = $"{catalog.Name(g.Definition.ItemId)} {g.Definition.Quantity}개 획득 · {catalog.Gathering.Skills[g.Definition.SkillId]} +{g.Definition.Experience} XP";
    }

    private sealed class GatherStock
    {
        public DateTimeOffset AvailableAt;
        public string? ReservedBy;
    }

    private sealed class GatherTask(string id, string sourceKind, string sourceId, GatherDefinition definition,
        DateTimeOffset startedAt, DateTimeOffset completesAt, int generation)
    {
        public string Id { get; } = id;
        public string SourceKind { get; } = sourceKind;
        public string SourceId { get; } = sourceId;
        public GatherDefinition Definition { get; } = definition;
        public DateTimeOffset StartedAt { get; } = startedAt;
        public DateTimeOffset CompletesAt { get; } = completesAt;
        public int Generation { get; } = generation;
        public string State = "running";
        public string? Message;
    }
}
