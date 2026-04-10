'use client';

function isListItemLine(line: string) {
  return /^(\s*)([-*+]|(\d+[\.\)]))\s+/.test(line);
}

function isOrderedListItemLine(line: string) {
  return /^(\s*)(\d+[\.\)])\s+/.test(line);
}

function isMarkdownHeadingLine(line: string) {
  return /^#{1,6}\s+/.test(line.trim());
}

function isTableLine(line: string) {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith('|')) return true;
  // rough heuristic: markdown tables have multiple pipes
  const pipes = (t.match(/\|/g) || []).length;
  return pipes >= 2 && !t.startsWith('http');
}

function shouldSkipInlineTransform(line: string) {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith('```')) return true;
  if (isMarkdownHeadingLine(t)) return true;
  if (t.startsWith('>')) return true;
  if (isTableLine(t)) return true;
  return false;
}

function normalizeForMatch(text: string) {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[`"'”“’]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingMarker(line: string) {
  return line.replace(/^\s*(?:[-*+•]|\d+(?:\.\d+)*[.)])\s+/, '');
}

export function stripFollowUpSection(input: string, suggestions: string[] = []): string {
  if (!input) return input;

  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const sugNorms = (suggestions || []).map((s) => normalizeForMatch(s)).filter(Boolean);

  // 1) Prefer removing the whole "follow up questions" section if it exists.
  const isFollowupHeader = (line: string) => {
    const n = normalizeForMatch(line);
    const hasVi = n.includes('goi y') && n.includes('cau hoi') && n.includes('tiep theo');
    const hasEn = (n.includes('follow') && n.includes('question')) || n.includes('next question');
    return hasVi || hasEn;
  };

  const headerIdx = lines.findIndex((l) => isFollowupHeader(l));
  if (headerIdx >= 0) {
    let endIdx = lines.length;
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t) continue;
      // Stop if another major numbered section starts (e.g. "5. ...") or a markdown heading.
      if (/^\d+\.\s+\S/.test(t) || /^#{1,6}\s+\S/.test(t)) {
        endIdx = i;
        break;
      }
    }
    const kept = [...lines.slice(0, headerIdx), ...lines.slice(endIdx)];
    return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  if (sugNorms.length === 0) return input;

  // 2) Fallback: remove individual suggestion bullet lines if we can match them.
  const matchesSuggestion = (line: string) => {
    const core = stripLeadingMarker(line);
    const ln = normalizeForMatch(core);
    if (!ln) return false;
    return sugNorms.some((sn) => sn && (ln === sn || ln.includes(sn) || (sn.length > 24 && sn.includes(ln))));
  };

  const filtered = lines.filter((l) => !matchesSuggestion(l));
  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Make "section headings" easier to read by converting common patterns into bold markdown.
 * - Standalone headings: `Tổng quan:` -> `**Tổng quan:**`
 * - List headings: `- Tổng quan: ...` -> `- **Tổng quan:** ...`
 * - Context headings: `Tổng quan` followed by list -> `**Tổng quan**`
 *
 * This keeps code blocks unchanged and tries to avoid touching markdown tables.
 */
export function formatAssistantText(input: string): string {
  if (!input) return input;
  const lines = input.replace(/\r\n/g, '\n').split('\n');

  let inCode = false;
  const out: string[] = [];

  const findNextNonEmpty = (start: number) => {
    for (let i = start; i < lines.length; i++) {
      if (lines[i].trim()) return lines[i];
    }
    return '';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      out.push(line);
      continue;
    }

    if (inCode || shouldSkipInlineTransform(line)) {
      out.push(line);
      continue;
    }

    // Bold list "heading: content" (common in LLM outputs)
    if (isListItemLine(line)) {
      // Bold ordered-list titles: `1. Title...` => `1. **Title...**`
      if (isOrderedListItemLine(line) && !line.includes('**')) {
        const m = line.match(/^(\s*\d+[\.\)]\s+)([\s\S]+)$/);
        if (m) {
          const [, prefix, rest] = m;
          const restTrimmed = rest.trim();
          if (restTrimmed && restTrimmed.length <= 200 && !restTrimmed.startsWith('```')) {
            out.push(`${prefix}**${restTrimmed}**`);
            continue;
          }
        }
      }

      const m = line.match(/^(\s*(?:[-*+]|(?:\d+[\.\)]))\s+)([^:`*]{2,60}:)(\s+)([\s\S]*)$/);
      if (m) {
        const [, prefix, heading, space, rest] = m;
        out.push(`${prefix}**${heading}**${space}${rest}`);
        continue;
      }
      out.push(line);
      continue;
    }

    // Bold sub-section titles like "1.1 ..." even when not parsed as a markdown list
    // Example: `1.1 Nhóm A — ...: ...` -> `**1.1 Nhóm A — ...:** ...`
    if (!line.includes('**')) {
      const m = trimmed.match(/^(\d+(?:\.\d+)+)\s+(.+)$/);
      if (m) {
        const numberPrefix = m[1];
        const rest = m[2].trim();
        const colonIdx = rest.indexOf(':');
        const full = colonIdx >= 0 ? `${numberPrefix} ${rest.slice(0, colonIdx + 1)}` : `${numberPrefix} ${rest}`;
        const tail = colonIdx >= 0 ? rest.slice(colonIdx + 1) : '';
        const leadingWs = line.match(/^\s*/)?.[0] ?? '';
        out.push(colonIdx >= 0 ? `${leadingWs}**${full}**${tail}` : `${leadingWs}**${full}**`);
        continue;
      }
    }

    // Bold standalone "Heading:" lines
    if ((trimmed.endsWith(':') || trimmed.endsWith('：')) && trimmed.length <= 80 && !trimmed.includes('**')) {
      out.push(line.replace(trimmed, `**${trimmed}**`));
      continue;
    }

    // Bold a short standalone line when it precedes a list
    const nextNonEmpty = findNextNonEmpty(i + 1);
    if (
      trimmed.length >= 2 &&
      trimmed.length <= 60 &&
      !trimmed.includes('**') &&
      !trimmed.includes('`') &&
      isListItemLine(nextNonEmpty)
    ) {
      out.push(line.replace(trimmed, `**${trimmed}**`));
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}
