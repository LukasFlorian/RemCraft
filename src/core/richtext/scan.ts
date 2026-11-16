/**
 * Low-level scanning helpers shared by the markup parser and the delimiter
 * finder, so both agree on which regions of a line are "protected" (code,
 * LaTeX, clozes, references, link targets) and never contain delimiters.
 */

/**
 * Finds the end of an inline LaTeX region opened by `$` at `start`.
 *
 * Heuristics (as in most Markdown dialects) prevent prices like "$5 and $10"
 * from being parsed as math: the opening `$` must be followed by a non-space,
 * the closing `$` must be preceded by a non-space and not followed by a digit.
 *
 * @returns Index of the closing `$` or -1.
 */
export function findInlineMathEnd(line: string, start: number): number {
  const first = line[start + 1];
  if (first === undefined || /\s/.test(first) || first === '$') return -1;
  for (let j = start + 1; j < line.length; j++) {
    const c = line[j];
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '$') {
      const prev = line[j - 1] ?? '';
      const next = line[j + 1] ?? '';
      if (!/\s/.test(prev) && !/\d/.test(next)) return j;
    }
  }
  return -1;
}

/**
 * If a protected region starts at `i`, returns the index just after it,
 * otherwise -1.
 */
export function protectedRegionEnd(line: string, i: number): number {
  if (line.startsWith('`', i)) {
    const end = line.indexOf('`', i + 1);
    return end === -1 ? -1 : end + 1;
  }
  if (line.startsWith('$$', i)) {
    const end = line.indexOf('$$', i + 2);
    return end === -1 ? -1 : end + 2;
  }
  if (line.startsWith('$', i)) {
    const end = findInlineMathEnd(line, i);
    return end === -1 ? -1 : end + 1;
  }
  if (line.startsWith('{{', i)) {
    const end = line.indexOf('}}', i + 2);
    if (end === -1) return -1;
    // Include an optional hint `{({...})}` directly after the cloze.
    if (line.startsWith('{({', end + 2)) {
      const hintEnd = line.indexOf('})}', end + 5);
      if (hintEnd !== -1) return hintEnd + 3;
    }
    return end + 2;
  }
  if (line.startsWith('[[', i)) {
    const end = line.indexOf(']]', i + 2);
    return end === -1 ? -1 : end + 2;
  }
  if (line.startsWith('](', i)) {
    const end = line.indexOf(')', i + 2);
    return end === -1 ? -1 : end + 1;
  }
  if (line.startsWith('<mark', i) || line.startsWith('</mark', i) || line.startsWith('<u>', i) || line.startsWith('</u>', i)) {
    const end = line.indexOf('>', i);
    return end === -1 ? -1 : end + 1;
  }
  return -1;
}
