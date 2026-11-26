import type { RequestHandler } from 'express';
import type { PendoTrackDetails } from './middleware';
import { pendoTrack } from './middleware';

/** Event names registered in Pendo. They are matched exactly, so never reword them. */
export const PendoEvent = {
  signedIn: 'Signed in',
  emailVerified: 'Email verified',
  accountRegistered: 'Account registered',
  passwordResetCompleted: 'Password reset completed',
  twoFactorEnabled: 'Two-factor enabled',
  accountDeleted: 'Account deleted',
  fileUploaded: 'File uploaded',
  passkeyRegistered: 'Passkey registered',
  conversationsImported: 'Conversations imported',
  responseGenerated: 'Response generated',
  responseFeedbackSaved: 'Response feedback saved',
  pausedRunResumed: 'Paused run resumed',
  conversationArchived: 'Conversation archived',
  conversationDuplicated: 'Conversation duplicated',
  bookmarkCreated: 'Bookmark created',
  chatAssignedToProject: 'Chat assigned to project',
  sharedConversationContinued: 'Shared conversation continued',
  agentChannelCreated: 'Agent channel created',
  backgroundReviewSubmitted: 'Background response review submitted',
  promptCreated: 'Prompt created',
  skillImported: 'Skill imported',
  scheduleCreated: 'Schedule created',
  scheduledRunStarted: 'Scheduled run started',
  channelIdentityLinked: 'Channel identity linked',
  mcpServerAdded: 'MCP server added',
  agentApiKeyCreated: 'Agent API key created',
  providerKeySaved: 'Provider key saved',
  rolePermissionsUpdated: 'Role permissions updated',
  conversationForked: 'Conversation forked',
  resourceAccessUpdated: 'Resource access updated',
  projectCreated: 'Project created',
  projectFileAdded: 'Project file added',
  skillCreated: 'Skill created',
  slackConnectStarted: 'Slack workspace connect started',
  memorySaved: 'Memory saved',
  conversationDeleted: 'Conversation deleted',
  sharedLinkCreated: 'Shared link created',
  agentCreated: 'Agent created',
} as const;

const field = (value: unknown, key: string): unknown =>
  value != null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** The account behind a response that issued a session (`{ token, user }`). */
function sessionUser(body: unknown): PendoTrackDetails | null {
  const user = field(body, 'user');
  const visitorId = text(field(user, 'id'));
  if (field(body, 'token') == null || !visitorId) {
    return null;
  }
  return { visitorId, accountId: text(field(user, 'tenantId')) };
}

export const trackSignedIn = (method: string): RequestHandler =>
  pendoTrack(PendoEvent.signedIn, (_req, body) => {
    const user = sessionUser(body);
    return user && { ...user, properties: { method } };
  });

export const trackPasswordResetCompleted = (): RequestHandler =>
  pendoTrack(PendoEvent.passwordResetCompleted, (req) => ({
    visitorId: text(field(req.body, 'userId')),
  }));

export const trackTwoFactorEnabled = (flow: 'opt_in' | 'required'): RequestHandler =>
  pendoTrack(PendoEvent.twoFactorEnabled, (_req, body) => ({
    ...sessionUser(body),
    properties: { flow },
  }));

export const trackPasskeyRegistered = (): RequestHandler =>
  pendoTrack(PendoEvent.passkeyRegistered);

/** Streamed (SSE) uploads send no JSON body, so only JSON responses are tracked. */
export const trackFileUploaded = (): RequestHandler =>
  pendoTrack(PendoEvent.fileUploaded, (req, body) => {
    if (!text(field(body, 'file_id'))) {
      return null;
    }
    return {
      properties: {
        endpoint: text(field(req.body, 'endpoint')),
        tool_resource: text(field(req.body, 'tool_resource')),
        file_type: text(field(body, 'type')),
        bytes: count(field(body, 'bytes')),
      },
    };
  });

export const trackConversationsImported = (): RequestHandler =>
  pendoTrack(PendoEvent.conversationsImported);

/** Clearing a rating sends `feedback: null`, which is not a saved rating. */
export const trackResponseFeedbackSaved = (): RequestHandler =>
  pendoTrack(PendoEvent.responseFeedbackSaved, (_req, body) => {
    const feedback = field(body, 'feedback');
    if (feedback == null) {
      return null;
    }
    return {
      properties: {
        rating: text(field(feedback, 'rating')),
        tag: text(field(feedback, 'tag')),
      },
    };
  });

export const trackPausedRunResumed = (): RequestHandler =>
  pendoTrack(PendoEvent.pausedRunResumed, (req, body) =>
    field(body, 'status') === 'resuming'
      ? { properties: { endpoint: text(field(req.body, 'endpoint')) } }
      : null,
  );

