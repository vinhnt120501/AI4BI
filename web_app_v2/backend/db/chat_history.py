import json
from datetime import datetime
from .connection import get_connection


def init_chat_history_table():
    conn = get_connection()
    cursor = conn.cursor()
    try:
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
            `blocks`             JSON,
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
        cursor.execute("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'chat_history' AND column_name = 'user_id'
        """)
        if cursor.fetchone()[0] == 0:
            cursor.execute("ALTER TABLE `chat_history` ADD COLUMN `user_id` VARCHAR(100) NOT NULL DEFAULT 'default_user' AFTER `id`")
            cursor.execute("CREATE INDEX idx_user_session ON `chat_history`(`user_id`, `session_id`)")
        cursor.execute("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'chat_history' AND column_name = 'blocks'
        """)
        if cursor.fetchone()[0] == 0:
            cursor.execute("ALTER TABLE `chat_history` ADD COLUMN `blocks` JSON AFTER `chart_config`")
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def save_chat(session_id: str, question: str, result: dict, user_id: str = "default_user"):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        sql_tokens = result.get("token_usage", {})
        reply_tokens = result.get("reply_token_usage", {})
        grand = result.get("grand_total", {})

        cursor.execute("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'chat_history' AND column_name = 'blocks'
        """)
        has_blocks = cursor.fetchone()[0] > 0

        if has_blocks:
            insert_sql = """INSERT INTO `chat_history`
        (user_id, session_id, created_at, question, sql_generated, thinking, reply,
         columns_data, rows_data, chart_config, blocks,
         token_sql_input, token_sql_thinking, token_sql_output, token_sql_total,
         token_reply_input, token_reply_thinking, token_reply_output, token_reply_total,
         token_grand_total)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""
            params = (
            user_id, session_id, datetime.now(), question,
            result.get("sql"), result.get("thinking"), result.get("reply"),
            json.dumps(result.get("columns"), ensure_ascii=False) if result.get("columns") else None,
            json.dumps(result.get("rows"), ensure_ascii=False) if result.get("rows") else None,
            json.dumps(result.get("chart_config"), ensure_ascii=False) if result.get("chart_config") else None,
            json.dumps(result.get("blocks"), ensure_ascii=False) if result.get("blocks") else None,
            sql_tokens.get("input", 0), sql_tokens.get("thinking", 0),
            sql_tokens.get("output", 0), sql_tokens.get("total", 0),
            reply_tokens.get("input", 0), reply_tokens.get("thinking", 0),
            reply_tokens.get("output", 0), reply_tokens.get("total", 0),
            grand.get("total", 0),
            )
        else:
            insert_sql = """INSERT INTO `chat_history`
        (user_id, session_id, created_at, question, sql_generated, thinking, reply,
         columns_data, rows_data, chart_config,
         token_sql_input, token_sql_thinking, token_sql_output, token_sql_total,
         token_reply_input, token_reply_thinking, token_reply_output, token_reply_total,
         token_grand_total)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""
            params = (
            user_id, session_id, datetime.now(), question,
            result.get("sql"), result.get("thinking"), result.get("reply"),
            json.dumps(result.get("columns"), ensure_ascii=False) if result.get("columns") else None,
            json.dumps(result.get("rows"), ensure_ascii=False) if result.get("rows") else None,
            json.dumps(result.get("chart_config"), ensure_ascii=False) if result.get("chart_config") else None,
            sql_tokens.get("input", 0), sql_tokens.get("thinking", 0),
            sql_tokens.get("output", 0), sql_tokens.get("total", 0),
            reply_tokens.get("input", 0), reply_tokens.get("thinking", 0),
            reply_tokens.get("output", 0), reply_tokens.get("total", 0),
            grand.get("total", 0),
            )

        cursor.execute(insert_sql, params)
        conn.commit()
    finally:
        cursor.close()
        conn.close()


def get_chat_history(session_id: str, limit: int = 50, user_id: str = "default_user", cross_session: bool = False) -> list:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
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
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


def count_chat_turns(user_id: str, session_id: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT COUNT(*) FROM `chat_history` WHERE user_id = %s AND session_id = %s",
            (user_id, session_id),
        )
        n = cursor.fetchone()[0]
        return int(n)
    finally:
        cursor.close()
        conn.close()
