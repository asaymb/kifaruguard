import csv
import os
from backend.app.core.security import hash_password
from backend.app.db.models import Base, User
from backend.app.db.session import SessionLocal, engine

def seed_csv(path: str, headers: list[str], rows: list[list[str]]):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        return
    with open(path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)

def main():
    Base.metadata.create_all(bind=engine)
    seed_csv('/app/data/sanctions_mines.csv', ['country'], [['north korea'], ['iran']])
    seed_csv('/app/data/sanctions_politiques.csv', ['company_name'], [['acme holdings'], ['red flag corp']])
    os.makedirs('/app/config', exist_ok=True)
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == 'admin').first():
            db.add(User(username='admin', hashed_password=hash_password('admin123')))
            db.commit()
    finally:
        db.close()

if __name__ == '__main__':
    main()
