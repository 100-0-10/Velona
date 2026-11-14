# 로컬 실행과 PostgreSQL 접속

## 이 PC의 준비 상태

프로젝트 위치는 `D:\100_0_10\Velora`이며 GitHub 저장소 이름은 Velona다. Node.js24, .NET10, PostgreSQL18을 사용한다. DB는 기존 PostgreSQL 서비스에 추가했으며 다른 프로젝트 DB는 변경하지 않았다.

| 항목 | 값 |
| --- | --- |
| DB 서버 | 127.0.0.1 |
| 포트 | 7738 |
| 데이터베이스 | velona_dev |
| 프로젝트 계정 | velona_admin |
| 비밀번호 | 전달받은 프로젝트 계정 비밀번호 사용; 저장소에는 없음 |
| 웹 게임 | http://127.0.0.1:5173 |
| C# 서버 | http://127.0.0.1:5080 |
| 서버 상태 | http://127.0.0.1:5080/health |

이 PC에는 `.NET User Secrets`의 `Velona.Server.LocalDevelopment`에 연결 정보를 설정했다. Visual Studio와 `dotnet run`의 Development 환경에서 자동으로 읽는다. 관리자 비밀번호는 앱 연결에 사용하지 않는다. 프로젝트 계정은 해당 DB 소유자이며 슈퍼유저·다른 DB 생성 권한은 주지 않았다.

## 실행 방법

PowerShell 창 두 개를 연다. 첫 번째는 서버다.

```powershell
cd D:\100_0_10\Velora
dotnet restore backend/Velona.slnx
dotnet run --project backend/Velona.Server
```

두 번째는 프론트다.

```powershell
cd D:\100_0_10\Velora\frontend
npm ci
npm run dev
```

브라우저에서 **http://127.0.0.1:5173**에 접속한다. 이름을 정하고 입장하면 된다. 서로 다른 탭·브라우저 컨텍스트로 입장해 함께 플레이할 수 있다. 게스트 세션은 탭의 sessionStorage에 보관하므로 같은 탭 새로고침·서버 재시작 후 이어갈 수 있다. 탭을 닫아 자격 정보가 사라진 경우 게스트를 복구하는 정식 계정 기능은 아직 없다.

종료는 각 실행 터미널에서 Ctrl+C다. 동일 DB의 동일 월드는 동시에 서버 하나만 실행할 수 있다. 다른 서버가 이미 실행 중이라는 오류가 나면 기존 서버를 먼저 종료한다.

## Visual Studio와 VS Code

Visual Studio2026에서 `backend/Velona.slnx`를 열고 Velona.Server 프로필로 실행한다. 기본 주소는5080이다. VS Code에서는 프로젝트 전체를 열고 frontend 터미널에서 `npm run dev`를 실행한다. 두 도구는 같은 저장소를 사용한다.

## pgAdmin으로 DB 보기

새 서버 연결에 Host127.0.0.1, Port7738, Maintenance database velona_dev, Username velona_admin을 입력하고 프로젝트 계정 비밀번호를 사용한다.

`Schemas → velona → Tables`에 다음 테이블이 있다.

- `schema_history`: 스키마 초기화 버전.
- `guest_sessions`: 게스트 식별·표시명·만료와 토큰 해시. 원본 토큰은 저장하지 않는다.
- `world_checkpoints`: 월드별 플레이어·인벤토리·생산·해체 권리를 담는 JSONB 체크포인트.

비밀번호를 공유 문서나 Git 파일에 적을 필요는 없다. 다른 PC에서는 아래 스크립트가 계정·DB를 없는 경우만 만들고 연결 정보를 그 PC의 로컬 설정에 저장한다.

```powershell
powershell -File scripts/setup-local-db.ps1
```

PostgreSQL 설치 위치가 다르면 `-Psql`, 포트가 다르면 `-Port`를 지정한다. 기존 계정의 비밀번호를 임의로 변경하거나 기존 DB를 지우지 않는다.

## 저장 방식과 한계

전투 계산은 메모리에서20Hz로 진행하고, 별도 작업이1초마다 원자적인 월드 문서를 PostgreSQL에 저장한다. 정상 종료에는 마지막 저장을 시도한다. 갑작스러운 종료·정전에는 직전 약1초와 DB 장애 이후 미저장 변경이 유실될 수 있다. DB 저장 장애는 `/health`에서503과 degraded 상태로 표시한다. 최초 연결이 실패하면 메모리 모드로 조용히 시작하지 않는다.

진행 중인 생산은 재료 차감·완료 시각·지급 여부와 함께 저장한다. 서버가 꺼진 동안 완료 시각이 지나면 다음 시작에서 한 번만 지급한다. 같은 요청의 재시도 기록과 개인별 해체 선택도 복구한다.

이 구조는 초기 단일 월드용이다. 거래소와 운영 서비스에 앞서 아이템·재화 장부, 요청별 영구 확정, 백업·마이그레이션·계정 체계를 확장해야 한다.

## 검사

```powershell
dotnet test backend/Velona.slnx --configuration Release
node scripts/validate-design.mjs
cd frontend
npm run test:unit
npm run build
npx playwright install chromium
npm run test:e2e
```

브라우저 검사는 개발 서버가 없으면 격리 메모리 모드로 시작한다. PostgreSQL까지 검사하려면 연결 설정을 준비하고 `VELONA_E2E_POSTGRES=1`을 지정한다. CI는 별도의 PostgreSQL18 컨테이너를 사용하며 이 PC의 DB나 계정 정보를 사용하지 않는다.

저장소 루트에서 `node scripts/verify-postgres-persistence.mjs`를 실행하면 별도 검증 월드를5151에서 실행하고 두 번 강제 재시작한다. 게스트·인벤토리·오프라인 생산·중복 방지를 확인하며 일반 개발 월드와 구분한다.
