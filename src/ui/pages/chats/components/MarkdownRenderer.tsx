import { Fragment, useMemo } from "react";

type MarkdownRendererProps = {
  content: string;
  className?: string;
};

// @ts-ignore
type InlineChunk = {
  type: "text" | "bold" | "italic" | "code" | "link";
  value: string;
  href?: string;
};

type ListBuffer = {
  type: "unordered" | "ordered";
  items: string[];
};

function parseInline(text: string, keyPrefix: string): JSX.Element[] {
  const nodes: JSX.Element[] = [];
  let remaining = text;
  let index = 0;

  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^\)]+\))/;

  while (remaining.length > 0) {
    const match = remaining.match(pattern);
    if (!match || match.index === undefined) {
      if (remaining.length > 0) {
        nodes.push(
          <Fragment key={`${keyPrefix}-text-${index++}`}>
            {remaining}
          </Fragment>,
        );
      }
      break;
    }

    if (match.index > 0) {
      const leading = remaining.slice(0, match.index);
      nodes.push(
        <Fragment key={`${keyPrefix}-text-${index++}`}>
          {leading}
        </Fragment>,
      );
    }

    const token = match[0];
    const afterMatch = remaining.slice(match.index + token.length);

    if (token.startsWith("**") && token.endsWith("**")) {
      const inner = token.slice(2, -2);
      nodes.push(
        <strong key={`${keyPrefix}-bold-${index++}`}>
          {parseInline(inner, `${keyPrefix}-bold-${index}`)}
        </strong>,
      );
    } else if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
      const inner = token.slice(1, -1);
      nodes.push(
        <em key={`${keyPrefix}-italic-${index++}`} className="opacity-80">
          {parseInline(inner, `${keyPrefix}-italic-${index}`)}
        </em>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      const inner = token.slice(1, -1);
      nodes.push(
        <code key={`${keyPrefix}-code-${index++}`} className="rounded bg-black/40 px-1 py-0.5">
          {inner}
        </code>,
      );
    } else if (token.startsWith("[") && token.includes(")")) {
      const closingBracket = token.indexOf("]");
      const label = token.slice(1, closingBracket);
      const url = token.slice(closingBracket + 2, -1);
      nodes.push(
        <a
          key={`${keyPrefix}-link-${index++}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
        >
          {label}
        </a>,
      );
    }

    remaining = afterMatch;
  }

  return nodes;
}

function flushParagraph(
  buffer: string[],
  nodes: JSX.Element[],
  keyIndex: { value: number },
): void {
  if (!buffer.length) return;
  const paragraphText = buffer.join("\n").trim();
  if (!paragraphText) {
    buffer.length = 0;
    return;
  }
  nodes.push(
    <p key={`p-${keyIndex.value++}`} className="whitespace-pre-wrap break-words">
      {parseInline(paragraphText, `p-${keyIndex.value}`)}
    </p>,
  );
  buffer.length = 0;
}

function flushList(
  list: ListBuffer | null,
  nodes: JSX.Element[],
  keyIndex: { value: number },
): ListBuffer | null {
  if (!list || list.items.length === 0) {
    return null;
  }
  const ListTag = list.type === "ordered" ? "ol" : "ul";
  nodes.push(
    <ListTag
      key={`list-${keyIndex.value++}`}
      className={`ml-5 space-y-1 ${list.type === "ordered" ? "list-decimal" : "list-disc"}`}
    >
      {list.items.map((item, idx) => (
        <li key={`list-${keyIndex.value}-item-${idx}`} className="whitespace-pre-wrap">
          {parseInline(item.trim(), `list-${keyIndex.value}-${idx}`)}
        </li>
      ))}
    </ListTag>,
  );
  return null;
}

function flushQuote(
  quoteLines: string[],
  nodes: JSX.Element[],
  keyIndex: { value: number },
): void {
  if (!quoteLines.length) return;
  nodes.push(
    <blockquote
      key={`quote-${keyIndex.value++}`}
      className="border-l-2 border-white/20 pl-4 text-sm italic text-gray-300"
    >
      {quoteLines.map((line, idx) => (
        <p key={`quote-line-${keyIndex.value}-${idx}`} className="whitespace-pre-wrap">
          {parseInline(line.trim(), `quote-${keyIndex.value}-${idx}`)}
        </p>
      ))}
    </blockquote>,
  );
  quoteLines.length = 0;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const nodes = useMemo(() => {
    const normalized = content.replace(/\r\n/g, "\n");
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

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const rawLine = lines[lineIndex];
      const line = rawLine ?? "";

      if (line.trim().startsWith("```") && !line.trim().endsWith("```")) {
        flushAll();
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
        codeLines.length = 0;
        continue;
      }

      if (inCodeBlock) {
        if (line.trim() === "```") {
          out.push(
            <pre key={`code-${keyIndex.value++}`} className="overflow-x-auto rounded-2xl bg-black/70 p-4 text-xs text-emerald-100">
              <code className={`language-${codeLang}`.trim()}>{codeLines.join("\n")}</code>
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

      if (line.trim().startsWith("```")) {
        if (line.trim().endsWith("````")) {
          continue;
        }
        flushAll();
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
        codeLines.length = 0;
        continue;
      }

      if (line.trim() === "") {
        flushAll();
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flushAll();
        const level = headingMatch[1].length;
        const HeadingTag = (`h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements);
        out.push(
          <HeadingTag key={`heading-${keyIndex.value++}`} className="text-base font-semibold text-white">
            {parseInline(headingMatch[2].trim(), `heading-${keyIndex.value}`)}
          </HeadingTag>,
        );
        continue;
      }

      if (/^>\s?/.test(line)) {
        listBuffer = flushList(listBuffer, out, keyIndex);
        paragraphBuffer.length = 0;
        quoteBuffer.push(line.replace(/^>\s?/, ""));
        continue;
      }

      if (/^[-*+]\s+/.test(line)) {
        flushQuote(quoteBuffer, out, keyIndex);
        paragraphBuffer.length = 0;
        const item = line.replace(/^[-*+]\s+/, "");
        if (!listBuffer || listBuffer.type !== "unordered") {
          listBuffer = { type: "unordered", items: [] };
        }
        listBuffer.items.push(item);
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        flushQuote(quoteBuffer, out, keyIndex);
        paragraphBuffer.length = 0;
        const item = line.replace(/^\d+\.\s+/, "");
        if (!listBuffer || listBuffer.type !== "ordered") {
          listBuffer = { type: "ordered", items: [] };
        }
        listBuffer.items.push(item);
        continue;
      }

      listBuffer = flushList(listBuffer, out, keyIndex);
      flushQuote(quoteBuffer, out, keyIndex);
      paragraphBuffer.push(line);
    }

    flushAll();
    if (inCodeBlock && codeLines.length > 0) {
      out.push(
        <pre key={`code-${keyIndex.value++}`} className="overflow-x-auto rounded-2xl bg-black/70 p-4 text-xs text-emerald-100">
          <code className={`language-${codeLang}`.trim()}>{codeLines.join("\n")}</code>
        </pre>,
      );
    }

    return out;
  }, [content]);

  return <div className={`markdown-renderer space-y-3 text-sm leading-relaxed ${className}`}>{nodes}</div>;
}
