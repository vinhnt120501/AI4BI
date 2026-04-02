import os
import json
from datetime import datetime
from pathlib import Path
import mysql.connector


SCHEMA_CONTEXT_FILE = Path(
    os.getenv("SCHEMA_CONTEXT_FILE", str(Path(__file__).parent / "schema_context.txt"))
)


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
    if not SCHEMA_CONTEXT_FILE.exists():
        raise FileNotFoundError(
            f"Schema context file not found: {SCHEMA_CONTEXT_FILE}. "
            "Run ensure_schema_context_file(refresh=True) once."
        )
    return SCHEMA_CONTEXT_FILE.read_text(encoding="utf-8")


def _fallback_column_description(column_name: str) -> str:
    return f"Mô tả: dữ liệu của cột `{column_name}`."


def _render_schema_context(rows: list[tuple[str, str, str, str]]) -> str:
    """
    rows: (table_name, column_name, data_type, column_comment)
    """
    lines = []
    current_table = None
    for table_name, column_name, data_type, column_comment in rows:
        if table_name != current_table:
            if current_table is not None:
                lines.append("")
            lines.append(f"TABLE: `{table_name}`")
            current_table = table_name
        description = (column_comment or "").strip() or _fallback_column_description(column_name)
        lines.append(f"- `{column_name}` | type={data_type} | {description}")
    return "\n".join(lines).strip()


def build_schema_context_file(output_path: Path | None = None) -> Path:
    target = output_path or SCHEMA_CONTEXT_FILE
    target.parent.mkdir(parents=True, exist_ok=True)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT table_name, column_name, data_type, column_comment
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name NOT LIKE %s
        ORDER BY table_name, ordinal_position
        """,
        ("%\\_metadata",),
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    content = _render_schema_context(rows)
    target.write_text(content, encoding="utf-8")
    return target


def ensure_schema_context_file(refresh: bool = False) -> Path:
    if refresh or not SCHEMA_CONTEXT_FILE.exists():
        return build_schema_context_file(SCHEMA_CONTEXT_FILE)
    return SCHEMA_CONTEXT_FILE


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
