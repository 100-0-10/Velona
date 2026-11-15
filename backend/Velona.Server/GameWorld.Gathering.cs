namespace Velona.Server;

public sealed partial class GameWorld
{
    public const int GatherQueueCapacity = 20;

    // Older clients keep the same idempotent action identity when moving to enqueue.
    public ActionResult StartGather(string connectionId, string sourceKind, string sourceId, string optionId, string requestId) =>
        EnqueueGather(connectionId, sourceKind, sourceId, optionId, requestId);

    public ActionResult EnqueueGather(string connectionId, string sourceKind, string sourceId, string optionId, string requestId) =>
        Execute(connectionId, requestId, $"gather-start:{sourceKind}:{sourceId}:{optionId}", p =>
        {
            var now = clock.GetUtcNow();
            var error = FindGatherSource(p, sourceKind, sourceId, optionId, now, out var definition, out var node);
            if (error is not null) return ActionResult.Fail(error);
            var option = BuildOption(p, definition!, now, node);
            if (!option.CanQueue) return ActionResult.Fail(option.QueueUnavailableReason ?? "지금은 예약할 수 없습니다.");
            var task = new GatherTask(Guid.NewGuid().ToString("N"), sourceKind, sourceId, definition!, boar.Generation);
            if (node is not null)
            {
                var stock = Stock(node, definition!.Id);
                stock.Reserved[p.Id] = stock.Reserved.GetValueOrDefault(p.Id) + 1;
            }
            p.GatherQueue.Add(task);
            p.InputX = p.InputZ = 0;
            if (p.Gathering is not { State: "running" }) StartNextGathering(p, now);
            return ActionResult.Ok($"{catalog.Name(definition!.ItemId)} 1개를 예약했습니다.");
        });

    public ActionResult CancelQueuedGather(string connectionId, string jobId, string requestId) => Execute(connectionId, requestId, "gather-remove:" + jobId, p =>
    {
        var task = p.GatherQueue.FirstOrDefault(g => g.Id == jobId);
        if (task is null) return ActionResult.Fail("취소할 대기 작업이 없습니다.");
        ReleaseGatherReservation(p, task);
        p.GatherQueue.Remove(task);
        return ActionResult.Ok("대기 작업 1개를 취소했습니다.");
    });

    public ActionResult CancelGather(string connectionId, string requestId) => Execute(connectionId, requestId, "gather-cancel", p =>
    {
        if (p.Gathering is not { State: "running" } && p.GatherQueue.Count == 0) return ActionResult.Fail("진행 중인 채집이 없습니다.");
        CancelGathering(p, "작업과 예약을 모두 취소했습니다.");
        return ActionResult.Ok("작업과 예약을 모두 취소했습니다. 완료한 재료는 보존됩니다.");
    });

    private string? FindGatherSource(Explorer p, string kind, string sourceId, string optionId, DateTimeOffset now, out GatherDefinition? definition, out Node? node)
    {
        definition = null; node = null;
        if (kind == "node")
        {
            node = nodes.FirstOrDefault(n => n.Id == sourceId);
            if (node is null || Distance(p.X, p.Z, node.X, node.Z) > 2.8) return "채집 대상 가까이 이동해 주세요.";
            definition = NodeDefinitions(node).FirstOrDefault(d => d.Id == optionId);
        }
        else if (kind == "corpse")
        {
            if (sourceId != "boar-1" || boar.State != "dead" || boar.RespawnAt <= now || !boar.Participants.Contains(p.Id)) return "해체할 수 있는 사체가 없습니다.";
            if (Distance(p.X, p.Z, boar.X, boar.Z) > 3.5) return "사체 가까이 이동해 주세요.";
            definition = catalog.Gathering.Profiles["boar"].FirstOrDefault(d => d.Id == optionId);
        }
        else return "올바른 채집 대상을 선택해 주세요.";
        return definition is null ? "목록에 없는 재료입니다." : null;
    }

    private GatherDefinition[] NodeDefinitions(Node node) => catalog.Gathering.Profiles[
        node.ItemId == "fiber" ? "plant" : node.ItemId == "stone" ? "rock" : "tree"];

