import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './markdown.module.scss';

const markdownComponents: Components = {
  pre({ children, node, ...props }) {
    const codeNode = (node as Record<string, unknown> | undefined)?.children as
      | Array<{ properties?: { className?: string[] } }>
      | undefined;
    const cls = codeNode?.[0]?.properties?.className;
    const langClass = Array.isArray(cls) ? cls.find((c: string) => c.startsWith('language-')) : undefined;
    const language = langClass?.replace('language-', '');

    if (language) {
      return (
        <div className={styles.acpMarkdownCodeBlock}>
          <div className={styles.acpMarkdownCodeHeader}>
            <span>{language}</span>
          </div>
          <pre {...props}>{children}</pre>
        </div>
      );
    }
    return <pre {...props}>{children}</pre>;
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

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={`${styles.acpMarkdown}${className ? ` ${className}` : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
