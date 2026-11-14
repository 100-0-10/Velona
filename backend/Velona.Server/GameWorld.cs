using System.Security.Cryptography;
using System.Text;

namespace Velona.Server;

/// <summary>A single-owner world behind a short lock. Hub calls enqueue intent/state changes;
/// the fixed loop advances simulation. Never wait for network or disk under this lock.</summary>
public sealed class GameWorld(ContentCatalog catalog, TimeProvider clock)
{
    public const int Capacity = 30;
    public const string ChannelId = "meadow-1";
    private readonly object gate = new();
    private readonly Dictionary<string, Explorer> players = [];
    private readonly Dictionary<string, string> connections = [];
    private readonly Node[] nodes = [new("fiber-1", "fiber", 6, -2), new("fiber-2", "fiber", 10, -3), new("bark-1", "bark", 7, 2), new("bark-2", "bark", 10, 2), new("log-1", "log", -6, 1), new("stone-1", "stone", -6, -3)];
    private readonly Boar boar = new();

    public WorldSnapshot Join(string playerId, string name, string connectionId, string channelId)
    {
        lock (gate)
        {
            if (channelId != ChannelId) throw new InvalidOperationException("현재는 새벽 초원 채널만 이용할 수 있습니다.");
            if (!players.TryGetValue(playerId, out var player))
            {
                if (connections.Count >= Capacity) throw new InvalidOperationException("채널이 가득 찼습니다.");
                if (players.Count >= 1000) throw new InvalidOperationException("개발 월드가 가득 찼습니다. 서버를 다시 시작해 주세요.");
                player = new(playerId, name, new[] { "#d7a96b", "#77b7b5", "#bd91bd", "#9fb878", "#d48771" }[players.Count % 5]);
                players.Add(playerId, player);
            }
            else if (player.ConnectionId is null && connections.Count >= Capacity) throw new InvalidOperationException("채널이 가득 찼습니다.");
            if (player.ConnectionId is not null) connections.Remove(player.ConnectionId);
            if (connections.TryGetValue(connectionId, out var previousId) && previousId != playerId) throw new InvalidOperationException("연결에 다른 캐릭터가 있습니다.");
            player.ConnectionId = connectionId;
            player.Sequence = -1;
            player.InputX = player.InputZ = 0;
            player.LastInput = clock.GetUtcNow();
            connections[connectionId] = playerId;
            return Snapshot(player, clock.GetUtcNow());
        }
    }

    public void Disconnect(string connectionId)
    {
        lock (gate)
        {
            if (!connections.Remove(connectionId, out var id)) return;
            var p = players[id];
            if (p.ConnectionId == connectionId) { p.ConnectionId = null; p.InputX = p.InputZ = 0; }
        }
    }

    public void Move(string connectionId, MoveInput input)
    {
        lock (gate)
        {
            if (!TryPlayer(connectionId, out var p) || p.Hp <= 0) return;
            if (!double.IsFinite(input.X) || !double.IsFinite(input.Z) || input.Sequence <= p.Sequence || input.Sequence < 0) return;
            var length = Math.Sqrt(input.X * input.X + input.Z * input.Z);
            if (!double.IsFinite(length)) return;
            p.InputX = length > 1 ? input.X / length : input.X;
            p.InputZ = length > 1 ? input.Z / length : input.Z;
            p.Sequence = input.Sequence;
            p.LastInput = clock.GetUtcNow();
        }
    }