    private GatherStock Stock(Node node, string id)
    {
        var definition = NodeDefinitions(node).Single(d => d.Id == id);
        if (!node.Stocks.TryGetValue(id, out var stock))
            node.Stocks.Add(id, stock = new() { AvailableAt = node.RespawnAt, Remaining = node.RespawnAt > clock.GetUtcNow() ? 0 : definition.Quantity });
        if (stock.Remaining == 0 && stock.Reserved.Count == 0 && stock.AvailableAt <= clock.GetUtcNow())
            stock.Remaining = definition.Quantity;
        return stock;
    }

    private int CorpseRemaining(string playerId, GatherDefinition d)
    {
        var key = playerId + "|" + d.Id;
        // Old checkpoints used these markers for a fully harvested bundle.
        if (boar.Harvested.Contains(playerId) || boar.Harvested.Contains(key)) return 0;
        return Math.Max(0, d.Quantity - boar.HarvestCounts.GetValueOrDefault(key));
    }
    private bool CorpseTaken(string playerId, string optionId) => CorpseRemaining(playerId, catalog.Gathering.Profiles["boar"].Single(d => d.Id == optionId)) == 0;
    private static IEnumerable<GatherTask> ReservedTasks(Explorer p) => p.Gathering is { State: "running" } active ? p.GatherQueue.Prepend(active) : p.GatherQueue;
    private static int ReservedCount(Explorer p, string sourceKind, string sourceId, string optionId) => ReservedTasks(p).Count(g => g.SourceKind == sourceKind && g.SourceId == sourceId && g.Definition.Id == optionId);

    private GatherOption BuildOption(Explorer p, GatherDefinition d, DateTimeOffset now, Node? node)
    {
        var experience = p.SkillExperience.GetValueOrDefault(d.SkillId);
        var level = catalog.Gathering.Level(experience);
        var duration = catalog.Gathering.Duration(d, experience);
        var kind = node is null ? "corpse" : "node"; var id = node?.Id ?? "boar-1";
        var reserved = ReservedCount(p, kind, id, d.Id);
        var running = p.Gathering is { State: "running" } g ? g : null;
        var first = running ?? p.GatherQueue.FirstOrDefault();
        string? reason = level < d.RequiredLevel ? $"{catalog.Gathering.Skills[d.SkillId]} Lv.{d.RequiredLevel} 필요" : null;
        DateTimeOffset? availableAt = null;
        int remaining;
        if (node is not null)
        {
            var stock = Stock(node, d.Id);
            remaining = Math.Max(0, stock.Remaining - stock.Reserved.Values.Sum());
            if (stock.Remaining == 0) { availableAt = stock.AvailableAt; reason ??= "재료가 다시 생길 때까지 기다려 주세요."; }
            else if (remaining == 0) reason ??= "남은 재료가 모두 예약됐습니다.";
        }
        else
        {
            remaining = Math.Max(0, CorpseRemaining(p.Id, d) - reserved);
            if (boar.State != "dead" || !boar.Participants.Contains(p.Id)) reason ??= "해체 권리가 없습니다.";
            else if (remaining == 0) reason ??= reserved > 0 ? "남은 부위를 모두 예약했습니다." : "이미 획득한 부위입니다.";
            var outstanding = running is null ? 0 : Math.Max(0, (running.CompletesAt - now).TotalSeconds);
            outstanding += p.GatherQueue.Sum(q => catalog.Gathering.Duration(q.Definition, p.SkillExperience.GetValueOrDefault(q.Definition.SkillId)));
            if (now.AddSeconds(outstanding + duration) >= boar.RespawnAt) reason ??= "사체가 사라지기 전에 끝낼 시간이 부족합니다.";
        }
        if (first is not null && (first.SourceKind != kind || first.SourceId != id)) reason ??= "현재 대상의 예약을 마치거나 취소해 주세요.";
        if (p.GatherQueue.Count + (running is null ? 0 : 1) >= GatherQueueCapacity) reason ??= "예약은 진행 중 작업을 포함해 20개까지 가능합니다.";
        if (!CanFit(p, [], [new(d.ItemId, catalog.Name(d.ItemId), 1)])) reason ??= "획득할 재료를 보관할 공간이 부족합니다.";
        return new(d.Id, d.ItemId, catalog.Name(d.ItemId), d.Quantity, d.Rarity, d.SkillId,
            catalog.Gathering.Skills[d.SkillId], d.RequiredLevel, level, d.BaseSeconds, duration, d.Experience, reason is null, reason, availableAt,
            remaining, reserved, reason is null, reason);
    }

