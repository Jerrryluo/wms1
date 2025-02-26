import uuid
from app import db
from app import Product, Stock, Record
from datetime import date


def init_db():
    db.create_all()

    # 添加初始化产品数据
    product1 = Product(
        id=str(uuid.uuid4()),
        name='产品1',
        english_name='Product 1',
        category='类别1',
        supplier='供应商1',
        unit='个'
    )
    db.session.add(product1)

    # 添加初始化库存数据
    stock1 = Stock(
        product_id=product1.id,
        box_spec='10个/箱',
        quantity=100,
        expiry_date=date(2024, 12, 31)
    )
    db.session.add(stock1)

    # 添加初始化记录数据
    record1 = Record(
        id=str(uuid.uuid4()),
        product_id=product1.id,
        operation_type='入库',
        quantity=100,
        date=date(2024, 1, 1),
        additional_info='初始入库'
    )
    db.session.add(record1)

    db.session.commit()