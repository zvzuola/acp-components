import React from 'react';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCopy } from '../../hooks/useCopy';
import { useI18n } from '../../i18n';
import styles from './markdown.module.scss';

// ---------------------------------------------------------------------------
// Hast helpers - extract raw text from a code block for the copy button.
// react-markdown passes the source hast `node` to custom components; we walk
// it to recover the code text without relying on DOM textContent (more robust
// against re-render timing and streaming updates).
// ---------------------------------------------------------------------------

function hastText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; value?: string; children?: unknown[] };
  if (n.type === 'text' && typeof n.value === 'string') return n.value;
  if (Array.isArray(n.children)) return n.children.map(hastText).join('');
  return '';
}

/** Copy button rendered inside a fenced code-block header. */
function CodeCopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopy();
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={styles.acpMarkdownCodeCopyBtn}
      onClick={() => void copy(text)}
      aria-label={t('markdown.copyCode')}
      title={t('markdown.copyCode')}
    >
      {copied ? <CheckOutlined /> : <CopyOutlined />}
    </button>
  );
}

const markdownComponents: Components = {
  pre({ children, node, ...props }) {
    const codeNode = (node as Record<string, unknown> | undefined)?.children as
      | Array<{ properties?: { className?: string[] } }>
      | undefined;
    const cls = codeNode?.[0]?.properties?.className;
    const langClass = Array.isArray(cls) ? cls.find((c: string) => c.startsWith('language-')) : undefined;
    const language = langClass?.replace('language-', '');

    const codeText = hastText(node);
    if (language) {
      return (
        <div className={styles.acpMarkdownCodeBlock}>
          <div className={styles.acpMarkdownCodeHeader}>
            <span className={styles.acpMarkdownCodeLang}>{language}</span>
            <CodeCopyButton text={codeText} />
          </div>
          <pre {...props}>{children}</pre>
        </div>
      );
    }
    // Unspecified-language fenced blocks still get a copy affordance.
    return (
      <div className={styles.acpMarkdownCodeBlock}>
        <div className={styles.acpMarkdownCodeHeader}>
          <span className={styles.acpMarkdownCodeLang} />
          <CodeCopyButton text={codeText} />
        </div>
        <pre {...props}>{children}</pre>
      </div>
    );
  },
  code({ className, children, ...props }) {
    return <code className={className} {...props}>{children}</code>;
  },
  a({ href, children, ...props }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className={styles.acpMarkdownTable}>
        <table>{children}</table>
      </div>
    );
  },
};

export interface MarkdownProps {
  children: string;
  className?: string;
}

export const Markdown = React.memo(function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={`${styles.acpMarkdown}${className ? ` ${className}` : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
