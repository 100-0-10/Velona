import { useId } from 'react';
import type { GatherOption, GatheringJob, GatheringQueueEntry } from '../types';
import { jobProgress } from '../game/helpers';
import './gathering-cards.css';

const rarityNames: Record<string, string> = { common: '일반', uncommon: '고급', rare: '희귀' };
const operation = (kind: 'node' | 'corpse') => kind === 'corpse' ? '도축' : '채집';
const timeLeft = (job: GatheringJob, now: number) => Math.max(0, (Date.parse(job.completesAtUtc) - now) / 1000);

/** Small authored inventory illustrations share the world's natural material palette. */
export function GatheringItemArt({ itemId, compact = false }: { itemId: string; compact?: boolean }) {
  let art;
  if (itemId === 'small_bag') art = <>
    <path d="M48 39Q49 20 70 20Q91 20 92 39" fill="none" stroke="#6f5138" strokeWidth="8" /><path d="M43 36Q70 27 99 37L106 90Q74 105 36 91Z" fill="#9a6d45" stroke="#64482f" strokeWidth="2" /><path d="M43 36Q71 29 99 37L94 63Q70 73 46 62Z" fill="#b48a59" stroke="#765336" strokeWidth="2" /><path d="M54 63L54 92M85 65L85 94" stroke="#d0ac70" strokeWidth="5" /><path d="M62 59L80 59L80 72L62 72Z" fill="#6e5437" stroke="#cfb572" strokeWidth="3" /><path d="M47 81L94 83M42 88L46 40M98 87L95 42" fill="none" stroke="#674c33" strokeWidth="1.5" strokeDasharray="3 3" />
  </>;
  else if (itemId === 'cord') art = <>
    <path d="M36 75Q28 43 54 32Q82 16 103 40Q120 66 94 87Q66 106 43 89Q24 73 44 54Q63 37 82 46Q104 57 87 76Q72 90 55 78Q43 67 58 58Q72 51 79 62Q85 72 71 74" fill="none" stroke="#866c47" strokeWidth="12" strokeLinecap="round" /><path d="M36 75Q28 43 54 32Q82 16 103 40Q120 66 94 87Q66 106 43 89Q24 73 44 54Q63 37 82 46Q104 57 87 76Q72 90 55 78Q43 67 58 58Q72 51 79 62Q85 72 71 74" fill="none" stroke="#c6b083" strokeWidth="7" strokeLinecap="round" /><path d="M34 74L43 75M43 41L49 48M72 28L72 37M99 42L92 47M102 70L94 66M80 90L79 82M48 87L54 79" stroke="#ead0a0" strokeWidth="2" /><path d="M33 75Q16 85 26 97L50 95" fill="none" stroke="#b59b6d" strokeWidth="6" strokeLinecap="round" />
  </>;
  else if (itemId === 'bark_powder') art = <>
    <path d="M27 74Q70 94 113 74L106 94Q70 109 34 94Z" fill="#796548" stroke="#564a36" strokeWidth="2" /><ellipse cx="70" cy="74" rx="43" ry="12" fill="#b09868" stroke="#d1bb86" strokeWidth="2" /><path d="M38 74L51 56L62 52L69 44L83 54L101 75Q69 86 38 74Z" fill="#a07948" /><path d="M51 56L64 61L69 44L83 54L89 71L71 76Z" fill="#be9861" /><path d="M55 68L58 67M67 55L69 56M77 68L80 67M89 74L91 74M50 75L52 74M67 72L69 71" stroke="#e1bd7d" strokeWidth="2" strokeLinecap="round" />
  </>;
  else if (itemId === 'fiber') art = <>
    <path d="M53 88Q47 50 35 20M61 88Q60 46 53 13M70 88Q74 45 75 18M79 88Q89 53 103 24" fill="none" stroke="#b7b57c" strokeWidth="4" strokeLinecap="round" />
    <path d="M53 75Q30 48 30 30Q46 34 53 59M61 67Q46 34 48 20Q64 29 61 53M74 64Q80 31 91 22Q94 40 74 64M82 76Q101 51 112 46Q109 65 82 76" fill="#7c945e" stroke="#526f48" strokeWidth="1.5" />
    <path d="M49 72L81 68L85 79L52 83Z" fill="#aa8552" /><path d="M51 76L83 73M54 80L84 77" stroke="#dfc390" strokeWidth="2" /><path d="M70 79Q63 96 57 95M71 79Q88 88 89 94" fill="none" stroke="#c3a471" strokeWidth="2" />
  </>;
  else if (itemId === 'bark') art = <>
    <path d="M29 35L70 18L91 33L71 85L33 97L39 71Z" fill="#6e4933" stroke="#442e24" strokeWidth="2" /><path d="M41 40L72 26L84 34L66 77L38 87L45 67Z" fill="#a37c50" /><path d="M46 44L65 36L56 66L44 76M60 40L75 34L63 71M47 86L59 72" fill="none" stroke="#67452e" strokeWidth="3" strokeLinecap="round" />
    <path d="M76 51L105 37L112 50L97 95L70 103L77 78Z" fill="#855b3a" stroke="#4d3528" strokeWidth="2" /><path d="M84 55L105 46L94 88L78 94L85 74Z" fill="#be9660" /><path d="M88 61L101 52L91 83M85 90L89 77" fill="none" stroke="#795237" strokeWidth="3" />
  </>;
  else if (itemId === 'log') art = <>
    <path d="M31 66L83 25L113 42L64 84Z" fill="#735039" stroke="#493629" strokeWidth="2" /><path d="M47 42L75 21L101 31L72 53Z" fill="#97704a" /><path d="M65 59L103 28M44 60L83 30" stroke="#bc9867" strokeWidth="3" />
    <ellipse cx="49" cy="77" rx="24" ry="20" transform="rotate(-27 49 77)" fill="#bc9866" stroke="#593d2c" strokeWidth="4" /><ellipse cx="49" cy="77" rx="15" ry="12" transform="rotate(-27 49 77)" fill="none" stroke="#927047" strokeWidth="2" /><ellipse cx="49" cy="77" rx="7" ry="5" transform="rotate(-27 49 77)" fill="none" stroke="#927047" strokeWidth="2" />
    <ellipse cx="84" cy="54" rx="19" ry="16" transform="rotate(-27 84 54)" fill="#d0ae79" stroke="#68472f" strokeWidth="3" /><ellipse cx="84" cy="54" rx="11" ry="9" fill="none" stroke="#a07b4d" strokeWidth="2" /><path d="M85 54L96 45" stroke="#a07b4d" strokeWidth="2" />
  </>;
  else if (itemId === 'resin') art = <>
    <path d="M45 80L50 44L76 20L94 40L100 80L75 99Z" fill="#b47729" stroke="#815323" strokeWidth="2" /><path d="M50 44L76 20L74 58L45 80Z" fill="#e0b552" /><path d="M74 58L94 40L100 80L75 99Z" fill="#cd9136" /><path d="M50 44L74 58L94 40M74 58L75 99" fill="none" stroke="#f0cd73" strokeWidth="2" /><path d="M62 44L68 31M56 55L54 66" stroke="#f4df9a" strokeWidth="4" strokeLinecap="round" /><path d="M30 88L38 69L48 75L53 96L39 101Z" fill="#d1a54e" stroke="#95682c" strokeWidth="2" />
  </>;
  else if (itemId === 'stone') art = <>
    <path d="M24 79L39 44L64 22L100 32L119 69L102 94L60 103Z" fill="#858d81" stroke="#586457" strokeWidth="2" /><path d="M39 44L64 22L76 54L24 79Z" fill="#adb0a0" /><path d="M76 54L100 32L119 69L102 94Z" fill="#6e7a70" /><path d="M24 79L76 54L102 94L60 103Z" fill="#929b88" /><path d="M47 63L64 58L76 77L94 80M64 58L70 43" fill="none" stroke="#c5c7ae" strokeWidth="3" strokeLinejoin="round" /><path d="M34 83L48 77L59 88L47 92Z" fill="#6e8458" />
  </>;
  else if (itemId === 'meat') art = <>
    <path d="M38 38Q63 17 83 31Q103 38 110 63Q116 89 89 98Q66 107 42 91Q18 77 25 58Z" fill="#b78265" stroke="#714c3d" strokeWidth="3" /><path d="M40 43Q62 25 80 37Q99 42 104 64Q109 84 87 92Q67 99 46 85Q25 73 32 58Z" fill="#a75d4d" /><path d="M46 48Q56 42 58 49M41 71Q51 77 56 72M81 81Q92 79 92 69" fill="none" stroke="#d59a81" strokeWidth="4" strokeLinecap="round" /><path d="M74 46Q88 42 92 55Q91 67 81 71Q68 67 67 57Z" fill="#ead5af" stroke="#cfb18c" strokeWidth="2" /><path d="M79 53Q85 50 86 56Q85 62 80 62Q75 59 79 53" fill="#af8b6b" />
  </>;
  else if (itemId === 'bone') art = <>
    <path d="M39 68Q28 62 24 72Q19 85 33 88Q31 102 43 102Q56 101 54 87L89 55Q98 64 107 53Q114 42 102 37Q108 23 97 20Q84 16 80 32L48 66Q47 53 36 56Q26 59 29 69Z" fill="#d5c9a3" stroke="#a99d7a" strokeWidth="2" strokeLinejoin="round" /><path d="M47 79L90 39M35 80L42 82M95 31L96 41" fill="none" stroke="#f2e7c6" strokeWidth="5" strokeLinecap="round" /><path d="M52 86L91 52" stroke="#b5a583" strokeWidth="2" />
  </>;
  else if (itemId === 'herb') art = <>
    <path d="M66 96Q73 65 72 28M71 69Q57 53 48 42M73 55Q88 45 95 32" fill="none" stroke="#6b8250" strokeWidth="4" strokeLinecap="round" /><path d="M70 72Q39 70 36 49Q61 48 70 72M72 53Q49 44 53 24Q76 28 72 53M75 68Q104 62 109 43Q82 44 75 68M73 35Q76 12 92 15Q96 33 73 35" fill="#85a060" stroke="#5f7f4e" strokeWidth="1.5" /><path d="M61 100Q72 89 85 98" fill="none" stroke="#a68c61" strokeWidth="3" /><circle cx="47" cy="38" r="6" fill="#b7afcc" /><circle cx="101" cy="31" r="6" fill="#c5bfd1" /><circle cx="94" cy="17" r="4" fill="#dac4a0" />
  </>;
  else art = <>
    <path d="M52 23L70 30L88 22L101 40L94 56L107 77L88 82L82 101L65 91L47 99L41 80L24 73L39 54L31 38Z" fill={itemId === 'raw_stonejaw' ? '#657467' : itemId === 'wet_leather' ? '#7f7352' : itemId === 'leather' ? '#c49a63' : '#ac8053'} stroke={itemId === 'raw_stonejaw' ? '#c3ae78' : '#755137'} strokeWidth="2.5" strokeLinejoin="round" /><path d="M52 31Q62 45 50 61Q42 74 51 88M82 32Q92 47 79 62Q71 78 80 89" fill="none" stroke={itemId === 'raw_stonejaw' ? '#8f9c82' : itemId === 'wet_leather' ? '#9e9970' : '#c69c69'} strokeWidth="8" strokeLinecap="round" /><path d="M58 42L74 45L80 65L64 78L53 63Z" fill={itemId === 'raw_stonejaw' ? '#8c927a' : '#b68c5e'} />
    {itemId === 'wet_leather' && <path d="M102 68Q115 83 106 88Q95 87 102 68" fill="#87a4a0" stroke="#bdd0b7" strokeWidth="1" />}
    {itemId === 'leather' && <path d="M49 38L54 41M43 57L47 59M43 74L47 73M53 87L55 83M81 90L80 85M93 74L89 73M92 51L88 53M86 33L84 37" fill="none" stroke="#ead3a2" strokeWidth="2" />}
    {itemId === 'raw_stonejaw' && <path d="M59 44L75 47L80 64L64 76L55 62Z" fill="none" stroke="#d2bd81" strokeWidth="2" />}
  </>;
  return <svg className={'gather-item-art' + (compact ? ' is-compact' : '')} viewBox="0 0 140 112" aria-hidden="true"><ellipse cx="70" cy="97" rx="43" ry="7" fill="#0d221e" opacity=".22" />{art}</svg>;
}

