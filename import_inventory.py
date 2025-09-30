import openpyxl
from app import db, app
from app import Stock, Merchant  # 使用Stock和Merchant模型
from datetime import datetime, timedelta

def import_inventory(file_path):
    # 获取LemonBox商户
    lemonbox_merchant = Merchant.query.filter_by(name="测试1").first()
    if not lemonbox_merchant:
        print("商户LemonBox不存在，无法导入库存。")
        return

    # 打开Excel文件
    workbook = openpyxl.load_workbook(file_path)
    sheet = workbook.active  # 获取活动工作表

    # 跳过标题行，读取每一行数据
    for row in sheet.iter_rows(min_row=2, values_only=True):

        # Convert expiry_date to a date object if it's not None
        expiry_date = row[3]  # 假设第四列为有效期
        
        # Check if expiry_date is None and set default value
        if expiry_date is None:
            expiry_date = datetime(2099, 12, 31).date()  # 设置默认过期日期
        elif isinstance(expiry_date, datetime):
            expiry_date = expiry_date.date()  # Convert to date object if it's a datetime
        elif isinstance(expiry_date, (int, float)):
            # If it's an integer or float, assume it's a number of days from today
            expiry_date = datetime.now() + timedelta(days=int(expiry_date))
        elif isinstance(expiry_date, str):
            # If it's a string, try to parse it
            try:
                expiry_date = datetime.strptime(expiry_date, '%Y-%m-%d').date()  # Adjust format as needed
            except ValueError:
                print(f"无效的日期格式: {expiry_date}")
                continue  # Skip this row if the date is invalid
        else:
            print(f"无效的日期类型: {expiry_date}")
            continue  # Skip this row if the date is invalid

        # 获取单价信息（假设第七列为单价）
        unit_price = None
        if len(row) > 6 and row[6] is not None:
            try:
                unit_price = float(row[6])
                if unit_price < 0:
                    print(f"警告：单价不能为负数，行数据: {row}")
                    unit_price = None
            except (ValueError, TypeError):
                print(f"警告：无效的单价格式，行数据: {row}")

        # 创建库存对象
        stock_item = Stock(
            product_id=row[0],  # 假设第一列为产品编码
            box_spec=row[1],    # 假设第二列为产品规格
            quantity=row[2],     # 假设第三列为箱数
            expiry_date=expiry_date,  # 使用转换后的有效期
            batch_number=row[4],  # 假设第五列为批次号
            location=row[5],      # 假设第六列为库位
            unit_price=unit_price,  # 添加单价信息
            merchant_id=lemonbox_merchant.id  # 使用LemonBox商户的ID
        )
        db.session.add(stock_item)

    try:
        db.session.commit()
        print("库存已成功导入！")
    except Exception as e:
        print(f"提交数据库时出错: {e}")
        db.session.rollback()

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("用法: python import_inventory.py inventory.xlsx")
        sys.exit(1)

    file_path = sys.argv[1]
    with app.app_context():
        import_inventory(file_path) 