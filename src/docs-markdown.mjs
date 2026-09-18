// Minimal markdown renderer for the public docs shelf.
// Supports the subset used by the curated repo docs: headings, paragraphs,
// fenced code, tables, single-level lists, blockquotes, and inline
// code / links / bold / italic. All source text is HTML-escaped before any
// tag is emitted, so document content can never inject markup.
const escapeHtml = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const slugify = (text) => {
  const slug = text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
};

function inline(text) {
  const codes = [];
  const withCodes = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  const out = withCodes
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      if (/^(https?:|\/|#)/.test(href)) {
        const external = /^https?:/.test(href)
          ? ' target="_blank" rel="noopener"'
          : "";
        return `<a href="${href}"${external}>${label}</a>`;
      }
      // Relative links into the repo docs folder are not served on the
      // site; keep the label readable instead of emitting a dead link.
      return `<span class="md-xref">${label}</span>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

// Heading text without inline markup, for TOC labels and slugs.
function plainHeading(text) {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

const isTableSeparator = (line) =>
  /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("---");

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function renderMarkdown(src, options = {}) {
  const lines = String(src ?? "").split("\n");
  const html = [];
  const toc = [];
  const usedIds = new Set();
  let ledePlaced = !options.lede;

  const headingId = (text) => {
    const base = slugify(plainHeading(text));
    let id = base;
    for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
    usedIds.add(id);
    return id;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = /^```(\S*)\s*$/.exec(line);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence
      const lang = fence[1] ? ` data-lang="${escapeHtml(fence[1])}"` : "";
      html.push(
        `<pre${lang}><code>${escapeHtml(body.join("\n"))}</code></pre>`,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      if (level === 1) {
        html.push(`<h1>${inline(text)}</h1>`);
        if (!ledePlaced) {
          html.push(`<p class="docs-lede">${inline(options.lede)}</p>`);
          ledePlaced = true;
        }
      } else {
        const id = headingId(text);
        html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
        if (level <= 3) toc.push({ level, id, text: plainHeading(text) });
      }
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      html.push("<hr />");
      i++;
      continue;
    }

    if (line.includes("|") && isTableSeparator(lines[i + 1] ?? "")) {
      const head = splitRow(line).map((cell) => `<th>${inline(cell)}</th>`);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(
          `<tr>${splitRow(lines[i])
            .map((cell) => `<td>${inline(cell)}</td>`)
            .join("")}</tr>`,
        );
        i++;
      }
      html.push(
        `<div class="docs-table"><table><thead><tr>${head.join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`,
      );
      continue;
    }

    const list = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (list && list[1].length < 3) {
      const ordered = /\d+\./.test(list[2]);
      const tag = ordered ? "ol" : "ul";
      const items = [];
      while (i < lines.length) {
        const current = lines[i];
        const marker = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(current);
        if (marker && marker[1].length < 3) {
          items.push([marker[3]]);
          i++;
          continue;
        }
        if (/^\s{2,}\S/.test(current) && items.length) {
          items[items.length - 1].push(current.trim());
          i++;
          continue;
        }
        break;
      }
      html.push(
        `<${tag}>${items
          .map((item) => `<li>${inline(item.join(" "))}</li>`)
          .join("")}</${tag}>`,
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      html.push(`<blockquote><p>${inline(body.join(" "))}</p></blockquote>`);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim()) {
      const next = lines[i];
      if (
        /^(#{1,4})\s/.test(next) ||
        /^```/.test(next) ||
        /^>\s?/.test(next) ||
        (/^(\s*)([-*]|\d+\.)\s+/.test(next) &&
          /^(\s*)([-*]|\d+\.)\s+/.exec(next)[1].length < 3) ||
        (next.includes("|") && isTableSeparator(lines[i + 1] ?? ""))
      ) {
        break;
      }
      para.push(next.trim());
      i++;
    }
    if (para.length) html.push(`<p>${inline(para.join(" "))}</p>`);
  }

  return { html: html.join("\n"), toc };
}
