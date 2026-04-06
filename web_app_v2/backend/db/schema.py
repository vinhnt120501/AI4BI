import os
from pathlib import Path
from .connection import get_connection

SCHEMA_CONTEXT_FILE = Path(
    os.getenv("SCHEMA_CONTEXT_FILE", str(Path(__file__).resolve().parent.parent / "schema_context.txt"))
)


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


def get_all_tables():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SHOW TABLES")
    table_names = [row[0] for row in cursor.fetchall()]
    max_preview_rows = int(os.getenv("TABLE_PREVIEW_LIMIT", "100"))
    tables = {}
    for name in table_names:
        cursor.execute(f"SELECT * FROM `{name}` LIMIT {max_preview_rows}")
        cols = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        tables[name] = {"columns": cols, "rows": rows}
    cursor.close()
    conn.close()
    return tables
