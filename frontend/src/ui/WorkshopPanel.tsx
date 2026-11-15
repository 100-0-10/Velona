import type { InventoryStack, PlayerState, ProductionJob, RecipeDefinition, Workstation } from '../types';
import { distance, jobProgress, quantity } from '../game/helpers';
import { GatheringItemArt } from './GatheringPanel';
import './workshop.css';

function StationArt({ kind }: { kind: string }) {
  return <svg viewBox="0 0 100 80" fill="none" aria-hidden="true" className="station-art">
    {kind === 'hand' ? <><path d="M28 59 21 35Q20 28 26 30L38 44V17Q39 10 43 17L46 35 50 13Q54 8 57 15L56 36 64 22Q70 18 70 25L63 47 72 40Q80 38 79 45L68 64Q51 78 28 59Z" fill="#b99970" stroke="#e1ca9c" strokeWidth="2"/><path d="m38 46 16 12 9-9" stroke="#79543a" strokeWidth="3"/></> : kind === 'tan' ? <><ellipse cx="50" cy="25" rx="30" ry="11" fill="#435444"/><path d="M20 25v34q30 23 60 0V25q-30 17-60 0Z" fill="#8b6844"/><path d="M20 36q30 17 60 0M20 53q30 17 60 0" stroke="#cfb77e" strokeWidth="4"/><path d="m68 7-19 41" stroke="#c8b187" strokeWidth="5"/><ellipse cx="50" cy="25" rx="30" ry="11" stroke="#c4a578" strokeWidth="3"/></> : kind === 'dry' ? <><path d="M21 72V12M79 72V12M15 16h70M21 66h58" stroke="#a28154" strokeWidth="5"/><path d="m36 25 14 3 15-3 6 11-9 5 2 18-14-4-13 5 2-19-9-5Z" fill="#c5a271" stroke="#e2c797" strokeWidth="2"/><path d="m35 28-13-4m43 4 12-4M37 54l-14 7m42-6 12 6" stroke="#dac99f" strokeWidth="2"/></> : <><path d="m15 35 38-17 33 17-38 18Z" fill="#ac8b5e"/><path d="M15 35v9l33 18 38-18v-9L48 53Z" fill="#785a3c"/><path d="M23 48v23m56-24v23M44 60v13" stroke="#b09a70" strokeWidth="6"/>{kind === 'leatherwork' ? <><path d="m36 32 15-7 17 9-14 9Z" fill="#b4774b"/><path d="m48 29 9 9m-6-11 8 10" stroke="#edd6aa" strokeWidth="2"/><path d="m66 11-9 24" stroke="#e2decb" strokeWidth="2"/></> : kind === 'prep' ? <><path d="m29 31 15-8 22 11-14 10-14-7Z" fill="#d3b78a"/><path d="m61 22 12 9-5 3-12-9Z" fill="#bcc7bf"/></> : <><ellipse cx="50" cy="31" rx="12" ry="5" fill="#73796d"/><path d="M38 31v8q12 9 24 0v-8" fill="#929b87"/><path d="m58 13-9 20" stroke="#d4c39e" strokeWidth="5"/></>}</>}
  </svg>;
}

