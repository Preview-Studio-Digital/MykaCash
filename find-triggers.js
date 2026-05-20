import fs from 'fs';
import path from 'path';

const dir = 'C:/_DESENVOLVIMENTO/mykacash_oficial/supabase/migrations';
const files = fs.readdirSync(dir);

files.forEach(file => {
  if (file.endsWith('.sql')) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (content.toLowerCase().includes('trigger')) {
      console.log(`Found triggers in: ${file}`);
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes('trigger')) {
          console.log(`  Line ${idx + 1}: ${line.trim()}`);
        }
      });
    }
  }
});
