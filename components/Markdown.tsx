"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Token, Tokens } from "marked";
import hljs from "highlight.js";
import { Copy, Check, X, Paperclip } from "lucide-react";
import Tooltip from "@/components/Tooltip";
import {
  parseTokens,
  toggleTaskItem,
  type TagToken,
  type WikilinkToken,
  type UnderlineToken,
  type HighlightToken,
  type SuperscriptToken,
  type SubscriptToken,
  type SpoilerToken,
} from "@/lib/markdown";

type Props = {
  content: string;
  onTagClick: (tag: string) => void;
  onLinkClick: (noteId: string) => void;
  onChangeContent?: (newContent: string) => void;
};

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      return escapeHtml(code);
    }
  }, [code, lang]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable, ignore
    }
  }

  return (
    <div className="my-1 rounded-lg overflow-hidden border border-neutral-800 bg-[#0d1117]">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-neutral-400 bg-black/30">
        <span>{lang || "text"}</span>
        <Tooltip label={copied ? "Copied!" : "Copy code"}>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 p-1.5 -m-1.5 hover:text-white"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </Tooltip>
      </div>
      <pre className="overflow-x-auto p-3 text-sm">
        <code className="font-mono hljs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

function Heading({ depth, children }: { depth: number; children: ReactNode }) {
  const className =
    depth === 1
      ? "text-xl font-bold"
      : depth === 2
        ? "text-lg font-bold"
        : "text-base font-semibold";
  switch (depth) {
    case 1:
      return <h1 className={className}>{children}</h1>;
    case 2:
      return <h2 className={className}>{children}</h2>;
    case 3:
      return <h3 className={className}>{children}</h3>;
    case 4:
      return <h4 className={className}>{children}</h4>;
    case 5:
      return <h5 className={className}>{children}</h5>;
    default:
      return <h6 className={className}>{children}</h6>;
  }
}

function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed) {
    return <span className="rounded px-1 bg-neutral-500/15">{children}</span>;
  }
  return (
    <span
      onClick={() => setRevealed(true)}
      className="rounded px-1 bg-neutral-600 text-transparent selection:bg-neutral-600 cursor-pointer"
    >
      {children}
    </span>
  );
}

