import os
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
