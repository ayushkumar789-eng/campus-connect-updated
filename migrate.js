const fs = require('fs');
const path = require('path');

const root = __dirname;
const serverSrc = path.join(root, 'server/src');
const clientSrc = path.join(root, 'client/src');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function moveFile(src, dest) {
  if (fs.existsSync(src)) {
    ensureDir(path.dirname(dest));
    fs.renameSync(src, dest);
    console.log(`Moved ${path.relative(root, src)} to ${path.relative(root, dest)}`);
  }
}

// 1. BACKEND MIGRATION
console.log('--- Backend Migration ---');
const backendMap = [
  // Services
  { src: 'services/email.service.js', dest: 'infrastructure/mail/email.service.js' },
  { src: 'services/storage.service.js', dest: 'infrastructure/storage/storage.service.js' },
  { src: 'services/constants.js', dest: 'shared/constants.js' },
  { src: 'services/account.service.js', dest: 'modules/users/account.service.js' },
  { src: 'services/discussion.service.js', dest: 'modules/discussions/discussion.service.js' },
  { src: 'services/message.service.js', dest: 'modules/messages/message.service.js' },

  // Controllers
  { src: 'controllers/account.controller.js', dest: 'modules/users/account.controller.js' },
  { src: 'controllers/discussion.controller.js', dest: 'modules/discussions/discussion.controller.js' },
  { src: 'controllers/message.controller.js', dest: 'modules/messages/message.controller.js' },

  // Routes
  { src: 'routes/discussion.routes.js', dest: 'modules/discussions/discussion.routes.js' },
  { src: 'routes/message.routes.js', dest: 'modules/messages/message.routes.js' },
  { src: 'routes/report.routes.js', dest: 'modules/reports/report.routes.js' },

  // Models
  { src: 'models/Comment.js', dest: 'modules/posts/Comment.model.js' },
  { src: 'models/Post.js', dest: 'modules/posts/Post.model.js' },
  { src: 'models/Like.js', dest: 'modules/posts/Like.model.js' },
  { src: 'models/Conversation.js', dest: 'modules/messages/Conversation.model.js' },
  { src: 'models/Message.js', dest: 'modules/messages/Message.model.js' },
  { src: 'models/Discussion.js', dest: 'modules/discussions/Discussion.model.js' },
  { src: 'models/DiscussionComment.js', dest: 'modules/discussions/DiscussionComment.model.js' },
  { src: 'models/Event.js', dest: 'modules/events/Event.model.js' },
  { src: 'models/EventRegistration.js', dest: 'modules/events/EventRegistration.model.js' },
  { src: 'models/Follow.js', dest: 'modules/users/Follow.model.js' },
  { src: 'models/User.js', dest: 'modules/users/User.model.js' },
  { src: 'models/Group.js', dest: 'modules/groups/Group.model.js' },
  { src: 'models/GroupMember.js', dest: 'modules/groups/GroupMember.model.js' },
  { src: 'models/Note.js', dest: 'modules/notes/Note.model.js' },
  { src: 'models/Notification.js', dest: 'modules/notifications/Notification.model.js' },
  { src: 'models/Report.js', dest: 'modules/reports/Report.model.js' },
  { src: 'models/SavedPost.js', dest: 'modules/saved/SavedPost.model.js' }
];

backendMap.forEach(m => {
  moveFile(path.join(serverSrc, m.src), path.join(serverSrc, m.dest));
});

// Move any model references from index.js? We can just leave index.js or delete it if empty.

// 2. FRONTEND MIGRATION
console.log('\n--- Frontend Migration ---');
function moveDir(srcDir, destDir) {
  if (fs.existsSync(srcDir)) {
    ensureDir(destDir);
    fs.readdirSync(srcDir).forEach(file => {
      const srcFile = path.join(srcDir, file);
      const destFile = path.join(destDir, file);
      if (fs.statSync(srcFile).isDirectory()) {
        moveDir(srcFile, destFile);
      } else {
        moveFile(srcFile, destFile);
      }
    });
    // Remove empty dir
    try { fs.rmdirSync(srcDir); } catch(e){}
  }
}

const frontendMap = [
  // Pages
  { src: 'pages/admin', dest: 'features/admin/pages' },
  { src: 'pages/auth', dest: 'features/auth/pages' },
  { src: 'pages/directory', dest: 'features/users/pages/directory' },
  { src: 'pages/discussions', dest: 'features/discussions/pages' },
  { src: 'pages/feed', dest: 'features/posts/pages' },
  { src: 'pages/messages', dest: 'features/messages/pages' },
  { src: 'pages/profile', dest: 'features/users/pages/profile' },

  // Components
  { src: 'components/discussions', dest: 'features/discussions/components' },
  { src: 'components/feed', dest: 'features/posts/components' },
  { src: 'components/messages', dest: 'features/messages/components' },
  { src: 'components/profile', dest: 'features/users/components' },
];

frontendMap.forEach(m => {
  moveDir(path.join(clientSrc, m.src), path.join(clientSrc, m.dest));
});

console.log('\nMigration complete! Note: You will need to manually fix import paths in files, or use an IDE tool to refactor imports.');
