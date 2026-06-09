"""Worker entry point — runs the APScheduler pipeline."""

import logging

from flatfox_worker.config import settings
from flatfox_worker.email_digest import run_email_digest
from flatfox_worker.flatfox_client import FlatfoxClient
from flatfox_worker.extractor import run_extraction
from flatfox_worker.ingestion import run_ingestion
from flatfox_worker.matcher import run_matching
from flatfox_worker.purge import run_purge

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def run_pipeline() -> None:
    logger.info("Pipeline triggered (interval=%dm)", settings.ingestion_interval_minutes)

    client = FlatfoxClient()
    try:
        stats = run_ingestion(client, max_pages=settings.flatfox_max_pages or None)
        logger.info("Ingestion stats: %s", stats)
    finally:
        client.close()

    extracted = run_extraction()
    logger.info("Extraction: %d listings processed.", extracted)

    matched = run_matching()
    logger.info("Matching: %d new matches.", matched)

    if matched > 0:
        sent = run_email_digest()
        logger.info("Email digest: %d emails sent.", sent)

    purged = run_purge()
    logger.info("Purge: %d stale listings removed.", purged)


if __name__ == "__main__":
    logger.info("Worker starting — interval=%dm", settings.ingestion_interval_minutes)
    run_pipeline()
