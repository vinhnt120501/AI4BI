import os
import json
from datetime import datetime
import mysql.connector


def get_connection():
    return mysql.connector.connect(
        host=os.getenv("TIDB_HOST"),
        port=int(os.getenv("TIDB_PORT", "4000")),
        user=os.getenv("TIDB_USER"),
        password=os.getenv("TIDB_PASSWORD"),
        database=os.getenv("TIDB_DATABASE", "lc_aibi"),
        charset="utf8mb4",
        ssl_ca=os.getenv("TIDB_SSL_CA", "/etc/ssl/cert.pem"),
    )


def get_all_tables():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SHOW TABLES")
    table_names = [row[0] for row in cursor.fetchall()]

    tables = {}
    for name in table_names:
        cursor.execute(f"SELECT * FROM `{name}`")
        cols = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        tables[name] = {"columns": cols, "rows": rows}

    cursor.close()
    conn.close()
    return tables


def get_schema_context():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SHOW TABLES")
    all_tables = [row[0] for row in cursor.fetchall()]
    data_tables = [t for t in all_tables if not t.endswith("_metadata")]

    lines = []
    for table in data_tables:
        cursor.execute(
            f"SELECT column_name FROM information_schema.columns "
            f"WHERE table_schema='lc_aibi' AND table_name='{table}' "
            f"ORDER BY ordinal_position"
        )
        cols = [r[0] for r in cursor.fetchall()]
        lines.append(f"{table}({', '.join(cols)})")

    cursor.close()
    conn.close()
    return "\n".join(lines)


def execute_sql(sql: str) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(sql)
    cols = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return {"columns": cols, "rows": [[str(v) for v in row] for row in rows]}


def init_chat_history_table():
    """Tạo bảng chat_history nếu chưa có."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS `chat_history` (
            `id`                 INT AUTO_INCREMENT PRIMARY KEY,
            `user_id`            VARCHAR(100) NOT NULL DEFAULT 'default_user',
            `session_id`         VARCHAR(100) NOT NULL,
            `created_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `question`           TEXT NOT NULL,
            `sql_generated`      TEXT,
            `thinking`           TEXT,
            `reply`              TEXT,
            `columns_data`       JSON,
            `rows_data`          JSON,
            `chart_config`       JSON,
            `token_sql_input`    INT DEFAULT 0,
            `token_sql_thinking` INT DEFAULT 0,
            `token_sql_output`   INT DEFAULT 0,
            `token_sql_total`    INT DEFAULT 0,
            `token_reply_input`    INT DEFAULT 0,
            `token_reply_thinking` INT DEFAULT 0,
            `token_reply_output`   INT DEFAULT 0,
            `token_reply_total`    INT DEFAULT 0,
            `token_grand_total`  INT DEFAULT 0,
            INDEX idx_user_session (user_id, session_id),
            INDEX idx_session (session_id),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)
    # Backward-compatible migration for existing table
    cursor.execute("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'chat_history' AND column_name = 'user_id'
    """)
    has_user_id = cursor.fetchone()[0] > 0
    if not has_user_id:
        cursor.execute("ALTER TABLE `chat_history` ADD COLUMN `user_id` VARCHAR(100) NOT NULL DEFAULT 'default_user' AFTER `id`")
        cursor.execute("CREATE INDEX idx_user_session ON `chat_history`(`user_id`, `session_id`)")
    conn.commit()
    cursor.close()
    conn.close()


