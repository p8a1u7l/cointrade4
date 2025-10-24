# Supabase 블루프린트

Zenith Trader Suite를 위한 SQL 스키마와 Edge Function 모음입니다.

## 데이터베이스 객체
Supabase SQL 에디터에서 `sql/schema.sql`을 실행하면 다음 객체가 생성됩니다.
- `public.trade_signals` – GPT-5 전략 출력 저장소
- `public.trade_fills` – 체결 이력 저장소
- `public.trade_equity` – 잔고 스냅샷 테이블
- `public.vw_symbol_performance` – 종목별 체결을 집계한 뷰

## Edge Function
각 함수를 `supabase functions deploy <name>` 명령으로 배포하세요.

### `metrics`
대시보드에 필요한 전체 손익, 현재 잔고, 리스크 상태를 집계합니다.

### `movers`
상·하위 실적 종목과 방향성 비율을 반환합니다.
