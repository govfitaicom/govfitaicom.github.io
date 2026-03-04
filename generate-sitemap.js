const https = require('https');
const fs = require('fs');

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3F0YmJ4c2JwdHNzeWJnYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTQ4NDYsImV4cCI6MjA4MTE3MDg0Nn0.cktVnZkay3MjYIG_v0WJSkotyq79Nnkr3JJn_munDi8';

function generateSlug(text) {
    return (text || '').toLowerCase().trim()
        .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
        .replace(/-+/g, '-').replace(/^-+|-+$/g, '').substring(0, 80);
}
function shortId(id) { return (id || '').substring(0, 8); }

async function fetchFromSupabase(table, orderCol) {
    return new Promise((resolve) => {
        const path = `/rest/v1/${table}?select=*&order=${orderCol}.desc`;
        const req = https.request({
            hostname: 'yhgqtbbxsbptssybgbrl.supabase.co',
            path, method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { const p = JSON.parse(data); resolve(Array.isArray(p) ? p : []); }
                catch { resolve([]); }
            });
        });
        req.on('error', () => resolve([]));
        req.end();
    });
}

function urlEntry(loc, lastmod, changefreq, priority) {
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
}

async function generateSitemap() {
    const today = new Date().toISOString().split('T')[0];

    // ── Fetch data ──────────────────────────────────────────────────
    console.log('Fetching jobs...');
    const allJobs = await fetchFromSupabase('jobs', 'posted_date');
    console.log(`  Found ${allJobs.length} jobs`);

    console.log('Fetching MCQs...');
    const allMcqs = await fetchFromSupabase('quiz_questions', 'posted_date');
    console.log(`  Found ${allMcqs.length} MCQ questions`);

    // ── Deduplicate jobs by unique ID only (NOT by title slug)
    // Same title + different post_name = different job = different URL
    const seenJobIds = new Set();
    const uniqueJobs = allJobs.filter(job => {
        if (!job.id || !job.title) return false;
        if (seenJobIds.has(job.id)) return false;
        seenJobIds.add(job.id);
        return true;
    });
    console.log(`  Unique jobs: ${uniqueJobs.length} (removed ${allJobs.length - uniqueJobs.length} true ID duplicates)`);

    // ── Deduplicate MCQs (by slug) ─────────────────────────────────
    const seenMcqSlugs = new Set();
    const uniqueMcqs = allMcqs.filter(q => {
        const text = (q.question_en || q.question_hi || '').trim();
        if (!text) return false;
        const slug = generateSlug(text);
        if (seenMcqSlugs.has(slug)) return false;
        seenMcqSlugs.add(slug);
        q._slug = slug;
        return true;
    });
    console.log(`  Unique MCQs: ${uniqueMcqs.length}`);

    // ── Build XML ───────────────────────────────────────────────────
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n`;

    // Homepage
    xml += `  <!-- HOMEPAGE -->\n`;
    xml += urlEntry('https://govfitai.com/', today, 'daily', '1.0');

    // Static pages
    xml += `\n  <!-- STATIC PAGES -->\n`;
    [
        ['about.html',                            'monthly', '0.8'],
        ['resources.html',                         'weekly',  '0.9'],
        ['government-job-salary-guide.html',       'monthly', '0.9'],
        ['government-exam-eligibility-guide.html', 'monthly', '0.9'],
        ['privacy-policy.html',                    'yearly',  '0.3'],
        ['terms.html',                             'yearly',  '0.3'],
    ].forEach(([p, f, pri]) => xml += urlEntry(`https://govfitai.com/${p}`, today, f, pri));

    // Category pages
    xml += `\n  <!-- JOB CATEGORY PAGES -->\n`;
    ['ssc-jobs.html','railway-jobs.html','banking-jobs.html',
     'defense-jobs.html','PSU-jobs.html','UPSC-jobs.html']
        .forEach(p => xml += urlEntry(`https://govfitai.com/${p}`, today, 'weekly', '0.8'));

    // Preparation guides
    xml += `\n  <!-- PREPARATION GUIDES -->\n`;
    ['SSC-CGL-Preparation.html','UPSC-Preparation-Strategy.html']
        .forEach(p => xml += urlEntry(`https://govfitai.com/${p}`, today, 'monthly', '0.8'));

    // Dynamic job pages
    xml += `\n  <!-- JOB DETAIL PAGES (${uniqueJobs.length}) -->\n`;
    uniqueJobs.forEach(job => {
        // slug = title + post_name — same title, different post = different URL
        const postPart = job.post_name ? '-' + generateSlug(job.post_name) : '';
        const slug = generateSlug(job.title) + postPart;
        const sid  = shortId(job.id);
        const lmod = job.posted_date ? job.posted_date.split('T')[0] : today;
        const expired = job.application_deadline && new Date(job.application_deadline) < new Date();
        xml += urlEntry(
            `https://govfitai.com/job-details.html?job=${slug}&amp;id=${sid}`,
            lmod, expired ? 'monthly' : 'weekly', expired ? '0.5' : '0.8'
        );
    });

    // MCQ / Quiz pages
    xml += `\n  <!-- QUIZ / MCQ PAGES (${uniqueMcqs.length}) -->\n`;
    uniqueMcqs.forEach(q => {
        const sid  = shortId(q.id);
        const lmod = q.posted_date ? q.posted_date.split('T')[0] : today;
        xml += urlEntry(
            `https://govfitai.com/quiz-details.html?q=${q._slug}&amp;id=${sid}`,
            lmod, 'monthly', '0.7'
        );
    });

    xml += `\n</urlset>`;

    fs.writeFileSync('sitemap.xml', xml, 'utf8');
    const total = (xml.match(/<loc>/g) || []).length;
    console.log(`\n✅ sitemap.xml written — ${total} total URLs`);
    console.log(`   Jobs: ${uniqueJobs.length} | MCQs: ${uniqueMcqs.length}`);
}

generateSitemap().catch(err => { console.error('ERROR:', err); process.exit(1); });