function ActiveWork({ job, queue, now, onCancel }: { job: GatheringJob; queue: GatheringQueueEntry[]; now: number; onCancel: () => void }) {
  return <div className="gather-active-work" data-testid="gathering-progress" aria-label={operation(job.sourceKind) + ' 진행'}>
    <GatheringItemArt itemId={job.itemId} compact />
    <div className="gather-active-body"><div><strong>{job.name} <span>{operation(job.sourceKind)} 중</span></strong><b>{timeLeft(job, now).toFixed(1)}<small>초</small></b></div><progress max={1} value={jobProgress(job.startedAtUtc, job.completesAtUtc, now)} /><small>완료 시 {job.quantity}개 획득{queue.length ? ` · 다음 ${queue.length}개 예약` : ''}</small></div>
    <button type="button" className="gather-clear-button" data-testid="cancel-gather" onClick={onCancel}>전체 취소</button>
  </div>;
}

function QueueStrip({ queue, onRemove }: { queue: GatheringQueueEntry[]; onRemove?: (id: string) => void }) {
  return <ol className="gather-queue-items" aria-label="예약 순서" data-testid="gather-queue">{queue.map((entry, index) => <li key={entry.id} data-testid={'gather-queue-entry-' + entry.id}>
    <span className="gather-queue-order">{index + 1}</span><GatheringItemArt itemId={entry.itemId} compact /><span><strong>{entry.name}</strong><small>{operation(entry.sourceKind)} · {entry.durationSeconds.toFixed(1)}초</small></span>
    {onRemove && <button type="button" data-testid={'remove-gather-' + entry.id} aria-label={`${index + 1}번째 ${entry.name} 예약 취소`} onClick={() => onRemove(entry.id)}>×</button>}
  </li>)}</ol>;
}

