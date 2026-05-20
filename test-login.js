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

// ADICIONE SEUS DADOS AQUI PARA TESTAR
const email = 'diegooaraujoo2307@gmail.com';
const password = 'Senhadiego2307';

async function run() {
  if (email.startsWith('INSIRA_')) {
    console.log('Por favor, edite o arquivo C:\\_DESENVOLVIMENTO\\mykacash_oficial\\test-login.js colocando seu e-mail e senha corretos nas linhas 23 e 24.');
    return;
  }

  const resolvedEmail = email.includes('@') ? email : `${email}@smartmoney.local`;
  console.log('Testando conexão com Supabase...');
  console.log('URL de teste:', supabaseUrl);
  console.log('Email utilizado:', resolvedEmail);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password: password,
    });

    if (error) {
      console.log('\n❌ ERRO DE AUTENTICAÇÃO RETORNADO PELO SUPABASE:');
      console.log('Mensagem de erro:', error.message);
      console.log('Código/Status:', error.status);
    } else {
      console.log('\n✅ LOGIN REALIZADO COM SUCESSO NO BANCO DE DADOS!');
      console.log('ID do Usuário:', data.user.id);
      console.log('E-mail cadastrado:', data.user.email);
    }
  } catch (err) {
    console.error('Erro na execução:', err);
  }
}

run();
