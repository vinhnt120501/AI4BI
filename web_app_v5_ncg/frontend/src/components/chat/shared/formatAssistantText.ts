'use client';

function isListItemLine(line: string) {
  return /^(\s*)([-*+•·]|(\d+[\.\)]))\s+/.test(line);
}

function isOrderedListItemLine(line: string) {
  return /^(\s*)(\d+[\.\)])\s+/.test(line);
}

function isMarkdownHeadingLine(line: string) {
  // Treat "#Heading" (missing space) as a heading-like line so we can normalize it later.
  return /^#{1,6}(?!#)\s*\S/.test(line.trim());
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
  return line.replace(/^\s*(?:[-*+•·]|\d+(?:\.\d+)*[.)])\s+/, '');
}

function normalizeBulletMarker(line: string) {
  // Convert common non-markdown bullets into "-" so ReactMarkdown can render lists.
  return line.replace(/^(\s*)[•·]\s+/, '$1- ');
}

function countLeadingSpaces(line: string) {
  const m = line.match(/^\s*/);
  return m ? m[0].length : 0;
}

function computeHeadingShift(lines: string[]) {
  // Heuristic: chat content reads better when the first visible heading is H2.
  // If the model emits H1 or mixed heading levels after some intro text, shift all headings down by one.
  let inCode = false;
  let firstHeadingIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('```')) inCode = !inCode;
    if (inCode) continue;
    if (isMarkdownHeadingLine(t)) {
      firstHeadingIdx = i;
      break;
    }
  }

  if (firstHeadingIdx < 0) return 0;

  const leadHasText = lines.slice(0, firstHeadingIdx).some((l) => {
    const t = l.trim();
    if (!t) return false;
    if (t.startsWith('```')) return false;
    if (t.startsWith('>')) return false;
    if (isTableLine(t)) return false;
    if (isListItemLine(l)) return false;
    return true;
  });

  let h1Count = 0;
  let hasOtherHeading = false;
  inCode = false;
  for (const l of lines) {
    const t = l.trim();
    if (t.startsWith('```')) inCode = !inCode;
    if (inCode) continue;
    const m = t.match(/^(#{1,6})(?!#)\s*\S/);
    if (!m) continue;
    const level = m[1].length;
    if (level === 1) h1Count += 1;
    if (level >= 2) hasOtherHeading = true;
  }

  if (leadHasText || h1Count > 1 || (h1Count >= 1 && hasOtherHeading)) return 1;
  return 0;
}

function normalizeHeadingLine(line: string, shift: number) {
  const m = line.match(/^(\s*)(#{1,6})(?!#)\s*(\S[\s\S]*)$/);
  if (!m) return null;
  const [, indent, hashes, rest] = m;
  const level = hashes.length;
  const nextLevel = Math.min(6, Math.max(1, level + shift));
  const text = rest.trim();
  return `${indent}${'#'.repeat(nextLevel)} ${text}`.trimEnd();
}

export function stripFollowUpSection(input: string, suggestions: string[] = []): string {
  if (!input) return input;

  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const sugNorms = (suggestions || []).map((s) => normalizeForMatch(s)).filter(Boolean);

  // 1) Prefer removing the whole "follow up questions" section if it exists.
  const isFollowupHeader = (line: string) => {
    const n = normalizeForMatch(line);
    const hasVi = (n.includes('goi y') || n.includes('de xuat')) && n.includes('cau hoi') && (n.includes('tiep theo') || n.includes('drill'));
    const hasEn = (n.includes('follow') && n.includes('question')) || n.includes('next question') || n.includes('drill down');
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

  const headingShift = computeHeadingShift(lines);
  let inCode = false;
  let inTable = false;
  let orderedContextIndent: number | null = null;
  let orderedContextSawBlank = false;
  const out: string[] = [];

  const findNextNonEmpty = (start: number) => {
    for (let i = start; i < lines.length; i++) {
      if (lines[i].trim()) return lines[i];
    }
    return '';
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      out.push(line);
      continue;
    }

    if (inCode) {
      out.push(line);
      continue;
    }

    line = normalizeBulletMarker(line);
    trimmed = line.trim();

    // Maintain (and eventually expire) ordered-list context.
    if (!trimmed) {
      if (orderedContextIndent != null) orderedContextSawBlank = true;
    } else if (orderedContextIndent != null) {
      if (isOrderedListItemLine(line) && countLeadingSpaces(line) <= orderedContextIndent) {
        orderedContextIndent = countLeadingSpaces(line);
        orderedContextSawBlank = false;
      } else if (!isListItemLine(line) && orderedContextSawBlank && countLeadingSpaces(line) <= orderedContextIndent) {
        orderedContextIndent = null;
        orderedContextSawBlank = false;
      }
    }

    // Spacing for tables
    const tableLike = isTableLine(trimmed);
    if (tableLike) {
      if (!inTable && out.length > 0 && out[out.length - 1].trim()) {
        out.push('');
      }
      inTable = true;
    } else if (inTable) {
      if (trimmed) {
        out.push('');
      }
      inTable = false;
    }

    // Spacing + normalization for headings (fix missing space, and shift levels when needed)
    const normalizedHeading = normalizeHeadingLine(line, headingShift);
    if (normalizedHeading) {
      // Headings reset list context
      orderedContextIndent = null;
      orderedContextSawBlank = false;

      if (out.length > 0 && out[out.length - 1].trim()) out.push('');
      out.push(normalizedHeading);
      continue;
    }

    // Ensure spacing between paragraphs for better markdown rendering
    if (out.length > 0 && trimmed && !shouldSkipInlineTransform(line)) {
      const prevLine = out[out.length - 1].trim();
      // Avoid inserting blank lines inside lists (breaks hierarchy rendering).
      const prevIsList = isListItemLine(prevLine);
      const currIsList = isListItemLine(line);
      if (prevLine && !shouldSkipInlineTransform(prevLine) && !prevIsList && !currIsList) {
        // If both lines are normal text, ensure double newline
        out.push('');
      }
    }

    if (shouldSkipInlineTransform(line)) {
      out.push(line);
      continue;
    }

    // Bold list "heading: content" (common in LLM outputs)
    if (isListItemLine(line)) {
      // If we're inside an ordered list and see a bullet list at the same indent,
      // it's very often meant to be nested under the previous ordered item.
      if (orderedContextIndent != null) {
        const lead = countLeadingSpaces(line);
        const isBullet = /^(\s*)[-*+]\s+/.test(line);
        if (isBullet && lead <= orderedContextIndent) {
          line = `${' '.repeat(orderedContextIndent + 3)}${line.trimStart()}`;
        }
      }

      if (isOrderedListItemLine(line)) {
        orderedContextIndent = countLeadingSpaces(line);
        orderedContextSawBlank = false;
      }

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
    if ((trimmed.endsWith(':') || trimmed.endsWith('：')) && trimmed.length <= 80 && !trimmed.includes('**') && !trimmed.startsWith('#')) {
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
      !trimmed.startsWith('#') &&
      isListItemLine(nextNonEmpty)
    ) {
      out.push(line.replace(trimmed, `**${trimmed}**`));
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}
