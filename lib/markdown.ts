import { Marked, type Token, type Tokens, type TokenizerThis } from "marked";

export type TagToken = { type: "tag"; raw: string; value: string };
export type WikilinkToken = {
  type: "wikilink";
  raw: string;
  noteId: string;
  label: string;
};
export type UnderlineToken = {
  type: "underline";
  raw: string;
  text: string;
  tokens: Token[];
};
export type HighlightToken = {
  type: "highlight";
  raw: string;
  text: string;
  tokens: Token[];
};
export type SuperscriptToken = {
  type: "superscript";
  raw: string;
  text: string;
  tokens: Token[];
};
export type SubscriptToken = {
  type: "subscript";
  raw: string;
  text: string;
  tokens: Token[];
};

const marked = new Marked({ gfm: true, breaks: true });

marked.use({
  extensions: [
    {
      name: "tag",
      level: "inline",
      start(src: string) {
        const idx = src.indexOf("#");
        return idx === -1 ? undefined : idx;
      },
      tokenizer(src: string) {
        const match = /^#([a-zA-Z0-9_-]+)/.exec(src);
        if (match) {
          return { type: "tag", raw: match[0], value: match[1] } as TagToken;
        }
        return undefined;
      },
    },
    {
      name: "underline",
      level: "inline",
      start(src: string) {
        const idx = src.indexOf("++");
        return idx === -1 ? undefined : idx;
      },
      tokenizer(this: TokenizerThis, src: string) {
        const match = /^\+\+([^\n]+?)\+\+/.exec(src);
        if (match) {
          return {
            type: "underline",
            raw: match[0],
            text: match[1],
            tokens: this.lexer.inlineTokens(match[1]),
          } as UnderlineToken;
        }
        return undefined;
      },
    },
    {
      name: "highlight",
      level: "inline",
      start(src: string) {
        const idx = src.indexOf("==");
        return idx === -1 ? undefined : idx;
      },
      tokenizer(this: TokenizerThis, src: string) {
        const match = /^==([^\n]+?)==/.exec(src);
        if (match) {
          return {
            type: "highlight",
            raw: match[0],
            text: match[1],
            tokens: this.lexer.inlineTokens(match[1]),
          } as HighlightToken;
        }
        return undefined;
      },
    },
    {
      name: "superscript",
      level: "inline",
      start(src: string) {
        const idx = src.indexOf("^");
        return idx === -1 ? undefined : idx;
      },
      tokenizer(this: TokenizerThis, src: string) {
        const match = /^\^([^\^\n]+?)\^/.exec(src);
        if (match) {
          return {
            type: "superscript",
            raw: match[0],
            text: match[1],
            tokens: this.lexer.inlineTokens(match[1]),
          } as SuperscriptToken;
        }
        return undefined;
      },
    },
    {
      // single tilde — deliberately requires a non-tilde character right
      // after the opening delimiter, so it never eats the first ~ of a
      // ~~strikethrough~~ pair (marked's built-in del tokenizer still gets
      // first crack at those since this simply won't match there).
      name: "subscript",
      level: "inline",
      start(src: string) {
        const idx = src.indexOf("~");
        return idx === -1 ? undefined : idx;
      },
      tokenizer(this: TokenizerThis, src: string) {
        const match = /^~([^~\n]+?)~/.exec(src);
        if (match) {
          return {
            type: "subscript",
            raw: match[0],
            text: match[1],
            tokens: this.lexer.inlineTokens(match[1]),
          } as SubscriptToken;
        }
        return undefined;
      },
    },
    {
      name: "wikilink",
      level: "inline",
      start(src: string) {
        const idx = src.indexOf("[[");
        return idx === -1 ? undefined : idx;
      },
      tokenizer(src: string) {
        const match = /^\[\[([0-9a-fA-F-]{36})\|([^\]]+)\]\]/.exec(src);
        if (match) {
          return {
            type: "wikilink",
            raw: match[0],
            noteId: match[1],
            label: match[2],
          } as WikilinkToken;
        }
        return undefined;
      },
    },
  ],
  tokenizer: {
    // CommonMark treats any line indented 4+ spaces as a code block — a
    // well-known gotcha for anyone just trying to visually indent a line,
    // and redundant here since fenced ```blocks``` are the intentional,
    // discoverable way to write code. Returning undefined makes it fall
    // through to a normal paragraph instead; fenced blocks are handled by
    // a separate tokenizer method and are unaffected.
    code() {
      return undefined;
    },
  },
});

