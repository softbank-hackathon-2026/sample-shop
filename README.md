# sample-shop

Freesia 시연용 쇼핑몰 서비스입니다. 상품 목록을 보여 주는 웹 서비스로, 항상 켜져 있어야 하는 HTTP 서버입니다.

- 실행 환경: Node.js 20
- 포트: 3000 (`PORT` 환경변수로 바꿀 수 있음)
- 헬스체크: `GET /health` → `{"status": "ok"}`
- 상품 목록 API: `GET /api/products`
- 온프레미스 연결 확인: `GET /api/onprem/health`
- 외부 패키지 없음

## 실행

```bash
npm start
```

온프레미스 연결을 로컬에서 확인하려면 `.env.example`을 참고해 `.env`에 다음 값을 넣습니다.

| 환경변수 | 역할 |
|---|---|
| `ONPREM_CONNECTION_MODE` | `private`는 VPN/WARP를 통한 내부 API 직접 접속, `access`는 Cloudflare Access 도메인 접속입니다. 기본값은 `access`입니다. |
| `ONPREM_API_URL` | 배포용 연결 확인 주소는 `https://vpn.howon.me/api/health`입니다. 실제 API 조회 시 경로까지 지정합니다. |
| `CF_ACCESS_CLIENT_ID` | `access` 모드에서 사용하는 Access Service Token Client ID |
| `CF_ACCESS_CLIENT_SECRET` | `access` 모드에서 사용하는 Access Service Token Client Secret |

온프레미스 API 서버는 `http://10.0.1.152:8080`입니다. 배포된 앱은 `ONPREM_CONNECTION_MODE=access`, `ONPREM_API_URL=https://vpn.howon.me/api/health`로 설정해 기존 Cloudflare 터널을 통해 이 서버에 접속합니다. Access 모드에서는 서버가 두 Service Token 값을 요청 헤더에 넣습니다. 실행 환경에는 외부 HTTPS 443 송신 경로가 필요합니다.

VPN/WARP로 내부 IP에 직접 접속하는 환경에서는 `ONPREM_CONNECTION_MODE=private`, `ONPREM_API_URL=http://10.0.1.152:8080/api/health`를 사용할 수 있습니다. 이 모드는 해당 IP의 라우팅이 실행 환경에 준비되어 있어야 하며, Cloudflare Access 키를 내부 API에 보내지 않습니다.

Node.js 20.6 이상에서 `.env`를 읽어 연결 대상에 직접 요청합니다. 이 명령은 sample-shop 서버를 띄우지 않습니다.

```bash
npm run check:onprem
```

sample-shop 웹 서버를 로컬에서 실행할 때는 다음 명령을 사용합니다. 실행 환경에 이미 환경변수를 주입했다면 `npm start`를 사용합니다. 웹 서버의 `/api/onprem/health`에서도 동일한 연결 확인 기능을 제공합니다.

```bash
npm run start:local
```

2xx 응답이면 `connected: true`와 원본 HTTP 상태를 반환합니다. 이 결과는 지정한 URL의 HTTP 접근 성공을 의미하며, 원본 데이터의 내용이나 다른 내부 API의 정상 동작은 별도로 확인해야 합니다. 온프레미스 응답 본문, 주소와 키는 클라이언트에 전달하지 않습니다. 요청 제한 시간은 5초이며 리디렉션은 따라가지 않습니다.

Cloudflare Access 도메인으로 접속하려면 모드를 `access`로 바꾸고 HTTPS 주소와 두 Service Token 값을 설정합니다. 같은 URL에 인증 헤더 없이 요청했을 때 차단되는지도 비교해 확인합니다. 인증 유무와 관계없이 2xx가 나오면 이 연결 검사만으로 Service Token 인증이 적용되었다고 판단할 수 없습니다.

| HTTP 상태 | 결과 |
|---|---|
| `200` | 지정한 URL이 2xx로 응답 |
| `503` | 환경변수가 누락되거나 접속 모드 또는 주소 설정이 잘못됨 |
| `502` | 원본 HTTP 오류, 리디렉션, DNS 또는 TLS 등 연결 실패 |
| `504` | 요청 제한 시간 초과 |

`onprem_network_unreachable`이면 실행 환경에서 내부 IP에 도달할 수 없는 상태입니다. VPN/WARP 연결 여부와 CIDR 경로, Gateway 정책 및 서버 측 라우팅을 확인합니다.

현재 `/api/products`는 샘플 상품을 반환합니다. `/health`는 앱 프로세스의 상태를 확인하며 온프레미스 연결에 의존하지 않습니다.

## 컨테이너

```bash
docker build -t sample-shop .
docker run -p 3000:3000 sample-shop
```

온프레미스 환경변수를 컨테이너에 전달하려면 다음과 같이 실행합니다. `.env`는 Git과 Docker 빌드 컨텍스트에서 제외합니다.

```bash
docker run --env-file .env -p 3000:3000 sample-shop
```

