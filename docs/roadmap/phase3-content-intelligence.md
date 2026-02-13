# Phase 3 — 콘텐츠 인텔리전스 (v1.5.0)

> 근거: Reseek 제품 분석 (auto-tagging, relationship discovery, rediscovery)

## 현재 상태 분석

### 기존 인프라 (활용 가능)
- **Note.tags** — `JSONB` 필드 이미 존재! (`models.py:27`) `["tag1", "tag2"]` 형태
- **summarize 프롬프트** — 이미 title + tags JSON 생성 기능 있음 (`prompts/summarize.py`)
- **Knowledge Graph** — `pages/Graph.tsx`, `GraphAnalysisPanel.tsx`, `DiscoveryGraph.tsx`
- **Discovery 페이지** — `pages/Discovery.tsx` (기존 발견 기능)
- **NoteEmbedding** — pgvector 1536-dim 임베딩 저장 (코사인 유사도 계산 가능)
- **Clustering** — `services/clustering.py` (KMeans 클러스터링, 요약, 캐싱)
- **Graph Service** — `services/graph_service.py` (`refresh_avg_embeddings`, `compute_graph_analysis`)

### 핵심 발견
- `Note.tags` 필드가 이미 있지만 **자동 생성 로직이 없음** — 수동 또는 미사용 상태
- `summarize` 프롬프트가 이미 태그 생성 가능 — **연결만 하면 됨**
- 임베딩 + 클러스터링 인프라 완비 — 관계 발견의 기반 준비 완료

---

## Task 3-1. Auto-Tagging (AI 자동 태그)

### 목표
노트 생성/동기화 시 AI가 **자동으로 태그 생성** → Note.tags에 저장

### TODO

#### Backend

- [ ] **Auto-Tagger 서비스** (`services/auto_tagger.py` — 신규)
  ```python
  class AutoTagger:
      """노트 내용 기반 AI 자동 태그 생성"""

      async def generate_tags(
          self,
          note_id: int,
          title: str,
          content: str,  # plain text
          existing_tags: list[str] | None = None,
      ) -> list[str]:
          """
          기존 summarize 프롬프트 활용:
          1. 노트 내용 → AI에 전달
          2. AI가 3~5개 태그 JSON 반환
          3. 기존 태그와 병합 (중복 제거)
          4. Note.tags에 저장
          """

      async def batch_tag(
          self,
          note_ids: list[int],
          db: AsyncSession,
      ) -> dict[int, list[str]]:
          """배치 태깅 — 미태깅 노트 일괄 처리"""
  ```

- [ ] **동기화 훅 통합** (`services/sync_service.py:SyncService`)
  - `_sync_note()` 완료 후 → auto_tag 트리거 (비동기 백그라운드)
  - 이미 태그가 있는 노트는 스킵 (또는 갱신 옵션)

- [ ] **API 엔드포인트**
  ```python
  # 개별 노트 태깅
  POST /api/notes/{note_id}/auto-tag → {"tags": ["tag1", "tag2"]}

  # 배치 태깅 (미태깅 전체)
  POST /api/notes/batch-auto-tag → {"status": "started", "total": 42}

  # 태그 수동 편집은 기존 노트 CRUD 활용
  ```

- [ ] **설정** (`api/settings.py`)
  - `auto_tag_on_sync: bool = True`
  - `auto_tag_on_create: bool = True`
  - `auto_tag_max_tags: int = 5`

#### Frontend

- [ ] **태그 표시** (`components/NoteCard.tsx`)
  - 노트 카드에 태그 뱃지 표시
  - 클릭 시 해당 태그로 필터링

- [ ] **태그 편집** (`pages/NoteDetail.tsx` 또는 `components/NoteEditor.tsx`)
  - 태그 인라인 편집 (추가/삭제)
  - "자동 태그 생성" 버튼

- [ ] **태그 필터** (`pages/Notes.tsx`, `pages/Search.tsx`)
  - 사이드바 또는 필터 바에 태그 필터 추가
  - 인기 태그 클라우드

- [ ] **배치 태깅 UI** (Settings 또는 Admin)
  - "전체 노트 자동 태깅" 버튼 + 진행률 표시
  - 기존 Embedding Index UI 패턴 참고 (`api/search.py:IndexState`)

### 파일 변경 목록
| 파일 | 변경 유형 |
|------|-----------|
| `backend/app/services/auto_tagger.py` | **신규** — AutoTagger 서비스 |
| `backend/app/services/sync_service.py` | 수정 — 동기화 후 태깅 훅 |
| `backend/app/api/notes.py` | 수정 — auto-tag, batch-auto-tag 엔드포인트 |
| `frontend/src/components/NoteCard.tsx` | 수정 — 태그 뱃지 |
| `frontend/src/pages/NoteDetail.tsx` | 수정 — 태그 편집 |
| `frontend/src/pages/Notes.tsx` | 수정 — 태그 필터 |

### 예상 난이도: ★★☆☆☆
Note.tags 필드 + summarize 프롬프트가 이미 있어 연결만 하면 됨. 가장 빠른 성과.

---

## Task 3-2. 노트 간 관계 발견 (Content Relationship Graph)

### 목표
기존 지식 그래프 확장 — **의미적 유사성 기반 자동 연결**, 숨겨진 관계 발견

### TODO

#### Backend

