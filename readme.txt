1. 同时出库两个产品还是会报错，请修复lemonboxwms1.pythonanywhere.com 显示
出库操作失败:(sqlite3.IntegrityError)UNIQUE constraint faailed:
record.id
[SQL: INSERT INTO record (id, product_id, operation_type,
quantity, date, additional_info) VALUES (?, ?, ?, ?, ?, ?)]
[parameters: ('20250214130502', '2',出库', 1, '2025-02-14',箱规
格:1232131')]
(Background on this error at: https://sqlalche.me/e/14/gkkpj) 2. 出入库记录目前展示的时间还是00:00:00，是不是写入的时候没有精确到秒，只记录了日期？