    public ActionResult Interact(string connectionId, string nodeId, string requestId) => Execute(connectionId, requestId, "gather:" + nodeId, p =>
    {
        var now = clock.GetUtcNow();
        var node = nodes.FirstOrDefault(x => x.Id == nodeId);
        if (node is null) return ActionResult.Fail("채집 대상을 찾을 수 없습니다.");
        if (Distance(p.X, p.Z, node.X, node.Z) > 2.8) return ActionResult.Fail("채집 대상 가까이 이동해 주세요.");
        if (node.RespawnAt > now) return ActionResult.Fail("자원이 다시 자라는 중입니다.");
        if (now - p.LastGather < TimeSpan.FromMilliseconds(600)) return ActionResult.Fail("잠시 후 다시 채집해 주세요.");
        var quantity = node.ItemId is "fiber" or "bark" ? 3 : 2;
        if (!CanFit(p, [], [new(node.ItemId, catalog.Name(node.ItemId), quantity)])) return ActionResult.Fail("가방 공간이 부족합니다.");
        Add(p, node.ItemId, quantity);
        p.LastGather = now;
        node.RespawnAt = now.AddSeconds(8);
        return ActionResult.Ok($"{catalog.Name(node.ItemId)} {quantity}개를 얻었습니다.");
    });

    public ActionResult Attack(string connectionId, string monsterId, string requestId) => Execute(connectionId, requestId, "attack:" + monsterId, p =>
    {
        var now = clock.GetUtcNow();
        if (monsterId != "boar-1" || boar.State == "dead") return ActionResult.Fail("공격할 생물이 없습니다.");
        if (Distance(p.X, p.Z, boar.X, boar.Z) > 2.8) return ActionResult.Fail("창이 닿지 않는 거리입니다.");
        if (now - p.LastAttack < TimeSpan.FromSeconds(1.2)) return ActionResult.Fail("다음 공격을 준비 중입니다.");
        if (p.Stamina < 9) return ActionResult.Fail("스태미나가 부족합니다.");
        p.Stamina -= 9;
        p.LastAttack = now;
        boar.Participants.Add(p.Id);
        boar.Hp = Math.Max(0, boar.Hp - 22);
        if (boar.Hp <= 0)
        {
            boar.State = "dead";
            boar.RespawnAt = now.AddSeconds(20);
            boar.TargetId = null;
            boar.TelegraphEnds = null;
            return ActionResult.Ok("돌턱멧수를 처치했습니다. 가까이에서 해체 부위를 골라 주세요.");
        }
        if (boar.State == "idle") { boar.State = "chasing"; boar.TargetId = p.Id; }
        return ActionResult.Ok("창 공격이 적중했습니다.");
    });

    public ActionResult Harvest(string connectionId, string monsterId, string focus, string requestId) => Execute(connectionId, requestId, "harvest:" + monsterId + ":" + focus, p =>
    {
        if (monsterId != "boar-1" || boar.State != "dead") return ActionResult.Fail("해체할 사체가 없습니다.");
        if (!boar.Participants.Contains(p.Id) || boar.Harvested.Contains(p.Id)) return ActionResult.Fail("이미 해체했거나 해체 권리가 없습니다.");
        if (Distance(p.X, p.Z, boar.X, boar.Z) > 3.5) return ActionResult.Fail("사체 가까이 이동해 주세요.");
        if (focus is not ("food" or "material" or "signature")) return ActionResult.Fail("유효한 해체 부위를 골라 주세요.");
        var rewards = new Dictionary<string, int> { ["raw_hide"] = 2, ["meat"] = 1, ["bone"] = 1 };
        if (focus == "material") rewards["raw_hide"] += 2;
        if (focus == "food") rewards["meat"] += 2;
        if (focus == "signature") rewards["raw_stonejaw"] = 1;
        var stacks = rewards.Select(x => new InventoryStack(x.Key, catalog.Name(x.Key), x.Value)).ToArray();
        if (!CanFit(p, [], stacks)) return ActionResult.Fail("가방 공간이 부족합니다. 정리 후 다시 해체할 수 있습니다.");
        foreach (var r in rewards) Add(p, r.Key, r.Value);
        boar.Harvested.Add(p.Id);
        return ActionResult.Ok("해체 재료를 얻었습니다. 야영지에서 가죽을 가공해 보세요.");
    });

