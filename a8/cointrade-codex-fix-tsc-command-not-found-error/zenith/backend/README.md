# 제니스 오케스트레이터 (Backend)

Zenith Trader Suite의 핵심인 순수 Node.js 서비스로, 바이낸스 선물 실행, GPT-5 Pro 전략 추론, 인메모리 테레메트리를 조율합니다. 실제 바이낸스/오픈AI API와 직접 통신하며, 외부 연동이 실패하면 즉시 오류를 보고합니다.

## 주요 기능
- 실시간 바이낸스 선물 시세를 REST 폴링으로 취합하여 실제 호가를 스트리밍
- 공격성 프리셋(1-5)을 조절할 수 있는 자동 실행 루프
- 시작/정지, 리스크 조정, 상태 조회, 수동 실행을 위한 REST 제어 엔드포인트
- 시그널·체결·잔고 스냅샷을 추적하는 인메모리 분석 스토어
- GPT-5 Pro 프롬프트 빌더를 통해 반환되는 JSON 전략을 그대로 실행하며, LLM 오류는 즉시 실패로 보고
- 5분 모멘텀·RSI 기반 로컬 신호로 고신뢰 상황에서 OpenAI 호출을 생략해 토큰 소비를 절감
- 24시간 가격 변동률과 유동성을 분석해 수백 개 이상의 선물 심볼을 자동 편입하고, 상·하위 모멘텀 자산을 우선 모니터링

## 스크립트
- `npm run build` – (정보 출력 전용) 별도 빌드 없이 바로 실행 가능합니다
- `npm run start` – 오케스트레이터를 즉시 실행
- `npm run dev` – `npm run start`와 동일, 개발용 단축 명령
- `npm run test` – 오케스트레이터를 임시로 부팅해 핵심 REST 엔드포인트를 점검하는 셀프 테스트

## 환경 변수
필수 항목은 저장소에 포함된 `.env` 파일을 참고하세요. 모든 자격 증명 칸은 비워져 있으므로, 실제 바이낸스·오픈AI 키를 직접 채워 넣어야 합니다.

동적 심볼 탐색을 제어하는 주요 옵션은 다음과 같습니다.

| 변수 | 기본값 | 설명 |
| ---- | ------ | ---- |
| `SYMBOL_DISCOVERY_ENABLED` | `true` | 상위 모멘텀 심볼 자동 편입 여부 |
| `SYMBOL_DISCOVERY_REFRESH_SECONDS` | `180` | 바이낸스 24h 티커 스캔 주기(초) |
| `SYMBOL_DISCOVERY_TOP_LIMIT` | `400` | 스캔 시 유지하는 최대 후보 심볼 수 |
| `SYMBOL_DISCOVERY_MAX_ACTIVE` | `400` | 자동 편입 후 총 거래 심볼 상한 |
| `SYMBOL_DISCOVERY_MIN_QUOTE_VOLUME` | `5_000_000` | 하루 누적 선물 체결금액(USDT) 하한 |
| `SYMBOL_DISCOVERY_QUOTE_ASSETS` | `USDT` | 추적할 선물 상품의 기준 통화 목록 |
| `SYMBOL_DISCOVERY_ROUTE_LIMIT` | `10` | `/movers` 엔드포인트에서 노출할 상·하위 심볼 수 |

## REST 엔드포인트
| Method | Path                  | 설명                                       |
| ------ | --------------------- | ------------------------------------------ |
| POST   | `/control/start`      | 트레이딩 엔진을 부팅하고 스케줄링을 시작 |
| POST   | `/control/stop`       | 실행을 중단하고 바이낸스 스트림을 종료   |
| POST   | `/control/risk/:level`| 공격성 프리셋(1-5) 설정                   |
| GET    | `/control/state`      | 현재 실행 상태와 리스크 레벨 조회        |
| POST   | `/run`                | 실행 루프를 한 번 수동으로 트리거        |
| GET    | `/fapi/account`       | 지갑 잔고 조회                            |
| GET    | `/fapi/positions`     | 보유 포지션 조회                          |
| GET    | `/health`             | 기본 준비/활성 상태 확인                 |
| GET    | `/metrics`            | 최신 잔고·손익 메트릭 조회               |
| GET    | `/movers`             | 24시간 기준 상승/하락 상위 심볼 조회     |
| GET    | `/signals`            | 최근 전략 시그널 10개 조회               |
| GET    | `/charts/:symbol`     | 지정 심볼의 캔들/인디케이터 스냅샷      |

## 안전 가이드
오케스트레이터는 기본적으로 바이낸스 선물 테스트넷(`BINANCE_USE_TESTNET=true`)을 사용합니다. 충분한 모의 거래 검증 이후에만 실거래 환경으로 전환하세요. 네트워크 접근이 제한되면 API 호출이 실패하고 실행이 중단되므로, 운영 전 반드시 연결 상태를 확인하세요.