export function parseTokens(content: string): Token[] {
  return marked.lexer(content);
}

const TASK_RE = /^(\s*(?:[-*+])\s\[)( |x|X)(\])/;

export function toggleTaskItem(content: string, raw: string, occurrence: number): string {
  let fromIndex = 0;
  let count = 0;
  for (;;) {
    const idx = content.indexOf(raw, fromIndex);
    if (idx === -1) return content;
    if (count === occurrence) {
      const flipped = raw.replace(TASK_RE, (_m, pre, box, post) =>
        `${pre}${box.toLowerCase() === "x" ? " " : "x"}${post}`
      );
      return content.slice(0, idx) + flipped + content.slice(idx + raw.length);
    }
    fromIndex = idx + raw.length;
    count++;
  }
}

function inlineToPlainText(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  return tokens
    .map((tok) => {
      switch (tok.type) {
        case "tag":
          return `#${(tok as unknown as TagToken).value}`;
        case "wikilink":
          return (tok as unknown as WikilinkToken).label;
        case "image":
          return (tok as Tokens.Image).text || "";
        case "codespan":
          return (tok as Tokens.Codespan).text;
        case "text": {
          const t = tok as Tokens.Text;
          return t.tokens ? inlineToPlainText(t.tokens) : t.text;
        }
        case "link":
        case "strong":
        case "em":
        case "del": {
          const t = tok as Tokens.Link | Tokens.Strong | Tokens.Em | Tokens.Del;
          return inlineToPlainText(t.tokens);
        }
        case "underline":
          return inlineToPlainText((tok as unknown as UnderlineToken).tokens);
        case "highlight":
          return inlineToPlainText((tok as unknown as HighlightToken).tokens);
        case "superscript":
          return inlineToPlainText((tok as unknown as SuperscriptToken).tokens);
        case "subscript":
          return inlineToPlainText((tok as unknown as SubscriptToken).tokens);
        default:
          return "";
      }
    })
    .join("");
}

export function toPlainText(content: string): string {
  const tokens = parseTokens(content);
  const parts: string[] = [];
  for (const tok of tokens) {
    if (tok.type === "paragraph" || tok.type === "heading") {
      parts.push(inlineToPlainText((tok as Tokens.Paragraph | Tokens.Heading).tokens));
    } else if (tok.type === "code") {
      parts.push((tok as Tokens.Code).text);
    } else if (tok.type === "list") {
      for (const item of (tok as Tokens.List).items) {
        parts.push(inlineToPlainText(item.tokens.filter((t) => t.type !== "checkbox")));
      }
    } else if (tok.type === "blockquote") {
      parts.push(toPlainTextFromTokens((tok as Tokens.Blockquote).tokens));
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function toPlainTextFromTokens(tokens: Token[]): string {
  return tokens
    .map((tok) => {
      if (tok.type === "paragraph" || tok.type === "heading") {
        return inlineToPlainText((tok as Tokens.Paragraph | Tokens.Heading).tokens);
      }
      return "";
    })
    .join(" ");
}

export function extractTags(content: string): string[] {
  const tags = new Set<string>();
  const walk = (tokens: Token[] | undefined) => {
    if (!tokens) return;
    for (const tok of tokens) {
      if (tok.type === "tag") {
        tags.add((tok as unknown as TagToken).value.toLowerCase());
      }
      const withInline = tok as unknown as { tokens?: Token[] };
      if (withInline.tokens) walk(withInline.tokens);
      if (tok.type === "list") {
        for (const item of (tok as Tokens.List).items) walk(item.tokens);
      }
      if (tok.type === "table") {
        const table = tok as Tokens.Table;
        for (const cell of table.header) walk(cell.tokens);
        for (const row of table.rows) for (const cell of row) walk(cell.tokens);
      }
    }
  };
  walk(parseTokens(content));
  return [...tags];
}
