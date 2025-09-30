# 导入所需的Flask框架组件和其他Python库，用于构建Web应用程序和处理数据库操作
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_required, login_user, logout_user, current_user
from datetime import datetime, timedelta
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
import os
from openpyxl import Workbook

# 配置类定义
class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or os.urandom(24)
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///warehouse.db'
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
db = SQLAlchemy(app)

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

# 初始化Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'  # 设置登录视图的端点

# 设置默认管理员账户信息，用于系统初始化时创建管理员用户
DEFAULT_USERNAME = 'admin'
DEFAULT_PASSWORD = 'admin123'

# 生成唯一ID的工具函数，使用时间戳和微秒确保ID的唯一性，用于各种记录的主键生成
def generateUniqueId():
    now = datetime.now()
    return now.strftime('%Y%m%d%H%M%S%f')[:20]  # 使用微秒确保唯一性

# 商户表模型定义，存储系统中的商户信息
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

# 产品表模型定义，存储产品基本信息，与Stock表和Record表存在关联关系
class Product(db.Model):
    id = db.Column(db.String(20), primary_key=True)
    name = db.Column(db.String(100))
    category = db.Column(db.String(50))
    supplier = db.Column(db.String(100))
    unit = db.Column(db.String(10))
    merchant_id = db.Column(db.Integer, db.ForeignKey('merchant.id'), nullable=False)

# 库存表模型定义，记录产品库存详细信息，通过外键与Product表关联，支持库存管理和预警功能
class Stock(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.String(20), db.ForeignKey('product.id'))
    box_spec = db.Column(db.String(50))
    quantity = db.Column(db.Integer)
    expiry_date = db.Column(db.Date)
    batch_number = db.Column(db.String(50))  # 批次号
    in_transit = db.Column(db.Integer)
    daily_consumption = db.Column(db.Float)
    location = db.Column(db.String(20))  # 库位
    merchant_id = db.Column(db.Integer, db.ForeignKey('merchant.id'), nullable=False)
    unit_price = db.Column(db.Float)  # 新增单价字段
    shenzhen_stock = db.Column(db.Integer, default=0)  # 深圳库存字段

# 操作记录表模型定义，记录所有入库和出库操作，支持追踪和审计功能
class Record(db.Model):
    id = db.Column(db.String(20), primary_key=True)
    product_id = db.Column(db.String(20))
    operation_type = db.Column(db.String(10))
    quantity = db.Column(db.Integer)
    date = db.Column(db.DateTime, default=datetime.now)
    additional_info = db.Column(db.String(200))
    merchant_id = db.Column(db.Integer, db.ForeignKey('merchant.id'), nullable=False)
    operator_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)  # 添加操作人ID字段

    # 建立与用户表的关系
    operator = db.relationship('User', backref='records', lazy=True)

# 用户表模型定义，支持用户认证和密码加密，记录用户登录信息
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    last_login = db.Column(db.DateTime)
    current_merchant_id = db.Column(db.Integer, db.ForeignKey('merchant.id'), nullable=True)
    is_admin = db.Column(db.Boolean, default=False)  # 新增管理员标志
    # 用户权限关联
    permissions = db.relationship('UserPermission', backref='user', lazy='dynamic')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    # Flask-Login接口实现
    def is_authenticated(self):
        return True

    def is_active(self):
        return True

    def is_anonymous(self):
        return False

    def get_id(self):
        return str(self.id)

    # 检查用户是否有特定权限
    def has_permission(self, permission_name):
        # 管理员拥有所有权限
        if self.is_admin:
            return True

        # 查询用户是否有指定权限
        permission = Permission.query.filter_by(name=permission_name).first()
        if not permission:
            return False

        user_permission = UserPermission.query.filter_by(
            user_id=self.id,
            permission_id=permission.id
        ).first()

        return user_permission is not None

# 用户加载函数，用于Flask-Login从会话中恢复用户
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# 库位表模型定义，用于管理仓库中的物理位置信息，支持库存定位功能
class Location(db.Model):
    id = db.Column(db.String(20), primary_key=True)
    name = db.Column(db.String(100))
    description = db.Column(db.String(200))
    merchant_id = db.Column(db.Integer, db.ForeignKey('merchant.id'), nullable=False)



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

