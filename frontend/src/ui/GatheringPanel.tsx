import type { GatherOption, GatheringJob } from '../types';
import { jobProgress } from '../game/helpers';

const rarityNames: Record<string, string> = { common: '일반', uncommon: '고급', rare: '희귀' };

export function GatheringPanel({ name, options, active, nearby, connected, now, onSelect, onClose }: {
  name: string; options: GatherOption[]; active: boolean; nearby: boolean; connected: boolean; now: number;
  onSelect: (option: GatherOption) => void; onClose: () => void;
}) {
  return <section className="gather-panel" role="dialog" aria-label="채집 재료 목록" data-testid="gather-panel">
    <div className="panel-title"><div><small>자세히 살펴보기</small><h2>{name}</h2></div><button className="icon-button" aria-label="채집 목록 닫기" onClick={onClose}>×</button></div>
    <p className="gather-help">원하는 재료를 골라 채집하세요.<br />숙련도가 높아지면 작업 시간이 줄어들어요.</p>
    {!nearby && <p className="gather-warning">작업하려면 대상 가까이 이동해 주세요.</p>}
    <div className="gather-options">{options.map(option => {
      const remaining = option.availableAtUtc ? Math.max(0, Math.ceil((Date.parse(option.availableAtUtc) - now) / 1000)) : 0;
      const reduction = option.baseDurationSeconds > option.durationSeconds;
      return <button key={option.id} data-testid={'gather-option-' + option.id} className={'gather-option rarity-' + option.rarity}
        disabled={!connected || !nearby || active || !option.available} onClick={() => onSelect(option)}>
        <span className="gather-option-head"><strong>{option.name}</strong><b>×{option.quantity}</b><i>{rarityNames[option.rarity] ?? option.rarity}</i></span>
        <span className="gather-option-skill">{option.skillName} Lv.{option.skillLevel} <span>완료 시 +{option.experience} XP</span></span>
        <span className="gather-option-time">{reduction && <del>{option.baseDurationSeconds.toFixed(2)}초</del>}<strong>{option.durationSeconds.toFixed(2)}초</strong><span>{reduction ? '숙련 보정 적용' : '기본 작업 시간'}</span></span>
        {!option.available && <span className="gather-unavailable">{option.unavailableReason}{remaining > 0 ? ` (${remaining}초)` : ''}</span>}
      </button>;
    })}</div>
    {!options.length && <p className="empty">현재 채집할 수 있는 재료가 없어요.</p>}
    <p className="prototype-note">선택한 재료는 작업을 마쳐야 획득해요.</p>
  </section>;
}

export function GatheringProgress({ job, now, onCancel }: { job: GatheringJob; now: number; onCancel: () => void }) {
  return <section className="gather-progress" data-testid="gathering-progress" aria-label="채집 진행">
    <div><strong>{job.name} 채집 중 <span>×{job.quantity}</span></strong><b>{Math.max(0, (Date.parse(job.completesAtUtc) - now) / 1000).toFixed(1)}초</b></div>
    <progress max={1} value={jobProgress(job.startedAtUtc, job.completesAtUtc, now)} />
    <footer><small>이동·공격·피격 시 중단</small><button data-testid="cancel-gather" onClick={onCancel}>취소</button></footer>
  </section>;
}
