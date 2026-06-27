import { describe, it, expect } from 'vitest';
import { detectLanguage } from './fileViewer';

describe('detectLanguage', () => {
  it('maps common web/extensions to their language', () => {
    const cases: Record<string, string> = {
      '/a/b/app.ts': 'typescript',
      'component.tsx': 'typescript',
      'lib.mts': 'typescript',
      'index.js': 'javascript',
      'view.jsx': 'javascript',
      'style.css': 'css',
      'theme.scss': 'scss',
      'page.html': 'html',
      'data.json': 'json',
      'config.yaml': 'yaml',
      'config.yml': 'yaml',
      'notes.md': 'markdown',
      'readme.mdx': 'markdown',
      'notes.txt': 'plaintext',
      'run.sh': 'shell',
      'deploy.bat': 'bat',
      'script.ps1': 'powershell',
    };
    for (const [path, lang] of Object.entries(cases)) {
      expect(detectLanguage(path), `path: ${path}`).toBe(lang);
    }
  });

  it('maps backend / systems languages', () => {
    expect(detectLanguage('main.py')).toBe('python');
    expect(detectLanguage('app.pyw')).toBe('python');
    expect(detectLanguage('Gemfile.rb')).toBe('ruby');
    expect(detectLanguage('main.rs')).toBe('rust');
    expect(detectLanguage('main.go')).toBe('go');
    expect(detectLanguage('Main.java')).toBe('java');
    expect(detectLanguage('App.kt')).toBe('kotlin');
    expect(detectLanguage('main.c')).toBe('c');
    expect(detectLanguage('header.h')).toBe('c');
    expect(detectLanguage('impl.cpp')).toBe('cpp');
    expect(detectLanguage('Program.cs')).toBe('csharp');
    expect(detectLanguage('query.sql')).toBe('sql');
    expect(detectLanguage('schema.proto')).toBe('protobuf');
    expect(detectLanguage('api.graphql')).toBe('graphql');
  });

  it('is case-insensitive on extensions', () => {
    expect(detectLanguage('A.TSX')).toBe('typescript');
    expect(detectLanguage('B.PY')).toBe('python');
    expect(detectLanguage('C.MD')).toBe('markdown');
  });

  it('maps special filenames regardless of extension', () => {
    expect(detectLanguage('Dockerfile')).toBe('dockerfile');
    expect(detectLanguage('Makefile')).toBe('makefile');
    expect(detectLanguage('CMakeLists.txt')).toBe('cmake');
    expect(detectLanguage('.gitignore')).toBe('ini');
    expect(detectLanguage('.editorconfig')).toBe('ini');
    expect(detectLanguage('Jenkinsfile')).toBe('groovy');
  });

  it('handles Windows backslash paths', () => {
    expect(detectLanguage('C:\\proj\\src\\index.ts')).toBe('typescript');
    expect(detectLanguage('C:\\proj\\Dockerfile')).toBe('dockerfile');
  });

  it('falls back to plaintext for unknown extensions', () => {
    expect(detectLanguage('weird.xyz')).toBe('plaintext');
    expect(detectLanguage('no-extension-file')).toBe('plaintext');
    expect(detectLanguage('')).toBe('plaintext');
  });

  it('uses the last extension for double-dot filenames', () => {
    expect(detectLanguage('app.test.ts')).toBe('typescript');
    expect(detectLanguage('spec.bundle.js')).toBe('javascript');
  });
});
