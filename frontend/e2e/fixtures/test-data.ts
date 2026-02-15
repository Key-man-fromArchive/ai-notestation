/**
 * Sample test data for E2E tests.
 * Provides varied content for search, discovery, and AI testing.
 */

export const SAMPLE_NOTES = [
  {
    title: '머신러닝 기초 개념 정리',
    content: '<p>머신러닝은 데이터에서 패턴을 학습하는 인공지능의 하위 분야입니다. 지도학습, 비지도학습, 강화학습으로 나뉩니다. 대표적인 알고리즘으로는 선형회귀, 결정 트리, 랜덤 포레스트, SVM 등이 있습니다.</p>',
    tags: ['machine-learning', 'AI', 'basics'],
  },
  {
    title: 'Python 데이터 분석 가이드',
    content: '<p>Pandas와 NumPy를 사용한 데이터 분석 워크플로우입니다. DataFrame 생성, 필터링, 그룹화, 피벗 테이블 등의 핵심 기능을 다룹니다.</p>',
    tags: ['python', 'data-analysis', 'pandas'],
  },
  {
    title: 'React 컴포넌트 설계 패턴',
    content: '<p>React에서 재사용 가능한 컴포넌트를 설계하는 방법입니다. Compound Components, Render Props, Custom Hooks 패턴을 설명합니다.</p>',
    tags: ['react', 'frontend', 'design-patterns'],
  },
  {
    title: 'PostgreSQL 성능 최적화',
    content: '<p>PostgreSQL 쿼리 성능을 최적화하기 위한 인덱스 전략, EXPLAIN ANALYZE 활용법, 파티셔닝, 커넥션 풀링 방법을 다룹니다.</p>',
    tags: ['database', 'postgresql', 'performance'],
  },
  {
    title: 'Docker 컨테이너 오케스트레이션',
    content: '<p>Docker Compose와 Kubernetes를 사용한 컨테이너 오케스트레이션입니다. 서비스 디스커버리, 로드 밸런싱, 스케일링 전략을 설명합니다.</p>',
    tags: ['docker', 'kubernetes', 'devops'],
  },
  {
    title: 'FastAPI REST API 구축',
    content: '<p>FastAPI를 사용한 고성능 REST API 개발 가이드입니다. Pydantic 모델, 의존성 주입, 비동기 엔드포인트, OpenAPI 문서화를 다룹니다.</p>',
    tags: ['python', 'fastapi', 'api'],
  },
  {
    title: 'Git 브랜치 전략',
    content: '<p>Git Flow, GitHub Flow, Trunk-Based Development 등 다양한 브랜치 전략의 장단점을 비교합니다. CI/CD 파이프라인과의 통합도 다룹니다.</p>',
    tags: ['git', 'workflow', 'ci-cd'],
  },
  {
    title: 'TypeScript 고급 타입 시스템',
    content: '<p>TypeScript의 Conditional Types, Mapped Types, Template Literal Types 등 고급 타입 기능을 활용한 타입 안전한 코드 작성법입니다.</p>',
    tags: ['typescript', 'types', 'frontend'],
  },
  {
    title: '웹 보안 OWASP Top 10',
    content: '<p>OWASP Top 10 웹 보안 취약점과 대응 방안입니다. SQL Injection, XSS, CSRF, 인증/인가 결함 등 주요 취약점을 다룹니다.</p>',
    tags: ['security', 'owasp', 'web'],
  },
  {
    title: '딥러닝 트랜스포머 아키텍처',
    content: '<p>Transformer 모델의 Self-Attention 메커니즘과 BERT, GPT 등 사전학습 모델의 구조를 설명합니다. Fine-tuning 방법론도 포함합니다.</p>',
    tags: ['deep-learning', 'transformer', 'NLP'],
  },
  {
    title: 'CSS Grid와 Flexbox 비교',
    content: '<p>CSS Grid와 Flexbox의 차이점과 각각의 사용 사례를 비교합니다. 반응형 레이아웃 구현 시 어떤 것을 선택해야 하는지 가이드를 제공합니다.</p>',
    tags: ['css', 'frontend', 'layout'],
  },
  {
    title: 'TDD와 BDD 비교 분석',
    content: '<p>Test-Driven Development와 Behavior-Driven Development의 차이점, 각 방법론의 장단점, 실전 적용 사례를 비교 분석합니다.</p>',
    tags: ['testing', 'tdd', 'bdd'],
  },
  {
    title: 'AWS 클라우드 아키텍처',
    content: '<p>AWS 주요 서비스(EC2, S3, RDS, Lambda, CloudFront)를 활용한 확장 가능한 클라우드 아키텍처 설계 패턴입니다.</p>',
    tags: ['aws', 'cloud', 'architecture'],
  },
  {
    title: '자연어 처리 기초',
    content: '<p>NLP의 기본 개념인 토큰화, 형태소 분석, 개체명 인식, 감성 분석 등을 다룹니다. 한국어 NLP 도구인 KoNLPy도 소개합니다.</p>',
    tags: ['NLP', 'AI', 'korean'],
  },
  {
    title: 'GraphQL vs REST API',
    content: '<p>GraphQL과 REST API의 근본적인 차이점을 비교합니다. Over-fetching/Under-fetching 문제, 스키마 정의, 캐싱 전략을 다룹니다.</p>',
    tags: ['graphql', 'rest', 'api'],
  },
  {
    title: '마이크로서비스 아키텍처 패턴',
    content: '<p>마이크로서비스 설계 시 고려해야 할 패턴들: API Gateway, Circuit Breaker, Event Sourcing, CQRS, Saga 패턴을 설명합니다.</p>',
    tags: ['microservices', 'architecture', 'distributed'],
  },
  {
    title: '벡터 데이터베이스와 임베딩',
    content: '<p>pgvector, Pinecone, Weaviate 등 벡터 데이터베이스의 특징을 비교합니다. 텍스트 임베딩 생성 방법과 유사도 검색 알고리즘도 다룹니다.</p>',
    tags: ['vector-db', 'embeddings', 'AI'],
  },
  {
    title: '데이터 파이프라인 설계',
    content: '<p>Apache Airflow, Prefect를 활용한 ETL/ELT 파이프라인 설계입니다. 배치 처리와 스트림 처리의 차이점도 비교합니다.</p>',
    tags: ['data-engineering', 'pipeline', 'etl'],
  },
  {
    title: '리눅스 시스템 관리 기초',
    content: '<p>리눅스 서버 관리에 필요한 기본 명령어, 프로세스 관리, 파일 시스템, 네트워크 설정, systemd 서비스 관리를 다룹니다.</p>',
    tags: ['linux', 'sysadmin', 'devops'],
  },
  {
    title: '함수형 프로그래밍 원칙',
    content: '<p>순수 함수, 불변성, 고차 함수, 합성, 모나드 등 함수형 프로그래밍의 핵심 원칙을 JavaScript/TypeScript 예제와 함께 설명합니다.</p>',
    tags: ['functional', 'programming', 'javascript'],
  },
]

