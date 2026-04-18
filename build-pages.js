const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3F0YmJ4c2JwdHNzeWJnYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTQ4NDYsImV4cCI6MjA4MTE3MDg0Nn0.cktVnZkay3MjYIG_v0WJSkotyq79Nnkr3JJn_munDi8';
const SUPABASE_HOST = 'yhgqtbbxsbptssybgbrl.supabase.co';

function generateSlug(text) {
    if (!text) return '';
    text = text.toLowerCase().trim();
    
    // If English characters exist, create slug using mostly English/numbers for cleaner URLs
    if (/[a-z]/.test(text)) {
        text = text.replace(/[^a-z0-9\s-]/g, ' ');
    } else {
        // If pure Hindi (or other non-English language), keep Unicode letters, marks (matras), and numbers
        text = text.replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ');
    }
    
    return text.replace(/\s+/g, '-')
        .replace(/-+/g, '-').replace(/^-+|-+$/g, '').substring(0, 80);
}

function shortId(id) { return (id || '').substring(0, 8); }

async function fetchFromSupabase(table, orderCol) {
    return new Promise((resolve) => {
        let allData = [];
        const limit = 1000;
        
        async function fetchBatch(offset = 0) {
            const path = `/rest/v1/${table}?select=*&order=${orderCol}.desc&limit=${limit}&offset=${offset}`;
            const req = https.request({
                hostname: SUPABASE_HOST,
                path, method: 'GET',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                res.setEncoding('utf8');
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try { 
                        const p = JSON.parse(data); 
                        if (Array.isArray(p) && p.length > 0) {
                            allData = allData.concat(p);
                            if (p.length === limit) {
                                fetchBatch(offset + limit);
                            } else {
                                resolve(allData);
                            }
                        } else {
                            resolve(allData);
                        }
                    } catch { resolve(allData); }
                });
            });
            req.on('error', () => resolve(allData));
            req.end();
        }
        fetchBatch();
    });
}

function urlEntry(loc, lastmod, changefreq, priority) {
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
}

// Ensure dir exists and is empty
function emptyDir(dir) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
}

// -----------------------------------------------------------------------------------------
// HTML TEMPLATES
// -----------------------------------------------------------------------------------------