- [ ] **관련 노트 서비스** (`services/related_notes.py` — 신규)
  ```python
  class RelatedNotesService:
      """임베딩 코사인 유사도 기반 관련 노트 찾기"""

      async def find_related(
          self,
          note_id: int,
          db: AsyncSession,
          limit: int = 10,
          min_similarity: float = 0.7,
      ) -> list[RelatedNote]:
          """
          1. 대상 노트의 임베딩 조회 (NoteEmbedding)
          2. pgvector 코사인 유사도 검색 (<=> 연산자)
          3. 같은 노트북 제외 옵션 (cross-notebook discovery)
          4. RelatedNote(note_id, title, similarity, notebook_name) 반환
          """

      async def discover_connections(
          self,
          notebook_id: int | None = None,
          db: AsyncSession,
      ) -> list[NoteConnection]:
          """
          전체 또는 노트북 내 연결 맵 계산:
          1. 모든 임베딩 쌍별 유사도 계산 (또는 top-k 근사)
          2. 임계값 이상만 연결로 저장
          3. 기존 graph_service와 통합
          """
  ```

- [ ] **API 엔드포인트**
  ```python
  GET /api/notes/{note_id}/related?limit=10&min_similarity=0.7
  → {"related": [{"note_id": 5, "title": "...", "similarity": 0.85, "notebook": "..."}]}
  ```

- [ ] **그래프 서비스 확장** (`services/graph_service.py`)
  - `compute_graph_analysis()`에 유사도 기반 엣지 추가 (기존 클러스터 기반 외)
  - 엣지 유형 구분: `cluster_edge` vs `similarity_edge`

#### Frontend

- [ ] **"관련 노트" 패널** (`pages/NoteDetail.tsx`)
  - 노트 상세 페이지 우측 사이드바에 관련 노트 목록
  - 유사도 퍼센트 + 노트북 이름 표시
  - 클릭 시 해당 노트로 이동

- [ ] **그래프 확장** (`components/DiscoveryGraph.tsx`)
  - 유사도 기반 엣지를 다른 색상/스타일로 표시
  - 엣지 두께 = 유사도 비례
  - 마우스 호버 시 유사도 수치 표시

### 파일 변경 목록
| 파일 | 변경 유형 |
|------|-----------|
| `backend/app/services/related_notes.py` | **신규** — RelatedNotesService |
| `backend/app/api/notes.py` | 수정 — /related 엔드포인트 |
| `backend/app/services/graph_service.py` | 수정 — 유사도 엣지 추가 |
| `frontend/src/pages/NoteDetail.tsx` | 수정 — 관련 노트 패널 |
| `frontend/src/components/DiscoveryGraph.tsx` | 수정 — 유사도 엣지 시각화 |

### 예상 난이도: ★★★☆☆
pgvector 유사도 검색은 인프라 있음. 대량 노트 시 성능 최적화 필요.

---

## Task 3-3. 잊혀진 노트 재발견 (Rediscovery)

### 목표
오래됐지만 **현재 작업과 관련 있는 노트** 주기적으로 서피스

### TODO

#### Backend

- [ ] **Rediscovery 서비스** (`services/rediscovery.py` — 신규)
  ```python
  class RediscoveryService:
      async def get_daily_rediscovery(
          self,
          user_id: int,
          db: AsyncSession,
          limit: int = 5,
      ) -> list[RediscoveredNote]:
          """
          재발견 전략:
          1. 최근 7일간 조회/편집한 노트의 임베딩 평균 계산
          2. 30일+ 이전 노트 중 유사도 높은 것 찾기
          3. 최근 조회한 노트는 제외
          4. 다양성 보장: 같은 노트북에서 최대 2개
          """

      async def get_context_rediscovery(
          self,
          current_note_id: int,
          db: AsyncSession,
          limit: int = 3,
      ) -> list[RediscoveredNote]:
          """현재 편집 중인 노트와 관련된 오래된 노트"""
  ```

- [ ] **API 엔드포인트**
  ```python
  GET /api/discovery/rediscovery → {"notes": [...], "reason": "최근 작업과 관련"}
  GET /api/notes/{note_id}/rediscovery → {"notes": [...]}
  ```

#### Frontend

- [ ] **Discovery 페이지 확장** (`pages/Discovery.tsx`)
  - "오늘의 재발견" 섹션 추가
  - 노트 카드 + "N일 전 작성" + 유사도 이유

- [ ] **에디터 사이드바** (`pages/NoteDetail.tsx`)
  - 편집 중 관련 오래된 노트 추천 (context_rediscovery)
  - 작은 카드 목록, 접을 수 있음

### 파일 변경 목록
| 파일 | 변경 유형 |
|------|-----------|
| `backend/app/services/rediscovery.py` | **신규** — RediscoveryService |
| `backend/app/api/discovery.py` | 수정 — /rediscovery 엔드포인트 |
| `frontend/src/pages/Discovery.tsx` | 수정 — 재발견 섹션 |
| `frontend/src/pages/NoteDetail.tsx` | 수정 — 컨텍스트 추천 |

### 예상 난이도: ★★☆☆☆
기존 임베딩 인프라 활용. 쿼리 최적화가 핵심.

---

## 구현 순서 (권장)

```
3-1 (Auto-Tagging) → 3-2 (Related Notes) → 3-3 (Rediscovery)
       2일               3일                   2일
```

- 3-1이 가장 쉽고 즉각적 UX 개선 (Note.tags + summarize 이미 있음)
- 3-2는 임베딩 기반으로 3-3의 기반이 됨
- 3-3은 3-2의 RelatedNotesService 재활용

## 테스트 전략

- [ ] Unit: AutoTagger — 태그 생성, 병합, 중복 제거
- [ ] Unit: RelatedNotesService — 유사도 검색, 임계값 필터링
- [ ] Unit: RediscoveryService — 시간 필터, 다양성 보장
- [ ] Integration: 동기화 → 자동 태깅 파이프라인
- [ ] Performance: 1000+ 노트에서 유사도 검색 성능
