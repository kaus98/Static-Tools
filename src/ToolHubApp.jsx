import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";

const COOKIE_DAYS = 30;

function setCookie(name, value, days = COOKIE_DAYS) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const matches = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return matches ? decodeURIComponent(matches[1]) : "";
}

function parseJsonSafely(input) {
  try {
    return { parsed: JSON.parse(input), error: null };
  } catch (error) {
    return { parsed: null, error: error.message };
  }
}

function flattenObject(input, prefix = "", result = {}) {
  if (Array.isArray(input)) {
    input.forEach((item, index) => {
      flattenObject(item, `${prefix}[${index}]`, result);
    });
    return result;
  }

  if (input && typeof input === "object") {
    Object.keys(input).forEach((key) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenObject(input[key], nextPrefix, result);
    });
    return result;
  }

  result[prefix || "value"] = input;
  return result;
}

function sortJsonDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonDeep);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = sortJsonDeep(value[key]);
        return acc;
      }, {});
  }

  return value;
}

function toCsv(rows) {
  if (!rows.length) {
    return "";
  }

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];

  rows.forEach((row) => {
    lines.push(headers.map((header) => escape(row[header])).join(","));
  });

  return lines.join("\n");
}

function decodeJwt(token) {
  const [header, payload] = token.split(".");
  if (!header || !payload) {
    throw new Error("Token must contain header.payload.signature parts.");
  }

  const decodePart = (part) => {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  };

  return {
    header: decodePart(header),
    payload: decodePart(payload)
  };
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "").trim();
  const normalized = clean.length === 3 ? clean.split("").map((x) => x + x).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  const intValue = parseInt(normalized, 16);
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255
  };
}

function rgbToHex(r, g, b) {
  const values = [r, g, b].map((value) => {
    const n = Number(value);
    if (Number.isNaN(n) || n < 0 || n > 255) {
      return null;
    }
    return Math.round(n).toString(16).padStart(2, "0");
  });

  if (values.some((value) => value === null)) {
    return null;
  }

  return `#${values.join("")}`.toUpperCase();
}

