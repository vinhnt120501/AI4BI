import csv
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

try:
    import mysql.connector
except ImportError:
    print("Run: pip install -r requirements.txt")
    sys.exit(1)

TIDB_CONFIG = dict(
    host=os.getenv("TIDB_HOST"),
    port=int(os.getenv("TIDB_PORT", "4000")),
    user=os.getenv("TIDB_USER"),
    password=os.getenv("TIDB_PASSWORD"),
    database=os.getenv("TIDB_DATABASE", "test"),
    charset="utf8mb4",
    ssl_disabled=False,
    ssl_ca=os.getenv("TIDB_SSL_CA", "/etc/ssl/cert.pem"),
)

DATA_DIR = Path(__file__).parent / "mock_data"
SCHEMA_FILE = Path(__file__).parent / "init" / "01_schema.sql"

# Thứ tự load tôn trọng FK dependencies
JSON_TABLES = [
    ("view_genie_person",                        "person"),
    ("view_genie_shop",                          "shop"),
    ("view_genie_vaccine_product",               "vaccine_product"),
    ("view_genie_vaccine_shop_target",           "vaccine_shop_target"),
    ("view_genie_vaccine_sales_order_detail",    "vaccine_sales_order_detail"),
    ("view_genie_vaccine_returned_order_detail", "vaccine_returned_order_detail"),
]

CSV_FILES = [
    ("sample_central_rabie.csv", "sample_central_rabie"),
]

# Metadata files → mỗi file = 1 bảng riêng
METADATA_TABLES = [
    ("view_genie_person_metadata",                        "view_genie_person_metadata.json"),
    ("view_genie_shop_metadata",                          "view_genie_shop_metadata.json"),
    ("view_genie_vaccine_product_metadata",               "view_genie_vaccine_product_metadata.json"),
    ("view_genie_vaccine_shop_target_metadata",           "view_genie_vaccine_shop_target_metadata.json"),
    ("view_genie_vaccine_sales_order_detail_metadata",    "view_genie_vaccine_sales_order_detail_metadata.json"),
    ("view_genie_vaccine_returned_order_detail_metadata", "view_genie_vaccine_returned_order_detail_metadata.json"),
]


def create_schema(cursor):
    """Tạo database và chạy schema SQL."""
    cursor.execute("CREATE DATABASE IF NOT EXISTS lc_aibi")
    cursor.execute("USE lc_aibi")

    schema_sql = SCHEMA_FILE.read_text(encoding="utf-8")
    # Loại bỏ comment lines
    lines = [l for l in schema_sql.splitlines() if not l.strip().startswith("--")]
    clean_sql = "\n".join(lines)

    # Tách theo dấu ; ở cuối statement (sau dấu ngoặc đóng hoặc quote)
    import re
    statements = re.split(r";\s*\n", clean_sql)
    for stmt in statements:
        stmt = stmt.strip()
        if not stmt:
            continue
        try:
            cursor.execute(stmt)
            print(f"  OK: {stmt[:60]}...")
        except mysql.connector.Error as e:
            print(f"  Warning [{e.errno}]: {e.msg}")


def table_has_data(cursor, table_name):
    """Kiểm tra bảng đã có data chưa. Trả về số rows, 0 nếu bảng chưa tồn tại."""
    try:
        cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
        return cursor.fetchone()[0]
    except mysql.connector.Error:
        return 0


def create_csv_table(cursor, table_name, headers, sample_row):
    """Tự tạo bảng cho CSV dựa trên header."""
    cols = []
    for h in headers:
        cols.append(f"`{h}` VARCHAR(500)")
    ddl = f"CREATE TABLE IF NOT EXISTS `{table_name}` ({', '.join(cols)})"
    cursor.execute(ddl)


def load_json_table(cursor, table_name, records, batch_size=500):
    """Insert JSON records vào bảng."""
    if not records:
        print(f"  [SKIP] {table_name}: no records")
        return 0

    cols = list(records[0].keys())
    placeholders = ", ".join(["%s"] * len(cols))
    col_names = ", ".join(f"`{c}`" for c in cols)
    sql = f"INSERT INTO `{table_name}` ({col_names}) VALUES ({placeholders})"

    total = 0
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        rows = [tuple(r.get(c) for c in cols) for r in batch]
        cursor.executemany(sql, rows)
        total += len(batch)

    return total


