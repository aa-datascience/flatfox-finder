from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/studenthousing"
    redis_url: str = "redis://localhost:6379"
    anthropic_api_key: str = ""
    ingestion_interval_minutes: int = 30
    match_score_threshold: float = 0.5
    flatfox_base_url: str = "https://flatfox.ch"
    flatfox_expand: str = "images,documents,attributes"
    flatfox_page_size: int = 100
    flatfox_page_delay: float = 0.5
    flatfox_max_retries: int = 3
    flatfox_max_pages: int = 50  # 50 pages × 100 = 5000 listings per run (~3 min)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_tls: bool = True
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@flatfoxfinder.ch"
    app_base_url: str = "http://localhost:3000"

    model_config = {"env_file": "../.env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
