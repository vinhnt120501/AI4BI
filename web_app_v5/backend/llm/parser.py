import json
import re


def clean_sql(text: str) -> str:
    # Strip thinking tags first
    text = re.sub(r'<thinking>[\s\S]*?</thinking>', '', text, flags=re.IGNORECASE).strip()
    if text.startswith("```"):
        # Handle cases like ```sql ... ```
        lines = text.split("\n")
        if len(lines) > 1 and lines[0].strip().lower().startswith("```"):
            text = "\n".join(lines[1:]).rsplit("```", 1)[0].strip()
        else:
            text = text.strip("`").strip()
    # Remove leading 'sql' keyword if it remains
    if text.lower().startswith("sql"):
        text = text[3:].strip()
    return text.strip()


def parse_vis_config(text: str) -> tuple[str, dict | None, list | None]:
    # Strip thinking tags first
    text = re.sub(r'<(thinking|thought|reasoning)>[\s\S]*?<\/\1>', '', text, flags=re.IGNORECASE).strip()
    
    chart_config = None
    blocks = None

    # Find the start of VIS_CONFIG: [
    vis_match = re.search(r'VIS_CONFIG\s*:\s*\[', text, re.I)
    
    if vis_match:
        start_pos = vis_match.end() - 1 # include the [
        json_str = text[start_pos:]
        
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

    # 2. Fallback: If no VIS_CONFIG array found, try to find individual blocks on separate lines
    if not blocks:
        individual_blocks = []
        for line in text.split('\n'):
            line = line.strip()
            if line.startswith('{') and line.endswith('}') and '"type"' in line:
                try:
                    b = json.loads(line)
                    if "type" in b: individual_blocks.append(b)
                except: pass
        if individual_blocks:
            blocks = individual_blocks
            for b in individual_blocks:
                if b.get("type") == "chart" and not chart_config:
                    chart_config = {
                        "type": b.get("chartType", "bar"),
                        "xKey": b.get("xKey", ""),
                        "yKeys": b.get("yKeys", []),
                        "options": b.get("options"),
                    }
                    if chart_config["yKeys"]:
                        chart_config["yKey"] = chart_config["yKeys"][0]

    clean_lines = []
    # Identify the full original VIS_CONFIG string to remove it accurately
    full_vis_marker = ""
    if vis_match and end_pos > 0:
        full_vis_marker = text[vis_match.start() : vis_match.end() - 1 + end_pos]

    remaining_text = text
    if full_vis_marker:
        remaining_text = text.replace(full_vis_marker, "")

    for line in remaining_text.split("\n"):
        stripped = line.strip()
        if not stripped:
            clean_lines.append(line)
            continue
        if re.search(r'CHART_CONFIG\s*:', stripped):
            continue
        if stripped.startswith("```") or stripped == "json":
            continue
        # Skip lines that were parsed as individual blocks
        if stripped.startswith('{') and stripped.endswith('}') and '"type"' in stripped:
            try:
                b = json.loads(stripped)
                if "type" in b: continue
            except: pass
        if not full_vis_marker and (stripped.startswith('[{') or (stripped.startswith('{') and 'type' in stripped)):
            continue
        clean_lines.append(line)

    return "\n".join(clean_lines).strip(), chart_config, blocks


def stream_parse_blocks(text: str) -> list:
    """Finds balanced { } blocks within the first VIS_CONFIG:[ ] array found in text."""
    vis_match = re.search(r'VIS_CONFIG\s*:\s*\[', text, re.I)
    if not vis_match:
        return []
        
    start_pos = vis_match.end() - 1 # include the [
    content = text[start_pos:]
    
    blocks = []
    bracket_count = 0
    in_string = False
    escape_next = False
    block_start = -1
    
    # We only care about root-level { } inside the [ ]
    # The [ itself is at index 0 of content
    for i, char in enumerate(content):
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
            if char == '{':
                if bracket_count == 0:
                    block_start = i
                bracket_count += 1
            elif char == '}':
                bracket_count -= 1
                if bracket_count == 0 and block_start != -1:
                    block_str = content[block_start:i+1]
                    try:
                        blocks.append(json.loads(block_str))
                    except:
                        pass
                if bracket_count < 0: # end of array basically
                    break
            elif char == ']':
                if bracket_count == 0:
                    break
                    
    return blocks


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
