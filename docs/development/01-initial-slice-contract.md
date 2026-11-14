# Velona initial playable contract

This is a PC-first prototype, not the full planned game. Language in player-facing UI is Korean. Use repository name Velona. Target monorepo folders: frontend, backend, docs; static design JSON goes in docs/design/data. No secrets or production deployment in this change.

## Player promise and loop

Meet another explorer in a small camp, gather bark/fiber, hunt one boar, harvest hide, prepare/tan/dry it, and craft a bag. Dodge readable boar attacks; if downed, respawn at camp with inventory preserved. Initial camp stations are provided so the production chain is playable without implementing all construction.

Map is a fixed 48×48 meadow, player starts near (0,0), camp occupies (-5..5,-5..5), resource grove and boar area extend toward (+8..+18, -4..+12). Server coordinates x/z, no jump/rigid bodies. Server owns movement (4.2m/s,20Hz), attacks, gathering distance, harvest claims, inventory and production. Client interpolates state and sends normalized movement intent. Custom circle/world-boundary collisions suffice; visuals use separate simple proxies. Camera is orthographic quarter view. Geometry is prototype art, not production assets.

## Wire contract

- POST `/api/guest` body `{ name: string }` => `{ playerId: string, sessionToken: string, name: string }`.
- GET `/health` => status/build metadata.
- GET `/api/catalog` => `{ items: { id:string,name:string }[], recipes: RecipeDefinition[] }` (no authentication needed).
- SignalR endpoint `/hubs/world`, Bearer session token using accessTokenFactory. Only this endpoint may accept query access_token. Guest sessions are development-only, not production identity.
- Hub `JoinChannel(channelId: string)` => `WorldSnapshot`; accepts `meadow-1` initially. Snapshot carries selfPlayerId, and also arrives in `WorldSnapshot` event to channel members at10Hz.
- Hub `Move({ x:number,z:number,sequence:number })` => void. x/z are intent axes, not positions. Finite values, normalized magnitude, increasing sequence. Zero movement on release/blur and stale-input timeout.
- Hub `Interact(nodeId:string, requestId:string)` => `ActionResult`.
- Hub `Attack(monsterId:string, requestId:string)` => `ActionResult`.
- Hub `Harvest(monsterId:string, focus:string, requestId:string)` => `ActionResult`; focus enum `food|material|signature`; harvest rights remain per player for one corpse generation; material gives common raw_hide in this slice.
- Hub `Craft(recipeId:string, requestId:string)` => `ActionResult`. Enforce available recipe subset, camp proximity, materials, one active job/player. Queue and result are personal. Request id retries do not spend twice.
- Hub `Respawn()` => ActionResult, only when downed.
- Hub `Chat(message:string)` => ActionResult. bounded length/rate; display plain text only. Server assigns player name/id.
- Hub event `ChatMessage` => `{ playerId,name,message,sentAtUtc }`.
- Hub event `ActionNotice` => `{ success:boolean,message:string }` optional, method replies are canonical for local feedback.
- ActionResult `{ success:boolean, message:string }`.

WorldSnapshot:

    { channelId:string, selfPlayerId:string, serverTimeUtc:string,
      capacity:number, players:PlayerState[], nodes:ResourceNode[],
      monsters:MonsterState[], inventory:InventoryStack[], jobs:ProductionJob[] }

PlayerState: `{ id,name,x,z,hp,maxHp,stamina,maxStamina,isDowned,color }` (color CSS hex string).

ResourceNode: `{ id,itemId,name,x,z,available:boolean,respawnAtUtc:string|null }`.

MonsterState: `{ id,name,x,z,hp,maxHp,state:'idle'|'chasing'|'telegraph'|'recovering'|'dead', targetPlayerId:string|null,telegraphEndsAtUtc:string|null,canHarvest:boolean,telegraphX?:number,telegraphZ?:number }`. canHarvest is personalized per recipient. Initial id `boar-1`. Telegraph center is fixed when the attack starts; the renderer uses telegraphX/Z rather than following a moving player.

InventoryStack: `{ itemId:string,name:string,quantity:number }`.

ProductionJob: `{ id,recipeId,name,startedAtUtc,completesAtUtc,state:'running'|'completed' }`; completed jobs may auto-deliver exactly once in this initial slice. Document difference from planned manual collection.

RecipeDefinition: `{ id,name,stationName,inputs:InventoryStack[],outputs:InventoryStack[],durationSeconds:number }`.

## Initial runtime content

Use existing JSON IDs: resource fiber,bark,log,stone; inventory meat,bone,raw_hide etc. Hunting corpse base hide plus material focus must provide enough hides within2~3 hunts. Starter spear and knife are implicit equipped tutorial gear for now.

Craft subset from design recipes: `cord_hand`,`bark_powder`,`trim_hide`,`tan`,`dry_leather`,`bag`. Resolve outputs and ingredients from docs/design/data/recipes.json and names from items.json. Water is supplied by camp for this slice; remaining environmental/fuel systems are not implemented. Base durations use data, with an explicitly labeled development production time scale configurable default 0.05 (240s =>12s). Data design remains unchanged. Bag is id `small_bag`; show actual quantity/capacity benefit (+4 once, no multiple-bag stacking). Inventory base slots16; new distinct stacks cannot exceed capacity (account for consumed inputs before checking outputs). Job output space reserved at start or overflow-safe delivery required.

## Verification and boundaries

Meaningful tests: two different identities see each other's authoritative movement; forged/out-of-range/malformed actions fail; same action request id cannot duplicate reward; two eligible players each harvest once; production survives reconnect while process lives; craft spends correct quantities and delivers once; second browser can join; reconnect doesn't create ghost players. New tabs may use different local identity (sessionStorage) for testing. Handle strict React mount/unmount cleanup and hidden-tab input release.

PostgreSQL is now the default persistence. Guest tokens are stored as hashes; sessions last30days. Inventory, jobs, request replay history and corpse claims are atomically checkpointed once/second and restored at startup. Crash may lose the last~1second. Production identity/item ledgers are not implemented. Isolated E2E may explicitly disable persistence; CI and the restart proof use PostgreSQL. Not a 30-player validated service;30 is admission cap only until load test. No PvP/market/guild/asset-generation/full crafting implementation in initial delivery. Mobile layout smoke check, PC controls and optional basic touch controls; no mobile performance claim.
