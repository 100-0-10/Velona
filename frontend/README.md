# Velona 웹 클라이언트

React·TypeScript·Three.js로 구현한 PC 우선 초기 플레이 클라이언트입니다. 서버 실행 후 `npm ci`, `npm run dev`로 시작합니다. 개발 주소는 http://127.0.0.1:5173 입니다. Vite는 `/api`, `/hubs`, `/health`를 기본 http://127.0.0.1:5080 으로 전달합니다. 다른 서버는 `VELONA_BACKEND_URL` 환경 변수로 설정합니다.

`npm run test:unit`, `npm run typecheck`, `npm run build`로 검사합니다. `npm run test:e2e`는 프론트와 C# 서버를 함께 실행하고 Chromium에서 실제 연결과 조작을 확인합니다. 첫 실행 전에 `npx playwright install chromium`이 필요합니다.

WASD·방향키 이동, Space 돌창 공격, E 채집·해체, C 제작창, I 소지품, Escape 창 닫기입니다. 해체에서는 첫 가방에 필요한 외피를 선택합니다. 야영지에서 섬유끈·수피 분말·가죽 손질·무두질·건조·가방 제작이 가능합니다. 제작 결과는 서버가 확정합니다.

개발 세션은 탭별 sessionStorage에 저장되며 새 탭에서 다른 이름으로 함께 접속할 수 있습니다. 같은 탭 새로고침은 기존 세션을 이어갑니다. 서버 재시작 시 진행은 초기화됩니다. 이 버전은 운영 인증·DB 저장이 없는 초기 시제품입니다. 가공 시간은 개발용 0.05배이며 완료품은 자동 지급합니다.

3D 자산은 실루엣·패턴·공간·조작을 확인하기 위한 자체 절차형 시험 모델입니다. 최종 캐릭터·몬스터·건물·사운드가 아니며 외부 생성 API나 유료 자산은 사용하지 않았습니다. 서버 이동·충돌이 실제 판정을 담당하며 화면 모델은 표시용입니다.

개발 모드 또는 `VITE_ENABLE_TEST_HOOKS=1` 빌드에서만 읽기 전용 `window.__VELONA_TEST_STATE__`와 `window.__THREE_GAME_DIAGNOSTICS__`를 제공합니다. 계정 토큰이나 서버 상태를 바꾸는 기능은 노출하지 않습니다. 운영 빌드에 이 플래그를 사용하지 마세요.
