export interface GuestSession { playerId: string; sessionToken: string; name: string }
export interface PlayerState { id: string; name: string; x: number; z: number; hp: number; maxHp: number; stamina: number; maxStamina: number; isDowned: boolean; color: string; gatheringItemId?: string | null }
export interface ResourceNode { id: string; itemId: string; name: string; x: number; z: number; available: boolean; respawnAtUtc: string | null; options?: GatherOption[] }
export interface MonsterState { id: string; name: string; x: number; z: number; hp: number; maxHp: number; state: 'idle' | 'chasing' | 'telegraph' | 'recovering' | 'dead'; targetPlayerId: string | null; telegraphEndsAtUtc: string | null; canHarvest: boolean; telegraphX?: number; telegraphZ?: number; options?: GatherOption[] }
export interface InventoryStack { itemId: string; name: string; quantity: number }
export interface ProductionJob { id: string; recipeId: string; name: string; startedAtUtc: string; completesAtUtc: string; state: 'running' | 'completed' }
export interface WorldSnapshot { channelId: string; selfPlayerId: string; serverTimeUtc: string; capacity: number; players: PlayerState[]; nodes: ResourceNode[]; monsters: MonsterState[]; inventory: InventoryStack[]; jobs: ProductionJob[]; gathering?: GatheringJob | null; skills?: SkillProgress[]; gatheringQueue?: GatheringQueueEntry[]; gatherQueueLimit?: number; stations?: Workstation[] }
export interface GatherOption { id: string; itemId: string; name: string; quantity: number; rarity: string; skillId: string; skillName: string; requiredLevel: number; skillLevel: number; baseDurationSeconds: number; durationSeconds: number; experience: number; available: boolean; unavailableReason: string | null; availableAtUtc: string | null; remainingQuantity?: number; reservedQuantity?: number; canQueue?: boolean; queueUnavailableReason?: string | null }
export interface GatheringJob { id: string; sourceKind: 'node' | 'corpse'; sourceId: string; optionId: string; itemId: string; name: string; quantity: number; skillId: string; baseDurationSeconds: number; startedAtUtc: string; completesAtUtc: string; state: 'running' | 'completed' | 'cancelled'; message: string | null }
export interface SkillProgress { id: string; name: string; level: number; experience: number; nextLevelExperience: number | null; speedReductionPercent: number }
export interface GatheringQueueEntry { id: string; sourceKind: 'node' | 'corpse'; sourceId: string; optionId: string; itemId: string; name: string; quantity: number; skillId: string; durationSeconds: number; state: 'waiting' }
export interface Workstation { id: string; kind: string; name: string; x: number; z: number; interactionRadius: number; recipeIds: string[] }
export interface RecipeDefinition { id: string; name: string; stationName: string; inputs: InventoryStack[]; outputs: InventoryStack[]; durationSeconds: number; stationId?: string | null }
export interface Catalog { items: { id: string; name: string }[]; recipes: RecipeDefinition[] }
export interface ActionResult { success: boolean; message: string }
export interface ChatMessage { playerId: string; name: string; message: string; sentAtUtc: string }
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
