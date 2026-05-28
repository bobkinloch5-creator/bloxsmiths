// Lightweight Luau syntax checker.
//
// This is NOT a full parser — running a real Luau parser server-side is the
// gold standard, but pulling in a WASM build of luau/full-moon is heavy for an
// edge function. Instead we lex the source properly (correctly skipping
// comments and all Luau string forms, including long-bracket strings with
// equals signs like [==[ ... ]==]) and then check block/bracket balance on the
// remaining code tokens.
//
// The design goal is ZERO false positives on valid code. It is better to miss
// a real error than to block code that would actually compile — a false
// positive blocks a legitimate generation, which is worse than letting a rare
// edge case through to Studio. Every heuristic here errs toward "allow".

export type LuauSyntaxIssue = {
  message: string;
  // Approximate 1-based line where the problem was detected, when known.
  line?: number;
};

// Strip comments and strings, replacing them with whitespace of equal newline
// count so line numbers in any later analysis stay roughly aligned. Returns the
// "code only" view of the source.
function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;

  const isLongBracketOpen = (pos: number): number => {
    // Returns the number of '=' signs if src[pos] starts a long bracket
    // `[`, then zero or more `=`, then `[`. Returns -1 if not a long bracket.
    if (src[pos] !== "[") return -1;
    let j = pos + 1;
    let eq = 0;
    while (src[j] === "=") {
      eq++;
      j++;
    }
    if (src[j] === "[") return eq;
    return -1;
  };

  const skipLongBracket = (pos: number, level: number): number => {
    // pos is at the opening '['. Find the matching closing ]=...=]
    const close = "]" + "=".repeat(level) + "]";
    const end = src.indexOf(close, pos);
    if (end === -1) return n; // unterminated — consume to EOF
    return end + close.length;
  };

  while (i < n) {
    const c = src[i];

    // Line comment or long comment
    if (c === "-" && src[i + 1] === "-") {
      // Could be --[[ long comment ]] (with optional = levels)
      const afterDashes = i + 2;
      const level = isLongBracketOpen(afterDashes);
      if (level >= 0) {
        const endPos = skipLongBracket(afterDashes, level);
        // preserve newlines inside the comment for line alignment
        for (let k = i; k < endPos; k++) if (src[k] === "\n") out += "\n";
        i = endPos;
        continue;
      }
      // line comment — to end of line
      let j = i + 2;
      while (j < n && src[j] !== "\n") j++;
      i = j;
      continue;
    }

    // Long string [[ ... ]] / [=[ ... ]=]
    const longLevel = isLongBracketOpen(i);
    if (longLevel >= 0) {
      const endPos = skipLongBracket(i, longLevel);
      out += '""'; // collapse to an empty string token
      for (let k = i; k < endPos; k++) if (src[k] === "\n") out += "\n";
      i = endPos;
      continue;
    }

    // Quoted string (single or double)
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === quote) {
          j++;
          break;
        }
        if (src[j] === "\n") break; // unterminated single-line string; stop
        j++;
      }
      out += '""';
      i = j;
      continue;
    }

    out += c;
    i++;
  }

  return out;
}

// Count balanced block keywords on already-stripped code.
export function checkLuauSyntax(src: string): LuauSyntaxIssue | null {
  if (!src || !src.trim()) return { message: "empty script body" };

  const code = stripCommentsAndStrings(src);

  // Bracket balance (fast, high-confidence).
  const pairs: Array<[string, string, string]> = [
    ["(", ")", "parentheses"],
    ["{", "}", "braces"],
    ["[", "]", "square brackets"],
  ];
  for (const [open, close, label] of pairs) {
    const o = code.split(open).length - 1;
    const c = code.split(close).length - 1;
    if (o !== c) {
      return { message: `unbalanced ${label}: ${o} '${open}' vs ${c} '${close}'` };
    }
  }

  // Block-keyword balance.
  // Openers that require a matching `end`: function, if(+then), for/while(+do),
  // standalone do. We count `then`/`do` as the actual openers (so `elseif` and
  // the `then` after it don't double count) and `function`.
  const tokens = code.match(/\b[a-zA-Z_]\w*\b/g) ?? [];
  let functions = 0;
  let thens = 0;
  let dos = 0;
  let ends = 0;
  let elseifs = 0;
  let repeats = 0;
  let untils = 0;

  for (const t of tokens) {
    switch (t) {
      case "function":
        functions++;
        break;
      case "then":
        thens++;
        break;
      case "do":
        dos++;
        break;
      case "end":
        ends++;
        break;
      case "elseif":
        elseifs++;
        break;
      case "repeat":
        repeats++;
        break;
      case "until":
        untils++;
        break;
    }
  }

  // Each `elseif ... then` adds a `then` that does NOT open a new block.
  const adjustedThens = thens - elseifs;
  const openers = functions + adjustedThens + dos;

  if (openers !== ends) {
    return {
      message: `unbalanced blocks: ${openers} openers (function/then/do) vs ${ends} 'end' — check for a missing or extra 'end'`,
    };
  }
  if (repeats !== untils) {
    return {
      message: `unbalanced repeat/until: ${repeats} 'repeat' vs ${untils} 'until'`,
    };
  }

  return null;
}