ECS에서는 접속 모드와 API 주소를 컨테이너 `environment`에 설정합니다. `private` 모드는 ECS 실행 환경에서도 `10.0.1.152`로 향하는 VPN 또는 내부망 경로가 필요합니다. 로컬 WARP 연결은 ECS에 공유되지 않습니다. `access` 모드는 외부 HTTPS 443 송신 경로를 준비하고, Client ID와 Client Secret을 SSM SecureString 또는 Secrets Manager ARN을 참조하는 `secrets`에 설정합니다. Task Execution Role에는 비밀값 조회 권한을 부여합니다. 변경한 환경변수와 비밀값은 새 Task로 배포한 뒤 실제 ECS 환경에서 다시 확인합니다.

## Cloudflare Access와 ECS 배포 설정

배포 시 요청 경로는 다음과 같습니다.

```text
sample-shop 서버 → HTTPS + Access Service Token → Cloudflare
               → 온프레미스 cloudflared → http://10.0.1.152:8080
```

### 1. 터널의 HTTP 경로를 확인합니다

`vpn.howon.me`의 `^/api/` 경로를 `http://10.0.1.152:8080`에 연결하고, 이 규칙을 같은 호스트의 SSH 규칙보다 앞에 배치합니다. 호출 주소는 `https://vpn.howon.me/api/health`입니다. 터널 화면의 `^/api/`는 정규식이므로 실제 호출 URL에는 넣지 않습니다.

### 2. API 경로에 Access 정책을 설정합니다

Cloudflare 대시보드에서 `Zero Trust > Access controls > Applications`로 이동해 새 애플리케이션을 만듭니다. 유형은 `Self-hosted and private`를 선택하고 `Add public hostname`을 추가합니다.

| 항목 | 값 |
|---|---|
| Application name | `sample-shop-onprem-api` |
| Subdomain | `vpn` |
| Domain | `howon.me` |
| Path | `api/*` |

이 경로의 Access 정책은 다음 값으로 설정합니다.

| 항목 | 값 |
|---|---|
| Policy name | `sample-shop-service-auth` |
| Action | `Service Auth` |
| Include selector | `Service Token` |
| Include value | 기존 Service Token `github-actions-onprem` |

Access의 Path에는 `api/*`를 넣습니다. 터널 규칙의 정규식 `^/api/`와 문법이 다릅니다. API 전용 경로를 보호하면 기존 SSH 배포 경로와 별도로 정책을 적용할 수 있습니다. 이 API 애플리케이션에는 인증 없이 통과시키는 Bypass 정책을 추가하지 않습니다.

### 3. 인증 유무를 비교합니다

키 없이 호출하는 경우의 HTTP 상태만 확인합니다. 리디렉션을 따라가지 않습니다.

```bash
curl --max-time 5 -sS -o /dev/null -w '%{http_code}\n' https://vpn.howon.me/api/health
```

Access 정책을 적용한 뒤에는 키 없는 요청이 `401`, `403` 또는 로그인 리디렉션 `302`로 차단되고, 준비한 키를 사용하는 요청은 API의 JSON 응답을 반환해야 합니다. HTTP `200`만으로 인증 성공을 판단하지 않습니다.

로컬 `.env`의 키로 앱의 연결 검사를 실행합니다.

```bash
npm run check:onprem
```

키 없는 요청에도 API의 JSON이 반환되면 Access 애플리케이션의 호스트와 경로, Bypass 정책을 확인합니다. 키를 넣은 요청이 `401` 또는 `403`이면 정책에서 선택한 Service Token과 `.env`의 Client ID가 같은 토큰인지, 만료되지 않았는지 확인합니다. `302`이면 Service Auth 정책이 적용되는지도 확인합니다. `502`이면 터널이 실행되는 서버에서 `http://10.0.1.152:8080/api/health`에 접속할 수 있는지 확인합니다.

2026-10-04에 위 애플리케이션과 정책을 Cloudflare 대시보드에 저장하고, 로컬에서 `https://vpn.howon.me/api/health`를 호출해 다음 결과를 확인했습니다.

| 요청 | 확인 결과 |
|---|---|
| 인증 헤더 없음 | HTTP `403`, API 정상 응답 없음 |
| 기존 `.env`의 두 인증키 | HTTP `200`, JSON의 `status`가 `ok` |
| 잘못된 인증키 | HTTP `403`, API 정상 응답 없음 |

이 결과는 로컬에서 공개 HTTPS 경로와 Access 인증을 검증한 결과입니다. 두 인증키의 AWS Parameter Store 등록과 ECS 권한 설정, 시크릿 주입, 서비스 재배포도 아래와 같이 완료했습니다. 동일 Task Definition의 임시 ECS 검증 Task에서도 인증키를 사용하는 API 정상 응답과 키 없는 요청의 차단을 확인했습니다.

### 4. 등록된 AWS Parameter Store 비밀값을 참조합니다