    private ResourceNode NodeSnapshot(Node n, Explorer p, DateTimeOffset now)
    {
        var options = NodeDefinitions(n).Select(d => BuildOption(p, d, now, n)).ToArray();
        var name = n.ItemId == "fiber" ? "풀숲" : n.ItemId == "stone" ? "바위" : "숲의 나무";
        var earliest = options.Where(o => o.AvailableAtUtc.HasValue).Select(o => o.AvailableAtUtc).OrderBy(d => d).FirstOrDefault();
        // World geometry reflects physical stock, not this caller's permission,
        // bag space, or reservations that have not produced an item yet.
        var stocked = NodeDefinitions(n).Any(d => Stock(n, d.Id).Remaining > 0);
        return new(n.Id, n.ItemId, name, n.X, n.Z, stocked, earliest, options);
    }
    private GatherOption[] CorpseOptions(Explorer p, DateTimeOffset now) => boar.State == "dead"
        ? catalog.Gathering.Profiles["boar"].Select(d => BuildOption(p, d, now, null)).ToArray() : [];
    private SkillProgress[] SkillSnapshot(Explorer p) => catalog.Gathering.Skills.Select(s =>
    {
        var experience = p.SkillExperience.GetValueOrDefault(s.Key); var level = catalog.Gathering.Level(experience);
        return new SkillProgress(s.Key, s.Value, level, experience, level >= catalog.Gathering.MaxLevel ? null : catalog.Gathering.Threshold(level + 1), Math.Round(catalog.Gathering.Reduction(experience) * 100, 2));
    }).ToArray();
    private GatheringJob? GatheringSnapshot(Explorer p) => p.Gathering is not { } g ? null : new(
        g.Id, g.SourceKind, g.SourceId, g.Definition.Id, g.Definition.ItemId, catalog.Name(g.Definition.ItemId),
        1, g.Definition.SkillId, g.Definition.BaseSeconds, g.StartedAt, g.CompletesAt, g.State, g.Message);
    private GatheringQueueEntry[] GatheringQueueSnapshot(Explorer p) => p.GatherQueue.Select(g => new GatheringQueueEntry(
        g.Id, g.SourceKind, g.SourceId, g.Definition.Id, g.Definition.ItemId, catalog.Name(g.Definition.ItemId), 1, g.Definition.SkillId,
        catalog.Gathering.Duration(g.Definition, p.SkillExperience.GetValueOrDefault(g.Definition.SkillId)), "waiting")).ToArray();

    private void ReleaseGatherReservation(Explorer p, GatherTask task)
    {
        if (task.SourceKind != "node") return;
        var n = nodes.FirstOrDefault(n => n.Id == task.SourceId); if (n is null) return;
        var stock = Stock(n, task.Definition.Id);
        var count = stock.Reserved.GetValueOrDefault(p.Id);
        if (count <= 1) stock.Reserved.Remove(p.Id); else stock.Reserved[p.Id] = count - 1;
    }
    private void CancelGathering(Explorer p, string message)
    {
        if (p.Gathering is { State: "running" } g)
        {
            ReleaseGatherReservation(p, g); g.State = "cancelled"; g.Message = message;
        }
        else if (p.Gathering is { State: "completed" } completed && p.GatherQueue.Count > 0)
            completed.Message += " · " + message;
        foreach (var queued in p.GatherQueue) ReleaseGatherReservation(p, queued);
        p.GatherQueue.Clear();
    }

