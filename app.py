# 导入所需的Flask框架组件和其他Python库，用于构建Web应用程序和处理数据库操作
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, Response
from flask_login import login_required, login_user, logout_user, current_user
from datetime import datetime, timedelta
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
import os
import re
from openpyxl import Workbook
from extensions import db, login_manager
from utils import generate_unique_id
from constants import (
    DEFAULT_USERNAME,
    DEFAULT_PASSWORD,
    SUPPLEMENT_STOCKOUT_DAYS_THRESHOLD,
    PACKAGING_STOCKOUT_DAYS_THRESHOLD,
    SUPPLEMENT_EXPIRY_DAYS_THRESHOLD,
)
from init_seeds import seed_defaults, ensure_admin_password_compat as ensure_admin_password_compat_seed
from models import Merchant, Product, Stock, Record, User, Location, Permission, UserPermission, ShenzhenRecord

# 配置类定义
class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or os.urandom(24)
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///' + os.path.join(os.path.abspath(os.path.dirname(__file__)), 'warehouse.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    PERMANENT_SESSION_LIFETIME = timedelta(hours=1)

# Move the permission_required decorator to the top of the file
def permission_required(permission_name):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # 取消权限检查的强制性，只返回原始函数
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# 初始化Flask应用并配置SQLite数据库连接，设置会话安全密钥和过期时间
app = Flask(__name__)
app.config.from_object(Config)
db.init_app(app)

# 添加请求处理前钩子，确保不会延长登录有效期
@app.before_request
def before_request():
    if request.endpoint != 'check_session' and 'login_time' in session:
        # 对check_session以外的请求，只检查是否过期，但不更新时间戳
        login_time = datetime.fromisoformat(session['login_time'])
        if datetime.now() - login_time > timedelta(hours=1):
            session.clear()
            logout_user()
            if request.path.startswith('/api/'):
                # 如果是API请求，返回JSON响应
                return jsonify({'success': False, 'expired': True, 'message': '会话已过期'}), 401
            else:
                # 如果是普通请求，重定向到登录页
                return redirect(url_for('login'))

# 错误处理函数
@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# 兼容前端开发环境的占位路由，避免浏览器请求 /@vite/client 报 404
@app.route('/@vite/client')
def vite_client_stub():
    # 返回一个空的 JS 模块，防止控制台出现 404 错误
    return Response("// Vite client stub for Flask app\nexport const hot = undefined;", mimetype='application/javascript')

# 文件名安全处理，避免非法字符导致保存失败
def sanitize_filename(text: str) -> str:
    if not isinstance(text, str):
        return 'unknown'
    # 替换不可用于文件名的字符为下划线
    safe = re.sub(r'[\\/:*?"<>|]', '_', text)
    # 去除首尾空白
    return safe.strip() or 'unknown'

# 初始化Flask-Login
login_manager.init_app(app)
login_manager.login_view = 'login'  # 设置登录视图的端点

# 默认管理员账户信息从 constants 模块导入

# 生成唯一ID的工具函数，使用时间戳和微秒确保ID的唯一性，用于各种记录的主键生成
def generateUniqueId():
    now = datetime.now()
    return now.strftime('%Y%m%d%H%M%S%f')[:20]  # 使用微秒确保唯一性


# 用户加载函数，用于Flask-Login从会话中恢复用户
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# 模型从 models.py 导入，避免重复定义导致的表重复问题


def ensure_admin_password_compat():
    """如果管理员密码使用 scrypt，则迁移为默认密码的 pbkdf2 哈希。
    解决某些 Python 环境缺少 hashlib.scrypt 导致无法登录的问题。
    """
    try:
        admin = User.query.filter_by(username=DEFAULT_USERNAME).first()
        if admin and isinstance(admin.password_hash, str) and admin.password_hash.startswith('scrypt:'):
            admin.set_password(DEFAULT_PASSWORD)
            db.session.commit()
            print('管理员密码哈希已迁移为 pbkdf2:sha256')
    except Exception as e:
        db.session.rollback()
        print(f'管理员密码兼容处理失败: {e}')

# 登录路由处理，验证用户身份并创建会话
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.json
        user = User.query.filter_by(username=data.get('username')).first()

        if user and user.check_password(data.get('password')):
            login_user(user)
            
            user.last_login = datetime.now()
            # 记录登录时间，用于强制登出计算
            session['login_time'] = datetime.now().isoformat()
            session['last_activity'] = datetime.now().isoformat()
            db.session.commit()
            
            # 检查当前商户今天是否已保存Excel文件
            if user.current_merchant_id:
                check_and_export_excel(user.current_merchant_id)
            
            return jsonify({'success': True, 'message': '登录成功'})

        return jsonify({'success': False, 'message': '用户名或密码错误'}), 401

    return render_template('login.html')

# 登出路由处理，清除用户会话
@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# 主页路由处理，重定向到入库操作页面
@app.route('/')
@login_required
def index():
    return redirect(url_for('dashboard_view'))

# 产品管理页面
@app.route('/products')
@login_required
def product_management():
    return render_template('products.html')

# 入库操作页面
@app.route('/incoming')
@login_required
def incoming_operation():
    return render_template('incoming.html')

# 出库操作页面
@app.route('/outgoing')
@login_required
def outgoing_operation():
    return render_template('outgoing.html')

# 出入库记录页面
@app.route('/records')
@login_required
def records_view():
    return render_template('records.html')

# 库存页面
@app.route('/stock')
@login_required
def stock_view():
    return render_template('stock.html')

# 库位查询页面
@app.route('/location')
@login_required
def location_query():
    return render_template('location.html')

# 仪表盘页面
@app.route('/dashboard')
@login_required
def dashboard_view():
    return render_template('dashboard.html')


# 用户管理页面
@app.route('/users')
@login_required
def user_management():
    return render_template('users.html')

# 商户管理页面
@app.route('/merchants')
@login_required
def merchant_management():
    return render_template('merchants.html')

# 直接库存移位：不记录到出入库记录，仅调整库存行位置与数量
@app.route('/api/stock/relocate', methods=['POST'])
@login_required
def relocate_stock():
    data = request.json
    try:
        # 基本参数
        product_id = data.get('product_id')
        box_spec = data.get('box_spec')
        quantity = int(data.get('quantity', 0))
        # 兼容前端字段命名：from_location/to_location
        old_location = data.get('old_location') or data.get('from_location')
        new_location = data.get('new_location') or data.get('to_location')
        batch_number = data.get('batch_number') or None
        expiry_date_str = data.get('expiry_date')
        expiry_date = None
        if expiry_date_str:
            try:
                expiry_date = datetime.strptime(expiry_date_str, '%Y-%m-%d').date()
            except Exception:
                expiry_date = None

        if not product_id or not box_spec or not old_location or not new_location or quantity <= 0:
            return jsonify({'success': False, 'message': '参数不完整或数量不合法'}), 400

        if old_location == new_location:
            return jsonify({'success': False, 'message': '新库位不能与原库位相同'}), 400

        # 查找原位置库存（限定当前商户，匹配批次/过期日期）
        stock_from = Stock.query.filter(
            Stock.product_id == product_id,
            Stock.box_spec == box_spec,
            Stock.merchant_id == current_user.current_merchant_id,
            Stock.location == old_location,
            Stock.batch_number == batch_number,
            Stock.expiry_date == expiry_date,
            Stock.quantity > 0
        ).first()

        if not stock_from:
            return jsonify({'success': False, 'message': '未找到原库位库存或库存为0'}), 404

        if stock_from.quantity < quantity:
            return jsonify({'success': False, 'message': '移位数量不能大于库存数量'}), 400

        # 扣减原位置库存
        stock_from.quantity -= quantity

        # 目标位置库存（同产品/规格/批次/过期）
        stock_to = Stock.query.filter(
            Stock.product_id == product_id,
            Stock.box_spec == box_spec,
            Stock.merchant_id == current_user.current_merchant_id,
            Stock.location == new_location,
            Stock.batch_number == batch_number,
            Stock.expiry_date == expiry_date
        ).first()

        if stock_to:
            stock_to.quantity = (stock_to.quantity or 0) + quantity
        else:
            # 创建新库存行
            stock_to = Stock(
                product_id=product_id,
                box_spec=box_spec,
                quantity=quantity,
                batch_number=batch_number,
                expiry_date=expiry_date,
                in_transit=stock_from.in_transit,
                daily_consumption=stock_from.daily_consumption,
                location=new_location,
                merchant_id=current_user.current_merchant_id,
                unit_price=stock_from.unit_price,
                shenzhen_stock=0
            )
            db.session.add(stock_to)

        db.session.commit()
        return jsonify({'success': True, 'message': '移位成功'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'移位失败: {str(e)}'}), 500

