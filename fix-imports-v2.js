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

const allFiles = [...getAllFiles(serverSrc), ...getAllFiles(clientSrc)];

function tryResolve(dir, p) {
  const exts = ['', '.js', '.jsx', '/index.js', '/index.jsx'];
  for (const ext of exts) {
    const fullPath = path.resolve(dir, p + ext);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

let fixedCount = 0;

for (const filePath of allFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Match: import x from './path', import { x } from "./path", require("./path")
  const regex = /(?:import\s+.*?from\s+|import\s+|import\()(['"])(.*?)\1\)?|require\((['"])(.*?)\3\)/g;

  content = content.replace(regex, (match, q1, p1, q2, p2) => {
    const quote = q1 || q2;
    let p = p1 || p2;
    if (!p.startsWith('.')) return match; // Not a relative path

    const dir = path.dirname(filePath);
    
    // Check if it's broken
    if (tryResolve(dir, p)) return match;

    // It's broken. Find a file in allFiles that best matches the basename.
    let searchName = path.basename(p);
    let searchNameNoExt = searchName.replace(/\.(js|jsx)$/, '');

    const candidates = allFiles.filter(f => {
      const fName = path.basename(f);
      const fNameNoExt = fName.replace(/\.(js|jsx|model\.js|service\.js|controller\.js|routes\.js)$/, '');
      return fName === searchName || fNameNoExt === searchNameNoExt;
    });

    if (candidates.length > 0) {
      // Pick the best candidate (exact name match preferred, then nearest directory)
      let target = candidates[0];
      if (candidates.length > 1) {
        const exactMatches = candidates.filter(c => path.basename(c) === searchName || path.basename(c) === searchName + '.js' || path.basename(c) === searchName + '.jsx');
        if (exactMatches.length === 1) target = exactMatches[0];
      }

      let relativeToNew = path.relative(dir, target);
      if (!relativeToNew.startsWith('.')) relativeToNew = './' + relativeToNew;
      
      // Preserve extension format
      if (p.endsWith('.jsx') && !relativeToNew.endsWith('.jsx')) relativeToNew += '.jsx';
      else if (!p.endsWith('.jsx') && relativeToNew.endsWith('.jsx')) {
          // React standard is to often include .jsx, so let's keep it if the target is .jsx
      } else if (!p.endsWith('.js') && relativeToNew.endsWith('.js')) {
          relativeToNew = relativeToNew.replace(/\.js$/, '');
      }

      // Replace the old path inside the original string
      return match.replace(quote + p + quote, quote + relativeToNew + quote);
    }

    return match;
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    fixedCount++;
  }
}

console.log(`Auto-fixed imports in ${fixedCount} files.`);