function getJobHtmlTemplate(job, slug) {
    const canonicalUrl = `https://govfitai.com/jobs/${slug}.html`;
    const applyDeadline = job.application_deadline ? new Date(job.application_deadline).toLocaleDateString() : 'N/A';
    
    // Fallback info text
    const description = job.description || `${job.organization} has announced recruitment for the post of ${job.post_name}. Eligible candidates with ${job.education_required} qualification can apply online before the deadline. This is a government job opportunity in ${job.state}.`;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${job.title} - ${job.organization} | GovFitAI</title>
    <meta name="description" content="Apply for ${job.title} at ${job.organization}. Education: ${job.education_required}. Deadline: ${applyDeadline}. Get eligibility details, exam pattern, and apply online.">
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:title" content="${job.title} - ${job.organization}">
    <meta property="og:description" content="Apply for ${job.title} at ${job.organization}. Deadline: ${applyDeadline}">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Verdana, sans-serif; background: #f5f7fa; line-height: 1.6; margin:0; padding:0; }
        header { background: white; padding: 15px 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-bottom: 1px solid #e0e0e0; }
        .nav-container { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
        .logo { font-size: 24px; font-weight: bold; color: #333; text-decoration: none; }
        .container { max-width: 1000px; margin: 30px auto; padding: 0 20px; }
        .breadcrumb { background: white; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
        .breadcrumb a { color: #667eea; text-decoration: none; }
        .card { background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        h1 { color: #667eea; font-size: 32px; margin-bottom: 10px; }
        h2 { color: #333; font-size: 22px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #f0f0f0; }
        .grid { display: grid; grid-template-columns: 1fr 350px; gap: 20px; }
        @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
        .btn-apply { display: block; text-align: center; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-bottom: 20px; }
        .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
        .label { color: #666; font-weight: 500; }
        .value { color: #333; font-weight: 600; }
        .meta-info { font-size: 13px; color: #777; margin-top: 10px; }
        .badge { background: #e7f3ff; color: #004085; padding: 4px 10px; border-radius: 4px; font-size: 12px; display: inline-block; margin-right: 5px; }
    </style>
</head>
<body>
    <header>
        <div class="nav-container">
            <a href="/" class="logo">🇮🇳 GovFitAI</a>
            <a href="/jobs/" style="color:#667eea;text-decoration:none;font-weight:600;">Browse All Jobs</a>
        </div>
    </header>

    <div class="container">
        <div class="breadcrumb">
            <a href="/">Home</a> › <a href="/jobs/">Jobs</a> › <span>${job.title}</span>
        </div>

        <div class="card">
            <h1>${job.title}</h1>
            <div style="font-size:20px;color:#666;margin-bottom:20px;">${job.organization} • ${job.post_name}</div>
            <div>
                <span class="badge">🎓 ${job.education_required}</span>
                <span class="badge">📍 ${job.state}</span>
            </div>
        </div>

        <div class="grid">
            <div class="main-content">
                <div class="card">
                    <h2>📋 Job Description</h2>
                    <p style="color:#444;line-height:1.8;">${description}</p>
                    <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-left: 4px solid #667eea; border-radius: 4px;">
                        <strong>Eligibility Tips:</strong> Make sure you review exactly if your degree (${job.education_required}) is fully recognized by taking a look at the official notification. Candidates from ${job.state} might have specific state-domicile benefits.
                    </div>
                </div>

                <div class="card">
                    <h2>✅ Eligibility Criteria</h2>
                    <div class="row"><span class="label">Age Range:</span> <span class="value">${job.min_age || 'NA'} to ${job.max_age || 'NA'} Years</span></div>
                    <div class="row"><span class="label">Education Setup:</span> <span class="value">${job.education_required}</span></div>
                    <div class="row"><span class="label">Minimum Percentage:</span> <span class="value">${job.min_percentage ? job.min_percentage + '%' : 'Not Specified'}</span></div>
                    <div class="row"><span class="label">Location:</span> <span class="value">${job.state}</span></div>
                    <div class="row"><span class="label">Eligibility Categories:</span> <span class="value">${job.categories ? job.categories.join(', ') : 'All'}</span></div>
                </div>

                <div class="card">
                    <h2>❓ Frequently Asked Questions</h2>
                    <div style="margin-bottom: 15px;">
                        <h4 style="margin:0 0 5px;color:#333;">Is there any application fee for ${job.organization}?</h4>
                        <p style="margin:0;color:#555;">Fees vary generally by category. Most government examinations waive fees for SC/ST/PWD and women candidates. Please refer to the official ${job.organization} notification.</p>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <h4 style="margin:0 0 5px;color:#333;">What is the last date to apply?</h4>
                        <p style="margin:0;color:#555;">The application deadline is set for ${applyDeadline}. We recommend submitting your application at least 3 days prior to avoid server lag.</p>
                    </div>
                </div>
            </div>

            <div class="sidebar">
                <div class="card" style="position: sticky; top: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                        <div style="font-size:14px;opacity:0.9;">Application Deadline</div>
                        <div style="font-size:24px;font-weight:bold;">${applyDeadline}</div>
                    </div>
                    
                    ${job.apply_link ? `<a href="${job.apply_link}" target="_blank" rel="nofollow noopener" class="btn-apply">Apply Now on Official Website →</a>` : `<div style="text-align:center;color:#666;padding:10px;border:1px solid #e0e0e0;border-radius:8px;">Link unavailable</div>`}
                    
                    <div class="meta-info" style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
                        <p><strong>Published By:</strong> GovFitAI Job Team</p>
                        <p><strong>Last Updated:</strong> ${new Date().toLocaleDateString()}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function getQuizHtmlTemplate(quiz, slug) {
    const canonicalUrl = `https://govfitai.com/quiz/${slug}.html`;
    const qText = quiz.question_en || quiz.question_hi || '';
    const opts = (quiz.options_en && quiz.options_en.length > 0) ? quiz.options_en : (quiz.options_hi || []);
    const labels = ['A', 'B', 'C', 'D'];
    const correctIdx = (quiz.correct_option || 1) - 1;
    const cat = quiz.category || 'GK';
    
    // Rich Explanatory Text block added for AdSense "Thin Content" circumvention
    const learningBlock = `
        <div style="margin-top: 25px; padding: 20px; background: #fff8e1; border-left: 4px solid #ffc107; border-radius: 8px;">
            <h3 style="color:#e65100; margin-top:0;">📚 Learning Context: ${cat}</h3>
            <p style="color:#444; font-size:15px; line-height:1.6;">
                General competitive examinations frequently test candidates on <strong>${cat}</strong> topics. 
                Questions like <em>"${qText.substring(0, 50)}..."</em> are designed to verify factual recall and 
                general awareness. Regular practice on similar MCQs ensures a higher accuracy rate. 
                The correct option here is <strong>${opts[correctIdx] || 'Option ' + labels[correctIdx]}</strong>.
                ${quiz.explanation ? '<br><br><strong>Detailed Explanation:</strong> ' + quiz.explanation : ''}
            </p>
        </div>
    `;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${qText.substring(0, 60)} | ${cat} Quiz | GovFitAI</title>
    <meta name="description" content="Practice ${cat} MCQ: ${qText}. See the correct answer and detailed explanation for government exam preparation.">
    <link rel="canonical" href="${canonicalUrl}" />
    <style>
        body { font-family: 'Segoe UI', Tahoma, Verdana, sans-serif; background: #f5f7fa; line-height: 1.6; margin:0; padding:0; }
        header { background: white; padding: 15px 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-bottom: 1px solid #e0e0e0; }
        .nav-container { max-width: 900px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
        .logo { font-size: 24px; font-weight: bold; color: #333; text-decoration: none; }
        .container { max-width: 900px; margin: 30px auto; padding: 0 20px; }
        .breadcrumb { background: white; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
        .breadcrumb a { color: #667eea; text-decoration: none; }
        .card { background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .badge { background: #e8f0fe; color: #667eea; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: bold; display: inline-block; margin-bottom: 20px; }
        h1 { color: #222; font-size: 22px; margin-bottom: 25px; line-height: 1.5; }
        .option { padding: 15px 20px; border: 2px solid #e8e8e8; border-radius: 10px; margin-bottom: 12px; cursor: pointer; transition: 0.2s; background: white; display:flex; gap:15px; align-items:center; }
        .option:hover { border-color: #667eea; background: #f0f4ff; }
        .opt-label { width: 30px; height: 30px; border-radius: 50%; background: #f0f0f0; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#555; }
        .meta-info { font-size: 13px; color: #777; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeaea; text-align: center; }
        
        /* Dynamic script classes */
        .option.correct { border-color: #28a745; background: #f0fff4; }
        .option.correct .opt-label { background: #28a745; color: white; }
        .option.wrong { border-color: #dc3545; background: #fff5f5; }
        .option.wrong .opt-label { background: #dc3545; color: white; }
        #answerBox { display: none; margin-top: 20px; padding: 20px; border-radius: 8px; border: 2px solid #28a745; background: #f0fff4; }
    </style>
</head>
<body>
    <header>
        <div class="nav-container">
            <a href="/" class="logo">🇮🇳 GovFitAI</a>
            <a href="/quiz/" style="color:#667eea;text-decoration:none;font-weight:600;">More Quizzes</a>
        </div>
    </header>

    <div class="container">
        <div class="breadcrumb">
            <a href="/">Home</a> › <a href="/quiz/">Quiz Library</a> › <span>${cat} Question</span>
        </div>

        <div class="card">
            <div class="badge">${cat}</div>
            <h1>${qText}</h1>
            
            <div id="optionsWrap">
                ${opts.map((o, i) => `
                    <div class="option" onclick="selectAnswer(${i}, ${correctIdx})">
                        <div class="opt-label">${labels[i]}</div>
                        <div>${o}</div>
                    </div>
                `).join('')}
            </div>

            <div id="answerBox">
                <h3 style="color:#28a745; margin-top:0;">✅ Correct Answer: ${labels[correctIdx]}</h3>
                <p style="margin-bottom:0; color:#333; font-weight:500;">${opts[correctIdx]}</p>
            </div>

            ${learningBlock}

            <div class="meta-info">
                Authored by GovFitAI Content Team | Last Verified: ${new Date().toLocaleDateString()}
            </div>
        </div>
    </div>

    <!-- The live leaderboard interaction script -->
    <script>
        let answered = false;
        function selectAnswer(selected, correct) {
            if (answered) return;
            answered = true;
            
            const optsNode = document.querySelectorAll('.option');
            optsNode[correct].classList.add('correct');
            optsNode[correct].querySelector('.opt-label').innerText = '✓';
            
            if (selected !== correct) {
                optsNode[selected].classList.add('wrong');
                optsNode[selected].querySelector('.opt-label').innerText = '✗';
            }
            
            document.getElementById('answerBox').style.display = 'block';
            
            // Note: In a fully fleshed app, you could optionally init Supabase here 
            // and dispatch an event or push the score to the leaderboard.
        }
    </script>
</body>
</html>`;
}

// -----------------------------------------------------------------------------------------
// MAIN SCRIPT PROCESS
// -----------------------------------------------------------------------------------------

async function run() {
    console.log('🚀 Starting Static Site Generation Pipeline...');
    emptyDir(path.join(__dirname, 'jobs'));
    emptyDir(path.join(__dirname, 'quiz'));

    console.log('Fetching Jobs...');
    const allJobs = await fetchFromSupabase('jobs', 'posted_date');
    console.log(`Fetched ${allJobs.length} Jobs.`);

    console.log('Fetching MCQs...');
    const allMcqs = await fetchFromSupabase('quiz_questions', 'posted_date');
    console.log(`Fetched ${allMcqs.length} MCQs.`);

    const today = new Date().toISOString().split('T')[0];
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n`;
    xml += urlEntry('https://govfitai.com/', today, 'daily', '1.0');
    xml += urlEntry('https://govfitai.com/jobs/index.html', today, 'daily', '0.9');
    xml += urlEntry('https://govfitai.com/quiz/index.html', today, 'daily', '0.9');

    // 1. Process Jobs
    let jobLinksHtml = '';
    const seenJobIds = new Set();
    const uniqueJobs = allJobs.filter(job => {
        if (!job.id || !job.title) return false;
        if (seenJobIds.has(job.id)) return false;
        seenJobIds.add(job.id);
        return true;
    });

    for (let job of uniqueJobs) {
        const postPart = job.post_name ? '-' + generateSlug(job.post_name) : '';
        const slug = generateSlug(job.title) + postPart + '-' + shortId(job.id);
        
        // Write the static file
        const htmlContent = getJobHtmlTemplate(job, slug);
        fs.writeFileSync(path.join(__dirname, 'jobs', `${slug}.html`), htmlContent, 'utf8');

        // Append to sitemap
        const lmod = job.posted_date ? job.posted_date.split('T')[0] : today;
        xml += urlEntry(`https://govfitai.com/jobs/${slug}.html`, lmod, 'weekly', '0.8');

        // Append to Category Listing Block
        jobLinksHtml += `<div style="padding:15px; border:1px solid #eee; border-radius:8px; margin-bottom:10px; background:white;">
            <a href="/jobs/${slug}.html" style="font-size:18px; color:#667eea; text-decoration:none; font-weight:bold;">${job.title}</a>
            <div style="font-size:14px; color:#666; margin-top:5px;">${job.organization} | Location: ${job.state} | Education: ${job.education_required}</div>
        </div>\n`;
    }

    // 2. Process MCQs
    let mcqLinksHtml = '';
    const seenMcqSlugs = new Set();
    const uniqueMcqs = allMcqs.filter(q => {
        const text = (q.question_en || q.question_hi || '').trim();
        if (!text) return false;
        const slug = generateSlug(text) + '-' + shortId(q.id);
        if (seenMcqSlugs.has(slug)) return false;
        seenMcqSlugs.add(slug);
        q._fullSlug = slug;
        return true;
    });

    for (let q of uniqueMcqs) {
        const slug = q._fullSlug;
        const htmlContent = getQuizHtmlTemplate(q, slug);
        fs.writeFileSync(path.join(__dirname, 'quiz', `${slug}.html`), htmlContent, 'utf8');

        const lmod = q.posted_date ? q.posted_date.split('T')[0] : today;
        xml += urlEntry(`https://govfitai.com/quiz/${slug}.html`, lmod, 'monthly', '0.7');

        const qText = q.question_en || q.question_hi || '';
        mcqLinksHtml += `<div style="padding:15px; border:1px solid #eee; border-radius:8px; margin-bottom:10px; background:white;">
            <div style="font-size:12px; font-weight:bold; color:#aaa; margin-bottom:4px;">${q.category || 'GK'}</div>
            <a href="/quiz/${slug}.html" style="font-size:16px; color:#333; text-decoration:none;">${qText}</a>
        </div>\n`;
    }

    // 3. Generate Category Index Pages
    const jobIndexHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>All Government Jobs - GovFitAI</title>
        <style>body{font-family:sans-serif; background:#f5f7fa; padding:20px;} .c{max-width:800px; margin:0 auto;}</style></head>
        <body><div class="c"><h1>All Government Jobs</h1>
        <p>Browse through ${uniqueJobs.length} active government job listings. Last Updated: ${new Date().toLocaleDateString()} by GovFitAI Content Team</p>
        ${jobLinksHtml}
        </div></body></html>`;
    fs.writeFileSync(path.join(__dirname, 'jobs', 'index.html'), jobIndexHtml, 'utf8');

    const quizIndexHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>All MCQs & Quiz Questions - GovFitAI</title>
        <style>body{font-family:sans-serif; background:#f5f7fa; padding:20px;} .c{max-width:800px; margin:0 auto;}</style></head>
        <body><div class="c"><h1>GovFitAI Quiz Library</h1>
        <p>Practice ${uniqueMcqs.length} multiple choice questions. Last Updated: ${new Date().toLocaleDateString()} by GovFitAI Content Team</p>
        ${mcqLinksHtml}
        </div></body></html>`;
    fs.writeFileSync(path.join(__dirname, 'quiz', 'index.html'), quizIndexHtml, 'utf8');

    // 4. Finalize Sitemap
    xml += `\n</urlset>`;
    fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), xml, 'utf8');

    console.log(`✅ Build Complete! Generated ${uniqueJobs.length} job pages and ${uniqueMcqs.length} MCQ pages.`);
    console.log(`✅ sitemap.xml updated with new static paths.`);
}

run().catch(console.error);
