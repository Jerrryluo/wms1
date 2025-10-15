"""
性能优化配置模块
包含数据库连接池、缓存和其他性能优化设置
"""
import os
from flask_caching import Cache
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

# 数据库连接池配置
def get_optimized_db_config():
    """获取优化的数据库配置"""
    database_url = os.environ.get('DATABASE_URL')
    
    if database_url and database_url.startswith('postgresql'):
        # PostgreSQL/Neon 优化配置
        return {
            'SQLALCHEMY_DATABASE_URI': database_url,
            'SQLALCHEMY_ENGINE_OPTIONS': {
                'poolclass': QueuePool,
                'pool_size': 5,  # 连接池大小
                'max_overflow': 10,  # 最大溢出连接数
                'pool_pre_ping': True,  # 连接前检查
                'pool_recycle': 300,  # 连接回收时间（秒）
                'connect_args': {
                    'connect_timeout': 10,
                    'application_name': 'wms_vercel',
                    'options': '-c default_transaction_isolation=read_committed'
                }
            }
        }
    else:
        # SQLite 配置（本地开发）
        return {
            'SQLALCHEMY_DATABASE_URI': database_url or 'sqlite:///warehouse.db',
            'SQLALCHEMY_ENGINE_OPTIONS': {
                'pool_pre_ping': True,
                'connect_args': {'check_same_thread': False}
            }
        }

# 缓存配置
def get_cache_config():
    """获取缓存配置"""
    return {
        'CACHE_TYPE': 'simple',  # 在生产环境中可以使用Redis
        'CACHE_DEFAULT_TIMEOUT': 300  # 5分钟缓存
    }

# 初始化缓存
def init_cache(app):
    """初始化缓存"""
    cache_config = get_cache_config()
    cache = Cache()
    
    for key, value in cache_config.items():
        app.config[key] = value
    
    cache.init_app(app)
    return cache

# 性能监控装饰器
def performance_monitor(func):
    """性能监控装饰器"""
    import time
    import functools
    
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        
        # 记录慢查询（超过1秒）
        duration = end_time - start_time
        if duration > 1.0:
            print(f"慢查询警告: {func.__name__} 耗时 {duration:.2f}秒")
        
        return result
    return wrapper

# 数据库查询优化工具
class QueryOptimizer:
    """数据库查询优化工具类"""
    
    @staticmethod
    def optimize_records_query(merchant_id, limit=100):
        """优化记录查询"""
        from models import Record, Product, User
        from extensions import db
        
        # 使用JOIN避免N+1查询，并添加分页
        return db.session.query(Record, Product, User).join(
            Product, Record.product_id == Product.id
        ).outerjoin(
            User, Record.operator_id == User.id
        ).filter(
            Record.merchant_id == merchant_id,
            Product.merchant_id == merchant_id
        ).order_by(Record.date.desc()).limit(limit).all()
    
    @staticmethod
    def optimize_stock_query(merchant_id, filters=None):
        """优化库存查询"""
        from models import Stock, Product
        from extensions import db
        
        query = db.session.query(Stock, Product).join(
            Product, Stock.product_id == Product.id
        ).filter(
            Stock.merchant_id == merchant_id,
            Product.merchant_id == merchant_id
        )
        
        # 应用过滤条件
        if filters:
            if 'location' in filters and filters['location']:
                query = query.filter(Stock.location == filters['location'])
            if 'low_stock' in filters and filters['low_stock']:
                query = query.filter(Stock.quantity < 10)
        
        return query.all()

# 批量操作优化
class BatchOperations:
    """批量操作优化"""
    
    @staticmethod
    def bulk_insert_records(records_data):
        """批量插入记录"""
        from models import Record
        from extensions import db
        
        records = [Record(**data) for data in records_data]
        db.session.bulk_save_objects(records)
        db.session.commit()
    
    @staticmethod
    def bulk_update_stock(updates):
        """批量更新库存"""
        from models import Stock
        from extensions import db
        
        db.session.bulk_update_mappings(Stock, updates)
        db.session.commit()