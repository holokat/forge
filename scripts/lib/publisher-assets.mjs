export function styles() {
  return `@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Spline+Sans:wght@400;500;600&display=swap');

:root {
  color-scheme: light;
  --bg: #fbfbfa;
  --panel: #ffffff;
  --panel-soft: #f1f3ee;
  --text: #232522;
  --muted: #6f756d;
  --faint: #92998f;
  --accent: #126f66;
  --accent-strong: #0c4f49;
  --link: #3f5fc4;
  --tag-bg: #fff2c8;
  --tag-text: #5e4700;
  --code-bg: #eef1f5;
  --shadow-border: 0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04);
  --shadow-border-hover: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.06);
}

* {
  box-sizing: border-box;
}

html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
  min-height: 100vh;
  background: linear-gradient(180deg, var(--bg) 0%, var(--panel-soft) 100%);
}

body.site-theme-editorial {
  --bg: #f8f8f6;
  --panel-soft: #eeeeec;
  --text: #171717;
  --muted: #646464;
  --accent: #262626;
  --accent-strong: #000000;
  --link: #202020;
  --tag-bg: #eeeeec;
  --tag-text: #282828;
}

body.site-theme-reference {
  --bg: #f7f8fb;
  --panel-soft: #eef0f5;
  --text: #1e2229;
  --muted: #626976;
  --accent: #303742;
  --accent-strong: #11151b;
  --link: #252b35;
  --tag-bg: #e9ecf2;
  --tag-text: #252b35;
}

a {
  color: var(--link);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
  transition-property: color, box-shadow, background-color, scale;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}

a:hover {
  color: var(--accent-strong);
}

a:active {
  scale: 0.96;
}

.skip-link {
  position: fixed;
  left: 16px;
  top: 16px;
  z-index: 10;
  transform: translateY(-140%);
  background: var(--panel);
  color: var(--text);
  padding: 10px 14px;
  border-radius: 8px;
  box-shadow: var(--shadow-border);
  transition-property: transform;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}

.skip-link:focus {
  transform: translateY(0);
}

.site-shell {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: clamp(24px, 4vw, 56px);
  width: min(1440px, 100%);
  margin: 0 auto;
  padding: 28px;
}

.site-sidebar {
  position: sticky;
  top: 28px;
  align-self: start;
  max-height: calc(100vh - 56px);
  overflow: auto;
  padding: 20px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: var(--shadow-border);
}

.site-brand {
  display: grid;
  gap: 4px;
  margin-bottom: 24px;
}

.site-brand a {
  color: var(--text);
  font-size: 1rem;
  font-weight: 760;
  text-decoration: none;
  text-wrap: balance;
}

.site-brand span,
.eyebrow,
.note-path,
.empty-state {
  color: var(--muted);
}

.site-brand p {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
  text-wrap: pretty;
}

.sidebar-section {
  margin-top: 22px;
}

.sidebar-section h2 {
  margin: 0 0 8px;
  color: var(--faint);
  font-size: 0.72rem;
  letter-spacing: 0;
  text-transform: uppercase;
}

.sidebar-section ul,
.link-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sidebar-section li + li,
.link-list li + li {
  margin-top: 6px;
}

.sidebar-section a,
.sidebar-link {
  display: flex;
  justify-content: space-between;
  min-height: 40px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 7px;
  color: var(--text);
  text-decoration: none;
}

.sidebar-section a:hover,
.sidebar-link:hover {
  background: var(--panel-soft);
  box-shadow: var(--shadow-border-hover);
}

.site-main {
  min-width: 0;
  padding: 24px 0 72px;
}

.page-header {
  max-width: 820px;
  margin: 0 0 28px;
}

.page-header h1 {
  margin: 0;
  color: var(--text);
  font-size: clamp(2.1rem, 5vw, 4.4rem);
  line-height: 0.96;
  letter-spacing: 0;
  text-wrap: balance;
}

.page-header p {
  max-width: 680px;
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 1.02rem;
  line-height: 1.65;
  text-wrap: pretty;
}

.eyebrow,
.note-path {
  margin: 0 0 8px;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 32px;
}

.stats-grid div,
.note-card,
.relation-grid > div {
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow-border);
}

.stats-grid div {
  padding: 18px;
}

.stats-grid dt {
  color: var(--muted);
  font-size: 0.8rem;
}

.stats-grid dd {
  margin: 6px 0 0;
  font-size: 1.9rem;
  font-weight: 760;
  font-variant-numeric: tabular-nums;
}

.content-section {
  margin-top: 34px;
}

.content-section h2,
.relation-grid h2 {
  margin: 0 0 14px;
  color: var(--text);
  font-size: 1rem;
  text-wrap: balance;
}

.note-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.note-card {
  padding: 18px;
  transition-property: box-shadow, transform;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}

.note-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-border-hover);
}

.note-card h2 {
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.35;
  text-wrap: balance;
}

.note-card p {
  margin: 10px 0 0;
  color: var(--muted);
  line-height: 1.5;
  text-wrap: pretty;
}

.tag-row,
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.tag,
.tag-cloud-item {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--tag-bg);
  color: var(--tag-text);
  font-size: 0.84rem;
  font-weight: 680;
  text-decoration: none;
}

.tag-cloud-item span,
.sidebar-section a span {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.note-article {
  max-width: 860px;
}

.note-header {
  margin-bottom: 22px;
}

.markdown-body {
  color: var(--text);
  font-size: 1rem;
  line-height: 1.72;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  position: relative;
  margin: 1.6em 0 0.55em;
  line-height: 1.18;
  text-wrap: balance;
}

.markdown-body h1 {
  font-size: 2.1rem;
}

.markdown-body h2 {
  font-size: 1.55rem;
}

.markdown-body h3 {
  font-size: 1.22rem;
}

.heading-anchor {
  margin-left: 8px;
  color: var(--faint);
  font-size: 0.8em;
  opacity: 0;
  text-decoration: none;
  transition-property: opacity, color;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}

.markdown-body h1:hover .heading-anchor,
.markdown-body h2:hover .heading-anchor,
.markdown-body h3:hover .heading-anchor,
.markdown-body h4:hover .heading-anchor,
.markdown-body h5:hover .heading-anchor,
.markdown-body h6:hover .heading-anchor,
.heading-anchor:focus {
  opacity: 1;
}

.markdown-body p,
.markdown-body li,
.markdown-body blockquote {
  text-wrap: pretty;
}

.markdown-body code {
  border-radius: 5px;
  background: var(--code-bg);
  padding: 0.16em 0.32em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.92em;
}

.markdown-body pre {
  overflow: auto;
  border-radius: 8px;
  background: #1f2428;
  color: #f4f7f8;
  padding: 16px;
  box-shadow: var(--shadow-border);
}

.markdown-body pre code {
  background: transparent;
  padding: 0;
}

.markdown-body blockquote {
  margin: 1.2em 0;
  padding: 2px 0 2px 18px;
  color: var(--muted);
  box-shadow: inset 3px 0 0 var(--accent);
}

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.2em 0;
  overflow: hidden;
  border-radius: 8px;
  box-shadow: var(--shadow-border);
}

.markdown-body th,
.markdown-body td {
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}

.markdown-body tr + tr {
  box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.06);
}

.markdown-body img,
.embed {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1.2em 0;
  border-radius: 8px;
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px;
}

.embed-audio,
.embed-video {
  width: 100%;
  margin: 1.2em 0;
}

.embed-video {
  display: block;
  max-width: min(100%, 760px);
  border-radius: 8px;
  background: #000;
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px;
}

.markdown-body .media-gallery,
.blog-prose .media-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin: 1.4em 0;
}

.markdown-body .media-gallery figure,
.blog-prose .media-gallery figure {
  min-width: 0;
  margin: 0;
}

.markdown-body .media-gallery img,
.blog-prose .media-gallery img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  margin: 0;
  border-radius: 8px;
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px;
}

.markdown-body .media-gallery figcaption,
.blog-prose .media-gallery figcaption {
  margin-top: 7px;
  overflow: hidden;
  color: var(--muted);
  font-size: 0.72em;
  line-height: 1.35;
  text-overflow: ellipsis;
  text-wrap: pretty;
  white-space: nowrap;
}

html[data-theme='dark'] .markdown-body .media-gallery img,
html[data-theme='dark'] .blog-prose .media-gallery img,
body.site-theme-terminal-ledger .markdown-body .media-gallery img,
body.site-theme-terminal-ledger .blog-prose .media-gallery img {
  outline-color: rgba(255, 255, 255, 0.1);
}

.forge-embed-frame {
  margin: 1.4em 0;
}

.forge-embed-frame iframe {
  display: block;
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: var(--panel-soft);
  box-shadow: var(--shadow-border);
}

.forge-embed-frame figcaption {
  margin-top: 8px;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.4;
}

.forge-embed-link {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
}

.publish-form-section {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(260px, 1fr);
  gap: clamp(18px, 4vw, 42px);
  align-items: start;
  max-width: 980px;
  margin: 48px 0 0;
  padding: clamp(18px, 3vw, 28px);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow-border);
}

.publish-form-section h2 {
  margin: 0;
  font-size: clamp(1.7rem, 4vw, 2.8rem);
  line-height: 1;
  text-wrap: balance;
}

.publish-form-section p {
  margin: 10px 0 0;
  color: var(--muted);
  line-height: 1.55;
}

.publish-form {
  display: grid;
  gap: 12px;
}

.publish-form label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.publish-form input,
.publish-form textarea {
  width: 100%;
  border: 0;
  border-radius: 7px;
  padding: 11px 12px;
  background: var(--panel-soft);
  color: var(--text);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  font: inherit;
  font-size: 0.95rem;
}

.publish-form textarea {
  resize: vertical;
}

.publish-form input:focus,
.publish-form textarea:focus {
  outline: none;
  box-shadow: inset 0 0 0 1.5px var(--accent), 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

.publish-form button {
  justify-self: start;
  min-height: 42px;
  padding: 0 16px;
  border: 0;
  border-radius: 7px;
  background: var(--text);
  color: var(--bg);
  font: inherit;
  font-weight: 750;
  transition-property: transform, opacity;
  transition-duration: 140ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.publish-form button:hover {
  opacity: 0.86;
}

.publish-form button:active {
  transform: scale(0.96);
}

.form-honeypot {
  display: none;
}

.internal-link {
  color: var(--accent);
  font-weight: 620;
}

.external-link::after {
  content: "\\2197";
  padding-left: 0.18em;
  font-size: 0.72em;
}

.unresolved,
.missing-asset {
  color: #9a3412;
  text-decoration-style: dashed;
}

.relation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  max-width: 860px;
}

.relation-grid > div {
  padding: 18px;
}

.link-list a {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
}

body.site-theme-quiet-paper,
body.site-theme-terminal-ledger,
body.site-theme-swiss-ledger,
body.site-theme-soft-focus,
body.site-theme-field-notes {
  background: var(--bg);
  color: var(--fg);
}

body.site-theme-quiet-paper {
  --bg: #faf7f1;
  --panel: #f1ece1;
  --fg: #1c1a16;
  --muted: #8a8378;
  --faint: #a89f8f;
  --line: #e6e0d3;
  --line-soft: #eee8db;
  --line-strong: #cfc7b6;
  --accent: #a6603c;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --tag-bg: #f1ece1;
  --tag-text: #a6603c;
  --code-bg: #211e19;
  --code-fg: #eae4d6;
  font-family: "Newsreader", Georgia, serif;
}

body.site-theme-terminal-ledger {
  color-scheme: dark;
  --bg: #0b0d10;
  --panel: #11151a;
  --fg: #e8ebee;
  --muted: #7a848f;
  --faint: #5c6670;
  --line: #1a2027;
  --line-soft: #14181d;
  --line-strong: #2b333d;
  --accent: #ffb454;
  --text: #c6ccd2;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --tag-bg: #2b2418;
  --tag-text: #ffb454;
  --code-bg: #11151a;
  --code-fg: #c6ccd2;
  font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
}

body.site-theme-swiss-ledger {
  --bg: #ffffff;
  --panel: #f4f2ee;
  --fg: #141311;
  --muted: #5a564e;
  --faint: #9a968d;
  --line: #d6d3cb;
  --line-strong: #cfcbc0;
  --accent: #ff3e00;
  --invert-bg: #141311;
  --invert-fg: #ffffff;
  --font-mono: "Space Mono", ui-monospace, monospace;
  --tag-bg: #141311;
  --tag-text: #ffffff;
  --code-bg: #000000;
  --code-fg: #ffffff;
  font-family: Archivo, ui-sans-serif, system-ui, sans-serif;
}

body.site-theme-soft-focus {
  --bg: #f7f5f1;
  --panel: #efece4;
  --fg: #26241f;
  --muted: #6b6357;
  --faint: #b3ab9e;
  --line: #e7e2d8;
  --line-strong: #d8d1c3;
  --accent: #c96f4a;
  --font-mono: "Space Mono", ui-monospace, monospace;
  --tag-bg: #efece4;
  --tag-text: #c96f4a;
  --code-bg: #efece4;
  --code-fg: #4a453d;
  font-family: "Spline Sans", ui-sans-serif, system-ui, sans-serif;
}

body.site-theme-field-notes {
  --bg: #eef1f5;
  --panel: #e1e7ef;
  --fg: #232a33;
  --muted: #63707f;
  --faint: #9aa4b2;
  --line: #d4dbe4;
  --line-strong: #c3ccd8;
  --accent: #46688f;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --tag-bg: #e1e7ef;
  --tag-text: #46688f;
  --code-bg: #e2e8f0;
  --code-fg: #3a4551;
  font-family: "Spline Sans", ui-sans-serif, system-ui, sans-serif;
}

html[data-theme='dark'] body.site-theme-quiet-paper {
  color-scheme: dark;
  --bg: #16140f;
  --panel: #211d15;
  --fg: #ece7db;
  --muted: #9a9282;
  --faint: #6f685b;
  --line: #2b2618;
  --line-soft: #231f16;
  --line-strong: #3a3324;
  --accent: #db9d66;
  --tag-bg: #211d15;
  --tag-text: #db9d66;
  --code-bg: #0f0d09;
  --code-fg: #eae4d6;
}

html[data-theme='light'] body.site-theme-terminal-ledger {
  color-scheme: light;
  --bg: #f6f7f4;
  --panel: #ffffff;
  --fg: #14181d;
  --muted: #586069;
  --faint: #8b95a0;
  --line: #e3e6df;
  --line-soft: #edf0ea;
  --line-strong: #cfd6cd;
  --accent: #c07414;
  --text: #333b44;
  --tag-bg: #fff4df;
  --tag-text: #9b5600;
  --code-bg: #14181d;
  --code-fg: #dfe4df;
}

html[data-theme='dark'] body.site-theme-swiss-ledger {
  color-scheme: dark;
  --bg: #0d0d0c;
  --panel: #181613;
  --fg: #f2f0ea;
  --muted: #a3a099;
  --faint: #6b6862;
  --line: #282623;
  --line-strong: #35322d;
  --accent: #ff5a2c;
  --invert-bg: #f2f0ea;
  --invert-fg: #0d0d0c;
  --tag-bg: #f2f0ea;
  --tag-text: #0d0d0c;
}

html[data-theme='dark'] body.site-theme-soft-focus {
  color-scheme: dark;
  --bg: #1a1815;
  --panel: #232019;
  --fg: #ece8e0;
  --muted: #a49a8c;
  --faint: #6e675b;
  --line: #2c281f;
  --line-strong: #3a352b;
  --accent: #e08a5f;
  --tag-bg: #232019;
  --tag-text: #e08a5f;
  --code-bg: #232019;
  --code-fg: #cfc8ba;
}

html[data-theme='dark'] body.site-theme-field-notes {
  color-scheme: dark;
  --bg: #11151b;
  --panel: #1a212a;
  --fg: #e3e9f1;
  --muted: #8b96a6;
  --faint: #59616e;
  --line: #232b36;
  --line-strong: #333d4a;
  --accent: #7ea6d4;
  --tag-bg: #1a212a;
  --tag-text: #7ea6d4;
  --code-bg: #1a212a;
  --code-fg: #c2ccd9;
}

.blog-header {
  max-width: 680px;
  margin: 0 auto;
  padding: clamp(30px, 6vw, 52px) clamp(24px, 6vw, 60px) 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.blog-header.terminal {
  max-width: 960px;
}

.blog-header.swiss,
.blog-header.field {
  max-width: 920px;
}

.blog-brand,
.blog-nav a,
.blog-back,
.theme-toggle {
  color: var(--muted);
  text-decoration: none;
}

.blog-brand {
  color: var(--fg);
  font-weight: 600;
}

.blog-nav {
  display: flex;
  align-items: center;
  gap: 18px;
}

.theme-toggle {
  min-width: 40px;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  font: 500 11px/1 var(--font-mono, ui-monospace, monospace);
  cursor: pointer;
  transition-property: border-color, color, transform;
  transition-duration: 150ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.theme-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.theme-toggle:active {
  transform: scale(0.96);
}

.theme-toggle-moon,
html[data-theme='dark'] .theme-toggle-sun,
body.site-theme-terminal-ledger .theme-toggle-sun {
  display: none;
}

html[data-theme='dark'] .theme-toggle-moon,
body.site-theme-terminal-ledger .theme-toggle-moon {
  display: inline;
}

html[data-theme='light'] body.site-theme-terminal-ledger .theme-toggle-sun {
  display: inline;
}

html[data-theme='light'] body.site-theme-terminal-ledger .theme-toggle-moon {
  display: none;
}

.reading-progress {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 20;
  width: calc(var(--progress, 0) * 100%);
  height: 3px;
  background: var(--accent);
  transform-origin: left center;
}

.blog-reveal {
  animation: blogIn 0.5s ease both;
}

[data-stagger] > * {
  opacity: 0;
  animation: blogUp 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
}

[data-stagger] > *:nth-child(1) { animation-delay: 0.02s; }
[data-stagger] > *:nth-child(2) { animation-delay: 0.06s; }
[data-stagger] > *:nth-child(3) { animation-delay: 0.10s; }
[data-stagger] > *:nth-child(4) { animation-delay: 0.14s; }
[data-stagger] > *:nth-child(5) { animation-delay: 0.18s; }
[data-stagger] > *:nth-child(6) { animation-delay: 0.22s; }
[data-stagger] > *:nth-child(7) { animation-delay: 0.26s; }
[data-stagger] > *:nth-child(8) { animation-delay: 0.30s; }
[data-stagger] > *:nth-child(9) { animation-delay: 0.34s; }
[data-stagger] > *:nth-child(n+10) { animation-delay: 0.38s; }

@keyframes blogIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes blogUp {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}

.quiet-index,
.quiet-post {
  max-width: 680px;
  margin: 0 auto;
  padding: clamp(38px, 6vw, 56px) clamp(24px, 6vw, 60px) clamp(48px, 8vw, 80px);
}

.quiet-bio {
  max-width: 460px;
  margin: 0 0 clamp(40px, 7vw, 60px);
  color: var(--fg);
  font: italic 400 clamp(19px, 2.4vw, 22px)/1.55 "Newsreader", Georgia, serif;
  text-wrap: pretty;
}

.quiet-year {
  margin-bottom: 8px;
}

.quiet-year-label {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
  color: var(--faint);
  font: 400 12px "IBM Plex Mono", ui-monospace, monospace;
}

.quiet-row {
  display: flex;
  align-items: baseline;
  gap: 22px;
  padding: 15px 0;
  border-bottom: 1px solid var(--line-soft);
  color: var(--fg);
  text-decoration: none;
  transition-property: padding-left, color;
  transition-duration: 180ms;
  transition-timing-function: ease;
}

.quiet-row:hover {
  padding-left: 8px;
  color: var(--accent);
}

.quiet-row span {
  width: 52px;
  flex: none;
  color: var(--faint);
  font: 400 12px "IBM Plex Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.quiet-row strong {
  flex: 1;
  font: 400 clamp(17px, 2.1vw, 19px)/1.35 "Newsreader", Georgia, serif;
}

.blog-article {
  width: 100%;
  max-width: 620px;
}

.quiet-post .blog-article {
  max-width: 560px;
  margin: 0 auto;
}

.blog-back {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  margin-bottom: clamp(28px, 5vw, 46px);
  font: 400 12px var(--font-mono, ui-monospace, monospace);
}

.blog-back:hover {
  color: var(--accent);
}

.quiet-post-tag,
.soft-post-tag,
.terminal-label,
.swiss-label {
  margin: 0 0 14px;
  color: var(--accent);
  font: 600 11px var(--font-mono, ui-monospace, monospace);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.blog-article h1,
.soft-post h1,
.swiss-post h1 {
  margin: 0 0 16px;
  color: var(--fg);
  font-size: clamp(30px, 4.4vw, 42px);
  line-height: 1.12;
  letter-spacing: 0;
  text-wrap: balance;
}

.quiet-post .blog-article h1 {
  font-family: "Newsreader", Georgia, serif;
  font-weight: 400;
}

.blog-meta {
  margin: 0 0 34px;
  color: var(--faint);
  font: 400 12px var(--font-mono, ui-monospace, monospace);
}

.blog-toc {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 38px;
  padding: 18px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.blog-toc div {
  color: var(--faint);
  font: 600 11px var(--font-mono, ui-monospace, monospace);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.blog-toc a {
  width: fit-content;
  color: var(--muted);
  text-decoration: none;
}

.blog-toc a:hover {
  color: var(--accent);
}

.blog-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 24px;
}

.blog-prose {
  color: var(--fg);
  font-size: 17px;
  line-height: 1.72;
}

.blog-prose h1,
.blog-prose h2,
.blog-prose h3 {
  margin: 2em 0 0.65em;
  color: var(--fg);
  line-height: 1.22;
  text-wrap: balance;
}

.blog-prose h2 {
  font-size: 1.42em;
}

.blog-prose p,
.blog-prose li,
.blog-prose blockquote {
  text-wrap: pretty;
}

.blog-prose a {
  color: var(--accent);
}

.blog-prose pre {
  overflow: auto;
  margin: 1.6em 0;
  padding: 22px 24px;
  border-radius: 4px;
  background: var(--code-bg);
  color: var(--code-fg);
  font: 400 12.5px/1.75 var(--font-mono, ui-monospace, monospace);
}

.blog-prose code {
  border-radius: 5px;
  background: var(--code-bg);
  color: var(--code-fg);
  padding: 0.14em 0.32em;
  font-family: var(--font-mono, ui-monospace, monospace);
}

.blog-prose pre code {
  background: transparent;
  padding: 0;
}

.blog-prose blockquote {
  margin: 32px 0;
  padding-left: 22px;
  border-left: 2px solid var(--accent);
  color: var(--fg);
  font-style: italic;
}

.blog-prose img,
.blog-prose .embed {
  border-radius: 8px;
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px;
}

html[data-theme='dark'] .blog-prose img,
html[data-theme='dark'] .blog-prose .embed,
body.site-theme-terminal-ledger .blog-prose img,
body.site-theme-terminal-ledger .blog-prose .embed {
  outline-color: rgba(255, 255, 255, 0.1);
}

.blog-pager {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 52px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}

.blog-pager a {
  min-height: 52px;
  color: var(--fg);
  text-decoration: none;
}

.blog-pager a:last-child {
  text-align: right;
}

.blog-pager span {
  display: block;
  margin-bottom: 8px;
  color: var(--faint);
  font: 600 11px var(--font-mono, ui-monospace, monospace);
  text-transform: uppercase;
}

.blog-pager strong {
  font-weight: 500;
}

.blog-relations {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 34px;
}

.blog-relations > div {
  padding: 16px;
  border-radius: 8px;
  background: var(--panel);
}

.blog-relations h2 {
  margin: 0 0 10px;
  font-size: 0.9rem;
}

.terminal-index {
  max-width: 960px;
  margin: 0 auto;
  padding: clamp(40px, 6vw, 64px) clamp(24px, 6vw, 60px) clamp(48px, 8vw, 80px);
}

.terminal-bio {
  display: flex;
  align-items: flex-end;
  gap: 7px;
  max-width: 620px;
  margin-bottom: 44px;
}

.terminal-bio p {
  margin: 0;
  color: var(--text);
  font-size: clamp(18px, 2.2vw, 22px);
  line-height: 1.45;
}

.terminal-bio span {
  width: 8px;
  height: 1.15em;
  background: var(--accent);
  animation: cursorBlink 1s steps(2, start) infinite;
}

@keyframes cursorBlink {
  50% { opacity: 0; }
}

.terminal-table {
  border-top: 1px solid var(--line-strong);
}

.terminal-table-head,
.terminal-row {
  display: grid;
  grid-template-columns: 74px 130px minmax(0, 1fr) 120px;
  gap: 16px;
  align-items: center;
}

.terminal-table-head {
  padding: 12px 0;
  color: var(--faint);
  font: 600 11px "JetBrains Mono", ui-monospace, monospace;
}

.terminal-row {
  min-height: 58px;
  padding: 13px 0;
  border-top: 1px solid var(--line);
  color: var(--text);
  text-decoration: none;
  transition-property: background-color, color, padding-left;
  transition-duration: 160ms;
  transition-timing-function: ease;
}

.terminal-row:hover {
  padding-left: 10px;
  background: var(--panel);
  color: var(--fg);
}

.terminal-row span {
  color: var(--muted);
  font: 500 12px "JetBrains Mono", ui-monospace, monospace;
}

.terminal-row span:first-child {
  color: var(--accent);
}

.terminal-row strong {
  overflow: hidden;
  color: var(--fg);
  font: 500 15px "JetBrains Mono", ui-monospace, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-post {
  max-width: 960px;
  margin: 0 auto;
  padding: clamp(34px, 6vw, 52px) clamp(24px, 6vw, 60px) clamp(48px, 8vw, 80px);
  display: grid;
  grid-template-columns: 200px minmax(0, 660px);
  gap: 48px;
}

.terminal-rail {
  position: sticky;
  top: 28px;
  align-self: start;
}

.terminal-rail .blog-toc {
  margin-bottom: 24px;
  padding-left: 14px;
  border: 0;
  border-left: 1px solid var(--accent);
}

.terminal-rail dl,
.field-post-rail dl {
  display: grid;
  gap: 12px;
  margin: 0;
}

.terminal-rail dt,
.field-post-rail dt {
  color: var(--faint);
  font: 600 10px var(--font-mono, ui-monospace, monospace);
  text-transform: uppercase;
}

.terminal-rail dd,
.field-post-rail dd {
  margin: 3px 0 0;
  color: var(--fg);
  font: 500 12px var(--font-mono, ui-monospace, monospace);
}

.terminal-article h1 {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-weight: 600;
}

.terminal-article .blog-prose {
  color: var(--text);
}

.terminal-article .blog-prose h2::before {
  content: "## ";
  color: var(--accent);
}

.swiss-index,
.swiss-post {
  max-width: 920px;
  margin: 0 auto;
  padding: clamp(36px, 6vw, 60px) clamp(24px, 6vw, 60px) clamp(48px, 8vw, 80px);
}

.swiss-index h1 {
  max-width: 780px;
  margin: 0;
  padding-bottom: 24px;
  border-bottom: 3px solid var(--fg);
  color: var(--fg);
  font: 900 clamp(56px, 12vw, 132px)/0.84 Archivo, ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
  text-transform: uppercase;
  text-wrap: balance;
}

.swiss-index h1 span,
.field-main h1 em {
  color: var(--accent);
  font-style: normal;
}

.swiss-index p {
  max-width: 580px;
  margin: 22px 0 42px;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.5;
}

.swiss-row {
  display: grid;
  grid-template-columns: 72px 150px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  min-height: 70px;
  padding: 18px 0;
  border-top: 1px solid var(--line);
  color: var(--fg);
  text-decoration: none;
  transition-property: background-color, color, padding-left;
  transition-duration: 160ms;
  transition-timing-function: ease;
}

.swiss-row:hover,
.swiss-post .blog-toc a:hover,
.swiss-post .blog-pager a:hover {
  padding-left: 12px;
  background: var(--invert-bg);
  color: var(--invert-fg);
}

.swiss-row span:first-child {
  color: var(--accent);
  font: 700 20px "Space Mono", ui-monospace, monospace;
}

.swiss-row span:nth-child(2) {
  color: var(--muted);
  font: 700 11px "Space Mono", ui-monospace, monospace;
}

.swiss-row strong {
  font-size: clamp(20px, 3vw, 34px);
  line-height: 1;
  text-transform: uppercase;
}

.swiss-post h1 {
  max-width: 820px;
  font: 900 clamp(44px, 8vw, 86px)/0.92 Archivo, ui-sans-serif, system-ui, sans-serif;
  text-transform: uppercase;
}

.swiss-meta {
  display: flex;
  flex-wrap: wrap;
  margin: 28px 0 34px;
  border: 1px solid var(--line-strong);
}

.swiss-meta span,
.swiss-meta strong {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding: 0 14px;
  border-right: 1px solid var(--line-strong);
  font: 700 11px "Space Mono", ui-monospace, monospace;
  text-transform: uppercase;
}

.swiss-meta span {
  color: var(--muted);
}

.swiss-post .blog-toc {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  border: 1px solid var(--line-strong);
}

.swiss-post .blog-toc div {
  grid-column: 1 / -1;
  padding: 12px;
}

.swiss-post .blog-toc a {
  min-height: 46px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-top: 1px solid var(--line);
}

.soft-index,
.soft-post {
  max-width: 600px;
  margin: 0 auto;
  padding: clamp(38px, 7vw, 68px) clamp(24px, 6vw, 44px) clamp(48px, 8vw, 80px);
}

.soft-dot {
  width: 18px;
  height: 18px;
  margin-bottom: 28px;
  border-radius: 999px;
  background: var(--accent);
}

.soft-index h1 {
  margin: 0;
  color: var(--fg);
  font: 600 clamp(38px, 7vw, 62px)/0.98 "Space Grotesk", ui-sans-serif, sans-serif;
  text-wrap: balance;
}

.soft-index p {
  margin: 18px 0 54px;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.55;
}

.soft-label {
  margin-bottom: 12px;
  color: var(--faint);
  font: 700 11px "Space Mono", ui-monospace, monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.soft-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18px;
  padding: 17px 0;
  border-top: 1px solid var(--line);
  color: var(--fg);
  text-decoration: none;
  transition-property: padding-left, color;
  transition-duration: 180ms;
  transition-timing-function: ease;
}

.soft-row:hover {
  padding-left: 8px;
  color: var(--accent);
}

.soft-row strong {
  font: 500 18px/1.3 "Space Grotesk", ui-sans-serif, sans-serif;
}

.soft-row span {
  color: var(--faint);
  font: 400 12px "Space Mono", ui-monospace, monospace;
}

.soft-post {
  max-width: 512px;
}

.soft-post h1 {
  font-family: "Space Grotesk", ui-sans-serif, sans-serif;
  font-weight: 600;
}

.soft-post .blog-toc {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  border: 0;
  padding: 0;
}

.soft-post .blog-toc div {
  width: 100%;
}

.soft-post .blog-toc a {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--panel);
}

.soft-post .blog-prose pre,
.soft-post .blog-relations > div {
  border-radius: 18px;
}

.field-index,
.field-post {
  max-width: 920px;
  margin: 0 auto;
  padding: clamp(38px, 7vw, 68px) clamp(24px, 6vw, 60px) clamp(48px, 8vw, 80px);
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 46px;
}

.field-rail,
.field-post-rail {
  color: var(--muted);
  border-right: 1px solid var(--line-strong);
  font: 500 11px "IBM Plex Mono", ui-monospace, monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.field-rail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 10px;
}

.field-main h1 {
  margin: 0;
  color: var(--fg);
  font: 400 clamp(50px, 9vw, 92px)/0.9 "Instrument Serif", Georgia, serif;
  text-wrap: balance;
}

.field-main p {
  max-width: 560px;
  margin: 18px 0 44px;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.55;
}

.field-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 18px;
  padding: 18px 0;
  border-top: 1px solid var(--line);
  color: var(--fg);
  text-decoration: none;
  transition-property: color, padding-left;
  transition-duration: 180ms;
  transition-timing-function: ease;
}

.field-row:hover {
  padding-left: 8px;
  color: var(--accent);
}

.field-row span {
  color: var(--faint);
  font: 500 12px "IBM Plex Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.field-row strong {
  font-size: clamp(20px, 3vw, 30px);
  line-height: 1.12;
}

.field-post {
  grid-template-columns: 158px minmax(0, 600px);
}

.field-post-rail {
  position: sticky;
  top: 28px;
  align-self: start;
  padding-right: 24px;
  border-right: 1px solid var(--line-strong);
}

.field-article h1 {
  font: 400 clamp(38px, 6vw, 64px)/1 "Instrument Serif", Georgia, serif;
}

.field-post .blog-toc {
  margin-top: 28px;
  border: 0;
  padding: 0;
}

.field-post .blog-toc div {
  font-family: "Instrument Serif", Georgia, serif;
  font-size: 19px;
  letter-spacing: 0;
  text-transform: none;
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: #171916;
    --panel: #20231f;
    --panel-soft: #2a2e29;
    --text: #f2f4ef;
    --muted: #b2b9ad;
    --faint: #879080;
    --accent: #6fd6c8;
    --accent-strong: #9be8df;
    --link: #9db5ff;
    --tag-bg: #443a16;
    --tag-text: #ffe08a;
    --code-bg: #2d332e;
    --shadow-border: 0 0 0 1px rgba(255, 255, 255, 0.08);
    --shadow-border-hover: 0 0 0 1px rgba(255, 255, 255, 0.13);
  }

  body {
    background: linear-gradient(180deg, #171916 0%, #1b1f21 100%);
  }

  html:not([data-theme='light']) body.site-theme-quiet-paper {
    color-scheme: dark;
    --bg: #16140f;
    --panel: #211d15;
    --fg: #ece7db;
    --muted: #9a9282;
    --faint: #6f685b;
    --line: #2b2618;
    --line-soft: #231f16;
    --line-strong: #3a3324;
    --accent: #db9d66;
    --tag-bg: #211d15;
    --tag-text: #db9d66;
    --code-bg: #0f0d09;
    --code-fg: #eae4d6;
  }

  html:not([data-theme='light']) body.site-theme-swiss-ledger {
    color-scheme: dark;
    --bg: #0d0d0c;
    --panel: #181613;
    --fg: #f2f0ea;
    --muted: #a3a099;
    --faint: #6b6862;
    --line: #282623;
    --line-strong: #35322d;
    --accent: #ff5a2c;
    --invert-bg: #f2f0ea;
    --invert-fg: #0d0d0c;
    --tag-bg: #f2f0ea;
    --tag-text: #0d0d0c;
  }

  html:not([data-theme='light']) body.site-theme-soft-focus {
    color-scheme: dark;
    --bg: #1a1815;
    --panel: #232019;
    --fg: #ece8e0;
    --muted: #a49a8c;
    --faint: #6e675b;
    --line: #2c281f;
    --line-strong: #3a352b;
    --accent: #e08a5f;
    --tag-bg: #232019;
    --tag-text: #e08a5f;
    --code-bg: #232019;
    --code-fg: #cfc8ba;
  }

  html:not([data-theme='light']) body.site-theme-field-notes {
    color-scheme: dark;
    --bg: #11151b;
    --panel: #1a212a;
    --fg: #e3e9f1;
    --muted: #8b96a6;
    --faint: #59616e;
    --line: #232b36;
    --line-strong: #333d4a;
    --accent: #7ea6d4;
    --tag-bg: #1a212a;
    --tag-text: #7ea6d4;
    --code-bg: #1a212a;
    --code-fg: #c2ccd9;
  }

  body.site-theme-quiet-paper,
  body.site-theme-terminal-ledger,
  body.site-theme-swiss-ledger,
  body.site-theme-soft-focus,
  body.site-theme-field-notes {
    background: var(--bg);
  }

  html:not([data-theme]) .theme-toggle-sun {
    display: none;
  }

  html:not([data-theme]) .theme-toggle-moon {
    display: inline;
  }

  .site-sidebar {
    background: rgba(32, 35, 31, 0.82);
  }

  .markdown-body img,
  .embed {
    outline: 1px solid rgba(255, 255, 255, 0.1);
  }

  .markdown-body tr + tr {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
}

@media (max-width: 860px) {
  .site-shell {
    grid-template-columns: 1fr;
    padding: 18px;
  }

  .site-sidebar {
    position: relative;
    top: 0;
    max-height: none;
  }

  .stats-grid,
  .relation-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .terminal-table-head,
  .terminal-row {
    grid-template-columns: 58px minmax(0, 1fr) 92px;
  }

  .terminal-table-head span:nth-child(2),
  .terminal-row span:nth-child(2) {
    display: none;
  }

  .terminal-post,
  .field-index,
  .field-post {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .terminal-rail,
  .field-post-rail {
    position: relative;
    top: 0;
  }

  .field-rail,
  .field-post-rail {
    padding: 0 0 18px;
    border-right: 0;
    border-bottom: 1px solid var(--line-strong);
  }

  .swiss-post .blog-toc,
  .blog-relations,
  .publish-form-section {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .site-shell {
    padding: 12px;
  }

  .page-header h1 {
    font-size: 2.2rem;
  }

  .stats-grid,
  .relation-grid {
    grid-template-columns: 1fr;
  }

  .blog-header {
    padding-inline: 18px;
  }

  .quiet-index,
  .quiet-post,
  .terminal-index,
  .terminal-post,
  .swiss-index,
  .swiss-post,
  .soft-index,
  .soft-post,
  .field-index,
  .field-post {
    padding-inline: 18px;
  }

  .quiet-row,
  .soft-row,
  .field-row {
    gap: 12px;
  }

  .swiss-row {
    grid-template-columns: 48px minmax(0, 1fr);
  }

  .swiss-row span:nth-child(2) {
    display: none;
  }

  .terminal-table-head,
  .terminal-row {
    grid-template-columns: 48px minmax(0, 1fr);
  }

  .terminal-table-head span:nth-child(4),
  .terminal-row span:nth-child(4) {
    display: none;
  }

  .blog-pager {
    grid-template-columns: 1fr;
  }

  .blog-pager a:last-child {
    text-align: left;
  }
}
`
}

export function siteScript() {
  return `(() => {
  const storageKey = 'forge-publish-theme'
  const root = document.documentElement
  const saved = localStorage.getItem(storageKey)
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved

  function setTheme(theme) {
    root.dataset.theme = theme
    localStorage.setItem(storageKey, theme)
  }

  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      setTheme(current === 'dark' ? 'light' : 'dark')
    })
  })

  const progress = document.querySelector('[data-progress]')
  if (!progress) return
  let ticking = false
  const updateProgress = () => {
    ticking = false
    const scrollRoot = document.scrollingElement || document.documentElement
    const max = scrollRoot.scrollHeight - scrollRoot.clientHeight
    const value = max > 0 ? Math.min(1, scrollRoot.scrollTop / max) : 0
    progress.style.setProperty('--progress', value)
  }
  window.addEventListener('scroll', () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(updateProgress)
  }, { passive: true })
  updateProgress()
})()
`
}