    public ActionResult Craft(string connectionId, string recipeId, string requestId) => Execute(connectionId, requestId, "craft:" + recipeId, p =>
    {
        if (!catalog.TryRecipe(recipeId, out var recipe)) return ActionResult.Fail("이 시제품에서 지원하지 않는 제작법입니다.");
        if (Distance(p.X, p.Z, 0, 0) > 7) return ActionResult.Fail("야영지의 제작대 가까이 이동해 주세요.");
        if (p.Job is { Completed: false }) return ActionResult.Fail("진행 중인 작업이 있습니다.");
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
    });

    public ActionResult Respawn(string connectionId)
    {
        lock (gate)
        {
            if (!TryPlayer(connectionId, out var p)) return ActionResult.Fail("채널에 먼저 입장해 주세요.");
            if (p.Hp > 0) return ActionResult.Fail("쓰러진 상태에서만 돌아갈 수 있습니다.");
            p.X = p.Z = p.InputX = p.InputZ = 0;
            p.Hp = 120; p.Stamina = 100;
            return ActionResult.Ok("야영지에서 회복했습니다. 소지품은 보존됩니다.");
        }
    }

    public (ActionResult Result, ChatMessage? Message) Chat(string connectionId, string text)
    {
        lock (gate)
        {
            if (!TryPlayer(connectionId, out var p)) return (ActionResult.Fail("먼저 채널에 입장해 주세요."), null);
            var now = clock.GetUtcNow();
            if (text is null || string.IsNullOrWhiteSpace(text) || text.Length > 200 || text.Any(char.IsControl)) return (ActionResult.Fail("채팅은 1~200자까지 입력할 수 있습니다."), null);
            if (now - p.LastChat < TimeSpan.FromSeconds(1)) return (ActionResult.Fail("채팅을 너무 빠르게 보내고 있습니다."), null);
            p.LastChat = now;
            return (ActionResult.Ok("메시지를 보냈습니다."), new(p.Id, p.Name, text.Trim(), now));
        }
    }

    public void Step(TimeSpan elapsed)
    {
        lock (gate)
        {
            var now = clock.GetUtcNow();
            var dt = Math.Clamp(elapsed.TotalSeconds, 0, 0.1);
            foreach (var p in players.Values)
            {
                if (p.Job is { Completed: false } job && now >= job.CompletesAt)
                {
                    foreach (var output in job.Recipe.Outputs) Add(p, output.ItemId, output.Quantity);
                    job.Completed = true;
                }
                if (p.ConnectionId is null || p.Hp <= 0) continue;
                if (now - p.LastInput > TimeSpan.FromMilliseconds(350)) p.InputX = p.InputZ = 0;
                var x = Math.Clamp(p.X + p.InputX * 4.2 * dt, -22, 22);
                var z = Math.Clamp(p.Z + p.InputZ * 4.2 * dt, -22, 22);
                // Trees and stone props use tiny circular proxies, independent of meshes.
                if (!nodes.Any(n => n.ItemId is "log" or "bark" or "stone" && Distance(x, p.Z, n.X, n.Z) < .85)) p.X = x;
                if (!nodes.Any(n => n.ItemId is "log" or "bark" or "stone" && Distance(p.X, z, n.X, n.Z) < .85)) p.Z = z;
                p.Stamina = Math.Min(100, p.Stamina + 14 * dt);
                if (InCamp(p.X, p.Z) && now - p.LastDamage > TimeSpan.FromSeconds(5)) p.Hp = Math.Min(120, p.Hp + 4 * dt);
            }
            SimulateBoar(now, dt);
        }
    }

