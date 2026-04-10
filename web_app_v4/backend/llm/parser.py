import json
import re


def clean_sql(text: str) -> str:
    raw = (text or "").strip()
    if not raw:
        return ""

    # Remove markdown fences if any.
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    # Some models prepend a language tag line.
    if raw.lower().startswith("sql\n"):
        raw = raw.split("\n", 1)[1].strip()

    # Keep only from the first SQL keyword onward.
    m = re.search(r"\b(with|select)\b", raw, flags=re.IGNORECASE)
    if m:
        raw = raw[m.start():].strip()

    # Keep only the first statement; models sometimes append explanations after ';'.
    if ";" in raw:
        raw = raw.split(";", 1)[0].strip()

    # Heuristic cleanup for a very common failure mode: trailing UNION ALL with no following SELECT.
    raw_upper = raw.upper().rstrip()
    if raw_upper.endswith("UNION ALL"):
        raw = raw[: -len("UNION ALL")].rstrip()

    return raw.strip()


def parse_vis_config(text: str) -> tuple[str, dict | None, list | None]:
    chart_config = None
    blocks = None

    vis_match = re.search(r'VIS_CONFIG\s*:\s*(\[[\s\S]*?\])\s*(?:\n|$)', text)
    if not vis_match:
        vis_match = re.search(r'VIS_CONFIG\s*:\s*(\[[\s\S]*)', text)

    if vis_match:
        json_str = vis_match.group(1)
        bracket_count = 0
        in_string = False
        escape_next = False
        end_pos = 0

        for i, char in enumerate(json_str):
            if escape_next:
                escape_next = False
                continue
            if char == '\\':
                escape_next = True
                continue
            if char == '"':
                in_string = not in_string
                continue
            if not in_string:
                if char == '[':
                    bracket_count += 1
                elif char == ']':
                    bracket_count -= 1
                    if bracket_count == 0:
                        end_pos = i + 1
                        break

        if end_pos > 0:
            candidate = json_str[:end_pos]
            try:
                parsed_blocks = json.loads(candidate)
                if isinstance(parsed_blocks, list) and len(parsed_blocks) > 0:
                    blocks = parsed_blocks
                    for b in parsed_blocks:
                        if b.get("type") == "chart":
                            chart_config = {
                                "type": b.get("chartType", "bar"),
                                "xKey": b.get("xKey", ""),
                                "yKeys": b.get("yKeys", []),
                                "options": b.get("options"),
                            }
                            if chart_config["yKeys"]:
                                chart_config["yKey"] = chart_config["yKeys"][0]
                            break
            except json.JSONDecodeError as e:
                print(f"[PARSE_VIS_CONFIG] JSON parse error: {e}")

    if chart_config is None:
        chart_match = re.search(r'CHART_CONFIG\s*:\s*(\{.*\})', text)
        if chart_match:
            try:
                cfg = json.loads(chart_match.group(1))
                if "yKeys" not in cfg and "yKey" in cfg:
                    cfg["yKeys"] = [cfg["yKey"]]
                elif "yKeys" in cfg and "yKey" not in cfg:
                    cfg["yKey"] = cfg["yKeys"][0] if cfg["yKeys"] else ""
                chart_config = cfg
            except json.JSONDecodeError:
                pass

    clean_lines = []
    for line in text.split("\n"):
        stripped = line.strip()
        if re.search(r'(VIS_CONFIG|CHART_CONFIG)\s*:', stripped):
            continue
        if stripped.startswith("```") or stripped == "json":
            continue
        if stripped.startswith('[{') or (stripped.startswith('{') and 'type' in stripped):
            continue
        clean_lines.append(line)

    return "\n".join(clean_lines).strip(), chart_config, blocks


def parse_json_array(text: str) -> list[str]:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    match = re.search(r"\[[\s\S]*\]", raw)
    candidate = match.group(0) if match else raw
    try:
        parsed = json.loads(candidate)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return [item.strip() for item in parsed if isinstance(item, str) and item.strip()]
