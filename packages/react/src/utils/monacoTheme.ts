/**
 * Maps ACP theme names to Monaco editor built-in themes.
 */
export function getMonacoTheme(theme: string): string {
  switch (theme) {
    case 'light':
      return 'vs';
    case 'dark':
    default:
      return 'vs-dark';
  }
}
