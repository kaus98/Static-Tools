# Static Tools Hub

A modern, browser-first utility workspace built with **React + Vite**.

This app provides a large collection of developer, text, image, data, math, document, and productivity tools in one place, with a fast glassmorphism UI and category-based sidebar navigation.

---

## Highlights

- 100% client-side processing for most tools (privacy-friendly for local usage)
- Modern glassmorphism UI with gradient backgrounds and smooth animations
- Responsive design with persistent left sidebar and mobile navigation
- Category-based routing with React Router and collapsible sidebar categories
- Input validation for most tools via centralized validator functions
- Modern image tool suite (editor, crop, watermark, HEIC conversion, metadata, compression, palette)
- Enhanced JSON Explorer with collapse/expand functionality for nested structures
- Scientific and Advanced calculators with trigonometric, logarithmic, and hyperbolic functions
- Memory functions and calculation history in calculators
- Document and encoding utilities integrated in-app

---

## Tech Stack

- **Frontend:** React 18
- **Build Tool:** Vite 5
- **Routing:** React Router DOM (HashRouter)
- **Language:** JavaScript (ES modules)
- **Styling:** Custom CSS (`styles.css`) with glassmorphism design

---

## Project Structure

- `src/main.jsx` – app bootstrap with router
- `src/App.jsx` – app entry export (points to `ToolHubAppV2`)
- `src/ToolHubAppV2.jsx` – main tool hub, tool components, registry, validators
- `styles.css` – global layout and component styles
- `index.html` – root HTML shell

---

## Run Locally

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Start development server

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

---

## Tool Categories & Capabilities

> The sidebar and homepage are generated from a single tool registry (`TOOL_DEFINITIONS`).

### 1) JSON

- JSON Validator
- JSON Formatter / Minifier / Flattener
- JSON Explorer
- JSON Linter
- JSON Sorter
- JSON to CSV

### 2) Images

- Image Editor Studio
  - Resize, rotate, flip, brightness/contrast/saturation
  - Format conversion (PNG/JPG/WEBP), quality control
  - Export/download
- Image Resizer
- Image Format Converter
- HEIC/HEIF Converter (to JPG/PNG/WEBP)
- Image Metadata Tool
- Image Crop Tool
- Image Watermark Tool (text/logo)
- Image Compressor
- Favicon Generator
- Color Palette Extractor

### 3) XML / HTML / CSS / JavaScript

- XML Toolkit (validate, format, minify)
- HTML Toolkit (structure validate, minify)
- CSS Toolkit (validate, format, minify)
- JavaScript Toolkit (validate, format, minify)

### 4) Language Helpers

- Python Toolkit (indent normalization, trailing-space cleanup)
- Java Class Builder
- C++ Class Builder

### 5) PDF + Documents

- PDF Text to Print (print-to-PDF flow)
- PDF File Inspector
- Document Toolkit
  - Convert Text/Markdown/HTML
  - Export TXT/MD/HTML/DOC
  - Load document files
- Document Merge Tool

### 6) Text

- Text Editor
- Text Diff Checker
- Word Counter
- Case Converter
- Line Tools
- Line Counter
- Slug Generator
- Lorem Generator
- Markdown Preview

### 7) Encoding

- Base64 Encoder/Decoder
- Universal Encoder/Decoder (Base64, URL, HTML entities, HEX)
- URL Encoder/Decoder
- HTML Entity Encoder/Decoder
- JWT Decoder
- Text Hex Binary converter

### 8) Developer

- UUID Generator
- UUID Validator
- Hash Generator (SHA-256)
- Regex Tester
- Random String & Password Generator (length + charset controls)
- Number Base Converter

### 9) Web & Data

- Query String Parser/Builder
- Cron Expression Parser (5-field + next-run preview)
- Timestamp Converter
- URL Parser
- Email Validator
- IP Address Analyzer

### 10) Math

- Percentage Calculator
- Scientific Calculator (trigonometric, logarithmic, exponential functions with history)
- Advanced Calculator (memory functions, hyperbolic functions, cube root)
- Equation Solver (linear + quadratic)
- Statistics Tool (mean, median, mode, variance, std dev)
- Matrix Calculator (2x2 add/multiply/determinant/inverse)
- Date Difference Calculator
- BMI Calculator
- EMI Calculator
- Age Calculator
- Number Sorter
- Unit Converter (length, weight, temperature)

### 11) Design

- Color Converter (HEX/RGB)
- Gradient Generator (linear/radial/conic + CSS)
- Box Shadow Generator
- Border Radius Generator
- Glassmorphism Generator
- Contrast Checker (WCAG ratio checks)

### 12) Utilities

- Filename Sanitizer
- Credit Card Validator (Luhn + card type)
- Random Data Generator

### 13) Productivity

- Pomodoro Timer
- Countdown Timer
- Stopwatch (with laps)
- World Clock (multi-timezone)
- Alarm Clock

### 14) Storage

- Cookie Notepad
- Cookie To-Do

---

## Validation System

The app uses centralized validators for consistent UX and safe transformations, including checks for:

- required text
- numeric ranges / integer constraints
- JSON syntax
- Base64
- regex flags
- JWT format
- query strings
- URL / email
- XML / JavaScript syntax
- identifier and filename rules
- UUID, IPv4, hex string validity

---

## Image Processing Notes

Image operations are done in-browser using Canvas APIs and helper utilities such as:

- image loading from file
- canvas transformation pipeline
- blob conversion for export
- client-side file download

This keeps common operations local to the user machine.

---

## Routing & Extensibility

To add a new tool:

1. Create a React component in `src/ToolHubAppV2.jsx` (or refactor to modules later).
2. Add validation (if needed) using shared validator helpers.
3. Register it in `TOOL_DEFINITIONS` with:
   - `category`
   - `path`
   - `title`
   - `description`
   - `component`
4. Ensure category appears in `CATEGORY_ORDER`.

The sidebar, homepage cards, and routes are generated automatically from this registry.

---

## Known Scope / Constraints

- Most tools are intentionally static and browser-native.
- Some advanced document/PDF workflows may need third-party libraries for full fidelity (e.g., true PDF merge/split rendering).
- Markdown and format conversion tools are lightweight and designed for speed/usability.

---

## License

No license file is currently defined in this repository.

---

## Author Notes

This project is designed as a scalable, extensible static utility platform.
Future upgrades can include:

- richer PDF workflows (merge/split/extract)
- YAML / SQL / schema tooling
- batch operations
- optional AI-assisted utilities via API integrations