    private void SimulateBoar(DateTimeOffset now, double dt)
    {
        if (boar.State == "dead")
        {
            if (now >= boar.RespawnAt) boar.Reset();
            return;
        }
        if (boar.State == "telegraph")
        {
            if (now < boar.TelegraphEnds) return;
            foreach (var p in players.Values.Where(x => x.ConnectionId is not null && x.Hp > 0 && !InCamp(x.X, x.Z) && Distance(x.X, x.Z, boar.TelegraphX, boar.TelegraphZ) <= 2.3))
            {
                p.Hp = Math.Max(0, p.Hp - 18); p.LastDamage = now;
                if (p.Hp <= 0) p.InputX = p.InputZ = 0;
            }
            boar.State = "recovering"; boar.RecoveryEnds = now.AddSeconds(1.5); boar.TelegraphEnds = null;
            return;
        }
        if (boar.State == "recovering")
        {
            if (now < boar.RecoveryEnds) return;
            boar.State = "chasing";
        }
        var target = players.Values.Where(p => p.ConnectionId is not null && p.Hp > 0 && !InCamp(p.X, p.Z) && Distance(p.X, p.Z, 0, 0) > 6 && Distance(p.X, p.Z, 12, 6) < 15)
            .OrderBy(p => Distance(p.X, p.Z, boar.X, boar.Z)).FirstOrDefault();
        if (target is null || Distance(boar.X, boar.Z, 12, 6) > 18)
        {
            boar.TargetId = null; boar.State = "idle";
            MoveBoarToward(12, 6, dt);
            return;
        }
        boar.TargetId = target.Id;
        if (Distance(target.X, target.Z, boar.X, boar.Z) <= 2.3)
        {
            boar.State = "telegraph"; boar.TelegraphEnds = now.AddSeconds(1.3);
            boar.TelegraphX = target.X; boar.TelegraphZ = target.Z;
        }
        else { boar.State = "chasing"; MoveBoarToward(target.X, target.Z, dt); }
    }

    private void MoveBoarToward(double x, double z, double dt)
    {
        var length = Distance(boar.X, boar.Z, x, z);
        if (length < .1) return;
        var move = Math.Min(length, dt * 2.4);
        boar.X += (x - boar.X) / length * move; boar.Z += (z - boar.Z) / length * move;
    }

    public (string ConnectionId, WorldSnapshot Snapshot)[] Snapshots()
    {
        lock (gate)
        {
            var now = clock.GetUtcNow();
            return connections.Select(c => (c.Key, Snapshot(players[c.Value], now))).ToArray();
        }
    }

    public string[] ActiveConnectionIds() { lock (gate) return connections.Keys.ToArray(); }

    public WorldCheckpoint ExportCheckpoint()
    {
        lock (gate)
        {
            return new(1, clock.GetUtcNow(), players.Values.Select(p => new SavedExplorer(
                p.Id, p.Name, p.Color, p.X, p.Z, p.Hp, p.Stamina, new(p.Inventory),
                p.Job is null ? null : new(p.Job.Id, p.Job.Recipe, p.Job.StartedAt, p.Job.CompletesAt, p.Job.Completed),
                p.Requests.Select(r => new SavedRequest(r.Key, r.Value.Fingerprint, r.Value.Result)).ToArray(),
                p.SeenRequests.ToArray(), p.LastAttack, p.LastGather, p.LastDamage)).ToArray(),
                nodes.Select(n => new SavedNode(n.Id, n.RespawnAt)).ToArray(),
                new(boar.X, boar.Z, boar.Hp, boar.State, boar.RespawnAt, boar.Participants.ToArray(), boar.Harvested.ToArray()));
        }
    }

