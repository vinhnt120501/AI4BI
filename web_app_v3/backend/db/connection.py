import os
from mysql.connector import Error as MySQLError
from mysql.connector import pooling

_pool = None


def _truthy(x: str | None) -> bool:
    return str(x or "").strip().lower() in {"1", "true", "yes", "on"}


def _build_pool_kwargs() -> dict:
    # Only pass ssl_ca when explicitly configured. The previous default path is
    # Linux-specific and can break on Windows / non-SSL setups.
    kwargs = {}
    ssl_ca = (os.getenv("TIDB_SSL_CA") or "").strip()
    if ssl_ca:
        kwargs["ssl_ca"] = ssl_ca
    return kwargs


def _create_pool() -> pooling.MySQLConnectionPool:
    return pooling.MySQLConnectionPool(
        pool_name="ai4bi_pool",
        pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
        # Avoid raising during connection release when the server has dropped an idle connection.
        # You can turn it back on by setting DB_POOL_RESET_SESSION=true.
        pool_reset_session=_truthy(os.getenv("DB_POOL_RESET_SESSION", "false")),
        host=os.getenv("TIDB_HOST"),
        port=int(os.getenv("TIDB_PORT", "4000")),
        user=os.getenv("TIDB_USER"),
        password=os.getenv("TIDB_PASSWORD"),
        database=os.getenv("TIDB_DATABASE", "lc_aibi"),
        charset="utf8mb4",
        **_build_pool_kwargs(),
    )


def _get_pool():
    global _pool
    if _pool is None:
        _pool = _create_pool()
    return _pool


def get_connection():
    global _pool
    # Retry once with a fresh pool if we hit a stale/dead connection.
    for attempt in (1, 2):
        try:
            conn = _get_pool().get_connection()
            try:
                # Ensure the checked-out connection is alive. This prevents
                # "MySQL Connection not available" later during reset/close.
                conn.ping(reconnect=True, attempts=1, delay=0)
            except Exception:
                # If ping fails, recreate pool and retry.
                raise
            return conn
        except MySQLError:
            if attempt == 1:
                _pool = None
                continue
            raise
        except Exception:
            if attempt == 1:
                _pool = None
                continue
            raise
