# 仓库管理系统 更新id
UPDATE product SET name = '姜黄' WHERE id = '0010042';

# 验证更新
SELECT id, name FROM product WHERE id = '0010042';
## 项目概述
本项目是一个仓库管理系统，旨在帮助用户管理库存、出入库记录、用户和商户信息等。
部署到 Vercel + Neon 的完整指南请阅读 `docs/deploy-vercel-neon.md`。

## 功能概述
- **产品管理**：添加、查看和管理产品信息。
- **入库操作**：记录产品的入库信息，包括产品编号、规格、数量、批次号、入库原因、保质期和库位。
- **出库操作**：记录产品的出库信息，包括出库原因、规格、数量等。
- **出入库记录**：查看所有的出入库记录，支持按日期、产品、操作类型等进行筛选。
- **库存管理**：查看当前库存状态，支持库存的更新和管理。
- **用户管理**：管理用户信息和权限。
- **商户管理**：管理商户信息。

## 更新内容
### 1. 出入库记录单价列展示
在出入库记录中，新增了单价列的展示。用户在进行入库操作时可以录入单价信息，该信息将会在出库记录中显示，确保用户能够清晰地看到每个记录的单价。

### 2. 数据库结构
- **Record 表**：新增了 `unit_price` 字段，用于存储每个出入库记录的单价信息。
- **Stock 表**：确保库存记录中包含单价字段，以便在出库时能够正确提取单价。

## 开发环境要求
- Python 3.x
- Flask
- Flask-SQLAlchemy
- Flask-Login
- SQLite 或其他数据库

## 项目目录结构
.
├── app.py # 主应用程序
├── database.py # 数据库初始化和模型定义
├── requirements.txt # 项目依赖
├── static # 静态文件（CSS, JS, 图片等）
│ ├── script.js
│ └── styles.css
└── templates # HTML 模板
├── index.html
└── login.html
```

## 代码检查与建议
- **`app.py`**: 在代码中发现了重复设置 `app.secret_key`，应移除其中一个设置。建议使用 `os.urandom(24)` 生成的随机密钥而不是硬编码的密钥。
- **`database.py`**: 建议将初始化数据抽取为配置文件或参数，使 `init_db()` 函数更加灵活。
- **`static/script.js`**: 在 `addToOutgoingList()` 和其他函数中添加了适当的错误处理，但建议统一错误处理方式，创建一个通用的错误处理函数。
- **`static/styles.css`**: 样式表结构良好，但建议为每个主要部分添加更详细的注释，特别是对于复杂的选择器和样式规则。
- **`templates/index.html`**: 大部分输入框已添加 `required` 属性，但出库数量输入框 (`outgoing-quantity`) 缺少此属性，应添加以确保用户输入有效数据。

## 贡献
欢迎任何形式的贡献！请提交问题或拉取请求。

## 许可证
本项目采用 MIT 许可证，详细信息请查看 LICENSE 文件。

sqlite3 instance/warehouse.db

# 开启表头和列模式显示
.headers on
.mode column

# 查询所有库存信息（连接product表获取产品名称）
SELECT 
    s.product_id,
    p.name as product_name,
    s.quantity,
    s.location,
    s.batch_number,
    s.box_spec
FROM stock s
LEFT JOIN product p ON s.product_id = p.id;

# 退出
.quit

UPDATE stock 
SET quantity = 1, box_spec = '255' 
WHERE product_id = '0050033' 
  AND location = 'A16' 
  AND batch_number = '20271231';

  -- 查看所有出入库记录
SELECT id, product_id, operation_type, quantity, date, additional_info 
FROM record;

-- 按产品ID查找特定记录
SELECT * FROM record WHERE product_id = '产品ID';

-- 按时间范围查找记录
SELECT * FROM record 
WHERE date BETWEEN '开始时间' AND '结束时间';

-- 修改特定记录的数量
UPDATE record 
SET quantity = 新数量 
WHERE id = '记录ID';

-- 示例：将记录ID为'202401010001'的数量改为10
UPDATE record 
SET quantity = 10 
WHERE id = '202401010001';