# 主页路由处理，需要登录验证，渲染主页模板
@app.route('/')
@login_required
def index():
    return render_template('index.html')

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
            operation_id = generateUniqueId()
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
            record_id = generateUniqueId()
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
            'supplier': p.supplier,
            'unit': p.unit
        } for p in products])

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
        operation_id = generateUniqueId()

        # 获取单价信息，若未录入则显示为"-"
        unit_price = stock.unit_price if stock.unit_price is not None else '-'

        new_record = Record(
            id=operation_id,
            product_id=data['product_id'],
            operation_type='出库',
            quantity=data['quantity'],
            date=current_time,
            additional_info=f"出库原因: {data['outgoing_reason']}, 箱规格: {data['box_spec']}, 批次号: {stock.batch_number}, 过期日期: {stock.expiry_date.strftime('%Y-%m-%d') if stock.expiry_date else '无'}, 库位: {location}, 单价: {unit_price}",  # 包含单价信息
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
                'additional_info': f"出库原因: {data['outgoing_reason']}, 箱规格: {data['box_spec']}, 批次号: {stock.batch_number}, 过期日期: {stock.expiry_date.strftime('%Y-%m-%d') if stock.expiry_date else '无'}, 库位: {location}, 单价: {unit_price}"  # 包含单价信息
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
            
        # 添加商户过滤
        stock = Stock.query.filter_by(merchant_id=current_user.current_merchant_id).all()
        
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
                    'unit': product.unit,
                    'box_spec': s.box_spec,
                    'quantity': s.quantity,
                    'batch_number': s.batch_number,
                    'expiry_date': s.expiry_date.strftime('%Y-%m-%d') if s.expiry_date else None,
                    'in_transit': s.in_transit,
                    'daily_consumption': s.daily_consumption,
                    'location': s.location,
                    'unit_price': s.unit_price,
                    'shenzhen_stock': s.shenzhen_stock or 0
                })
        return jsonify(result)
    except Exception as e:
        error_msg = f"获取库存信息失败: {str(e)}"
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

                # 获取单价信息，若未录入则显示为"-"
                unit_price = None
                if r.additional_info and '单价: ' in r.additional_info:
                    unit_price_str = r.additional_info.split('单价: ')[1].split(',')[0]  # 提取单价字符串
                    unit_price = float(unit_price_str) if unit_price_str not in ['-', 'None'] else '-'  # 处理单价为'-'或'None'的情况
                else:
                    unit_price = '-'  # 如果单价未录入，显示为"-"

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
                    'unit_price': unit_price,  # 这里可以是待录入或实际单价
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

# 权限表模型定义，存储系统中的各种权限类型
class Permission(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)  # 权限名称
    description = db.Column(db.String(200))  # 权限描述
    created_at = db.Column(db.DateTime, default=datetime.now)

    # 权限与用户的关联
    users = db.relationship('UserPermission', backref='permission', lazy='dynamic')

