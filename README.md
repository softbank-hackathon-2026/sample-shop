# sample-shop

Freesia 시연용 쇼핑몰 서비스입니다. 상품 목록을 보여 주는 웹 서비스로, 항상 켜져 있어야 하는 HTTP 서버입니다.

- 실행 환경: Node.js 20
- 포트: 3000 (`PORT` 환경변수로 바꿀 수 있음)
- 헬스체크: `GET /health` → `{"status": "ok"}`
- 상품 목록 API: `GET /api/products`
- 외부 패키지 없음

## 실행

```bash
npm start
```

## 컨테이너

```bash
docker build -t sample-shop .
docker run -p 3000:3000 sample-shop
```

## 테스트

```bash
npm test
```
