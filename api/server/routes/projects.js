const express = require('express');
const { createProjectHandlers } = require('@librechat/api');
const pendo = require('@librechat/api/pendo');
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
router.post('/', configMiddleware, pendo.trackProjectCreated(), handlers.createProject);
router.put(
  '/conversations/:conversationId',
  pendo.trackChatAssignedToProject(),
  handlers.assignConversationToProject,
);
router.get('/:projectId/files/available', handlers.listAvailableProjectFiles);
router.get('/:projectId/files', handlers.listProjectFiles);
router.post(
  '/:projectId/files',
  configMiddleware,
  pendo.trackProjectFileAdded(),
  handlers.addProjectFile,
);
router.delete('/:projectId/files/:fileId', handlers.removeProjectFile);
router.get('/:projectId', handlers.getProject);
router.patch('/:projectId', configMiddleware, handlers.updateProject);
router.delete('/:projectId', handlers.deleteProject);

module.exports = router;
