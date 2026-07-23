require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log("Checking panel_users...");
  const { data: users, error } = await supabase.schema('fluinty').from('panel_users').select('*').limit(5);
  if (error) {
    console.error("Error fetching users:", error);
  } else {
    console.log("Users:", JSON.stringify(users, null, 2));
  }
}

run();
