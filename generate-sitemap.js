
const https = require('https');
const fs = require('fs');

const SUPABASE_URL = 'https://yhgqtbbxsbptssybgbrl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3F0YmJ4c2JwdHNzeWJnYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTQ4NDYsImV4cCI6MjA4MTE3MDg0Nn0.cktVnZkay3MjYIG_v0WJSkotyq79Nnkr3JJn_munDi8';

function generateJobSlug(title) {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function getShortId(jobId) {
    return jobId.substring(0, 8);
}

async function fetchJobs() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'yhgqtbbxsbptssybgbrl.supabase.co',
            path: '/rest/v1/jobs?select=*&order=posted_date.desc',
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function generateSitemap() {
    console.log('🔄 Fetching jobs from Supabase...');
    
    const jobs = await fetchJobs();
    console.log(`✅ Found ${jobs.length} jobs`);

    const today = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>https://govfitai.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Static Pages -->
  <url>
    <loc>https://govfitai.com/about.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://govfitai.com/resources.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://govfitai.com/privacy-policy.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://govfitai.com/terms.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  
  <!-- Job Category Pages -->
  <url>
    <loc>https://govfitai.com/ssc-jobs.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://govfitai.com/railway-jobs.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://govfitai.com/banking-jobs.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://govfitai.com/defense-jobs.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://govfitai.com/PSU-jobs.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://govfitai.com/SSC-CGL-Preparation.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://govfitai.com/UPSC-jobs.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://govfitai.com/UPSC-Preparation-Strategy.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  
  <!-- Dynamic Job Pages -->
`;

    // Add all jobs
    jobs.forEach(job => {
        const slug = generateJobSlug(job.title);
        const shortId = getShortId(job.id);
        const lastmod = job.posted_date ? job.posted_date.split('T')[0] : today;
        
        xml += `  <url>
    <loc>https://govfitai.com/job-details.html?job=${slug}&amp;id=${shortId}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
    });

    xml += `</urlset>`;

    fs.writeFileSync('sitemap.xml', xml, 'utf8');
    console.log('✅ Sitemap generated successfully!');
    console.log(`📊 Total URLs: ${jobs.length + 13} (13 static + ${jobs.length} jobs)`);
}

generateSitemap().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});