export default function Markdown({ content, onTagClick, onLinkClick, onChangeContent }: Props) {
  const tokens = useMemo(() => parseTokens(content), [content]);
  const occCounts = new Map<string, number>();
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxSrc) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxSrc(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxSrc]);

  function nextOccurrence(raw: string): number {
    const n = occCounts.get(raw) ?? 0;
    occCounts.set(raw, n + 1);
    return n;
  }

  function renderInline(toks: Token[] | undefined, keyPrefix = ""): ReactNode {
    if (!toks) return null;
    return toks.map((tok, i) => {
      const key = `${keyPrefix}${i}`;
      switch (tok.type) {
        case "text": {
          const t = tok as Tokens.Text;
          return t.tokens ? (
            <span key={key}>{renderInline(t.tokens, `${key}-`)}</span>
          ) : (
            <span key={key}>{t.text}</span>
          );
        }
        case "strong":
          return <strong key={key}>{renderInline((tok as Tokens.Strong).tokens, `${key}-`)}</strong>;
        case "em":
          return <em key={key}>{renderInline((tok as Tokens.Em).tokens, `${key}-`)}</em>;
        case "del":
          return <del key={key}>{renderInline((tok as Tokens.Del).tokens, `${key}-`)}</del>;
        case "underline":
          return (
            <u key={key}>
              {renderInline((tok as unknown as UnderlineToken).tokens, `${key}-`)}
            </u>
          );
        case "highlight":
          return (
            <mark key={key} className="bg-gold-500/30 text-inherit rounded px-0.5">
              {renderInline((tok as unknown as HighlightToken).tokens, `${key}-`)}
            </mark>
          );
        case "superscript":
          return (
            <sup key={key}>
              {renderInline((tok as unknown as SuperscriptToken).tokens, `${key}-`)}
            </sup>
          );
        case "subscript":
          return (
            <sub key={key}>
              {renderInline((tok as unknown as SubscriptToken).tokens, `${key}-`)}
            </sub>
          );
        case "spoiler":
          return (
            <Spoiler key={key}>
              {renderInline((tok as unknown as SpoilerToken).tokens, `${key}-`)}
            </Spoiler>
          );
        case "codespan":
          return (
            <code
              key={key}
              className="rounded bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 text-[0.85em] font-mono"
            >
              {(tok as Tokens.Codespan).text}
            </code>
          );
        case "br":
          return <br key={key} />;
        case "image": {
          const img = tok as Tokens.Image;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={key}
              src={img.href}
              alt={img.text}
              title={img.title ?? undefined}
              onClick={() => setLightboxSrc(img.href)}
              className="max-h-80 rounded-lg my-1 block cursor-zoom-in"
            />
          );
        }
        case "link": {
          const link = tok as Tokens.Link;
          const isAttachment = link.href.includes("/api/uploads/") && link.text.startsWith("📎 ");
          if (isAttachment) {
            return (
              <a
                key={key}
                href={link.href}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:border-brand-400 no-underline"
              >
                <Paperclip size={12} className="shrink-0 text-neutral-400" />
                {link.text.replace(/^📎 /, "")}
              </a>
            );
          }
          return (
            <a
              key={key}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 underline"
            >
              {renderInline(link.tokens, `${key}-`) || link.text}
            </a>
          );
        }
        case "tag": {
          const t = tok as unknown as TagToken;
          return (
            <button
              key={key}
              onClick={() => onTagClick(t.value.toLowerCase())}
              className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
            >
              #{t.value}
            </button>
          );
        }
        case "wikilink": {
          const t = tok as unknown as WikilinkToken;
          return (
            <button
              key={key}
              onClick={() => onLinkClick(t.noteId)}
              className="text-violet-600 dark:text-violet-400 hover:underline font-medium"
            >
              [[{t.label}]]
            </button>
          );
        }
        case "escape":
          return <span key={key}>{(tok as Tokens.Escape).text}</span>;
        default:
          return null;
      }
    });
  }

  function renderListItemContent(toks: Token[], keyPrefix: string): ReactNode {
    return toks
      .filter((t) => t.type !== "checkbox")
      .map((t, i) => {
        const key = `${keyPrefix}-li-${i}`;
        if (t.type === "text") {
          const text = t as Tokens.Text;
          return <span key={key}>{renderInline(text.tokens ?? [text], `${key}-`)}</span>;
        }
        return <span key={key}>{renderBlock(t, key)}</span>;
      });
  }

  function renderBlock(tok: Token, key: string | number): ReactNode {
    switch (tok.type) {
      case "paragraph":
        return (
          <p key={key} className="whitespace-pre-wrap break-words">
            {renderInline((tok as Tokens.Paragraph).tokens, `${key}-`)}
          </p>
        );
      case "heading": {
        const h = tok as Tokens.Heading;
        return (
          <Heading key={key} depth={h.depth}>
            {renderInline(h.tokens, `${key}-`)}
          </Heading>
        );
      }
      case "code": {
        const c = tok as Tokens.Code;
        return <CodeBlock key={key} code={c.text} lang={c.lang || undefined} />;
      }
      case "hr":
        return <hr key={key} className="my-2 border-neutral-200 dark:border-neutral-800" />;
      case "blockquote":
        return (
          <blockquote
            key={key}
            className="border-l-2 border-neutral-300 dark:border-neutral-700 pl-3 my-1 text-neutral-600 dark:text-neutral-400 italic"
          >
            {(tok as Tokens.Blockquote).tokens.map((t, i) => renderBlock(t, `${key}-${i}`))}
          </blockquote>
        );
      case "table": {
        const table = tok as Tokens.Table;
        return (
          <div key={key} className="overflow-x-auto my-1">
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr>
                  {table.header.map((cell, i) => (
                    <th
                      key={i}
                      className="px-2 py-1 border-b-2 border-neutral-200 dark:border-neutral-700 text-left font-semibold"
                      style={cell.align ? { textAlign: cell.align } : undefined}
                    >
                      {renderInline(cell.tokens, `${key}-h${i}-`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-2 py-1 border-b border-neutral-100 dark:border-neutral-800"
                        style={cell.align ? { textAlign: cell.align } : undefined}
                      >
                        {renderInline(cell.tokens, `${key}-r${ri}c${ci}-`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case "list": {
        const list = tok as Tokens.List;
        const ListTag = list.ordered ? "ol" : "ul";
        return (
          <ListTag
            key={key}
            className={list.ordered ? "list-decimal pl-5 my-1 space-y-0.5" : "list-disc pl-5 my-1 space-y-0.5"}
          >
            {list.items.map((item, i) => {
              if (item.task) {
                const raw = item.raw;
                const occ = nextOccurrence(raw);
                return (
                  <li key={i} className="list-none -ml-5 flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={item.checked ?? false}
                      onChange={() =>
                        onChangeContent?.(toggleTaskItem(content, raw, occ))
                      }
                      className="mt-1 accent-brand-600"
                    />
                    <span
                      className={
                        item.checked
                          ? "line-through text-neutral-400 whitespace-pre-wrap break-words"
                          : "whitespace-pre-wrap break-words"
                      }
                    >
                      {renderListItemContent(item.tokens, `${key}-${i}`)}
                    </span>
                  </li>
                );
              }
              return (
                <li key={i} className="whitespace-pre-wrap break-words">
                  {renderListItemContent(item.tokens, `${key}-${i}`)}
                </li>
              );
            })}
          </ListTag>
        );
      }
      case "space":
        return null;
      default:
        return null;
    }
  }

  const BASE_GAP = 8; // px — matches the old space-y-2, used between any two blocks
  const EXTRA_PER_BLANK_LINE = 8; // px added per blank line beyond the first
  const MAX_EXTRA_BLANK_LINES = 4; // cap how far deliberate extra blank lines can push it

  // Markdown normally collapses any number of blank lines into one paragraph
  // break, but in a chat-style composer someone pressing Enter extra times is
  // a deliberate "give me more space here" — so unlike everywhere else, the
  // gap here scales with how many blank lines were actually typed.
  function extraGapBefore(index: number): number {
    const prev = tokens[index - 1];
    if (!prev || prev.type !== "space") return 0;
    const newlineCount = (prev.raw.match(/\n/g) ?? []).length;
    const blankLines = Math.max(0, newlineCount - 1);
    const extraBlankLines = Math.min(Math.max(0, blankLines - 1), MAX_EXTRA_BLANK_LINES);
    return extraBlankLines * EXTRA_PER_BLANK_LINE;
  }

  return (
    <>
      <div className="text-sm leading-relaxed">
        {tokens.map((t, i) => {
          if (t.type === "space") return null;
          const rendered = renderBlock(t, i);
          if (rendered === null) return null;
          const marginTop = i === 0 ? 0 : BASE_GAP + extraGapBefore(i);
          return (
            <div key={i} style={{ marginTop }}>
              {rendered}
            </div>
          );
        })}
      </div>
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 cursor-zoom-out"
        >
          <Tooltip label="Close" className="absolute top-3 right-3">
            <button
              onClick={() => setLightboxSrc(null)}
              className="p-2.5 text-white/70 hover:text-white"
              aria-label="Close"
            >
              <X size={22} />
            </button>
          </Tooltip>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxSrc}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-lg cursor-default"
          />
        </div>
      )}
    </>
  );
}
