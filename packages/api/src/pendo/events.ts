import type { PendoProperties, PendoRouteContext, PendoRouteEvent, PendoUser } from './track';
import { isPendoRecord } from './track';

/** Resources whose sharing dialog saves through the permissions route. */
const SHARED_RESOURCES = new Set(['agent', 'remoteAgent', 'promptGroup', 'skill', 'mcpServer']);

const record = (value: unknown): Record<string, unknown> | undefined =>
  isPendoRecord(value) ? value : undefined;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const count = (value: unknown): number | undefined =>
  Array.isArray(value) ? value.length : undefined;

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const flag = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const input = ({ req }: PendoRouteContext): Record<string, unknown> => record(req.body) ?? {};

/** The signed-in user, or the user object an auth handler answered with. */
const sessionUser = ({ req, body }: PendoRouteContext): PendoUser | undefined => {
  if (req.user) {
    return req.user;
  }
  const user = record(body?.user);
  if (!user) {
    return undefined;
  }
  return {
    id: text(user.id) ?? (user._id != null ? String(user._id) : undefined),
    tenantId: text(user.tenantId),
    orgId: text(user.orgId),
  };
};

const issuedSession = ({ body }: PendoRouteContext): boolean => typeof body?.token === 'string';

const fileProperties = ({ req }: PendoRouteContext): PendoProperties => ({
  file_type: req.file?.mimetype,
  size_bytes: req.file?.size,
});

/**
 * Server-side Pendo track events that follow a route's successful response, keyed by the
 * registered track type name. Names are sent verbatim and must match Pendo exactly.
 */
export const pendoRouteEvents: Record<string, PendoRouteEvent> = {
  'Conversation forked': {
    properties: (context) => {
      const body = input(context);
      return {
        fork_option: text(body.option),
        split_at_target: body.splitAtTarget === true,
        exclude_files: body.excludeFiles === true,
        message_count: count(context.body?.messages),
      };
    },
  },
  'Sharing permissions updated': {
    when: ({ req }) => SHARED_RESOURCES.has(req.params.resourceType),
    properties: (context) => {
      const body = input(context);
      return {
        resource_type: context.req.params.resourceType,
        updated_count: count(body.updated),
        removed_count: count(body.removed),
        is_public: flag(body.public),
      };
    },
  },
  'Scheduled run started': {
    when: ({ body }) => body?.status === 'started',
    properties: () => ({ trigger: 'manual' }),
  },
  'Skill created': {
    key: ({ body }) => text(body?._id) ?? text(body?.id),
    properties: ({ body }) => ({
      file_count: num(record(body?._importSummary)?.filesSucceeded),
    }),
  },
  'Project file added': {},
  'Project created': {
    properties: (context) => {
      const body = input(context);
      return {
        has_description: text(body.description) != null,
        has_instructions: text(body.instructions) != null,
      };
    },
  },
  'Schedule created': {
    key: ({ body }) => text(body?.id),
    properties: ({ body }) => ({
      frequency: text(record(body?.cadence)?.frequency),
      file_count: count(body?.file_ids),
      has_project: text(body?.chatProjectId) != null,
    }),
  },
  'Signed in': {
    when: issuedSession,
    user: sessionUser,
  },
  'Channel identity linked': {
    when: ({ body }) => body?.ok === true,
    properties: () => ({ channel_type: 'slack' }),
  },
  'File uploaded': {
    stream: true,
    when: ({ body }) => text(body?.file_id) != null,
    properties: (context) => {
      const body = input(context);
      return {
        ...fileProperties(context),
        endpoint: text(body.endpoint),
        tool_resource: text(body.tool_resource),
      };
    },
  },
  'Password reset completed': {
    user: (context) => ({ id: text(input(context).userId) }),
  },
  'Feedback saved': {
    when: (context) => record(input(context).feedback) != null,
    properties: (context) => {
      const feedback = record(input(context).feedback);
      return {
        rating: text(feedback?.rating),
        tag: text(feedback?.tag),
        has_comment: text(feedback?.text) != null,
      };
    },
  },
  'Shared link created': {
    properties: (context) => {
      const body = input(context);
      return {
        snapshot_files: body.snapshotFiles !== false,
        has_target_message: text(body.targetMessageId) != null,
      };
    },
  },
  'Conversations imported': {
    properties: fileProperties,
  },
  'Shared conversation continued': {
    properties: (context) => ({
      has_target_message: typeof input(context).targetMessageIndex === 'number',
    }),
  },
  'Agent created': {
    properties: ({ body }) => ({
      provider: text(body?.provider),
      model: text(body?.model),
      tool_count: count(body?.tools),
      category: text(body?.category),
    }),
  },
  'Prompt created': {
    properties: (context) => {
      const body = input(context);
      const group = record(body.group);
      return {
        prompt_type: text(record(body.prompt)?.type),
        category: text(group?.category),
        has_command: text(group?.command) != null,
      };
    },
  },
  'Agent channel created': {
    properties: ({ body }) => ({
      channel_type: text(body?.type),
      credential_mode: text(body?.credentialMode),
    }),
  },
  'MCP server added': {
    properties: (context) => ({
      transport: text(record(input(context).config)?.type),
    }),
  },
  'Memory saved': {
    properties: (context) => ({
      scope: text(input(context).agentId) != null ? 'agent' : 'global',
    }),
  },
  'API key created': {
    properties: (context) => ({
      has_expiry: input(context).expiresAt != null,
    }),
  },
  'Response review decision submitted': {
    key: ({ req, body }) => {
      const action = text(body?.actionId);
      return action != null ? `${req.params.id}:${action}` : undefined;
    },
    properties: (context) => {
      const body = input(context);
      return {
        review_type: body.answer != null || body.answers != null ? 'answer' : 'approval',
        decision_count: count(body.decisions),
      };
    },
  },
  'Code environment paired': {
    properties: (context) => ({
      control_plane: text(input(context).controlPlaneId),
    }),
  },
  'Two-factor authentication enabled': {
    when: issuedSession,
    user: sessionUser,
  },
  'Account deleted': {},
};
