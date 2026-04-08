import os
from mysql.connector import pooling

_pool = None


def _get_pool():
    global _pool
    if _pool is None:
        _pool = pooling.MySQLConnectionPool(
            pool_name="ai4bi_pool",
            pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
            pool_reset_session=True,
            host=os.getenv("TIDB_HOST"),
            port=int(os.getenv("TIDB_PORT", "4000")),
            user=os.getenv("TIDB_USER"),
            password=os.getenv("TIDB_PASSWORD"),
            database=os.getenv("TIDB_DATABASE", "lc_aibi"),
            charset="utf8mb4",
            ssl_ca=os.getenv("TIDB_SSL_CA", "/etc/ssl/cert.pem"),
        )
    return _pool


def get_connection():
    return _get_pool().get_connection()
