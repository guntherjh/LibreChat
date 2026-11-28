const express = require('express');
const { trackOnSuccess, createProjectHandlers } = require('@librechat/api');
const { configMiddleware, requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();
const handlers = createProjectHandlers({
  listChatProjects: db.listChatProjects,
  createChatProject: db.createChatProject,
  getChatProject: db.getChatProject,
  updateChatProject: db.updateChatProject,
  deleteChatProject: db.deleteChatProject,
  assignConversationToProject: db.assignConversationToProject,
  addChatProjectFile: db.addChatProjectFile,
  removeChatProjectFile: db.removeChatProjectFile,
  getProjectFiles: db.getProjectFiles,
  getAvailableProjectFiles: db.getAvailableProjectFiles,
});
router.use(requireJwtAuth);
router.get('/', handlers.listProjects);
router.post('/', configMiddleware, handlers.createProject);
/** Clearing the project (a `null` projectId) unassigns the chat, which is not tracked. */
router.put(
  '/conversations/:conversationId',
  trackOnSuccess('Chat assigned to project', (req) =>
    typeof req.body?.projectId === 'string' ? {} : null,
  ),
  handlers.assignConversationToProject,
);
router.get('/:projectId/files/available', handlers.listAvailableProjectFiles);
router.get('/:projectId/files', handlers.listProjectFiles);
router.post(
  '/:projectId/files',
  configMiddleware,
  trackOnSuccess('Project file added'),
  handlers.addProjectFile,
);
router.delete('/:projectId/files/:fileId', handlers.removeProjectFile);
router.get('/:projectId', handlers.getProject);
router.patch('/:projectId', configMiddleware, handlers.updateProject);
router.delete('/:projectId', handlers.deleteProject);

module.exports = router;
