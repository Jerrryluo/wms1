import openpyxl
from app import db, app
from app import Stock
from datetime import datetime

def update_stock_prices(file_path):
    """
    从Excel文件更新库存记录的单价
    Excel文件应包含以下列：
    1. 产品编码
    2. 批次号
    3. 单价
    """
    print("开始更新库存单价...")
    

    # 获取LemonBox商户
    lemonbox_merchant = Merchant.query.filter_by(name="LemonBox").first()
    if not lemonbox_merchant:
        print("商户LemonBox不存在，无法更新库存。")
        return
    
    # 打开Excel文件
    workbook = openpyxl.load_workbook(file_path)
    sheet = workbook.active
    
    # 统计信息
    total_rows = 0
    updated_count = 0
    error_count = 0
    
    # 跳过标题行，读取每一行数据
    for row in sheet.iter_rows(min_row=2, values_only=True):
        total_rows += 1
        
        if len(row) < 3 or not all(row[:3]):
            print(f"警告：行 {total_rows+1} 数据不完整，跳过")
            error_count += 1
            continue
            
        product_id = str(row[0])
        batch_number = str(row[1])
        
        # 处理单价
        try:
            unit_price = float(row[2])
            if unit_price < 0:
                print(f"警告：单价不能为负数，行 {total_rows+1}")
                error_count += 1
                continue
        except (ValueError, TypeError):
            print(f"警告：无效的单价格式，行 {total_rows+1}")
            error_count += 1
            continue
            
        # 查找匹配的库存记录并更新
        try:
            # 根据产品编码、批次号和商户ID查找库存记录
            stock_items = Stock.query.filter_by(
                product_id=product_id,
                batch_number=batch_number,
                merchant_id=lemonbox_merchant.id  # 添加商户ID过滤
            ).all()
            
            if not stock_items:
                print(f"未找到匹配记录：产品编码 {product_id}，批次号 {batch_number}")
                error_count += 1
                continue
                
            # 更新找到的所有匹配记录
            for stock in stock_items:
                stock.unit_price = unit_price
                updated_count += 1
                
        except Exception as e:
            print(f"更新记录时出错：{e}")
            error_count += 1
    
    # 提交更改
    try:
        db.session.commit()
        print(f"库存单价更新完成！")
        print(f"总处理记录：{total_rows}，成功更新：{updated_count}，错误：{error_count}")
    except Exception as e:
        print(f"提交数据库时出错: {e}")
        db.session.rollback()

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("用法: python update_stock_prices.py prices.xlsx")
        sys.exit(1)

    file_path = sys.argv[1]
    with app.app_context():
        update_stock_prices(file_path)