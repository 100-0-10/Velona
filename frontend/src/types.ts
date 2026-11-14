export interface GuestSession { playerId: string; sessionToken: string; name: string }
export interface PlayerState { id: string; name: string; x: number; z: number; hp: number; maxHp: number; stamina: number; maxStamina: number; isDowned: boolean; color: string }
export interface ResourceNode { id: string; itemId: string; name: string; x: number; z: number; available: boolean; respawnAtUtc: string | null }
export interface MonsterState { id: string; name: string; x: number; z: number; hp: number; maxHp: number; state: 'idle' | 'chasing' | 'telegraph' | 'recovering' | 'dead'; targetPlayerId: string | null; telegraphEndsAtUtc: string | null; canHarvest: boolean; telegraphX?: number; telegraphZ?: number }
export interface InventoryStack { itemId: string; name: string; quantity: number }
export interface ProductionJob { id: string; recipeId: string; name: string; startedAtUtc: string; completesAtUtc: string; state: 'running' | 'completed' }
export interface WorldSnapshot { channelId: string; selfPlayerId: string; serverTimeUtc: string; capacity: number; players: PlayerState[]; nodes: ResourceNode[]; monsters: MonsterState[]; inventory: InventoryStack[]; jobs: ProductionJob[] }
export interface RecipeDefinition { id: string; name: string; stationName: string; inputs: InventoryStack[]; outputs: InventoryStack[]; durationSeconds: number }
export interface Catalog { items: { id: string; name: string }[]; recipes: RecipeDefinition[] }
export interface ActionResult { success: boolean; message: string }
export interface ChatMessage { playerId: string; name: string; message: string; sentAtUtc: string }
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
