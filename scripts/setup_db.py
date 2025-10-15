import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app import app
from extensions import db
from init_seeds import seed_defaults, ensure_admin_password_compat as ensure_admin_password_compat_seed


def main():
    print("使用数据库:", os.environ.get("DATABASE_URL", "sqlite (默认)"))
    with app.app_context():
        print("创建数据表……")
        db.create_all()
        print("初始化默认权限和管理员……")
        seed_defaults()
        print("检查管理员密码兼容……")
        ensure_admin_password_compat_seed()
        print("完成初始化")


if __name__ == "__main__":
    main()