def init_memory_facts_table():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS `memory_facts` (
            `id`           INT AUTO_INCREMENT PRIMARY KEY,
            `user_id`      VARCHAR(100) NOT NULL,
            `session_id`   VARCHAR(100) NOT NULL,
            `category`     VARCHAR(50) NOT NULL,
            `content`      TEXT NOT NULL,
            `importance`   TINYINT NOT NULL DEFAULT 1,
            `source_type`  VARCHAR(50) NOT NULL DEFAULT 'fact_extraction',
            `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_mem_user_created (`user_id`, `created_at`),
            INDEX idx_mem_user_category (`user_id`, `category`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)
    conn.commit()
    cursor.close()
    conn.close()


def save_chat(session_id: str, question: str, result: dict, user_id: str = "default_user"):
    """Lưu toàn bộ thông tin 1 lần chat vào database."""
    conn = get_connection()
    cursor = conn.cursor()

    sql_tokens = result.get("token_usage", {})
    reply_tokens = result.get("reply_token_usage", {})
    grand = result.get("grand_total", {})

    cursor.execute(
        """INSERT INTO `chat_history`
        (user_id, session_id, created_at, question, sql_generated, thinking, reply,
         columns_data, rows_data, chart_config,
         token_sql_input, token_sql_thinking, token_sql_output, token_sql_total,
         token_reply_input, token_reply_thinking, token_reply_output, token_reply_total,
         token_grand_total)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (
            user_id,
            session_id,
            datetime.now(),
            question,
            result.get("sql"),
            result.get("thinking"),
            result.get("reply"),
            json.dumps(result.get("columns"), ensure_ascii=False) if result.get("columns") else None,
            json.dumps(result.get("rows"), ensure_ascii=False) if result.get("rows") else None,
            json.dumps(result.get("chart_config"), ensure_ascii=False) if result.get("chart_config") else None,
            sql_tokens.get("input", 0),
            sql_tokens.get("thinking", 0),
            sql_tokens.get("output", 0),
            sql_tokens.get("total", 0),
            reply_tokens.get("input", 0),
            reply_tokens.get("thinking", 0),
            reply_tokens.get("output", 0),
            reply_tokens.get("total", 0),
            grand.get("total", 0),
        ),
    )
    conn.commit()
    cursor.close()
    conn.close()


def get_chat_history(session_id: str, limit: int = 50, user_id: str = "default_user", cross_session: bool = False) -> list:
    """Lấy lịch sử chat theo session_id."""
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    if cross_session:
        cursor.execute(
            "SELECT * FROM `chat_history` WHERE user_id = %s ORDER BY created_at DESC LIMIT %s",
            (user_id, limit),
        )
    else:
        cursor.execute(
            "SELECT * FROM `chat_history` WHERE user_id = %s AND session_id = %s ORDER BY created_at DESC LIMIT %s",
            (user_id, session_id, limit),
        )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows


def count_chat_turns(user_id: str, session_id: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM `chat_history` WHERE user_id = %s AND session_id = %s",
        (user_id, session_id),
    )
    n = cursor.fetchone()[0]
    cursor.close()
    conn.close()
    return int(n)


def insert_memory_fact(
    user_id: str,
    session_id: str,
    category: str,
    content: str,
    importance: int = 1,
    source_type: str = "fact_extraction",
) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO `memory_facts`
        (user_id, session_id, category, content, importance, source_type, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (user_id, session_id, category, content, importance, source_type, datetime.now()),
    )
    conn.commit()
    new_id = cursor.lastrowid
    cursor.close()
    conn.close()
    return int(new_id)


def get_memory_facts(user_id: str, limit: int = 20, query: str = "") -> list:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    if query:
        like = f"%{query}%"
        cursor.execute(
            """SELECT * FROM `memory_facts`
               WHERE user_id = %s AND content LIKE %s
               ORDER BY importance DESC, created_at DESC LIMIT %s""",
            (user_id, like, limit),
        )
    else:
        cursor.execute(
            """SELECT * FROM `memory_facts`
               WHERE user_id = %s
               ORDER BY importance DESC, created_at DESC LIMIT %s""",
            (user_id, limit),
        )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows


def delete_memory_fact(user_id: str, memory_id: int) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM `memory_facts` WHERE user_id = %s AND id = %s", (user_id, memory_id))
    deleted = cursor.rowcount
    conn.commit()
    cursor.close()
    conn.close()
    return int(deleted)


def reset_memory_facts(user_id: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM `memory_facts` WHERE user_id = %s", (user_id,))
    deleted = cursor.rowcount
    conn.commit()
    cursor.close()
    conn.close()
    return int(deleted)