/** The same route unarchives, so only `isArchived: true` counts. */
export const trackConversationArchived = (): RequestHandler =>
  pendoTrack(PendoEvent.conversationArchived, (req) =>
    field(field(req.body, 'arg'), 'isArchived') === true ? {} : null,
  );

export const trackConversationDuplicated = (): RequestHandler =>
  pendoTrack(PendoEvent.conversationDuplicated);

export const trackConversationForked = (): RequestHandler =>
  pendoTrack(PendoEvent.conversationForked, (req) => ({
    properties: { option: text(field(req.body, 'option')) },
  }));

/** Only a single-conversation delete counts. Bulk deletes carry no `conversationId`. */
export const trackConversationDeleted = (): RequestHandler =>
  pendoTrack(PendoEvent.conversationDeleted, (req) => {
    const arg = field(req.body, 'arg');
    if (!text(field(arg, 'conversationId'))) {
      return null;
    }
    return { properties: { source: text(field(arg, 'source')) } };
  });

export const trackBookmarkCreated = (): RequestHandler => pendoTrack(PendoEvent.bookmarkCreated);

/** The same route removes a chat from its project with `projectId: null`. */
export const trackChatAssignedToProject = (): RequestHandler =>
  pendoTrack(PendoEvent.chatAssignedToProject, (req) =>
    text(field(req.body, 'projectId')) ? {} : null,
  );

export const trackSharedConversationContinued = (): RequestHandler =>
  pendoTrack(PendoEvent.sharedConversationContinued);

export const trackAgentChannelCreated = (): RequestHandler =>
  pendoTrack(PendoEvent.agentChannelCreated, (req) => ({
    properties: {
      channel_type: text(field(req.body, 'type')),
      credential_mode: text(field(req.body, 'credentialMode')),
    },
  }));

export const trackBackgroundReviewSubmitted = (): RequestHandler =>
  pendoTrack(PendoEvent.backgroundReviewSubmitted);

export const trackPromptCreated = (): RequestHandler => pendoTrack(PendoEvent.promptCreated);

export const trackSkillImported = (): RequestHandler => pendoTrack(PendoEvent.skillImported);

export const trackSkillCreated = (): RequestHandler => pendoTrack(PendoEvent.skillCreated);

export const trackScheduleCreated = (): RequestHandler => pendoTrack(PendoEvent.scheduleCreated);

export const trackScheduledRunStarted = (): RequestHandler =>
  pendoTrack(PendoEvent.scheduledRunStarted, (_req, body) =>
    field(body, 'status') === 'started' ? { properties: { trigger: 'manual' } } : null,
  );

/** Identity results answer 200 with `ok: false` when the link was not accepted. */
export const trackChannelIdentityLinked = (): RequestHandler =>
  pendoTrack(PendoEvent.channelIdentityLinked, (_req, body) =>
    field(body, 'ok') === true ? {} : null,
  );

export const trackMCPServerAdded = (): RequestHandler => pendoTrack(PendoEvent.mcpServerAdded);

export const trackAgentApiKeyCreated = (): RequestHandler =>
  pendoTrack(PendoEvent.agentApiKeyCreated);

/** Records which provider the key is for, never the key itself. */
export const trackProviderKeySaved = (): RequestHandler =>
  pendoTrack(PendoEvent.providerKeySaved, (req) => ({
    properties: { provider: text(field(req.body, 'name')) },
  }));

export const trackRolePermissionsUpdated = (permission: string): RequestHandler =>
  pendoTrack(PendoEvent.rolePermissionsUpdated, (req) => ({
    properties: { role_name: text(req.params.roleName), permission_type: permission },
  }));

export const trackResourceAccessUpdated = (): RequestHandler =>
  pendoTrack(PendoEvent.resourceAccessUpdated, (req) => ({
    properties: { resource_type: text(req.params.resourceType) },
  }));

export const trackProjectCreated = (): RequestHandler => pendoTrack(PendoEvent.projectCreated);

export const trackProjectFileAdded = (): RequestHandler => pendoTrack(PendoEvent.projectFileAdded);

export const trackSlackConnectStarted = (): RequestHandler =>
  pendoTrack(PendoEvent.slackConnectStarted);

export const trackMemorySaved = (): RequestHandler =>
  pendoTrack(PendoEvent.memorySaved, (req) => ({
    properties: { agent_scoped: field(req.body, 'agentId') != null },
  }));

export const trackSharedLinkCreated = (): RequestHandler =>
  pendoTrack(PendoEvent.sharedLinkCreated, (req) => ({
    properties: { message_scoped: text(field(req.body, 'targetMessageId')) != null },
  }));
