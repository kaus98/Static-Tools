import { useEffect, useMemo, useState, memo } from "react";
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

function parseCookieJson(name, fallback = []) {
  const raw = getCookie(name);
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
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

const CSV_DELIMITERS = [
  { value: ",", label: "Comma (,)" },
  { value: ";", label: "Semicolon (;)" },
  { value: "\t", label: "Tab (\\t)" },
  { value: "|", label: "Pipe (|)" },
  { value: ":", label: "Colon (:)" },
  { value: " ", label: "Space ( )" }
];

function toCsv(rows, delimiter = ",") {
  if (!rows.length) {
    return "";
  }

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(delimiter)];

  rows.forEach((row) => {
    lines.push(headers.map((header) => escape(row[header])).join(delimiter));
  });

  return lines.join("\n");
}

function parseCsv(text, delimiter = ",") {
  const trimmed = text.trim();
  if (!trimmed) {
    return { headers: [], rows: [], error: "CSV input is empty." };
  }

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (delimiter === "\t" ? char === "\t" && !inQuotes : char === delimiter && !inQuotes) {
      currentRow.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      currentRow.push(currentValue.trim());
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue.trim());
  rows.push(currentRow);

  const filteredRows = rows.filter((row) => row.some((cell) => cell !== ""));
  if (!filteredRows.length) {
    return { headers: [], rows: [], error: "CSV input is empty." };
  }

  const headers = filteredRows[0];
  if (headers.some((header) => !header)) {
    return { headers: [], rows: [], error: "All header columns require a name." };
  }

  const seenHeaders = new Set();
  for (const header of headers) {
    if (seenHeaders.has(header)) {
      return { headers: [], rows: [], error: `Duplicate header "${header}" detected.` };
    }
    seenHeaders.add(header);
  }

  const dataRows = filteredRows.slice(1).map((row) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = row[index] ?? "";
    });
    return entry;
  });

  return { headers, rows: dataRows };
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

function formatXmlSimple(xml) {
  const normalized = xml.replace(/>\s*</g, "><").trim();
  const tokens = normalized.replace(/></g, ">\n<").split("\n");
  let indent = 0;

  return tokens
    .map((token) => {
      if (token.match(/^<\/\w/)) {
        indent = Math.max(indent - 1, 0);
      }

      const line = `${"  ".repeat(indent)}${token}`;

      if (token.match(/^<[^!?/][^>]*[^/]>/) && !token.includes("</")) {
        indent += 1;
      }

      return line;
    })
    .join("\n");
}

function minifyCssSimple(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function formatCssSimple(css) {
  return css
    .replace(/\{/g, " {\n  ")
    .replace(/;/g, ";\n  ")
    .replace(/\}/g, "\n}\n")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

function isHeicLikeFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif") || type.includes("heic") || type.includes("heif");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image."));
    image.src = src;
  });
}

async function loadImageFromFile(file) {
  const fileDataUrl = await readFileAsDataUrl(file);

  try {
    const image = await loadImageElement(fileDataUrl);
    return { image, dataUrl: fileDataUrl };
  } catch {
    if (!window.createImageBitmap) {
      throw new Error(isHeicLikeFile(file) ? "This browser cannot decode HEIC/HEIF files here. Try a browser with HEIC support or convert the file first." : "Could not load image.");
    }

    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas context not available.");
      }
      ctx.drawImage(bitmap, 0, 0);
      const bitmapDataUrl = canvas.toDataURL("image/png");
      if (bitmap.close) {
        bitmap.close();
      }
      const image = await loadImageElement(bitmapDataUrl);
      return { image, dataUrl: bitmapDataUrl };
    } catch {
      throw new Error(isHeicLikeFile(file) ? "HEIC/HEIF decode failed in this browser. Use latest Chrome/Safari/Edge or convert to JPG/PNG first." : "Could not load image.");
    }
  }
}

function canvasToBlob(canvas, mimeType = "image/png", quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to convert canvas to blob."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

async function transformImageOnCanvas(options) {
  const {
    image,
    width,
    height,
    rotate = 0,
    flipH = false,
    flipV = false,
    brightness = 100,
    contrast = 100,
    saturate = 100,
    format = "image/png",
    quality = 0.92
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas context not available.");
  }

  ctx.save();
  ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(image, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  ctx.restore();

  const blob = await canvasToBlob(canvas, format, quality);
  const dataUrl = canvas.toDataURL(format, quality);

  return { canvas, blob, dataUrl };
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function luhnCheck(numberString) {
  const cleaned = numberString.replace(/\D/g, "");
  let sum = 0;
  let shouldDouble = false;

  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    let digit = Number(cleaned[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return cleaned.length >= 12 && sum % 10 === 0;
}

function detectCardType(numberString) {
  const value = numberString.replace(/\D/g, "");
  if (/^4\d{12}(\d{3})?(\d{3})?$/.test(value)) return "Visa";
  if (/^(5[1-5]\d{14}|2(2[2-9]|[3-6]\d|7[01])\d{12})$/.test(value)) return "Mastercard";
  if (/^3[47]\d{13}$/.test(value)) return "American Express";
  if (/^6(?:011|5\d{2})\d{12}$/.test(value)) return "Discover";
  if (/^62\d{14,17}$/.test(value)) return "UnionPay/RuPay";
  return "Unknown";
}

function convertTemperature(value, from, to) {
  const celsius =
    from === "C"
      ? value
      : from === "F"
        ? (value - 32) * (5 / 9)
        : value - 273.15;

  if (to === "C") return celsius;
  if (to === "F") return celsius * (9 / 5) + 32;
  return celsius + 273.15;
}

function convertLength(value, from, to) {
  const factors = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 };
  return (value * factors[from]) / factors[to];
}

function convertWeight(value, from, to) {
  const factors = { mg: 0.000001, g: 0.001, kg: 1, lb: 0.45359237, oz: 0.028349523125 };
  return (value * factors[from]) / factors[to];
}

function parseNumberListText(text) {
  const values = String(text)
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .map(Number);
  if (!values.length || values.some((v) => Number.isNaN(v))) {
    return null;
  }
  return values;
}

function parseMatrix2x2(text) {
  const rows = String(text)
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean);
  if (rows.length !== 2) {
    return null;
  }
  const matrix = rows.map((row) => row.split(",").map((v) => Number(v.trim())));
  if (matrix.some((row) => row.length !== 2 || row.some((n) => Number.isNaN(n)))) {
    return null;
  }
  return matrix;
}

function markdownToSimpleHtml(markdown) {
  return markdown
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "<br/><br/>");
}

function parseCronField(field, min, max) {
  const values = new Set();
  const parts = String(field).split(",").map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    if (part === "*") {
      for (let i = min; i <= max; i += 1) values.add(i);
      continue;
    }

    if (part.startsWith("*/")) {
      const step = Number(part.slice(2));
      if (!Number.isInteger(step) || step <= 0) return null;
      for (let i = min; i <= max; i += step) values.add(i);
      continue;
    }

    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start < min || end > max) return null;
      for (let i = start; i <= end; i += 1) values.add(i);
      continue;
    }

    const n = Number(part);
    if (!Number.isInteger(n) || n < min || n > max) return null;
    values.add(n);
  }

  return values;
}

function parseCronExpression(expression) {
  const fields = String(expression).trim().split(/\s+/);
  if (fields.length !== 5) {
    return { error: "Cron expression must have exactly 5 fields: minute hour day month weekday." };
  }

  const [minute, hour, day, month, weekday] = fields;
  const minuteSet = parseCronField(minute, 0, 59);
  const hourSet = parseCronField(hour, 0, 23);
  const daySet = parseCronField(day, 1, 31);
  const monthSet = parseCronField(month, 1, 12);
  const weekdaySet = parseCronField(weekday, 0, 6);

  if (!minuteSet || !hourSet || !daySet || !monthSet || !weekdaySet) {
    return { error: "One or more cron fields are invalid." };
  }

  return { minuteSet, hourSet, daySet, monthSet, weekdaySet };
}

