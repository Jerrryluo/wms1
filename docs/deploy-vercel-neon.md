# 部署到 Vercel + Neon（PostgreSQL）完整指南

这份文档是一步一步的迁移与部署指南，适合小白。

## 一、准备 Neon 数据库（免费）
- 注册并登录 Neon（https://neon.tech/）。
- 创建 Project 和 Branch，生成数据库（Database）和用户（User）。
- 复制 Neon 的 `Database URL`（示例：`postgresql://USER:PASSWORD@HOST/dbname?sslmode=require`）。
- 注意：必须包含 `sslmode=require`，云端连接更安全。

## 二、本地环境准备
- 安装 Python（推荐 3.11）。
- 在项目根目录创建虚拟环境并安装依赖：
  - `python -m venv .venv`
  - `source .venv/bin/activate`
  - `pip install -r requirements.txt`

## 三、初始化 Neon 上的数据表和默认数据
- 在终端设置环境变量，并运行初始化脚本：
  - `export DATABASE_URL="<你的Neon Database URL>"`
  - `export SECRET_KEY="请自定义一个随机字符串"`
  - `python scripts/setup_db.py`
- 作用：在 Neon 上创建所有表，并初始化默认权限与管理员账号（默认 `admin/admin123`）。

## 四、迁移旧数据（可选）
如果现有数据在 `SQLite`（本项目的 `warehouse.db`），可以迁到 Neon：
- 确保第 3 步已在 Neon 上创建好表。
- 执行：
  - `export DATABASE_URL="<你的Neon Database URL>"`
  - `python scripts/migrate_sqlite_to_neon.py`
  - 如 SQLite 不在根目录，设置路径：
    - `export SQLITE_PATH="/绝对或相对路径/warehouse.db"`
- 脚本会复制商户、产品、库存、出入库记录、用户、权限等数据到 Neon，不重复插入已存在主键。

## 五、本地连接 Neon 测试运行
- 启动：
  - `export DATABASE_URL="<你的Neon Database URL>"`
  - `export SECRET_KEY="你的固定密钥"`
  - `python app.py`
- 浏览器打开 `http://localhost:5000`，使用 `admin/admin123` 登录测试。

## 六、部署到 Vercel（免费）
项目已包含 `vercel.json`，会把 `app.py` 部署为 Python Serverless Function。

- 方式 A（命令行）：
  - 安装 CLI：`npm i -g vercel`
  - 登录：`vercel login`
  - 部署：`vercel`
  - 首次部署后，在 Vercel 项目设置添加环境变量：
    - `DATABASE_URL`：Neon 完整连接串（含 `sslmode=require`）
    - `SECRET_KEY`：固定密钥（不要留空）
    - `ENABLE_ARCHIVE_EXPORT`：可选，默认不要开启（`false`）。Vercel 运行时文件系统不可持久，Excel 导出已默认关闭。

- 方式 B（GitHub 导入）：
  - 将代码推到 GitHub。
  - 在 Vercel Dashboard 选择 Import Project，选中仓库。
  - 在 `Settings -> Environment Variables` 设置同样的环境变量。
  - 点击 Deploy。

## 七、上线后验证
- 访问 Vercel 提供的域名。
- 登录 `admin/admin123`。
- 测试页面：产品、入库、出库、库存、记录、用户、商户。

## 八、注意事项与常见问题
- 文件存储：Vercel 不能持久写文件，已把“登录自动导出 Excel”关闭（`ENABLE_ARCHIVE_EXPORT=true` 仅临时写入，建议改成“点击导出并下载”）。
- 会话密钥：必须在 Vercel 设置 `SECRET_KEY`，否则每次冷启动随机密钥会导致登录失效。
- 数据库驱动：`requirements.txt` 已包含 `psycopg2-binary`，`DATABASE_URL` 使用 `postgresql://` 即可。
- 数据初始化：Vercel 无状态，不会自动跑 `db.create_all()`，务必使用 `scripts/setup_db.py` 在本地初始化一次。

## 九、回滚与备份建议
- 保留本地 `warehouse.db` 与 `warehouse_backup.db`。
- 回滚时将 `DATABASE_URL` 指向 SQLite（不推荐生产）或切换到另一个 Neon 分支。

---

完成以上步骤，即可把项目完整迁移到 Vercel（后端 Python Serverless）与 Neon PostgreSQL（云端数据库）。如遇错误，请将报错信息贴给我，我会继续帮你处理。