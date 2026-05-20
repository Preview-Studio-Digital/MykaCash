import fs from 'fs';
import path from 'path';

function searchDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDirectory(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('@') || content.includes('domain') || content.includes('smartmoney')) {
        console.log(`Found in: ${fullPath}`);
        // Log lines containing keywords
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes('smartmoney') || line.includes('DOMAIN') || line.includes('local')) {
            console.log(`  Line ${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

console.log('Searching for domains in src...');
searchDirectory('C:/_DESENVOLVIMENTO/mykacash_oficial/src');
console.log('Searching root temporary files...');
const files = fs.readdirSync('C:/_DESENVOLVIMENTO/mykacash_oficial');
files.forEach(file => {
  if (file.endsWith('.tsx') || file.endsWith('.ts')) {
    const content = fs.readFileSync(path.join('C:/_DESENVOLVIMENTO/mykacash_oficial', file), 'utf8');
    if (content.includes('smartmoney') || content.includes('domain') || content.includes('local')) {
      console.log(`Found in root file: ${file}`);
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('smartmoney') || line.includes('DOMAIN') || line.includes('local')) {
          console.log(`  Line ${idx + 1}: ${line.trim()}`);
        }
      });
    }
  }
});