def load_metadata_table(cursor, table_name, fpath):
    """Tạo 1 bảng riêng cho mỗi file metadata và import columns vào."""
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS `{table_name}` (
            `column_name`   VARCHAR(100) NOT NULL,
            `data_type`     VARCHAR(50),
            `nullable`      BOOLEAN,
            `is_primary_key` BOOLEAN,
            `description`   TEXT,
            `notes`         TEXT,
            PRIMARY KEY (`column_name`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    with open(fpath, encoding="utf-8") as f:
        meta = json.load(f)

    if "table" in meta and isinstance(meta["table"], dict):
        columns = meta.get("columns", [])
    else:
        columns = meta.get("columns", [])

    for col in columns:
        cursor.execute(
            f"INSERT INTO `{table_name}` VALUES (%s, %s, %s, %s, %s, %s)",
            (
                col.get("column_name"),
                col.get("data_type"),
                col.get("nullable"),
                col.get("is_primary_key"),
                col.get("description"),
                col.get("notes"),
            ),
        )

    return len(columns)


def load_csv_file(cursor, table_name, csv_path, batch_size=500):
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        records = list(reader)

    if not records:
        print(f"  [SKIP] {csv_path.name}: empty")
        return 0

    # Tạo bảng nếu chưa có
    create_csv_table(cursor, table_name, list(records[0].keys()), records[0])

    cols = list(records[0].keys())
    placeholders = ", ".join(["%s"] * len(cols))
    col_names = ", ".join(f"`{c}`" for c in cols)
    sql = f"INSERT INTO `{table_name}` ({col_names}) VALUES ({placeholders})"

    total = 0
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        rows = [tuple(r.get(c) for c in cols) for r in batch]
        cursor.executemany(sql, rows)
        total += len(batch)

    return total


def main():
    print("=" * 55)
    print("  Import mock data → TiDB Cloud")
    print("=" * 55)

    # Validate config
    if not TIDB_CONFIG["host"] or not TIDB_CONFIG["user"] or not TIDB_CONFIG["password"]:
        print("\nThiếu thông tin kết nối! Hãy tạo file .env với nội dung:")
        print("   TIDB_HOST=...\n   TIDB_PORT=4000\n   TIDB_USER=...\n   TIDB_PASSWORD=...\n")
        sys.exit(1)

    print(f"\nConnecting to {TIDB_CONFIG['host']}...")
    conn = mysql.connector.connect(**TIDB_CONFIG)
    cursor = conn.cursor()

    # 1) Tạo schema
    print("\n[1/4] Creating schema...")
    create_schema(cursor)
    conn.commit()

    # 2) Load JSON tables
    print("\n[2/4] Loading JSON data...")
    cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
    for table_name, suffix in JSON_TABLES:
        existing = table_has_data(cursor, table_name)
        if existing > 0:
            print(f"  [SKIP] {table_name}: đã có {existing:,} rows")
            continue
        json_path = DATA_DIR / f"view_genie_{suffix}_data.json"
        if not json_path.exists():
            print(f"  [SKIP] {json_path.name} not found")
            continue
        with open(json_path, encoding="utf-8") as f:
            records = json.load(f)
        count = load_json_table(cursor, table_name, records)
        conn.commit()
        print(f"  ✓ {table_name}: {count:,} rows")
    cursor.execute("SET FOREIGN_KEY_CHECKS = 1")

    # 3) Load metadata (mỗi file = 1 bảng riêng)
    print("\n[3/4] Loading metadata...")
    for table_name, fname in METADATA_TABLES:
        existing = table_has_data(cursor, table_name)
        if existing > 0:
            print(f"  [SKIP] {table_name}: đã có {existing:,} rows")
            continue
        fpath = DATA_DIR / fname
        if not fpath.exists():
            print(f"  [SKIP] {fname} not found")
            continue
        count = load_metadata_table(cursor, table_name, fpath)
        conn.commit()
        print(f"  ✓ {table_name}: {count} columns")

    # 4) Load CSV files
    print("\n[4/4] Loading CSV data...")
    for csv_name, table_name in CSV_FILES:
        existing = table_has_data(cursor, table_name)
        if existing > 0:
            print(f"  [SKIP] {table_name}: đã có {existing:,} rows")
            continue
        csv_path = DATA_DIR / csv_name
        if not csv_path.exists():
            print(f"  [SKIP] {csv_name} not found")
            continue
        count = load_csv_file(cursor, table_name, csv_path)
        conn.commit()
        print(f"  ✓ {table_name}: {count:,} rows")

    cursor.close()
    conn.close()
    print("\nImport data xong rồi em nhé!")


if __name__ == "__main__":
    main()
