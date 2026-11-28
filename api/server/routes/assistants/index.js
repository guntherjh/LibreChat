const express = require('express');
const { middleware } = require('pendo-server-sdk');
const { uaParser, checkBan, requireJwtAuth, configMiddleware } = require('~/server/middleware');
const router = express.Router();

const { v1 } = require('./v1');
const chatV1 = require('./chatV1');
const v2 = require('./v2');
const chatV2 = require('./chatV2');

/** Pendo Agent Analytics identity for each chat turn; reads `req.user`, so it runs after auth. */
const identity = middleware((req) => ({
  visitorId: req.user?.id, // TODO: map to the visitor id your Pendo web snippet uses
  accountId: req.user?.tenantId, // TODO: map to the Pendo account id
  // TODO: a new conversation's first turn has no id here; the controller generates one
  conversationId: req.body?.conversationId ?? undefined,
}));

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);
router.use(configMiddleware);
router.use('/v1/', v1);
router.use('/v1/chat', identity, chatV1);
router.use('/v2/', v2);
router.use('/v2/chat', identity, chatV2);

module.exports = router;