# 商户管理API接口，获取所有商户列表
@app.route('/api/merchants', methods=['GET', 'POST'])
@login_required
def handle_merchants():
    if request.method == 'GET':
        merchants = Merchant.query.all()
        return jsonify([merchant.to_dict() for merchant in merchants])
    elif request.method == 'POST':
        data = request.json
        try:
            # 检查商户名是否已存在
            if Merchant.query.filter_by(name=data['name']).first():
                return jsonify({'success': False, 'message': '商户名已存在'}), 400

            new_merchant = Merchant(name=data['name'])
            db.session.add(new_merchant)
            db.session.commit()
            return jsonify({'success': True, 'message': '商户添加成功', 'merchant': new_merchant.to_dict()}), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'message': f'添加商户失败: {str(e)}'}), 500

@app.route('/api/merchants/<int:merchant_id>', methods=['DELETE'])
@login_required
def delete_merchant(merchant_id):
    try:
        merchant = Merchant.query.get(merchant_id)
        if not merchant:
            return jsonify({'success': False, 'message': '商户不存在'}), 404

        # 不允许删除当前正在使用的商户
        if current_user.current_merchant_id == merchant_id:
            return jsonify({'success': False, 'message': '不能删除当前使用的商户'}), 400

        # 删除该商户的所有相关数据
        Stock.query.filter_by(merchant_id=merchant_id).delete()
        Record.query.filter_by(merchant_id=merchant_id).delete()
        Product.query.filter_by(merchant_id=merchant_id).delete()

        # 删除商户
        db.session.delete(merchant)
        db.session.commit()

        return jsonify({'success': True, 'message': '商户删除成功'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'删除商户失败: {str(e)}'}), 500

# 切换当前用户的商户
@app.route('/api/merchants/switch', methods=['POST'])
@login_required
def switch_merchant():
    data = request.json
    try:
        merchant_id = data.get('merchant_id')
        merchant = Merchant.query.get(merchant_id)

        if not merchant:
            return jsonify({'success': False, 'message': '商户不存在'}), 404

        # 更新用户当前商户
        current_user.current_merchant_id = merchant_id
        db.session.commit()

        # 检查切换到的商户今天是否已保存Excel文件
        check_and_export_excel(merchant_id)

        return jsonify({'success': True, 'message': f'已切换到商户: {merchant.name}'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'切换商户失败: {str(e)}'}), 500

# 获取当前用户的商户信息
@app.route('/api/merchants/current', methods=['GET'])
@login_required
def get_current_merchant():
    if current_user.current_merchant_id:
        merchant = Merchant.query.get(current_user.current_merchant_id)
        if merchant:
            return jsonify({'success': True, 'merchant': merchant.to_dict()})

    # 如果用户没有当前商户，尝试设置默认商户
    default_merchant = Merchant.query.first()
    if default_merchant:
        current_user.current_merchant_id = default_merchant.id
        db.session.commit()
        # 首次为用户设定默认商户后，触发当日归档（仅当日未生成时会生成）
        try:
            check_and_export_excel(default_merchant.id)
        except Exception as e:
            print(f"设置默认商户后触发归档失败: {e}")
        return jsonify({'success': True, 'merchant': default_merchant.to_dict()})

    return jsonify({'success': False, 'message': '未找到商户信息'}), 404

# 入库操作路由处理，接收入库请求并更新库存记录，同时创建操作日志
@app.route('/api/incoming', methods=['POST'])
@login_required
def handle_incoming():
    try:
        data = request.json
        
        # 详细的请求数据验证和日志记录
        print(f"接收到入库请求: {data}")
        
        # 验证必填字段
        required_fields = ('product_id', 'box_spec', 'quantity', 'batch_number', 'incoming_reason', 'expiry_date', 'location')
        if not all(key in data for key in required_fields):
            missing_fields = [field for field in required_fields if field not in data]
            error_msg = f"缺少必要的字段: {', '.join(missing_fields)}"
            print(error_msg)
            return jsonify({'message': error_msg}), 400

        # 确保商户ID有效
        if not current_user.current_merchant_id:
            print("用户没有当前商户ID")
            return jsonify({'message': '请先选择商户'}), 400

        # 验证产品存在
        product = Product.query.filter_by(id=data['product_id'], merchant_id=current_user.current_merchant_id).first()
        if not product:
            print(f"产品不存在: {data['product_id']}")
            return jsonify({'message': '产品不存在'}), 404

        # 验证并解析过期日期
        try:
            expiry_date = datetime.strptime(data['expiry_date'], '%Y-%m-%d').date()
        except ValueError as e:
            print(f"日期格式错误: {data['expiry_date']}, 错误: {e}")
            return jsonify({'message': f'日期格式无效: {str(e)}'}), 400

        # 验证数量是否为有效的整数
        try:
            quantity = int(data['quantity'])
            if quantity <= 0:
                print(f"无效的数量值: {quantity}")
                return jsonify({'message': '数量必须大于0'}), 400
        except ValueError:
            print(f"数量不是有效的整数: {data['quantity']}")
            return jsonify({'message': '数量必须为有效的整数'}), 400
            
        # 检查是否在过去一分钟内有相同的入库记录（防止重复提交）
        one_minute_ago = datetime.now() - timedelta(minutes=1)
        recent_record = Record.query.filter(
            Record.product_id == data['product_id'],
            Record.operation_type == '入库',
            Record.quantity == quantity,
            Record.date >= one_minute_ago,
            Record.merchant_id == current_user.current_merchant_id
        ).first()
        
        if recent_record:
            print(f"检测到重复提交: 在过去一分钟内已有相同的入库记录 {recent_record.id}")
            return jsonify({'message': '您刚刚已经提交过相同的入库记录，请勿重复操作'}), 400

        try:
            operation_id = generate_unique_id()
            print(f"生成操作ID: {operation_id}")
            
            # 创建库存记录 - 直接添加到库存中
            new_stock = Stock(
                product_id=data['product_id'],
                box_spec=data['box_spec'],
                quantity=quantity,
                batch_number=data['batch_number'],
                expiry_date=expiry_date,
                location=data['location'],
                merchant_id=current_user.current_merchant_id,
                unit_price=data.get('unit_price', 0.0)  # 直接使用提供的单价
            )
            
            # 创建入库操作记录
            record_id = generate_unique_id()
            new_record = Record(
                id=record_id,
                product_id=data['product_id'],
                operation_type='入库',
                quantity=quantity,
                date=datetime.now(),
                additional_info=f"入库原因: {data['incoming_reason']}, 箱规格: {data['box_spec']}, 批次号: {data['batch_number']}, 保质期: {expiry_date.strftime('%Y-%m-%d') if expiry_date else '无'}, 库位: {data['location']}",
                merchant_id=current_user.current_merchant_id,
                operator_id=current_user.id
            )
            
            db.session.add(new_stock)
            db.session.add(new_record)
            db.session.commit()
            print(f"成功创建入库记录和库存: {record_id}")
            
            return jsonify({'message': '入库操作成功'}), 200
        
        except Exception as e:
            db.session.rollback()
            error_msg = f"数据库操作失败: {str(e)}"
            print(error_msg)
            return jsonify({'message': error_msg}), 500

    except Exception as e:
        db.session.rollback()
        error_msg = f"入库操作失败: {str(e)}"
        print(error_msg)
        return jsonify({'message': error_msg}), 500







# 产品管理
@app.route('/api/products', methods=['GET', 'POST'])
@login_required
def handle_products():
    if request.method == 'POST':
        data = request.json
        try:
            # 添加商户ID
            data['merchant_id'] = current_user.current_merchant_id
            new_product = Product(**data)
            db.session.add(new_product)
            db.session.commit()
            return jsonify({'message': '产品添加成功'}), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'message': '添加产品失败', 'error': str(e)}), 500
    else:
        # 只获取当前商户的产品
        products = Product.query.filter_by(merchant_id=current_user.current_merchant_id).all()
        return jsonify([{
            'id': p.id,
            'name': p.name,
            'category': p.category,
            'supplier': p.supplier
        } for p in products])

