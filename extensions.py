from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager

# 独立扩展模块，避免循环依赖
db = SQLAlchemy()
login_manager = LoginManager()