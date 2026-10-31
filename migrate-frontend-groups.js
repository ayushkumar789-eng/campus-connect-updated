const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'client/src');
const groupsPagesDir = path.join(srcDir, 'features/groups/pages');
const groupsCompsDir = path.join(srcDir, 'features/groups/components');
if (!fs.existsSync(groupsPagesDir)) fs.mkdirSync(groupsPagesDir, { recursive: true });
if (!fs.existsSync(groupsCompsDir)) fs.mkdirSync(groupsCompsDir, { recursive: true });

// Move pages
const pagesToMove = [
  { old: 'pages/groups/Groups.jsx', new: 'features/groups/pages/Groups.jsx' },
  { old: 'pages/groups/GroupDetail.jsx', new: 'features/groups/pages/GroupDetail.jsx' },
];
pagesToMove.forEach(p => {
  const oldPath = path.join(srcDir, p.old);
  const newPath = path.join(srcDir, p.new);
  if (fs.existsSync(oldPath)) {
    let content = fs.readFileSync(oldPath, 'utf8');
    content = content.replace(/\.\.\/\.\.\/components\/groups/g, '../components');
    content = content.replace(/\.\.\/\.\.\/components/g, '../../../components');
    content = content.replace(/\.\.\/\.\.\/services/g, '../../../services');
    content = content.replace(/\.\.\/\.\.\/utils/g, '../../../utils');
    content = content.replace(/\.\.\/\.\.\/hooks/g, '../../../hooks');
    content = content.replace(/\.\.\/\.\.\/features/g, '../../../features');
    fs.writeFileSync(newPath, content);
    fs.unlinkSync(oldPath);
  }
});
if (fs.existsSync(path.join(srcDir, 'pages/groups'))) {
  fs.rmdirSync(path.join(srcDir, 'pages/groups'));
}

// Move components
const compsToMove = [
  { old: 'components/groups/GroupForm.jsx', new: 'features/groups/components/GroupForm.jsx' },
];
compsToMove.forEach(p => {
  const oldPath = path.join(srcDir, p.old);
  const newPath = path.join(srcDir, p.new);
  if (fs.existsSync(oldPath)) {
    let content = fs.readFileSync(oldPath, 'utf8');
    content = content.replace(/\.\.\/\.\.\/services/g, '../../../services');
    content = content.replace(/\.\.\/\.\.\/utils/g, '../../../utils');
    content = content.replace(/\.\.\/\.\.\/hooks/g, '../../../hooks');
    content = content.replace(/\.\.\/ui/g, '../../../components/ui');
    content = content.replace(/\.\.\/\.\.\/features/g, '../../../features');
    fs.writeFileSync(newPath, content);
    fs.unlinkSync(oldPath);
  }
});
if (fs.existsSync(path.join(srcDir, 'components/groups'))) {
  fs.rmdirSync(path.join(srcDir, 'components/groups'));
}

// Extract groupsApi
const endpointsPath = path.join(srcDir, 'services/endpoints.js');
let endpointsContent = fs.readFileSync(endpointsPath, 'utf8');
const startGroupsApi = endpointsContent.indexOf('export const groupsApi = {');
const endGroupsApi = endpointsContent.indexOf('// ── Search', startGroupsApi);

if (startGroupsApi > -1 && endGroupsApi > -1) {
  const apiContent = endpointsContent.slice(startGroupsApi, endGroupsApi);
  endpointsContent = endpointsContent.slice(0, startGroupsApi) + endpointsContent.slice(endGroupsApi);
  fs.writeFileSync(endpointsPath, endpointsContent);

  const indexContent = `import { api } from '../../services/api.js';
import { unwrap, paginated } from '../../services/endpoints.js';

${apiContent}
`;
  fs.writeFileSync(path.join(srcDir, 'features/groups/index.js'), indexContent);
}

// Update App.jsx imports
const appJsxPath = path.join(srcDir, 'App.jsx');
let appContent = fs.readFileSync(appJsxPath, 'utf8');
appContent = appContent.replace(/import\('\.\/pages\/groups\/Groups\.jsx'\)/g, "import('./features/groups/pages/Groups.jsx')");
appContent = appContent.replace(/import\('\.\/pages\/groups\/GroupDetail\.jsx'\)/g, "import('./features/groups/pages/GroupDetail.jsx')");
fs.writeFileSync(appJsxPath, appContent);

// Global replace for groupsApi imports
function replaceInDir(dir) {
  fs.readdirSync(dir).forEach(f => {
    let filePath = path.join(dir, f);
    if (fs.statSync(filePath).isDirectory()) {
      replaceInDir(filePath);
    } else if (filePath.endsWith('.jsx') || filePath.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      let changed = false;
      if (content.includes('groupsApi')) {
        // Fix endpoints import destruction (like useData.js)
        if (content.includes("from '../services/endpoints.js'") && content.includes("groupsApi")) {
          content = content.replace(/, groupsApi/, '');
          content = content.replace(/import { groupsApi, /, 'import { ');
          content = content.replace(/import {([^}]*?)groupsApi([^}]*?)} from '\.\.\/services\/endpoints\.js';?/, "import {$1$2} from '../services/endpoints.js';\nimport { groupsApi } from '../features/groups/index.js';");
          changed = true;
        }

        // For files inside features/groups/pages or components
        if (filePath.includes('features/groups/')) {
           if (content.includes("from '../../../services/endpoints.js'")) {
              content = content.replace(/import \{([^}]*?)groupsApi([^}]*?)\} from '\.\.\/\.\.\/\.\.\/services\/endpoints\.js';?/, "import { groupsApi } from '../index.js';\nimport {$1$2} from '../../../services/endpoints.js';");
              changed = true;
           }
           if (content.includes("from '../index.js';\nimport { } from")) {
              content = content.replace(/import \{[ \n]*\} from '\.\.\/\.\.\/\.\.\/services\/endpoints\.js';?/, '');
           }
        }
      }

      if (changed) fs.writeFileSync(filePath, content);
    }
  });
}
replaceInDir(srcDir);

console.log('Frontend Groups module migrated successfully.');
