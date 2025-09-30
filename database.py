import uuid
from app import db, app
from app import Product, Stock, Record, User, Location, Merchant, Permission, UserPermission
from datetime import date
import yaml
from pathlib import Path


def load_initial_data():
    config_path = Path('config/initial_data.yaml')
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f)
    return None


def init_db():
    with app.app_context():
        db.create_all()

        # 初始化默认商户
        default_merchant = Merchant.query.filter_by(name="LemonBox").first()
        if not default_merchant:
            default_merchant = Merchant(name="LemonBox")
            db.session.add(default_merchant)
            db.session.flush()  # 获取商户ID

        # 初始化权限
        permissions = {
            'product_manage': '产品管理权限',
            'incoming_operate': '入库操作权限',
            'outgoing_operate': '出库操作权限',
            'stock_view': '库存查看权限',
            'records_view': '出入库记录查看权限',
            'user_manage': '用户管理权限',
            'location_query': '库位查询权限',  # 新增库位查询权限
        
        }

        for perm_name, perm_desc in permissions.items():
            if not Permission.query.filter_by(name=perm_name).first():
                permission = Permission(name=perm_name, description=perm_desc)
                db.session.add(permission)

        db.session.flush()  # 确保权限ID已生成

        initial_data = load_initial_data()
        if not initial_data:
            # 使用默认数据
            initial_data = {
                'product': {
                    'id': str(uuid.uuid4()),
                    'name': '产品1',
                    'category': '类别1',
                    'supplier': '供应商1',
                    'unit': '个'
                }
            }

        try:
            # 初始化产品
            product = Product(**initial_data['product'])
            product.merchant_id = default_merchant.id
            db.session.add(product)

            # 初始化库存
            stock = Stock(
                product_id=product.id,
                box_spec='10个/箱',
                quantity=100,
                batch_number='INIT20240101',  # 添加批次号
                expiry_date=date(2024, 12, 31),
                location='A1',
                merchant_id=default_merchant.id,
                unit_price=0.0  # 初始化单价为0.0或其他默认值
            )
            db.session.add(stock)

            # 初始化用户
            for username, password in [('test', 'test'), ('admin', 'admin123')]:
                user = User.query.filter_by(username=username).first()
                if not user:
                    user = User(username=username)
                    user.set_password(password)
                    user.current_merchant_id = default_merchant.id
                    # 设置admin和test为管理员
                    if username in ['admin', 'test']:
                        user.is_admin = True
                    db.session.add(user)
                    db.session.flush()  # 获取用户ID

                    # 为test用户分配所有权限
                    if username == 'test':
                        for permission in Permission.query.all():
                            user_permission = UserPermission(
                                user_id=user.id,
                                permission_id=permission.id
                            )
                            db.session.add(user_permission)

            db.session.commit()
            print("数据库初始化完成！")

        except Exception as e:
            db.session.rollback()
            print(f"数据库操作出错: {e}")


if __name__ == "__main__":
    init_db()