"""Worker entry point — runs the APScheduler pipeline."""

import logging

from flatfox_worker.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def run_pipeline() -> None:
    logger.info("Pipeline triggered (interval=%dm)", settings.ingestion_interval_minutes)
    # Task 4: ingestion
    # Task 5: extraction
    # Task 6: matching


if __name__ == "__main__":
    logger.info("Worker starting — interval=%dm", settings.ingestion_interval_minutes)
    run_pipeline()
