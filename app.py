from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
import os

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///warehouse.db'  # 使用SQLite
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# 使用随机生成的密钥
app.secret_key = os.urandom(24)
# 设置session过期时间为2小时
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=2)
db = SQLAlchemy(app)

# 添加 session 密钥
app.secret_key = 'your-secret-key-here'  # 建议使用随机生成的密钥

# 默认用户信息
DEFAULT_USERNAME = 'admin'
DEFAULT_PASSWORD = 'admin123'

# 生成唯一 ID
def generateUniqueId():
    now = datetime.now()
    return now.strftime('%Y%m%d%H%M%S%f')[:20]  # 使用微秒确保唯一性

# 产品表
class Product(db.Model):
    id = db.Column(db.String(20), primary_key=True)
    name = db.Column(db.String(100))
    english_name = db.Column(db.String(100))
    category = db.Column(db.String(50))
    supplier = db.Column(db.String(100))
    unit = db.Column(db.String(10))

# 库存表
class Stock(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.String(20), db.ForeignKey('product.id'))
    box_spec = db.Column(db.String(50))
    quantity = db.Column(db.Integer)
    expiry_date = db.Column(db.Date)
    in_transit = db.Column(db.Integer)
    daily_consumption = db.Column(db.Float)

# 操作记录表
class Record(db.Model):
    id = db.Column(db.String(20), primary_key=True)
    product_id = db.Column(db.String(20))
    operation_type = db.Column(db.String(10))  # 入库/出库
    quantity = db.Column(db.Integer)
    date = db.Column(db.DateTime)  # 改为 DateTime 类型
    additional_info = db.Column(db.String(200))

# 添加用户模型
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    last_login = db.Column(db.DateTime)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# 在应用启动前创建数据库表
def create_tables():
    with app.app_context():
        db.create_all()

create_tables()

# 初始化默认管理员账户
def init_admin():
    with app.app_context():
        # 检查并创建管理员账户
        if not User.query.filter_by(username='admin').first():
            admin = User(username='admin')
            admin.set_password('admin123')  # 初始密码
            db.session.add(admin)

        # 检查并创建测试账户
        if not User.query.filter_by(username='test').first():
            test_user = User(username='test')
            test_user.set_password('test')  # 初始密码
            db.session.add(test_user)

        db.session.commit()

# 登录路由
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template('login.html')
    
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username).first()
    
    if user and user.check_password(password):
        session.permanent = True  # 启用永久session
        session['logged_in'] = True
        session['user_id'] = user.id
        session['last_activity'] = datetime.now().isoformat()
        
        # 更新最后登录时间
        user.last_login = datetime.now()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': '登录成功'
        })
    
    return jsonify({
        'success': False,
        'message': '用户名或密码错误'
    }), 401

# 登出路由
@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('login'))

# 登录检查装饰器
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# 修改主页路由，添加登录验证
@app.route('/')
@login_required
def index():
    return render_template('index.html')

# 入库操作
@app.route('/api/incoming', methods=['POST'])
def handle_incoming():
    try:
        data = request.json
        if not all(key in data for key in ('product_id', 'box_spec', 'quantity', 'expiry_date')):
            return jsonify({'message': '缺少必要的字段'}), 400

        # 检查产品是否存在
        product = Product.query.get(data['product_id'])
        if not product:
            return jsonify({'message': '产品不存在'}), 404

        expiry_date = datetime.strptime(data['expiry_date'], '%Y-%m-%d').date()
        new_stock = Stock(
            product_id=data['product_id'],
            box_spec=data['box_spec'],
            quantity=data['quantity'],
            expiry_date=expiry_date
        )
        db.session.add(new_stock)
        db.session.commit()

        operation_id = generateUniqueId()
        new_record = Record(
            id=operation_id,
            product_id=data['product_id'],
            operation_type='入库',
            quantity=data['quantity'],
            date=datetime.now(),
            additional_info=f"箱规格: {data['box_spec']}, 保质期: {expiry_date}"
        )
        db.session.add(new_record)
        db.session.commit()
        return jsonify({'message': '入库记录成功'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': '入库操作失败', 'error': str(e)}), 500

# 产品管理
@app.route('/api/products', methods=['GET', 'POST'])
@login_required
def handle_products():
    if request.method == 'POST':
        data = request.json
        try:
            new_product = Product(**data)
            db.session.add(new_product)
            db.session.commit()
            return jsonify({'message': '产品添加成功'}), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'message': '添加产品失败', 'error': str(e)}), 500
    else:
        products = Product.query.all()
        return jsonify([{
            'id': p.id,
            'name': p.name,
            'english_name': p.english_name,
            'category': p.category,
            'supplier': p.supplier,
            'unit': p.unit
        } for p in products])

