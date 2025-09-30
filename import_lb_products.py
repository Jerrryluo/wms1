import uuid
import openpyxl
from app import db, app
from app import Product, Merchant

def import_lb_products(file_path):
    # 获取康力商户
    lemonbox_merchant = Merchant.query.filter_by(name="测试1").first()
    if not lemonbox_merchant:
        print("商户康力不存在，无法导入产品。")
        return

    # 打开Excel文件
    workbook = openpyxl.load_workbook(file_path)
    sheet = workbook.active  # 获取活动工作表

    # 跳过标题行，读取每一行数据
    for row in sheet.iter_rows(min_row=2, values_only=True):
        # 创建产品对象
        product = Product(
            id=row[0],  # 使用Excel中的产品编号（第一列）
            name=row[1],  # 假设第二列为"品名"
            category=row[3],  # 假设第四列为"产品类别"
            supplier=row[4],  # 假设第五列为"供应商"
            unit=row[2],  # 假设第三列为"单位"
            merchant_id=lemonbox_merchant.id  # 设置商户ID
        )
        db.session.add(product)

    db.session.commit()
    print("LB产品已成功导入到LemonBox商户的产品列表中！")

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("用法: python import_lb_products.py products.xlsx")
        sys.exit(1)

    file_path = sys.argv[1]
    with app.app_context():
        import_lb_products(file_path) 