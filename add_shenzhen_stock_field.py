#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
添加深圳库存字段到Stock表的数据库迁移脚本

使用方法:
    python add_shenzhen_stock_field.py [选项]

选项:
    --skip-backup    跳过数据库备份步骤
    --help           显示帮助信息

说明:
    此脚本用于向Stock表添加shenzhen_stock字段，默认值为0。
    脚本会自动在多个位置查找数据库文件，包括当前目录、instance子目录等。
    执行前会自动备份数据库，除非指定--skip-backup选项。

作者: AI助手
日期: 2023-07-01
版本: 1.0
"""

import sqlite3
import os
import shutil
import datetime
import sys

def backup_database(db_path):
    """在修改前备份数据库"""
    try:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"{db_path}.backup_{timestamp}"
        shutil.copy2(db_path, backup_path)
        print(f"数据库已备份到: {backup_path}")
        return True
    except Exception as e:
        print(f"备份数据库失败: {str(e)}")
        return False

def add_shenzhen_stock_field(skip_backup=False):
    """添加深圳库存字段到Stock表"""
    print("开始执行添加深圳库存字段脚本...")
    print(f"当前工作目录: {os.getcwd()}")
    # 尝试在当前目录和instance目录下查找数据库文件
    possible_paths = [
        'warehouse.db',                      # 直接在当前目录
        os.path.join('instance', 'warehouse.db'),  # 在instance子目录
        os.path.join('..', 'warehouse.db'),       # 在上级目录
        os.path.abspath('warehouse.db')            # 使用绝对路径
    ]
    
    db_path = None
    for path in possible_paths:
        if os.path.exists(path):
            db_path = path
            print(f"找到数据库文件: {db_path}")
            break
    
    if not db_path:
        print(f"数据库文件不存在，已尝试以下路径: {', '.join(possible_paths)}")
        return False
        
    # 在修改前备份数据库
    if not skip_backup:
        if not backup_database(db_path):
            user_input = input("备份失败，是否继续执行? (y/n): ")
            if user_input.lower() != 'y':
                print("操作已取消")
                return False
    
    try:
        print(f"正在连接数据库: {db_path}")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 检查表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='stock'")
        if not cursor.fetchone():
            print("错误: stock表不存在于数据库中")
            conn.close()
            return False
            
        # 检查字段是否已存在
        print("检查字段是否已存在...")
        cursor.execute("PRAGMA table_info(stock)")
        columns = [column[1] for column in cursor.fetchall()]
        print(f"现有字段: {', '.join(columns)}")
        
        if 'shenzhen_stock' not in columns:
            # 添加深圳库存字段，默认值为0
            print("添加深圳库存字段...")
            cursor.execute("ALTER TABLE stock ADD COLUMN shenzhen_stock INTEGER DEFAULT 0")
            conn.commit()
            print("成功添加深圳库存字段到Stock表")
        else:
            print("深圳库存字段已存在，无需添加")
        
        # 验证字段是否成功添加
        cursor.execute("PRAGMA table_info(stock)")
        updated_columns = [column[1] for column in cursor.fetchall()]
        if 'shenzhen_stock' in updated_columns:
            print("验证成功: 深圳库存字段已存在于数据库中")
        else:
            print("警告: 验证失败，深圳库存字段可能未成功添加")
            
        conn.close()
        return True
        
    except sqlite3.Error as e:
        print(f"SQLite错误: {str(e)}")
        return False
    except Exception as e:
        print(f"添加字段失败: {str(e)}")
        return False

def show_help():
    """显示帮助信息"""
    print(__doc__)
    sys.exit(0)

if __name__ == '__main__':
    # 解析命令行参数
    if '--help' in sys.argv or '-h' in sys.argv:
        show_help()
        
    skip_backup = '--skip-backup' in sys.argv
    
    print("="*50)
    print("添加深圳库存字段到Stock表")
    print("="*50)
    
    success = add_shenzhen_stock_field(skip_backup)
    
    print("\n" + "-"*50)
    if success:
        print("✅ 脚本执行成功")
        sys.exit(0)
    else:
        print("❌ 脚本执行失败")
        sys.exit(1)