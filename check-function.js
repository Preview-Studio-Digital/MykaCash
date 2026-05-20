import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Manually parse .env
const envContent = fs.readFileSync('C:/_DESENVOLVIMENTO/mykacash_oficial/.env', 'utf8');
const envConfig = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    envConfig[key] = value;
  }
});

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('🔄 Verificando a definição atual da função public.handle_new_user()...');
  try {
    // PostgREST allows executing RPC or querying standard views/functions sometimes, but pg_proc might be protected by RLS or not exposed.
    // Let's see if we can query it or if there is another way.
    // We can try to fetch the definition using an RPC if one is available, or query a public table.
    // Since we don't have direct SQL access here, let's try a login with the test credentials to see if the error is still 500.
    console.log('Testando o login novamente...');
    const email = 'diegooaraujoo2307@gmail.com';
    const password = 'Senhadiego2307';
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.log('❌ Erro retornado:', error.message);
      console.log('Código/Status:', error.status);
    } else {
      console.log('✅ LOGIN BEM-SUCEDIDO!', data.user.id);
    }
  } catch (err) {
    console.error('Erro na execução:', err);
  }
}

run();
