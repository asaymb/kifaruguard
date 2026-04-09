import csv
import logging

logger = logging.getLogger(__name__)


def load_column_values(csv_path: str, column: str) -> set[str]:
    values = set()
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                values.add((row.get(column) or "").strip().lower())
    except FileNotFoundError:
        logger.warning("CSV file not found: %s", csv_path)
        return set()
    except Exception as exc:
        logger.exception("Failed loading CSV '%s': %s", csv_path, exc)
        return set()

    values.discard("")
    return values
