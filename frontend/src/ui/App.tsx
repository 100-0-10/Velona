import { useEffect, useRef, useState, type FormEvent } from 'react';
import { WorldScene } from '../game/WorldScene';
import { GatheringPanel, GatheringProgress } from './GatheringPanel';
import { WorkshopPanel } from './WorkshopPanel';
import { distance, isEditing, jobProgress, movementAxes, nearbyTarget, nearestMonster, objective, quantity, selfPlayer } from '../game/helpers';
import { WorldClient } from '../network/WorldClient';
import type { Catalog, ChatMessage, ConnectionStatus, GatherOption, GuestSession, RecipeDefinition, WorldSnapshot } from '../types';

declare global { interface Window { readonly __VELONA_TEST_STATE__?: unknown; readonly __THREE_GAME_DIAGNOSTICS__?: unknown } }
const SESSION_KEY = 'velona-guest';
function restoredSession(): GuestSession | null {
  try { const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null'); return s && typeof s.playerId === 'string' && typeof s.sessionToken === 'string' && typeof s.name === 'string' ? s : null; } catch { return null; }
}
const statusNames: Record<ConnectionStatus, string> = { connecting: '야영지에 합류 중', connected: '연결됨', reconnecting: '다시 연결 중', disconnected: '연결 끊김' };
const icons: Record<string, string> = { fiber: '❧', bark: '▤', log: '▰', stone: '⬡', raw_hide: '◇', trim_hide: '◇', wet_leather: '◈', leather: '◈', cord: '⌁', bark_powder: '⁙', small_bag: '▣', meat: '◆', bone: '⌕', fat: '●' };

export function App() {
  const container = useRef<HTMLDivElement>(null); const scene = useRef<WorldScene | null>(null); const client = useRef<WorldClient | null>(null);
  const keys = useRef(new Set<string>()); const snapshotRef = useRef<WorldSnapshot | null>(null);
  const [session, setSession] = useState<GuestSession | null>(restoredSession);
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null); const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [catalog, setCatalog] = useState<Catalog | null>(null); const [name, setName] = useState(''); const [joining, setJoining] = useState(false);
  const [notice, setNotice] = useState(''); const [fatal, setFatal] = useState(''); const [panel, setPanel] = useState<'craft' | 'bag' | null>(null);
  const [workshopStation, setWorkshopStation] = useState<string | null>(null);
  const [gatherSource, setGatherSource] = useState<{kind: 'node' | 'corpse'; id: string} | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]); const [chat, setChat] = useState(''); const [now, setNow] = useState(Date.now());
  const lastGatherNotice = useRef('');
  const [retry, setRetry] = useState(0);
  const [storageLabel, setStorageLabel] = useState('개발 서버');
  const sessionRef = useRef(session); sessionRef.current = session; const statusRef = useRef(status); statusRef.current = status;
  const actRef = useRef<(method: string, ...args: unknown[]) => Promise<void>>(async () => {});
  const interactRef = useRef<() => void>(() => {}); const attackRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!container.current) return;
    try { scene.current = new WorldScene(container.current); } catch { setFatal('3D 화면을 시작할 수 없어요. WebGL 2를 지원하는 브라우저에서 다시 열어 주세요.'); }
    return () => { scene.current?.dispose(); scene.current = null; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/catalog', { signal: controller.signal }).then(async r => { if (!r.ok) throw new Error(); return r.json() as Promise<Catalog>; }).then(setCatalog).catch(() => { if (!controller.signal.aborted) setNotice('제작 목록을 불러오지 못했어요. 서버 연결 후 다시 접속해 주세요.'); });
    fetch('/health', { signal: controller.signal }).then(r => r.json()).then(h => setStorageLabel(h.persistence === 'postgresql' ? 'PostgreSQL 저장' : '격리 테스트 · 재시작 시 초기화')).catch(() => {});
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!session) return;
    const world = new WorldClient(session, {
      snapshot: s => { snapshotRef.current = s; setSnapshot(s); scene.current?.setSnapshot(s); },
      status: setStatus, notice: setNotice,
      chat: m => setMessages(old => [...old.slice(-39), m]),
    });
    client.current = world;
    // Deferring prevents StrictMode's rehearsal mount from opening a ghost connection.
    const start = window.setTimeout(() => void world.start(), 0);
    return () => { clearTimeout(start); world.stop(); keys.current.clear(); client.current = null; snapshotRef.current = null; setSnapshot(null); };
  }, [session, retry]);

  useEffect(() => {
    const clear = () => { keys.current.clear(); client.current?.move(0, 0); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditing(event.target)) return;
      const key = event.key.toLowerCase();
      if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) event.preventDefault();
      if (key === 'escape') { setGatherSource(null); setPanel(null); clear(); return; }
      if (key === 'e' && !event.repeat) interactRef.current();
      if (key === ' ' && !event.repeat) attackRef.current();
      if (key === 'i' && !event.repeat) { setGatherSource(null); setPanel(p => p === 'bag' ? null : 'bag'); }
      if (key === 'c' && !event.repeat) { setGatherSource(null); setWorkshopStation(null); setPanel(p => p === 'craft' ? null : 'craft'); }
      keys.current.add(key);
    };
    const onKeyUp = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const onFocus = (event: FocusEvent) => { if (isEditing(event.target)) clear(); };
    const onVisibility = () => { if (document.hidden) clear(); };
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', clear); window.addEventListener('focusin', onFocus); document.addEventListener('visibilitychange', onVisibility);
    const inputTimer = window.setInterval(() => { const p = selfPlayer(snapshotRef.current); const v = p?.isDowned || document.hidden || isEditing(document.activeElement) ? { x: 0, z: 0 } : movementAxes(keys.current); client.current?.move(v.x, v.z); }, 50);
    return () => { clear(); clearInterval(inputTimer); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', clear); window.removeEventListener('focusin', onFocus); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 5500); return () => clearTimeout(t); }, [notice]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  useEffect(() => {
    const g = snapshot?.gathering;
    if (g && g.state !== 'running' && lastGatherNotice.current !== g.id + g.state) {
      lastGatherNotice.current = g.id + g.state;
      if (g.message) setNotice(g.message);
    }
  }, [snapshot?.gathering]);
  useEffect(() => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_HOOKS === '1')) return;
    Object.defineProperty(window, '__VELONA_TEST_STATE__', { configurable: true, get: () => ({ snapshot: snapshotRef.current, session: sessionRef.current ? { playerId: sessionRef.current.playerId, name: sessionRef.current.name } : null, status: statusRef.current, diagnostics: scene.current?.getDiagnostics() }) });
    Object.defineProperty(window, '__THREE_GAME_DIAGNOSTICS__', { configurable: true, get: () => scene.current?.getDiagnostics() });
    return () => { Reflect.deleteProperty(window, '__VELONA_TEST_STATE__'); Reflect.deleteProperty(window, '__THREE_GAME_DIAGNOSTICS__'); };
  }, []);

  async function action(method: string, ...args: unknown[]) { const result = await client.current?.action(method, ...args); if (result?.message && !(result.success && ['StartGather', 'EnqueueGather', 'CancelQueuedGather', 'InspectStation'].includes(method))) setNotice(result.message); if (method === 'Attack' && result?.success) scene.current?.playAttack(); }
  actRef.current = action;
  async function interact() {
    const target = nearbyTarget(snapshotRef.current);
    if (!target) { setNotice('채집물이나 사냥한 멧수 가까이 이동해 주세요.'); return; }
    keys.current.clear(); client.current?.move(0, 0);
    if (target.kind === 'station') {
      const result = await client.current?.action('InspectStation', target.value.id, crypto.randomUUID());
      if (!result?.success) { setNotice(result?.message ?? '제작대를 살펴보지 못했어요.'); return; }
      setGatherSource(null); setWorkshopStation(target.value.id); setPanel('craft'); return;
    }
    if (target.kind === 'node') {
      const result = await client.current?.action('Interact', target.value.id, crypto.randomUUID());
      if (!result?.success) { setNotice(result?.message ?? '대상을 조사하지 못했어요.'); return; }
    }
    setPanel(null); setGatherSource({ kind: target.kind, id: target.value.id });
  }
  function startGather(option: GatherOption) {
    if (!gatherSource) return;
    setNotice('');
    keys.current.clear(); client.current?.move(0, 0);
    void action('EnqueueGather', gatherSource.kind, gatherSource.id, option.id, crypto.randomUUID());
  }
  function openWorkshop() { keys.current.clear(); client.current?.move(0, 0); setGatherSource(null); setWorkshopStation(null); setPanel('craft'); }
  function craft(recipe: RecipeDefinition) {
    if (recipe.stationId === 'hand') void action('Craft', recipe.id, crypto.randomUUID());
    else if (workshopStation) void action('CraftAtStation', workshopStation, recipe.id, crypto.randomUUID());
  }
  interactRef.current = interact;
  function attack() { const target = nearestMonster(snapshotRef.current); if (!target) { setNotice('공격할 생물이 없어요. 동쪽 숲을 둘러보세요.'); return; } void action('Attack', target.id, crypto.randomUUID()); }
  attackRef.current = attack;

  async function join(event: FormEvent) {
    event.preventDefault(); if (joining) return; setJoining(true); setNotice('');
    try {
      const response = await fetch('/api/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() || '새 개척자' }) });
      if (!response.ok) throw new Error('guest'); const guest = await response.json() as GuestSession;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(guest)); setSession(guest);
    } catch { setNotice('야영지를 열지 못했어요. 서버가 실행 중인지 확인해 주세요.'); } finally { setJoining(false); }
  }

  const self = selfPlayer(snapshot); const inventory = snapshot?.inventory ?? []; const target = nearbyTarget(snapshot); const task = objective(inventory);
  const monster = nearestMonster(snapshot); const connected = status === 'connected'; const running = snapshot?.jobs.find(j => j.state === 'running');
  const capacity = 16 + (quantity(inventory, 'small_bag') > 0 ? 4 : 0);
  const gathering = snapshot?.gathering?.state === 'running' ? snapshot.gathering : null;
  const gatherQueue = snapshot?.gatheringQueue ?? [];
  const inspected = gatherSource?.kind === 'node' ? snapshot?.nodes.find(n => n.id === gatherSource.id) : snapshot?.monsters.find(m => m.id === gatherSource?.id);
  const gatherNearby = !!self && !!inspected && distance(self, inspected) <= (gatherSource?.kind === 'corpse' ? 3.5 : 2.8);

  return <main className={"game-shell" + (gathering ? " is-gathering" : "")}>
    <div className="world" ref={container} />
    <header className="world-header"><div className="wordmark">VELONA<span>개척자의 기록</span></div><div className="location"><span className="location-mark">⌖</span><div>새벽의 야영지<small>온대 초원 · 첫 번째 생활권</small></div></div><div className="channel"><span className={'connection-dot ' + status} />{session ? statusNames[status] : '작은 모험의 시작'}<b data-testid="player-count">{snapshot?.players.length ?? 0}<i> / {snapshot?.capacity ?? 30}</i></b></div></header>

    {session && <>
      <section className="survival" aria-label="캐릭터 상태"><div className="portrait">⌁</div><div className="survival-body"><strong>{self?.name ?? session.name}<span>개척자 · 돌창</span></strong><div className="meter hp" role="meter" aria-label="체력" aria-valuenow={self?.hp ?? 0} aria-valuemin={0} aria-valuemax={self?.maxHp ?? 120}><span style={{ width: `${(self?.hp ?? 0) / (self?.maxHp ?? 120) * 100}%` }} /><b>{Math.ceil(self?.hp ?? 0)} / {self?.maxHp ?? 120}</b></div><div className="meter stamina" role="meter" aria-label="스태미나" aria-valuenow={self?.stamina ?? 0} aria-valuemin={0} aria-valuemax={self?.maxStamina ?? 100}><span style={{ width: `${(self?.stamina ?? 0) / (self?.maxStamina ?? 100) * 100}%` }} /></div></div></section>
      <section className="objective"><small>개척 목표 <span>{task.step + 1} / 6</span></small><h2>{task.title}</h2><p>{task.detail}</p><div className="objective-steps">{['사냥','손질','무두질','건조','제작','완성'].map((s, i) => <span className={i <= task.step ? 'done' : ''} key={s}>{s}</span>)}</div></section>
      <nav className="tool-tabs" aria-label="생활 메뉴"><button data-testid="open-craft" aria-pressed={panel === 'craft'} onClick={openWorkshop}>⚒ 제작 <kbd>C</kbd></button><button aria-pressed={panel === 'bag'} onClick={() => { setGatherSource(null); setPanel(p => p === 'bag' ? null : 'bag'); }}>▣ 소지품 <kbd>I</kbd></button></nav>
      {panel === 'craft' && <WorkshopPanel stations={snapshot?.stations ?? []} selectedId={workshopStation} recipes={catalog?.recipes ?? []} inventory={inventory} self={self} connected={connected} running={running} now={now} onSelect={setWorkshopStation} onBack={() => setWorkshopStation(null)} onClose={() => setPanel(null)} onCraft={craft} />}
      {panel === 'bag' && <aside className="side-panel"><div className="panel-title"><div><small>개척자의 기록</small><h2>소지품</h2></div><button className="icon-button" aria-label="생활 메뉴 닫기" onClick={() => setPanel(null)}>×</button></div>
        <p className="bag-capacity" data-testid="bag-capacity">사용 중 {inventory.length} / {capacity}칸 {capacity > 16 && <span>가죽 가방 +4</span>}</p><div className="inventory-list">{inventory.length ? inventory.map(i => <div className="inventory-item" key={i.itemId} data-testid={'inventory-' + i.itemId}><span className="item-icon">{icons[i.itemId] ?? '◇'}</span><span>{i.name}</span><b>{i.quantity}</b></div>) : <p className="empty">아직 비어 있어요.<br />숲에서 첫 재료를 모아보세요.</p>}</div><section className="skill-list" data-testid="gathering-skills"><h3>생활 숙련도</h3>{snapshot?.skills?.map(skill => <div key={skill.id}><strong>{skill.name} <b>Lv.{skill.level}</b></strong><span>{skill.nextLevelExperience === null ? '최고 레벨' : `${skill.experience} / ${skill.nextLevelExperience} XP`} · 시간 −{skill.speedReductionPercent}%</span></div>)}</section><p className="prototype-note">돌창과 돌칼은 기본 장비로 제공돼요.</p>
      </aside>}
      {running && panel !== 'craft' && !gatherSource && <section className={'job-progress' + (gathering ? ' has-gather-queue' : '')} data-testid="production-job"><div><span>⚒ {running.name}</span><b>{Math.max(0, Math.ceil((Date.parse(running.completesAtUtc) - now) / 1000))}초</b></div><progress max={1} value={jobProgress(running.startedAtUtc, running.completesAtUtc, now)} /><small>작업하는 동안 채집과 탐험을 계속할 수 있어요</small></section>}
      {monster && self && distance(self, monster) < 12 && <div className={'monster-status ' + (monster.state === 'telegraph' ? 'danger' : '')}><strong>{monster.name}</strong><span>{monster.state === 'telegraph' ? '공격 예고 · 붉은 범위에서 벗어나세요!' : 'Space로 돌창 공격'}</span><progress max={monster.maxHp} value={monster.hp} /></div>}
      <section className="chat-panel" aria-label="지역 채팅"><div className="chat-log" aria-live="polite">{messages.length ? messages.slice(-5).map((m, i) => <p key={m.sentAtUtc + i}><b>{m.name}</b> <span>{m.message}</span></p>) : <p className="chat-welcome">같은 야영지의 개척자들과 인사를 나눠보세요.</p>}</div><form onSubmit={event => { event.preventDefault(); const text = chat.trim(); if (text) { void action('Chat', text); setChat(''); } }}><span>지역</span><input data-testid="chat-input" aria-label="지역 채팅 입력" placeholder="메시지 입력" value={chat} onChange={e => setChat(e.target.value)} maxLength={140} disabled={!connected} /><button data-testid="chat-send" aria-label="채팅 보내기" disabled={!connected || !chat.trim()}>↵</button></form></section>
      <footer className="action-bar"><div className="movement-help"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>이동</span></div><button data-testid="interact" onClick={interact} disabled={!connected || self?.isDowned}><kbd>E</kbd>{target ? target.kind === 'corpse' ? '멧수 도축' : target.value.name + (target.kind === 'station' ? ' 이용' : ' 채집') : '가까운 대상 조사'}</button><button data-testid="attack" onClick={attack} disabled={!connected || self?.isDowned}><kbd>Space</kbd>돌창 공격</button><div className="touch-pad" aria-label="터치 이동">{[['w','↑'],['a','←'],['s','↓'],['d','→']].map(([key, arrow]) => <button key={key} aria-label={'이동 ' + arrow} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); keys.current.add(key); }} onPointerUp={() => keys.current.delete(key)} onPointerCancel={() => keys.current.delete(key)} onLostPointerCapture={() => keys.current.delete(key)}>{arrow}</button>)}</div></footer>
      {gatherSource && inspected && <GatheringPanel name={inspected.name} sourceKind={gatherSource.kind} options={inspected.options ?? []} job={gathering} queue={gatherQueue} queueLimit={snapshot?.gatherQueueLimit ?? 20} nearby={gatherNearby} connected={connected && !self?.isDowned} now={now} onSelect={startGather} onClose={() => setGatherSource(null)} onCancel={() => void action('CancelGather', crypto.randomUUID())} onRemove={id => void action('CancelQueuedGather', id, crypto.randomUUID())} />}
      {gathering && !(gatherSource && inspected) && <GatheringProgress job={gathering} queue={gatherQueue} now={now} onCancel={() => void action('CancelGather', crypto.randomUUID())} onRemove={id => void action('CancelQueuedGather', id, crypto.randomUUID())} />}
      {status === 'disconnected' && <div className="connection-overlay"><h2>야영지 연결이 끊겼어요</h2><p>서버가 다시 시작되었다면 새로 입장해 주세요.</p><button className="primary" onClick={() => setRetry(n => n + 1)}>다시 연결</button><button onClick={() => { sessionStorage.removeItem(SESSION_KEY); setSession(null); setMessages([]); }}>새 개척자로 입장</button></div>}
      {self?.isDowned && <div className="downed-overlay"><small>잠시 숨을 고르세요</small><h2>야영지로 돌아갈 시간</h2><p>모은 재료는 그대로 가지고 돌아가요.</p><button className="primary" data-testid="respawn" onClick={() => void action('Respawn')}>야영지에서 다시 일어나기</button></div>}
    </>}

    {!session && <div className="entry-backdrop"><form className="entry-panel" onSubmit={join}><span className="entry-eyebrow">CHAPTER 01 · A NEW DAWN</span><div className="entry-symbol">⌁</div><h1>야생에,<br /><em>나의 자리를.</em></h1><p>숲에서 얻은 재료가 도구가 되고,<br />작은 야영지가 당신의 집이 됩니다.</p><label htmlFor="guest-name">개척자 이름</label><input id="guest-name" data-testid="guest-name" value={name} onChange={e => setName(e.target.value)} maxLength={16} placeholder="새 개척자" autoComplete="off" /><button className="primary" data-testid="join-world" disabled={joining || !!fatal}>{joining ? '길을 찾는 중…' : '야영지에 들어가기'}<span>→</span></button><small className="entry-warning">초기 개발 체험 · {storageLabel}<br />같은 탭에서 진행을 이어갈 수 있어요.</small></form><div className="entry-caption">새벽의 야영지 <span>MEADOW · 01</span></div></div>}
    {(notice || fatal) && <div className={'toast ' + (fatal ? 'error' : '')} role="status" data-testid="notice">{fatal || notice}</div>}
  </main>;
}
