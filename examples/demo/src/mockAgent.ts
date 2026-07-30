import {
  agent,
  methods,
  type AgentConnection,
  type AnyMessage,
  type ContentBlock,
  type SessionConfigOption,
  type SessionInfo,
  type SessionUpdate,
  type Stream,
} from '@agentclientprotocol/sdk';
import type { AcpTransport } from '@acp-components/core';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const text = (value: string): ContentBlock => ({
  type: 'text',
  text: value,
  annotations: null,
  _meta: null,
});

const configOptions: SessionConfigOption[] = [
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: 'demo-fast',
    options: [
      { value: 'demo-fast', name: 'Demo Fast' },
      { value: 'demo-deep', name: 'Demo Deep' },
    ],
  },
  {
    id: 'mode',
    name: 'Mode',
    category: 'mode',
    type: 'select',
    currentValue: 'code',
    options: [
      { value: 'code', name: 'Code' },
      { value: 'ask', name: 'Ask' },
    ],
  },
];

function createStreamPair(): { client: Stream; agent: Stream } {
  const clientToAgent = new TransformStream<AnyMessage, AnyMessage>();
  const agentToClient = new TransformStream<AnyMessage, AnyMessage>();

  return {
    client: {
      writable: clientToAgent.writable,
      readable: agentToClient.readable,
    },
    agent: {
      writable: agentToClient.writable,
      readable: clientToAgent.readable,
    },
  };
}

