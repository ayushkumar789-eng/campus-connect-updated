const fs = require('fs');
const path = require('path');

const root = __dirname;
const serverSrc = path.join(root, 'server/src');
const clientSrc = path.join(root, 'client/src');

function getAllFiles(dir, filesList = []) {
  if (!fs.existsSync(dir)) return filesList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, filesList);
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      filesList.push(fullPath);
    }
  }
  return filesList;
}

const serverFiles = getAllFiles(serverSrc);
const clientFiles = getAllFiles(clientSrc);

const allFiles = [...serverFiles, ...clientFiles];

// Helper to normalize paths for comparison
function norm(p) { return path.normalize(p).replace(/\\/g, '/'); }

const knownMoves = {
  // Models
  'models/Comment.js': 'modules/posts/Comment.model.js',
  'models/Post.js': 'modules/posts/Post.model.js',
  'models/Like.js': 'modules/posts/Like.model.js',
  'models/Conversation.js': 'modules/messages/Conversation.model.js',
  'models/Message.js': 'modules/messages/Message.model.js',
  'models/Discussion.js': 'modules/discussions/Discussion.model.js',
  'models/DiscussionComment.js': 'modules/discussions/DiscussionComment.model.js',
  'models/Event.js': 'modules/events/Event.model.js',
  'models/EventRegistration.js': 'modules/events/EventRegistration.model.js',
  'models/Follow.js': 'modules/users/Follow.model.js',
  'models/User.js': 'modules/users/User.model.js',
  'models/Group.js': 'modules/groups/Group.model.js',
  'models/GroupMember.js': 'modules/groups/GroupMember.model.js',
  'models/Note.js': 'modules/notes/Note.model.js',
  'models/Notification.js': 'modules/notifications/Notification.model.js',
  'models/Report.js': 'modules/reports/Report.model.js',
  'models/SavedPost.js': 'modules/saved/SavedPost.model.js',

  // Services
  'services/email.service.js': 'infrastructure/mail/email.service.js',
  'services/storage.service.js': 'infrastructure/storage/storage.service.js',
  'services/constants.js': 'shared/constants.js',
  'services/account.service.js': 'modules/users/account.service.js',
  'services/discussion.service.js': 'modules/discussions/discussion.service.js',
  'services/message.service.js': 'modules/messages/message.service.js',

  // Controllers
  'controllers/account.controller.js': 'modules/users/account.controller.js',
  'controllers/discussion.controller.js': 'modules/discussions/discussion.controller.js',
  'controllers/message.controller.js': 'modules/messages/message.controller.js',

  // Routes
  'routes/discussion.routes.js': 'modules/discussions/discussion.routes.js',
  'routes/message.routes.js': 'modules/messages/message.routes.js',
  'routes/report.routes.js': 'modules/reports/report.routes.js',

  // Client Pages
  'pages/directory/Students.jsx': 'features/users/pages/directory/Students.jsx',
  'pages/discussions/Discussions.jsx': 'features/discussions/pages/Discussions.jsx',
  'pages/discussions/DiscussionDetail.jsx': 'features/discussions/pages/DiscussionDetail.jsx',
  'pages/feed/Feed.jsx': 'features/posts/pages/Home.jsx',
  'pages/feed/PostDetail.jsx': 'features/posts/pages/PostDetail.jsx',
  'pages/messages/Messages.jsx': 'features/messages/pages/Messages.jsx',
  'pages/profile/UserProfile.jsx': 'features/users/pages/profile/UserProfile.jsx',

  // Client Components
  'components/discussions/DiscussionCard.jsx': 'features/discussions/components/DiscussionCard.jsx',
  'components/discussions/DiscussionComments.jsx': 'features/discussions/components/DiscussionComments.jsx',
  'components/discussions/DiscussionComposer.jsx': 'features/discussions/components/DiscussionComposer.jsx',
  'components/messages/ChatWindow.jsx': 'features/messages/components/ChatWindow.jsx',
  'components/messages/ConversationSidebar.jsx': 'features/messages/components/ConversationSidebar.jsx',
  'components/messages/MessageBubble.jsx': 'features/messages/components/MessageBubble.jsx',
  'components/messages/NewConversationModal.jsx': 'features/messages/components/NewConversationModal.jsx',
};

