import re
import statistics
from .connection import get_connection

_DANGEROUS_SQL = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|GRANT|REVOKE|EXEC|EXECUTE)\b",
    re.IGNORECASE,
)


def validate_sql(sql: str):
    stripped = sql.strip().rstrip(";").strip()
    if not stripped.upper().startswith(("SELECT", "WITH")):
        raise ValueError(f"Chỉ cho phép SELECT queries. Nhận được: {stripped[:50]}...")
    if _DANGEROUS_SQL.search(stripped):
        raise ValueError(f"SQL chứa lệnh nguy hiểm bị chặn: {stripped[:80]}...")


def execute_sql(sql: str) -> dict:
    validate_sql(sql)
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(sql)
    cols = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return {"columns": cols, "rows": [[str(v) for v in row] for row in rows]}


def compute_data_summary(columns: list[str], rows: list[list[str]]) -> dict:
    summary = {
        "total_rows": len(rows),
        "total_columns": len(columns),
        "columns": {},
    }
    for col_idx, col_name in enumerate(columns):
        col_values = [row[col_idx] for row in rows if col_idx < len(row)]
        numeric_values = []
        for v in col_values:
            try:
                numeric_values.append(float(v))
            except (ValueError, TypeError):
                continue
        if numeric_values and len(numeric_values) > len(col_values) * 0.5:
            col_summary = {
                "type": "numeric",
                "count": len(numeric_values),
                "sum": round(sum(numeric_values), 2),
                "mean": round(statistics.mean(numeric_values), 2),
                "min": round(min(numeric_values), 2),
                "max": round(max(numeric_values), 2),
            }
            if len(numeric_values) > 1:
                col_summary["stdev"] = round(statistics.stdev(numeric_values), 2)
                col_summary["median"] = round(statistics.median(numeric_values), 2)
            summary["columns"][col_name] = col_summary
        else:
            unique_values = list(set(col_values))
            summary["columns"][col_name] = {
                "type": "text",
                "count": len(col_values),
                "unique": len(unique_values),
                "sample_values": unique_values[:10],
            }
    return summary