    public void RestoreCheckpoint(WorldCheckpoint checkpoint)
    {
        lock (gate)
        {
            if (checkpoint.SchemaVersion != 1) throw new InvalidDataException("Unsupported Velona save version. Migration is required.");
            if (connections.Count > 0 || players.Count > 0) throw new InvalidOperationException("Restore is only allowed before players join.");
            foreach (var saved in checkpoint.Players)
            {
                if (!double.IsFinite(saved.X) || !double.IsFinite(saved.Z) || !double.IsFinite(saved.Hp) || !double.IsFinite(saved.Stamina)
                    || saved.Inventory.Any(i => i.Value <= 0 || i.Value > 99)) throw new InvalidDataException("Invalid saved explorer.");
                var player = new Explorer(saved.Id, saved.Name, saved.Color)
                {
                    X = Math.Clamp(saved.X, -22, 22), Z = Math.Clamp(saved.Z, -22, 22),
                    Hp = Math.Clamp(saved.Hp, 0, 120), Stamina = Math.Clamp(saved.Stamina, 0, 100),
                    Inventory = new(saved.Inventory), LastAttack = saved.LastAttack,
                    LastGather = saved.LastGather, LastDamage = saved.LastDamage,
                    Job = saved.Job is null ? null : new(saved.Job.Id, saved.Job.Recipe, saved.Job.StartedAtUtc, saved.Job.CompletesAtUtc) { Completed = saved.Job.Completed },
                    SeenRequests = new(saved.SeenRequests)
                };
                foreach (var request in saved.Requests) player.Requests.Add(request.Id, (request.Fingerprint, request.Result));
                players.Add(player.Id, player);
            }
            foreach (var saved in checkpoint.Nodes)
            {
                var node = nodes.FirstOrDefault(n => n.Id == saved.Id);
                if (node is not null) node.RespawnAt = saved.RespawnAtUtc;
            }
            boar.X = checkpoint.Boar.X; boar.Z = checkpoint.Boar.Z; boar.Hp = checkpoint.Boar.Hp;
            boar.State = checkpoint.Boar.State == "dead" ? "dead" : "idle";
            boar.TargetId = null; boar.TelegraphEnds = null; boar.RespawnAt = checkpoint.Boar.RespawnAtUtc;
            boar.Participants.UnionWith(checkpoint.Boar.Participants);
            boar.Harvested.UnionWith(checkpoint.Boar.Harvested);
        }
    }

    private WorldSnapshot Snapshot(Explorer self, DateTimeOffset now) => new(ChannelId, self.Id, now, Capacity,
        players.Values.Where(p => p.ConnectionId is not null).Select(p => new PlayerState(p.Id, p.Name, p.X, p.Z, p.Hp, 120, p.Stamina, 100, p.Hp <= 0, p.Color)).ToArray(),
        nodes.Select(n => new ResourceNode(n.Id, n.ItemId, catalog.Name(n.ItemId), n.X, n.Z, n.RespawnAt <= now, n.RespawnAt > now ? n.RespawnAt : null)).ToArray(),
        [new("boar-1", "돌턱멧수", boar.X, boar.Z, boar.Hp, 120, boar.State, boar.TargetId, boar.TelegraphEnds, boar.State == "dead" && boar.Participants.Contains(self.Id) && !boar.Harvested.Contains(self.Id), boar.TelegraphX, boar.TelegraphZ)],
        self.Inventory.OrderBy(x => x.Key).Select(x => new InventoryStack(x.Key, catalog.Name(x.Key), x.Value)).ToArray(),
        self.Job is null ? [] : [new(self.Job.Id, self.Job.Recipe.Id, self.Job.Recipe.Name, self.Job.StartedAt, self.Job.CompletesAt, self.Job.Completed ? "completed" : "running")]);

    private bool TryPlayer(string connectionId, out Explorer player)
    {
        if (connections.TryGetValue(connectionId, out var id) && players.TryGetValue(id, out player!) && player.ConnectionId == connectionId) return true;
        player = null!; return false;
    }