    private void StartNextGathering(Explorer p, DateTimeOffset now)
    {
        if (p.GatherQueue.Count == 0) return;
        var next = p.GatherQueue[0];
        var error = FindGatherSource(p, next.SourceKind, next.SourceId, next.Definition.Id, now, out _, out _);
        var duration = catalog.Gathering.Duration(next.Definition, p.SkillExperience.GetValueOrDefault(next.Definition.SkillId));
        if (error is null && next.SourceKind == "corpse" && (next.Generation != boar.Generation || now.AddSeconds(duration) >= boar.RespawnAt)) error = "사체가 사라지기 전에 작업을 마칠 수 없습니다.";
        if (error is not null || !CanFit(p, [], []))
        {
            CancelGathering(p, error ?? "가방 공간이 부족해 예약이 중단됐습니다."); return;
        }
        p.GatherQueue.RemoveAt(0); next.State = "running"; next.StartedAt = now; next.CompletesAt = now.AddSeconds(duration); p.Gathering = next;
    }

    private void AdvanceGathering(Explorer p, DateTimeOffset now)
    {
        if (p.Gathering is not { State: "running" } g) return;
        if (p.ConnectionId is null || p.Hp <= 0) { CancelGathering(p, "접속 종료 또는 쓰러짐으로 작업과 예약이 중단됐습니다."); return; }
        Node? node = null;
        if (g.SourceKind == "node")
        {
            node = nodes.FirstOrDefault(n => n.Id == g.SourceId);
            if (node is null || Distance(p.X, p.Z, node.X, node.Z) > 2.8 || Stock(node, g.Definition.Id).Reserved.GetValueOrDefault(p.Id) <= 0)
            { CancelGathering(p, "대상에서 멀어져 작업과 예약이 중단됐습니다."); return; }
        }
        else if (boar.State != "dead" || boar.Generation != g.Generation || boar.RespawnAt <= now
            || Distance(p.X, p.Z, boar.X, boar.Z) > 3.5 || !boar.Participants.Contains(p.Id) || CorpseTaken(p.Id, g.Definition.Id))
        { CancelGathering(p, "사체가 사라지거나 대상에서 멀어져 작업과 예약이 중단됐습니다."); return; }
        if (now < g.CompletesAt) return;
        if (!CanFit(p, [], [])) { CancelGathering(p, "가방 공간이 부족해 작업과 예약이 중단됐습니다."); return; }
        Add(p, g.Definition.ItemId, 1);
        p.SkillExperience[g.Definition.SkillId] = Math.Min(catalog.Gathering.Threshold(catalog.Gathering.MaxLevel), p.SkillExperience.GetValueOrDefault(g.Definition.SkillId) + g.Definition.Experience);
        if (node is not null)
        {
            ReleaseGatherReservation(p, g); var stock = Stock(node, g.Definition.Id); stock.Remaining--;
            if (stock.Remaining == 0) stock.AvailableAt = now.AddSeconds(8);
        }
        else
        {
            var key = p.Id + "|" + g.Definition.Id; boar.HarvestCounts[key] = boar.HarvestCounts.GetValueOrDefault(key) + 1;
            if (CorpseRemaining(p.Id, g.Definition) == 0) boar.Harvested.Add(key);
        }
        g.State = "completed"; g.Message = $"{catalog.Name(g.Definition.ItemId)} 1개 획득 · {catalog.Gathering.Skills[g.Definition.SkillId]} +{g.Definition.Experience} XP";
        StartNextGathering(p, now);
    }

    private sealed class GatherStock
    {
        public DateTimeOffset AvailableAt;
        // Remaining includes reserved units; only successful work consumes stock.
        public int Remaining;
        public Dictionary<string, int> Reserved { get; } = [];
    }
    private sealed class GatherTask(string id, string sourceKind, string sourceId, GatherDefinition definition, int generation)
    {
        public string Id { get; } = id;
        public string SourceKind { get; } = sourceKind;
        public string SourceId { get; } = sourceId;
        public GatherDefinition Definition { get; } = definition;
        public int Generation { get; } = generation;
        public DateTimeOffset StartedAt, CompletesAt;
        public string State = "waiting";
        public string? Message;
    }
}
