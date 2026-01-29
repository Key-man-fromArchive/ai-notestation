# LabNote AI - Frontend

## 기술 스택

- **React 19** - 최신 React 버전
- **Vite 6** - 빠른 개발 서버 및 빌드 도구
- **TypeScript 5.7** - 타입 안정성
- **TailwindCSS 4.0** - 유틸리티 우선 CSS (Light mode only)
- **TanStack Query 5** - 서버 상태 관리 및 캐싱
- **React Router 7** - 클라이언트 사이드 라우팅
- **Vitest** - 단위 테스트
- **Testing Library** - 컴포넌트 테스트

## 시작하기

### 의존성 설치

```bash
npm install
```

### 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 접속

### 빌드

```bash
npm run build
```

빌드 결과물은 `dist/` 디렉토리에 생성됩니다.

### 테스트

```bash
# 단위 테스트 실행
npm test

# 워치 모드
npm run test:watch

# 커버리지 리포트
npm run test:coverage
```

### 린트 및 포맷팅

```bash
# ESLint 실행
npm run lint

# Prettier 포맷팅
npm run format
```

## 프로젝트 구조

```
frontend/
├── src/
│   ├── components/       # 재사용 가능한 UI 컴포넌트
│   ├── pages/            # 페이지 컴포넌트
│   ├── hooks/            # 커스텀 훅
│   ├── lib/              # 유틸리티 및 설정
│   │   ├── utils.ts      # cn() 함수 등
│   │   └── query-client.ts  # TanStack Query 설정
│   ├── test/             # 테스트 설정
│   ├── App.tsx           # 루트 컴포넌트
│   ├── main.tsx          # 진입점
│   └── index.css         # 글로벌 스타일
├── index.html            # HTML 템플릿
├── vite.config.ts        # Vite 설정
├── tailwind.config.ts    # TailwindCSS 설정
└── tsconfig.json         # TypeScript 설정
```

## 설계 원칙

### Light Mode Only
이 프로젝트는 라이트 모드만 지원합니다. 다크 모드 관련 설정은 제거되었습니다.

### TanStack Query 캐싱 전략
- **staleTime**: 5분 - 데이터가 신선한 상태로 유지되는 시간
- **gcTime**: 30분 - 캐시가 메모리에 유지되는 시간
- **refetchOnWindowFocus**: false - 창 포커스 시 자동 재페칭 비활성화

### 경로 별칭
`@/` 별칭을 사용하여 절대 경로로 임포트 가능:

```tsx
import { cn } from '@/lib/utils'
import Button from '@/components/Button'
```

### API 프록시
개발 환경에서 `/api` 경로는 백엔드 서버(`http://backend:8000`)로 프록시됩니다.

## 컨벤션

### 컴포넌트 작성
- 함수형 컴포넌트 사용
- Props 인터페이스 정의
- forwardRef 필요 시 사용

### 스타일링
- TailwindCSS 유틸리티 클래스 우선
- `cn()` 함수로 조건부 클래스 병합
- shadcn/ui 컴포넌트 활용

### 테스트
- 모든 컴포넌트에 테스트 작성
- Testing Library의 user-centric 쿼리 사용
- 접근성 테스트 포함

## 환경 변수

환경 변수는 `.env` 파일에 정의하며, `VITE_` 접두사를 사용합니다:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

코드에서 사용:

```tsx
const apiUrl = import.meta.env.VITE_API_BASE_URL
```

## Docker 환경

Docker Compose에서 실행 시:

```bash
docker compose up -d
```

프론트엔드는 http://localhost:3000에서 접근 가능합니다.
