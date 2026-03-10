import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cidgkvxnallddfvgjejv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpZGdrdnhuYWxsZGRmdmdqZWp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyOTk3MzIsImV4cCI6MjA4Mjg3NTczMn0.JMrEyNVZITI_seHvmgAbg3r8l5eXS4q_CHbzvelaSgk';

async function diagnose() {
    const projectId = '2487cb31-c260-482d-ae8f-8e4c5eb422d0';
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    console.log('--- PROJECT STATUS ---');
    const { data: project, error: pError } = await supabase.from('projects').select('*').eq('id', projectId).single();
    if (pError) console.error('Project fetch error:', pError);
    else console.log(JSON.stringify(project, null, 2));

    console.log('\n--- RECENT RENDER JOBS ---');
    const { data: jobs, error: jError } = await supabase
        .from('render_jobs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(10);

    if (jError) console.error('Jobs fetch error:', jError);
    else {
        jobs?.forEach(j => {
            console.log(`Job: ${j.id} | Status: ${j.status} | Created: ${j.created_at} | Error: ${j.error_message || 'None'}`);
            if (j.output_result) {
                console.log(`   Output: ${JSON.stringify(j.output_result)}`);
            }
        });
    }

    if (project) {
        console.log('\n--- STUDIO ASSETS ---');
        const { data: assets, error: aError } = await supabase
            .from('studio_assets')
            .select('*')
            .eq('studio_id', project.studio_id);

        if (aError) console.error('Assets fetch error:', aError);
        else console.log(`Found ${assets?.length || 0} assets.`);
    }
}

diagnose();