export function WorkshopPanel({ stations, selectedId, recipes, inventory, self, connected, running, now, onSelect, onBack, onClose, onCraft }: {
  stations: Workstation[]; selectedId: string | null; recipes: RecipeDefinition[]; inventory: InventoryStack[];
  self?: PlayerState; connected: boolean; running?: ProductionJob; now: number;
  onSelect: (id: string) => void; onBack: () => void; onClose: () => void; onCraft: (recipe: RecipeDefinition) => void;
}) {
  const station = stations.find(s => s.id === selectedId), hand = selectedId === 'hand';
  const nearby = hand || !!station && !!self && distance(self, station) <= station.interactionRadius;
  const list = selectedId ? recipes.filter(r => r.stationId === (hand ? 'hand' : station?.kind)) : [];
  const title = selectedId ? hand ? '손 제작' : station?.name ?? '제작대' : '야영지의 제작대';
  return <section className="workshop-panel" role="dialog" aria-label="제작대 이용" data-testid="workshop-panel">
    <header className="workshop-heading"><div><small>재료에 새로운 쓰임을</small><h2>{title}</h2></div><div>{selectedId && <button className="workshop-back" data-testid="workshop-back" onClick={onBack}>제작대 목록</button>}<button className="icon-button" aria-label="제작 메뉴 닫기" onClick={onClose}>×</button></div></header>
    {running && <div className="workshop-active-production" data-testid="production-job"><div><strong>{running.name} 가공 중</strong><span>{Math.max(0, Math.ceil((Date.parse(running.completesAtUtc) - now) / 1000))}초</span></div><progress max={1} value={jobProgress(running.startedAtUtc, running.completesAtUtc, now)}/><small>목록을 닫거나 자리를 떠나도 계속 진행돼요.</small></div>}
    {!selectedId ? <><p className="workshop-intro">제작대를 골라 제작법을 살펴보세요. 작업은 해당 제작대 가까이에서 시작할 수 있어요.</p><div className="station-cards">
      <button className="station-card" data-testid="station-open-hand" onClick={() => onSelect('hand')}><StationArt kind="hand"/><strong>손 제작</strong><small>섬유를 꼬아 끈 만들기</small><span className="station-reach ready">어디서나 이용</span></button>
      {stations.map(s => { const reach = !!self && distance(self, s) <= s.interactionRadius; return <button className="station-card" key={s.id} data-testid={'station-open-' + s.id} onClick={() => onSelect(s.id)}><StationArt kind={s.kind}/><strong>{s.name}</strong><small>{recipes.filter(r => s.recipeIds.includes(r.id)).map(r => r.name).join(' · ')}</small><span className={'station-reach' + (reach ? ' ready' : '')}>{reach ? '가까움 · 이용 가능' : self ? `${distance(self, s).toFixed(1)}m 거리` : '위치 확인 중'}</span></button>; })}
    </div></> : <><p className={'workshop-intro' + (!nearby ? ' away' : '')}>{hand ? '별도 설비 없이 손으로 만들어요.' : nearby ? '제작대를 이용할 수 있어요. 가공을 시작하면 자리를 떠나도 계속 진행돼요.' : `${station?.name ?? '제작대'} 가까이 이동해 주세요.${station && self ? ` 현재 ${distance(self, station).toFixed(1)}m` : ''}`}</p><div className="workshop-recipes">{list.map(recipe => {
      const enough = recipe.inputs.every(input => quantity(inventory, input.itemId) >= input.quantity);
      return <article className="workshop-recipe" key={recipe.id}><div className="workshop-item"><GatheringItemArt itemId={recipe.outputs[0]?.itemId ?? ''}/><span>완성품 ×{recipe.outputs[0]?.quantity ?? 1}</span></div><div className="workshop-recipe-body"><small>{recipe.stationName} · {Math.max(.1, recipe.durationSeconds).toFixed(1)}초</small><h3>{recipe.name}</h3><div className="workshop-inputs">{recipe.inputs.map(input => <span key={input.itemId} className={quantity(inventory, input.itemId) < input.quantity ? 'missing' : ''}><GatheringItemArt compact itemId={input.itemId}/><span>{input.name}<b>{quantity(inventory, input.itemId)} / {input.quantity}</b></span></span>)}</div><button className="workshop-start" data-testid={'craft-' + recipe.id} onClick={() => onCraft(recipe)} disabled={!connected || !nearby || !enough || !!running || !!self?.isDowned}>{running?.recipeId === recipe.id ? '작업 중' : !nearby ? '제작대에 다가가세요' : !enough ? '재료가 부족해요' : running ? '다른 작업 진행 중' : '제작 시작'}<span>→</span></button></div></article>;
    })}{!list.length && <p className="empty">이 제작대의 제작법을 불러오는 중이에요.</p>}</div></>}
    <footer className="workshop-note">제작대는 야영지에서 함께 이용해요 · 개발 설정: 가공 시간 0.05배</footer>
  </section>;
}
