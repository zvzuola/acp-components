import React, { useMemo } from 'react';
import { FileTextOutlined, LinkOutlined } from '@ant-design/icons';
import type { Message } from '@acp-components/core';
import type { ContentBlock } from '@agentclientprotocol/sdk';
import { useI18n } from '../../i18n';
import { Markdown } from '../markdown';
import { UserMessageActions } from './UserMessageActions';
import styles from './user-message.module.scss';

export interface UserMessageProps {
  message: Message;
  onEdit?: (text: string) => void;
}

interface ParsedContent {
  textBlocks: ContentBlock[];
  attachmentBlocks: ContentBlock[];
  textContent: string;
}

function parseContent(message: Message): ParsedContent {
  const textBlocks: ContentBlock[] = [];
  const attachmentBlocks: ContentBlock[] = [];
  const texts: string[] = [];

  for (const part of message.parts) {
    if (part.type === 'content') {
      for (const block of part.content) {
        if ('annotations' in block && block.annotations != null) continue;
        if (block.type === 'text') {
          textBlocks.push(block);
          texts.push((block as { text: string }).text);
        } else {
          attachmentBlocks.push(block);
        }
      }
    }
  }

  return { textBlocks, attachmentBlocks, textContent: texts.join('\n') };
}

function renderAttachment(block: ContentBlock) {
  switch (block.type) {
    case 'image': {
      const img = block as { data: string; mimeType: string; uri?: string | null };
      const src = `data:${img.mimeType};base64,${img.data}`;
      return (
        <div key={img.uri || img.data.slice(0, 20)} className={`${styles.acpUserMessageAttachment} ${styles.acpUserMessageAttachmentImage}`}>
          <img src={src} alt={img.uri || 'image'} />
        </div>
      );
    }
    case 'resource': {
      const res = block as { resource: { uri: string; text?: string; mimeType?: string } };
      const rawName = res.resource.uri.split('/').pop() || res.resource.uri;
      const fileName = decodeURIComponent(rawName);
      return (
        <div key={res.resource.uri} className={styles.acpUserMessageAttachment}>
          <span><FileTextOutlined /></span>
          <span>{fileName}</span>
        </div>
      );
    }
    case 'resource_link': {
      const link = block as { uri: string; name: string };
      return (
        <div key={link.uri} className={styles.acpUserMessageAttachment}>
          <span><LinkOutlined /></span>
          <span>{link.name || link.uri}</span>
        </div>
      );
    }
    default:
      return null;
  }
}

export const UserMessage = React.memo(function UserMessage({ message, onEdit }: UserMessageProps) {
  const { t } = useI18n();
  const { textBlocks, attachmentBlocks, textContent } = useMemo(
    () => parseContent(message),
    [message]
  );

  return (
    <div className={styles.acpUserMessage}>
      <div className={styles.acpUserMessageBubble}>
        {attachmentBlocks.length > 0 && (
          <div className={styles.acpUserMessageAttachments}>
            {attachmentBlocks.map(renderAttachment)}
          </div>
        )}
        {textBlocks.map((block, i) => {
          const text = (block as { text: string }).text;
          return <Markdown key={i}>{text}</Markdown>;
        })}
      </div>
      {onEdit && textContent && (
        <UserMessageActions textContent={textContent} onEdit={onEdit} />
      )}
      {message.stopReason && (
        <div className={styles.acpUserMessageStopReason}>{t(`stopReason.${message.stopReason}`)}</div>
      )}
    </div>
  );
});
