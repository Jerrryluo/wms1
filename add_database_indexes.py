#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据库索引优化脚本
为关键数据表添加索引以提升查询性能
"""

from app import app, db
from sqlalchemy import text

def add_database_indexes():
    """为关键字段添加数据库索引"""
    with app.app_context():
        try:
            # 获取数据库连接
            connection = db.engine.connect()
            
            # 定义需要添加的索引
            indexes = [
                # Product表索引
                "CREATE INDEX IF NOT EXISTS idx_product_merchant_id ON product(merchant_id)",
                "CREATE INDEX IF NOT EXISTS idx_product_category ON product(category)",
                "CREATE INDEX IF NOT EXISTS idx_product_supplier ON product(supplier)",
                
                # Stock表索引 - 库存查询的关键字段
                "CREATE INDEX IF NOT EXISTS idx_stock_product_id ON stock(product_id)",
                "CREATE INDEX IF NOT EXISTS idx_stock_merchant_id ON stock(merchant_id)",
                "CREATE INDEX IF NOT EXISTS idx_stock_location ON stock(location)",
                "CREATE INDEX IF NOT EXISTS idx_stock_expiry_date ON stock(expiry_date)",
                "CREATE INDEX IF NOT EXISTS idx_stock_batch_number ON stock(batch_number)",
                "CREATE INDEX IF NOT EXISTS idx_stock_merchant_product ON stock(merchant_id, product_id)",
                
                # Record表索引 - 出入库记录查询的关键字段
                "CREATE INDEX IF NOT EXISTS idx_record_product_id ON record(product_id)",
                "CREATE INDEX IF NOT EXISTS idx_record_merchant_id ON record(merchant_id)",
                "CREATE INDEX IF NOT EXISTS idx_record_date ON record(date)",
                "CREATE INDEX IF NOT EXISTS idx_record_operation_type ON record(operation_type)",
                "CREATE INDEX IF NOT EXISTS idx_record_operator_id ON record(operator_id)",
                "CREATE INDEX IF NOT EXISTS idx_record_merchant_date ON record(merchant_id, date)",
                "CREATE INDEX IF NOT EXISTS idx_record_merchant_product ON record(merchant_id, product_id)",
                
                # User表索引
                "CREATE INDEX IF NOT EXISTS idx_user_current_merchant_id ON user(current_merchant_id)",
                "CREATE INDEX IF NOT EXISTS idx_user_last_login ON user(last_login)",
                
                # Location表索引
                "CREATE INDEX IF NOT EXISTS idx_location_merchant_id ON location(merchant_id)",
                

                
                # UserPermission表索引 - 权限查询
                "CREATE INDEX IF NOT EXISTS idx_user_permission_user_id ON user_permission(user_id)",
                "CREATE INDEX IF NOT EXISTS idx_user_permission_permission_id ON user_permission(permission_id)",
            ]
            
            print("开始添加数据库索引...")
            
            # 执行索引创建
            for index_sql in indexes:
                try:
                    connection.execute(text(index_sql))
                    index_name = index_sql.split("IF NOT EXISTS ")[1].split(" ON ")[0]
                    print(f"✓ 成功创建索引: {index_name}")
                except Exception as e:
                    index_name = index_sql.split("IF NOT EXISTS ")[1].split(" ON ")[0] if "IF NOT EXISTS" in index_sql else "未知索引"
                    print(f"✗ 创建索引失败 {index_name}: {str(e)}")
            
            # 提交事务
            connection.commit()
            connection.close()
            
            print("\n索引优化完成！")
            print("\n优化效果说明:")
            print("1. 商户相关查询性能提升 - 所有表都按merchant_id建立了索引")
            print("2. 库存查询性能提升 - 按产品、库位、过期日期、批次号建立索引")
            print("3. 出入库记录查询性能提升 - 按日期、操作类型、操作人建立索引")
            print("4. 权限查询性能提升 - 用户权限关联表建立索引")
            print("5. 复合索引优化 - 常用组合查询字段建立复合索引")
            
        except Exception as e:
            print(f"索引优化过程中发生错误: {str(e)}")
            db.session.rollback()

def show_existing_indexes():
    """显示现有索引信息"""
    with app.app_context():
        try:
            connection = db.engine.connect()
            
            # 查询现有索引
            result = connection.execute(text("""
                SELECT name, tbl_name, sql 
                FROM sqlite_master 
                WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
                ORDER BY tbl_name, name
            """))
            
            print("\n现有数据库索引:")
            print("-" * 80)
            current_table = None
            for row in result:
                if row[1] != current_table:
                    current_table = row[1]
                    print(f"\n表: {current_table}")
                print(f"  索引: {row[0]}")
                if row[2]:
                    print(f"    SQL: {row[2]}")
            
            connection.close()
            
        except Exception as e:
            print(f"查询索引信息时发生错误: {str(e)}")

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == '--show':
        show_existing_indexes()
    else:
        add_database_indexes()
        print("\n使用 'python add_database_indexes.py --show' 查看所有索引")