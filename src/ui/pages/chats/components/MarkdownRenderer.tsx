import { useMemo } from "react";

type MarkdownRendererProps = {
  content: string;
  className?: string;
};

type ListBuffer = {
  type: "unordered" | "ordered";
  items: string[];
};

// Pre-compiled regex patterns - avoid recreation on each render/call
const INLINE_PATTERN =
  /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\)|\[[^\]]+\]|\([^)]+\))/;
const CRLF_PATTERN = /\r\n/g;
const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const QUOTE_PATTERN = /^>\s?/;
const UNORDERED_LIST_PATTERN = /^[-*+]\s+/;
const ORDERED_LIST_PATTERN = /^\d+\.\s+/;
const CODE_FENCE_START = "```";

function parseInline(text: string, keyPrefix: string): (JSX.Element | string)[] {
  const nodes: (JSX.Element | string)[] = [];
  let remaining = text;
  let index = 0;

  while (remaining.length > 0) {
    const match = INLINE_PATTERN.exec(remaining);
    if (!match || match.index === undefined) {
      if (remaining) {
        nodes.push(remaining);
      }
      break;
    }

    if (match.index > 0) {
      nodes.push(remaining.slice(0, match.index));
    }

    const token = match[0];
    const afterMatch = remaining.slice(match.index + token.length);
    const key = `${keyPrefix}-${index++}`;

    if (token.startsWith("**")) {
      const inner = token.slice(2, -2);
      nodes.push(<strong key={key}>{parseInline(inner, key)}</strong>);
    } else if (token[0] === "*" || token[0] === "_") {
      const inner = token.slice(1, -1);
      nodes.push(
        <em key={key} className="opacity-80">
          {parseInline(inner, key)}
        </em>,
      );
    } else if (token[0] === "`") {
      nodes.push(
        <code key={key} className="rounded bg-black/40 px-1 py-0.5">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token[0] === "[" && token.includes("](")) {
      // Link: [label](url)
      const closingBracket = token.indexOf("]");
      const label = token.slice(1, closingBracket);
      const url = token.slice(closingBracket + 2, -1);
      nodes.push(
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
        >
          {label}
        </a>,
      );
    } else if (token[0] === "[") {
      // Standalone [text] - render as italic with visible brackets
      const inner = token.slice(1, -1);
      nodes.push(
        <em key={key} className="opacity-80">
          [{parseInline(inner, key)}]
        </em>,
      );
    } else if (token[0] === "(") {
      // Standalone (text) - render as italic with visible parentheses
      const inner = token.slice(1, -1);
      nodes.push(
        <em key={key} className="opacity-80">
          ({parseInline(inner, key)})
        </em>,
      );
    }

    remaining = afterMatch;
  }

  return nodes;
}

function flushParagraph(buffer: string[], nodes: JSX.Element[], keyIndex: { value: number }): void {
  if (buffer.length === 0) return;
  const paragraphText = buffer.join("\n").trim();
  if (!paragraphText) {
    buffer.length = 0;
    return;
  }
  const key = `p-${keyIndex.value++}`;
  nodes.push(
    <p key={key} className="whitespace-pre-wrap break-words">
      {parseInline(paragraphText, key)}
    </p>,
  );
  buffer.length = 0;
}

function flushList(
  list: ListBuffer | null,
  nodes: JSX.Element[],
  keyIndex: { value: number },
): null {
  if (!list || list.items.length === 0) {
    return null;
  }
  const key = `list-${keyIndex.value++}`;
  const isOrdered = list.type === "ordered";
  const ListTag = isOrdered ? "ol" : "ul";
  const listClass = isOrdered ? "ml-5 space-y-1 list-decimal" : "ml-5 space-y-1 list-disc";

  nodes.push(
    <ListTag key={key} className={listClass}>
      {list.items.map((item, idx) => (
        <li key={idx} className="whitespace-pre-wrap">
          {parseInline(item.trim(), `${key}-${idx}`)}
        </li>
      ))}
    </ListTag>,
  );
  return null;
}

function flushQuote(quoteLines: string[], nodes: JSX.Element[], keyIndex: { value: number }): void {
  if (quoteLines.length === 0) return;
  const key = `quote-${keyIndex.value++}`;
  nodes.push(
    <blockquote key={key} className="border-l-2 border-white/20 pl-4 text-sm italic text-gray-300">
      {quoteLines.map((line, idx) => (
        <p key={idx} className="whitespace-pre-wrap">
          {parseInline(line.trim(), `${key}-${idx}`)}
        </p>
      ))}
    </blockquote>,
  );
  quoteLines.length = 0;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const nodes = useMemo(() => {
    const normalized = content.replace(CRLF_PATTERN, "\n");
    const lines = normalized.split("\n");
    const out: JSX.Element[] = [];
    const paragraphBuffer: string[] = [];
    const quoteBuffer: string[] = [];
    let listBuffer: ListBuffer | null = null;
    let inCodeBlock = false;
    let codeLang = "";
    const codeLines: string[] = [];
    const keyIndex = { value: 0 };

    const flushAll = () => {
      listBuffer = flushList(listBuffer, out, keyIndex);
      flushQuote(quoteBuffer, out, keyIndex);
      flushParagraph(paragraphBuffer, out, keyIndex);
    };

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine ?? "";
      const trimmedLine = line.trim();

      // Handle code block start
      if (!inCodeBlock && trimmedLine.startsWith(CODE_FENCE_START)) {
        // Skip malformed fences like ````
        if (trimmedLine.endsWith("````")) continue;

        // Check if it's a single-line code fence that closes itself
        if (trimmedLine !== CODE_FENCE_START && trimmedLine.endsWith(CODE_FENCE_START)) {
          continue;
        }

        flushAll();
        inCodeBlock = true;
        codeLang = trimmedLine.slice(3).trim();
        codeLines.length = 0;
        continue;
      }

      // Handle code block content and end
      if (inCodeBlock) {
        if (trimmedLine === CODE_FENCE_START) {
          const langClass = codeLang ? `language-${codeLang}` : "";
          out.push(
            <pre
              key={`code-${keyIndex.value++}`}
              className="overflow-x-auto rounded-2xl bg-black/70 p-4 text-xs text-emerald-100"
            >
              <code className={langClass}>{codeLines.join("\n")}</code>
            </pre>,
          );
          inCodeBlock = false;
          codeLang = "";
          codeLines.length = 0;
        } else {
          codeLines.push(rawLine);
        }
        continue;
      }

      // Empty line - flush all buffers
      if (trimmedLine === "") {
        flushAll();
        continue;
      }

      // Headings
      const headingMatch = HEADING_PATTERN.exec(line);
      if (headingMatch) {
        flushAll();
        const level = headingMatch[1].length;
        const HeadingTag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
        const key = `heading-${keyIndex.value++}`;
        out.push(
          <HeadingTag key={key} className="text-base font-semibold text-white">
            {parseInline(headingMatch[2].trim(), key)}
          </HeadingTag>,
        );
        continue;
      }

      // Blockquotes
      if (QUOTE_PATTERN.test(line)) {
        listBuffer = flushList(listBuffer, out, keyIndex);
        paragraphBuffer.length = 0;
        quoteBuffer.push(line.replace(QUOTE_PATTERN, ""));
        continue;
      }

      // Unordered lists
      if (UNORDERED_LIST_PATTERN.test(line)) {
        flushQuote(quoteBuffer, out, keyIndex);
        paragraphBuffer.length = 0;
        const item = line.replace(UNORDERED_LIST_PATTERN, "");
        if (!listBuffer || listBuffer.type !== "unordered") {
          listBuffer = flushList(listBuffer, out, keyIndex);
          listBuffer = { type: "unordered", items: [] };
        }
        listBuffer.items.push(item);
        continue;
      }

      // Ordered lists
      if (ORDERED_LIST_PATTERN.test(line)) {
        flushQuote(quoteBuffer, out, keyIndex);
        paragraphBuffer.length = 0;
        const item = line.replace(ORDERED_LIST_PATTERN, "");
        if (!listBuffer || listBuffer.type !== "ordered") {
          listBuffer = flushList(listBuffer, out, keyIndex);
          listBuffer = { type: "ordered", items: [] };
        }
        listBuffer.items.push(item);
        continue;
      }

      // Regular paragraph text
      listBuffer = flushList(listBuffer, out, keyIndex);
      flushQuote(quoteBuffer, out, keyIndex);
      paragraphBuffer.push(line);
    }

    // Final flush
    flushAll();

    // Handle unclosed code block
    if (inCodeBlock && codeLines.length > 0) {
      const langClass = codeLang ? `language-${codeLang}` : "";
      out.push(
        <pre
          key={`code-${keyIndex.value++}`}
          className="overflow-x-auto rounded-2xl bg-black/70 p-4 text-xs text-emerald-100"
        >
          <code className={langClass}>{codeLines.join("\n")}</code>
        </pre>,
      );
    }

    return out;
  }, [content]);

  return (
    <div className={`markdown-renderer space-y-3 text-sm leading-relaxed ${className}`}>
      {nodes}
    </div>
  );
}
