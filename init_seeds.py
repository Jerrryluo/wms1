from extensions import db
from models import Permission, User
from constants import DEFAULT_USERNAME, DEFAULT_PASSWORD


def ensure_admin_password_compat():
    """如果管理员密码使用 scrypt，则迁移为默认密码的 pbkdf2 哈希。"""
    try:
        admin = User.query.filter_by(username=DEFAULT_USERNAME).first()
        if admin and isinstance(admin.password_hash, str) and admin.password_hash.startswith('scrypt:'):
            admin.set_password(DEFAULT_PASSWORD)
            db.session.commit()
            print('管理员密码哈希已迁移为 pbkdf2:sha256')
    except Exception as e:
        db.session.rollback()
        print(f'管理员密码兼容处理失败: {e}')


def seed_defaults():
    """初始化默认权限和管理员账户"""
    default_permissions = [
        {"name": "product_manage", "description": "产品管理权限"},
        {"name": "incoming_operate", "description": "入库操作权限"},
        {"name": "outgoing_operate", "description": "出库操作权限"},
        {"name": "records_view", "description": "查看出入库记录权限"},
        {"name": "stock_view", "description": "查看库存权限"},
        {"name": "user_manage", "description": "用户管理权限"},
        {"name": "location_query", "description": "库位查询权限"},
        {"name": "record_edit", "description": "修改记录权限"}
    ]

    for perm_data in default_permissions:
        perm = Permission.query.filter_by(name=perm_data["name"]).first()
        if not perm:
            perm = Permission(name=perm_data["name"], description=perm_data["description"])
            db.session.add(perm)
            print(f"创建权限: {perm_data['name']}")

    admin = User.query.filter_by(username=DEFAULT_USERNAME).first()
    if not admin:
        admin = User(username=DEFAULT_USERNAME, is_admin=True)
        admin.set_password(DEFAULT_PASSWORD)
        db.session.add(admin)
        print(f"创建管理员账户: {DEFAULT_USERNAME}")

    db.session.commit()
    print("系统初始化完成")