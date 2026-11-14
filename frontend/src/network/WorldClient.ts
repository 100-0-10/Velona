import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection } from '@microsoft/signalr';
import type { ActionResult, ChatMessage, ConnectionStatus, GuestSession, WorldSnapshot } from '../types';
export interface WorldHandlers { snapshot: (snapshot: WorldSnapshot) => void; status: (status: ConnectionStatus) => void; notice: (message: string) => void; chat: (message: ChatMessage) => void }
export class WorldClient {
  private connection: HubConnection; private sequence = 0; private disposed = false; private moving = false;
  constructor(session: GuestSession, private handlers: WorldHandlers) {
    this.connection = new HubConnectionBuilder().withUrl('/hubs/world', { accessTokenFactory: () => session.sessionToken }).withAutomaticReconnect([0, 1000, 3000, 5000]).configureLogging(LogLevel.Warning).build();
    this.connection.on('WorldSnapshot', s => { if (!this.disposed) this.handlers.snapshot(s); });
    this.connection.on('ChatMessage', m => { if (!this.disposed) this.handlers.chat(m); });
    this.connection.onreconnecting(() => { this.moving = false; if (!this.disposed) this.handlers.status('reconnecting'); });
    this.connection.onreconnected(async () => { if (this.disposed) return; this.sequence = 0; try { await this.join(); } catch { this.handlers.status('disconnected'); this.handlers.notice('야영지에 다시 합류하지 못했어요. 다시 접속해 주세요.'); } });
    this.connection.onclose(() => { if (!this.disposed) this.handlers.status('disconnected'); });
  }
  async start() {
    this.handlers.status('connecting');
    try { await this.connection.start(); if (this.disposed) { await this.connection.stop(); return; } await this.join(); }
    catch { if (!this.disposed) { this.handlers.status('disconnected'); this.handlers.notice('서버에 연결하지 못했어요. 서버 실행 상태를 확인하고 다시 접속해 주세요.'); } }
  }
  private async join() { const s = await this.connection.invoke<WorldSnapshot>('JoinChannel', 'meadow-1'); if (!this.disposed) { this.handlers.snapshot(s); this.handlers.status('connected'); } }
  move(x: number, z: number) {
    if (this.disposed || this.connection.state !== HubConnectionState.Connected) return;
    if (x === 0 && z === 0 && !this.moving) return; this.moving = x !== 0 || z !== 0;
    void this.connection.invoke('Move', { x, z, sequence: ++this.sequence }).catch(() => {});
  }
  async action(method: string, ...args: unknown[]): Promise<ActionResult> {
    if (this.disposed || this.connection.state !== HubConnectionState.Connected) return { success: false, message: '서버 연결을 기다려 주세요.' };
    try { return await this.connection.invoke<ActionResult>(method, ...args); } catch { return { success: false, message: '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' }; }
  }
  stop() { this.disposed = true; this.moving = false; void this.connection.stop().catch(() => {}); }
}