function ToolLayout({ title, description, children }) {
  return (
    <section className="tool-shell glass-card">
      <header className="tool-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

function JsonNode({ name, value, level = 0 }) {
  const paddingLeft = 12 + level * 14;

  if (Array.isArray(value)) {
    return (
      <div>
        <div className="json-node" style={{ paddingLeft }}>
          <strong>{name}</strong>: [{value.length}]
        </div>
        {value.map((item, index) => (
          <JsonNode key={`${name}-${index}`} name={index} value={item} level={level + 1} />
        ))}
      </div>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return (
      <div>
        <div className="json-node" style={{ paddingLeft }}>
          <strong>{name}</strong>: {'{'}{entries.length}{'}'}
        </div>
        {entries.map(([key, nested]) => (
          <JsonNode key={`${name}-${key}`} name={key} value={nested} level={level + 1} />
        ))}
      </div>
    );
  }

  return (
    <div className="json-node" style={{ paddingLeft }}>
      <strong>{name}</strong>: {String(value)}
    </div>
  );
}

function JsonValidator() {
  const [input, setInput] = useState('{\n  "message": "Hello JSON"\n}');
  const [result, setResult] = useState("");

  const validate = () => {
    const { error } = parseJsonSafely(input);
    setResult(error ? `Invalid JSON: ${error}` : "Valid JSON ✔");
  };

  return (
    <ToolLayout title="JSON Validator" description="Validate JSON and get parser diagnostics.">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
      <div className="row-actions">
        <button onClick={validate}>Validate</button>
      </div>
      {result && <p className={result.startsWith("Invalid") ? "status error" : "status success"}>{result}</p>}
    </ToolLayout>
  );
}

function JsonFormatter() {
  const [input, setInput] = useState('{\n  "name": "Tools",\n  "items": ["formatter", "minifier"]\n}');
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const handleTransform = (mode) => {
    const { parsed, error } = parseJsonSafely(input);
    if (error) {
      setStatus(`Invalid JSON: ${error}`);
      return;
    }

    if (mode === "format") {
      setOutput(JSON.stringify(parsed, null, 2));
      setStatus("Formatted JSON ready.");
    }

    if (mode === "minify") {
      setOutput(JSON.stringify(parsed));
      setStatus("Minified JSON ready.");
    }

    if (mode === "flatten") {
      setOutput(JSON.stringify(flattenObject(parsed), null, 2));
      setStatus("Flattened JSON ready.");
    }
  };

  return (
    <ToolLayout title="JSON Formatter / Minifier / Flattener" description="Format, minify, or flatten JSON payloads.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions">
        <button onClick={() => handleTransform("format")}>Format</button>
        <button onClick={() => handleTransform("minify")}>Minify</button>
        <button onClick={() => handleTransform("flatten")}>Flatten</button>
      </div>
      {status && <p className="status success">{status}</p>}
    </ToolLayout>
  );
}

function JsonExplorer() {
  const [input, setInput] = useState('{\n  "user": {\n    "name": "Kaus",\n    "roles": ["admin", "editor"]\n  }\n}');
  const [jsonTree, setJsonTree] = useState(null);
  const [error, setError] = useState("");

  const explore = () => {
    const { parsed, error: parseError } = parseJsonSafely(input);
    if (parseError) {
      setError(parseError);
      setJsonTree(null);
      return;
    }

    setError("");
    setJsonTree(parsed);
  };

  return (
    <ToolLayout title="JSON Explorer" description="Visual tree exploration for nested JSON.">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
      <div className="row-actions">
        <button onClick={explore}>Explore</button>
      </div>
      {error && <p className="status error">{error}</p>}
      {jsonTree !== null && <div className="json-tree glass-panel"><JsonNode name="root" value={jsonTree} /></div>}
    </ToolLayout>
  );
}

function JsonLinter() {
  const [input, setInput] = useState('{\n  "ok": true\n}');
  const [feedback, setFeedback] = useState([]);

  const lint = () => {
    const notes = [];
    const { parsed, error } = parseJsonSafely(input);

    if (error) {
      notes.push({ type: "error", text: error });
      setFeedback(notes);
      return;
    }

    notes.push({ type: "info", text: Array.isArray(parsed) ? "Root type: array" : "Root type: object" });
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length === 0) {
      notes.push({ type: "warning", text: "Root object has no keys." });
    }
    notes.push({ type: "success", text: "Lint completed." });
    setFeedback(notes);
  };

  return (
    <ToolLayout title="JSON Linter" description="Basic structural linting and parser checks.">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
      <div className="row-actions">
        <button onClick={lint}>Run Lint</button>
      </div>
      <ul className="lint-list">
        {feedback.map((item, index) => (
          <li key={index} className={`status ${item.type}`}>{item.text}</li>
        ))}
      </ul>
    </ToolLayout>
  );
}

function JsonSorter() {
  const [input, setInput] = useState('{\n  "z": 1,\n  "a": {"d": 5, "b": 2}\n}');
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  const sortKeys = () => {
    const { parsed, error: parseError } = parseJsonSafely(input);
    if (parseError) {
      setError(parseError);
      return;
    }

    setError("");
    setOutput(JSON.stringify(sortJsonDeep(parsed), null, 2));
  };

  return (
    <ToolLayout title="JSON Sorter" description="Sort JSON keys recursively.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions">
        <button onClick={sortKeys}>Sort Keys</button>
      </div>
      {error && <p className="status error">{error}</p>}
    </ToolLayout>
  );
}

function JsonToCsv() {
  const [input, setInput] = useState('[{"name":"Alex","age":28},{"name":"Sam","age":32}]');
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const convert = () => {
    const { parsed, error } = parseJsonSafely(input);
    if (error) {
      setStatus(error);
      return;
    }

    const rows = Array.isArray(parsed) ? parsed : [parsed];
    if (!rows.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      setStatus("JSON must be an object or array of objects.");
      return;
    }

    setOutput(toCsv(rows));
    setStatus("CSV generated.");
  };

  return (
    <ToolLayout title="JSON to CSV" description="Convert object arrays into CSV format.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions">
        <button onClick={convert}>Convert</button>
      </div>
      {status && <p className={status.includes("generated") ? "status success" : "status error"}>{status}</p>}
    </ToolLayout>
  );
}

function TextEditor() {
  const [text, setText] = useState("Write, edit, and transform your text here.");

  return (
    <ToolLayout title="Text Editor" description="Simple editor with quick operations.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea text-editor" />
      <div className="row-actions">
        <button onClick={() => setText(text.toUpperCase())}>Uppercase</button>
        <button onClick={() => setText(text.toLowerCase())}>Lowercase</button>
        <button onClick={() => setText(text.split("").reverse().join(""))}>Reverse</button>
        <button onClick={() => navigator.clipboard.writeText(text)}>Copy</button>
      </div>
    </ToolLayout>
  );
}

function TextDiffChecker() {
  const [left, setLeft] = useState("Line one\nLine two\nLine three");
  const [right, setRight] = useState("Line one\nLine changed\nLine three");

  const diffRows = useMemo(() => {
    const leftLines = left.split("\n");
    const rightLines = right.split("\n");
    const max = Math.max(leftLines.length, rightLines.length);
    const rows = [];

    for (let index = 0; index < max; index += 1) {
      const a = leftLines[index] ?? "";
      const b = rightLines[index] ?? "";
      rows.push({ a, b, same: a === b, line: index + 1 });
    }

    return rows;
  }, [left, right]);

  return (
    <ToolLayout title="Text Diff Checker" description="Compare two text blocks line-by-line.">
      <div className="split-grid">
        <textarea value={left} onChange={(e) => setLeft(e.target.value)} className="tool-textarea" />
        <textarea value={right} onChange={(e) => setRight(e.target.value)} className="tool-textarea" />
      </div>
      <div className="diff-table glass-panel">
        {diffRows.map((row) => (
          <div key={row.line} className={`diff-row ${row.same ? "same" : "changed"}`}>
            <span className="line-num">{row.line}</span>
            <span>{row.a}</span>
            <span>{row.b}</span>
          </div>
        ))}
      </div>
    </ToolLayout>
  );
}

function WordCounter() {
  const [text, setText] = useState("Count words and character details.");

  const metrics = useMemo(() => {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, "").length;
    const lines = text ? text.split("\n").length : 0;
    return { words, chars, charsNoSpace, lines };
  }, [text]);

  return (
    <ToolLayout title="Word Counter" description="Get instant text metrics.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea" />
      <div className="metrics-grid">
        <div className="glass-panel"><h4>Words</h4><p>{metrics.words}</p></div>
        <div className="glass-panel"><h4>Characters</h4><p>{metrics.chars}</p></div>
        <div className="glass-panel"><h4>No Spaces</h4><p>{metrics.charsNoSpace}</p></div>
        <div className="glass-panel"><h4>Lines</h4><p>{metrics.lines}</p></div>
      </div>
    </ToolLayout>
  );
}

function CaseConverter() {
  const [text, setText] = useState("convert this text");

  const toTitleCase = () => setText(text.toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase()));

  return (
    <ToolLayout title="Case Converter" description="Convert text to common casing styles.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea" />
      <div className="row-actions">
        <button onClick={() => setText(text.toLowerCase())}>lowercase</button>
        <button onClick={() => setText(text.toUpperCase())}>UPPERCASE</button>
        <button onClick={toTitleCase}>Title Case</button>
        <button onClick={() => setText(text.replace(/\s+/g, "_").toLowerCase())}>snake_case</button>
        <button onClick={() => setText(text.replace(/\s+/g, "-").toLowerCase())}>kebab-case</button>
      </div>
    </ToolLayout>
  );
}

