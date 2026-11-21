// Fast, dependency-free CSV reader that reproduces csv-reader 1.0.0 exactly.
//
// The scanner walks UTF-16 code units once, left to right. Unquoted text is
// copied in runs (slice) and only split where a separator, CR or LF occurs;
// quoted text is likewise copied in runs and rewritten only where a quote or
// CR needs handling. No input is cached between calls.

const COMMA = 0;
const BREAK = 1;
const END = 2;

const QUOTE = 34;
const COMMA_CODE = 44;
const CR = 13;
const LF = 10;
const BOM = 0xfeff;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];

  let columns = null;
  let width = -1;
  let pos = 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  if (len > 0 && text.charCodeAt(0) === BOM) pos = 1;

  let value = '';
  let added = 0;

  function note(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field, starting with `prefix`, up to a comma, a line
  // break or the end. Leaves the field in `value` and the number of copied
  // characters in `added`, and returns COMMA, BREAK or END.
  function unquoted(prefix) {
    let out = prefix;
    let count = 0;
    let start = pos;
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === COMMA_CODE) {
        if (pos > start) {
          out += text.slice(start, pos);
          count += pos - start;
        }
        pos += 1;
        value = out;
        added = count;
        return COMMA;
      }
      if (c === LF) {
        if (pos > start) {
          out += text.slice(start, pos);
          count += pos - start;
        }
        pos += 1;
        line += 1;
        value = out;
        added = count;
        return BREAK;
      }
      if (c === CR) {
        if (pos > start) {
          out += text.slice(start, pos);
          count += pos - start;
        }
        if (pos + 1 < len && text.charCodeAt(pos + 1) === LF) {
          pos += 2;
          line += 1;
          value = out;
          added = count;
          return BREAK;
        }
        note('stray_cr');
        pos += 1;
        start = pos;
        continue;
      }
      pos += 1;
    }
    if (pos > start) {
      out += text.slice(start, pos);
      count += pos - start;
    }
    value = out;
    added = count;
    return END;
  }

  // Reads a field that opens with a quote at `pos`, unescaping doubled quotes
  // and folding CRLF / lone CR to LF. Leaves the field in `value` and returns
  // COMMA, BREAK or END. An unclosed quote is retried as unquoted text.
  function quoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let out = '';
    let start = pos;
    let closed = false;

    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === QUOTE) {
        if (pos + 1 < len && text.charCodeAt(pos + 1) === QUOTE) {
          out += text.slice(start, pos);
          out += '"';
          pos += 2;
          start = pos;
          continue;
        }
        out += text.slice(start, pos);
        pos += 1;
        closed = true;
        break;
      }
      if (c === CR) {
        out += text.slice(start, pos);
        out += '\n';
        line += 1;
        pos += pos + 1 < len && text.charCodeAt(pos + 1) === LF ? 2 : 1;
        start = pos;
        continue;
      }
      if (c === LF) {
        line += 1;
      }
      pos += 1;
    }

    if (!closed) {
      pos = open + 1;
      line = openLine;
      note('unterminated_quote');
      return unquoted('"');
    }

    value = out;
    if (pos >= len) return END;
    const c = text.charCodeAt(pos);
    if (c === COMMA_CODE) {
      pos += 1;
      return COMMA;
    }
    if (c === LF) {
      pos += 1;
      line += 1;
      return BREAK;
    }
    if (c === CR && pos + 1 < len && text.charCodeAt(pos + 1) === LF) {
      pos += 2;
      line += 1;
      return BREAK;
    }
    const ended = unquoted(out);
    if (added > 0) note('quote_junk');
    return ended;
  }

  for (;;) {
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === LF) {
        pos += 1;
        line += 1;
      } else if (c === CR && pos + 1 < len && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const fields = [];
    let wasQuoted;
    let ended;
    do {
      if (text.charCodeAt(pos) === QUOTE) {
        wasQuoted = true;
        ended = quoted();
        fields.push(value);
        continue;
      }
      wasQuoted = false;
      let out = '';
      let start = pos;
      for (;;) {
        if (pos >= len) {
          if (pos > start) out += text.slice(start, pos);
          ended = END;
          break;
        }
        const c = text.charCodeAt(pos);
        if (c === COMMA_CODE) {
          if (pos > start) out += text.slice(start, pos);
          pos += 1;
          ended = COMMA;
          break;
        }
        if (c === LF) {
          if (pos > start) out += text.slice(start, pos);
          pos += 1;
          line += 1;
          ended = BREAK;
          break;
        }
        if (c === CR) {
          if (pos > start) out += text.slice(start, pos);
          if (pos + 1 < len && text.charCodeAt(pos + 1) === LF) {
            pos += 2;
            line += 1;
            ended = BREAK;
            break;
          }
          note('stray_cr');
          pos += 1;
          start = pos;
          continue;
        }
        pos += 1;
      }
      fields.push(out);
    } while (ended === COMMA);

    // A line left with only stray CRs is not a record.
    if (fields.length === 1 && fields[0] === '' && !wasQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? columns ?? [] : null, rows, errors };
}
