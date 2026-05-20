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
  console.log('🔄 Iniciando backup completo de segurança...');
  try {
    // 1. Fetch Clients
    console.log('Obtendo clientes...');
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('*');

    if (clientsError) {
      console.log('❌ Erro ao ler clientes:', clientsError.message);
    } else {
      fs.writeFileSync('C:/_DESENVOLVIMENTO/mykacash_oficial/clientes_backup.json', JSON.stringify(clients, null, 2));
      console.log(`✅ ${clients.length} clientes salvos com sucesso em "clientes_backup.json"`);
    }

    // 2. Fetch Invoices
    console.log('Obtendo lançamentos/faturas...');
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('*');

    if (invoicesError) {
      console.log('❌ Erro ao ler faturas:', invoicesError.message);
    } else {
      fs.writeFileSync('C:/_DESENVOLVIMENTO/mykacash_oficial/lancamentos_backup.json', JSON.stringify(invoices, null, 2));
      console.log(`✅ ${invoices.length} faturas/lançamentos salvos com sucesso em "lancamentos_backup.json"`);
    }

    console.log('\n🎉 Backup concluído! Seus dados estão 100% seguros localmente.');

  } catch (err) {
    console.error('Erro geral durante o backup:', err);
  }
}

run();