// Build absolute move map
const absoluteMoves = {};
for (const [oldPath, newPath] of Object.entries(knownMoves)) {
  if (oldPath.startsWith('models') || oldPath.startsWith('services') || oldPath.startsWith('controllers') || oldPath.startsWith('routes')) {
    absoluteMoves[norm(path.join(serverSrc, oldPath))] = norm(path.join(serverSrc, newPath));
    absoluteMoves[norm(path.join(serverSrc, oldPath.replace('.js', '')))] = norm(path.join(serverSrc, newPath));
  } else {
    absoluteMoves[norm(path.join(clientSrc, oldPath))] = norm(path.join(clientSrc, newPath));
    absoluteMoves[norm(path.join(clientSrc, oldPath.replace('.jsx', '')))] = norm(path.join(clientSrc, newPath));
  }
}

// Function to resolve import path
function tryResolve(dir, target) {
  let extensions = ['', '.js', '.jsx', '/index.js', '/index.jsx'];
  for (let ext of extensions) {
    if (fs.existsSync(path.join(dir, target + ext))) return path.join(dir, target + ext);
  }
  return null;
}

let fixedCount = 0;

for (const filePath of allFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Regex to match imports and requires
  const importRegex = /(?:import\s+.*?from\s+|import\s+|import\()(['"])(.*?)\1\)?/g;
  const requireRegex = /require\((['"])(.*?)\1\)/g;

  function replacer(match, quote, p) {
    if (!p.startsWith('.')) return match; // Not a relative import

    const dir = path.dirname(filePath);
    const resolvedPath = path.resolve(dir, p);
    
    // Check if it exists
    if (tryResolve(dir, p)) {
      return match;
    }

    // Try finding it in known moves
    let targetAbsolute = null;
    let tryExts = ['', '.js', '.jsx'];
    for (let ext of tryExts) {
      const check = norm(resolvedPath + ext);
      if (absoluteMoves[check]) {
        targetAbsolute = absoluteMoves[check];
        break;
      }
    }

    if (!targetAbsolute) {
      // General heuristic: see if the file exists *anywhere* in the src dir
      // E.g., if it's looking for "User", see if User.model.js exists
      const baseName = path.basename(p);
      const possibleMatches = allFiles.filter(f => 
        path.basename(f) === baseName + '.js' || 
        path.basename(f) === baseName + '.jsx' ||
        path.basename(f) === baseName + '.model.js' ||
        path.basename(f) === baseName + '.service.js' ||
        path.basename(f) === baseName + '.controller.js'
      );
      
      if (possibleMatches.length === 1) {
        targetAbsolute = possibleMatches[0];
      }
    }

    if (targetAbsolute) {
      let relativeToNew = path.relative(dir, targetAbsolute);
      if (!relativeToNew.startsWith('.')) {
        relativeToNew = './' + relativeToNew;
      }
      
      // If we mapped to a .js file but original didn't have extension, we can strip or keep it
      // Let's keep it exact except for jsx
      if (p.endsWith('.jsx') && relativeToNew.endsWith('.jsx')) {
        // match
      } else if (!p.endsWith('.js') && !p.endsWith('.jsx')) {
        relativeToNew = relativeToNew.replace(/\.js$/, ''); // remove .js if it wasn't there
      }
      
      return match.replace(p, relativeToNew);
    }

    return match;
  }

  content = content.replace(importRegex, replacer);
  content = content.replace(requireRegex, replacer);

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    fixedCount++;
  }
}

console.log(`Auto-fixed imports in ${fixedCount} files.`);
