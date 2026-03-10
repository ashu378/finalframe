import { createClient } from './src/lib/supabase/server.js';

async function checkTemplates() {
    const supabase = await createClient();
    const { data, error } = await supabase.from('templates').select('name, thumbnail_url');
    if (error) {
        console.error(error);
        return;
    }
    console.log(JSON.stringify(data, null, 2));
}

checkTemplates();