/**
 * Notes specifically designed for search testing.
 * Contains overlapping terms for relevance ranking tests.
 */
export const SEARCH_TEST_NOTES = [
  {
    title: '하이브리드 검색 엔진 설계',
    content: '<p>전문 검색(FTS)과 의미 검색(semantic)을 결합한 하이브리드 검색 엔진의 설계입니다. RRF(Reciprocal Rank Fusion) 알고리즘으로 결과를 병합합니다.</p>',
    tags: ['search', 'hybrid', 'ranking'],
  },
  {
    title: '검색 품질 평가 방법론',
    content: '<p>NDCG, MRR, MAP 등 검색 품질 메트릭을 설명합니다. A/B 테스트와 사용자 피드백을 활용한 검색 품질 개선 방법도 다룹니다.</p>',
    tags: ['search', 'evaluation', 'metrics'],
  },
  {
    title: '정보 검색 이론',
    content: '<p>TF-IDF, BM25 등 정보 검색의 기본 이론과 역색인(inverted index) 구조를 설명합니다. 형태소 분석과 스테밍의 차이도 다룹니다.</p>',
    tags: ['search', 'information-retrieval', 'theory'],
  },
  {
    title: '임베딩 기반 의미 검색',
    content: '<p>텍스트 임베딩을 활용한 의미 검색 시스템 구축 방법입니다. Sentence Transformers, OpenAI Embeddings, Cosine Similarity를 다룹니다.</p>',
    tags: ['search', 'semantic', 'embeddings'],
  },
  {
    title: 'Elasticsearch와 PostgreSQL FTS 비교',
    content: '<p>Elasticsearch와 PostgreSQL Full-Text Search의 성능과 기능을 비교합니다. 한국어 검색에서의 차이점도 분석합니다.</p>',
    tags: ['search', 'elasticsearch', 'postgresql'],
  },
]

/**
 * Get a subset of sample notes.
 */
export function getSampleNotes(count: number) {
  return SAMPLE_NOTES.slice(0, Math.min(count, SAMPLE_NOTES.length))
}

/**
 * Get all notes (sample + search-specific).
 */
export function getAllTestNotes() {
  return [...SAMPLE_NOTES, ...SEARCH_TEST_NOTES]
}
