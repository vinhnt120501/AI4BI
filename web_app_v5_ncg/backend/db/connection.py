import os
from urllib.parse import urlparse
from mysql.connector import pooling

_pool = None
_configured = False
_metadata = {}

def get_metadata():
    global _metadata
    return _metadata

def is_configured():
    global _configured
    return _configured

def configure_pool(url: str):
    global _pool, _configured, _metadata
    parsed = urlparse(url)
    if parsed.scheme not in ["mysql", "mysql+pymysql"]:
        raise ValueError("Invalid URL scheme. Must be mysql://")
    
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 3306
    user = parsed.username or "root"
    password = parsed.password or ""
    database = parsed.path.lstrip("/") or "nova_consumer_demo"
    
    if _pool is not None:
        try:
            _pool._remove_connections()
        except:
            pass
            
    _pool = pooling.MySQLConnectionPool(
        pool_name="ai4bi_pool_dynamic",
        pool_size=int(os.getenv("DB_POOL_SIZE", "32")),
        pool_reset_session=True,
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        charset="utf8mb4",
        collation="utf8mb4_unicode_ci",
        use_unicode=True,
        use_pure=True
    )
    _configured = True
    _metadata = {
        "url": url,
        "host": host,
        "database": database,
        "user": user
    }

def disconnect_pool():
    global _pool, _configured, _metadata
    if _pool is not None:
        try:
            _pool._remove_connections()
        except:
            pass
    _pool = None
    _configured = False
    _metadata = {}

def get_connection():
    global _pool
    if not _configured or _pool is None:
        raise Exception("DATABASE_NOT_CONFIGURED")
    conn = _pool.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'")
        cursor.execute("SET CHARACTER SET utf8mb4")
        cursor.execute("SET character_set_connection=utf8mb4")
        cursor.execute("SET character_set_results=utf8mb4")
        cursor.execute("SET character_set_client=utf8mb4")
        cursor.close()
    except:
        pass
    return conn