# 用户权限关联表，存储用户与权限的多对多关系
class UserPermission(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    permission_id = db.Column(db.Integer, db.ForeignKey('permission.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now)

    # 添加唯一约束，确保一个用户不会重复分配同一权限
    __table_args__ = (db.UniqueConstraint('user_id', 'permission_id', name='unique_user_permission'),)

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

        # 分配权限
        if 'permissions' in data and isinstance(data['permissions'], list):
            for perm_id in data['permissions']:
                permission = Permission.query.get(perm_id)
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
        
        # 分配新的权限
        for perm_id in data['permissions']:
            permission = Permission.query.get(perm_id)
            if permission:
                user_permission = UserPermission(
                    user_id=user_id,
                    permission_id=permission.id
                )
                db.session.add(user_permission)
        
        # 更新管理员状态（如果提供了该字段）
        if 'is_admin' in data:
            user.is_admin = data['is_admin']
            
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
            # 获取该商户的库存信息
            stock_items = Stock.query.filter_by(merchant_id=merchant.id).all()
            
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
        # 获取商户名称
        merchant = Merchant.query.get(merchant_id)
        if not merchant:
            return
        
        # 生成今天的文件名
        today_str = datetime.now().strftime('%Y%m%d')
        stock_filename = f"Archive/{merchant.name}_{today_str}_库存.xlsx"
        records_filename = f"Archive/{merchant.name}_{today_str}_出入库记录.xlsx"
        
        # 检查文件是否已存在
        import os
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
    # 获取商户名称
    merchant = Merchant.query.get(merchant_id)
    if not merchant:
        return

    # 获取库存信息
    stock_items = Stock.query.filter_by(merchant_id=merchant_id).all()
    # 生成文件名
    filename = f"Archive/{merchant.name}_{datetime.now().strftime('%Y%m%d')}_库存.xlsx"

    # 创建Excel文件
    wb = Workbook()
    ws = wb.active
    ws.title = "库存"

    # 添加表头
    headers = ['产品编号', '品名', '产品类别', '供应商', '产品单位', '香港库存', '深圳库存', '在途数量', '每日消耗', '规格', '箱数', '批次号', '过期日期', '库位', '单价']
    ws.append(headers)

    # 添加库存数据
    for item in stock_items:
        product = Product.query.get(item.product_id)
        # 获取规格信息
        box_spec_info = item.box_spec  # 假设箱规格信息在这里
        box_quantity = item.quantity  # 假设库存数量在这里
        expiry_date = item.expiry_date.strftime('%Y-%m-%d') if item.expiry_date else '无'
        location = item.location if item.location else '无'
        unit_price = item.unit_price if item.unit_price is not None else '无'

        ws.append([
            item.product_id,
            product.name if product else '未知',
            product.category if product else '未知',
            product.supplier if product else '未知',
            product.unit if product else '未知',
            item.quantity,  # 香港库存
            item.shenzhen_stock,  # 深圳库存
            item.in_transit,  # 在途数量
            item.daily_consumption,  # 每日消耗
            box_spec_info,  # 规格
            box_quantity,  # 箱数
            item.batch_number,  # 批次号
            expiry_date,  # 过期日期
            location,  # 库位
            unit_price  # 单价
        ])

    # 保存文件
    wb.save(filename)

# 添加导出记录到Excel的函数
def export_records_to_excel(merchant_id):
    # 获取商户名称
    merchant = Merchant.query.get(merchant_id)
    if not merchant:
        return

    # 获取出入库记录
    records = Record.query.filter_by(merchant_id=merchant_id).all()
    # 生成文件名
    filename = f"Archive/{merchant.name}_{datetime.now().strftime('%Y%m%d')}_出入库记录.xlsx"

    # 创建Excel文件
    wb = Workbook()
    ws = wb.active
    ws.title = "出入库记录"

    # 修改表头为新的格式
    headers = ['日期', '品名', '操作类型', '库位', '数量', '规格', '总数', '批次号', '单价', '过期日期', '操作原因', '操作人']
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

        # 获取单价信息
        unit_price = '-'  # 默认为未录入
        if record.additional_info and '单价: ' in record.additional_info:
            unit_price_str = record.additional_info.split('单价: ')[1].split(',')[0] if ',' in record.additional_info.split('单价: ')[1] else record.additional_info.split('单价: ')[1]
            unit_price = unit_price_str if unit_price_str != 'None' else '-'

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
            unit_price,
            expiry_date,
            reason,
            operator_name
        ])

    # 保存文件
    wb.save(filename)

if __name__ == '__main__':
    with app.app_context():
        # 创建数据库表
        db.create_all()
        
        # 检查并创建默认权限
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
        
        # 检查并创建管理员账户
        admin = User.query.filter_by(username=DEFAULT_USERNAME).first()
        if not admin:
            admin = User(username=DEFAULT_USERNAME, is_admin=True)
            admin.set_password(DEFAULT_PASSWORD)
            db.session.add(admin)
            print(f"创建管理员账户: {DEFAULT_USERNAME}")
        
        db.session.commit()
        print("系统初始化完成")
        
    # 启动应用
    app.run(debug=True)