function LineTools() {
  const [text, setText] = useState("pear\napple\npear\nbanana");

  const lines = text.split("\n");

  return (
    <ToolLayout title="Line Tools" description="Sort, trim, or deduplicate text lines.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea" />
      <div className="row-actions">
        <button onClick={() => setText([...lines].sort((a, b) => a.localeCompare(b)).join("\n"))}>Sort A-Z</button>
        <button onClick={() => setText([...lines].sort((a, b) => b.localeCompare(a)).join("\n"))}>Sort Z-A</button>
        <button onClick={() => setText(lines.map((line) => line.trim()).join("\n"))}>Trim Lines</button>
        <button onClick={() => setText([...new Set(lines)].join("\n"))}>Remove Duplicates</button>
      </div>
    </ToolLayout>
  );
}

function SlugGenerator() {
  const [text, setText] = useState("My Awesome Blog Title");

  const slug = useMemo(
    () =>
      text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-"),
    [text]
  );

  return (
    <ToolLayout title="Slug Generator" description="Generate URL-friendly slugs from text.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea" />
      <div className="glass-panel output-panel"><strong>Slug:</strong> {slug || "-"}</div>
    </ToolLayout>
  );
}

function LoremGenerator() {
  const [count, setCount] = useState(3);
  const [output, setOutput] = useState("");

  const bank = [
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    "Integer eu est vitae urna tempus vulputate nec sit amet leo.",
    "Aenean hendrerit enim id enim volutpat, vitae feugiat neque volutpat.",
    "Pellentesque habitant morbi tristique senectus et netus et malesuada.",
    "Vestibulum faucibus velit at purus convallis, vel interdum sem aliquet.",
    "Curabitur non purus at est pharetra faucibus sed ac purus."
  ];

  const generate = () => {
    const n = Math.max(1, Math.min(12, Number(count) || 1));
    setOutput(Array.from({ length: n }, (_, i) => bank[i % bank.length]).join("\n\n"));
  };

  return (
    <ToolLayout title="Lorem Ipsum Generator" description="Generate placeholder paragraphs quickly.">
      <div className="row-actions">
        <input type="number" min="1" max="12" value={count} onChange={(e) => setCount(e.target.value)} />
        <button onClick={generate}>Generate</button>
      </div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function Base64Tool() {
  const [input, setInput] = useState("hello world");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const encode = () => {
    setOutput(btoa(unescape(encodeURIComponent(input))));
    setStatus("Encoded");
  };

  const decode = () => {
    try {
      setOutput(decodeURIComponent(escape(atob(input))));
      setStatus("Decoded");
    } catch {
      setStatus("Invalid Base64 input");
    }
  };

  return (
    <ToolLayout title="Base64 Encoder / Decoder" description="Convert plain text to and from Base64.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions">
        <button onClick={encode}>Encode</button>
        <button onClick={decode}>Decode</button>
      </div>
      {status && <p className={status === "Invalid Base64 input" ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function UrlCodecTool() {
  const [input, setInput] = useState("https://example.com?q=hello world");
  const [output, setOutput] = useState("");

  const decode = () => {
    try {
      setOutput(decodeURIComponent(input));
    } catch {
      setOutput("Invalid encoded URL component.");
    }
  };

  return (
    <ToolLayout title="URL Encoder / Decoder" description="Encode and decode URL components.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions">
        <button onClick={() => setOutput(encodeURIComponent(input))}>Encode</button>
        <button onClick={decode}>Decode</button>
      </div>
    </ToolLayout>
  );
}

function HtmlEntitiesTool() {
  const [input, setInput] = useState("<div>Hello & Welcome</div>");
  const [output, setOutput] = useState("");

  const encode = () => {
    const div = document.createElement("div");
    div.innerText = input;
    setOutput(div.innerHTML);
  };

  const decode = () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, "text/html");
    setOutput(doc.documentElement.textContent || "");
  };

  return (
    <ToolLayout title="HTML Entity Encoder / Decoder" description="Escape or unescape HTML entities.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions">
        <button onClick={encode}>Encode HTML</button>
        <button onClick={decode}>Decode HTML</button>
      </div>
    </ToolLayout>
  );
}

function JwtDecoder() {
  const [token, setToken] = useState("");
  const [output, setOutput] = useState("");

  const decode = () => {
    try {
      const decoded = decodeJwt(token);
      setOutput(JSON.stringify(decoded, null, 2));
    } catch (error) {
      setOutput(`Error: ${error.message}`);
    }
  };

  return (
    <ToolLayout title="JWT Decoder" description="Decode JWT header and payload locally.">
      <textarea value={token} onChange={(e) => setToken(e.target.value)} className="tool-textarea" placeholder="Paste JWT token..." />
      <div className="row-actions">
        <button onClick={decode}>Decode</button>
      </div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function UuidGenerator() {
  const [versions, setVersions] = useState([]);

  const generate = () => {
    const newId = crypto.randomUUID();
    setVersions((prev) => [newId, ...prev].slice(0, 20));
  };

  useEffect(() => {
    generate();
  }, []);

  return (
    <ToolLayout title="UUID Generator" description="Generate RFC-compliant random UUIDs.">
      <div className="row-actions">
        <button onClick={generate}>Generate UUID</button>
      </div>
      <ul className="list-panel glass-panel">
        {versions.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
    </ToolLayout>
  );
}

function HashGenerator() {
  const [input, setInput] = useState("hash me");
  const [output, setOutput] = useState("");

  const generate = async () => {
    if (!crypto.subtle) {
      setOutput("Web Crypto API not available in this environment.");
      return;
    }

    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    setOutput(hash);
  };

  return (
    <ToolLayout title="SHA-256 Hash Generator" description="Create SHA-256 hashes in-browser.">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
      <div className="row-actions">
        <button onClick={generate}>Generate Hash</button>
      </div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function RegexTester() {
  const [pattern, setPattern] = useState("\\b\\w{4}\\b");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState("This line has many words with four size.");
  const [result, setResult] = useState("");

  const test = () => {
    try {
      const regex = new RegExp(pattern, flags);
      const matches = text.match(regex) || [];
      setResult(matches.length ? matches.join("\n") : "No matches");
    } catch (error) {
      setResult(`Error: ${error.message}`);
    }
  };

  return (
    <ToolLayout title="Regex Tester" description="Test regex pattern and flags against text.">
      <div className="split-grid split-grid-3">
        <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Pattern" />
        <input value={flags} onChange={(e) => setFlags(e.target.value)} placeholder="Flags" />
        <button onClick={test}>Run</button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea" />
      <textarea value={result} onChange={(e) => setResult(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function PasswordGenerator() {
  const [length, setLength] = useState(16);
  const [output, setOutput] = useState("");

  const generate = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}";
    const n = Math.max(6, Math.min(64, Number(length) || 16));
    const random = crypto.getRandomValues(new Uint32Array(n));
    const password = Array.from(random, (num) => chars[num % chars.length]).join("");
    setOutput(password);
  };

  return (
    <ToolLayout title="Password Generator" description="Generate secure random passwords.">
      <div className="row-actions">
        <input type="number" min="6" max="64" value={length} onChange={(e) => setLength(e.target.value)} />
        <button onClick={generate}>Generate</button>
      </div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function QueryStringTool() {
  const [input, setInput] = useState("name=Kaus&role=developer&city=Mumbai");
  const [output, setOutput] = useState("");

  const parse = () => {
    const params = new URLSearchParams(input.replace(/^\?/, ""));
    const object = {};
    params.forEach((value, key) => {
      if (object[key]) {
        object[key] = Array.isArray(object[key]) ? [...object[key], value] : [object[key], value];
      } else {
        object[key] = value;
      }
    });
    setOutput(JSON.stringify(object, null, 2));
  };

  const build = () => {
    const { parsed, error } = parseJsonSafely(input);
    if (error || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setOutput("Input must be a JSON object to build query string.");
      return;
    }

    const params = new URLSearchParams();
    Object.entries(parsed).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => params.append(key, String(item)));
      } else {
        params.append(key, String(value));
      }
    });

    setOutput(params.toString());
  };

  return (
    <ToolLayout title="Query String Parser / Builder" description="Parse query strings to JSON or build query strings from JSON.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions">
        <button onClick={parse}>Parse</button>
        <button onClick={build}>Build</button>
      </div>
    </ToolLayout>
  );
}

function TimestampConverter() {
  const [unix, setUnix] = useState(Math.floor(Date.now() / 1000));
  const [date, setDate] = useState(new Date().toISOString());

  const convertFromUnix = () => {
    const milliseconds = String(unix).length > 10 ? Number(unix) : Number(unix) * 1000;
    const parsedDate = new Date(milliseconds);
    setDate(Number.isNaN(parsedDate.getTime()) ? "Invalid timestamp" : parsedDate.toISOString());
  };

  const convertToUnix = () => {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      setUnix("Invalid date");
      return;
    }

    setUnix(Math.floor(parsed.getTime() / 1000));
  };

  return (
    <ToolLayout title="Timestamp Converter" description="Convert Unix timestamps and ISO date strings.">
      <div className="split-grid">
        <div>
          <label>Unix (seconds or milliseconds)</label>
          <input value={unix} onChange={(e) => setUnix(e.target.value)} />
          <button onClick={convertFromUnix}>To ISO</button>
        </div>
        <div>
          <label>ISO Date</label>
          <input value={date} onChange={(e) => setDate(e.target.value)} />
          <button onClick={convertToUnix}>To Unix</button>
        </div>
      </div>
    </ToolLayout>
  );
}

function PercentageCalculator() {
  const [a, setA] = useState(25);
  const [b, setB] = useState(200);

  const percentOf = ((Number(a) / 100) * Number(b)).toFixed(2);
  const isWhatPercent = Number(b) !== 0 ? ((Number(a) / Number(b)) * 100).toFixed(2) : "0";

  return (
    <ToolLayout title="Percentage Calculator" description="Calculate percentages in multiple ways.">
      <div className="split-grid">
        <div className="glass-panel output-panel">
          <p>{a}% of {b} = <strong>{percentOf}</strong></p>
        </div>
        <div className="glass-panel output-panel">
          <p>{a} is <strong>{isWhatPercent}%</strong> of {b}</p>
        </div>
      </div>
      <div className="row-actions">
        <input type="number" value={a} onChange={(e) => setA(e.target.value)} placeholder="A" />
        <input type="number" value={b} onChange={(e) => setB(e.target.value)} placeholder="B" />
      </div>
    </ToolLayout>
  );
}

function BmiCalculator() {
  const [height, setHeight] = useState(172);
  const [weight, setWeight] = useState(68);

  const bmi = useMemo(() => {
    const meters = Number(height) / 100;
    if (!meters || !Number(weight)) {
      return 0;
    }
    return Number(weight) / (meters * meters);
  }, [height, weight]);

  const label = bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal" : bmi < 30 ? "Overweight" : "Obese";

  return (
    <ToolLayout title="BMI Calculator" description="Calculate body mass index quickly.">
      <div className="row-actions">
        <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="Height cm" />
        <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Weight kg" />
      </div>
      <div className="glass-panel output-panel">
        <p>BMI: <strong>{bmi ? bmi.toFixed(2) : "0.00"}</strong> ({label})</p>
      </div>
    </ToolLayout>
  );
}

function ColorConverter() {
  const [hex, setHex] = useState("#34A2FF");
  const [r, setR] = useState("52");
  const [g, setG] = useState("162");
  const [b, setB] = useState("255");
  const [status, setStatus] = useState("");

  const fromHex = () => {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      setStatus("Invalid hex color.");
      return;
    }

    setR(String(rgb.r));
    setG(String(rgb.g));
    setB(String(rgb.b));
    setStatus("Converted from HEX.");
  };

  const fromRgb = () => {
    const converted = rgbToHex(r, g, b);
    if (!converted) {
      setStatus("RGB values must be between 0 and 255.");
      return;
    }

    setHex(converted);
    setStatus("Converted from RGB.");
  };

  return (
    <ToolLayout title="Color Converter" description="Convert color values between HEX and RGB.">
      <div className="split-grid">
        <div>
          <label>HEX</label>
          <input value={hex} onChange={(e) => setHex(e.target.value)} />
          <button onClick={fromHex}>HEX to RGB</button>
        </div>
        <div>
          <label>RGB</label>
          <div className="row-actions">
            <input value={r} onChange={(e) => setR(e.target.value)} />
            <input value={g} onChange={(e) => setG(e.target.value)} />
            <input value={b} onChange={(e) => setB(e.target.value)} />
          </div>
          <button onClick={fromRgb}>RGB to HEX</button>
        </div>
      </div>
      <div className="glass-panel output-panel" style={{ borderLeft: `6px solid ${hex}` }}>
        <p>Preview color: <strong>{hex}</strong></p>
      </div>
      {status && <p className="status success">{status}</p>}
    </ToolLayout>
  );
}

function CookieNotepad() {
  const [text, setText] = useState(() => getCookie("tool_notepad") || "");
  const [status, setStatus] = useState("");

  const save = () => {
    setCookie("tool_notepad", text);
    setStatus("Saved note to cookie.");
  };

  const load = () => {
    setText(getCookie("tool_notepad"));
    setStatus("Loaded note from cookie.");
  };

  const clear = () => {
    setCookie("tool_notepad", "", -1);
    setText("");
    setStatus("Cleared note cookie.");
  };

  return (
    <ToolLayout title="Cookie Notepad" description="Persist notes in browser cookies.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea" />
      <div className="row-actions">
        <button onClick={save}>Save</button>
        <button onClick={load}>Load</button>
        <button onClick={clear}>Clear</button>
      </div>
      {status && <p className="status success">{status}</p>}
    </ToolLayout>
  );
}

function CookieTodo() {
  const [value, setValue] = useState("");
  const [tasks, setTasks] = useState(() => {
    const stored = getCookie("tool_todo");
    if (!stored) {
      return [];
    }

    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    setCookie("tool_todo", JSON.stringify(tasks));
  }, [tasks]);

  const addTask = () => {
    if (!value.trim()) {
      return;
    }

    setTasks((prev) => [...prev, { id: Date.now(), text: value.trim(), done: false }]);
    setValue("");
  };

  return (
    <ToolLayout title="Cookie To-Do" description="Track to-do items with cookie persistence.">
      <div className="todo-input-row">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add a task..." />
        <button onClick={addTask}>Add</button>
      </div>
      <ul className="todo-list">
        {tasks.map((task) => (
          <li key={task.id} className="glass-panel">
            <label>
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, done: !item.done } : item)))}
              />
              <span className={task.done ? "done" : ""}>{task.text}</span>
            </label>
            <button onClick={() => setTasks((prev) => prev.filter((item) => item.id !== task.id))}>Delete</button>
          </li>
        ))}
      </ul>
    </ToolLayout>
  );
}

const TOOL_DEFINITIONS = [
  { category: "JSON", path: "/json-validator", title: "JSON Validator", description: "Validate raw JSON strings.", component: JsonValidator },
  { category: "JSON", path: "/json-formatter", title: "JSON Formatter", description: "Format, minify, flatten.", component: JsonFormatter },
  { category: "JSON", path: "/json-explorer", title: "JSON Explorer", description: "Explore nested trees.", component: JsonExplorer },
  { category: "JSON", path: "/json-linter", title: "JSON Linter", description: "Lint and parse diagnostics.", component: JsonLinter },
  { category: "JSON", path: "/json-sorter", title: "JSON Sorter", description: "Sort keys recursively.", component: JsonSorter },
  { category: "JSON", path: "/json-to-csv", title: "JSON to CSV", description: "Convert object arrays to CSV.", component: JsonToCsv },
  { category: "Text", path: "/text-editor", title: "Text Editor", description: "Edit and transform text.", component: TextEditor },
  { category: "Text", path: "/text-diff", title: "Text Diff Checker", description: "Compare text line-by-line.", component: TextDiffChecker },
  { category: "Text", path: "/word-counter", title: "Word Counter", description: "Count words and chars.", component: WordCounter },
  { category: "Text", path: "/case-converter", title: "Case Converter", description: "Change text casing.", component: CaseConverter },
  { category: "Text", path: "/line-tools", title: "Line Tools", description: "Sort/trim/uniq lines.", component: LineTools },
  { category: "Text", path: "/slug-generator", title: "Slug Generator", description: "Create URL slugs.", component: SlugGenerator },
  { category: "Text", path: "/lorem-generator", title: "Lorem Generator", description: "Generate placeholder text.", component: LoremGenerator },
  { category: "Encoding", path: "/base64", title: "Base64 Encoder/Decoder", description: "Encode/decode base64.", component: Base64Tool },
  { category: "Encoding", path: "/url-codec", title: "URL Encoder/Decoder", description: "Encode/decode URL strings.", component: UrlCodecTool },
  { category: "Encoding", path: "/html-entities", title: "HTML Entities", description: "Encode/decode HTML entities.", component: HtmlEntitiesTool },
  { category: "Encoding", path: "/jwt-decoder", title: "JWT Decoder", description: "Decode JWT payload.", component: JwtDecoder },
  { category: "Developer", path: "/uuid-generator", title: "UUID Generator", description: "Generate UUIDs.", component: UuidGenerator },
  { category: "Developer", path: "/hash-generator", title: "SHA-256 Hash", description: "Create hashes.", component: HashGenerator },
  { category: "Developer", path: "/regex-tester", title: "Regex Tester", description: "Test regex quickly.", component: RegexTester },
  { category: "Developer", path: "/password-generator", title: "Password Generator", description: "Generate random passwords.", component: PasswordGenerator },
  { category: "Web & Data", path: "/query-parser", title: "Query Parser/Builder", description: "Work with query strings.", component: QueryStringTool },
  { category: "Web & Data", path: "/timestamp-converter", title: "Timestamp Converter", description: "Unix and ISO conversion.", component: TimestampConverter },
  { category: "Math", path: "/percentage-calculator", title: "Percentage Calculator", description: "Quick percentage math.", component: PercentageCalculator },
  { category: "Math", path: "/bmi-calculator", title: "BMI Calculator", description: "Body mass index tool.", component: BmiCalculator },
  { category: "Design", path: "/color-converter", title: "Color Converter", description: "HEX/RGB conversion.", component: ColorConverter },
  { category: "Storage", path: "/notepad", title: "Cookie Notepad", description: "Persist notes in cookies.", component: CookieNotepad },
  { category: "Storage", path: "/todo", title: "Cookie To-Do", description: "Persist tasks in cookies.", component: CookieTodo }
];

const CATEGORY_ORDER = ["JSON", "Text", "Encoding", "Developer", "Web & Data", "Math", "Design", "Storage"];

function Sidebar() {
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    tools: TOOL_DEFINITIONS.filter((tool) => tool.category === category)
  }));

  return (
    <aside className="sidebar glass-card">
      <div className="sidebar-title">
        <h3>Tools</h3>
        <span>{TOOL_DEFINITIONS.length} utilities</span>
      </div>
      <div className="sidebar-scroll">
        {grouped.map(({ category, tools }) => (
          <div key={category} className="sidebar-category">
            <p className="category-label">{category}</p>
            {tools.map((tool) => (
              <NavLink key={tool.path} to={tool.path} className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
                {tool.title}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

function HomePage() {
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    tools: TOOL_DEFINITIONS.filter((tool) => tool.category === category)
  }));

  return (
    <section>
      <div className="hero glass-card">
        <h1>Static Tools Hub</h1>
        <p>Fast, minimalist and responsive utilities grouped by categories.</p>
      </div>
      <div className="category-grid">
        {grouped.map(({ category, tools }) => (
          <div key={category} className="category-card glass-card">
            <h3>{category}</h3>
            <div className="tools-grid">
              {tools.map((tool) => (
                <Link key={tool.path} to={tool.path} className="tool-card glass-card">
                  <h4>{tool.title}</h4>
                  <p>{tool.description}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AppFrame({ children }) {
  const location = useLocation();

  return (
    <div className="app-bg">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="page-wrap">
        <header className="top-nav glass-card">
          <Link to="/" className="brand">Static Tools</Link>
          {location.pathname !== "/" && <Link to="/" className="back-link">Home</Link>}
        </header>
        <div className="app-layout">
          <Sidebar />
          <main className="content-area">{children}</main>
        </div>
      </div>
    </div>
  );
}

export default function ToolHubApp() {
  return (
    <AppFrame>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {TOOL_DEFINITIONS.map((tool) => (
          <Route key={tool.path} path={tool.path} element={<tool.component />} />
        ))}
      </Routes>
    </AppFrame>
  );
}
