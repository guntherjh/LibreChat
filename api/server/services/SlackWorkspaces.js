const mongoose = require('mongoose');
const { createSlackWorkspaceRuntime, createProxyAwareFetch } = require('@librechat/api');
const { createSlackWorkspaceStorage, logger } = require('@librechat/data-schemas');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { getAppConfig } = require('~/server/services/Config');
const pendo = require('~/server/services/Pendo');
const db = require('~/models');

module.exports = createSlackWorkspaceRuntime({
  storage: createSlackWorkspaceStorage(mongoose),
  readAppConfig: getAppConfig,
  findUser: (id) => db.findUser({ _id: id }),
  isPrincipalActive: db.isAgentTriggerPrincipalActive,
  hasCapability,
  publicBaseUrl: process.env.DOMAIN_SERVER || 'http://localhost:3080',
  clientBaseUrl: process.env.DOMAIN_CLIENT || process.env.DOMAIN_SERVER || 'http://localhost:3080',
  fetch: createProxyAwareFetch(),
  logError: (metadata) => logger.error('[SlackWorkspaces] Operation failed', metadata),
  onConnected: ({ userId, tenantId, workspace }) =>
    pendo.track({
      event: 'Slack workspace connected',
      user: { id: userId, tenantId },
      properties: { scope_count: workspace.scopes?.length, status: workspace.status },
    }),
});
