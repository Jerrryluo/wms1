#!/usr/bin/env python3
"""
数据库索引创建脚本
用于为现有数据库添加性能优化索引
"""
import os
import sys
from flask import Flask
from extensions import db
from models import *

def create_app():
    """创建Flask应用"""
    app = Flask(__name__)
    
    # 数据库配置
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or 'dev-key'
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL') or 'sqlite:///warehouse.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    db.init_app(app)
    return app

def create_indexes():
    """创建数据库索引"""
    app = create_app()
    
    with app.app_context():
        try:
            print("开始创建数据库索引...")
            
            # 获取数据库引擎
            engine = db.engine
            
            # 创建索引的SQL语句
            indexes = [
                # Product表索引
                "CREATE INDEX IF NOT EXISTS idx_product_merchant ON product(merchant_id);",
                
                # Stock表索引
                "CREATE INDEX IF NOT EXISTS idx_stock_product ON stock(product_id);",
                "CREATE INDEX IF NOT EXISTS idx_stock_merchant ON stock(merchant_id);",
                "CREATE INDEX IF NOT EXISTS idx_stock_quantity ON stock(quantity);",
                "CREATE INDEX IF NOT EXISTS idx_stock_expiry ON stock(expiry_date);",
                "CREATE INDEX IF NOT EXISTS idx_stock_batch ON stock(batch_number);",
                "CREATE INDEX IF NOT EXISTS idx_stock_location ON stock(location);",
                "CREATE INDEX IF NOT EXISTS idx_stock_product_merchant ON stock(product_id, merchant_id);",
                "CREATE INDEX IF NOT EXISTS idx_stock_location_batch ON stock(location, batch_number);",
                "CREATE INDEX IF NOT EXISTS idx_stock_expiry_quantity ON stock(expiry_date, quantity);",
                
                # Record表索引
                "CREATE INDEX IF NOT EXISTS idx_record_product ON record(product_id);",
                "CREATE INDEX IF NOT EXISTS idx_record_operation ON record(operation_type);",
                "CREATE INDEX IF NOT EXISTS idx_record_date ON record(date);",
                "CREATE INDEX IF NOT EXISTS idx_record_merchant ON record(merchant_id);",
                "CREATE INDEX IF NOT EXISTS idx_record_operator ON record(operator_id);",
                "CREATE INDEX IF NOT EXISTS idx_record_date_merchant ON record(date, merchant_id);",
                "CREATE INDEX IF NOT EXISTS idx_record_product_operation ON record(product_id, operation_type);",
                "CREATE INDEX IF NOT EXISTS idx_record_recent_duplicates ON record(product_id, operation_type, quantity, date);",
                
                # User表索引
                "CREATE INDEX IF NOT EXISTS idx_user_merchant ON \"user\"(current_merchant_id);",
                
                # ShenzhenRecord表索引
                "CREATE INDEX IF NOT EXISTS idx_shenzhen_record_merchant ON shenzhen_record(merchant_id);",
                "CREATE INDEX IF NOT EXISTS idx_shenzhen_record_date ON shenzhen_record(date);",
                "CREATE INDEX IF NOT EXISTS idx_shenzhen_record_product ON shenzhen_record(product_id);",
            ]
            
            # 执行索引创建
            with engine.connect() as conn:
                for index_sql in indexes:
                    try:
                        print(f"执行: {index_sql}")
                        conn.execute(db.text(index_sql))
                        conn.commit()
                    except Exception as e:
                        print(f"创建索引失败: {index_sql}")
                        print(f"错误: {str(e)}")
                        continue
            
            print("✅ 数据库索引创建完成！")
            
        except Exception as e:
            print(f"❌ 创建索引时发生错误: {str(e)}")
            sys.exit(1)

def analyze_database():
    """分析数据库性能"""
    app = create_app()
    
    with app.app_context():
        try:
            print("\n📊 数据库性能分析:")
            
            # 统计表记录数
            tables = [
                ('merchants', Merchant),
                ('products', Product),
                ('stock', Stock),
                ('records', Record),
                ('users', User),
                ('shenzhen_records', ShenzhenRecord)
            ]
            
            for table_name, model in tables:
                count = model.query.count()
                print(f"  {table_name}: {count} 条记录")
            
            # 检查是否有大量记录的表
            record_count = Record.query.count()
            if record_count > 1000:
                print(f"\n⚠️  警告: Record表有 {record_count} 条记录，建议考虑分页查询")
            
            stock_count = Stock.query.count()
            if stock_count > 1000:
                print(f"⚠️  警告: Stock表有 {stock_count} 条记录，建议优化查询")
                
        except Exception as e:
            print(f"❌ 分析数据库时发生错误: {str(e)}")

if __name__ == '__main__':
    print("🚀 数据库性能优化工具")
    print("=" * 50)
    
    if len(sys.argv) > 1 and sys.argv[1] == 'analyze':
        analyze_database()
    else:
        create_indexes()
        analyze_database()
    
    print("\n💡 优化建议:")
    print("1. 定期运行 VACUUM 和 ANALYZE (PostgreSQL)")
    print("2. 监控慢查询日志")
    print("3. 考虑添加缓存层")
    print("4. 对大表实施分页查询")