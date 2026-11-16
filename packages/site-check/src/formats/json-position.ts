// Where a JSON pointer points in the text of a JSON file, so a diagnostic can say `file:line:column`. A small
// scanner without dependencies: it walks the text along the pointer and never builds values. An object member
// is found at its key, an array item at its value. When the text is not valid JSON or the pointer does not
// resolve all the way, the position is that of the deepest part that does (the file start at worst).

/** A 1-based position in a text: line, and column in characters of that line. */
export interface TextPosition {
  line: number;
  column: number;
}

/** The segments of a JSON pointer (RFC 6901): "" is the whole document. */
export function pointerSegments(pointer: string): string[] {
  if (pointer === '') return [];
  return pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** The line and column of the text offset. */
export function positionAt(text: string, offset: number): TextPosition {
  const before = text.slice(0, offset);
  const lineStart = before.lastIndexOf('\n') + 1;
  const line = before.split('\n').length;
  return { line, column: [...before.slice(lineStart)].length + 1 };
}

/** The position of what `pointer` names in the JSON `text`. */
export function jsonPointerPosition(text: string, pointer: string): TextPosition {
  return positionAt(text, pointerOffset(text, pointerSegments(pointer)));
}

function pointerOffset(text: string, segments: readonly string[]): number {
  const scanner = new Scanner(text);
  let found = scanner.skipSpace();
  for (const segment of segments) {
    const next = scanner.enter(segment);
    if (next === null) return found;
    found = next;
  }
  return found;
}

class Scanner {
  private at = 0;

  constructor(private readonly text: string) {}

  skipSpace(): number {
    while (this.at < this.text.length && /\s/.test(this.text[this.at])) this.at += 1;
    return this.at;
  }

  /** Moves to the value of the member or item `segment` of the value here; its offset, or null when absent. */
  enter(segment: string): number | null {
    this.skipSpace();
    const open = this.text[this.at];
    if (open === '{') return this.enterObject(segment);
    if (open === '[') return this.enterArray(segment);
    return null;
  }

  private enterObject(key: string): number | null {
    this.at += 1;
    while (this.skipSpace() < this.text.length && this.text[this.at] === '"') {
      const keyOffset = this.at;
      const name = this.readString();
      if (name === null || !this.expect(':')) return null;
      this.skipSpace();
      if (name === key) return keyOffset;
      if (!this.skipValue() || !this.expect(',')) return null;
    }
    return null;
  }

  private enterArray(index: string): number | null {
    if (!/^(0|[1-9][0-9]*)$/.test(index)) return null;
    this.at += 1;
    for (let i = 0; this.skipSpace() < this.text.length && this.text[this.at] !== ']'; i += 1) {
      if (i === Number(index)) return this.at;
      if (!this.skipValue() || !this.expect(',')) return null;
    }
    return null;
  }

  /** Skips `char` (after blanks) when it is next; false otherwise (a separator missing: the container ended). */
  private expect(char: string): boolean {
    this.skipSpace();
    if (this.text[this.at] !== char) return false;
    this.at += 1;
    return true;
  }

  private readString(): string | null {
    const start = this.at;
    this.at += 1;
    while (this.at < this.text.length && this.text[this.at] !== '"') this.at += this.text[this.at] === '\\' ? 2 : 1;
    if (this.at >= this.text.length) return null;
    this.at += 1;
    try {
      return JSON.parse(this.text.slice(start, this.at)) as string;
    } catch {
      return null;
    }
  }

  private skipValue(): boolean {
    this.skipSpace();
    const char = this.text[this.at];
    if (char === '"') return this.readString() !== null;
    if (char === '{' || char === '[') return this.skipContainer();
    while (this.at < this.text.length && !/[\s,\]}]/.test(this.text[this.at])) this.at += 1;
    return true;
  }

  private skipContainer(): boolean {
    let depth = 0;
    while (this.at < this.text.length) {
      const char = this.text[this.at];
      if (char === '"') {
        if (this.readString() === null) return false;
        continue;
      }
      if (char === '{' || char === '[') depth += 1;
      if (char === '}' || char === ']') depth -= 1;
      this.at += 1;
      if (depth === 0) return true;
    }
    return false;
  }
}