2026-10-04에 sample-shop의 ECS 실행 계정인 `SBH Workload` (`921810471078`), 서울 리전 (`ap-northeast-2`)의 `Systems Manager > Parameter Store`에 아래 두 파라미터를 등록했습니다. 두 파라미터 모두 `SecureString`, `Standard` 등급, KMS 키 `alias/aws/ssm`을 사용합니다. AWS에서 복호화해 읽은 값이 로컬 `.env`의 값과 일치하는지 확인했습니다.

| 파라미터 이름 | 유형 | 버전 |
|---|---|---|
| `/sample-shop/CF_ACCESS_CLIENT_ID` | `SecureString` | `1` |
| `/sample-shop/CF_ACCESS_CLIENT_SECRET` | `SecureString` | `1` |

[컨테이너 설정 예시](deploy/ecs-onprem.container.example.json)의 `environment`와 `secrets` 항목을 현재 Task Definition의 sample-shop 컨테이너에 추가합니다. 전체 Task Definition이 아닌 추가할 항목의 예시이며, 등록된 두 파라미터의 실제 ARN을 반영했습니다. 비밀값 대신 파라미터 ARN을 참조합니다.

[Execution Role 정책 예시](deploy/ecs-onprem.execution-policy.example.json)는 해당 두 파라미터를 읽는 `ssm:GetParameters` 권한만 제공합니다. 이 정책을 실제 Task Definition의 실행 역할인 `sbh-workload-demo-role-exec-app-833e4108b5b3`에 `sample-shop-onprem-secrets`라는 인라인 정책으로 적용했습니다. IAM 시뮬레이션에서 두 파라미터의 조회는 허용되고, 다른 파라미터의 조회는 거부되는 것을 확인했습니다. 고객 관리 KMS 키를 사용하면 해당 키에 대한 `kms:Decrypt` 권한도 필요합니다.

### 5. 새 Task를 배포하고 실행 환경에서 확인합니다

변경한 Task Definition revision으로 ECS 서비스를 업데이트합니다. 키 값을 바꾸거나 회전한 경우에도 새 Task가 실행되어야 반영됩니다. Private subnet에서 실행하는 경우 NAT 등 외부 HTTPS 443 송신 경로와 Parameter Store 조회 경로를 준비합니다.

2026-10-04에 적용한 서비스 설정과 확인 결과는 다음과 같습니다.

| 항목 | 확인 결과 |
|---|---|
| ECS 클러스터 | `sbh-workload-demo-ecs-app-833e4108b5b3` |
| ECS 서비스 | `sbh-workload-demo-svc-app-833e4108b5b3` |
| Task Definition | `sbh-workload-demo-task-app-833e4108b5b3:2` |
| 배포 상태 | `COMPLETED`, 실행 Task `1`, 대기 Task `0` |
| 컨테이너 환경변수 | `ONPREM_CONNECTION_MODE=access`, `ONPREM_API_URL=https://vpn.howon.me/api/health` |
| 시크릿 주입 | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`를 등록된 SSM ARN에서 주입 |
| 서비스 상태 | ALB 대상 `healthy`, 앱 `/health`는 HTTP `200` |

동일 Task Definition을 사용하는 임시 Fargate 검증 Task `c275a423bf5c4d5ba403a2af21601f14`에서 두 인증키의 환경변수 주입을 확인했습니다. 인증키가 있는 요청은 HTTP `200`과 JSON `status: ok`, 인증키가 없는 요청은 HTTP `403`을 반환했습니다. 이 검증은 Mac의 VPN을 사용하지 않는 AWS 실행 환경에서 수행했으며, 임시 Task는 종료 코드 `0`으로 종료했습니다.

현재 운영 이미지에는 `/api/onprem/health` 경로가 없으며, 실제 ALB 호출도 HTTP `404`를 반환했습니다. 현재 작업 공간의 연결 검사 코드를 포함하는 새 이미지를 빌드하고 배포한 뒤 아래 명령 또는 `/api/onprem/health` 경로를 사용할 수 있습니다.

연결 검사 코드가 배포된 컨테이너에서 아래 명령을 실행하면 ECS가 주입한 환경변수를 사용해 연결을 확인할 수 있습니다. 컨테이너에는 `.env` 파일이 들어가지 않습니다.

```bash
node server.js --check-onprem
```

앱의 `/health`는 프로세스 상태만 확인합니다. 온프레미스 연결은 `/api/onprem/health` 또는 위 명령으로 별도로 확인합니다. 현재 `/api/products`는 샘플 상품을 반환하므로 이 연결 검사 성공은 상품 API 연동 완료를 의미하지 않습니다.

참고: [Cloudflare 터널 경로](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/), [Access 애플리케이션](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [Service Token 인증](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/), [Access 경로](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), [ECS Parameter Store 주입](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-ssm-paramstore.html), [Task Execution Role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html).

## 테스트

```bash
npm test
```
