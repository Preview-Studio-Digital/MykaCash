import fs from 'fs';
import path from 'path';

const dir = 'C:/_DESENVOLVIMENTO/mykacash_oficial/supabase/migrations';
const files = fs.readdirSync(dir);

files.forEach(file => {
  if (file.endsWith('.sql')) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (content.includes('admin_create_user') || content.includes('admin_update_user')) {
      console.log(`Found in: ${file}`);
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('CREATE FUNCTION') || line.includes('CREATE OR REPLACE FUNCTION') || line.includes('admin_create_user') || line.includes('admin_update_user')) {
          console.log(`  Line ${idx + 1}: ${line.trim()}`);
        }
      });
    }
  }
});