function promptText(prompt: ContentBlock[]): string {
  return prompt
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

export class MockAcpTransport implements AcpTransport {
  private connection: AgentConnection | null = null;
  private sessionCounter = 0;
  private sessions = new Map<string, SessionInfo>();
  private sessionConfig = new Map<string, SessionConfigOption[]>();

  async connect(): Promise<Stream> {
    const streams = createStreamPair();
    const app = agent({ name: 'acp-components-demo-agent' })
      .onRequest(methods.agent.initialize, ({ params }) => ({
        protocolVersion: params.protocolVersion,
        agentInfo: { name: 'ACP Demo Agent', version: '1.0.0' },
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: true, embeddedContext: true },
          sessionCapabilities: {
            list: {},
            delete: {},
          },
        },
        authMethods: [],
      }))
      .onRequest(methods.agent.session.new, ({ params }) => {
        const sessionId = `demo-session-${++this.sessionCounter}`;
        this.sessions.set(sessionId, {
          sessionId,
          cwd: params.cwd,
          title: 'New demo session',
          updatedAt: new Date().toISOString(),
        });
        this.sessionConfig.set(sessionId, structuredClone(configOptions));
        return { sessionId, configOptions: structuredClone(configOptions) };
      })
      .onRequest(methods.agent.session.list, ({ params }) => ({
        sessions: Array.from(this.sessions.values()).filter(
          (session) => !params.cwd || session.cwd === params.cwd,
        ),
      }))
      .onRequest(methods.agent.session.load, () => ({
        configOptions: structuredClone(configOptions),
      }))
      .onRequest(methods.agent.session.setConfigOption, ({ params }) => {
        const options = this.sessionConfig.get(params.sessionId) ?? structuredClone(configOptions);
        const next = options.map((option) =>
          option.id === params.configId
            ? { ...option, currentValue: params.value } as SessionConfigOption
            : option,
        );
        this.sessionConfig.set(params.sessionId, next);
        return { configOptions: next };
      })
      .onRequest(methods.agent.session.close, ({ params }) => {
        this.sessions.delete(params.sessionId);
        this.sessionConfig.delete(params.sessionId);
        return {};
      })
      .onRequest(methods.agent.session.delete, ({ params }) => {
        this.sessions.delete(params.sessionId);
        this.sessionConfig.delete(params.sessionId);
        return {};
      })
      .onRequest(methods.agent.authenticate, () => ({}))
      .onNotification(methods.agent.session.cancel, () => {})
      .onRequest(methods.agent.session.prompt, async ({ params, client, signal }) => {
        const messageId = `agent-${Date.now()}`;
        const toolCallId = `tool-${Date.now()}`;
        const input = promptText(params.prompt);
        const sendUpdate = (update: SessionUpdate) =>
          client.notify(methods.client.session.update, { sessionId: params.sessionId, update });

        await sendUpdate({
          sessionUpdate: 'session_info_update',
          title: input.slice(0, 48) || 'ACP component tour',
          updatedAt: new Date().toISOString(),
        });
        await sendUpdate({
          sessionUpdate: 'plan',
          entries: [
            { content: 'Inspect the component architecture', priority: 'high', status: 'completed' },
            { content: 'Demonstrate an ACP tool call', priority: 'high', status: 'in_progress' },
            { content: 'Stream the final response', priority: 'medium', status: 'pending' },
          ],
        });
        await sendUpdate({
          sessionUpdate: 'agent_thought_chunk',
          messageId: `thought-${messageId}`,
          content: text('I will use the real ACP update channel so every UI state is exercised.'),
        });
        await wait(180);
        if (signal.aborted) return { stopReason: 'cancelled' };

        await sendUpdate({
          sessionUpdate: 'tool_call',
          toolCallId,
          title: 'Read WorkbenchShell source',
          kind: 'read',
          status: 'in_progress',
          locations: [{ path: '/demo/acp-components/packages/react/src/WorkbenchShell.tsx', line: 1 }],
          rawInput: { path: 'packages/react/src/WorkbenchShell.tsx' },
        });
        await wait(240);
        if (signal.aborted) return { stopReason: 'cancelled' };

        const permission = await client.request(methods.client.session.requestPermission, {
          sessionId: params.sessionId,
          toolCall: {
            toolCallId,
            title: 'Preview a component update',
            kind: 'edit',
            rawInput: { path: 'packages/react/src/WorkbenchShell.tsx' },
          },
          options: [
            { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
          ],
        });

        const allowed = permission.outcome.outcome === 'selected' && permission.outcome.optionId === 'allow';
        await sendUpdate({
          sessionUpdate: 'tool_call_update',
          toolCallId,
          status: allowed ? 'completed' : 'failed',
          title: allowed ? 'Component update previewed' : 'Component update skipped',
          content: allowed
            ? [{
                type: 'diff',
                path: '/demo/acp-components/packages/react/src/WorkbenchShell.tsx',
                oldText: "const title = 'Agent workspace';\n",
                newText: "const title = 'ACP agent workspace';\n",
              }]
            : [{ type: 'content', content: text('The demo respected your permission choice.') }],
        });

        const chunks = [
          'This browser-only demo is connected through a real in-memory **ACP transport**. ',
          'The workbench supports streaming messages, plans, tool calls, permissions, files, and diffs.\n\n',
          'Try another prompt, split the session, open the Files panel, or switch themes in Settings.',
        ];
        for (const chunk of chunks) {
          await sendUpdate({
            sessionUpdate: 'agent_message_chunk',
            messageId,
            content: text(chunk),
          });
          await wait(140);
        }
        await sendUpdate({ sessionUpdate: 'usage_update', used: 1840, size: 128000 });
        await sendUpdate({
          sessionUpdate: 'plan',
          entries: [
            { content: 'Inspect the component architecture', priority: 'high', status: 'completed' },
            { content: 'Demonstrate an ACP tool call', priority: 'high', status: 'completed' },
            { content: 'Stream the final response', priority: 'medium', status: 'completed' },
          ],
        });
        return { stopReason: 'end_turn' };
      })
      .onRequest(
        '_acp/skills/list',
        { parse: (params: unknown) => params as Record<string, unknown> },
        () => ({
          skills: [
            { id: 'code-review', name: 'Code Review', description: 'Review changes for bugs and regressions.' },
            { id: 'component-design', name: 'Component Design', description: 'Design composable agent interfaces.' },
            { id: 'release-notes', name: 'Release Notes', description: 'Turn changes into a clear release summary.' },
          ],
        }),
      );

    this.connection = app.connect(streams.agent);
    return streams.client;
  }

  disconnect(): void {
    this.connection?.close();
    this.connection = null;
  }
}
