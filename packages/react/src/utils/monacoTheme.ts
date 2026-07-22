/**
 * Maps ACP theme names to custom Monaco editor themes whose background
 * matches the main panel (`--acp-color-bg-primary`).
 *
 * Built-in Monaco themes (`vs-dark` = #1e1e1e, `vs` = #ffffff) disagree with
 * the ACP panel backgrounds (#0a0a0a dark / #ffffff light), so the editor
 * looked lighter than the surrounding chrome. The custom themes below align
 * the editor canvas with the panel by reusing the exact ACP hex values.
 */
import type * as Monaco from 'monaco-editor';

// ACP theme token colors, mirrored from styles/themes.scss so the editor
// canvas tracks the design system without a runtime CSS-variable lookup
// (Monaco colors must be resolved hex at defineTheme time).
const ACP_DARK = {
  bg: '#0a0a0a',
  fg: '#c9c9c9',
  comment: '#6a6a6a',
  keyword: '#d4d4d4',
  number: '#e5e5e5',
  string: '#a3e3c9',
  type: '#7dd3c0',
  function: '#e5e5e5',
  variable: '#c9c9c9',
  constant: '#e5e5e5',
  tag: '#c9c9c9',
  attributeName: '#8a8a8a',
  attributeValue: '#a3e3c9',
};

const ACP_LIGHT = {
  bg: '#ffffff',
  fg: '#3d3d3d',
  comment: '#8f8f8f',
  keyword: '#3d3d3d',
  number: '#1a1a1a',
  string: '#0a8754',
  type: '#0d9488',
  function: '#1a1a1a',
  variable: '#3d3d3d',
  constant: '#1a1a1a',
  tag: '#3d3d3d',
  attributeName: '#6a6a6a',
  attributeValue: '#0a8754',
};

const DARK_THEME: Monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: ACP_DARK.comment },
    { token: 'keyword', foreground: ACP_DARK.keyword },
    { token: 'number', foreground: ACP_DARK.number },
    { token: 'string', foreground: ACP_DARK.string },
    { token: 'type', foreground: ACP_DARK.type },
    { token: 'function', foreground: ACP_DARK.function },
    { token: 'variable', foreground: ACP_DARK.variable },
    { token: 'constant', foreground: ACP_DARK.constant },
    { token: 'tag', foreground: ACP_DARK.tag },
    { token: 'attribute.name', foreground: ACP_DARK.attributeName },
    { token: 'attribute.value', foreground: ACP_DARK.attributeValue },
  ],
  colors: {
    'editor.background': ACP_DARK.bg,
    'editor.foreground': ACP_DARK.fg,
    'editorLineNumber.foreground': ACP_DARK.comment,
    'editorLineNumber.activeForeground': ACP_DARK.fg,
    'editor.selectionBackground': '#FFFFFF14',
    'editor.inactiveSelectionBackground': '#FFFFFF0A',
    'editor.lineHighlightBackground': '#FFFFFF08',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': ACP_DARK.fg,
    'editorIndentGuide.background': '#FFFFFF0F',
    'editorIndentGuide.activeBackground': '#FFFFFF1F',
    'editor.selectionHighlightBackground': '#FFFFFF1F',
    'editor.wordHighlightBackground': '#FFFFFF14',
    'editor.wordHighlightStrongBackground': '#FFFFFF14',
    'editor.findMatchBackground': '#264F78',
    'editor.findMatchHighlightBackground': '#264F78A0',
    'editor.rangeHighlightBackground': '#FFFFFF0A',
    'editorHoverWidget.background': ACP_DARK.bg,
    'editorHoverWidget.border': '#FFFFFF26',
    'editorBracketMatch.background': '#FFFFFF14',
    'editorBracketMatch.border': '#FFFFFF40',
  },
};

const LIGHT_THEME: Monaco.editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: ACP_LIGHT.comment },
    { token: 'keyword', foreground: ACP_LIGHT.keyword },
    { token: 'number', foreground: ACP_LIGHT.number },
    { token: 'string', foreground: ACP_LIGHT.string },
    { token: 'type', foreground: ACP_LIGHT.type },
    { token: 'function', foreground: ACP_LIGHT.function },
    { token: 'variable', foreground: ACP_LIGHT.variable },
    { token: 'constant', foreground: ACP_LIGHT.constant },
    { token: 'tag', foreground: ACP_LIGHT.tag },
    { token: 'attribute.name', foreground: ACP_LIGHT.attributeName },
    { token: 'attribute.value', foreground: ACP_LIGHT.attributeValue },
  ],
  colors: {
    'editor.background': ACP_LIGHT.bg,
    'editor.foreground': ACP_LIGHT.fg,
    'editorLineNumber.foreground': ACP_LIGHT.comment,
    'editorLineNumber.activeForeground': ACP_LIGHT.fg,
    'editor.selectionBackground': '#0000000F',
    'editor.inactiveSelectionBackground': '#00000008',
    'editor.lineHighlightBackground': '#00000008',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': ACP_LIGHT.fg,
    'editorIndentGuide.background': '#0000000F',
    'editorIndentGuide.activeBackground': '#0000001F',
    'editor.selectionHighlightBackground': '#0000001F',
    'editor.wordHighlightBackground': '#0000000F',
    'editor.wordHighlightStrongBackground': '#0000000F',
    'editor.findMatchBackground': '#0d9488',
    'editor.findMatchHighlightBackground': '#0d9488A0',
    'editor.rangeHighlightBackground': '#0000000A',
    'editorHoverWidget.background': ACP_LIGHT.bg,
    'editorHoverWidget.border': '#00000024',
    'editorBracketMatch.background': '#0000000F',
    'editorBracketMatch.border': '#00000040',
  },
};

export const ACP_MONACO_THEME_DARK = 'acp-dark';
export const ACP_MONACO_THEME_LIGHT = 'acp-light';

/**
 * Registers the custom ACP Monaco themes once per Monaco runtime. Safe to
 * call multiple times; Monaco overwrites the prior registration each time.
 */
export function defineMonacoThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme(ACP_MONACO_THEME_DARK, DARK_THEME);
  monaco.editor.defineTheme(ACP_MONACO_THEME_LIGHT, LIGHT_THEME);
}

/**
 * Returns the custom ACP Monaco theme name for the given ACP theme.
 */
export function getMonacoTheme(theme: string): string {
  switch (theme) {
    case 'light':
      return ACP_MONACO_THEME_LIGHT;
    case 'dark':
    default:
      return ACP_MONACO_THEME_DARK;
  }
}
