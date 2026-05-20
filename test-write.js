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
  console.log('🔄 Testando inserção na tabela "clients"...');
  try {
    const tempName = 'TEST_INSERT_' + Math.floor(Math.random() * 10000);
    const { data, error } = await supabase
      .from('clients')
      .insert([
        {
          name: tempName,
          document: '00.000.000/0000-00',
          created_by: 'f8398af2-6975-4e1d-bfb0-84e8f11d1bdf' // Using the ID we saw in existing clients
        }
      ])
      .select();

    if (error) {
      console.log('❌ Erro na inserção:', error.message);
      console.log('Detalhes:', error);
    } else {
      console.log('✅ Inserção bem-sucedida! Dados inseridos:', data);
      
      // Cleanup: delete the inserted client
      console.log('🔄 Removendo registro de teste...');
      const { error: deleteError } = await supabase
        .from('clients')
        .delete()
        .eq('id', data[0].id);
        
      if (deleteError) {
        console.log('⚠️ Erro ao remover registro de teste:', deleteError.message);
      } else {
        console.log('✅ Registro de teste removido com sucesso.');
      }
    }
  } catch (err) {
    console.error('Erro na execução:', err);
  }
}

run();
