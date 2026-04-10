import os
from pathlib import Path
from dotenv import load_dotenv
import mysql.connector
from openai import OpenAI

load_dotenv(Path(__file__).parent / ".env")


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
    """Kết nối TiDB Cloud và trả về dict chứa toàn bộ tables với data."""
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
    """Lấy schema + metadata mô tả từ TiDB để làm context cho LLM."""
    conn = get_connection()
    cursor = conn.cursor()

    # Lấy danh sách bảng metadata
    cursor.execute("SHOW TABLES")
    all_tables = [row[0] for row in cursor.fetchall()]
    meta_tables = [t for t in all_tables if t.endswith("_metadata")]
    data_tables = [t for t in all_tables if not t.endswith("_metadata")]

    context = "Database: lc_aibi (MySQL/TiDB)\n\n"

    for table in data_tables:
        # Lấy cấu trúc cột
        cursor.execute(f"SHOW COLUMNS FROM `{table}`")
        columns = cursor.fetchall()

        context += f"## {table}\n"

        # Tìm metadata tương ứng
        meta_name = f"{table}_metadata"
        if meta_name in meta_tables:
            cursor.execute(f"SELECT column_name, data_type, description FROM `{meta_name}`")
            meta_rows = cursor.fetchall()
            meta_map = {r[0]: r[2] for r in meta_rows}
        else:
            meta_map = {}

        for col in columns:
            col_name, col_type = col[0], col[1]
            desc = meta_map.get(col_name, "")
            context += f"  - {col_name} ({col_type}): {desc}\n"
        context += "\n"

    cursor.close()
    conn.close()
    return context


def text_to_sql(question: str) -> dict:
    """Chuyển câu hỏi tự nhiên thành SQL, thực thi và trả về kết quả."""
    schema = get_schema_context()

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "Bạn là trợ lý chuyển câu hỏi tiếng Việt thành SQL cho database MySQL/TiDB.\n"
                    "CHỈ trả về câu SQL duy nhất, không giải thích, không markdown.\n"
                    "Luôn dùng backtick cho tên bảng và cột.\n\n"
                    f"Schema:\n{schema}"
                ),
            },
            {"role": "user", "content": question},
        ],
        temperature=0,
    )

    sql = response.choices[0].message.content.strip()
    # Loại bỏ markdown nếu có
    if sql.startswith("```"):
        sql = sql.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    # Thực thi SQL
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(sql)
    cols = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    return {"sql": sql, "columns": cols, "rows": rows}


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        question = " ".join(sys.argv[1:])
        result = text_to_sql(question)
        print(f"SQL: {result['sql']}\n")
        # In kết quả dạng bảng
        widths = [max(len(c), max((len(str(r[i])) for r in result["rows"]), default=0))
                  for i, c in enumerate(result["columns"])]
        print(" | ".join(c.ljust(w) for c, w in zip(result["columns"], widths)))
        print("-" * sum(w + 3 for w in widths))
        for row in result["rows"]:
            print(" | ".join(str(v).ljust(w) for v, w in zip(row, widths)))
        print(f"\n({len(result['rows'])} rows)")
    else:
        data = get_all_tables()
        for i, (name, info) in enumerate(data.items(), 1):
            print(f"{i}. {name}: {len(info['rows']):,} rows, {len(info['columns'])} columns")
        print(f"\nTổng: {len(data)} bảng")
