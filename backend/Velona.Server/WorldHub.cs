using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Velona.Server;

[Authorize]
public sealed class WorldHub(GameWorld world) : Hub
{
    public WorldSnapshot JoinChannel(string channelId)
    {
        var user = Context.User ?? throw new HubException("인증이 필요합니다.");
        try { return world.Join(user.FindFirstValue(ClaimTypes.NameIdentifier)!, user.Identity!.Name!, Context.ConnectionId, channelId); }
        catch (InvalidOperationException e) { throw new HubException(e.Message); }
    }
    public void Move(MoveInput? input) { if (input is not null) world.Move(Context.ConnectionId, input); }
    public ActionResult Interact(string nodeId, string requestId) => world.Interact(Context.ConnectionId, nodeId, requestId);
    public ActionResult Attack(string monsterId, string requestId) => world.Attack(Context.ConnectionId, monsterId, requestId);
    public ActionResult Harvest(string monsterId, string focus, string requestId) => world.Harvest(Context.ConnectionId, monsterId, focus, requestId);
    public ActionResult Craft(string recipeId, string requestId) => world.Craft(Context.ConnectionId, recipeId, requestId);
    public ActionResult Respawn() => world.Respawn(Context.ConnectionId);
    public async Task<ActionResult> Chat(string message)
    {
        var (result, chat) = world.Chat(Context.ConnectionId, message);
        if (chat is not null) await Clients.Clients(world.ActiveConnectionIds()).SendAsync("ChatMessage", chat);
        return result;
    }
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        world.Disconnect(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}