# 更新产品（仅管理员）：支持修改编号、品名、类别、供应商
@app.route('/api/products/<product_id>', methods=['PUT'])
@login_required
def update_product(product_id):
    if not current_user.is_admin:
        return jsonify({'success': False, 'message': '无权限'}), 403
    data = request.json or {}
    try:
        product = Product.query.get(product_id)
        if not product or product.merchant_id != current_user.current_merchant_id:
            return jsonify({'success': False, 'message': '产品不存在'}), 404

        new_id = data.get('id', product.id)
        new_name = data.get('name', product.name)
        new_category = data.get('category', product.category)
        new_supplier = data.get('supplier', product.supplier)

        # 若修改了编号，检查是否冲突
        if new_id != product.id:
            existing = Product.query.get(new_id)
            if existing:
                return jsonify({'success': False, 'message': '目标产品编号已存在'}), 400

            old_id = product.id
            product.id = new_id
            # 级联更新相关表（限当前商户）
            Stock.query.filter_by(product_id=old_id, merchant_id=product.merchant_id).update({'product_id': new_id})
            Record.query.filter_by(product_id=old_id, merchant_id=product.merchant_id).update({'product_id': new_id})
            ShenzhenRecord.query.filter_by(product_id=old_id, merchant_id=product.merchant_id).update({'product_id': new_id})

        # 更新其它字段
        product.name = new_name
        product.category = new_category
        product.supplier = new_supplier

        db.session.commit()
        return jsonify({'success': True, 'message': '产品更新成功', 'product': {
            'id': product.id,
            'name': product.name,
            'category': product.category,
            'supplier': product.supplier
        }}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

# 出库操作路由处理，验证库存并执行出库操作，更新库存记录和创建操作日志
@app.route('/api/outgoing', methods=['POST'])
@login_required
def handle_outgoing():
    data = request.json
    try:
        # 检查是否在过去一分钟内有相同的出库记录（防止重复提交）
        one_minute_ago = datetime.now() - timedelta(minutes=1)
        recent_record = Record.query.filter(
            Record.product_id == data['product_id'],
            Record.operation_type == '出库',
            Record.quantity == data['quantity'],
            Record.date >= one_minute_ago,
            Record.merchant_id == current_user.current_merchant_id
        ).first()
        
        if recent_record:
            print(f"检测到重复提交: 在过去一分钟内已有相同的出库记录 {recent_record.id}")
            return jsonify({
                'error': True,
                'message': '您刚刚已经提交过相同的出库记录，请勿重复操作'
            }), 400
            
        # 查找对应的库存记录，添加商户过滤，并确保库存数量大于0
        stock = Stock.query.filter(
            Stock.product_id == data['product_id'],
            Stock.box_spec == data['box_spec'],
            Stock.merchant_id == current_user.current_merchant_id,
            Stock.quantity > 0,
            # 添加批次号、库位和过期日期作为查询条件
            Stock.batch_number == (data['batch_number'] if 'batch_number' in data else None),
            Stock.location == (data['location'] if 'location' in data else None),
            Stock.expiry_date == (datetime.strptime(data['expiry_date'], '%Y-%m-%d').date() if 'expiry_date' in data and data['expiry_date'] else None)
        ).first()

        if not stock:
            return jsonify({
                'error': True,
                'message': '产品不存在或规格不匹配'
            }), 404

        if stock.quantity < data['quantity']:
            return jsonify({
                'error': True,
                'message': '库存不足'
            }), 400

        # 更新库存
        stock.quantity -= data['quantity']
        location = stock.location

        # 创建出库记录，包含出库原因和库存信息
        current_time = datetime.now()
        operation_id = generate_unique_id()

        # 不再处理或记录单价信息

        new_record = Record(
            id=operation_id,
            product_id=data['product_id'],
            operation_type='出库',
            quantity=data['quantity'],
            date=current_time,
            additional_info=f"出库原因: {data['outgoing_reason']}, 箱规格: {data['box_spec']}, 批次号: {stock.batch_number}, 过期日期: {stock.expiry_date.strftime('%Y-%m-%d') if stock.expiry_date else '无'}, 库位: {location}",
            merchant_id=current_user.current_merchant_id,
            operator_id=current_user.id  # 添加操作人ID
        )

        db.session.add(new_record)


        db.session.commit()

        return jsonify({
            'error': False,
            'message': '出库成功',
            'stock': {
                'product_id': data['product_id'],
                'quantity': stock.quantity,
                'batch_number': stock.batch_number,
                'expiry_date': stock.expiry_date.strftime('%Y-%m-%d') if stock.expiry_date else '无',
                'location': location
            },
            'record': {
                'id': operation_id,
                'product_id': data['product_id'],
                'operation_type': '出库',
                'quantity': data['quantity'],
                'date': current_time.isoformat(),
                'additional_info': f"出库原因: {data['outgoing_reason']}, 箱规格: {data['box_spec']}, 批次号: {stock.batch_number}, 过期日期: {stock.expiry_date.strftime('%Y-%m-%d') if stock.expiry_date else '无'}, 库位: {location}"
            }
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': True,
            'message': str(e)
        }), 500

# 库存查询路由处理，返回当前所有库存信息，包括产品详情和库存状态
@app.route('/api/stock', methods=['GET'])
@login_required
def get_stock():
    try:
        # 确保用户有当前商户
        if not current_user.current_merchant_id:
            return jsonify({'message': '请先选择商户'}), 400
            
        # 添加商户过滤，并排除深圳库位；统一过滤零库存
        stock = Stock.query.filter(
            Stock.merchant_id == current_user.current_merchant_id,
            Stock.quantity > 0,
            Stock.location.is_(None) | Stock.location.notin_(['Shenzhen', 'shenzhen'])
        ).all()
        
        result = []
        for s in stock:
            product = Product.query.filter_by(id=s.product_id, merchant_id=current_user.current_merchant_id).first()
            if product:
                result.append({
                    'id': s.id,
                    'product_id': s.product_id,
                    'name': product.name,
                    'category': product.category,
                    'supplier': product.supplier,
                    # 移除产品单位字段
                    'box_spec': s.box_spec,
                    'quantity': s.quantity,
                    'batch_number': s.batch_number,
                    'expiry_date': s.expiry_date.strftime('%Y-%m-%d') if s.expiry_date else None,
                    'in_transit': s.in_transit,
                    'daily_consumption': s.daily_consumption,
                    'location': s.location,
                    # 移除单价字段
                    'shenzhen_stock': s.shenzhen_stock or 0
                })
        return jsonify(result)
    except Exception as e:
        error_msg = f"获取库存信息失败: {str(e)}"
        print(error_msg)
        return jsonify({'message': error_msg}), 500

# 仪表盘聚合数据接口
@app.route('/api/dashboard', methods=['GET'])
@login_required
def dashboard_data():
    try:
        merchant_id = current_user.current_merchant_id
        if not merchant_id:
            return jsonify({'message': '请先选择商户'}), 400

        # 工具：解析规格中的每箱单位数（如 "24" 或 "24/箱"，默认1）
        def parse_units_per_box(spec):
            if not spec:
                return 1
            try:
                m = re.search(r"(\d+(?:\.\d+)?)", str(spec))
                return float(m.group(1)) if m else 1
            except Exception:
                return 1

        # 1) 库存概览（香港库存，不含深圳；统一过滤零库存）
        hk_stock_rows = Stock.query.filter(
            Stock.merchant_id == merchant_id,
            Stock.quantity > 0,
            Stock.location.is_(None) | Stock.location.notin_(['Shenzhen', 'shenzhen'])
        ).all()

        product_ids_in_stock = set()
        total_items = 0.0
        product_items_map = {}
        product_daily_map = {}
        for s in hk_stock_rows:
            product_ids_in_stock.add(s.product_id)
            units = parse_units_per_box(s.box_spec)
            items = units * (s.quantity or 0)
            total_items += items
            product_items_map[s.product_id] = product_items_map.get(s.product_id, 0.0) + items
            # 记录最大每日消耗值（若有）
            if s.daily_consumption is not None:
                prev = product_daily_map.get(s.product_id)
                product_daily_map[s.product_id] = max(prev or 0.0, float(s.daily_consumption))

        product_count = Product.query.filter_by(merchant_id=merchant_id).count()

        # 已移除旧的30天低库存预警逻辑

        # 新增：分类断货与过期提醒
        supplement_stockout_90 = []
        packaging_stockout_35 = []
        # 过期提醒需逐批次计算
        now = datetime.now()
        supplement_expiry_360 = []

        for pid, items in product_items_map.items():
            daily = product_daily_map.get(pid, 0.0)
            days_left = (items / daily) if daily and daily > 0 else None
            prod = Product.query.filter_by(id=pid, merchant_id=merchant_id).first()
            prod_name = prod.name if prod else ''
            prod_category = (prod.category or '') if prod else ''

            # 已移除旧的30天低库存列表

            # 分类断货提醒：补剂 90天
            if prod_category == '补剂' and days_left is not None and days_left <= float(SUPPLEMENT_STOCKOUT_DAYS_THRESHOLD):
                supplement_stockout_90.append({
                    'product_id': pid,
                    'name': prod_name,
                    'items': round(items, 2),
                    'daily_consumption': round(daily, 2),
                    'days_to_stockout': round(days_left, 2)
                })

            # 分类断货提醒：包装用耗材 35天
            if prod_category == '包装用耗材' and days_left is not None and days_left <= float(PACKAGING_STOCKOUT_DAYS_THRESHOLD):
                packaging_stockout_35.append({
                    'product_id': pid,
                    'name': prod_name,
                    'items': round(items, 2),
                    'daily_consumption': round(daily, 2),
                    'days_to_stockout': round(days_left, 2)
                })

        # 2) 入库/出库概览（按箱数统计）
        # 过期提醒：补剂 360天（逐批次，忽略库存为0的批次）
        for s in hk_stock_rows:
            prod = Product.query.filter_by(id=s.product_id, merchant_id=merchant_id).first()
            if not prod or (prod.category or '') != '补剂':
                continue
            # 只提醒仍有库存的批次
            if not s.quantity or s.quantity <= 0:
                continue
            if not s.expiry_date:
                continue
            try:
                days_to_expiry = (s.expiry_date - now.date()).days
            except Exception:
                continue
            if days_to_expiry <= int(SUPPLEMENT_EXPIRY_DAYS_THRESHOLD):
                units = parse_units_per_box(s.box_spec)
                items = units * (s.quantity or 0)
                supplement_expiry_360.append({
                    'product_id': s.product_id,
                    'name': prod.name or '',
                    'expiry_date': s.expiry_date.strftime('%Y-%m-%d'),
                    'days_to_expiry': days_to_expiry,
                    'boxes': s.quantity or 0,
                    'box_spec': s.box_spec,
                    'items': round(items, 2)
                })

        now = datetime.now()
        start_today = datetime(now.year, now.month, now.day)
        start_week = start_today - timedelta(days=6)
        start_month = start_today - timedelta(days=29)

        def sum_records(op_type, since):
            q = Record.query.filter(
                Record.merchant_id == merchant_id,
                Record.operation_type == op_type,
                Record.date >= since
            )
            return sum((r.quantity or 0) for r in q.all())

        incoming_today = sum_records('入库', start_today)
        incoming_week = sum_records('入库', start_week)
        incoming_month = sum_records('入库', start_month)

        outgoing_today = sum_records('出库', start_today)
        outgoing_week = sum_records('出库', start_week)
        outgoing_month = sum_records('出库', start_month)

        # 3) 产品表现（最近30天）
        start_30d = start_month
        outgoing_30d = db.session.query(Record).filter(
            Record.merchant_id == merchant_id,
            Record.operation_type == '出库',
            Record.date >= start_30d
        ).all()
        outgoing_by_product = {}
        for r in outgoing_30d:
            outgoing_by_product[r.product_id] = outgoing_by_product.get(r.product_id, 0) + (r.quantity or 0)

        # 最畅销 Top 5
        best_sellers = []
        for pid, qty in sorted(outgoing_by_product.items(), key=lambda x: x[1], reverse=True)[:5]:
            prod = Product.query.filter_by(id=pid, merchant_id=merchant_id).first()
            best_sellers.append({'product_id': pid, 'name': prod.name if prod else '', 'outgoing_boxes': qty})

        # 滞销（包含出库为0的产品），取最少的5个
        all_products = Product.query.filter_by(merchant_id=merchant_id).all()
        slow_movers_pool = []
        for p in all_products:
            slow_qty = outgoing_by_product.get(p.id, 0)
            slow_movers_pool.append({'product_id': p.id, 'name': p.name, 'outgoing_boxes': slow_qty})
        slow_movers = sorted(slow_movers_pool, key=lambda x: x['outgoing_boxes'])[:5]

        # 4) 库位利用率（按香港库存中出现的库位计算）
        locations = set()
        for s in hk_stock_rows:
            if s.location:
                locations.add(s.location)
        total_locations = len(locations)
        occupied_locations = len({s.location for s in hk_stock_rows if s.location})

        # 5) 深圳待调拨数量与滞留时间
        sz_rows = Stock.query.filter(
            Stock.merchant_id == merchant_id,
            Stock.location.in_(['Shenzhen', 'shenzhen']),
            Stock.quantity > 0
        ).all()
        pending_boxes = 0
        retention_days = []
        items_detail = []
        for s in sz_rows:
            units = parse_units_per_box(s.box_spec)
            boxes = (s.quantity or 0)
            items = units * boxes
            pending_boxes += boxes

            # 查找最近一次深圳入库记录以估算滞留天数
            rec = db.session.query(ShenzhenRecord).filter(
                ShenzhenRecord.merchant_id == merchant_id,
                ShenzhenRecord.product_id == s.product_id,
                ShenzhenRecord.operation_type == '入库',
                ShenzhenRecord.box_spec == s.box_spec,
                ShenzhenRecord.batch_number == s.batch_number,
                ShenzhenRecord.expiry_date == s.expiry_date
            ).order_by(ShenzhenRecord.date.desc()).first()

            days = None
            if rec and rec.date:
                days = (now - rec.date).days
                retention_days.append(days)

            prod = Product.query.filter_by(id=s.product_id, merchant_id=merchant_id).first()
            items_detail.append({
                'product_id': s.product_id,
                'name': (prod.name if prod else ''),
                'boxes': boxes,
                'items': round(items, 2),
                'days_since_inbound': days
            })

        avg_retention_days = (sum(retention_days) / len(retention_days)) if retention_days else None

        return jsonify({
            'stock': {
                'total_items': round(total_items, 2),
                'product_count': product_count
            },
            'alerts': {
                'thresholds': {
                    'supplement_stockout_days': SUPPLEMENT_STOCKOUT_DAYS_THRESHOLD,
                    'packaging_stockout_days': PACKAGING_STOCKOUT_DAYS_THRESHOLD,
                    'supplement_expiry_days': SUPPLEMENT_EXPIRY_DAYS_THRESHOLD
                },
                'supplement_stockout_90': supplement_stockout_90,
                'packaging_stockout_35': packaging_stockout_35,
                'supplement_expiry_360': supplement_expiry_360
            },
            'flow': {
                'incoming': {'today': incoming_today, 'week': incoming_week, 'month': incoming_month},
                'outgoing': {'today': outgoing_today, 'week': outgoing_week, 'month': outgoing_month}
            },
            'performance': {
                'best_sellers': best_sellers,
                'slow_movers': slow_movers
            },
            'location': {
                'total_locations': total_locations,
                'occupied_locations': occupied_locations
            },
            'shenzhen': {
                'pending_boxes': pending_boxes,
                'avg_retention_days': avg_retention_days,
                'items': items_detail
            }
        })
    except Exception as e:
        error_msg = f"获取仪表盘数据失败: {str(e)}"
        print(error_msg)
        return jsonify({'message': error_msg}), 500

# 获取出入库记录
@app.route('/api/records', methods=['GET'])
@login_required
def get_records():
    try:
        # 确保用户有当前商户
        if not current_user.current_merchant_id:
            return jsonify({'message': '请先选择商户'}), 400
            
        # 优化查询：使用JOIN一次性获取记录和产品信息，避免N+1查询问题
        records_with_products = db.session.query(Record, Product).join(
            Product, Record.product_id == Product.id
        ).filter(
            Record.merchant_id == current_user.current_merchant_id,
            Product.merchant_id == current_user.current_merchant_id
        ).order_by(Record.date.desc()).all()
        
        # 批量获取操作人信息，避免重复查询
        operator_ids = [r.operator_id for r, p in records_with_products if r.operator_id is not None]
        operators = {}
        if operator_ids:
            users = User.query.filter(User.id.in_(operator_ids)).all()
            operators = {user.id: user.username for user in users}
        
        result = []
        for r, product in records_with_products:
            try:
                # 转换为北京时间
                local_date = None
                if r.date:
                    beijing_time = r.date + timedelta(hours=8)
                    local_date = beijing_time.strftime('%Y-%m-%d %H:%M:%S')

                # 获取规格信息
                box_spec = '0'  # 默认值为0
                if r.additional_info and '箱规格: ' in r.additional_info:
                    box_spec = r.additional_info.split('箱规格: ')[1].split(',')[0]
                
                # 转换规格为数值
                box_spec_value = float(box_spec) if box_spec.isdigit() else 0

                # 获取数量信息
                quantity = r.quantity if r.quantity else 0

                # 计算总数
                total = quantity * box_spec_value

                # 移除单价信息处理

                # 修复过期日期显示问题，同时处理"保质期"和"过期日期"两种关键词
                expiry_date = '无'
                if r.additional_info:
                    if '保质期: ' in r.additional_info:
                        expiry_date = r.additional_info.split('保质期: ')[1].split(',')[0]
                    elif '过期日期: ' in r.additional_info:
                        expiry_date = r.additional_info.split('过期日期: ')[1].split(',')[0]

                # 提取操作原因，根据操作类型提取入库原因或出库原因
                reason = '无'
                if r.additional_info:
                    if r.operation_type == '入库' and '入库原因: ' in r.additional_info:
                        reason = r.additional_info.split('入库原因: ')[1].split(',')[0]
                    elif r.operation_type == '出库' and '出库原因: ' in r.additional_info:
                        reason = r.additional_info.split('出库原因: ')[1].split(',')[0]

                # 安全获取操作人信息，使用预先查询的operators字典
                operator_name = '未知'
                if r.operator_id is not None:
                    operator_name = operators.get(r.operator_id, '未知')

                # 安全获取库位信息
                location = '无'
                if r.additional_info and '库位: ' in r.additional_info:
                    location = r.additional_info.split('库位: ')[-1].split(',')[0]

                # 安全获取批次号
                batch_number = '无'
                if r.additional_info and '批次号: ' in r.additional_info:
                    batch_number = r.additional_info.split('批次号: ')[1].split(',')[0]

                result.append({
                    'id': r.id,
                    'product_id': r.product_id,
                    'product_name': product.name,
                    'operation_type': r.operation_type,
                    'quantity': quantity,
                    'date': local_date,
                    'reason': reason,
                    'location': location,
                    'box_spec': box_spec,
                    'batch_number': batch_number,
                    'expiry_date': expiry_date,
                    'operator': operator_name,
                    'total': total
                })
            except Exception as inner_e:
                print(f"处理记录 {r.id} 时出错: {str(inner_e)}")
                # 继续处理下一条记录，不中断

        return jsonify(result)
    except Exception as e:
        error_msg = f"获取操作记录失败: {str(e)}"
        print(error_msg)
        return jsonify({'message': error_msg}), 500

# 记录修改路由处理，支持修改记录的原因、数量和规格，并同步更新库存
@app.route('/api/records/update', methods=['POST'])
@login_required
def update_record():
    try:
        # 确保用户有管理员权限
        if not current_user.is_admin:
            return jsonify({'success': False, 'message': '只有管理员可以修改记录'}), 403
            
        data = request.json
        record_id = data.get('record_id')
        
        # 验证必填字段
        if not record_id:
            return jsonify({'success': False, 'message': '记录ID不能为空'}), 400
            
        # 查找记录
        record = Record.query.get(record_id)
        if not record:
            return jsonify({'success': False, 'message': '记录不存在'}), 404
            
        # 获取原始数据，用于计算差值
        old_quantity = record.quantity
        old_box_spec = 0
        old_reason = ''
        
        # 从additional_info中提取原始规格
        if '箱规格: ' in record.additional_info:
            old_box_spec_str = record.additional_info.split('箱规格: ')[1].split(',')[0]
            try:
                old_box_spec = float(old_box_spec_str)
            except ValueError:
                old_box_spec = 0
                
        # 从additional_info中提取原始原因
        if record.operation_type == '入库' and '入库原因: ' in record.additional_info:
            old_reason = record.additional_info.split('入库原因: ')[1].split(',')[0]
        elif record.operation_type == '出库' and '出库原因: ' in record.additional_info:
            old_reason = record.additional_info.split('出库原因: ')[1].split(',')[0]
            
        # 从additional_info中提取原始批次号
        old_batch_number = None
        if '批次号: ' in record.additional_info:
            old_batch_number = record.additional_info.split('批次号: ')[1].split(',')[0]
            
        # 从additional_info中提取原始过期日期
        old_expiry_date = None
        if '过期日期: ' in record.additional_info:
            old_expiry_date = record.additional_info.split('过期日期: ')[1].split(',')[0]
        
        # 获取新数据
        new_quantity = data.get('quantity', old_quantity)
        new_box_spec = data.get('box_spec', old_box_spec)
        new_reason = data.get('reason', old_reason)
        new_batch_number = data.get('batch_number', None)
        new_expiry_date = data.get('expiry_date', None)
        
        # 计算数量差值
        quantity_diff = new_quantity - old_quantity
        
        # 更新记录
        record.quantity = new_quantity
        
        # 更新additional_info中的规格、原因、批次号和过期日期
        additional_info = record.additional_info
        
        # 更新规格
        if '箱规格: ' in additional_info:
            additional_info = additional_info.replace(f'箱规格: {old_box_spec_str}', f'箱规格: {new_box_spec}')
        
        # 更新原因
        if record.operation_type == '入库' and '入库原因: ' in additional_info:
            additional_info = additional_info.replace(f'入库原因: {old_reason}', f'入库原因: {new_reason}')
        elif record.operation_type == '出库' and '出库原因: ' in additional_info:
            additional_info = additional_info.replace(f'出库原因: {old_reason}', f'出库原因: {new_reason}')
        
        # 更新批次号
        if new_batch_number and '批次号: ' in additional_info:
            additional_info = additional_info.replace(f'批次号: {old_batch_number}', f'批次号: {new_batch_number}')
        
        # 更新过期日期
        if new_expiry_date and '过期日期: ' in additional_info:
            additional_info = additional_info.replace(f'过期日期: {old_expiry_date}', f'过期日期: {new_expiry_date}')
        
        record.additional_info = additional_info
        
        # 同步更新库存
        # 提取库位和批次号信息
        location = None
        
        if '库位: ' in record.additional_info:
            location = record.additional_info.split('库位: ')[1].split(',')[0]
            
        # 使用原始批次号查找库存记录
        batch_number = old_batch_number
        
        # 根据操作类型更新库存
        if record.operation_type == '入库':
            # 查找对应的库存记录
            stock = Stock.query.filter_by(
                product_id=record.product_id,
                batch_number=batch_number,
                location=location,
                merchant_id=record.merchant_id,
                box_spec=str(old_box_spec_str)  # 使用原始规格
            ).first()
            
            if stock:
                # 更新库存数量
                stock.quantity += quantity_diff
                # 更新规格
                stock.box_spec = str(new_box_spec)
                # 更新批次号（如果有新的批次号）
                if new_batch_number:
                    stock.batch_number = new_batch_number
            else:
                # 如果找不到对应的库存记录，可能是因为规格变更，创建新记录
                return jsonify({'success': False, 'message': '找不到对应的库存记录，无法更新'}), 404
                
        elif record.operation_type == '出库':
            # 查找对应的库存记录
            stock = Stock.query.filter_by(
                product_id=record.product_id,
                batch_number=batch_number,
                location=location,
                merchant_id=record.merchant_id,
                box_spec=str(old_box_spec_str)  # 使用原始规格
            ).first()
            
            if stock:
                # 更新库存数量（出库是减少库存，所以这里是减去差值）
                stock.quantity -= quantity_diff
                # 检查库存是否足够
                if stock.quantity < 0:
                    return jsonify({'success': False, 'message': '库存不足，无法更新'}), 400
                # 更新批次号（如果有新的批次号）
                if new_batch_number:
                    stock.batch_number = new_batch_number
            else:
                return jsonify({'success': False, 'message': '找不到对应的库存记录，无法更新'}), 404
        
        # 提交更改
        db.session.commit()
        
        return jsonify({
            'success': True, 
            'message': '记录修改成功',
            'record': {
                'id': record.id,
                'product_id': record.product_id,
                'operation_type': record.operation_type,
                'quantity': record.quantity,
                'box_spec': new_box_spec,
                'reason': new_reason,
                'batch_number': new_batch_number or old_batch_number,
                'expiry_date': new_expiry_date or old_expiry_date
            }
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'修改记录失败: {str(e)}'}), 500
 
 # 记录删除路由处理，删除记录并同步更新库存
@app.route('/api/records/<record_id>', methods=['DELETE'])
@login_required
def delete_record_api(record_id):
     try:
         # 仅管理员可删除
         if not current_user.is_admin:
             return jsonify({'success': False, 'message': '只有管理员可以删除记录'}), 403
 
         # 校验商户上下文
         if not current_user.current_merchant_id:
             return jsonify({'success': False, 'message': '请先选择商户'}), 400
 
         record = Record.query.get(record_id)
         if not record:
             return jsonify({'success': False, 'message': '记录不存在'}), 404
 
         if record.merchant_id != current_user.current_merchant_id:
             return jsonify({'success': False, 'message': '记录不属于当前商户'}), 403
 
         # 从记录中解析规格、批次、过期和库位
         info = record.additional_info or ''
         box_spec = None
         batch_number = None
         expiry_date_str = None
         location = None
 
         if '箱规格: ' in info:
             try:
                 box_spec = info.split('箱规格: ')[1].split(',')[0]
             except Exception:
                 box_spec = None
         if '批次号: ' in info:
             try:
                 batch_number = info.split('批次号: ')[1].split(',')[0]
             except Exception:
                 batch_number = None
         if '过期日期: ' in info:
             try:
                 expiry_date_str = info.split('过期日期: ')[1].split(',')[0]
             except Exception:
                 expiry_date_str = None
         elif '保质期: ' in info:
             try:
                 expiry_date_str = info.split('保质期: ')[1].split(',')[0]
             except Exception:
                 expiry_date_str = None
         if '库位: ' in info:
             try:
                 location = info.split('库位: ')[1].split(',')[0]
             except Exception:
                 location = None
 
         # 规范化字段
         if batch_number in ['无', 'None', '']:
             batch_number = None
         if location in ['无', 'None', '']:
             location = None
         expiry_date = None
         if expiry_date_str and expiry_date_str not in ['无', 'None', '']:
             try:
                 expiry_date = datetime.strptime(expiry_date_str, '%Y-%m-%d').date()
             except Exception:
                 expiry_date = None
 
         # 查找对应库存
         query = Stock.query.filter(
             Stock.product_id == record.product_id,
             Stock.merchant_id == record.merchant_id
         )
         if box_spec is not None:
             query = query.filter(Stock.box_spec == str(box_spec))
         else:
             query = query.filter(Stock.box_spec.is_(None))
         if batch_number is not None:
             query = query.filter(Stock.batch_number == batch_number)
         else:
             query = query.filter(Stock.batch_number.is_(None))
         if location is not None:
             query = query.filter(Stock.location == location)
         else:
             query = query.filter(Stock.location.is_(None))
         if expiry_date is not None:
             query = query.filter(Stock.expiry_date == expiry_date)
         else:
             query = query.filter(Stock.expiry_date.is_(None))
 
         stock = query.first()
         qty = record.quantity or 0
 
         if record.operation_type == '入库':
             if not stock:
                 return jsonify({'success': False, 'message': '找不到对应的库存记录，无法删除'}), 404
             # 删除入库记录需回退库存
             if (stock.quantity or 0) < qty:
                 return jsonify({'success': False, 'message': '库存不足，无法删除该入库记录'}), 400
             stock.quantity = (stock.quantity or 0) - qty
         elif record.operation_type == '出库':
             # 删除出库记录需恢复库存
             if stock:
                 stock.quantity = (stock.quantity or 0) + qty
             else:
                 stock = Stock(
                     product_id=record.product_id,
                     box_spec=str(box_spec) if box_spec is not None else None,
                     quantity=qty,
                     batch_number=batch_number,
                     expiry_date=expiry_date,
                     location=location,
                     merchant_id=record.merchant_id
                 )
                 db.session.add(stock)
         else:
             return jsonify({'success': False, 'message': '不支持的记录类型'}), 400
 
         # 删除记录
         db.session.delete(record)
         db.session.commit()
 
         return jsonify({'success': True, 'message': '记录已删除'})
     except Exception as e:
         db.session.rollback()
         return jsonify({'success': False, 'message': f'删除记录失败: {str(e)}'}), 500
# 库存更新路由处理，支持更新在途数量、日常消耗量和深圳库存等信息
@app.route('/api/stock/update', methods=['POST'])
def update_stock():
    data = request.json
    try:
        stocks = Stock.query.filter_by(product_id=data['product_id']).all()
        if not stocks:
            return jsonify({'success': False, 'message': '未找到产品库存信息'}), 404

        # 检查是否有需要更新的字段
        has_updates = False
        
        # 更新每日消耗字段
        if 'daily_consumption' in data:
            daily_consumption = float(data['daily_consumption'])
            for stock in stocks:
                stock.daily_consumption = daily_consumption
            has_updates = True
            
        # 更新在途数量字段
        if 'in_transit' in data:
            in_transit = int(data['in_transit'])
            for stock in stocks:
                stock.in_transit = in_transit
            has_updates = True
            
        # 更新深圳库存字段
        if 'shenzhen_stock' in data:
            shenzhen_stock = int(data['shenzhen_stock'])
            for stock in stocks:
                stock.shenzhen_stock = shenzhen_stock
            has_updates = True

        if has_updates:
            db.session.commit()
            return jsonify({'success': True, 'message': '更新成功'})
        else:
            return jsonify({'success': False, 'message': '没有提供需要更新的数据'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

#会话检查装饰器，用于验证会话时效性，确保安全性，超时自动退出
@app.route('/api/check-session', methods=['GET'])
@login_required
def check_session():
    current_time = datetime.now()
    
    # 检查登录时间，强制1小时后登出
    if 'login_time' in session:
        login_time = datetime.fromisoformat(session['login_time'])
        # 如果登录时间超过1小时，则强制登出
        if current_time - login_time > timedelta(hours=1):
            session.clear()
            logout_user()
            return jsonify({
                'success': False,
                'expired': True,
                'message': '会话已过期'
            }), 401
    
    # 更新最后活动时间
    session['last_activity'] = current_time.isoformat()
    return jsonify({'success': True})

# 删除产品路由处理，级联删除相关的库存和记录信息
@app.route('/api/products/<product_id>', methods=['DELETE'])
def delete_product(product_id):
    try:
        # 删除相关的库存记录
        Stock.query.filter_by(product_id=product_id).delete()
        # 删除相关的操作记录
        Record.query.filter_by(product_id=product_id).delete()
        # 删除产品
        product = Product.query.get(product_id)
        if product:
            db.session.delete(product)
            db.session.commit()
            return jsonify({'success': True, 'message': '产品删除成功'})
        return jsonify({'success': False, 'message': '产品不存在'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

# 权限模型从 models.py 导入

# 用户管理API，获取所有用户列表
@app.route('/api/users', methods=['GET'])
@login_required
def get_users():
    users = User.query.all()
    result = []

    for user in users:
        # 获取用户权限
        user_permissions = []
        if user.is_admin:
            # 管理员拥有所有权限
            permissions = Permission.query.all()
            user_permissions = [{'id': p.id, 'name': p.name, 'description': p.description} for p in permissions]
        else:
            # 普通用户只有分配的权限
            user_permission_records = UserPermission.query.filter_by(user_id=user.id).all()
            for up in user_permission_records:
                permission = Permission.query.get(up.permission_id)
                if permission:
                    user_permissions.append({
                        'id': permission.id,
                        'name': permission.name,
                        'description': permission.description
                    })

        result.append({
            'id': user.id,
            'username': user.username,
            'is_admin': user.is_admin,
            'last_login': user.last_login.strftime('%Y-%m-%d %H:%M:%S') if user.last_login else None,
            'permissions': user_permissions
        })

    return jsonify(result)

# 获取所有可用权限
@app.route('/api/permissions', methods=['GET'])
@login_required
def get_permissions():
    permissions = Permission.query.all()
    return jsonify([{
        'id': p.id,
        'name': p.name,
        'description': p.description
    } for p in permissions])

# 创建新用户
@app.route('/api/users', methods=['POST'])
@login_required
def create_user():
    data = request.json

    # 验证必要字段
    if not all(key in data for key in ('username', 'password')):
        return jsonify({'message': '缺少必要的字段'}), 400

    # 检查用户名是否已存在
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'message': '用户名已存在'}), 400

    try:
        # 创建新用户
        new_user = User(username=data['username'])
        new_user.set_password(data['password'])
        new_user.is_admin = data.get('is_admin', False)
        new_user.current_merchant_id = current_user.current_merchant_id

        db.session.add(new_user)
        db.session.flush()  # 获取用户ID

        # 分配权限（容错：支持字符串/字典类型的权限ID）
        perm_ids = []
        if 'permissions' in data and isinstance(data['permissions'], list):
            for p in data['permissions']:
                try:
                    if isinstance(p, dict):
                        pid = int(p.get('id'))
                    else:
                        pid = int(p)
                    perm_ids.append(pid)
                except (TypeError, ValueError):
                    continue
        for pid in set(perm_ids):
            permission = Permission.query.get(pid)
            if permission:
                user_permission = UserPermission(
                    user_id=new_user.id,
                    permission_id=permission.id
                )
                db.session.add(user_permission)

        db.session.commit()
        return jsonify({'message': '用户创建成功', 'user_id': new_user.id}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'message': '创建用户失败', 'error': str(e)}), 500

# 删除用户
@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    # 不允许删除自己
    if current_user.id == user_id:
        return jsonify({'message': '不能删除当前登录用户'}), 400

    # 查找用户
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': '用户不存在'}), 404

    try:
        # 删除用户相关的权限记录
        UserPermission.query.filter_by(user_id=user_id).delete()
        
        # 删除用户
        db.session.delete(user)
        db.session.commit()
        return jsonify({'message': '用户删除成功'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': '删除用户失败', 'error': str(e)}), 500

# 更新用户权限
@app.route('/api/users/<int:user_id>/permissions', methods=['PUT'])
@login_required
def update_user_permissions(user_id):
    # 检查用户是否存在
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': '用户不存在'}), 404
    
    data = request.json
    
    # 验证数据格式
    if not isinstance(data.get('permissions'), list):
        return jsonify({'message': '权限数据格式不正确'}), 400
    
    try:
        # 先删除用户现有的所有权限
        UserPermission.query.filter_by(user_id=user_id).delete()
        
        # 分配新的权限（容错：支持字符串/字典类型的权限ID）
        perm_ids = []
        for p in data['permissions']:
            try:
                if isinstance(p, dict):
                    pid = int(p.get('id'))
                else:
                    pid = int(p)
                perm_ids.append(pid)
            except (TypeError, ValueError):
                continue
        for pid in set(perm_ids):
            permission = Permission.query.get(pid)
            if permission:
                user_permission = UserPermission(
                    user_id=user_id,
                    permission_id=permission.id
                )
                db.session.add(user_permission)
        
        # 更新管理员状态（如果提供了该字段）
        if 'is_admin' in data:
            is_admin_val = data['is_admin']
            if isinstance(is_admin_val, str):
                is_admin_val = is_admin_val.lower() in ('true', '1', 'yes')
            user.is_admin = bool(is_admin_val)
            
        db.session.commit()
        return jsonify({'message': '用户权限更新成功'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': '更新用户权限失败', 'error': str(e)}), 500

# 获取当前用户信息和权限
@app.route('/api/users/current', methods=['GET'])
@login_required
def get_current_user():
    # 获取当前用户权限
    user_permissions = []
    if current_user.is_admin:
        # 管理员拥有所有权限
        permissions = Permission.query.all()
        user_permissions = [p.name for p in permissions]
    else:
        # 普通用户只有分配的权限
        user_permission_records = UserPermission.query.filter_by(user_id=current_user.id).all()
        for up in user_permission_records:
            permission = Permission.query.get(up.permission_id)
            if permission:
                user_permissions.append(permission.name)

    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'is_admin': current_user.is_admin,
        'permissions': user_permissions
    })

# 获取所有商户库存的API路由
@app.route('/api/all-merchants-stock', methods=['GET'])
@login_required
def get_all_merchants_stock():
    try:
        # 获取所有商户信息
        merchants = Merchant.query.all()
        
        result = []
        for merchant in merchants:
            # 获取该商户的库存信息（统一过滤零库存，不含深圳）
            stock_items = Stock.query.filter(
                Stock.merchant_id == merchant.id,
                Stock.quantity > 0,
                Stock.location.is_(None) | Stock.location.notin_(['Shenzhen', 'shenzhen'])
            ).all()
            
            for item in stock_items:
                product = Product.query.get(item.product_id)
                if product:
                    result.append({
                        'id': item.id,
                        'merchant_id': merchant.id,
                        'merchant_name': merchant.name,
                        'product_id': item.product_id,
                        'name': product.name,
                        'category': product.category,
                        'supplier': product.supplier,
                        'unit': product.unit,
                        'box_spec': item.box_spec,
                        'quantity': item.quantity,
                        'batch_number': item.batch_number,
                        'expiry_date': item.expiry_date.strftime('%Y-%m-%d') if item.expiry_date else None,
                        'in_transit': item.in_transit,
                        'daily_consumption': item.daily_consumption,
                        'location': item.location,
                        'unit_price': item.unit_price,
                        'shenzhen_stock': item.shenzhen_stock
                    })
        
        # 按商户ID排序
        result.sort(key=lambda x: x['merchant_id'])
        
        return jsonify(result)
    except Exception as e:
        error_msg = f"获取所有商户库存信息失败: {str(e)}"
        print(error_msg)
        return jsonify({'message': error_msg}), 500

# 检查并导出Excel文件的函数
def check_and_export_excel(merchant_id):
    """检查今天是否已经为该商户保存过Excel文件，如果没有则生成"""
    try:
        # 在无持久化文件系统的环境（如 Vercel）默认禁用归档导出
        if os.environ.get('ENABLE_ARCHIVE_EXPORT', 'false').lower() != 'true':
            print('归档导出已禁用（设置 ENABLE_ARCHIVE_EXPORT=true 可启用）')
            return
        # 获取商户名称
        merchant = Merchant.query.get(merchant_id)
        if not merchant:
            return
        
        # 确保导出目录存在（固定到项目根目录）
        base_dir = os.path.abspath(os.path.dirname(__file__))
        archive_dir = os.path.join(base_dir, 'Archive')
        os.makedirs(archive_dir, exist_ok=True)

        # 生成今天的文件名
        today_str = datetime.now().strftime('%Y%m%d')
        safe_name = sanitize_filename(merchant.name)
        stock_filename = os.path.join(archive_dir, f"{safe_name}_{today_str}_库存.xlsx")
        records_filename = os.path.join(archive_dir, f"{safe_name}_{today_str}_出入库记录.xlsx")
        
        # 检查文件是否已存在
        stock_exists = os.path.exists(stock_filename)
        records_exists = os.path.exists(records_filename)
        
        # 如果文件不存在，则生成
        if not stock_exists:
            export_stock_to_excel(merchant_id)
            print(f"已为商户 {merchant.name} 生成今日库存Excel文件")
        else:
            print(f"商户 {merchant.name} 今日库存Excel文件已存在，跳过生成")
            
        if not records_exists:
            export_records_to_excel(merchant_id)
            print(f"已为商户 {merchant.name} 生成今日出入库记录Excel文件")
        else:
            print(f"商户 {merchant.name} 今日出入库记录Excel文件已存在，跳过生成")
            
    except Exception as e:
        print(f"检查或生成Excel文件时出错: {e}")

# 添加导出库存到Excel的函数
def export_stock_to_excel(merchant_id):
    # 在无持久化文件系统的环境（如 Vercel）默认禁用归档导出
    if os.environ.get('ENABLE_ARCHIVE_EXPORT', 'false').lower() != 'true':
        return
    # 获取商户名称
    merchant = Merchant.query.get(merchant_id)
    if not merchant:
        return

    # 获取库存信息（统一过滤零库存）
    stock_items = Stock.query.filter(
        Stock.merchant_id == merchant_id,
        Stock.quantity > 0
    ).all()
    # 确保导出目录存在（固定到项目根目录）
    base_dir = os.path.abspath(os.path.dirname(__file__))
    archive_dir = os.path.join(base_dir, 'Archive')
    os.makedirs(archive_dir, exist_ok=True)
    # 生成文件名（清理商户名）
    safe_name = sanitize_filename(merchant.name)
    filename = os.path.join(archive_dir, f"{safe_name}_{datetime.now().strftime('%Y%m%d')}_库存.xlsx")

    # 创建Excel文件
    wb = Workbook()
    ws = wb.active
    ws.title = "库存"

    # 添加表头（不包含产品单位与单价）
    headers = ['产品编号', '品名', '产品类别', '供应商', '香港库存', '深圳库存', '在途数量', '每日消耗', '规格', '箱数', '批次号', '过期日期', '库位']
    ws.append(headers)

    # 添加库存数据
    for item in stock_items:
        product = Product.query.get(item.product_id)
        # 获取规格信息
        box_spec_info = item.box_spec  # 假设箱规格信息在这里
        box_quantity = item.quantity  # 假设库存数量在这里
        expiry_date = item.expiry_date.strftime('%Y-%m-%d') if item.expiry_date else '无'
        location = item.location if item.location else '无'
        # 不输出单价

        ws.append([
            item.product_id,
            product.name if product else '未知',
            product.category if product else '未知',
            product.supplier if product else '未知',
            item.quantity,  # 香港库存
            item.shenzhen_stock,  # 深圳库存
            item.in_transit,  # 在途数量
            item.daily_consumption,  # 每日消耗
            box_spec_info,  # 规格
            box_quantity,  # 箱数
            item.batch_number,  # 批次号
            expiry_date,  # 过期日期
            location  # 库位
        ])

    # 保存文件
    wb.save(filename)

# 添加导出记录到Excel的函数
def export_records_to_excel(merchant_id):
    # 在无持久化文件系统的环境（如 Vercel）默认禁用归档导出
    if os.environ.get('ENABLE_ARCHIVE_EXPORT', 'false').lower() != 'true':
        return
    # 获取商户名称
    merchant = Merchant.query.get(merchant_id)
    if not merchant:
        return

    # 获取出入库记录
    records = Record.query.filter_by(merchant_id=merchant_id).all()
    # 确保导出目录存在（固定到项目根目录）
    base_dir = os.path.abspath(os.path.dirname(__file__))
    archive_dir = os.path.join(base_dir, 'Archive')
    os.makedirs(archive_dir, exist_ok=True)
    # 生成文件名（清理商户名）
    safe_name = sanitize_filename(merchant.name)
    filename = os.path.join(archive_dir, f"{safe_name}_{datetime.now().strftime('%Y%m%d')}_出入库记录.xlsx")

    # 创建Excel文件
    wb = Workbook()
    ws = wb.active
    ws.title = "出入库记录"

    # 修改表头为新的格式（移除单价）
    headers = ['日期', '品名', '操作类型', '库位', '数量', '规格', '总数', '批次号', '过期日期', '操作原因', '操作人']
    ws.append(headers)

    # 添加记录数据
    for record in records:
        product = Product.query.get(record.product_id)
        
        # 提取附加信息中的各项数据
        # 获取规格信息
        box_spec = '0'  # 默认值为0
        if record.additional_info and '箱规格: ' in record.additional_info:
            box_spec = record.additional_info.split('箱规格: ')[1].split(',')[0]
        
        # 转换规格为数值
        box_spec_value = float(box_spec) if box_spec.replace('.', '', 1).isdigit() else 0

        # 获取数量信息
        quantity = record.quantity if record.quantity else 0

        # 计算总数
        total = quantity * box_spec_value

        # 不处理单价信息

        # 提取库位信息
        location = '无'
        if record.additional_info and '库位: ' in record.additional_info:
            location = record.additional_info.split('库位: ')[1].split(',')[0]

        # 提取批次号信息
        batch_number = '无'
        if record.additional_info and '批次号: ' in record.additional_info:
            batch_number = record.additional_info.split('批次号: ')[1].split(',')[0]

        # 提取过期日期信息
        expiry_date = '无'
        if record.additional_info:
            if '保质期: ' in record.additional_info:
                expiry_date = record.additional_info.split('保质期: ')[1].split(',')[0]
            elif '过期日期: ' in record.additional_info:
                expiry_date = record.additional_info.split('过期日期: ')[1].split(',')[0]

        # 提取操作原因
        reason = '无'
        if record.additional_info:
            if record.operation_type == '入库' and '入库原因: ' in record.additional_info:
                reason = record.additional_info.split('入库原因: ')[1].split(',')[0]
            elif record.operation_type == '出库' and '出库原因: ' in record.additional_info:
                reason = record.additional_info.split('出库原因: ')[1].split(',')[0]

        # 安全获取操作人信息
        operator_name = '未知'
        if record.operator_id:
            operator = User.query.get(record.operator_id)
            if operator:
                operator_name = operator.username

        # 添加行数据
        ws.append([
            record.date.strftime('%Y-%m-%d %H:%M:%S'),
            product.name if product else '未知',
            record.operation_type,
            location,
            quantity,
            box_spec,
            total,
            batch_number,
            expiry_date,
            reason,
            operator_name
        ])

    # 保存文件
    wb.save(filename)

# =========================
# 深圳仓专用 API（独立出入库与记录）
# =========================

@app.route('/api/shenzhen/stock', methods=['GET'])
@login_required
def get_shenzhen_stock():
    product_id = request.args.get('product_id')
    merchant_id = current_user.current_merchant_id

    query = Stock.query.filter(
        Stock.merchant_id == merchant_id,
        Stock.location.in_(['Shenzhen', 'shenzhen']),
        Stock.quantity > 0
    )
    if product_id:
        query = query.filter(Stock.product_id == product_id)

    items = []
    for s in query.all():
        product = Product.query.filter_by(id=s.product_id, merchant_id=merchant_id).first()
        items.append({
            'id': s.id,
            'product_id': s.product_id,
            'name': product.name if product else '',
            'category': product.category if product else '',
            'supplier': product.supplier if product else '',
            'unit': product.unit if product else '',
            'box_spec': s.box_spec,
            'quantity': s.quantity or 0,
            'batch_number': s.batch_number or '',
            'expiry_date': s.expiry_date.strftime('%Y-%m-%d') if s.expiry_date else '',
            'location': s.location or 'Shenzhen',
            'daily_consumption': s.daily_consumption or 0,
            'in_transit': s.in_transit or 0,
            'unit_price': s.unit_price
        })
    return jsonify(items)


@app.route('/api/shenzhen/incoming', methods=['POST'])
@login_required
def shenzhen_incoming():
    data = request.json or {}
    required = ['product_id', 'box_spec', 'quantity', 'batch_number', 'expiry_date']
    if any(not data.get(k) for k in required):
        return jsonify({'message': '缺少必要字段'}), 400

    try:
        qty = int(data.get('quantity'))
    except Exception:
        return jsonify({'message': '数量格式不正确'}), 400
    if qty <= 0:
        return jsonify({'message': '数量必须大于0'}), 400

    try:
        expiry_date_obj = datetime.strptime(data['expiry_date'], '%Y-%m-%d').date()
    except Exception:
        return jsonify({'message': '过期日期格式应为 YYYY-MM-DD'}), 400

    merchant_id = current_user.current_merchant_id

    # 查找现有深圳库存（按产品、规格、批次、过期日期、库位）
    stock = Stock.query.filter_by(
        product_id=data['product_id'],
        box_spec=data['box_spec'],
        batch_number=data['batch_number'],
        expiry_date=expiry_date_obj,
        location='Shenzhen',
        merchant_id=merchant_id
    ).first()

    if stock:
        stock.quantity = (stock.quantity or 0) + qty
    else:
        stock = Stock(
            product_id=data['product_id'],
            box_spec=data['box_spec'],
            quantity=qty,
            batch_number=data['batch_number'],
            expiry_date=expiry_date_obj,
            location='Shenzhen',
            merchant_id=merchant_id,
            unit_price=0.0
        )
        db.session.add(stock)

    # 写入深圳出入库记录（仅深圳页面展示）
    rec = ShenzhenRecord(
        id=generateUniqueId(),
        product_id=data['product_id'],
        operation_type='入库',
        quantity=qty,
        box_spec=data['box_spec'],
        batch_number=data['batch_number'],
        expiry_date=expiry_date_obj,
        merchant_id=merchant_id,
        operator_id=current_user.id
    )
    db.session.add(rec)

    try:
        db.session.commit()
        return jsonify({'message': '深圳入库成功'}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': '深圳入库失败', 'error': str(e)}), 500


@app.route('/api/shenzhen/outgoing', methods=['POST'])
@login_required
def shenzhen_outgoing():
    data = request.json or {}
    required = ['product_id', 'box_spec', 'quantity']
    if any(not data.get(k) for k in required):
        return jsonify({'message': '缺少必要字段'}), 400

    try:
        qty = int(data.get('quantity'))
    except Exception:
        return jsonify({'message': '数量格式不正确'}), 400
    if qty <= 0:
        return jsonify({'message': '数量必须大于0'}), 400

    batch_number = data.get('batch_number') or None
    expiry_date_str = data.get('expiry_date') or None
    expiry_date_obj = None
    if expiry_date_str:
        try:
            expiry_date_obj = datetime.strptime(expiry_date_str, '%Y-%m-%d').date()
        except Exception:
            return jsonify({'message': '过期日期格式应为 YYYY-MM-DD'}), 400

    merchant_id = current_user.current_merchant_id

    # 匹配深圳库存记录
    query = Stock.query.filter(
        Stock.product_id == data['product_id'],
        Stock.box_spec == data['box_spec'],
        Stock.location == 'Shenzhen',
        Stock.merchant_id == merchant_id
    )
    if batch_number:
        query = query.filter(Stock.batch_number == batch_number)
    if expiry_date_obj:
        query = query.filter(Stock.expiry_date == expiry_date_obj)

    stock = query.first()
    if not stock:
        return jsonify({'message': '未找到对应深圳库存记录'}), 400
    if (stock.quantity or 0) < qty:
        return jsonify({'message': '深圳库存不足'}), 400

    stock.quantity = (stock.quantity or 0) - qty

    # 写入深圳出库记录
    rec = ShenzhenRecord(
        id=generateUniqueId(),
        product_id=data['product_id'],
        operation_type='出库',
        quantity=qty,
        box_spec=data['box_spec'],
        batch_number=batch_number,
        expiry_date=expiry_date_obj,
        merchant_id=merchant_id,
        operator_id=current_user.id
    )
    db.session.add(rec)

    try:
        db.session.commit()
        return jsonify({'message': '深圳出库成功'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': '深圳出库失败', 'error': str(e)}), 500


@app.route('/api/shenzhen/records', methods=['GET'])
@login_required
def get_shenzhen_records():
    product_id = request.args.get('product_id')
    merchant_id = current_user.current_merchant_id

    query = ShenzhenRecord.query.filter(ShenzhenRecord.merchant_id == merchant_id)
    if product_id:
        query = query.filter(ShenzhenRecord.product_id == product_id)

    records = []
    for r in query.order_by(ShenzhenRecord.date.desc()).all():
        records.append({
            'date': r.date.strftime('%Y-%m-%d %H:%M:%S'),
            'operation_type': r.operation_type,
            'box_spec': r.box_spec,
            'quantity': r.quantity,
            'batch_number': r.batch_number or '',
            'expiry_date': r.expiry_date.strftime('%Y-%m-%d') if r.expiry_date else '',
            'operator': (r.operator.username if r.operator else '')
        })
    return jsonify(records)

if __name__ == '__main__':
    with app.app_context():
        # 创建数据库表并初始化默认数据
        db.create_all()
        seed_defaults()
        # 运行一次管理员密码兼容处理（Flask 3移除before_first_request）
        ensure_admin_password_compat_seed()

    # 启动应用，支持通过环境变量 PORT 指定端口
    app.run(debug=True, port=int(os.environ.get('PORT', 5000)))