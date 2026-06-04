"""Worker entry point — runs the APScheduler pipeline."""

import logging

from flatfox_worker.config import settings
from flatfox_worker.flatfox_client import FlatfoxClient
from flatfox_worker.extractor import run_extraction
from flatfox_worker.ingestion import run_ingestion
from flatfox_worker.matcher import run_matching

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def run_pipeline() -> None:
    logger.info("Pipeline triggered (interval=%dm)", settings.ingestion_interval_minutes)

    client = FlatfoxClient()
    try:
        stats = run_ingestion(client)
        logger.info("Ingestion stats: %s", stats)
    finally:
        client.close()

    extracted = run_extraction()
    logger.info("Extraction: %d listings processed.", extracted)

    matched = run_matching()
    logger.info("Matching: %d new matches.", matched)


if __name__ == "__main__":
    logger.info("Worker starting — interval=%dm", settings.ingestion_interval_minutes)
    run_pipeline()
