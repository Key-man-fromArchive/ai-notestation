# @TASK P0-T0.3 - pydantic-settings 기반 애플리케이션 설정
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#environment-variables

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """LabNote AI application settings.

    All values are loaded from environment variables.
    A .env file in the backend directory is also supported.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # --- Database ---
    DATABASE_URL: str = "postgresql+asyncpg://labnote:labnote@db:5432/labnote"

    # --- Synology NAS ---
    SYNOLOGY_URL: str = "http://localhost:5000"
    SYNOLOGY_USER: str = "admin"
    SYNOLOGY_PASSWORD: str = ""

    # --- JWT ---
    JWT_SECRET: str = "change-this-secret-key"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- AI Providers (optional) ---
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    ZHIPUAI_API_KEY: str = ""

    # --- Embeddings ---
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSION: int = 1536

    # --- Reranking ---
    COHERE_API_KEY: str = ""
    RERANK_MODEL: str = "rerank-english-v3.0"

    # --- OAuth ---
    OAUTH_ENCRYPTION_KEY: str = ""  # Fernet key for token encryption
    APP_BASE_URL: str = "http://localhost:3000"  # Frontend URL for OAuth callback
    OPENAI_OAUTH_CLIENT_ID: str = ""  # Codex CLI client ID (app_EMoamEEZ73f0CkXaXp7hrann)
    ANTHROPIC_OAUTH_CLIENT_ID: str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"  # Claude OAuth
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""

    # --- NSX Image Storage ---
    NSX_IMAGES_PATH: str = "/data/nsx_images"  # Path to store extracted images
    NSX_EXPORTS_PATH: str = "/data/nsx_exports"  # Path for NSX export files
    UPLOADS_PATH: str = "/data/uploads"  # Path for user-uploaded files
    TRASH_PATH: str = "/data/trash"  # Path for trash backup data

    @property
    def async_database_url(self) -> str:
        """Ensure the database URL uses the asyncpg driver."""
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings singleton."""
    return Settings()
