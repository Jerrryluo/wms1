import os
import sys
import sqlite3
from datetime import datetime, date

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app import app
from extensions import db
from models import (
    Merchant, Product, Stock, Record, User, Location,
    Permission, UserPermission, ShenzhenRecord
)


def parse_datetime(val):
    if not val:
        return None
    try:
        # common formats
        return datetime.fromisoformat(str(val))
    except Exception:
        try:
            return datetime.strptime(str(val), "%Y-%m-%d %H:%M:%S")
        except Exception:
            return None


def parse_date(val):
    if not val or str(val) in ("", "None", "无"):
        return None
    try:
        return date.fromisoformat(str(val))
    except Exception:
        try:
            return datetime.strptime(str(val), "%Y-%m-%d").date()
        except Exception:
            return None


def migrate(sqlite_path: str):
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    with app.app_context():
        # Merchants
        for row in cur.execute("SELECT * FROM merchant"):
            if not Merchant.query.get(row["id"]):
                db.session.add(Merchant(
                    id=row["id"],
                    name=row["name"],
                    created_at=parse_datetime(row["created_at"])
                ))

        # Users
        for row in cur.execute("SELECT * FROM user"):
            exists_by_id = User.query.get(row["id"]) is not None
            exists_by_username = User.query.filter_by(username=row["username"]).first() is not None
            if not exists_by_id and not exists_by_username:
                u = User(
                    id=row["id"],
                    username=row["username"],
                    password_hash=row["password_hash"],
                    last_login=parse_datetime(row["last_login"]),
                    current_merchant_id=row["current_merchant_id"],
                    is_admin=bool(row["is_admin"]) if row["is_admin"] is not None else False,
                )
                db.session.add(u)

        # Permissions
        for row in cur.execute("SELECT * FROM permission"):
            exists_by_id = Permission.query.get(row["id"]) is not None
            exists_by_name = Permission.query.filter_by(name=row["name"]).first() is not None
            if not exists_by_id and not exists_by_name:
                db.session.add(Permission(
                    id=row["id"],
                    name=row["name"],
                    description=row["description"],
                    created_at=parse_datetime(row["created_at"])
                ))

        # UserPermission
        for row in cur.execute("SELECT * FROM user_permission"):
            if not UserPermission.query.get(row["id"]):
                db.session.add(UserPermission(
                    id=row["id"],
                    user_id=row["user_id"],
                    permission_id=row["permission_id"],
                    created_at=parse_datetime(row["created_at"])
                ))

        # Products
        for row in cur.execute("SELECT * FROM product"):
            if not Product.query.get(row["id"]):
                db.session.add(Product(
                    id=row["id"],
                    name=row["name"],
                    category=row["category"],
                    supplier=row["supplier"],
                    unit=row["unit"],
                    merchant_id=row["merchant_id"],
                ))

        # Locations
        for row in cur.execute("SELECT * FROM location"):
            if not Location.query.get(row["id"]):
                db.session.add(Location(
                    id=row["id"],
                    name=row["name"],
                    description=row["description"],
                    merchant_id=row["merchant_id"],
                ))

        # Stock
        for row in cur.execute("SELECT * FROM stock"):
            if not Stock.query.get(row["id"]):
                db.session.add(Stock(
                    id=row["id"],
                    product_id=row["product_id"],
                    box_spec=row["box_spec"],
                    quantity=row["quantity"],
                    expiry_date=parse_date(row["expiry_date"]),
                    batch_number=row["batch_number"],
                    in_transit=row["in_transit"],
                    daily_consumption=row["daily_consumption"],
                    location=row["location"],
                    merchant_id=row["merchant_id"],
                    unit_price=row["unit_price"],
                    shenzhen_stock=row["shenzhen_stock"]
                ))

        # Records
        for row in cur.execute("SELECT * FROM record"):
            if not Record.query.get(row["id"]):
                db.session.add(Record(
                    id=row["id"],
                    product_id=row["product_id"],
                    operation_type=row["operation_type"],
                    quantity=row["quantity"],
                    date=parse_datetime(row["date"]),
                    additional_info=row["additional_info"],
                    merchant_id=row["merchant_id"],
                    operator_id=row["operator_id"]
                ))

        # Shenzhen Records
        for row in cur.execute("SELECT * FROM shenzhen_record"):
            if not ShenzhenRecord.query.get(row["id"]):
                db.session.add(ShenzhenRecord(
                    id=row["id"],
                    product_id=row["product_id"],
                    operation_type=row["operation_type"],
                    quantity=row["quantity"],
                    date=parse_datetime(row["date"]),
                    box_spec=row["box_spec"],
                    batch_number=row["batch_number"],
                    expiry_date=parse_date(row["expiry_date"]),
                    merchant_id=row["merchant_id"],
                    operator_id=row["operator_id"],
                ))

        db.session.commit()
        print("迁移完成：已将 SQLite 数据导入到 Neon")


if __name__ == "__main__":
    sqlite_path = os.environ.get("SQLITE_PATH", os.path.join(os.path.dirname(__file__), "..", "warehouse.db"))
    sqlite_path = os.path.abspath(sqlite_path)
    print("从 SQLite 导入:", sqlite_path)
    migrate(sqlite_path)