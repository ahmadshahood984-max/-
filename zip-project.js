import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const zip = new AdmZip();

function addLocalFolderRecursive(localPath, zipPath) {
  const items = fs.readdirSync(localPath);
  for (const item of items) {
    const fullPath = path.join(localPath, item);
    const relativeZipPath = zipPath ? path.join(zipPath, item) : item;

    // Skip ignored files and folders
    if (
      item === 'node_modules' ||
      item === '.git' ||
      item === 'dist' ||
      item === '.env' ||
      item === 'project.zip' ||
      item === 'project.tar.gz' ||
      item === 'zip-project.js'
    ) {
      continue;
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      addLocalFolderRecursive(fullPath, relativeZipPath);
    } else {
      zip.addLocalFile(fullPath, zipPath);
    }
  }
}

console.log('Zipping project directories...');
addLocalFolderRecursive('.', '');

// Ensure public directory exists
if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
}

zip.writeZip('public/project.zip');
console.log('🎉 Project zipped successfully to public/project.zip!');
