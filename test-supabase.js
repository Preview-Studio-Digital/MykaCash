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
  try {
    const email = `temp-reader-${Math.floor(Math.random() * 10000)}@smartmoney.local`;
    const password = 'temporaryPassword123!';

    console.log('1. Signing up a temporary user to get an authenticated session...');
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      console.log('Sign up error:', signUpError.message);
      return;
    }

    const session = signUpData.session;
    if (!session) {
      console.log('Temporary account created, but email confirmation is active. Let\'s try to sign in in case it works...');
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        console.log('Could not log in immediately:', signInError.message);
        return;
      }
    }

    console.log('2. Successfully authenticated! Querying profiles...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');

    if (profilesError) {
      console.log('Error fetching profiles:', profilesError.message);
    } else {
      console.log('PROFILES FOUND IN DATABASE:');
      console.log(JSON.stringify(profiles, null, 2));
    }
  } catch (err) {
    console.error('Execution error:', err);
  }
}

run();
