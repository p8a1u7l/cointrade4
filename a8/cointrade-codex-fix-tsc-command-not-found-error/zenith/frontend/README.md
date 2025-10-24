# 헬리오스 대시보드 (Frontend)

Webull 스타일의 미학을 입힌 React + Vite 단일 페이지 인터페이스입니다. 백엔드는 Express 오케스트레이터(`/zenith/backend`)
가 제공하는 REST 엔드포인트만 사용합니다.

## 시작하기
```bash
cd zenith/frontend
npm install
npm run dev
```
Vite를 실행할 때 `.env` 파일 또는 CLI를 통해 다음 환경 변수를 설정하세요.

```
VITE_API_BASE_URL=http://localhost:8080
VITE_METRICS_ENDPOINT=http://localhost:8080/metrics # 선택 사항, 기본값은 API_BASE_URL/metrics
VITE_MOVERS_ENDPOINT=http://localhost:8080/movers   # 선택 사항, 기본값은 API_BASE_URL/movers
VITE_SIGNALS_ENDPOINT=http://localhost:8080/signals # 선택 사항, 기본값은 API_BASE_URL/signals
```

## UI 하이라이트
- 백엔드 리스크 프리셋과 연동되는 공격성 다이얼(1-5)
- 헤더에서 노출되는 Start/Stop 제어 버튼
- 잔고, 자기자본, 누적 손익, 실현 명목가치를 보여주는 라이브 카드
- 상·하위 종목을 보여주는 심볼 무버 보드
- 5초 간격으로 새로고침되는 GPT-5 시그널 피드
