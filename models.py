from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db


class Merchant(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class Product(db.Model):
    id = db.Column(db.String(20), primary_key=True)
    name = db.Column(db.String(100))
    category = db.Column(db.String(50))
    supplier = db.Column(db.String(100))
    unit = db.Column(db.String(10))
    merchant_id = db.Column(db.Integer, db.ForeignKey('merchant.id'), nullable=False)


class Stock(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.String(20), db.ForeignKey('product.id'))
    box_spec = db.Column(db.String(50))
    quantity = db.Column(db.Integer)
    expiry_date = db.Column(db.Date)
    batch_number = db.Column(db.String(50))
    in_transit = db.Column(db.Integer)
    daily_consumption = db.Column(db.Float)
    location = db.Column(db.String(20))
    merchant_id = db.Column(db.Integer, db.ForeignKey('merchant.id'), nullable=False)
    unit_price = db.Column(db.Float)
    shenzhen_stock = db.Column(db.Integer, default=0)


class Record(db.Model):
    id = db.Column(db.String(20), primary_key=True)
    product_id = db.Column(db.String(20))
    operation_type = db.Column(db.String(10))
    quantity = db.Column(db.Integer)
    date = db.Column(db.DateTime, default=datetime.now)
    additional_info = db.Column(db.String(200))
    merchant_id = db.Column(db.Integer, db.ForeignKey('merchant.id'), nullable=False)
    operator_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    operator = db.relationship('User', backref='records', lazy=True)


class ShenzhenRecord(db.Model):
    id = db.Column(db.String(20), primary_key=True)
    product_id = db.Column(db.String(20))
    operation_type = db.Column(db.String(10))  # 入库/出库/调拨
    quantity = db.Column(db.Integer)
    date = db.Column(db.DateTime, default=datetime.now)
    box_spec = db.Column(db.String(50))
    batch_number = db.Column(db.String(50))
    expiry_date = db.Column(db.Date)
    merchant_id = db.Column(db.Integer, db.ForeignKey('merchant.id'), nullable=False)
    operator_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    operator = db.relationship('User', backref='shenzhen_records', lazy=True)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    last_login = db.Column(db.DateTime)
    current_merchant_id = db.Column(db.Integer, db.ForeignKey('merchant.id'), nullable=True)
    is_admin = db.Column(db.Boolean, default=False)

    permissions = db.relationship('UserPermission', backref='user', lazy='dynamic')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def is_authenticated(self):
        return True

    def is_active(self):
        return True

    def is_anonymous(self):
        return False

    def get_id(self):
        return str(self.id)

    def has_permission(self, permission_name):
        permission = Permission.query.filter_by(name=permission_name).first()
        if not permission:
            return False
        user_permission = UserPermission.query.filter_by(
            user_id=self.id,
            permission_id=permission.id
        ).first()
        return user_permission is not None


class Location(db.Model):
    id = db.Column(db.String(20), primary_key=True)
    name = db.Column(db.String(100))
    description = db.Column(db.String(200))
    merchant_id = db.Column(db.Integer, db.ForeignKey('merchant.id'), nullable=False)


class Permission(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.now)

    users = db.relationship('UserPermission', backref='permission', lazy='dynamic')


class UserPermission(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    permission_id = db.Column(db.Integer, db.ForeignKey('permission.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now)

    __table_args__ = (db.UniqueConstraint('user_id', 'permission_id', name='unique_user_permission'),)