function getNextCronRuns(expression, count = 5) {
  const parsed = parseCronExpression(expression);
  if (parsed.error) {
    return { error: parsed.error };
  }

  const { minuteSet, hourSet, daySet, monthSet, weekdaySet } = parsed;
  const runs = [];
  const cursor = new Date();
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  let guard = 0;
  while (runs.length < count && guard < 525600) {
    if (
      minuteSet.has(cursor.getMinutes()) &&
      hourSet.has(cursor.getHours()) &&
      daySet.has(cursor.getDate()) &&
      monthSet.has(cursor.getMonth() + 1) &&
      weekdaySet.has(cursor.getDay())
    ) {
      runs.push(new Date(cursor));
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
    guard += 1;
  }

  return { runs };
}

function minifyJsBasic(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatJsBasic(js) {
  return js
    .replace(/;/g, ";\n")
    .replace(/\{/g, " {\n")
    .replace(/\}/g, "\n}\n")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

const validators = {
  requiredText(value, label = "Input") {
    if (!String(value ?? "").trim()) {
      return `${label} cannot be empty.`;
    }
    return "";
  },
  jsonText(value) {
    const base = validators.requiredText(value, "JSON input");
    if (base) {
      return base;
    }
    const { error } = parseJsonSafely(value);
    return error ? `Invalid JSON: ${error}` : "";
  },
  number(value, label = "Number", options = {}) {
    const n = Number(value);
    if (Number.isNaN(n)) {
      return `${label} must be a valid number.`;
    }
    if (options.integer && !Number.isInteger(n)) {
      return `${label} must be an integer.`;
    }
    if (options.min !== undefined && n < options.min) {
      return `${label} must be >= ${options.min}.`;
    }
    if (options.max !== undefined && n > options.max) {
      return `${label} must be <= ${options.max}.`;
    }
    return "";
  },
  base64(value) {
    const base = validators.requiredText(value, "Base64 input");
    if (base) {
      return base;
    }
    try {
      atob(value);
      return "";
    } catch {
      return "Invalid Base64 input.";
    }
  },
  regexFlags(flags) {
    if (/[^dgimsuvy]/.test(flags)) {
      return "Regex flags are invalid.";
    }
    if (new Set(flags).size !== flags.length) {
      return "Regex flags contain duplicates.";
    }
    return "";
  },
  jwt(value) {
    const base = validators.requiredText(value, "JWT token");
    if (base) {
      return base;
    }
    if (value.split(".").length < 2) {
      return "JWT token format is invalid.";
    }
    return "";
  },
  queryString(value) {
    const base = validators.requiredText(value, "Query string");
    if (base) {
      return base;
    }
    if (!value.includes("=")) {
      return "Query string must include key=value pairs.";
    }
    return "";
  },
  url(value) {
    const base = validators.requiredText(value, "URL");
    if (base) {
      return base;
    }
    try {
      new URL(value);
      return "";
    } catch {
      return "URL is invalid.";
    }
  },
  email(value) {
    const base = validators.requiredText(value, "Email");
    if (base) {
      return base;
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? "" : "Email is invalid.";
  },
  xmlText(value) {
    const base = validators.requiredText(value, "XML input");
    if (base) {
      return base;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(value, "application/xml");
    const parseError = doc.querySelector("parsererror");
    return parseError ? "Invalid XML input." : "";
  },
  javascriptText(value) {
    const base = validators.requiredText(value, "JavaScript code");
    if (base) {
      return base;
    }

    try {
      new Function(value);
      return "";
    } catch (error) {
      return `Invalid JavaScript: ${error.message}`;
    }
  },
  identifier(value, label = "Identifier") {
    const base = validators.requiredText(value, label);
    if (base) {
      return base;
    }
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? "" : `${label} must be a valid identifier.`;
  },
  filename(value, label = "Filename") {
    const base = validators.requiredText(value, label);
    if (base) {
      return base;
    }
    return /[\\/:*?"<>|]/.test(value) ? `${label} has invalid characters.` : "";
  },
  uuid(value) {
    const base = validators.requiredText(value, "UUID");
    if (base) return base;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      ? ""
      : "UUID format is invalid.";
  },
  ipv4(value) {
    const base = validators.requiredText(value, "IPv4 address");
    if (base) return base;
    const parts = value.split(".");
    if (parts.length !== 4) return "IPv4 address is invalid.";
    const valid = parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
    return valid ? "" : "IPv4 address is invalid.";
  },
  hexString(value) {
    const base = validators.requiredText(value, "Hex input");
    if (base) return base;
    const cleaned = value.replace(/\s+/g, "");
    if (cleaned.length % 2 !== 0) return "Hex string length must be even.";
    return /^[0-9a-fA-F]+$/.test(cleaned) ? "" : "Hex input contains invalid characters.";
  }
};

const ToolLayout = memo(function ToolLayout({ title, description, children }) {
  return (
    <section className="tool-shell glass-card">
      <header className="tool-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
});

const JsonNode = memo(function JsonNode({ name, value, level = 0, path, collapsedPaths, onToggle }) {
  const paddingLeft = 12 + level * 14;
  const isCollapsible = Array.isArray(value) || (value && typeof value === "object");
  const isCollapsed = isCollapsible && collapsedPaths.has(path);

  if (Array.isArray(value)) {
    return (
      <div>
        <div
          className="json-node"
          style={{ paddingLeft, cursor: isCollapsible ? "pointer" : "default" }}
          onClick={() => isCollapsible && onToggle(path)}
        >
          <span style={{ userSelect: "none", marginRight: 6 }}>
            {isCollapsible ? (isCollapsed ? "▶" : "▼") : "•"}
          </span>
          <strong>{name}</strong>: [{value.length}]
        </div>
        {!isCollapsed && value.map((item, index) => (
          <JsonNode key={`${path}-${index}`} name={index} value={item} level={level + 1} path={`${path}.${index}`} collapsedPaths={collapsedPaths} onToggle={onToggle} />
        ))}
      </div>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return (
      <div>
        <div
          className="json-node"
          style={{ paddingLeft, cursor: isCollapsible ? "pointer" : "default" }}
          onClick={() => isCollapsible && onToggle(path)}
        >
          <span style={{ userSelect: "none", marginRight: 6 }}>
            {isCollapsible ? (isCollapsed ? "▶" : "▼") : "•"}
          </span>
          <strong>{name}</strong>: {'{'}{entries.length}{'}'}
        </div>
        {!isCollapsed && entries.map(([key, nested]) => (
          <JsonNode key={`${path}.${key}`} name={key} value={nested} level={level + 1} path={`${path}.${key}`} collapsedPaths={collapsedPaths} onToggle={onToggle} />
        ))}
      </div>
    );
  }

  return (
    <div className="json-node" style={{ paddingLeft }}>
      <span style={{ userSelect: "none", marginRight: 6 }}>•</span>
      <strong>{name}</strong>: {String(value)}
    </div>
  );
});

function JsonValidator() {
  const [input, setInput] = useState('{\n  "message": "Hello JSON"\n}');
  const [result, setResult] = useState("");

  const validate = () => {
    const error = validators.jsonText(input);
    setResult(error || "Valid JSON ✔");
  };

  return (
    <ToolLayout title="JSON Validator" description="Validate JSON and get parser diagnostics.">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
      <div className="row-actions"><button onClick={validate}>Validate</button></div>
      {result && <p className={result.startsWith("Valid") ? "status success" : "status error"}>{result}</p>}
    </ToolLayout>
  );
}

function ImageEditorStudio() {
  const [source, setSource] = useState(null);
  const [sourceInfo, setSourceInfo] = useState(null);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("");

  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [keepAspect, setKeepAspect] = useState(true);
  const [rotate, setRotate] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);
  const [format, setFormat] = useState("image/png");
  const [quality, setQuality] = useState(92);

  const [metaTitle, setMetaTitle] = useState("");
  const [metaAuthor, setMetaAuthor] = useState("");
  const [metaCopyright, setMetaCopyright] = useState("");
  const [metaComment, setMetaComment] = useState("");

  const metadata = useMemo(() => ({
    title: metaTitle,
    author: metaAuthor,
    copyright: metaCopyright,
    comment: metaComment
  }), [metaAuthor, metaComment, metaCopyright, metaTitle]);

  const aspect = useMemo(() => {
    if (!sourceInfo?.width || !sourceInfo?.height) {
      return 1;
    }
    return sourceInfo.width / sourceInfo.height;
  }, [sourceInfo]);

  const extension = useMemo(() => {
    if (format === "image/jpeg") return "jpg";
    if (format === "image/webp") return "webp";
    return "png";
  }, [format]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const { image, dataUrl } = await loadImageFromFile(file);
      setSource({ image, file });
      setSourceInfo({
        name: file.name,
        type: file.type || "unknown",
        sizeBytes: file.size,
        width: image.width,
        height: image.height,
        ratio: `${image.width}:${image.height}`
      });
      setWidth(image.width);
      setHeight(image.height);
      setPreview(dataUrl);
      setStatus("Image loaded.");
    } catch (error) {
      setStatus(error.message);
    }
  };

  const onWidthChange = (value) => {
    setWidth(value);
    if (keepAspect && sourceInfo?.height) {
      setHeight(Math.max(1, Math.round(Number(value || 0) / aspect)));
    }
  };

  const onHeightChange = (value) => {
    setHeight(value);
    if (keepAspect && sourceInfo?.width) {
      setWidth(Math.max(1, Math.round(Number(value || 0) * aspect)));
    }
  };

  const processImage = async (download = false) => {
    if (!source?.image) {
      setStatus("Please upload an image first.");
      return;
    }

    const widthError = validators.number(width, "Width", { min: 1, max: 10000, integer: true });
    const heightError = validators.number(height, "Height", { min: 1, max: 10000, integer: true });
    const qualityError = validators.number(quality, "Quality", { min: 1, max: 100, integer: true });
    if (widthError || heightError || qualityError) {
      setStatus(widthError || heightError || qualityError);
      return;
    }

    try {
      const { blob, dataUrl } = await transformImageOnCanvas({
        image: source.image,
        width: Number(width),
        height: Number(height),
        rotate: Number(rotate),
        flipH,
        flipV,
        brightness: Number(brightness),
        contrast: Number(contrast),
        saturate: Number(saturate),
        format,
        quality: Number(quality) / 100
      });

      setPreview(dataUrl);
      setStatus(download ? "Processed and downloaded image." : "Processed image preview updated.");

      if (download) {
        const baseName = (source.file?.name || "image").replace(/\.[^.]+$/, "");
        downloadBlob(blob, `${baseName}-edited.${extension}`);
      }
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <ToolLayout title="Image Editor Studio" description="Modern browser image editor: resize, convert format, adjust resolution, metadata and export.">
      <div className="image-studio-grid">
        <section className="image-panel glass-panel">
          <div className="row-actions file-upload-row">
            <label className="file-upload">
              <input className="file-input" type="file" accept="image/*" onChange={handleFile} />
              <span className="file-upload-trigger">Select Image</span>
            </label>
            <span className="file-upload-name">{sourceInfo?.name || "No file selected"}</span>
          </div>
          {sourceInfo && (
            <pre className="meta-pre">{JSON.stringify(sourceInfo, null, 2)}</pre>
          )}
          <div className="image-preview-wrap">
            {preview ? <img src={preview} alt="preview" className="image-preview" /> : <p className="status info">Upload an image to start editing.</p>}
          </div>
        </section>

        <section className="image-panel glass-panel">
          <h3>Transform</h3>
          <div className="image-controls-grid">
            <label>Width (px)<input type="number" value={width} onChange={(e) => onWidthChange(e.target.value)} /></label>
            <label>Height (px)<input type="number" value={height} onChange={(e) => onHeightChange(e.target.value)} /></label>
            <label>Rotate (deg)<input type="number" value={rotate} onChange={(e) => setRotate(e.target.value)} /></label>
            <label>Format
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPG</option>
                <option value="image/webp">WEBP</option>
              </select>
            </label>
            <label>Quality (1-100)<input type="number" min="1" max="100" value={quality} onChange={(e) => setQuality(e.target.value)} /></label>
          </div>
          <div className="row-actions">
            <label className="checkbox-pill"><input type="checkbox" checked={keepAspect} onChange={(e) => setKeepAspect(e.target.checked)} />Keep aspect</label>
            <label className="checkbox-pill"><input type="checkbox" checked={flipH} onChange={(e) => setFlipH(e.target.checked)} />Flip H</label>
            <label className="checkbox-pill"><input type="checkbox" checked={flipV} onChange={(e) => setFlipV(e.target.checked)} />Flip V</label>
          </div>
          <div className="slider-group">
            <label>Brightness: {brightness}%<input type="range" min="20" max="200" value={brightness} onChange={(e) => setBrightness(e.target.value)} /></label>
            <label>Contrast: {contrast}%<input type="range" min="20" max="200" value={contrast} onChange={(e) => setContrast(e.target.value)} /></label>
            <label>Saturation: {saturate}%<input type="range" min="0" max="200" value={saturate} onChange={(e) => setSaturate(e.target.value)} /></label>
          </div>
          <div className="row-actions">
            <button onClick={() => processImage(false)}>Apply Preview</button>
            <button onClick={() => processImage(true)}>Export & Download</button>
          </div>
        </section>
      </div>

      <section className="glass-panel metadata-editor">
        <div className="metadata-header">
          <h3>Metadata Fields (Editable in App)</h3>
          <p className="metadata-note">Add export annotations to accompany your download. Values remain within the app for quick reference.</p>
        </div>
        <div className="metadata-grid">
          <label className="metadata-field">
            <span className="metadata-label">Title</span>
            <input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder="Hero banner concept" />
          </label>
          <label className="metadata-field">
            <span className="metadata-label">Author</span>
            <input value={metaAuthor} onChange={(e) => setMetaAuthor(e.target.value)} placeholder="Designed by..." />
          </label>
          <label className="metadata-field">
            <span className="metadata-label">Copyright</span>
            <input value={metaCopyright} onChange={(e) => setMetaCopyright(e.target.value)} placeholder="© 2026 Studio" />
          </label>
          <label className="metadata-field">
            <span className="metadata-label">Comment</span>
            <input value={metaComment} onChange={(e) => setMetaComment(e.target.value)} placeholder="Notes or usage rights" />
          </label>
        </div>
        <pre className="meta-pre">{JSON.stringify(metadata, null, 2)}</pre>
      </section>

      {status && <p className={status.includes("error") || status.includes("Please") || status.includes("must") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function ImageResizerTool() {
  const [source, setSource] = useState(null);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName("");
      return;
    }
    try {
      const { image, dataUrl } = await loadImageFromFile(file);
      setSource({ image, file });
      setWidth(image.width);
      setHeight(image.height);
      setPreview(dataUrl);
      setStatus("Image loaded.");
      setFileName(file.name);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const resize = async (download = false) => {
    if (!source?.image) {
      setStatus("Please upload an image first.");
      return;
    }
    const widthError = validators.number(width, "Width", { min: 1, max: 10000, integer: true });
    const heightError = validators.number(height, "Height", { min: 1, max: 10000, integer: true });
    if (widthError || heightError) {
      setStatus(widthError || heightError);
      return;
    }

    const { blob, dataUrl } = await transformImageOnCanvas({ image: source.image, width: Number(width), height: Number(height), format: "image/png" });
    setPreview(dataUrl);
    setStatus(download ? "Resized and downloaded image." : "Preview resized.");
    if (download) {
      const baseName = source.file.name.replace(/\.[^.]+$/, "");
      downloadBlob(blob, `${baseName}-${width}x${height}.png`);
    }
  };

  return (
    <ToolLayout title="Image Resizer" description="Resize image dimensions and download the new file.">
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept="image/*" onChange={onFile} />
          <span className="file-upload-trigger">Browse Image</span>
        </label>
        <span className="file-upload-name">{fileName || "No file selected"}</span>
      </div>
      <div className="row-actions">
        <input type="number" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="Width" />
        <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="Height" />
        <button onClick={() => resize(false)}>Resize Preview</button>
        <button onClick={() => resize(true)}>Resize & Download</button>
      </div>
      {preview && <div className="image-preview-wrap"><img src={preview} alt="resized preview" className="image-preview" /></div>}
      {status && <p className={status.includes("Please") || status.includes("must") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function HeicConverterTool() {
  const [source, setSource] = useState(null);
  const [preview, setPreview] = useState("");
  const [format, setFormat] = useState("image/jpeg");
  const [quality, setQuality] = useState(90);
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName("");
      return;
    }
    const isHeic = isHeicLikeFile(file);
    if (!isHeic) {
      setStatus("Please select a HEIC/HEIF image file.");
      return;
    }

    try {
      const { image, dataUrl } = await loadImageFromFile(file);
      setSource({ image, file });
      setPreview(dataUrl);
      setStatus("HEIC/HEIF file loaded.");
      setFileName(file.name);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const convert = async () => {
    if (!source?.image) {
      setStatus("Please upload a HEIC/HEIF image first.");
      return;
    }

    const qualityError = validators.number(quality, "Quality", { min: 1, max: 100, integer: true });
    if (qualityError) {
      setStatus(qualityError);
      return;
    }

    try {
      const { blob, dataUrl } = await transformImageOnCanvas({
        image: source.image,
        width: source.image.width,
        height: source.image.height,
        format,
        quality: Number(quality) / 100
      });

      setPreview(dataUrl);
      const ext = format === "image/jpeg" ? "jpg" : format === "image/webp" ? "webp" : "png";
      const baseName = source.file.name.replace(/\.[^.]+$/, "");
      downloadBlob(blob, `${baseName}-converted.${ext}`);
      setStatus("HEIC/HEIF converted and downloaded.");
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <ToolLayout title="HEIC/HEIF Converter" description="Convert HEIC/HEIF images to PNG, JPG, or WEBP (depends on browser decode support).">
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept=".heic,.heif,image/heic,image/heif" onChange={onFile} />
          <span className="file-upload-trigger">Browse HEIC/HEIF</span>
        </label>
        <span className="file-upload-name">{fileName || "No file selected"}</span>
      </div>
      <div className="row-actions">
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="image/jpeg">JPG</option>
          <option value="image/png">PNG</option>
          <option value="image/webp">WEBP</option>
        </select>
        <input type="number" min="1" max="100" value={quality} onChange={(e) => setQuality(e.target.value)} placeholder="Quality" />
        <button onClick={convert}>Convert & Download</button>
      </div>
      {preview && <div className="image-preview-wrap"><img src={preview} alt="heic preview" className="image-preview" /></div>}
      {status && <p className={status.includes("Please") || status.includes("must") || status.includes("failed") || status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function ImageFormatConverterTool() {
  const [source, setSource] = useState(null);
  const [preview, setPreview] = useState("");
  const [format, setFormat] = useState("image/png");
  const [quality, setQuality] = useState(90);
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName("");
      return;
    }
    try {
      const { image, dataUrl } = await loadImageFromFile(file);
      setSource({ image, file });
      setPreview(dataUrl);
      setStatus("Image loaded.");
      setFileName(file.name);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const convert = async () => {
    if (!source?.image) {
      setStatus("Please upload an image first.");
      return;
    }
    const qualityError = validators.number(quality, "Quality", { min: 1, max: 100, integer: true });
    if (qualityError) {
      setStatus(qualityError);
      return;
    }

    const { blob, dataUrl } = await transformImageOnCanvas({
      image: source.image,
      width: source.image.width,
      height: source.image.height,
      format,
      quality: Number(quality) / 100
    });

    setPreview(dataUrl);
    const ext = format === "image/jpeg" ? "jpg" : format === "image/webp" ? "webp" : "png";
    const baseName = source.file.name.replace(/\.[^.]+$/, "");
    downloadBlob(blob, `${baseName}-converted.${ext}`);
    setStatus("Converted and downloaded image.");
  };

  return (
    <ToolLayout title="Image Format Converter" description="Convert images (including HEIC where browser-supported) to PNG, JPG, or WEBP.">
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept="image/*,.heic,.heif,image/heic,image/heif" onChange={onFile} />
          <span className="file-upload-trigger">Browse Image</span>
        </label>
        <span className="file-upload-name">{fileName || "No file selected"}</span>
      </div>
      <div className="row-actions">
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="image/png">PNG</option>
          <option value="image/jpeg">JPG</option>
          <option value="image/webp">WEBP</option>
        </select>
        <input type="number" min="1" max="100" value={quality} onChange={(e) => setQuality(e.target.value)} placeholder="Quality" />
        <button onClick={convert}>Convert & Download</button>
      </div>
      {preview && <div className="image-preview-wrap"><img src={preview} alt="converted preview" className="image-preview" /></div>}
      {status && <p className={status.includes("Please") || status.includes("must") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function ImageMetadataTool() {
  const [info, setInfo] = useState("");
  const [meta, setMeta] = useState({ title: "", author: "", comment: "" });
  const [fileName, setFileName] = useState("");

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName("");
      return;
    }
    const { image } = await loadImageFromFile(file);
    setInfo(
      JSON.stringify(
        {
          fileName: file.name,
          mimeType: file.type || "unknown",
          sizeBytes: file.size,
          width: image.width,
          height: image.height,
          resolution: `${image.width} x ${image.height}`,
          lastModified: new Date(file.lastModified).toISOString()
        },
        null,
        2
      )
    );
    setFileName(file.name);
  };

  return (
    <ToolLayout title="Image Metadata Inspector/Editor" description="Inspect image metadata and edit custom metadata notes.">
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept="image/*" onChange={onFile} />
          <span className="file-upload-trigger">Browse Image</span>
        </label>
        <span className="file-upload-name">{fileName || "No file selected"}</span>
      </div>
      <div className="split-grid">
        <textarea value={info} onChange={(e) => setInfo(e.target.value)} className="tool-textarea" />
        <div className="glass-panel metadata-editor">
          <div className="metadata-header">
            <h3>Custom Metadata Notes</h3>
            <p className="metadata-note">Store reference notes alongside the inspected file. These values are kept client-side.</p>
          </div>
          <div className="metadata-grid">
            <label className="metadata-field">
              <span className="metadata-label">Title</span>
              <input value={meta.title} onChange={(e) => setMeta((prev) => ({ ...prev, title: e.target.value }))} placeholder="Marketing banner" />
            </label>
            <label className="metadata-field">
              <span className="metadata-label">Author</span>
              <input value={meta.author} onChange={(e) => setMeta((prev) => ({ ...prev, author: e.target.value }))} placeholder="Shot by..." />
            </label>
            <label className="metadata-field">
              <span className="metadata-label">Comment</span>
              <input value={meta.comment} onChange={(e) => setMeta((prev) => ({ ...prev, comment: e.target.value }))} placeholder="Usage rights / notes" />
            </label>
          </div>
          <pre className="meta-pre">{JSON.stringify(meta, null, 2)}</pre>
        </div>
      </div>
    </ToolLayout>
  );
}

function ImageCropTool() {
  const [source, setSource] = useState(null);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("");
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState(0);
  const [cropH, setCropH] = useState(0);
  const [outputW, setOutputW] = useState(0);
  const [outputH, setOutputH] = useState(0);
  const [fileName, setFileName] = useState("");

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName("");
      return;
    }
    try {
      const { image, dataUrl } = await loadImageFromFile(file);
      setSource({ image, file });
      setPreview(dataUrl);
      const defaultW = Math.round(image.width * 0.8);
      const defaultH = Math.round(image.height * 0.8);
      setCropX(Math.round((image.width - defaultW) / 2));
      setCropY(Math.round((image.height - defaultH) / 2));
      setCropW(defaultW);
      setCropH(defaultH);
      setOutputW(defaultW);
      setOutputH(defaultH);
      setStatus("Image loaded for cropping.");
      setFileName(file.name);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const crop = async (download = false) => {
    if (!source?.image) {
      setStatus("Please upload an image first.");
      return;
    }

    const values = [
      validators.number(cropX, "Crop X", { min: 0, integer: true }),
      validators.number(cropY, "Crop Y", { min: 0, integer: true }),
      validators.number(cropW, "Crop width", { min: 1, integer: true }),
      validators.number(cropH, "Crop height", { min: 1, integer: true }),
      validators.number(outputW, "Output width", { min: 1, integer: true }),
      validators.number(outputH, "Output height", { min: 1, integer: true })
    ].filter(Boolean);

    if (values.length) {
      setStatus(values[0]);
      return;
    }

    const sx = Number(cropX);
    const sy = Number(cropY);
    const sw = Number(cropW);
    const sh = Number(cropH);
    const dw = Number(outputW);
    const dh = Number(outputH);

    if (sx + sw > source.image.width || sy + sh > source.image.height) {
      setStatus("Crop area exceeds image bounds.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setStatus("Canvas context not available.");
      return;
    }

    ctx.drawImage(source.image, sx, sy, sw, sh, 0, 0, dw, dh);
    const blob = await canvasToBlob(canvas, "image/png", 0.92);
    const dataUrl = canvas.toDataURL("image/png");
    setPreview(dataUrl);
    setStatus(download ? "Cropped and downloaded image." : "Crop preview updated.");

    if (download) {
      const base = source.file.name.replace(/\.[^.]+$/, "");
      downloadBlob(blob, `${base}-cropped.png`);
    }
  };

  return (
    <ToolLayout title="Image Crop Tool" description="Crop by pixel coordinates and export/download.">
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept="image/*" onChange={onFile} />
          <span className="file-upload-trigger">Browse Image</span>
        </label>
        <span className="file-upload-name">{fileName || "No file selected"}</span>
      </div>
      <div className="image-controls-grid">
        <label>Crop X<input type="number" value={cropX} onChange={(e) => setCropX(e.target.value)} /></label>
        <label>Crop Y<input type="number" value={cropY} onChange={(e) => setCropY(e.target.value)} /></label>
        <label>Crop Width<input type="number" value={cropW} onChange={(e) => setCropW(e.target.value)} /></label>
        <label>Crop Height<input type="number" value={cropH} onChange={(e) => setCropH(e.target.value)} /></label>
        <label>Output Width<input type="number" value={outputW} onChange={(e) => setOutputW(e.target.value)} /></label>
        <label>Output Height<input type="number" value={outputH} onChange={(e) => setOutputH(e.target.value)} /></label>
      </div>
      <div className="row-actions"><button onClick={() => crop(false)}>Apply Crop</button><button onClick={() => crop(true)}>Crop & Download</button></div>
      {preview && <div className="image-preview-wrap"><img src={preview} alt="crop preview" className="image-preview" /></div>}
      {status && <p className={status.includes("Please") || status.includes("must") || status.includes("exceeds") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function ImageWatermarkTool() {
  const [source, setSource] = useState(null);
  const [logo, setLogo] = useState(null);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("");
  const [text, setText] = useState("© Static Tools");
  const [position, setPosition] = useState("bottom-right");
  const [fontSize, setFontSize] = useState(24);
  const [opacity, setOpacity] = useState(60);
  const [color, setColor] = useState("#FFFFFF");
  const [format, setFormat] = useState("image/png");
  const [imageName, setImageName] = useState("");
  const [logoName, setLogoName] = useState("");

  const loadSource = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setImageName("");
      return;
    }
    try {
      const { image, dataUrl } = await loadImageFromFile(file);
      setSource({ image, file });
      setPreview(dataUrl);
      setStatus("Base image loaded.");
      setImageName(file.name);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const loadLogo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setLogo(null);
      setLogoName("");
      return;
    }
    try {
      const { image } = await loadImageFromFile(file);
      setLogo({ image, file });
      setStatus("Logo watermark loaded.");
      setLogoName(file.name);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const applyWatermark = async (download = false) => {
    if (!source?.image) {
      setStatus("Please upload an image first.");
      return;
    }

    const fontError = validators.number(fontSize, "Font size", { min: 8, max: 220, integer: true });
    const opacityError = validators.number(opacity, "Opacity", { min: 1, max: 100, integer: true });
    if (fontError || opacityError) {
      setStatus(fontError || opacityError);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = source.image.width;
    canvas.height = source.image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setStatus("Canvas context not available.");
      return;
    }

    ctx.drawImage(source.image, 0, 0);
    const pad = Math.max(16, Math.round(canvas.width * 0.02));
    const alpha = Number(opacity) / 100;

    if (text.trim()) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.font = `${Number(fontSize)}px Manrope, Segoe UI, sans-serif`;
      const metrics = ctx.measureText(text);
      const textW = metrics.width;
      const textH = Number(fontSize);

      const map = {
        "top-left": [pad, pad + textH],
        "top-right": [canvas.width - pad - textW, pad + textH],
        "center": [(canvas.width - textW) / 2, canvas.height / 2],
        "bottom-left": [pad, canvas.height - pad],
        "bottom-right": [canvas.width - pad - textW, canvas.height - pad]
      };

      const [tx, ty] = map[position] || map["bottom-right"];
      ctx.fillText(text, tx, ty);
      ctx.restore();
    }

    if (logo?.image) {
      ctx.save();
      ctx.globalAlpha = alpha;
      const targetW = Math.round(canvas.width * 0.2);
      const ratio = logo.image.width / logo.image.height;
      const targetH = Math.round(targetW / ratio);
      const map = {
        "top-left": [pad, pad],
        "top-right": [canvas.width - pad - targetW, pad],
        "center": [(canvas.width - targetW) / 2, (canvas.height - targetH) / 2],
        "bottom-left": [pad, canvas.height - pad - targetH],
        "bottom-right": [canvas.width - pad - targetW, canvas.height - pad - targetH]
      };
      const [lx, ly] = map[position] || map["bottom-right"];
      ctx.drawImage(logo.image, lx, ly, targetW, targetH);
      ctx.restore();
    }

    const quality = format === "image/png" ? 0.92 : 0.9;
    const blob = await canvasToBlob(canvas, format, quality);
    const dataUrl = canvas.toDataURL(format, quality);
    setPreview(dataUrl);

    if (download) {
      const ext = format === "image/jpeg" ? "jpg" : format === "image/webp" ? "webp" : "png";
      const base = source.file.name.replace(/\.[^.]+$/, "");
      downloadBlob(blob, `${base}-watermark.${ext}`);
    }

    setStatus(download ? "Watermarked and downloaded image." : "Watermark preview updated.");
  };

  return (
    <ToolLayout title="Image Watermark Tool" description="Add text or logo watermark and export image.">
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept="image/*" onChange={loadSource} />
          <span className="file-upload-trigger">Base Image</span>
        </label>
        <span className="file-upload-name">{imageName || "No base image"}</span>
      </div>
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept="image/*" onChange={loadLogo} />
          <span className="file-upload-trigger">Logo Overlay</span>
        </label>
        <span className="file-upload-name">{logoName || "No logo selected"}</span>
      </div>
      <div className="image-controls-grid">
        <label>Watermark Text<input value={text} onChange={(e) => setText(e.target.value)} /></label>
        <label>Position
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="top-left">Top Left</option>
            <option value="top-right">Top Right</option>
            <option value="center">Center</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-right">Bottom Right</option>
          </select>
        </label>
        <label>Font Size<input type="number" min="8" max="220" value={fontSize} onChange={(e) => setFontSize(e.target.value)} /></label>
        <label>Opacity %<input type="number" min="1" max="100" value={opacity} onChange={(e) => setOpacity(e.target.value)} /></label>
        <label>Color<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        <label>Output Format
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="image/png">PNG</option>
            <option value="image/jpeg">JPG</option>
            <option value="image/webp">WEBP</option>
          </select>
        </label>
      </div>
      <div className="row-actions"><button onClick={() => applyWatermark(false)}>Apply Preview</button><button onClick={() => applyWatermark(true)}>Watermark & Download</button></div>
      {preview && <div className="image-preview-wrap"><img src={preview} alt="watermark preview" className="image-preview" /></div>}
      {status && <p className={status.includes("Please") || status.includes("must") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function ImageCompressorTool() {
  const [source, setSource] = useState(null);
  const [preview, setPreview] = useState("");
  const [format, setFormat] = useState("image/jpeg");
  const [quality, setQuality] = useState(75);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName("");
      return;
    }
    try {
      const { image, dataUrl } = await loadImageFromFile(file);
      setSource({ image, file });
      setPreview(dataUrl);
      setResult(null);
      setStatus("Image loaded for compression.");
      setFileName(file.name);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const compress = async () => {
    if (!source?.image) {
      setStatus("Please upload an image first.");
      return;
    }
    const qError = validators.number(quality, "Quality", { min: 1, max: 100, integer: true });
    if (qError) {
      setStatus(qError);
      return;
    }

    const { blob, dataUrl } = await transformImageOnCanvas({
      image: source.image,
      width: source.image.width,
      height: source.image.height,
      format,
      quality: Number(quality) / 100
    });

    setPreview(dataUrl);
    const reduction = ((1 - blob.size / source.file.size) * 100).toFixed(2);
    setResult({ original: source.file.size, compressed: blob.size, reduction: Number.isFinite(Number(reduction)) ? reduction : "0.00", blob });
    setStatus("Compression complete.");
  };

  const download = () => {
    if (!result?.blob || !source?.file) return;
    const ext = format === "image/jpeg" ? "jpg" : format === "image/webp" ? "webp" : "png";
    const base = source.file.name.replace(/\.[^.]+$/, "");
    downloadBlob(result.blob, `${base}-compressed.${ext}`);
  };

  return (
    <ToolLayout title="Image Compressor" description="Compress and optimize image size with quality controls.">
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept="image/*" onChange={onFile} />
          <span className="file-upload-trigger">Browse Image</span>
        </label>
        <span className="file-upload-name">{fileName || "No file selected"}</span>
      </div>
      <div className="row-actions">
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="image/jpeg">JPG</option>
          <option value="image/webp">WEBP</option>
          <option value="image/png">PNG</option>
        </select>
        <input type="number" min="1" max="100" value={quality} onChange={(e) => setQuality(e.target.value)} placeholder="Quality" />
        <button onClick={compress}>Compress</button>
        <button onClick={download}>Download</button>
      </div>
      {result && (
        <div className="metrics-grid">
          <div className="glass-panel"><h4>Original (bytes)</h4><p>{result.original}</p></div>
          <div className="glass-panel"><h4>Compressed (bytes)</h4><p>{result.compressed}</p></div>
          <div className="glass-panel"><h4>Reduction</h4><p>{result.reduction}%</p></div>
        </div>
      )}
      {preview && <div className="image-preview-wrap"><img src={preview} alt="compressed preview" className="image-preview" /></div>}
      {status && <p className={status.includes("Please") || status.includes("must") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function FaviconGeneratorTool() {
  const [source, setSource] = useState(null);
  const [icons, setIcons] = useState([]);
  const [status, setStatus] = useState("");
  const sizes = [16, 32, 48, 64, 96, 128, 256];
  const [fileName, setFileName] = useState("");

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName("");
      return;
    }
    try {
      const { image } = await loadImageFromFile(file);
      setSource({ image, file });
      setStatus("Image loaded. Generate icons.");
      setFileName(file.name);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const generate = async () => {
    if (!source?.image) {
      setStatus("Please upload an image first.");
      return;
    }

    const outputs = [];
    for (const size of sizes) {
      const { blob, dataUrl } = await transformImageOnCanvas({ image: source.image, width: size, height: size, format: "image/png", quality: 0.92 });
      outputs.push({ size, blob, dataUrl });
    }
    setIcons(outputs);
    setStatus("Favicon set generated.");
  };

  const downloadIcon = (icon) => {
    const base = source?.file?.name?.replace(/\.[^.]+$/, "") || "favicon";
    downloadBlob(icon.blob, `${base}-${icon.size}x${icon.size}.png`);
  };

  return (
    <ToolLayout title="Favicon Generator" description="Generate multiple favicon sizes from one image.">
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept="image/*" onChange={onFile} />
          <span className="file-upload-trigger">Browse Image</span>
        </label>
        <span className="file-upload-name">{fileName || "No file selected"}</span>
        <button onClick={generate}>Generate Icons</button>
      </div>
      <div className="favicon-grid">
        {icons.map((icon) => (
          <button key={icon.size} className="favicon-item glass-panel" onClick={() => downloadIcon(icon)}>
            <img src={icon.dataUrl} alt={`${icon.size}px icon`} />
            <span>{icon.size}x{icon.size}</span>
          </button>
        ))}
      </div>
      {status && <p className={status.includes("Please") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function ColorPaletteExtractorTool() {
  const [palette, setPalette] = useState([]);
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName("");
      return;
    }
    try {
      const { image } = await loadImageFromFile(file);
      const canvas = document.createElement("canvas");
      const size = 80;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setStatus("Canvas context not available.");
        return;
      }
      ctx.drawImage(image, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const map = new Map();

      for (let i = 0; i < data.length; i += 16) {
        const r = Math.round(data[i] / 16) * 16;
        const g = Math.round(data[i + 1] / 16) * 16;
        const b = Math.round(data[i + 2] / 16) * 16;
        const hex = rgbToHex(r, g, b);
        map.set(hex, (map.get(hex) || 0) + 1);
      }

      const colors = [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([hex]) => hex);

      setPalette(colors);
      setStatus("Extracted dominant color palette.");
      setFileName(file.name);
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <ToolLayout title="Color Palette Extractor" description="Extract dominant colors from an image.">
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept="image/*" onChange={onFile} />
          <span className="file-upload-trigger">Browse Image</span>
        </label>
        <span className="file-upload-name">{fileName || "No file selected"}</span>
      </div>
      <div className="palette-grid">
        {palette.map((color) => (
          <button key={color} className="palette-chip" style={{ background: color }} onClick={() => navigator.clipboard.writeText(color)} title="Click to copy hex">
            <span>{color}</span>
          </button>
        ))}
      </div>
      {status && <p className={status.includes("not available") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function CreditCardValidatorTool() {
  const [input, setInput] = useState("4111 1111 1111 1111");
  const [result, setResult] = useState("");

  const validate = () => {
    const base = validators.requiredText(input, "Card number");
    if (base) {
      setResult(base);
      return;
    }

    const ok = luhnCheck(input);
    const type = detectCardType(input);
    setResult(ok ? `Valid card (${type})` : `Invalid card (${type})`);
  };

  return (
    <ToolLayout title="Credit Card Validator" description="Validate cards with Luhn check and detect card type.">
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Card number" />
      <div className="row-actions"><button onClick={validate}>Validate</button></div>
      {result && <p className={result.startsWith("Valid") ? "status success" : "status error"}>{result}</p>}
    </ToolLayout>
  );
}

function UuidValidatorTool() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");

  const validate = () => {
    const error = validators.uuid(input);
    setResult(error || "UUID is valid.");
  };

  return (
    <ToolLayout title="UUID Validator" description="Validate UUID versions 1-5.">
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
      <div className="row-actions"><button onClick={validate}>Validate UUID</button></div>
      {result && <p className={result.includes("valid") ? "status success" : "status error"}>{result}</p>}
    </ToolLayout>
  );
}

function IpAddressAnalyzerTool() {
  const [input, setInput] = useState("192.168.1.10");
  const [output, setOutput] = useState("");

  const analyze = () => {
    const error = validators.ipv4(input);
    if (error) {
      setOutput(error);
      return;
    }

    const parts = input.split(".").map(Number);
    const privateRanges =
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168);

    const klass = parts[0] <= 127 ? "A" : parts[0] <= 191 ? "B" : parts[0] <= 223 ? "C" : parts[0] <= 239 ? "D" : "E";
    setOutput(JSON.stringify({ ip: input, class: klass, private: privateRanges, binary: parts.map((p) => p.toString(2).padStart(8, "0")).join(".") }, null, 2));
  };

  return (
    <ToolLayout title="IP Address Analyzer" description="Validate IPv4 and inspect class/private/binary details.">
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="IPv4 address" />
      <div className="row-actions"><button onClick={analyze}>Analyze</button></div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function TextHexBinaryTool() {
  const [text, setText] = useState("Hello");
  const [hex, setHex] = useState("");
  const [bin, setBin] = useState("");
  const [status, setStatus] = useState("");

  const encode = () => {
    const base = validators.requiredText(text, "Text");
    if (base) {
      setStatus(base);
      return;
    }
    const bytes = new TextEncoder().encode(text);
    setHex(Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(" "));
    setBin(Array.from(bytes).map((b) => b.toString(2).padStart(8, "0")).join(" "));
    setStatus("Encoded text to hex and binary.");
  };

  const decodeHex = () => {
    const error = validators.hexString(hex);
    if (error) {
      setStatus(error);
      return;
    }
    const cleaned = hex.replace(/\s+/g, "");
    const bytes = cleaned.match(/.{1,2}/g).map((pair) => parseInt(pair, 16));
    setText(new TextDecoder().decode(new Uint8Array(bytes)));
    setStatus("Decoded hex to text.");
  };

  return (
    <ToolLayout title="Text ⇄ Hex/Binary" description="Encode text to hex/binary and decode from hex.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea" />
      <div className="split-grid">
        <textarea value={hex} onChange={(e) => setHex(e.target.value)} className="tool-textarea" />
        <textarea value={bin} onChange={(e) => setBin(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions"><button onClick={encode}>Encode</button><button onClick={decodeHex}>Decode Hex</button></div>
      {status && <p className={status.includes("cannot") || status.includes("invalid") || status.includes("must") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function UnitConverterTool() {
  const [mode, setMode] = useState("length");
  const [value, setValue] = useState("10");
  const [from, setFrom] = useState("m");
  const [to, setTo] = useState("ft");
  const [result, setResult] = useState("");

  const options = {
    length: ["mm", "cm", "m", "km", "in", "ft", "yd", "mi"],
    weight: ["mg", "g", "kg", "lb", "oz"],
    temperature: ["C", "F", "K"]
  };

  const convert = () => {
    const error = validators.number(value, "Value");
    if (error) {
      setResult(error);
      return;
    }
    const n = Number(value);
    let output = 0;
    if (mode === "length") output = convertLength(n, from, to);
    if (mode === "weight") output = convertWeight(n, from, to);
    if (mode === "temperature") output = convertTemperature(n, from, to);
    setResult(`${n} ${from} = ${output.toFixed(6)} ${to}`);
  };

  useEffect(() => {
    setFrom(options[mode][0]);
    setTo(options[mode][1]);
  }, [mode]);

  return (
    <ToolLayout title="Unit Converter" description="Convert length, weight, and temperature units.">
      <div className="row-actions">
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="length">Length</option>
          <option value="weight">Weight</option>
          <option value="temperature">Temperature</option>
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" />
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          {options[mode].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {options[mode].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
        <button onClick={convert}>Convert</button>
      </div>
      {result && <p className={result.includes("must") ? "status error" : "status success"}>{result}</p>}
    </ToolLayout>
  );
}

function RandomGeneratorTool() {
  const [count, setCount] = useState(5);
  const [output, setOutput] = useState("");

  const generate = () => {
    const error = validators.number(count, "Count", { min: 1, max: 30, integer: true });
    if (error) {
      setOutput(error);
      return;
    }

    const words = ["alpha", "bravo", "charlie", "delta", "ember", "frost", "glow", "hydra", "ion", "jolt", "kilo", "lumen"];
    const rows = Array.from({ length: Number(count) }, () => {
      const id = crypto.randomUUID();
      const num = Math.floor(Math.random() * 1000000);
      const token = Array.from({ length: 3 }, () => words[Math.floor(Math.random() * words.length)]).join("-");
      return { id, num, token };
    });

    setOutput(JSON.stringify(rows, null, 2));
  };

  return (
    <ToolLayout title="Random Data Generator" description="Generate random IDs, numbers, and tokens.">
      <div className="row-actions"><input type="number" min="1" max="30" value={count} onChange={(e) => setCount(e.target.value)} /><button onClick={generate}>Generate</button></div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function PomodoroTimerTool() {
  const [focus, setFocus] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState("Focus");

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;
        if (phase === "Focus") {
          setPhase("Break");
          return Number(breakMin) * 60;
        }
        setPhase("Focus");
        return Number(focus) * 60;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, phase, focus, breakMin]);

  const reset = () => {
    setIsRunning(false);
    setPhase("Focus");
    setSecondsLeft(Number(focus) * 60);
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <ToolLayout title="Pomodoro Timer" description="Simple focus/break productivity timer.">
      <div className="row-actions">
        <input type="number" min="1" max="180" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Focus (min)" />
        <input type="number" min="1" max="60" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} placeholder="Break (min)" />
      </div>
      <div className="glass-panel output-panel"><p>{phase} • <strong>{mm}:{ss}</strong></p></div>
      <div className="row-actions"><button onClick={() => setIsRunning((v) => !v)}>{isRunning ? "Pause" : "Start"}</button><button onClick={reset}>Reset</button></div>
    </ToolLayout>
  );
}

function CountdownTimerTool() {
  const [minutes, setMinutes] = useState("5");
  const [seconds, setSeconds] = useState("0");
  const [remaining, setRemaining] = useState(300);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setRunning(false);
          setStatus("Time is up!");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const setup = () => {
    const minErr = validators.number(minutes, "Minutes", { min: 0, max: 600, integer: true });
    const secErr = validators.number(seconds, "Seconds", { min: 0, max: 59, integer: true });
    if (minErr || secErr) {
      setStatus(minErr || secErr);
      return;
    }
    const total = Number(minutes) * 60 + Number(seconds);
    setRemaining(total);
    setRunning(false);
    setStatus("Timer set.");
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <ToolLayout title="Countdown Timer" description="Set a timer in minutes and seconds.">
      <div className="row-actions">
        <input type="number" min="0" max="600" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Minutes" />
        <input type="number" min="0" max="59" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="Seconds" />
        <button onClick={setup}>Set</button>
      </div>
      <div className="glass-panel output-panel"><p><strong>{mm}:{ss}</strong></p></div>
      <div className="row-actions">
        <button onClick={() => setRunning((v) => !v)}>{running ? "Pause" : "Start"}</button>
        <button onClick={() => { setRunning(false); setRemaining(0); setStatus("Timer reset."); }}>Reset</button>
      </div>
      {status && <p className={status.includes("must") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function StopwatchTool() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState([]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((prev) => prev + 10), 10);
    return () => clearInterval(id);
  }, [running]);

  const format = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");
    const cc = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
    return `${hh}:${mm}:${ss}.${cc}`;
  };

  return (
    <ToolLayout title="Stopwatch" description="Measure elapsed time and capture lap times.">
      <div className="glass-panel output-panel"><p><strong>{format(elapsed)}</strong></p></div>
      <div className="row-actions">
        <button onClick={() => setRunning((v) => !v)}>{running ? "Pause" : "Start"}</button>
        <button onClick={() => setLaps((prev) => [format(elapsed), ...prev].slice(0, 20))}>Lap</button>
        <button onClick={() => { setRunning(false); setElapsed(0); setLaps([]); }}>Reset</button>
      </div>
      {laps.length > 0 && <ul className="list-panel glass-panel">{laps.map((lap, i) => <li key={`${lap}-${i}`}>Lap {laps.length - i}: {lap}</li>)}</ul>}
    </ToolLayout>
  );
}

function WorldClockTool() {
  const [now, setNow] = useState(new Date());
  const [zones, setZones] = useState(["UTC", "Asia/Kolkata", "Europe/London", "America/New_York", "Asia/Tokyo"]);
  const [customZone, setCustomZone] = useState("Australia/Sydney");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const addZone = () => {
    const base = validators.requiredText(customZone, "Timezone");
    if (base) {
      setStatus(base);
      return;
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: customZone });
      if (!zones.includes(customZone)) {
        setZones((prev) => [...prev, customZone]);
      }
      setStatus("Timezone added.");
    } catch {
      setStatus("Invalid timezone. Example: Europe/Paris");
    }
  };

  return (
    <ToolLayout title="World Clock" description="Track current time across multiple timezones.">
      <div className="row-actions">
        <input value={customZone} onChange={(e) => setCustomZone(e.target.value)} placeholder="Area/City" />
        <button onClick={addZone}>Add Timezone</button>
      </div>
      {status && <p className={status.includes("Invalid") || status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
      <div className="metrics-grid">
        {zones.map((zone) => (
          <div key={zone} className="glass-panel output-panel">
            <p><strong>{zone}</strong></p>
            <p>{now.toLocaleString("en-US", { timeZone: zone, hour12: false })}</p>
          </div>
        ))}
      </div>
    </ToolLayout>
  );
}

function AlarmClockTool() {
  const [alarm, setAlarm] = useState("07:00");
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("Alarm not set.");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => {
      const current = new Date();
      setNow(current);
      if (enabled) {
        const hh = String(current.getHours()).padStart(2, "0");
        const mm = String(current.getMinutes()).padStart(2, "0");
        if (`${hh}:${mm}` === alarm) {
          setStatus("Alarm ringing! Time reached.");
          setEnabled(false);
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [enabled, alarm]);

  return (
    <ToolLayout title="Alarm Clock" description="Set a local alarm time in your browser session.">
      <div className="row-actions">
        <input type="time" value={alarm} onChange={(e) => setAlarm(e.target.value)} />
        <button onClick={() => { setEnabled(true); setStatus(`Alarm set for ${alarm}.`); }}>Set Alarm</button>
        <button onClick={() => { setEnabled(false); setStatus("Alarm cancelled."); }}>Cancel</button>
      </div>
      <div className="glass-panel output-panel"><p>Current time: <strong>{now.toLocaleTimeString()}</strong></p></div>
      {status && <p className={status.includes("ringing") ? "status warning" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function JsonFormatter() {
  const [input, setInput] = useState('{\n  "name": "Tools",\n  "items": ["formatter", "minifier"]\n}');
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const handleTransform = (mode) => {
    const error = validators.jsonText(input);
    if (error) {
      setStatus(error);
      return;
    }

    const { parsed } = parseJsonSafely(input);
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
      {status && <p className={status.startsWith("Invalid") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function JsonExplorer() {
  const [input, setInput] = useState('{\n  "user": {\n    "name": "Kaus",\n    "roles": ["admin", "editor"]\n  }\n}');
  const [jsonTree, setJsonTree] = useState(null);
  const [error, setError] = useState("");
  const [collapsedPaths, setCollapsedPaths] = useState(new Set());

  const explore = () => {
    const validationError = validators.jsonText(input);
    if (validationError) {
      setError(validationError);
      setJsonTree(null);
      return;
    }

    const { parsed } = parseJsonSafely(input);
    setError("");
    setJsonTree(parsed);
    setCollapsedPaths(new Set());
  };

  const togglePath = (path) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAll = () => setCollapsedPaths(new Set());
  const collapseAll = () => setCollapsedPaths(new Set(["root"]));

  return (
    <ToolLayout title="JSON Explorer" description="Visual tree exploration for nested JSON. Click nodes to collapse/expand.">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
      <div className="row-actions">
        <button onClick={explore}>Explore</button>
        <button onClick={expandAll}>Expand All</button>
        <button onClick={collapseAll}>Collapse All</button>
      </div>
      {error && <p className="status error">{error}</p>}
      {jsonTree !== null && <div className="json-tree glass-panel"><JsonNode name="root" value={jsonTree} path="root" collapsedPaths={collapsedPaths} onToggle={togglePath} /></div>}
    </ToolLayout>
  );
}

function JsonLinter() {
  const [input, setInput] = useState('{\n  "ok": true\n}');
  const [feedback, setFeedback] = useState([]);

  const lint = () => {
    const notes = [];
    const validationError = validators.jsonText(input);
    if (validationError) {
      notes.push({ type: "error", text: validationError });
      setFeedback(notes);
      return;
    }

    const { parsed } = parseJsonSafely(input);
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
      <div className="row-actions"><button onClick={lint}>Run Lint</button></div>
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
  const [status, setStatus] = useState("");

  const sortKeys = () => {
    const validationError = validators.jsonText(input);
    if (validationError) {
      setStatus(validationError);
      return;
    }

    const { parsed } = parseJsonSafely(input);
    setOutput(JSON.stringify(sortJsonDeep(parsed), null, 2));
    setStatus("Sorted successfully.");
  };

  return (
    <ToolLayout title="JSON Sorter" description="Sort JSON keys recursively.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions"><button onClick={sortKeys}>Sort Keys</button></div>
      {status && <p className={status.startsWith("Invalid") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function JsonToCsv() {
  const [input, setInput] = useState('[{"name":"Alex","age":28},{"name":"Sam","age":32}]');
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");
  const [delimiter, setDelimiter] = useState(",");

  const convert = () => {
    const validationError = validators.jsonText(input);
    if (validationError) {
      setStatus(validationError);
      return;
    }

    const { parsed } = parseJsonSafely(input);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    if (!rows.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      setStatus("JSON must be an object or array of objects.");
      return;
    }

    setOutput(toCsv(rows, delimiter));
    setStatus("CSV generated.");
  };

  return (
    <ToolLayout title="JSON to CSV" description="Convert object arrays into CSV format.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions">
        <select value={delimiter} onChange={(e) => setDelimiter(e.target.value)} aria-label="Delimiter">
          {CSV_DELIMITERS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button onClick={convert}>Convert</button>
      </div>
      {status && <p className={status === "CSV generated." ? "status success" : "status error"}>{status}</p>}
  </ToolLayout>
);
}

function getJsonType(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function escapeJsonKey(key) {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) return `.${key}`;
  return `["${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}

function deepJsonDiff(left, right, path = "", depth = 0) {
  const MAX_DEPTH = 50;
  const diffs = [];
  const currentPath = path || "(root)";

  if (depth > MAX_DEPTH) {
    diffs.push({ path: currentPath, type: "modified", left: "(max depth)", right: "(max depth)" });
    return diffs;
  }

  if (left === right) return diffs;

  const leftType = getJsonType(left);
  const rightType = getJsonType(right);

  if (leftType === "undefined") {
    diffs.push({ path: currentPath, type: "added", left: undefined, right });
    return diffs;
  }
  if (rightType === "undefined") {
    diffs.push({ path: currentPath, type: "removed", left, right: undefined });
    return diffs;
  }

  if (leftType !== rightType) {
    diffs.push({ path: currentPath, type: "type_changed", left, right, leftType, rightType });
    return diffs;
  }

  if (leftType === "null") return diffs;

  if (leftType === "array") {
    const maxLen = Math.max(left.length, right.length);
    for (let i = 0; i < maxLen; i += 1) {
      const itemPath = `${path}[${i}]`;
      if (i >= left.length) {
        diffs.push({ path: itemPath, type: "added", left: undefined, right: right[i] });
      } else if (i >= right.length) {
        diffs.push({ path: itemPath, type: "removed", left: left[i], right: undefined });
      } else {
        diffs.push(...deepJsonDiff(left[i], right[i], itemPath, depth + 1));
      }
    }
    return diffs;
  }

  if (leftType === "object") {
    const allKeys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of allKeys) {
      const childPath = path + escapeJsonKey(key);
      diffs.push(...deepJsonDiff(left[key], right[key], childPath, depth + 1));
    }
    return diffs;
  }

  if (left !== right) {
    diffs.push({ path: currentPath, type: "modified", left, right });
  }
  return diffs;
}

function formatDiffValue(value) {
  if (value === undefined) return "(missing)";
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    const str = JSON.stringify(value);
    return str.length > 120 ? str.slice(0, 117) + "..." : str;
  }
  return String(value);
}

function JsonCompareTool() {
  const sampleLeft = JSON.stringify({
    name: "Alex",
    age: 28,
    active: true,
    score: null,
    roles: ["admin", "editor"],
    address: { city: "Delhi", zip: "110001", geo: { lat: 28.6, lng: 77.2 } },
    projects: [
      { id: 1, title: "Alpha", tags: ["web", "react"] },
      { id: 2, title: "Beta", tags: ["api"] }
    ]
  }, null, 2);
  const sampleRight = JSON.stringify({
    name: "Alex",
    age: 30,
    active: "yes",
    roles: ["admin", "viewer", "auditor"],
    address: { city: "Mumbai", geo: { lat: 19.0, lng: 72.8, alt: 14 } },
    projects: [
      { id: 1, title: "Alpha Rewrite", tags: ["web", "next"] },
      { id: 2, title: "Beta", tags: ["api", "graphql"] }
    ],
    department: "Engineering"
  }, null, 2);

  const [leftJson, setLeftJson] = useState(sampleLeft);
  const [rightJson, setRightJson] = useState(sampleRight);
  const [diffs, setDiffs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [feedback, setFeedback] = useState({ message: "", variant: "info" });

  const compare = () => {
    if (!leftJson.trim() || !rightJson.trim()) {
      setFeedback({ message: "Both JSON inputs are required.", variant: "error" });
      setDiffs([]);
      setMeta(null);
      return;
    }

    const parsedLeft = parseJsonSafely(leftJson);
    if (parsedLeft.error) {
      setFeedback({ message: `Left JSON: ${parsedLeft.error}`, variant: "error" });
      setDiffs([]);
      setMeta(null);
      return;
    }

    const parsedRight = parseJsonSafely(rightJson);
    if (parsedRight.error) {
      setFeedback({ message: `Right JSON: ${parsedRight.error}`, variant: "error" });
      setDiffs([]);
      setMeta(null);
      return;
    }

    const differences = deepJsonDiff(parsedLeft.parsed, parsedRight.parsed);
    setDiffs(differences);

    const added = differences.filter((d) => d.type === "added").length;
    const removed = differences.filter((d) => d.type === "removed").length;
    const modified = differences.filter((d) => d.type === "modified").length;
    const typeChanged = differences.filter((d) => d.type === "type_changed").length;
    setMeta({ total: differences.length, added, removed, modified, typeChanged });

    if (differences.length) {
      setFeedback({
        message: `Found ${differences.length} difference${differences.length === 1 ? "" : "s"}: ${added} added, ${removed} removed, ${modified} modified, ${typeChanged} type changed.`,
        variant: "warning"
      });
    } else {
      setFeedback({ message: "Both JSON values are identical.", variant: "success" });
    }
  };

  const badgeClass = (type) => {
    if (type === "added") return "json-diff-badge json-diff-added";
    if (type === "removed") return "json-diff-badge json-diff-removed";
    if (type === "type_changed") return "json-diff-badge json-diff-type";
    return "json-diff-badge json-diff-modified";
  };

  const badgeLabel = (diff) => {
    if (diff.type === "added") return "Added";
    if (diff.type === "removed") return "Removed";
    if (diff.type === "type_changed") return `${diff.leftType || "?"} \u2192 ${diff.rightType || "?"}`;
    return "Modified";
  };

  return (
    <ToolLayout title="JSON Compare" description="Deep compare two JSON values field by field. Handles nested objects, arrays, nulls, booleans, and missing fields.">
      <div className="split-grid">
        <textarea
          value={leftJson}
          onChange={(e) => setLeftJson(e.target.value)}
          className="tool-textarea"
          placeholder="Paste first JSON here"
          aria-label="Left JSON input"
        />
        <textarea
          value={rightJson}
          onChange={(e) => setRightJson(e.target.value)}
          className="tool-textarea"
          placeholder="Paste second JSON here"
          aria-label="Right JSON input"
        />
      </div>
      <div className="row-actions"><button onClick={compare}>Compare JSON</button></div>
      {feedback.message && <p className={`status ${feedback.variant}`}>{feedback.message}</p>}
      {meta && (
        <div className="glass-panel comparison-summary">
          <p>Total differences: <strong>{meta.total}</strong></p>
          <p>Added: <strong>{meta.added}</strong></p>
          <p>Removed: <strong>{meta.removed}</strong></p>
          <p>Modified: <strong>{meta.modified}</strong></p>
          {meta.typeChanged > 0 && <p>Type changed: <strong>{meta.typeChanged}</strong></p>}
        </div>
      )}
      {meta && diffs.length === 0 && <div className="glass-panel output-panel">No differences detected. Both JSON values match completely.</div>}
      {diffs.length > 0 && (
        <div className="json-diff-table">
          <div className="json-diff-row json-diff-header-row">
            <span>Change</span>
            <span>Path</span>
            <span>Left</span>
            <span>Right</span>
          </div>
          {diffs.map((diff, index) => (
            <div key={index} className="json-diff-row">
              <span className={badgeClass(diff.type)}>{badgeLabel(diff)}</span>
              <span className="json-diff-path">{diff.path}</span>
              <span className={diff.type === "removed" || diff.type === "modified" || diff.type === "type_changed" ? "json-diff-val json-diff-val-old" : "json-diff-val"}>{formatDiffValue(diff.left)}</span>
              <span className={diff.type === "added" || diff.type === "modified" || diff.type === "type_changed" ? "json-diff-val json-diff-val-new" : "json-diff-val"}>{formatDiffValue(diff.right)}</span>
            </div>
          ))}
        </div>
      )}
    </ToolLayout>
  );
}

function CsvToJsonTool() {
  const [input, setInput] = useState("name,role\nAlex,Engineer\nSam,Designer");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");
  const [delimiter, setDelimiter] = useState(",");

  const convert = () => {
    if (!input.trim()) {
      setStatus("CSV input is required.");
      setOutput("");
      return;
    }

    const parsed = parseCsv(input, delimiter);
    if (parsed.error) {
      setStatus(parsed.error);
      setOutput("");
      return;
    }

    setOutput(JSON.stringify(parsed.rows, null, 2));
    const count = parsed.rows.length;
    setStatus(`Converted ${count} row${count === 1 ? "" : "s"} to JSON.`);
  };

  return (
    <ToolLayout title="CSV to JSON" description="Convert delimited values into a JSON array of objects.">
      <div className="split-grid">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="tool-textarea"
          placeholder="name,role\nAlex,Engineer"
          aria-label="CSV input"
        />
        <textarea
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          className="tool-textarea"
          placeholder='[{"name":"Alex","role":"Engineer"}]'
          aria-label="JSON output"
        />
      </div>
      <div className="row-actions">
        <select value={delimiter} onChange={(e) => setDelimiter(e.target.value)} aria-label="Delimiter">
          {CSV_DELIMITERS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button onClick={convert}>Convert</button>
      </div>
      {status && <p className={status.includes("Converted") ? "status success" : "status error"}>{status}</p>}
    </ToolLayout>
  );
}

function CsvComparisonTool() {
  const [firstCsv, setFirstCsv] = useState("id,name,score\n1,Alex,92\n2,Sam,88");
  const [secondCsv, setSecondCsv] = useState("id,name,score\n1,Alex,92\n2,Sam,90");
  const [diffs, setDiffs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [feedback, setFeedback] = useState({ message: "", variant: "info" });
  const [delimiter, setDelimiter] = useState(",");

  const compare = () => {
    if (!firstCsv.trim() || !secondCsv.trim()) {
      setFeedback({ message: "Both CSV inputs are required.", variant: "error" });
      setDiffs([]);
      setMeta(null);
      return;
    }

    const parsedFirst = parseCsv(firstCsv, delimiter);
    if (parsedFirst.error) {
      setFeedback({ message: `First CSV: ${parsedFirst.error}`, variant: "error" });
      setDiffs([]);
      setMeta(null);
      return;
    }

    const parsedSecond = parseCsv(secondCsv, delimiter);
    if (parsedSecond.error) {
      setFeedback({ message: `Second CSV: ${parsedSecond.error}`, variant: "error" });
      setDiffs([]);
      setMeta(null);
      return;
    }

    const headers = Array.from(new Set([...parsedFirst.headers, ...parsedSecond.headers]));
    const maxRows = Math.max(parsedFirst.rows.length, parsedSecond.rows.length);
    const differences = [];

    for (let index = 0; index < maxRows; index += 1) {
      const rowFirst = parsedFirst.rows[index];
      const rowSecond = parsedSecond.rows[index];
      const hasFirstRow = Boolean(rowFirst);
      const hasSecondRow = Boolean(rowSecond);

      headers.forEach((header) => {
        const firstValue = hasFirstRow ? (Object.prototype.hasOwnProperty.call(rowFirst, header) ? rowFirst[header] ?? "" : "") : "";
        const secondValue = hasSecondRow ? (Object.prototype.hasOwnProperty.call(rowSecond, header) ? rowSecond[header] ?? "" : "") : "";

        if (firstValue !== secondValue) {
          differences.push({
            id: `${index}-${header}`,
            row: index + 1,
            column: header,
            first: hasFirstRow ? (Object.prototype.hasOwnProperty.call(rowFirst, header) ? firstValue : "(missing column)") : "(missing row)",
            second: hasSecondRow ? (Object.prototype.hasOwnProperty.call(rowSecond, header) ? secondValue : "(missing column)") : "(missing row)"
          });
        }
      });
    }

    setMeta({
      headersCount: headers.length,
      comparedRows: maxRows,
      firstRows: parsedFirst.rows.length,
      secondRows: parsedSecond.rows.length
    });
    setDiffs(differences);

    if (differences.length) {
      setFeedback({
        message: `Found ${differences.length} differing cell${differences.length === 1 ? "" : "s"} across ${headers.length} column${headers.length === 1 ? "" : "s"}.`,
        variant: "warning"
      });
    } else {
      setFeedback({ message: "All compared cells match.", variant: "success" });
    }
  };

  return (
    <ToolLayout title="CSV Comparison" description="Compare two CSV datasets to spot column-level differences.">
      <div className="split-grid">
        <textarea
          value={firstCsv}
          onChange={(e) => setFirstCsv(e.target.value)}
          className="tool-textarea"
          placeholder="id,name,score\n1,Alex,92"
          aria-label="First CSV input"
        />
        <textarea
          value={secondCsv}
          onChange={(e) => setSecondCsv(e.target.value)}
          className="tool-textarea"
          placeholder="id,name,score\n1,Alex,92"
          aria-label="Second CSV input"
        />
      </div>
      <div className="row-actions">
        <select value={delimiter} onChange={(e) => setDelimiter(e.target.value)} aria-label="Delimiter">
          {CSV_DELIMITERS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button onClick={compare}>Compare CSVs</button>
      </div>
      {feedback.message && <p className={`status ${feedback.variant}`}>{feedback.message}</p>}
      {meta && (
        <div className="glass-panel comparison-summary">
          <p>Headers compared: <strong>{meta.headersCount}</strong></p>
          <p>Rows in first CSV: <strong>{meta.firstRows}</strong></p>
          <p>Rows in second CSV: <strong>{meta.secondRows}</strong></p>
          <p>Rows compared: <strong>{meta.comparedRows}</strong></p>
        </div>
      )}
      {meta && diffs.length === 0 && <div className="glass-panel output-panel">No differences detected across compared rows.</div>}
      {diffs.length > 0 && (
        <div className="csv-diff-table">
          <div className="csv-diff-row csv-diff-header">
            <span>Row #</span>
            <span>Column</span>
            <span>First CSV</span>
            <span>Second CSV</span>
          </div>
          {diffs.map((diff) => (
            <div key={diff.id} className="csv-diff-row">
              <span className="csv-diff-badge">{diff.row}</span>
              <span>{diff.column}</span>
              <span>{diff.first || ""}</span>
              <span>{diff.second || ""}</span>
            </div>
          ))}
        </div>
      )}
    </ToolLayout>
  );
}

function TextEditor() {
  const [text, setText] = useState("Write, edit, and transform your text here.");
  const [status, setStatus] = useState("");

  const runTransform = (fn) => {
    const validationError = validators.requiredText(text, "Text");
    if (validationError) {
      setStatus(validationError);
      return;
    }
    setText(fn(text));
    setStatus("Transformation applied.");
  };

  const copy = async () => {
    const validationError = validators.requiredText(text, "Text");
    if (validationError) {
      setStatus(validationError);
      return;
    }
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard.");
  };

  return (
    <ToolLayout title="Text Editor" description="Simple editor with quick operations.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea text-editor" />
      <div className="row-actions">
        <button onClick={() => runTransform((s) => s.toUpperCase())}>Uppercase</button>
        <button onClick={() => runTransform((s) => s.toLowerCase())}>Lowercase</button>
        <button onClick={() => runTransform((s) => s.split("").reverse().join(""))}>Reverse</button>
        <button onClick={copy}>Copy</button>
      </div>
      {status && <p className={status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function TextDiffChecker() {
  const [left, setLeft] = useState("Line one\nLine two\nLine three");
  const [right, setRight] = useState("Line one\nLine changed\nLine three");

  const validationError = !left.trim() && !right.trim() ? "Both text boxes are empty." : "";

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
      {validationError && <p className="status warning">{validationError}</p>}
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
  const validationError = validators.requiredText(text, "Text");

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
      {validationError && <p className="status warning">{validationError}</p>}
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
  const [status, setStatus] = useState("");

  const run = (fn) => {
    const validationError = validators.requiredText(text, "Text");
    if (validationError) {
      setStatus(validationError);
      return;
    }
    setText(fn(text));
    setStatus("Converted.");
  };

  return (
    <ToolLayout title="Case Converter" description="Convert text to common casing styles.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea" />
      <div className="row-actions">
        <button onClick={() => run((s) => s.toLowerCase())}>lowercase</button>
        <button onClick={() => run((s) => s.toUpperCase())}>UPPERCASE</button>
        <button onClick={() => run((s) => s.toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase()))}>Title Case</button>
        <button onClick={() => run((s) => s.replace(/\s+/g, "_").toLowerCase())}>snake_case</button>
        <button onClick={() => run((s) => s.replace(/\s+/g, "-").toLowerCase())}>kebab-case</button>
      </div>
      {status && <p className={status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function LineTools() {
  const [text, setText] = useState("pear\napple\npear\nbanana");
  const [status, setStatus] = useState("");

  const run = (fn) => {
    const validationError = validators.requiredText(text, "Lines input");
    if (validationError) {
      setStatus(validationError);
      return;
    }

    const lines = text.split("\n");
    setText(fn(lines));
    setStatus("Operation completed.");
  };

  return (
    <ToolLayout title="Line Tools" description="Sort, trim, or deduplicate text lines.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea" />
      <div className="row-actions">
        <button onClick={() => run((lines) => [...lines].sort((a, b) => a.localeCompare(b)).join("\n"))}>Sort A-Z</button>
        <button onClick={() => run((lines) => [...lines].sort((a, b) => b.localeCompare(a)).join("\n"))}>Sort Z-A</button>
        <button onClick={() => run((lines) => lines.map((line) => line.trim()).join("\n"))}>Trim Lines</button>
        <button onClick={() => run((lines) => [...new Set(lines)].join("\n"))}>Remove Duplicates</button>
      </div>
      {status && <p className={status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function SlugGenerator() {
  const [text, setText] = useState("My Awesome Blog Title");
  const validationError = validators.requiredText(text, "Source text");

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
      {validationError && <p className="status warning">{validationError}</p>}
      <div className="glass-panel output-panel"><strong>Slug:</strong> {slug || "-"}</div>
    </ToolLayout>
  );
}

function LoremGenerator() {
  const [count, setCount] = useState(3);
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const bank = [
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    "Integer eu est vitae urna tempus vulputate nec sit amet leo.",
    "Aenean hendrerit enim id enim volutpat, vitae feugiat neque volutpat.",
    "Pellentesque habitant morbi tristique senectus et netus et malesuada.",
    "Vestibulum faucibus velit at purus convallis, vel interdum sem aliquet.",
    "Curabitur non purus at est pharetra faucibus sed ac purus."
  ];

  const generate = () => {
    const validationError = validators.number(count, "Paragraph count", { min: 1, max: 12, integer: true });
    if (validationError) {
      setStatus(validationError);
      return;
    }

    const n = Number(count);
    setOutput(Array.from({ length: n }, (_, i) => bank[i % bank.length]).join("\n\n"));
    setStatus("Generated lorem text.");
  };

  return (
    <ToolLayout title="Lorem Ipsum Generator" description="Generate placeholder paragraphs quickly.">
      <div className="row-actions">
        <input type="number" min="1" max="12" value={count} onChange={(e) => setCount(e.target.value)} />
        <button onClick={generate}>Generate</button>
      </div>
      {status && <p className={status.includes("must") ? "status error" : "status success"}>{status}</p>}
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function Base64Tool() {
  const [input, setInput] = useState("hello world");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const encode = () => {
    const validationError = validators.requiredText(input, "Input text");
    if (validationError) {
      setStatus(validationError);
      return;
    }
    setOutput(btoa(unescape(encodeURIComponent(input))));
    setStatus("Encoded");
  };

  const decode = () => {
    const validationError = validators.base64(input);
    if (validationError) {
      setStatus(validationError);
      return;
    }
    setOutput(decodeURIComponent(escape(atob(input))));
    setStatus("Decoded");
  };

  return (
    <ToolLayout title="Base64 Encoder / Decoder" description="Convert plain text to and from Base64.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions"><button onClick={encode}>Encode</button><button onClick={decode}>Decode</button></div>
      {status && <p className={status.includes("Invalid") || status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function UrlCodecTool() {
  const [input, setInput] = useState("https://example.com?q=hello world");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const encode = () => {
    const validationError = validators.requiredText(input, "URL text");
    if (validationError) {
      setStatus(validationError);
      return;
    }
    setOutput(encodeURIComponent(input));
    setStatus("Encoded URL component.");
  };

  const decode = () => {
    const validationError = validators.requiredText(input, "Encoded URL text");
    if (validationError) {
      setStatus(validationError);
      return;
    }
    try {
      setOutput(decodeURIComponent(input));
      setStatus("Decoded URL component.");
    } catch {
      setStatus("Invalid encoded URL component.");
    }
  };

  return (
    <ToolLayout title="URL Encoder / Decoder" description="Encode and decode URL components.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions"><button onClick={encode}>Encode</button><button onClick={decode}>Decode</button></div>
      {status && <p className={status.includes("Invalid") || status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function HtmlEntitiesTool() {
  const [input, setInput] = useState("<div>Hello & Welcome</div>");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const encode = () => {
    const validationError = validators.requiredText(input, "HTML input");
    if (validationError) {
      setStatus(validationError);
      return;
    }
    const div = document.createElement("div");
    div.innerText = input;
    setOutput(div.innerHTML);
    setStatus("Encoded HTML entities.");
  };

  const decode = () => {
    const validationError = validators.requiredText(input, "Encoded input");
    if (validationError) {
      setStatus(validationError);
      return;
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, "text/html");
    setOutput(doc.documentElement.textContent || "");
    setStatus("Decoded HTML entities.");
  };

  return (
    <ToolLayout title="HTML Entity Encoder / Decoder" description="Escape or unescape HTML entities.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions"><button onClick={encode}>Encode HTML</button><button onClick={decode}>Decode HTML</button></div>
      {status && <p className={status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function JwtDecoder() {
  const [token, setToken] = useState("");
  const [output, setOutput] = useState("");

  const decode = () => {
    const validationError = validators.jwt(token);
    if (validationError) {
      setOutput(`Error: ${validationError}`);
      return;
    }

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
      <div className="row-actions"><button onClick={decode}>Decode</button></div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function UuidGenerator() {
  const [versions, setVersions] = useState([]);
  const [status, setStatus] = useState("");

  const generate = () => {
    if (!crypto.randomUUID) {
      setStatus("randomUUID is not supported in this browser.");
      return;
    }
    const newId = crypto.randomUUID();
    setVersions((prev) => [newId, ...prev].slice(0, 20));
    setStatus("UUID generated.");
  };

  useEffect(() => {
    generate();
  }, []);

  return (
    <ToolLayout title="UUID Generator" description="Generate RFC-compliant random UUIDs.">
      <div className="row-actions"><button onClick={generate}>Generate UUID</button></div>
      {status && <p className={status.includes("not supported") ? "status error" : "status success"}>{status}</p>}
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
  const [algorithm, setAlgorithm] = useState("SHA-256");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const generate = async () => {
    const validationError = validators.requiredText(input, "Hash input");
    if (validationError) {
      setStatus(validationError);
      setOutput("");
      return;
    }

    if (!crypto.subtle) {
      setStatus("Web Crypto API not available in this environment.");
      setOutput("");
      return;
    }

    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest(algorithm, encoded);
    const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    setOutput(hash);
    setStatus(`Generated ${algorithm} hash.`);
  };

  return (
    <ToolLayout title="Hash Generator" description="Create SHA hashes in-browser with selectable algorithm.">
      <div className="row-actions">
        <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value)}>
          <option value="SHA-1">SHA-1</option>
          <option value="SHA-256">SHA-256</option>
          <option value="SHA-384">SHA-384</option>
          <option value="SHA-512">SHA-512</option>
        </select>
      </div>
      <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
      <div className="row-actions"><button onClick={generate}>Generate Hash</button></div>
      {status && <p className={status.includes("cannot") || status.includes("not available") ? "status error" : "status success"}>{status}</p>}
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
    const patternError = validators.requiredText(pattern, "Regex pattern");
    const flagError = validators.regexFlags(flags);
    if (patternError || flagError) {
      setResult(`Error: ${patternError || flagError}`);
      return;
    }

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
  const [status, setStatus] = useState("");
  const [includeUpper, setIncludeUpper] = useState(true);
  const [includeLower, setIncludeLower] = useState(true);
  const [includeDigits, setIncludeDigits] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [mode, setMode] = useState("password");

  const getCharset = () => {
    let chars = "";
    if (includeUpper) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (includeLower) chars += "abcdefghijklmnopqrstuvwxyz";
    if (includeDigits) chars += "0123456789";
    if (includeSymbols) chars += "!@#$%^&*()_+[]{}<>?/|~";
    return chars;
  };

  const generate = () => {
    const min = mode === "password" ? 6 : 1;
    const max = mode === "password" ? 128 : 256;
    const validationError = validators.number(length, `${mode === "password" ? "Password" : "String"} length`, { min, max, integer: true });
    if (validationError) {
      setStatus(validationError);
      return;
    }

    const chars = getCharset();
    if (!chars) {
      setStatus("Select at least one character set.");
      return;
    }

    const n = Number(length);
    const random = crypto.getRandomValues(new Uint32Array(n));
    const password = Array.from(random, (num) => chars[num % chars.length]).join("");
    setOutput(password);
    setStatus(mode === "password" ? "Password generated." : "Random string generated.");
  };

  return (
    <ToolLayout title="Random String & Password Generator" description="Generate secure random strings/passwords with configurable length and character sets.">
      <div className="row-actions">
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="password">Password</option>
          <option value="string">Random String</option>
        </select>
        <input type="number" min="1" max="256" value={length} onChange={(e) => setLength(e.target.value)} />
        <button onClick={generate}>Generate</button>
      </div>
      <div className="row-actions">
        <label className="checkbox-pill"><input type="checkbox" checked={includeUpper} onChange={(e) => setIncludeUpper(e.target.checked)} />Uppercase</label>
        <label className="checkbox-pill"><input type="checkbox" checked={includeLower} onChange={(e) => setIncludeLower(e.target.checked)} />Lowercase</label>
        <label className="checkbox-pill"><input type="checkbox" checked={includeDigits} onChange={(e) => setIncludeDigits(e.target.checked)} />Digits</label>
        <label className="checkbox-pill"><input type="checkbox" checked={includeSymbols} onChange={(e) => setIncludeSymbols(e.target.checked)} />Symbols</label>
      </div>
      {status && <p className={status.includes("must") || status.includes("Select") ? "status error" : "status success"}>{status}</p>}
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function QueryStringTool() {
  const [input, setInput] = useState("name=Kaus&role=developer&city=Mumbai");
  const [output, setOutput] = useState("");

  const parse = () => {
    const validationError = validators.queryString(input);
    if (validationError) {
      setOutput(validationError);
      return;
    }

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
      <div className="row-actions"><button onClick={parse}>Parse</button><button onClick={build}>Build</button></div>
    </ToolLayout>
  );
}

function TimestampConverter() {
  const [unix, setUnix] = useState(Math.floor(Date.now() / 1000));
  const [date, setDate] = useState(new Date().toISOString());
  const [status, setStatus] = useState("");

  const convertFromUnix = () => {
    const validationError = validators.number(unix, "Unix timestamp");
    if (validationError) {
      setStatus(validationError);
      return;
    }

    const milliseconds = String(unix).length > 10 ? Number(unix) : Number(unix) * 1000;
    const parsedDate = new Date(milliseconds);
    if (Number.isNaN(parsedDate.getTime())) {
      setStatus("Invalid timestamp value.");
      return;
    }

    setDate(parsedDate.toISOString());
    setStatus("Converted to ISO date.");
  };

  const convertToUnix = () => {
    const validationError = validators.requiredText(date, "ISO date");
    if (validationError) {
      setStatus(validationError);
      return;
    }

    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      setStatus("Invalid ISO date.");
      return;
    }

    setUnix(Math.floor(parsed.getTime() / 1000));
    setStatus("Converted to Unix timestamp.");
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
      {status && <p className={status.includes("Invalid") || status.includes("must") || status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function PercentageCalculator() {
  const [a, setA] = useState(25);
  const [b, setB] = useState(200);

  const validationA = validators.number(a, "A");
  const validationB = validators.number(b, "B");
  const percentOf = validationA || validationB ? "-" : ((Number(a) / 100) * Number(b)).toFixed(2);
  const isWhatPercent = validationA || validationB || Number(b) === 0 ? "-" : ((Number(a) / Number(b)) * 100).toFixed(2);

  return (
    <ToolLayout title="Percentage Calculator" description="Calculate percentages in multiple ways.">
      <div className="split-grid">
        <div className="glass-panel output-panel"><p>{a}% of {b} = <strong>{percentOf}</strong></p></div>
        <div className="glass-panel output-panel"><p>{a} is <strong>{isWhatPercent}</strong>% of {b}</p></div>
      </div>
      <div className="row-actions">
        <input type="number" value={a} onChange={(e) => setA(e.target.value)} placeholder="A" />
        <input type="number" value={b} onChange={(e) => setB(e.target.value)} placeholder="B" />
      </div>
      {(validationA || validationB || Number(b) === 0) && <p className="status warning">{validationA || validationB || "B cannot be 0 for ratio calculation."}</p>}
    </ToolLayout>
  );
}

function BmiCalculator() {
  const [height, setHeight] = useState(172);
  const [weight, setWeight] = useState(68);

  const error = validators.number(height, "Height (cm)", { min: 50, max: 280 }) || validators.number(weight, "Weight (kg)", { min: 10, max: 500 });

  const bmi = useMemo(() => {
    if (error) {
      return 0;
    }
    const meters = Number(height) / 100;
    return Number(weight) / (meters * meters);
  }, [error, height, weight]);

  const label = bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal" : bmi < 30 ? "Overweight" : "Obese";

  return (
    <ToolLayout title="BMI Calculator" description="Calculate body mass index quickly.">
      <div className="row-actions">
        <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="Height cm" />
        <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Weight kg" />
      </div>
      {error && <p className="status warning">{error}</p>}
      <div className="glass-panel output-panel"><p>BMI: <strong>{bmi ? bmi.toFixed(2) : "0.00"}</strong> ({label})</p></div>
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
    const validationError = validators.requiredText(hex, "HEX color");
    if (validationError) {
      setStatus(validationError);
      return;
    }
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
      <div className="glass-panel output-panel" style={{ borderLeft: `6px solid ${hex}` }}><p>Preview color: <strong>{hex}</strong></p></div>
      {status && <p className={status.startsWith("Converted") ? "status success" : "status error"}>{status}</p>}
    </ToolLayout>
  );
}

function ScientificCalculatorTool() {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("");
  const [history, setHistory] = useState([]);

  const calculate = () => {
    const base = validators.requiredText(expression, "Expression");
    if (base) {
      setResult("Error");
      return;
    }

    const sanitized = expression
      .replace(/\^/g, "**")
      .replace(/sin\(/g, "Math.sin(")
      .replace(/cos\(/g, "Math.cos(")
      .replace(/tan\(/g, "Math.tan(")
      .replace(/asin\(/g, "Math.asin(")
      .replace(/acos\(/g, "Math.acos(")
      .replace(/atan\(/g, "Math.atan(")
      .replace(/log\(/g, "Math.log10(")
      .replace(/ln\(/g, "Math.log(")
      .replace(/sqrt\(/g, "Math.sqrt(")
      .replace(/abs\(/g, "Math.abs(")
      .replace(/exp\(/g, "Math.exp(")
      .replace(/pi/gi, "Math.PI")
      .replace(/e/gi, "Math.E");

    if (!/^[0-9+\-*/().,%\s*Math.]+$/.test(sanitized)) {
      setResult("Error");
      return;
    }

    try {
      const value = Function(`"use strict"; return (${sanitized});`)();
      if (!Number.isFinite(Number(value))) {
        setResult("Error");
        return;
      }
      const resultStr = String(value);
      setResult(resultStr);
      setHistory((prev) => [{ expr: expression, res: resultStr }, ...prev].slice(0, 10));
    } catch {
      setResult("Error");
    }
  };

  const insert = (text) => {
    setExpression((prev) => prev + text);
  };

  const clear = () => {
    setExpression("");
    setResult("");
  };

  const backspace = () => {
    setExpression((prev) => prev.slice(0, -1));
  };

  const calculatePercentage = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setExpression(String(val / 100));
    } catch {
      setExpression((prev) => prev + "/100");
    }
  };

  const calculateReciprocal = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setExpression(String(1 / val));
    } catch {
      setExpression((prev) => prev ? `1/(${prev})` : "1/");
    }
  };

  const calculateSquare = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setExpression(String(val * val));
    } catch {
      setExpression((prev) => prev ? `(${prev})^2` : "^2");
    }
  };

  const calculateCube = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setExpression(String(val * val * val));
    } catch {
      setExpression((prev) => prev ? `(${prev})^3` : "^3");
    }
  };

  const calculateSquareRoot = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setExpression(String(Math.sqrt(val)));
    } catch {
      setExpression((prev) => prev ? `sqrt(${prev})` : "sqrt(");
    }
  };

  const toggleSign = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setExpression(String(-val));
    } catch {
      setExpression((prev) => prev ? `-${prev}` : "-");
    }
  };

  return (
    <ToolLayout title="Scientific Calculator" description="Full-featured scientific calculator with all standard functions.">
      <div className="calculator-container">
        <div className="calculator-display">
          <div className="calc-expression">{expression || "0"}</div>
          <div className="calc-result">{result || "0"}</div>
        </div>
        <div className="calculator-grid">
          <button className="calc-btn calc-btn-func" onClick={calculatePercentage}>%</button>
          <button className="calc-btn calc-btn-func" onClick={calculateReciprocal}>1/x</button>
          <button className="calc-btn calc-btn-func" onClick={calculateSquare}>x²</button>
          <button className="calc-btn calc-btn-func" onClick={calculateCube}>x³</button>
          <button className="calc-btn calc-btn-func" onClick={calculateSquareRoot}>√x</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("sin(")}>sin</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("cos(")}>cos</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("tan(")}>tan</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("log(")}>log</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("ln(")}>ln</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("(")}>(</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert(")")}>)</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("^")}>xʸ</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("pi")}>π</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("e")}>e</button>
          <button className="calc-btn calc-btn-op" onClick={() => insert("+")}>+</button>
          <button className="calc-btn calc-btn-op" onClick={() => insert("-")}>−</button>
          <button className="calc-btn calc-btn-op" onClick={() => insert("*")}>×</button>
          <button className="calc-btn calc-btn-op" onClick={() => insert("/")}>÷</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("7")}>7</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("8")}>8</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("9")}>9</button>
          <button className="calc-btn calc-btn-clear" onClick={backspace}>⌫</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("4")}>4</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("5")}>5</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("6")}>6</button>
          <button className="calc-btn calc-btn-clear" onClick={clear}>C</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("1")}>1</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("2")}>2</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("3")}>3</button>
          <button className="calc-btn calc-btn-op" onClick={calculate}>=</button>
          <button className="calc-btn calc-btn-num" onClick={toggleSign}>±</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("0")}>0</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert(".")}>.</button>
        </div>
        {history.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <label>History</label>
            <ul className="list-panel">
              {history.map((item, idx) => (
                <li key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span>{item.expr}</span>
                  <strong>= {item.res}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ToolLayout>
  );
}

function AdvancedCalculatorTool() {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("");
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState([]);

  const factorial = (n) => {
    if (n < 0) return NaN;
    if (n === 0 || n === 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  };

  const permutation = (n, r) => {
    if (n < 0 || r < 0 || r > n) return NaN;
    return factorial(n) / factorial(n - r);
  };

  const combination = (n, r) => {
    if (n < 0 || r < 0 || r > n) return NaN;
    return factorial(n) / (factorial(r) * factorial(n - r));
  };

  const calculate = () => {
    const base = validators.requiredText(expression, "Expression");
    if (base) {
      setResult("Error");
      return;
    }

    let sanitized = expression
      .replace(/\^/g, "**")
      .replace(/sin\(/g, "Math.sin(")
      .replace(/cos\(/g, "Math.cos(")
      .replace(/tan\(/g, "Math.tan(")
      .replace(/asin\(/g, "Math.asin(")
      .replace(/acos\(/g, "Math.acos(")
      .replace(/atan\(/g, "Math.atan(")
      .replace(/sinh\(/g, "Math.sinh(")
      .replace(/cosh\(/g, "Math.cosh(")
      .replace(/tanh\(/g, "Math.tanh(")
      .replace(/log\(/g, "Math.log10(")
      .replace(/ln\(/g, "Math.log(")
      .replace(/sqrt\(/g, "Math.sqrt(")
      .replace(/cbrt\(/g, "Math.cbrt(")
      .replace(/abs\(/g, "Math.abs(")
      .replace(/exp\(/g, "Math.exp(")
      .replace(/pi/gi, "Math.PI")
      .replace(/e/gi, "Math.E");

    if (!/^[0-9+\-*/().,%\s*Math.]+$/.test(sanitized)) {
      setResult("Error");
      return;
    }

    try {
      const value = Function(`"use strict"; return (${sanitized});`)();
      if (!Number.isFinite(Number(value))) {
        setResult("Error");
        return;
      }
      const resultStr = String(value);
      setResult(resultStr);
      setHistory((prev) => [{ expr: expression, res: resultStr }, ...prev].slice(0, 10));
    } catch {
      setResult("Error");
    }
  };

  const insert = (text) => {
    setExpression((prev) => prev + text);
  };

  const clear = () => {
    setExpression("");
    setResult("");
  };

  const backspace = () => {
    setExpression((prev) => prev.slice(0, -1));
  };

  const toggleSign = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setExpression(String(-val));
    } catch {
      setExpression((prev) => prev ? `-${prev}` : "-");
    }
  };

  const calculatePercentage = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setExpression(String(val / 100));
    } catch {
      setExpression((prev) => prev + "/100");
    }
  };

  const calculateReciprocal = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setExpression(String(1 / val));
    } catch {
      setExpression((prev) => prev ? `1/(${prev})` : "1/");
    }
  };

  const calculateSquare = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setExpression(String(val * val));
    } catch {
      setExpression((prev) => prev ? `(${prev})^2` : "^2");
    }
  };

  const calculateCube = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setExpression(String(val * val * val));
    } catch {
      setExpression((prev) => prev ? `(${prev})^3` : "^3");
    }
  };

  const calculateSquareRoot = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setExpression(String(Math.sqrt(val)));
    } catch {
      setExpression((prev) => prev ? `sqrt(${prev})` : "sqrt(");
    }
  };

  const memoryRecall = () => {
    setExpression((prev) => prev + memory);
  };

  const memoryClear = () => {
    setMemory(0);
  };

  const memoryAdd = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setMemory((prev) => prev + val);
      setExpression("");
    } catch {
      setResult("Error");
    }
  };

  const memorySubtract = () => {
    try {
      const val = Function(`"use strict"; return (${expression})`)();
      setMemory((prev) => prev - val);
      setExpression("");
    } catch {
      setResult("Error");
    }
  };

  return (
    <ToolLayout title="Advanced Calculator" description="Full-featured advanced calculator with memory, hyperbolic functions, and all standard operations.">
      <div className="calculator-container">
        <div className="calculator-display">
          <div className="calc-expression">{expression || "0"}</div>
          <div className="calc-result">{result || "0"}</div>
        </div>
        <div className="calc-memory-bar">
          <span className="calc-memory-label">M: {memory}</span>
        </div>
        <div className="calculator-grid">
          <button className="calc-btn calc-btn-func" onClick={calculatePercentage}>%</button>
          <button className="calc-btn calc-btn-func" onClick={calculateReciprocal}>1/x</button>
          <button className="calc-btn calc-btn-func" onClick={calculateSquare}>x²</button>
          <button className="calc-btn calc-btn-func" onClick={calculateCube}>x³</button>
          <button className="calc-btn calc-btn-func" onClick={calculateSquareRoot}>√x</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("sin(")}>sin</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("cos(")}>cos</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("tan(")}>tan</button>
          <button className="calc-btn calc-btn-op" onClick={() => insert("/")}>÷</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("sinh(")}>sinh</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("cosh(")}>cosh</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("tanh(")}>tanh</button>
          <button className="calc-btn calc-btn-op" onClick={() => insert("*")}>×</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("log(")}>log</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("ln(")}>ln</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("cbrt(")}>∛</button>
          <button className="calc-btn calc-btn-op" onClick={() => insert("-")}>−</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("asin(")}>asin</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("acos(")}>acos</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("atan(")}>atan</button>
          <button className="calc-btn calc-btn-op" onClick={() => insert("+")}>+</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("(")}>(</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert(")")}>)</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("^")}>xʸ</button>
          <button className="calc-btn calc-btn-op" onClick={calculate}>=</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("pi")}>π</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("e")}>e</button>
          <button className="calc-btn calc-btn-func" onClick={() => insert("abs(")}>abs</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("7")}>7</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("8")}>8</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("9")}>9</button>
          <button className="calc-btn calc-btn-clear" onClick={backspace}>⌫</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("4")}>4</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("5")}>5</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("6")}>6</button>
          <button className="calc-btn calc-btn-clear" onClick={clear}>C</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("1")}>1</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("2")}>2</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("3")}>3</button>
          <button className="calc-btn calc-btn-num" onClick={toggleSign}>±</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert("0")}>0</button>
          <button className="calc-btn calc-btn-num" onClick={() => insert(".")}>.</button>
          <button className="calc-btn calc-btn-mem" onClick={memoryRecall}>MR</button>
          <button className="calc-btn calc-btn-mem" onClick={memoryAdd}>M+</button>
          <button className="calc-btn calc-btn-mem" onClick={memorySubtract}>M-</button>
          <button className="calc-btn calc-btn-mem" onClick={memoryClear}>MC</button>
        </div>
        {history.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <label>History</label>
            <ul className="list-panel">
              {history.map((item, idx) => (
                <li key={idx} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span>{item.expr}</span>
                  <strong>= {item.res}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ToolLayout>
  );
}

function EquationSolverTool() {
  const [a, setA] = useState("1");
  const [b, setB] = useState("-3");
  const [c, setC] = useState("2");
  const [result, setResult] = useState("");

  const solve = () => {
    const errors = [validators.number(a, "a"), validators.number(b, "b"), validators.number(c, "c")].filter(Boolean);
    if (errors.length) {
      setResult(errors[0]);
      return;
    }

    const A = Number(a);
    const B = Number(b);
    const C = Number(c);

    if (A === 0) {
      if (B === 0) {
        setResult("No unique solution.");
        return;
      }
      setResult(`Linear root: x = ${(-C / B).toFixed(6)}`);
      return;
    }

    const d = B * B - 4 * A * C;
    if (d > 0) {
      const x1 = (-B + Math.sqrt(d)) / (2 * A);
      const x2 = (-B - Math.sqrt(d)) / (2 * A);
      setResult(`Real roots: x1=${x1.toFixed(6)}, x2=${x2.toFixed(6)}`);
      return;
    }
    if (d === 0) {
      setResult(`Repeated root: x=${(-B / (2 * A)).toFixed(6)}`);
      return;
    }

    const real = (-B / (2 * A)).toFixed(6);
    const imag = (Math.sqrt(Math.abs(d)) / (2 * A)).toFixed(6);
    setResult(`Complex roots: ${real} ± ${imag}i`);
  };

  return (
    <ToolLayout title="Equation Solver" description="Solve linear and quadratic equations: ax² + bx + c = 0.">
      <div className="row-actions">
        <input value={a} onChange={(e) => setA(e.target.value)} placeholder="a" />
        <input value={b} onChange={(e) => setB(e.target.value)} placeholder="b" />
        <input value={c} onChange={(e) => setC(e.target.value)} placeholder="c" />
        <button onClick={solve}>Solve</button>
      </div>
      {result && <p className={result.includes("must") || result.includes("No unique") ? "status error" : "status success"}>{result}</p>}
    </ToolLayout>
  );
}

function StatisticsTool() {
  const [input, setInput] = useState("12, 15, 18, 21, 24, 24, 30");
  const [output, setOutput] = useState("");

  const analyze = () => {
    const values = parseNumberListText(input);
    if (!values) {
      setOutput("Please enter valid numbers separated by comma or space.");
      return;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const mean = sum / count;
    const median = count % 2 ? sorted[Math.floor(count / 2)] : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
    const freq = new Map();
    sorted.forEach((v) => freq.set(v, (freq.get(v) || 0) + 1));
    const maxFreq = Math.max(...freq.values());
    const mode = [...freq.entries()].filter(([, n]) => n === maxFreq).map(([v]) => v);
    const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
    const stdDev = Math.sqrt(variance);

    setOutput(
      JSON.stringify(
        {
          count,
          min: sorted[0],
          max: sorted[count - 1],
          sum,
          mean: Number(mean.toFixed(6)),
          median,
          mode,
          variance: Number(variance.toFixed(6)),
          standardDeviation: Number(stdDev.toFixed(6))
        },
        null,
        2
      )
    );
  };

  return (
    <ToolLayout title="Statistics Tool" description="Compute mean, median, mode, variance and standard deviation.">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
      <div className="row-actions"><button onClick={analyze}>Analyze</button></div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function MatrixCalculatorTool() {
  const [matrixA, setMatrixA] = useState("1,2;3,4");
  const [matrixB, setMatrixB] = useState("5,6;7,8");
  const [output, setOutput] = useState("");

  const compute = (action) => {
    const A = parseMatrix2x2(matrixA);
    const B = parseMatrix2x2(matrixB);
    if (!A || (action !== "det" && action !== "inv" && !B)) {
      setOutput("Matrices must be in format: a,b;c,d");
      return;
    }

    const [[a, b], [c, d]] = A;
    const detA = a * d - b * c;

    if (action === "det") {
      setOutput(`det(A) = ${detA}`);
      return;
    }

    if (action === "inv") {
      if (detA === 0) {
        setOutput("Matrix A is non-invertible (determinant is 0).");
        return;
      }
      const inv = [[d / detA, -b / detA], [-c / detA, a / detA]];
      setOutput(JSON.stringify(inv, null, 2));
      return;
    }

    const [[e, f], [g, h]] = B;
    if (action === "add") {
      setOutput(JSON.stringify([[a + e, b + f], [c + g, d + h]], null, 2));
      return;
    }
    if (action === "mul") {
      setOutput(JSON.stringify([[a * e + b * g, a * f + b * h], [c * e + d * g, c * f + d * h]], null, 2));
    }
  };

  return (
    <ToolLayout title="Matrix Calculator (2x2)" description="Add/multiply matrices, determinant, and inverse for 2x2 matrices.">
      <div className="split-grid">
        <textarea value={matrixA} onChange={(e) => setMatrixA(e.target.value)} className="tool-textarea" />
        <textarea value={matrixB} onChange={(e) => setMatrixB(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions">
        <button onClick={() => compute("add")}>A + B</button>
        <button onClick={() => compute("mul")}>A × B</button>
        <button onClick={() => compute("det")}>det(A)</button>
        <button onClick={() => compute("inv")}>A⁻¹</button>
      </div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function DateDifferenceTool() {
  const [start, setStart] = useState("2026-01-01");
  const [end, setEnd] = useState("2026-12-31");
  const [result, setResult] = useState("");

  const calculate = () => {
    const s = new Date(start);
    const e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      setResult("Please select valid dates.");
      return;
    }
    const diffMs = Math.abs(e.getTime() - s.getTime());
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const weeks = (days / 7).toFixed(2);
    const monthsApprox = (days / 30.44).toFixed(2);
    setResult(`Difference: ${days} days (${weeks} weeks, ~${monthsApprox} months)`);
  };

  return (
    <ToolLayout title="Date Difference Calculator" description="Calculate difference between two dates in days/weeks/months.">
      <div className="row-actions">
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button onClick={calculate}>Calculate</button>
      </div>
      {result && <p className={result.includes("valid") ? "status error" : "status success"}>{result}</p>}
    </ToolLayout>
  );
}

function GradientGeneratorTool() {
  const [type, setType] = useState("linear");
  const [angle, setAngle] = useState("135");
  const [stops, setStops] = useState([
    { id: 1, color: "#2FB8FF" },
    { id: 2, color: "#FF6B7A" }
  ]);
  const [css, setCss] = useState("");

  const colors = stops.map((stop) => stop.color).join(", ");

  const generate = () => {
    const gradient = type === "linear"
      ? `linear-gradient(${angle}deg, ${colors})`
      : type === "radial"
        ? `radial-gradient(circle, ${colors})`
        : `conic-gradient(from ${angle}deg, ${colors})`;
    setCss(`background: ${gradient};`);
  };

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, angle, stops]);

  const gradient = css.replace(/^background:\s*/, "").replace(/;$/, "");

  const handleColorChange = (id, value) => {
    setStops((prev) => prev.map((stop) => (stop.id === id ? { ...stop, color: value } : stop)));
  };

  const addStop = () => {
    const randomHex = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
    setStops((prev) => [...prev, { id: Date.now(), color: randomHex }]);
  };

  const removeStop = (id) => {
    setStops((prev) => (prev.length <= 2 ? prev : prev.filter((stop) => stop.id !== id)));
  };

  const showAngleInput = type !== "radial";

  return (
    <ToolLayout title="Gradient Generator" description="Generate linear, radial, and conic gradients with CSS output.">
      <div className="gradient-controls">
        <div className="row-actions">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
            <option value="conic">Conic</option>
          </select>
          {showAngleInput && (
            <input type="number" value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="Angle" />
          )}
          <button type="button" onClick={addStop}>Add Color Stop</button>
        </div>
        <div className="gradient-stops">
          {stops.map((stop, index) => (
            <div key={stop.id} className="gradient-stop">
              <span className="gradient-stop-label">#{index + 1}</span>
              <input type="color" value={stop.color} onChange={(e) => handleColorChange(stop.id, e.target.value)} aria-label={`Gradient color ${index + 1}`} />
              <button
                type="button"
                onClick={() => removeStop(stop.id)}
                disabled={stops.length <= 2}
                className="gradient-stop-remove"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="gradient-preview" style={{ background: gradient }} />
      <textarea value={css} onChange={(e) => setCss(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function BoxShadowGeneratorTool() {
  const [x, setX] = useState("0");
  const [y, setY] = useState("10");
  const [blur, setBlur] = useState("30");
  const [spread, setSpread] = useState("0");
  const [color, setColor] = useState("#000000");
  const [opacity, setOpacity] = useState("25");

  const alpha = Math.min(1, Math.max(0, Number(opacity) / 100));
  const rgb = hexToRgb(color) || { r: 0, g: 0, b: 0 };
  const value = `${x}px ${y}px ${blur}px ${spread}px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(2)})`;

  return (
    <ToolLayout title="Box Shadow Generator" description="Design CSS box shadows with live preview.">
      <div className="row-actions">
        <input type="number" value={x} onChange={(e) => setX(e.target.value)} placeholder="X" />
        <input type="number" value={y} onChange={(e) => setY(e.target.value)} placeholder="Y" />
        <input type="number" value={blur} onChange={(e) => setBlur(e.target.value)} placeholder="Blur" />
        <input type="number" value={spread} onChange={(e) => setSpread(e.target.value)} placeholder="Spread" />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <input type="number" min="0" max="100" value={opacity} onChange={(e) => setOpacity(e.target.value)} placeholder="Opacity" />
      </div>
      <div className="glass-panel" style={{ height: "150px", display: "grid", placeItems: "center" }}>
        <div style={{ width: "120px", height: "120px", borderRadius: "16px", background: "#ffffff", boxShadow: value }} />
      </div>
      <textarea value={`box-shadow: ${value};`} className="tool-textarea" readOnly />
    </ToolLayout>
  );
}

function BorderRadiusGeneratorTool() {
  const [tl, setTl] = useState("16");
  const [tr, setTr] = useState("16");
  const [br, setBr] = useState("16");
  const [bl, setBl] = useState("16");
  const value = `${tl}px ${tr}px ${br}px ${bl}px`;

  return (
    <ToolLayout title="Border Radius Generator" description="Create custom corner radius and copy CSS quickly.">
      <div className="row-actions">
        <input type="number" value={tl} onChange={(e) => setTl(e.target.value)} placeholder="Top Left" />
        <input type="number" value={tr} onChange={(e) => setTr(e.target.value)} placeholder="Top Right" />
        <input type="number" value={br} onChange={(e) => setBr(e.target.value)} placeholder="Bottom Right" />
        <input type="number" value={bl} onChange={(e) => setBl(e.target.value)} placeholder="Bottom Left" />
      </div>
      <div className="glass-panel" style={{ height: "150px", display: "grid", placeItems: "center" }}>
        <div style={{ width: "140px", height: "100px", background: "linear-gradient(120deg, #4cc9f0, #4361ee)", borderRadius: value }} />
      </div>
      <textarea value={`border-radius: ${value};`} className="tool-textarea" readOnly />
    </ToolLayout>
  );
}

function GlassmorphismGeneratorTool() {
  const [blur, setBlur] = useState("12");
  const [opacity, setOpacity] = useState("18");
  const [border, setBorder] = useState("25");

  const bgAlpha = Math.min(1, Math.max(0, Number(opacity) / 100)).toFixed(2);
  const borderAlpha = Math.min(1, Math.max(0, Number(border) / 100)).toFixed(2);
  const css = [
    `background: rgba(255, 255, 255, ${bgAlpha});`,
    `backdrop-filter: blur(${Number(blur)}px);`,
    `-webkit-backdrop-filter: blur(${Number(blur)}px);`,
    `border: 1px solid rgba(255, 255, 255, ${borderAlpha});`,
    "border-radius: 16px;"
  ].join("\n");

  return (
    <ToolLayout title="Glassmorphism Generator" description="Generate glass card CSS with live preview.">
      <div className="row-actions">
        <input type="number" min="0" max="50" value={blur} onChange={(e) => setBlur(e.target.value)} placeholder="Blur" />
        <input type="number" min="0" max="100" value={opacity} onChange={(e) => setOpacity(e.target.value)} placeholder="Background %" />
        <input type="number" min="0" max="100" value={border} onChange={(e) => setBorder(e.target.value)} placeholder="Border %" />
      </div>
      <div className="glass-panel" style={{ height: "170px", position: "relative", overflow: "hidden", background: "linear-gradient(120deg, #00b4d8, #8338ec)" }}>
        <div style={{ position: "absolute", inset: "18px", background: `rgba(255,255,255,${bgAlpha})`, backdropFilter: `blur(${Number(blur)}px)`, WebkitBackdropFilter: `blur(${Number(blur)}px)`, border: `1px solid rgba(255,255,255,${borderAlpha})`, borderRadius: "16px" }} />
      </div>
      <textarea value={css} className="tool-textarea" readOnly />
    </ToolLayout>
  );
}

function ContrastCheckerTool() {
  const [fg, setFg] = useState("#111827");
  const [bg, setBg] = useState("#ffffff");

  const getLuminance = (hex) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    const toLinear = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    const r = toLinear(rgb.r);
    const g = toLinear(rgb.g);
    const b = toLinear(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const ratio = ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2);
  const normalAA = Number(ratio) >= 4.5;
  const largeAA = Number(ratio) >= 3;

  return (
    <ToolLayout title="Contrast Checker" description="Check WCAG contrast ratio between foreground and background.">
      <div className="row-actions">
        <label>Text <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} /></label>
        <label>Background <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /></label>
      </div>
      <div className="glass-panel output-panel" style={{ background: bg, color: fg }}>
        <p><strong>Preview text</strong> — The quick brown fox jumps over the lazy dog.</p>
      </div>
      <div className="metrics-grid">
        <div className="glass-panel"><h4>Ratio</h4><p>{ratio}:1</p></div>
        <div className="glass-panel"><h4>AA Normal</h4><p>{normalAA ? "Pass" : "Fail"}</p></div>
        <div className="glass-panel"><h4>AA Large</h4><p>{largeAA ? "Pass" : "Fail"}</p></div>
      </div>
    </ToolLayout>
  );
}

function CookieNotepad() {
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState(() => {
    const stored = parseCookieJson("tool_notepad_notes", null);
    if (Array.isArray(stored) && stored.length) {
      return stored;
    }

    const legacy = getCookie("tool_notepad");
    if (legacy) {
      return [{ id: crypto.randomUUID(), text: legacy, createdAt: Date.now(), updatedAt: Date.now() }];
    }
    return [];
  });

  useEffect(() => {
    setCookie("tool_notepad_notes", JSON.stringify(notes));
  }, [notes]);

  const resetEditor = () => {
    setText("");
    setEditingId(null);
  };

  const addNote = () => {
    const validationError = validators.requiredText(text, "Notepad text");
    if (validationError) {
      setStatus(`Error: ${validationError}`);
      return;
    }
    const now = Date.now();
    setNotes((prev) => [
      {
        id: crypto.randomUUID(),
        text: text.trim(),
        createdAt: now,
        updatedAt: now
      },
      ...prev
    ]);
    setText("");
    setStatus("Note added.");
  };

  const startEdit = (note) => {
    setEditingId(note.id);
    setText(note.text);
    setStatus("Editing selected note.");
  };

  const updateNote = () => {
    if (!editingId) {
      setStatus("Error: Select a note to edit first.");
      return;
    }
    const validationError = validators.requiredText(text, "Notepad text");
    if (validationError) {
      setStatus(`Error: ${validationError}`);
      return;
    }

    setNotes((prev) =>
      prev.map((note) =>
        note.id === editingId
          ? { ...note, text: text.trim(), updatedAt: Date.now() }
          : note
      )
    );
    resetEditor();
    setStatus("Note updated.");
  };

  const removeNote = (id) => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
    if (editingId === id) {
      resetEditor();
    }
    setStatus("Note removed.");
  };

  const clearAll = () => {
    setNotes([]);
    resetEditor();
    setStatus("All notes cleared.");
  };

  return (
    <ToolLayout title="Cookie Notepad" description="Add, edit, delete and browse multiple saved notes in cookies.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea" />
      <div className="row-actions">
        <button onClick={addNote}>Add New</button>
        <button onClick={updateNote}>Save Edit</button>
        <button onClick={resetEditor}>Cancel Edit</button>
        <button onClick={clearAll}>Clear All</button>
      </div>
      {status && <p className={status.startsWith("Error:") ? "status error" : "status success"}>{status}</p>}
      <ul className="todo-list">
        {notes.map((note) => (
          <li key={note.id} className="glass-panel">
            <div>
              <p>{note.text}</p>
              <small>
                Updated: {new Date(note.updatedAt || note.createdAt || Date.now()).toLocaleString()}
              </small>
            </div>
            <div className="row-actions">
              <button onClick={() => startEdit(note)}>Edit</button>
              <button onClick={() => removeNote(note.id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </ToolLayout>
  );
}

function CookieTodo() {
  const [value, setValue] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [status, setStatus] = useState("");
  const [tasks, setTasks] = useState(() => {
    const stored = parseCookieJson("tool_todo", null);
    if (!Array.isArray(stored)) {
      return [];
    }
    return stored.map((task) => ({
      id: task.id || crypto.randomUUID(),
      text: String(task.text || ""),
      done: Boolean(task.done),
      createdAt: task.createdAt || Date.now(),
      updatedAt: task.updatedAt || Date.now()
    }));
  });

  useEffect(() => {
    setCookie("tool_todo", JSON.stringify(tasks));
  }, [tasks]);

  const addTask = () => {
    const validationError = validators.requiredText(value, "Task");
    if (validationError) {
      setStatus(`Error: ${validationError}`);
      return;
    }

    const now = Date.now();
    setTasks((prev) => [...prev, { id: crypto.randomUUID(), text: value.trim(), done: false, createdAt: now, updatedAt: now }]);
    setValue("");
    setStatus("Task added.");
  };

  const startEditTask = (task) => {
    setEditingId(task.id);
    setEditText(task.text);
    setStatus("Editing selected task.");
  };

  const saveTaskEdit = () => {
    if (!editingId) {
      setStatus("Error: Select a task to edit first.");
      return;
    }
    const validationError = validators.requiredText(editText, "Task");
    if (validationError) {
      setStatus(`Error: ${validationError}`);
      return;
    }

    setTasks((prev) =>
      prev.map((task) =>
        task.id === editingId
          ? { ...task, text: editText.trim(), updatedAt: Date.now() }
          : task
      )
    );
    setEditingId(null);
    setEditText("");
    setStatus("Task updated.");
  };

  const cancelTaskEdit = () => {
    setEditingId(null);
    setEditText("");
    setStatus("Edit cancelled.");
  };

  const removeTask = (id) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditText("");
    }
    setStatus("Task removed.");
  };

  const clearDone = () => {
    setTasks((prev) => prev.filter((task) => !task.done));
    setStatus("Completed tasks cleared.");
  };

  const clearAll = () => {
    setTasks([]);
    setEditingId(null);
    setEditText("");
    setStatus("All tasks cleared.");
  };

  return (
    <ToolLayout title="Cookie To-Do" description="Add, edit, remove and browse all to-do tasks with cookie persistence.">
      <div className="todo-input-row">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add a task..." />
        <button onClick={addTask}>Add</button>
      </div>

      {editingId && (
        <div className="todo-editor-block glass-panel">
          <p className="status info">Editing selected task</p>
          <div className="todo-input-row">
            <input value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="Edit selected task..." />
            <button onClick={saveTaskEdit}>Save Edit</button>
            <button onClick={cancelTaskEdit}>Cancel</button>
          </div>
        </div>
      )}

      <div className="row-actions">
        <button onClick={clearDone}>Clear Completed</button>
        <button onClick={clearAll}>Clear All</button>
      </div>
      {status && <p className={status.startsWith("Error:") ? "status error" : "status success"}>{status}</p>}
      <ul className="todo-list">
        {tasks.map((task) => (
          <li key={task.id} className="glass-panel">
            <label>
              <input
                type="checkbox"
                checked={task.done}
                onChange={() =>
                  setTasks((prev) =>
                    prev.map((item) =>
                      item.id === task.id ? { ...item, done: !item.done, updatedAt: Date.now() } : item
                    )
                  )
                }
              />
              <span className={task.done ? "done" : ""}>{task.text}</span>
            </label>
            <div className="row-actions todo-item-actions">
              <button onClick={() => startEditTask(task)}>Edit</button>
              <button onClick={() => removeTask(task.id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </ToolLayout>
  );
}

function EmailValidatorTool() {
  const [email, setEmail] = useState("hello@example.com");
  const [status, setStatus] = useState("");

  const validate = () => {
    const error = validators.email(email);
    setStatus(error || "Email is valid.");
  };

  return (
    <ToolLayout title="Email Validator" description="Validate email format quickly.">
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@domain.com" />
      <div className="row-actions"><button onClick={validate}>Validate</button></div>
      {status && <p className={status.includes("valid") ? "status success" : "status error"}>{status}</p>}
    </ToolLayout>
  );
}

function UrlParserTool() {
  const [url, setUrl] = useState("https://example.com/products?id=12#reviews");
  const [output, setOutput] = useState("");

  const parse = () => {
    const error = validators.url(url);
    if (error) {
      setOutput(error);
      return;
    }

    const parsed = new URL(url);
    setOutput(
      JSON.stringify(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || "(default)",
          pathname: parsed.pathname,
          search: parsed.search,
          hash: parsed.hash,
          origin: parsed.origin,
          params: Object.fromEntries(parsed.searchParams.entries())
        },
        null,
        2
      )
    );
  };

  return (
    <ToolLayout title="URL Parser" description="Break a URL into readable parts.">
      <textarea value={url} onChange={(e) => setUrl(e.target.value)} className="tool-textarea" />
      <div className="row-actions"><button onClick={parse}>Parse URL</button></div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function NumberBaseConverter() {
  const [value, setValue] = useState("255");
  const [base, setBase] = useState("10");
  const [output, setOutput] = useState("");

  const convert = () => {
    const fromBase = Number(base);
    const num = parseInt(value.trim(), fromBase);
    if (!value.trim()) {
      setOutput("Input value cannot be empty.");
      return;
    }
    if (Number.isNaN(num)) {
      setOutput("Input is not valid for selected base.");
      return;
    }

    setOutput(JSON.stringify({ decimal: num.toString(10), binary: num.toString(2), octal: num.toString(8), hex: num.toString(16).toUpperCase() }, null, 2));
  };

  return (
    <ToolLayout title="Number Base Converter" description="Convert between binary, octal, decimal, and hex.">
      <div className="row-actions">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" />
        <select value={base} onChange={(e) => setBase(e.target.value)}>
          <option value="2">Base 2</option>
          <option value="8">Base 8</option>
          <option value="10">Base 10</option>
          <option value="16">Base 16</option>
        </select>
        <button onClick={convert}>Convert</button>
      </div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function AgeCalculator() {
  const [dob, setDob] = useState("1999-01-01");
  const [result, setResult] = useState("");

  const calculate = () => {
    const validationError = validators.requiredText(dob, "Date of birth");
    if (validationError) {
      setResult(validationError);
      return;
    }

    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime())) {
      setResult("Date of birth is invalid.");
      return;
    }

    const now = new Date();
    let years = now.getFullYear() - birthDate.getFullYear();
    let months = now.getMonth() - birthDate.getMonth();
    if (months < 0 || (months === 0 && now.getDate() < birthDate.getDate())) {
      years -= 1;
      months += 12;
    }

    setResult(`Age is ${years} years and ${months} months.`);
  };

  return (
    <ToolLayout title="Age Calculator" description="Calculate age from date of birth.">
      <div className="row-actions">
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        <button onClick={calculate}>Calculate</button>
      </div>
      {result && <p className={result.startsWith("Age") ? "status success" : "status error"}>{result}</p>}
    </ToolLayout>
  );
}

function MarkdownPreviewTool() {
  const [input, setInput] = useState("# Hello\n\n## Subtitle\n\n- one\n- two\n\n**bold text**");
  const [status, setStatus] = useState("");

  const toSimpleHtml = (markdown) => {
    return markdown
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/^- (.*)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
      .replace(/\n\n/g, "<br/><br/>");
  };

  const validationError = validators.requiredText(input, "Markdown input");

  useEffect(() => {
    setStatus(validationError || "Preview generated.");
  }, [validationError, input]);

  return (
    <ToolLayout title="Markdown Preview" description="Render a lightweight markdown preview.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <div className="glass-panel output-panel" style={{ minHeight: "220px", overflow: "auto" }} dangerouslySetInnerHTML={{ __html: toSimpleHtml(input) }} />
      </div>
      {status && <p className={status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function TextReplacerTool() {
  const [input, setInput] = useState("Hello World\nHello Universe\nHello Galaxy");
  const [searchTerm, setSearchTerm] = useState("Hello");
  const [replaceTerm, setReplaceTerm] = useState("Hi");
  const [output, setOutput] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [caseInsensitive, setCaseInsensitive] = useState(false);
  const [globalReplace, setGlobalReplace] = useState(true);
  const [status, setStatus] = useState("");

  const replace = () => {
    const inputError = validators.requiredText(input, "Input text");
    const searchError = validators.requiredText(searchTerm, "Search term");
    if (inputError || searchError) {
      setStatus(inputError || searchError);
      setOutput("");
      return;
    }

    try {
      let result = input;
      const flags = [
        caseInsensitive ? "i" : "",
        globalReplace ? "g" : ""
      ].join("");

      if (useRegex) {
        const regex = new RegExp(searchTerm, flags);
        result = input.replace(regex, replaceTerm);
      } else {
        if (caseInsensitive) {
          const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
          result = input.replace(regex, replaceTerm);
        } else if (globalReplace) {
          result = input.split(searchTerm).join(replaceTerm);
        } else {
          result = input.replace(searchTerm, replaceTerm);
        }
      }

      setOutput(result);
      setStatus(`Replaced ${result !== input ? "successfully" : "no matches found"}.`);
    } catch (error) {
      setStatus(`Invalid regex: ${error.message}`);
      setOutput("");
    }
  };

  return (
    <ToolLayout title="Text Replacer" description="Find and replace text with optional regex support.">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" placeholder="Enter text to search in..." />
      <div className="split-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label>Search term</label>
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search for..." />
        </div>
        <div>
          <label>Replace with</label>
          <input value={replaceTerm} onChange={(e) => setReplaceTerm(e.target.value)} placeholder="Replace with..." />
        </div>
      </div>
      <div className="row-actions" style={{ flexWrap: "wrap" }}>
        <label>
          <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
          Use Regex
        </label>
        <label>
          <input type="checkbox" checked={caseInsensitive} onChange={(e) => setCaseInsensitive(e.target.checked)} />
          Case Insensitive
        </label>
        <label>
          <input type="checkbox" checked={globalReplace} onChange={(e) => setGlobalReplace(e.target.checked)} />
          Global Replace
        </label>
      </div>
      <div className="row-actions">
        <button onClick={replace}>Replace</button>
        <button onClick={() => { setOutput(""); setStatus(""); }}>Clear Output</button>
      </div>
      {output && (
        <div>
          <label>Result</label>
          <textarea value={output} readOnly className="tool-textarea" style={{ minHeight: "120px" }} />
        </div>
      )}
      {status && <p className={status.includes("Invalid") || status.includes("required") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function TextStatisticsTool() {
  const [input, setInput] = useState("Hello World! Hello Universe! Hello Galaxy!");
  const [stats, setStats] = useState(null);

  const analyze = () => {
    const inputError = validators.requiredText(input, "Input text");
    if (inputError) {
      setStats(null);
      return;
    }

    const chars = input.length;
    const charsNoSpaces = input.replace(/\s/g, "").length;
    const words = input.trim() ? input.trim().split(/\s+/).length : 0;
    const lines = input.split("\n").length;
    const paragraphs = input.trim() ? input.split(/\n\n+/).filter(p => p.trim()).length : 0;
    const sentences = input.trim() ? input.split(/[.!?]+/).filter(s => s.trim()).length : 0;

    const charFreq = {};
    for (const char of input) {
      charFreq[char] = (charFreq[char] || 0) + 1;
    }

    const wordFreq = {};
    if (input.trim()) {
      const words = input.trim().toLowerCase().split(/\s+/);
      for (const word of words) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    }

    const sortedCharFreq = Object.entries(charFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const sortedWordFreq = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);

    setStats({
      chars,
      charsNoSpaces,
      words,
      lines,
      paragraphs,
      sentences,
      charFreq: sortedCharFreq,
      wordFreq: sortedWordFreq
    });
  };

  return (
    <ToolLayout title="Text Statistics" description="Analyze text for character and word frequency.">
      <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" placeholder="Enter text to analyze..." />
      <div className="row-actions">
        <button onClick={analyze}>Analyze</button>
      </div>
      {stats && (
        <div className="metrics-grid">
          <div className="glass-panel">
            <h4>Characters</h4>
            <p>{stats.chars}</p>
          </div>
          <div className="glass-panel">
            <h4>Characters (no spaces)</h4>
            <p>{stats.charsNoSpaces}</p>
          </div>
          <div className="glass-panel">
            <h4>Words</h4>
            <p>{stats.words}</p>
          </div>
          <div className="glass-panel">
            <h4>Lines</h4>
            <p>{stats.lines}</p>
          </div>
          <div className="glass-panel">
            <h4>Paragraphs</h4>
            <p>{stats.paragraphs}</p>
          </div>
          <div className="glass-panel">
            <h4>Sentences</h4>
            <p>{stats.sentences}</p>
          </div>
        </div>
      )}
      {stats && stats.charFreq.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <label>Top Characters</label>
          <ul className="list-panel">
            {stats.charFreq.map(([char, count]) => (
              <li key={char} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>"{char === " " ? "(space)" : char === "\n" ? "(newline)" : char}"</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      {stats && stats.wordFreq.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <label>Top Words</label>
          <ul className="list-panel">
            {stats.wordFreq.map(([word, count]) => (
              <li key={word} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{word}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ToolLayout>
  );
}

function EmiCalculator() {
  const [principal, setPrincipal] = useState("500000");
  const [rate, setRate] = useState("9");
  const [months, setMonths] = useState("60");

  const principalError = validators.number(principal, "Principal", { min: 1 });
  const rateError = validators.number(rate, "Annual rate", { min: 0.1 });
  const monthsError = validators.number(months, "Tenure months", { min: 1, integer: true });

  let emi = "-";
  if (!principalError && !rateError && !monthsError) {
    const p = Number(principal);
    const r = Number(rate) / 12 / 100;
    const n = Number(months);
    emi = (p * r * (1 + r) ** n) / ((1 + r) ** n - 1);
    emi = Number.isFinite(emi) ? emi.toFixed(2) : "-";
  }

  return (
    <ToolLayout title="EMI Calculator" description="Calculate monthly loan EMI.">
      <div className="row-actions">
        <input value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="Principal" />
        <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Rate %" />
        <input value={months} onChange={(e) => setMonths(e.target.value)} placeholder="Months" />
      </div>
      {(principalError || rateError || monthsError) && <p className="status warning">{principalError || rateError || monthsError}</p>}
      <div className="glass-panel output-panel"><p>Monthly EMI: <strong>{emi}</strong></p></div>
    </ToolLayout>
  );
}

function XmlToolkit() {
  const [input, setInput] = useState("<root><user id=\"1\"><name>Alex</name></user></root>");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const validate = () => {
    const error = validators.xmlText(input);
    setStatus(error || "XML is valid.");
  };

  const format = () => {
    const error = validators.xmlText(input);
    if (error) {
      setStatus(error);
      return;
    }
    setOutput(formatXmlSimple(input));
    setStatus("Formatted XML.");
  };

  const minify = () => {
    const error = validators.xmlText(input);
    if (error) {
      setStatus(error);
      return;
    }
    setOutput(input.replace(/>\s*</g, "><").trim());
    setStatus("Minified XML.");
  };

  return (
    <ToolLayout title="XML Toolkit" description="Validate, format, and minify XML.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions">
        <button onClick={validate}>Validate</button>
        <button onClick={format}>Format</button>
        <button onClick={minify}>Minify</button>
      </div>
      {status && <p className={status.includes("valid") || status.startsWith("Formatted") || status.startsWith("Minified") ? "status success" : "status error"}>{status}</p>}
    </ToolLayout>
  );
}

function HtmlToolkit() {
  const [input, setInput] = useState("<div><h1>Hello</h1><p>Welcome</p></div>");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const validate = () => {
    const base = validators.requiredText(input, "HTML input");
    if (base) {
      setStatus(base);
      return;
    }

    const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
    const tags = input.match(/<\/?([a-zA-Z][\w-]*)[^>]*>/g) || [];
    const stack = [];

    for (const tagToken of tags) {
      const match = tagToken.match(/<\/?([a-zA-Z][\w-]*)/);
      if (!match) {
        continue;
      }
      const name = match[1].toLowerCase();
      const isClose = /^<\//.test(tagToken);
      const selfClose = /\/>$/.test(tagToken) || voidTags.has(name);

      if (isClose) {
        const last = stack.pop();
        if (last !== name) {
          setStatus(`HTML mismatch: expected closing </${last || "?"}> but found </${name}>.`);
          return;
        }
      } else if (!selfClose) {
        stack.push(name);
      }
    }

    if (stack.length) {
      setStatus(`HTML missing closing tag for <${stack[stack.length - 1]}>.`);
      return;
    }

    setStatus("HTML structure looks valid.");
  };

  const minify = () => {
    const base = validators.requiredText(input, "HTML input");
    if (base) {
      setStatus(base);
      return;
    }
    setOutput(input.replace(/>\s+</g, "><").trim());
    setStatus("Minified HTML.");
  };

  return (
    <ToolLayout title="HTML Toolkit" description="Validate structure and minify HTML.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions"><button onClick={validate}>Validate</button><button onClick={minify}>Minify</button></div>
      {status && <p className={status.includes("valid") || status.startsWith("Minified") ? "status success" : "status error"}>{status}</p>}
    </ToolLayout>
  );
}

function CssToolkit() {
  const [input, setInput] = useState("body { color: #fff; margin: 0; }");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const validate = () => {
    const base = validators.requiredText(input, "CSS input");
    if (base) {
      setStatus(base);
      return;
    }

    const open = (input.match(/\{/g) || []).length;
    const close = (input.match(/\}/g) || []).length;
    if (open !== close) {
      setStatus("CSS braces are unbalanced.");
      return;
    }

    setStatus("CSS looks valid.");
  };

  return (
    <ToolLayout title="CSS Toolkit" description="Validate, format, and minify CSS.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions">
        <button onClick={validate}>Validate</button>
        <button onClick={() => { setOutput(formatCssSimple(input)); setStatus("Formatted CSS."); }}>Format</button>
        <button onClick={() => { setOutput(minifyCssSimple(input)); setStatus("Minified CSS."); }}>Minify</button>
      </div>
      {status && <p className={status.includes("valid") || status.startsWith("Formatted") || status.startsWith("Minified") ? "status success" : "status error"}>{status}</p>}
    </ToolLayout>
  );
}

function JavaScriptToolkit() {
  const [input, setInput] = useState("function greet(name){console.log('Hi '+name);}");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const validate = () => {
    const error = validators.javascriptText(input);
    setStatus(error || "JavaScript is valid.");
  };

  return (
    <ToolLayout title="JavaScript Toolkit" description="Validate, format, and minify JavaScript.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions">
        <button onClick={validate}>Validate</button>
        <button onClick={() => { setOutput(formatJsBasic(input)); setStatus("Formatted JavaScript."); }}>Format</button>
        <button onClick={() => { setOutput(minifyJsBasic(input)); setStatus("Minified JavaScript."); }}>Minify</button>
      </div>
      {status && <p className={status.includes("valid") || status.startsWith("Formatted") || status.startsWith("Minified") ? "status success" : "status error"}>{status}</p>}
    </ToolLayout>
  );
}

function PythonToolkit() {
  const [input, setInput] = useState("def greet(name):\n\tprint(f'Hello {name}')\n");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const normalizeIndent = () => {
    const base = validators.requiredText(input, "Python code");
    if (base) {
      setStatus(base);
      return;
    }
    setOutput(input.replace(/\t/g, "    "));
    setStatus("Converted tabs to 4 spaces.");
  };

  const stripTrailing = () => {
    const base = validators.requiredText(input, "Python code");
    if (base) {
      setStatus(base);
      return;
    }
    setOutput(input.split("\n").map((line) => line.replace(/\s+$/g, "")).join("\n"));
    setStatus("Removed trailing spaces.");
  };

  return (
    <ToolLayout title="Python Toolkit" description="Indentation and cleanup helpers for Python code.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions"><button onClick={normalizeIndent}>Normalize Indent</button><button onClick={stripTrailing}>Trim Trailing Spaces</button></div>
      {status && <p className={status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function JavaClassBuilder() {
  const [packageName, setPackageName] = useState("com.example.app");
  const [className, setClassName] = useState("UserService");
  const [output, setOutput] = useState("");

  const generate = () => {
    const classError = validators.identifier(className, "Class name");
    if (classError) {
      setOutput(classError);
      return;
    }
    setOutput(`package ${packageName};\n\npublic class ${className} {\n    public ${className}() {\n    }\n}\n`);
  };

  return (
    <ToolLayout title="Java Class Builder" description="Generate Java class boilerplate quickly.">
      <div className="row-actions">
        <input value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="Package" />
        <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Class Name" />
        <button onClick={generate}>Generate</button>
      </div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function CppClassBuilder() {
  const [className, setClassName] = useState("UserService");
  const [output, setOutput] = useState("");

  const generate = () => {
    const classError = validators.identifier(className, "Class name");
    if (classError) {
      setOutput(classError);
      return;
    }

    setOutput(`#pragma once\n\nclass ${className} {\npublic:\n    ${className}();\n    ~${className}();\nprivate:\n};\n`);
  };

  return (
    <ToolLayout title="C++ Class Builder" description="Generate C++ header class boilerplate.">
      <div className="row-actions">
        <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Class Name" />
        <button onClick={generate}>Generate</button>
      </div>
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function PdfTextPrintTool() {
  const [title, setTitle] = useState("My Document");
  const [text, setText] = useState("Write content here, then print/save as PDF from browser dialog.");
  const [status, setStatus] = useState("");

  const openPrintView = () => {
    const titleError = validators.requiredText(title, "Document title");
    const textError = validators.requiredText(text, "Document text");
    if (titleError || textError) {
      setStatus(titleError || textError);
      return;
    }

    const win = window.open("", "_blank");
    if (!win) {
      setStatus("Popup blocked. Please allow popups.");
      return;
    }

    win.document.write(`<html><head><title>${title}</title><style>body{font-family:Segoe UI,sans-serif;padding:24px;line-height:1.5;}h1{margin-top:0;}pre{white-space:pre-wrap;}</style></head><body><h1>${title}</h1><pre>${text.replace(/</g, "&lt;")}</pre></body></html>`);
    win.document.close();
    win.focus();
    win.print();
    setStatus("Opened print dialog. Choose Save as PDF.");
  };

  return (
    <ToolLayout title="PDF Text to Print" description="Prepare text and export via browser Print to PDF.">
      <div className="row-actions"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" /></div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea" />
      <div className="row-actions"><button onClick={openPrintView}>Open Print View</button></div>
      {status && <p className={status.includes("cannot") || status.includes("blocked") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function PdfFileInspector() {
  const [info, setInfo] = useState("");
  const [fileName, setFileName] = useState("");

  const onFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName("");
      return;
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer.slice(0, 8));
    const header = String.fromCharCode(...bytes);
    const isPdf = header.startsWith("%PDF-");
    const version = isPdf ? header.slice(5).trim() : "Unknown";

    setInfo(JSON.stringify({ name: file.name, sizeBytes: file.size, type: file.type || "unknown", header, isPdf, version }, null, 2));
    setFileName(file.name);
  };

  return (
    <ToolLayout title="PDF File Inspector" description="Inspect basic PDF metadata and file signature.">
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept="application/pdf" onChange={onFileChange} />
          <span className="file-upload-trigger">Browse PDF</span>
        </label>
        <span className="file-upload-name">{fileName || "No file selected"}</span>
      </div>
      <textarea value={info} onChange={(e) => setInfo(e.target.value)} className="tool-textarea" />
    </ToolLayout>
  );
}

function UniversalEncoderDecoderTool() {
  const [mode, setMode] = useState("base64");
  const [input, setInput] = useState("Hello world");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const process = (action) => {
    const base = validators.requiredText(input, "Input");
    if (base) {
      setStatus(base);
      return;
    }

    try {
      if (mode === "base64") {
        setOutput(action === "encode" ? btoa(unescape(encodeURIComponent(input))) : decodeURIComponent(escape(atob(input))));
      }
      if (mode === "url") {
        setOutput(action === "encode" ? encodeURIComponent(input) : decodeURIComponent(input));
      }
      if (mode === "html") {
        if (action === "encode") {
          const div = document.createElement("div");
          div.innerText = input;
          setOutput(div.innerHTML);
        } else {
          const parser = new DOMParser();
          const doc = parser.parseFromString(input, "text/html");
          setOutput(doc.documentElement.textContent || "");
        }
      }
      if (mode === "hex") {
        if (action === "encode") {
          const bytes = new TextEncoder().encode(input);
          setOutput(Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(" "));
        } else {
          const cleaned = input.replace(/\s+/g, "");
          if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length % 2 !== 0) {
            throw new Error("Hex input is invalid.");
          }
          const bytes = cleaned.match(/.{1,2}/g).map((pair) => parseInt(pair, 16));
          setOutput(new TextDecoder().decode(new Uint8Array(bytes)));
        }
      }
      setStatus(`${action === "encode" ? "Encoded" : "Decoded"} using ${mode.toUpperCase()}.`);
    } catch (error) {
      setStatus(error.message || "Failed to process input.");
    }
  };

  return (
    <ToolLayout title="Universal Encoder / Decoder" description="Encode/decode Base64, URL, HTML entities, and HEX in one place.">
      <div className="row-actions">
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="base64">Base64</option>
          <option value="url">URL</option>
          <option value="html">HTML Entities</option>
          <option value="hex">HEX</option>
        </select>
        <button onClick={() => process("encode")}>Encode</button>
        <button onClick={() => process("decode")}>Decode</button>
      </div>
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      {status && <p className={status.includes("invalid") || status.includes("Failed") || status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function CronExpressionParserTool() {
  const [input, setInput] = useState("*/15 9-18 * * 1-5");
  const [result, setResult] = useState("");

  const parse = () => {
    const base = validators.requiredText(input, "Cron expression");
    if (base) {
      setResult(base);
      return;
    }

    const parsed = parseCronExpression(input);
    if (parsed.error) {
      setResult(parsed.error);
      return;
    }

    const next = getNextCronRuns(input, 8);
    if (next.error) {
      setResult(next.error);
      return;
    }

    const lines = next.runs.map((run, idx) => `${idx + 1}. ${run.toLocaleString()}`);
    setResult(`Cron looks valid.\n\nNext runs:\n${lines.join("\n")}`);
  };

  return (
    <ToolLayout title="Cron Expression Parser" description="Validate 5-field cron expressions and preview upcoming run times.">
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="minute hour day month weekday" />
      <div className="row-actions"><button onClick={parse}>Parse Cron</button></div>
      <textarea value={result} onChange={(e) => setResult(e.target.value)} className="tool-textarea" />
      <p className="status info">Supports: `*`, `*/step`, `a-b`, `a,b,c` (5-field standard cron).</p>
    </ToolLayout>
  );
}

function DocumentToolkit() {
  const [input, setInput] = useState("# Document Title\n\nThis is a sample document.");
  const [sourceType, setSourceType] = useState("markdown");
  const [targetType, setTargetType] = useState("html");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");

  const convert = () => {
    const base = validators.requiredText(input, "Document input");
    if (base) {
      setStatus(base);
      return;
    }

    let converted = input;

    if (sourceType === targetType) {
      converted = input;
    } else if (sourceType === "markdown" && targetType === "html") {
      converted = markdownToSimpleHtml(input);
    } else if (sourceType === "html" && targetType === "text") {
      const parser = new DOMParser();
      const doc = parser.parseFromString(input, "text/html");
      converted = doc.documentElement.textContent || "";
    } else if (sourceType === "text" && targetType === "markdown") {
      converted = input
        .split("\n")
        .map((line, i) => (i === 0 ? `# ${line}` : line))
        .join("\n");
    } else if (sourceType === "text" && targetType === "html") {
      converted = `<p>${input.replace(/\n/g, "</p><p>")}</p>`;
    } else if (sourceType === "markdown" && targetType === "text") {
      converted = input.replace(/^#{1,6}\s*/gm, "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/^-\s+/gm, "• ");
    } else {
      converted = input;
    }

    setOutput(converted);
    setStatus("Document converted.");
  };

  const download = () => {
    const content = output || input;
    const typeMap = {
      text: "text/plain;charset=utf-8",
      markdown: "text/markdown;charset=utf-8",
      html: "text/html;charset=utf-8",
      doc: "application/msword"
    };
    const mime = typeMap[targetType] || "text/plain;charset=utf-8";
    const ext = targetType === "markdown" ? "md" : targetType;
    const blob = new Blob([content], { type: mime });
    downloadBlob(blob, `document-export.${ext}`);
    setStatus("Document downloaded.");
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileName("");
      return;
    }
    const text = await file.text();
    setInput(text);
    setStatus("Document file loaded.");
    setFileName(file.name);
  };

  return (
    <ToolLayout title="Document Toolkit" description="Convert documents (Text/Markdown/HTML), inspect and export as TXT/MD/HTML/DOC.">
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept=".txt,.md,.markdown,.html,.htm" onChange={onFile} />
          <span className="file-upload-trigger">Browse Document</span>
        </label>
        <span className="file-upload-name">{fileName || "No file selected"}</span>
      </div>
      <div className="row-actions">
        <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
          <option value="text">Text</option>
          <option value="markdown">Markdown</option>
          <option value="html">HTML</option>
        </select>
        <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
          <option value="text">Text</option>
          <option value="markdown">Markdown</option>
          <option value="html">HTML</option>
          <option value="doc">DOC</option>
        </select>
        <button onClick={convert}>Convert</button>
        <button onClick={download}>Download</button>
      </div>
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      {status && <p className={status.includes("cannot") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function DocumentMergeTool() {
  const [filesInfo, setFilesInfo] = useState([]);
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");
  const [fileSummary, setFileSummary] = useState("");

  const onFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      setStatus("Please select at least one text document.");
      setFileSummary("");
      return;
    }

    const chunks = [];
    const info = [];
    for (const file of files) {
      const text = await file.text();
      chunks.push(`--- ${file.name} ---\n${text}`);
      info.push({ name: file.name, sizeBytes: file.size });
    }

    setFilesInfo(info);
    setOutput(chunks.join("\n\n"));
    setStatus("Documents merged.");
    setFileSummary(files.length === 1 ? files[0].name : `${files.length} files selected`);
  };

  const download = () => {
    const base = validators.requiredText(output, "Merged output");
    if (base) {
      setStatus(base);
      return;
    }
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, "merged-document.txt");
    setStatus("Merged document downloaded.");
  };

  return (
    <ToolLayout title="Document Merge Tool" description="Merge multiple text-like files into a single combined document.">
      <div className="row-actions file-upload-row">
        <label className="file-upload">
          <input className="file-input" type="file" accept=".txt,.md,.markdown,.csv,.log,.html,.htm" multiple onChange={onFiles} />
          <span className="file-upload-trigger">Browse Documents</span>
        </label>
        <span className="file-upload-name">{fileSummary || "No files selected"}</span>
        <button onClick={download}>Download Merged</button>
      </div>
      {filesInfo.length > 0 && <pre className="meta-pre">{JSON.stringify(filesInfo, null, 2)}</pre>}
      <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      {status && <p className={status.includes("cannot") || status.includes("Please") ? "status error" : "status success"}>{status}</p>}
    </ToolLayout>
  );
}

function LineCounterTool() {
  const [text, setText] = useState("line one\nline two\n\nline four");

  const lines = text.split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim()).length;

  return (
    <ToolLayout title="Line Counter" description="Count total and non-empty lines.">
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="tool-textarea" />
      <div className="metrics-grid">
        <div className="glass-panel"><h4>Total Lines</h4><p>{lines.length}</p></div>
        <div className="glass-panel"><h4>Non-empty Lines</h4><p>{nonEmptyLines}</p></div>
      </div>
    </ToolLayout>
  );
}

function NumberSorterTool() {
  const [input, setInput] = useState("9,2,14,5,1");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const runSort = (direction) => {
    const base = validators.requiredText(input, "Numbers input");
    if (base) {
      setStatus(base);
      return;
    }

    const nums = input.split(/[,\s]+/).filter(Boolean).map(Number);
    if (nums.some((n) => Number.isNaN(n))) {
      setStatus("Input must contain only numbers separated by comma or space.");
      return;
    }

    const sorted = [...nums].sort((a, b) => (direction === "asc" ? a - b : b - a));
    setOutput(sorted.join(", "));
    setStatus("Sorted numbers.");
  };

  return (
    <ToolLayout title="Number Sorter" description="Sort numbers ascending or descending.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions"><button onClick={() => runSort("asc")}>Sort Asc</button><button onClick={() => runSort("desc")}>Sort Desc</button></div>
      {status && <p className={status.startsWith("Sorted") ? "status success" : "status error"}>{status}</p>}
    </ToolLayout>
  );
}

function FileNameSanitizerTool() {
  const [input, setInput] = useState("My Report: Q1/2026?.pdf");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const sanitize = () => {
    const base = validators.requiredText(input, "Filename");
    if (base) {
      setStatus(base);
      return;
    }

    const safe = input.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
    const validation = validators.filename(safe);
    if (validation) {
      setStatus(validation);
      return;
    }

    setOutput(safe);
    setStatus("Sanitized filename.");
  };

  return (
    <ToolLayout title="Filename Sanitizer" description="Remove invalid filename characters.">
      <div className="split-grid">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="tool-textarea" />
        <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="tool-textarea" />
      </div>
      <div className="row-actions"><button onClick={sanitize}>Sanitize</button></div>
      {status && <p className={status.startsWith("Sanitized") ? "status success" : "status error"}>{status}</p>}
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
  { category: "JSON", path: "/json-compare", title: "JSON Compare", description: "Deep compare two JSON values field by field.", component: JsonCompareTool },
  { category: "Text", path: "/csv-to-json", title: "CSV to JSON", description: "Convert CSV into JSON arrays.", component: CsvToJsonTool },
  { category: "Text", path: "/csv-comparison", title: "CSV Comparison", description: "Compare two CSV datasets.", component: CsvComparisonTool },
  { category: "Text", path: "/text-editor", title: "Text Editor", description: "Edit and transform text.", component: TextEditor },
  { category: "Text", path: "/text-diff", title: "Text Diff Checker", description: "Compare text line-by-line.", component: TextDiffChecker },
  { category: "Text", path: "/word-counter", title: "Word Counter", description: "Count words and chars.", component: WordCounter },
  { category: "Text", path: "/case-converter", title: "Case Converter", description: "Change text casing.", component: CaseConverter },
  { category: "Text", path: "/line-tools", title: "Line Tools", description: "Sort/trim/uniq lines.", component: LineTools },
  { category: "Text", path: "/line-counter", title: "Line Counter", description: "Count total and non-empty lines.", component: LineCounterTool },
  { category: "Text", path: "/slug-generator", title: "Slug Generator", description: "Create URL slugs.", component: SlugGenerator },
  { category: "Text", path: "/lorem-generator", title: "Lorem Generator", description: "Generate placeholder text.", component: LoremGenerator },
  { category: "Text", path: "/markdown-preview", title: "Markdown Preview", description: "Live markdown preview.", component: MarkdownPreviewTool },
  { category: "Text", path: "/text-replacer", title: "Text Replacer", description: "Find and replace with regex support.", component: TextReplacerTool },
  { category: "Text", path: "/text-statistics", title: "Text Statistics", description: "Character and word frequency analysis.", component: TextStatisticsTool },
  { category: "Images", path: "/image-editor-studio", title: "Image Editor Studio", description: "Modern image editor with export.", component: ImageEditorStudio },
  { category: "Images", path: "/image-resizer", title: "Image Resizer", description: "Resize image and download.", component: ImageResizerTool },
  { category: "Images", path: "/image-format-converter", title: "Image Format Converter", description: "Convert image format and export.", component: ImageFormatConverterTool },
  { category: "Images", path: "/heic-converter", title: "HEIC/HEIF Converter", description: "Convert HEIC/HEIF to JPG, PNG, WEBP.", component: HeicConverterTool },
  { category: "Images", path: "/image-metadata", title: "Image Metadata Tool", description: "Inspect and edit image metadata notes.", component: ImageMetadataTool },
  { category: "Images", path: "/image-crop", title: "Image Crop Tool", description: "Crop by coordinates and export.", component: ImageCropTool },
  { category: "Images", path: "/image-watermark", title: "Image Watermark Tool", description: "Add text/logo watermark.", component: ImageWatermarkTool },
  { category: "Images", path: "/image-compressor", title: "Image Compressor", description: "Compress image size quickly.", component: ImageCompressorTool },
  { category: "Images", path: "/favicon-generator", title: "Favicon Generator", description: "Generate favicon sizes.", component: FaviconGeneratorTool },
  { category: "Images", path: "/palette-extractor", title: "Color Palette Extractor", description: "Extract dominant colors.", component: ColorPaletteExtractorTool },
  { category: "Utilities", path: "/credit-card-validator", title: "Credit Card Validator", description: "Luhn check + card type.", component: CreditCardValidatorTool },
  { category: "Developer", path: "/uuid-validator", title: "UUID Validator", description: "Validate UUID format.", component: UuidValidatorTool },
  { category: "Web & Data", path: "/ip-analyzer", title: "IP Address Analyzer", description: "Validate and inspect IPv4.", component: IpAddressAnalyzerTool },
  { category: "Encoding", path: "/text-hex-binary", title: "Text Hex Binary", description: "Convert text, hex and binary.", component: TextHexBinaryTool },
  { category: "Math", path: "/unit-converter", title: "Unit Converter", description: "Length, weight, temperature.", component: UnitConverterTool },
  { category: "Utilities", path: "/random-data-generator", title: "Random Data Generator", description: "Generate random structured data.", component: RandomGeneratorTool },
  { category: "Productivity", path: "/pomodoro-timer", title: "Pomodoro Timer", description: "Focus-break timer.", component: PomodoroTimerTool },
  { category: "Productivity", path: "/countdown-timer", title: "Countdown Timer", description: "Set and run countdowns.", component: CountdownTimerTool },
  { category: "Productivity", path: "/stopwatch", title: "Stopwatch", description: "Track elapsed time and laps.", component: StopwatchTool },
  { category: "Productivity", path: "/world-clock", title: "World Clock", description: "Monitor multiple timezones.", component: WorldClockTool },
  { category: "Productivity", path: "/alarm-clock", title: "Alarm Clock", description: "Set local browser alarm time.", component: AlarmClockTool },
  { category: "XML", path: "/xml-toolkit", title: "XML Toolkit", description: "Validate, format and minify XML.", component: XmlToolkit },
  { category: "HTML", path: "/html-toolkit", title: "HTML Toolkit", description: "Validate and minify HTML.", component: HtmlToolkit },
  { category: "CSS", path: "/css-toolkit", title: "CSS Toolkit", description: "Validate, format and minify CSS.", component: CssToolkit },
  { category: "JavaScript", path: "/javascript-toolkit", title: "JavaScript Toolkit", description: "Validate, format and minify JS.", component: JavaScriptToolkit },
  { category: "Python", path: "/python-toolkit", title: "Python Toolkit", description: "Python indentation and cleanup tools.", component: PythonToolkit },
  { category: "Java", path: "/java-class-builder", title: "Java Class Builder", description: "Generate Java class boilerplate.", component: JavaClassBuilder },
  { category: "C++", path: "/cpp-class-builder", title: "C++ Class Builder", description: "Generate C++ class boilerplate.", component: CppClassBuilder },
  { category: "PDF", path: "/pdf-text-print", title: "PDF Text to Print", description: "Export text via browser print-to-PDF.", component: PdfTextPrintTool },
  { category: "PDF", path: "/pdf-file-inspector", title: "PDF File Inspector", description: "Inspect PDF file signature and metadata.", component: PdfFileInspector },
  { category: "Documents", path: "/document-toolkit", title: "Document Toolkit", description: "Convert and export document formats.", component: DocumentToolkit },
  { category: "Documents", path: "/document-merge", title: "Document Merge Tool", description: "Merge multiple text-like documents.", component: DocumentMergeTool },
  { category: "Encoding", path: "/base64", title: "Base64 Encoder/Decoder", description: "Encode/decode base64.", component: Base64Tool },
  { category: "Encoding", path: "/universal-encoder-decoder", title: "Universal Encoder/Decoder", description: "Base64, URL, HTML, HEX in one tool.", component: UniversalEncoderDecoderTool },
  { category: "Encoding", path: "/url-codec", title: "URL Encoder/Decoder", description: "Encode/decode URL strings.", component: UrlCodecTool },
  { category: "Encoding", path: "/html-entities", title: "HTML Entities", description: "Encode/decode HTML entities.", component: HtmlEntitiesTool },
  { category: "Encoding", path: "/jwt-decoder", title: "JWT Decoder", description: "Decode JWT payload.", component: JwtDecoder },
  { category: "Developer", path: "/uuid-generator", title: "UUID Generator", description: "Generate UUIDs.", component: UuidGenerator },
  { category: "Developer", path: "/hash-generator", title: "SHA-256 Hash", description: "Create hashes.", component: HashGenerator },
  { category: "Developer", path: "/regex-tester", title: "Regex Tester", description: "Test regex quickly.", component: RegexTester },
  { category: "Developer", path: "/password-generator", title: "Password Generator", description: "Generate random passwords.", component: PasswordGenerator },
  { category: "Developer", path: "/number-base-converter", title: "Number Base Converter", description: "Convert numbers across bases.", component: NumberBaseConverter },
  { category: "Web & Data", path: "/query-parser", title: "Query Parser/Builder", description: "Work with query strings.", component: QueryStringTool },
  { category: "Web & Data", path: "/cron-parser", title: "Cron Expression Parser", description: "Validate cron and preview next runs.", component: CronExpressionParserTool },
  { category: "Web & Data", path: "/timestamp-converter", title: "Timestamp Converter", description: "Unix and ISO conversion.", component: TimestampConverter },
  { category: "Web & Data", path: "/url-parser", title: "URL Parser", description: "Inspect URL components.", component: UrlParserTool },
  { category: "Web & Data", path: "/email-validator", title: "Email Validator", description: "Validate email format.", component: EmailValidatorTool },
  { category: "Math", path: "/percentage-calculator", title: "Percentage Calculator", description: "Quick percentage math.", component: PercentageCalculator },
  { category: "Math", path: "/scientific-calculator", title: "Scientific Calculator", description: "Evaluate expressions with trigonometric and logarithmic functions.", component: ScientificCalculatorTool },
  { category: "Math", path: "/advanced-calculator", title: "Advanced Calculator", description: "Memory functions and hyperbolic math.", component: AdvancedCalculatorTool },
  { category: "Math", path: "/equation-solver", title: "Equation Solver", description: "Solve linear and quadratic equations.", component: EquationSolverTool },
  { category: "Math", path: "/statistics-tool", title: "Statistics Tool", description: "Mean, median, mode, variance, std dev.", component: StatisticsTool },
  { category: "Math", path: "/matrix-calculator", title: "Matrix Calculator 2x2", description: "Add, multiply, determinant, inverse.", component: MatrixCalculatorTool },
  { category: "Math", path: "/date-difference", title: "Date Difference", description: "Calculate difference between dates.", component: DateDifferenceTool },
  { category: "Math", path: "/bmi-calculator", title: "BMI Calculator", description: "Body mass index tool.", component: BmiCalculator },
  { category: "Math", path: "/emi-calculator", title: "EMI Calculator", description: "Loan EMI calculations.", component: EmiCalculator },
  { category: "Math", path: "/age-calculator", title: "Age Calculator", description: "Calculate age from DOB.", component: AgeCalculator },
  { category: "Math", path: "/number-sorter", title: "Number Sorter", description: "Sort numeric values quickly.", component: NumberSorterTool },
  { category: "Design", path: "/color-converter", title: "Color Converter", description: "HEX/RGB conversion.", component: ColorConverter },
  { category: "Design", path: "/gradient-generator", title: "Gradient Generator", description: "Build linear/radial/conic gradients.", component: GradientGeneratorTool },
  { category: "Design", path: "/box-shadow-generator", title: "Box Shadow Generator", description: "Create and preview CSS shadows.", component: BoxShadowGeneratorTool },
  { category: "Design", path: "/border-radius-generator", title: "Border Radius Generator", description: "Create custom border radii.", component: BorderRadiusGeneratorTool },
  { category: "Design", path: "/glassmorphism-generator", title: "Glassmorphism Generator", description: "Generate glass UI CSS.", component: GlassmorphismGeneratorTool },
  { category: "Design", path: "/contrast-checker", title: "Contrast Checker", description: "Check WCAG color contrast ratio.", component: ContrastCheckerTool },
  { category: "Utilities", path: "/filename-sanitizer", title: "Filename Sanitizer", description: "Clean invalid filename characters.", component: FileNameSanitizerTool },
  { category: "Storage", path: "/notepad", title: "Cookie Notepad", description: "Persist notes in cookies.", component: CookieNotepad },
  { category: "Storage", path: "/todo", title: "Cookie To-Do", description: "Persist tasks in cookies.", component: CookieTodo }
];

const CATEGORY_MERGE = {
  JSON: "Text & Data",
  Text: "Text & Data",
  "Web & Data": "Text & Data",
  Encoding: "Developer",
  Developer: "Developer",
  XML: "Code",
  HTML: "Code",
  CSS: "Code",
  JavaScript: "Code",
  Python: "Code",
  Java: "Code",
  "C++": "Code",
  PDF: "Documents",
  Documents: "Documents",
  Utilities: "Utilities",
  Productivity: "Utilities",
  Storage: "Utilities",
  Math: "Calculators",
  Design: "Design",
  Images: "Images"
};

const MERGED_CATEGORY_ORDER = ["Text & Data", "Images", "Calculators", "Design", "Developer", "Code", "Documents", "Utilities"];

function getMergedCategory(category) {
  return CATEGORY_MERGE[category] || category;
}

function buildGroupedTools() {
  const groups = new Map();
  MERGED_CATEGORY_ORDER.forEach((category) => groups.set(category, []));

  TOOL_DEFINITIONS.forEach((tool) => {
    const mergedCategory = getMergedCategory(tool.category);
    if (!groups.has(mergedCategory)) {
      groups.set(mergedCategory, []);
    }
    groups.get(mergedCategory).push(tool);
  });

  return [...groups.entries()].map(([category, tools]) => ({ category, tools })).filter((group) => group.tools.length > 0);
}

const Sidebar = memo(function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const grouped = buildGroupedTools();
  const categoryNames = grouped.map((item) => item.category);

  const [collapsed, setCollapsed] = useState(() =>
    categoryNames.reduce((acc, category) => {
      acc[category] = true;
      return acc;
    }, {})
  );

  useEffect(() => {
    setCollapsed((prev) =>
      categoryNames.reduce((acc, category) => {
        acc[category] = prev[category] ?? true;
        return acc;
      }, {})
    );
  }, [categoryNames.join("|")]);

  const toggleCategory = (category) => {
    setCollapsed((prev) => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const expandAll = () => {
    setCollapsed(
      categoryNames.reduce((acc, category) => {
        acc[category] = false;
        return acc;
      }, {})
    );
  };

  const collapseAll = () => {
    setCollapsed(
      categoryNames.reduce((acc, category) => {
        acc[category] = true;
        return acc;
      }, {})
    );
  };

  return (
    <aside className={`sidebar glass-card ${isOpen ? "open" : ""}`}>
      <div className="sidebar-title">
        <h3>Tools</h3>
        <span>{TOOL_DEFINITIONS.length} utilities</span>
      </div>
      <div className="sidebar-controls">
        <button type="button" onClick={expandAll}>Expand All</button>
        <button type="button" onClick={collapseAll}>Collapse All</button>
      </div>
      <div className="sidebar-scroll">
        {grouped.map(({ category, tools }) => (
          <div key={category} className="sidebar-category">
            <button
              type="button"
              className={`category-toggle ${collapsed[category] ? "collapsed" : "expanded"}`}
              onClick={() => toggleCategory(category)}
              aria-expanded={!collapsed[category]}
            >
              <span className="category-label">{category}</span>
              <span className="category-count">{tools.length}</span>
            </button>
            {!collapsed[category] && (
              <div className="category-links">
                {tools.map((tool) => (
                  <NavLink
                    key={tool.path}
                    to={tool.path}
                    onClick={onClose}
                    className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
                  >
                    {tool.title}
                  </NavLink>
                ))}
              </div>
            )}
            {collapsed[category] && tools.some((tool) => tool.path === location.pathname) && (
              <p className="active-hint">Active tool inside</p>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
});

const HomePage = memo(function HomePage() {
  const grouped = buildGroupedTools();
  const [query, setQuery] = useState("");

  const filteredGrouped = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return grouped;
    }
    return grouped
      .map((group) => ({
        ...group,
        tools: group.tools.filter((tool) =>
          [tool.title, tool.description, tool.path].join(" ").toLowerCase().includes(term)
        )
      }))
      .filter((group) => group.tools.length > 0);
  }, [grouped, query]);

  const metrics = useMemo(() => {
    const mergedCategories = new Set(TOOL_DEFINITIONS.map((tool) => getMergedCategory(tool.category)));
    const imageTools = TOOL_DEFINITIONS.filter((tool) => tool.category === "Images").length;
    const documentTools = TOOL_DEFINITIONS.filter((tool) => getMergedCategory(tool.category) === "Documents").length;
    return {
      totalTools: TOOL_DEFINITIONS.length,
      categories: mergedCategories.size,
      imageTools,
      documentTools
    };
  }, []);

  const quickStartLinks = useMemo(
    () => [
      { to: "/image-editor-studio", label: "Polish an image asset" },
      { to: "/document-merge", label: "Merge documents quickly" },
      { to: "/gradient-generator", label: "Design a gradient palette" }
    ],
    []
  );

  const featureHighlights = useMemo(
    () => [
      {
        title: "Integrated workspace",
        description: "Switch between creative, document, and developer utilities without leaving the browser."
      },
      {
        title: "Privacy-first processing",
        description: "Tools run in your session, keeping files local and under your control."
      },
      {
        title: "Purposeful design",
        description: "Consistent light theme, responsive layouts, and instant feedback on every action."
      }
    ],
    []
  );

  return (
    <section className="home-view">
      <div className="hero glass-card">
        <h1>Welcome to LumaTools Studio</h1>
        <p>Your curated hub for editing images, refining documents, and working with everyday developer utilities.</p>
        <div className="hero-actions">
          <Link to="/about" className="hero-button primary">Learn about the studio</Link>
          <a href="#tool-gallery" className="hero-button secondary">Browse the tool library</a>
        </div>
        <div className="hero-search-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools..."
            aria-label="Search tools"
          />
        </div>
        <div className="hero-metrics">
          <div className="metric-card">
            <span className="metric-value">{metrics.totalTools}</span>
            <span className="metric-label">Utilities</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{metrics.categories}</span>
            <span className="metric-label">Collections</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{metrics.imageTools}</span>
            <span className="metric-label">Image tools</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{metrics.documentTools}</span>
            <span className="metric-label">Document tools</span>
          </div>
        </div>
      </div>
      <div className="home-summary-grid">
        <article className="summary-card glass-card">
          <h3>Crafted for modern workflows</h3>
          <p>Streamline creative, analytical, and developer tasks with a cohesive set of polished utilities.</p>
          <ul className="summary-list">
            <li>Quick-switch between categories without losing focus.</li>
            <li>Context-aware inputs with clear validation and guidance.</li>
            <li>Thoughtful defaults to help you finish work faster.</li>
          </ul>
        </article>
        <article className="summary-card glass-card">
          <h3>Quick start</h3>
          <p>Jump straight into popular workflows or revisit your go-to tools.</p>
          <ul className="quick-links">
            {quickStartLinks.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="quick-link">
                  <span>{item.label}</span>
                  <span aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        </article>
        <article className="summary-card glass-card">
          <h3>Highlights</h3>
          <div className="feature-list">
            {featureHighlights.map((feature) => (
              <div key={feature.title} className="feature-item">
                <h4>{feature.title}</h4>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
      <section className="category-showcase" id="tool-gallery">
        <header className="section-header">
          <h2>Tool collections</h2>
          <p>Explore categories or use search to jump directly to a utility.</p>
        </header>
        <div className="category-grid">
          {filteredGrouped.map(({ category, tools }) => (
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
    </section>
  );
});

const AboutPage = memo(function AboutPage() {
  const grouped = useMemo(() => buildGroupedTools(), []);
  const totalTools = TOOL_DEFINITIONS.length;

  return (
    <section className="static-page">
      <div className="page-hero glass-card">
        <h1>About LumaTools Studio</h1>
        <p>Polished, privacy-friendly utilities that unify daily creative, document, and developer workflows.</p>
      </div>
      <div className="page-grid">
        <article className="page-card glass-card">
          <h2>Mission</h2>
          <p>Keep everyday tooling fast, cohesive, and joyful so you can focus on the work that matters.</p>
          <ul className="summary-list">
            <li>Unify creative and technical utilities in a single studio.</li>
            <li>Provide guardrails and helpful validation across each task.</li>
            <li>Celebrate a bright, inviting aesthetic that boosts momentum.</li>
          </ul>
        </article>
        <article className="page-card glass-card">
          <h2>What's inside</h2>
          <p>LumaTools Studio ships with {totalTools}+ utilities grouped into {grouped.length} curated collections.</p>
          <div className="feature-list">
            <div className="feature-item">
              <h4>Imaging suite</h4>
              <p>Resize, optimize, watermark, and enrich visuals with consistent controls.</p>
            </div>
            <div className="feature-item">
              <h4>Document lab</h4>
              <p>Convert formats, merge assets, and inspect PDFs without sending files elsewhere.</p>
            </div>
            <div className="feature-item">
              <h4>Developer toolkit</h4>
              <p>Encoders, validators, and generators that streamline experiments and delivery.</p>
            </div>
          </div>
        </article>
        <article className="page-card glass-card">
          <h2>Design principles</h2>
          <ol className="guiding-list">
            <li>
              <strong>Clarity first:</strong> Every control communicates its state with purposeful color and spacing.
            </li>
            <li>
              <strong>Local-first:</strong> Processing happens in the browser to keep your data private by default.
            </li>
            <li>
              <strong>Delightful details:</strong> Gradients, glass, and subtle motion create a calm, modern workspace.
            </li>
          </ol>
        </article>
      </div>
    </section>
  );
});

const ContactPage = memo(function ContactPage() {
  const contactLinks = useMemo(
    () => [
      {
        label: "LinkedIn",
        href: "https://www.linkedin.com/in/kaus98",
        description: "Connect professionally and explore recent product updates."
      },
      {
        label: "GitHub",
        href: "https://github.com/kaus98",
        description: "Browse open-source experiments, utilities, and contributions."
      },
      {
        label: "Kaggle",
        href: "https://www.kaggle.com/terminate9298",
        description: "Follow data science notebooks, competitions, and insights."
      }
    ],
    []
  );

  return (
    <section className="static-page">
      <div className="page-hero glass-card">
        <h1>Contact</h1>
        <p>Reach out to collaborate, share feedback, or suggest the next tool for the studio.</p>
      </div>
      <div className="contact-grid">
        {contactLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="contact-card glass-card"
          >
            <span className="contact-label">{link.label}</span>
            <span className="contact-description">{link.description}</span>
            <span className="contact-link-hint">Open profile &rarr;</span>
          </a>
        ))}
      </div>
      <div className="page-card glass-card contact-note">
        <h2>Stay in touch</h2>
        <p>Email <a href="mailto:kaus.pathak@gmail.com">kaus.pathak@gmail.com</a> or drop a note through any profile's messaging and we'll connect.</p>
      </div>
    </section>
  );
});

function AppFrame({ children }) {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-bg">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="page-wrap">
        <header className="top-nav glass-card">
          <div className="brand-wrap">
            <Link to="/" className="brand" aria-label="LumaTools Studio Home">
              <svg className="brand-logo" viewBox="0 0 120 120" role="img" aria-label="LumaTools Studio Logo">
                <defs>
                  <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0ea5e9" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>
                <rect x="10" y="10" width="100" height="100" rx="26" fill="url(#logo-grad)" />
                <path d="M32 74V46h9v20h18v8H32zm31 0V46h9v28h-9zm16 0V46h9v20h18v8H79z" fill="#f8fffe" />
              </svg>
              <span className="brand-text">
                <strong>LumaTools</strong>
                <small>Studio</small>
              </span>
            </Link>
          </div>
          <nav className="top-nav-links" aria-label="Primary">
            <NavLink to="/" end className={({ isActive }) => `top-nav-link ${isActive ? "active" : ""}`}>
              Home
            </NavLink>
            <NavLink to="/about" className={({ isActive }) => `top-nav-link ${isActive ? "active" : ""}`}>
              About
            </NavLink>
            <NavLink to="/contact" className={({ isActive }) => `top-nav-link ${isActive ? "active" : ""}`}>
              Contact
            </NavLink>
          </nav>
          <div className="top-nav-actions">
            <button type="button" className="mobile-menu-btn" onClick={() => setMobileNavOpen((v) => !v)}>
              {mobileNavOpen ? "Close" : "Menu"}
            </button>
          </div>
        </header>
        <div className="app-layout">
          <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
          <main className="content-area">{children}</main>
        </div>
        {mobileNavOpen && <button type="button" className="mobile-overlay" aria-label="Close Menu Overlay" onClick={() => setMobileNavOpen(false)} />}
      </div>
    </div>
  );
}

export default function ToolHubAppV2() {
  return (
    <AppFrame>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        {TOOL_DEFINITIONS.map((tool) => (
          <Route key={tool.path} path={tool.path} element={<tool.component />} />
        ))}
      </Routes>
    </AppFrame>
  );
}
