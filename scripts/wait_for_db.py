import logging
import time

from sqlalchemy import text

from backend.app.db.session import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger(__name__)


def main():
    last_error = None
    for attempt in range(1, 31):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database is ready (attempt %s)", attempt)
            return
        except Exception as exc:
            last_error = exc
            logger.warning("Waiting for database (attempt %s/30): %s", attempt, exc)
            time.sleep(2)
    raise RuntimeError(f"Database not ready after retries: {last_error}")


if __name__ == "__main__":
    main()