export function GatheringPanel({ name, options, sourceKind = 'node', job = null, queue = [], nearby, connected, now, onSelect, onClose, onCancel, onRemove, queueLimit = 20 }: {
  name: string; options: GatherOption[]; sourceKind?: 'node' | 'corpse'; job?: GatheringJob | null; queue?: GatheringQueueEntry[];
  active?: boolean; nearby: boolean; connected: boolean; now: number; queueLimit?: number;
  onSelect: (option: GatherOption) => void; onClose: () => void; onCancel: () => void; onRemove: (id: string) => void;
}) {
  const titleId = useId(); const count = queue.length + (job ? 1 : 0); const verb = operation(sourceKind);
  return <section className="gather-panel gather-card-tray" role="dialog" aria-labelledby={titleId} aria-modal="false" data-testid="gather-panel">
    <header className="gather-tray-header"><div><small>{sourceKind === 'corpse' ? '사냥한 생물 살펴보기' : '자연에서 얻는 재료'}</small><h2 id={titleId}>{name}<span>{verb}</span></h2></div><div className="gather-tray-header-actions"><span className="gather-queue-count" data-testid="gather-queue-count">작업 <b>{count}</b><i> / {queueLimit}</i></span><button type="button" className="gather-close" aria-label="채집 목록 닫기" onClick={onClose}>×</button></div></header>
    <div className="gather-tray-intro"><p>카드를 누를 때마다 <strong>1개씩 예약</strong>해요. 누른 순서대로 작업해요.</p><span>좌우로 넘겨보기 <b aria-hidden="true">↔</b></span></div>
    {!nearby && <p className="gather-tray-warning" role="status">대상 가까이 이동하면 재료를 예약할 수 있어요.</p>}
    <div className="gather-material-cards" aria-label={verb + '할 재료'}>{options.map(option => {
      const seconds = option.availableAtUtc ? Math.max(0, Math.ceil((Date.parse(option.availableAtUtc) - now) / 1000)) : 0;
      const canQueue = option.canQueue ?? option.available;
      const available = option.remainingQuantity ?? option.quantity;
      const reserved = option.reservedQuantity ?? 0;
      const reason = option.queueUnavailableReason ?? option.unavailableReason;
      const disabled = !connected || !nearby || !canQueue || count >= queueLimit;
      return <button type="button" key={option.id} data-testid={'gather-option-' + option.id} className={'gather-material-card rarity-' + option.rarity + (reserved ? ' has-reservation' : '')} disabled={disabled} onClick={() => onSelect(option)}>
        <span className="gather-card-top"><i>{rarityNames[option.rarity] ?? option.rarity}</i><span>{available > 0 ? <><b>{available}</b>개 남음</> : seconds ? <>{seconds}초 후 재생</> : '남은 재료 없음'}</span></span>
        <span className="gather-card-art"><GatheringItemArt itemId={option.itemId} />{reserved > 0 && <b className="gather-reserved-badge">내 예약 {reserved}</b>}</span>
        <span className="gather-card-name">{option.name}</span>
        <span className="gather-card-skill">{option.skillName} <b>Lv.{option.skillLevel}</b></span>
        <span className="gather-card-time"><strong>{option.durationSeconds.toFixed(1)}<small>초</small></strong>{option.durationSeconds < option.baseDurationSeconds ? <del>{option.baseDurationSeconds.toFixed(1)}초</del> : <span>1개 작업 시간</span>}<i>+{option.experience} XP</i></span>
        <span className={'gather-card-select' + (disabled ? ' unavailable' : '')}>{!connected ? '연결을 기다리는 중' : !nearby ? '대상 가까이 이동' : count >= queueLimit ? '예약이 가득 찼어요' : !canQueue ? (reason ?? '지금은 예약할 수 없어요') : <><b>＋</b> 1개 예약</>}</span>
      </button>;
    })}</div>
    {!options.length && <p className="gather-card-empty">현재 얻을 수 있는 재료가 없어요.</p>}
    <div className="gather-workbench-queue">
      <div className="gather-active-slot">{job ? <ActiveWork job={job} queue={queue} now={now} onCancel={onCancel} /> : <div className="gather-active-placeholder"><span aria-hidden="true">＋</span><div><strong>첫 재료를 골라보세요</strong><small>선택한 작업이 이 자리에서 진행돼요</small></div></div>}</div>
      <div className="gather-queue-heading"><strong>예약 대기열 <b>{queue.length}</b></strong><span>{queue.length ? '앞에서부터 차례대로 진행' : '원하는 만큼 카드를 눌러 담아보세요'}{!job && queue.length > 0 && <button type="button" onClick={onCancel}>전체 취소</button>}</span></div>
      <div className="gather-queue-slot">{queue.length > 0 ? <QueueStrip queue={queue} onRemove={onRemove} /> : <div className="gather-empty-queue" data-testid="gather-queue"><span aria-hidden="true">＋</span>아직 기다리는 작업이 없어요</div>}</div>
    </div>
    <footer className="gather-tray-footer"><span>닫아도 작업은 계속돼요</span><span>이동·공격·피격 시 예약까지 취소돼요</span></footer>
  </section>;
}

export function GatheringProgress({ job, queue = [], now, onCancel, onRemove }: { job: GatheringJob; queue?: GatheringQueueEntry[]; now: number; onCancel: () => void; onRemove?: (id: string) => void }) {
  return <section className="gather-progress gather-compact-queue" aria-label={operation(job.sourceKind) + ' 예약 작업'}>
    <ActiveWork job={job} queue={queue} now={now} onCancel={onCancel} />
    {queue.length > 0 && <QueueStrip queue={queue} onRemove={onRemove} />}
    <footer>이동·공격·피격 시 작업과 예약이 중단돼요</footer>
  </section>;
}