    private ActionResult Execute(string connectionId, string requestId, string fingerprint, Func<Explorer, ActionResult> action)
    {
        lock (gate)
        {
            if (!TryPlayer(connectionId, out var p)) return ActionResult.Fail("채널에 먼저 입장해 주세요.");
            if (string.IsNullOrWhiteSpace(requestId) || requestId.Length > 80 || requestId.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-')) return ActionResult.Fail("요청 식별자가 올바르지 않습니다.");
            if (p.Requests.TryGetValue(requestId, out var existing)) return existing.Fingerprint == fingerprint ? existing.Result : ActionResult.Fail("이미 다른 행동에 사용한 요청입니다.");
            var requestKey = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes(requestId)).AsSpan(0, 16));
            if (p.SeenRequests.Contains(requestKey)) return ActionResult.Fail("이 요청은 이미 처리되었습니다. 새로운 행동으로 다시 시도해 주세요.");
            if (p.SeenRequests.Count >= 65536) return ActionResult.Fail("개발 세션의 요청 한도입니다. 새 개발 세션으로 접속해 주세요.");
            if (p.Hp <= 0) return ActionResult.Fail("쓰러졌습니다. 야영지로 돌아가 주세요.");
            var result = action(p);
            if (p.Requests.Count >= 128) p.Requests.Remove(p.Requests.Keys.First());
            p.Requests.Add(requestId, (fingerprint, result));
            p.SeenRequests.Add(requestKey);
            return result;
        }
    }

    private static void Add(Explorer p, string itemId, int amount) => p.Inventory[itemId] = p.Inventory.GetValueOrDefault(itemId) + amount;
    private static int InventoryCapacity(Explorer p) => 16 + (p.Inventory.GetValueOrDefault("small_bag") > 0 ? 4 : 0);
    private static bool CanFit(Explorer p, InventoryStack[] consumed, InventoryStack[] outputs)
    {
        var projected = new Dictionary<string, int>(p.Inventory);
        foreach (var input in consumed) projected[input.ItemId] = projected.GetValueOrDefault(input.ItemId) - input.Quantity;
        if (p.Job is { Completed: false }) foreach (var pending in p.Job.Recipe.Outputs) projected[pending.ItemId] = projected.GetValueOrDefault(pending.ItemId) + pending.Quantity;
        foreach (var output in outputs) projected[output.ItemId] = projected.GetValueOrDefault(output.ItemId) + output.Quantity;
        return projected.Values.Count(x => x > 0) <= InventoryCapacity(p) && projected.Values.All(x => x <= 99);
    }
    private static double Distance(double x, double z, double xx, double zz) => Math.Sqrt((x - xx) * (x - xx) + (z - zz) * (z - zz));
    private static bool InCamp(double x, double z) => Math.Abs(x) <= 5 && Math.Abs(z) <= 5;

    private sealed class Explorer(string id, string name, string color)
    {
        public string Id { get; } = id;
        public string Name { get; } = name;
        public string Color { get; } = color;
        public string? ConnectionId;
        public double X, Z, InputX, InputZ;
        public double Hp = 120, Stamina = 100;
        public long Sequence = -1;
        public DateTimeOffset LastInput, LastAttack, LastGather, LastChat, LastDamage;
        public Dictionary<string, int> Inventory { get; init; } = [];
        public Dictionary<string, (string Fingerprint, ActionResult Result)> Requests { get; } = [];
        public HashSet<Guid> SeenRequests { get; init; } = [];
        public Job? Job;
    }
    private sealed class Job(string id, RecipeDefinition recipe, DateTimeOffset start, DateTimeOffset end)
    {
        public string Id { get; } = id;
        public RecipeDefinition Recipe { get; } = recipe;
        public DateTimeOffset StartedAt { get; } = start;
        public DateTimeOffset CompletesAt { get; } = end;
        public bool Completed;
    }
    private sealed class Node(string id, string itemId, double x, double z)
    {
        public string Id { get; } = id;
        public string ItemId { get; } = itemId;
        public double X { get; } = x;
        public double Z { get; } = z;
        public DateTimeOffset RespawnAt;
    }
    private sealed class Boar
    {
        public double X = 12, Z = 6, Hp = 120, TelegraphX, TelegraphZ;
        public string State = "idle";
        public string? TargetId;
        public DateTimeOffset? TelegraphEnds;
        public DateTimeOffset RecoveryEnds, RespawnAt;
        public HashSet<string> Participants { get; } = [];
        public HashSet<string> Harvested { get; } = [];
        public void Reset() { X = 12; Z = 6; Hp = 120; State = "idle"; TargetId = null; TelegraphEnds = null; Participants.Clear(); Harvested.Clear(); }
    }
}