# 出库操作
@app.route('/api/outgoing', methods=['POST'])
def handle_outgoing():
    data = request.json
    try:
        # 查找对应的库存记录
        stock = Stock.query.filter_by(
            product_id=data['product_id'],
            box_spec=data['box_spec']
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
        
        # 创建出库记录，确保ID唯一
        current_time = datetime.now()
        operation_id = generateUniqueId()
        
        new_record = Record(
            id=operation_id,
            product_id=data['product_id'],
            operation_type='出库',
            quantity=data['quantity'],
            date=current_time,  # 使用精确时间
            additional_info=f"箱规格: {data['box_spec']}"
        )
        
        db.session.add(new_record)
        db.session.commit()
        
        return jsonify({
            'error': False,
            'message': '出库成功'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': True,
            'message': str(e)
        }), 500

# 库存查询
@app.route('/api/stock', methods=['GET'])
def get_stock():
    stock = Stock.query.all()
    return jsonify([{
        'product_id': s.product_id,
        'box_spec': s.box_spec,
        'quantity': s.quantity,
        'expiry_date': s.expiry_date.strftime('%Y-%m-%d') if s.expiry_date else None,  # 修改过期日期格式
        'name': Product.query.get(s.product_id).name,
        'english_name': Product.query.get(s.product_id).english_name,
        'category': Product.query.get(s.product_id).category,
        'supplier': Product.query.get(s.product_id).supplier,
        'unit': Product.query.get(s.product_id).unit,
        'in_transit': s.in_transit,
        'daily_consumption': s.daily_consumption
    } for s in stock])

# 记录查询
@app.route('/api/records', methods=['GET'])
def get_records():
    records = Record.query.all()
    return jsonify([{
        'id': r.id,
        'product_id': r.product_id,
        'product_name': Product.query.get(r.product_id).name,
        'operation_type': r.operation_type,
        'quantity': r.quantity,
        'date': r.date.strftime('%Y-%m-%d %H:%M:%S') if r.date else None
    } for r in records])

# 更新库存信息
@app.route('/api/stock/update', methods=['POST'])
def update_stock():
    data = request.json
    try:
        stocks = Stock.query.filter_by(product_id=data['product_id']).all()
        if not stocks:
            return jsonify({'success': False, 'message': '未找到产品库存信息'}), 404
            
        in_transit = int(data['in_transit'])
        daily_consumption = float(data['daily_consumption'])
        
        for stock in stocks:
            stock.in_transit = in_transit
            stock.daily_consumption = daily_consumption
        
        db.session.commit()
        return jsonify({'success': True, 'message': '更新成功'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

# 添加会话检查装饰器
def check_session_freshness():
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'last_activity' in session:
                last_activity = datetime.fromisoformat(session['last_activity'])
                if datetime.now() - last_activity > timedelta(minutes=30):
                    session.clear()
                    return jsonify({
                        'success': False,
                        'message': '会话已过期，请重新登录'
                    }), 401
                session['last_activity'] = datetime.now().isoformat()
            return f(*args, **kwargs)
        return decorated_function
    return decorator

if __name__ == '__main__':
    with app.app_context():
        create_tables()  # 创建数据库表
        init_admin()     # 初始化用户
    app.run(debug=True)