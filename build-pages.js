const https = require('https');
const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://govfitai.com';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3F0YmJ4c2JwdHNzeWJnYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTQ4NDYsImV4cCI6MjA4MTE3MDg0Nn0.cktVnZkay3MjYIG_v0WJSkotyq79Nnkr3JJn_munDi8';
const SUPABASE_HOST = 'yhgqtbbxsbptssybgbrl.supabase.co';
const BLOCKED_JOB_IDS = new Set([
    '3528e1aa-e255-4d09-b388-4281e5ac9792',
    'eeed74d0-2802-43d8-ae35-0d1375ee8417'
]);
const BLOCKED_ROOT_SITEMAP_PAGES = new Set([
    'dhruv-rathee-free-ai-masterclass.html',
    'panchayat-election-app-india.html'
]);

function asText(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    if (Array.isArray(value)) return value.filter(Boolean).join(', ') || fallback;
    return String(value).trim() || fallback;
}

function escapeHtml(value) {
    return asText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeXml(value) {
    return escapeHtml(value);
}

function stripHtml(value) {
    return asText(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanQuestionText(value) {
    return asText(value).replace(/\bAnonymous Quiz\b/gi, ' ').replace(/\s+/g, ' ').trim();
}

function getQuestionText(question) {
    return cleanQuestionText(question.question_en || question.question_hi);
}

function formatDate(value) {
    if (!value) return 'Not specified';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return asText(value, 'Not specified');
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isoDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
}

function firstValidDate(values, mode = 'latest') {
    const dates = values
        .map(value => ({ value, time: new Date(value).getTime() }))
        .filter(item => valueIsDate(item.time));
    if (!dates.length) return '';
    dates.sort((a, b) => mode === 'earliest' ? a.time - b.time : b.time - a.time);
    return dates[0].value;
}

function valueIsDate(time) {
    return typeof time === 'number' && !Number.isNaN(time);
}

function uniqueValues(values) {
    const seen = new Set();
    const out = [];
    values.flatMap(value => Array.isArray(value) ? value : [value]).forEach(value => {
        const text = asText(value);
        const key = text.toLowerCase();
        if (!text || seen.has(key)) return;
        seen.add(key);
        out.push(text);
    });
    return out;
}

function generateSlug(text, maxLength = 100) {
    text = asText(text).toLowerCase().trim();
    if (/[a-z]/.test(text)) {
        text = text.replace(/[^a-z0-9\s-]/g, ' ');
    } else {
        text = text.replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ');
    }
    return text
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, maxLength)
        .replace(/-+$/g, '');
}

function hashString(input) {
    let hash = 5381;
    const text = asText(input);
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) + hash) + text.charCodeAt(i);
        hash >>>= 0;
    }
    return hash.toString(36).substring(0, 8);
}

function normalizeText(text) {
    return asText(text)
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9\p{L}\p{M}\s-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isBlockedJob(job) {
    if (!job) return true;
    if (BLOCKED_JOB_IDS.has(asText(job.id))) return true;

    const title = normalizeText(job.title);
    const organization = normalizeText(job.organization);
    const postName = normalizeText(job.post_name);
    const combined = normalizeText(`${title} ${organization} ${postName}`);

    if (title === 'scc test' && organization === 'scc test') return true;
    if (title === 'it jobs' && organization === 'it jobs') return true;
    if (combined.includes('dhruv rathi free ai masterclass')) return true;
    if (combined.includes('dhruv rathee free ai masterclass')) return true;

    return false;
}

function normalizeRecruitmentTitle(title) {
    return normalizeText(title)
        .replace(/\b\d+\s*(post|posts|vacancy|vacancies|seat|seats)\b/g, ' ')
        .replace(/\b(apply|online|form|forms|notification|short notice|notice|out|released|download|check|exam date|exam city|admit card|answer key|result|pre exam|mains exam|correction|edit|registration|otr|syllabus|for)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getJobGroupKey(job) {
    const title = normalizeRecruitmentTitle(job.title || job.post_name || 'job');
    const org = normalizeText(job.organization || 'government');
    return title.split(' ').length < 4 ? `${title}|${org}` : title;
}

function getJobGroupSlug(job) {
    const titlePart = generateSlug(normalizeRecruitmentTitle(job.title || job.post_name), 80) || 'government-job';
    const key = getJobGroupKey(job);
    return `${titlePart}-${hashString(key)}.html`;
}

function getQuizCategorySlug(category) {
    return `${generateSlug(category || 'general-knowledge', 80) || 'general-knowledge'}.html`;
}

function questionAnchor(question) {
    return `question-${generateSlug(question.id || question.question_en || question.question_hi, 32) || hashString(question.question_en || question.question_hi)}`;
}

async function fetchFromSupabase(table, orderCol) {
    return new Promise((resolve, reject) => {
        let allData = [];
        const limit = 1000;

        function fetchBatch(offset = 0) {
            const requestPath = `/rest/v1/${table}?select=*&order=${orderCol}.desc&limit=${limit}&offset=${offset}`;
            const req = https.request({
                hostname: SUPABASE_HOST,
                path: requestPath,
                method: 'GET',
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                res.setEncoding('utf8');
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error(`Supabase ${table} request failed with ${res.statusCode}: ${data.slice(0, 200)}`));
                        return;
                    }

                    let parsed;
                    try {
                        parsed = JSON.parse(data);
                    } catch (error) {
                        reject(new Error(`Could not parse ${table} response: ${error.message}`));
                        return;
                    }

                    if (!Array.isArray(parsed)) {
                        reject(new Error(`Expected ${table} response to be an array.`));
                        return;
                    }

                    allData = allData.concat(parsed);
                    if (parsed.length === limit) {
                        fetchBatch(offset + limit);
                    } else {
                        resolve(allData);
                    }
                });
            });

            req.on('error', reject);
            req.end();
        }

        fetchBatch();
    });
}

function emptyDir(dir) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
}

function urlEntry(loc, lastmod, changefreq, priority) {
    return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n    <changefreq>${escapeXml(changefreq)}</changefreq>\n    <priority>${escapeXml(priority)}</priority>\n  </url>\n`;
}

function cleanJsonLd(value) {
    if (Array.isArray(value)) return value.map(cleanJsonLd).filter(item => item !== undefined);
    if (value && typeof value === 'object') {
        const out = {};
        Object.entries(value).forEach(([key, item]) => {
            const cleaned = cleanJsonLd(item);
            if (cleaned !== undefined && cleaned !== '' && !(Array.isArray(cleaned) && cleaned.length === 0)) {
                out[key] = cleaned;
            }
        });
        return out;
    }
    return value === undefined || value === null ? undefined : value;
}

function jsonLdScript(data) {
    return `<script type="application/ld+json">${JSON.stringify(cleanJsonLd(data)).replace(/</g, '\\u003c')}</script>`;
}

function siteHeaderHtml() {
    return `<header class="site-header">
        <div class="header-inner">
            <a class="site-logo" href="/" aria-label="GovFitAI home">
                <img src="/logo.png" alt="GovFitAI" class="logo-img">
            </a>
            <nav class="site-nav" aria-label="Primary navigation">
                <a href="/">Home</a>
                <a href="/jobs/">Jobs</a>
                <a href="/quiz/">MCQ Practice</a>
                <a href="/resources.html">Resources</a>
                <a href="/about.html">About</a>
            </nav>
        </div>
    </header>`;
}

function siteFooterHtml() {
    return `<footer class="site-footer">
        <div class="footer-inner">
            <div class="footer-brand">
                <div class="footer-brand-left">
                    <h3>GovFitAI</h3>
                    <p>Smart government job matching powered by AI. Free, fast, and personalised for every Indian job seeker.</p>
                    <a href="https://play.google.com/store/apps/details?id=com.nextintinc.JobFitAI" target="_blank" rel="noopener" class="footer-store-badge">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/></svg>
                        Download on Play Store
                    </a>
                </div>
                <div class="footer-company">
                    <span>Developed by NextInt Inc</span>
                    <span>&copy; 2026 GovFitAI. All rights reserved.</span>
                </div>
            </div>

            <div class="footer-apps-row">
                <div class="footer-col-title">Our Apps</div>
                <div class="footer-apps-pills">
                    <a href="/ladki-bahin-yojana-ekyc-app.html" class="footer-app-pill">Ladki Bahin Yojana eKYC</a>
                    <a href="/udhari-book-app.html" class="footer-app-pill">Udhari Book</a>
                    <a href="/car-kundali-obd2-scanner-app.html" class="footer-app-pill">Car Kundali OBD2</a>
                    <a href="/wa-status-saver-app.html" class="footer-app-pill">WA Status Saver</a>
                    <a href="/evm-voting-machine-mock-poll.html" class="footer-app-pill">EVM Mock Poll</a>
                    <a href="/agristack-farmer-registration-app.html" class="footer-app-pill">AgriStack All India</a>
                    <a href="/setkari-karjmafi-krushi-yojana-app.html" class="footer-app-pill">Setkari Karjmafi App</a>
                </div>
            </div>

            <div class="footer-link-grid">
                <div class="footer-col">
                    <div class="footer-col-title">Job Categories</div>
                    <a href="/ssc-jobs.html">SSC Jobs</a>
                    <a href="/railway-jobs.html">Railway Jobs</a>
                    <a href="/banking-jobs.html">Banking Jobs</a>
                    <a href="/defense-jobs.html">Defence Jobs</a>
                    <a href="/PSU-jobs.html">PSU Jobs</a>
                    <a href="/UPSC-jobs.html">UPSC Jobs</a>
                </div>

                <div class="footer-col">
                    <div class="footer-col-title">Farmer Scheme Guides</div>
                    <a href="/setkari-karjmafi-blog.html">All Farmer Scheme Guides 2026</a>
                    <a href="/pm-kisan-marathi-guide-2026.html">PM-KISAN 2026 Marathi Guide</a>
                    <a href="/pmfby-pik-vima-marathi-guide-2026.html">PMFBY Pik Vima 2026</a>
                    <a href="/kisan-credit-card-kcc-marathi-guide.html">Kisan Credit Card KCC 2026</a>
                    <a href="/namo-shetkari-mahasanman-nidhi-2026.html">Namo Shetkari Mahasanman Nidhi</a>
                    <a href="/msp-bazar-bhav-2026-marathi.html">MSP Rates 2026-27 Marathi</a>
                    <a href="/pashudhan-vima-yojana-marathi-2026.html">Pashudhan Vima 2026</a>
                    <a href="/pmksy-drip-irrigation-subsidy-marathi.html">PMKSY Drip Irrigation Subsidy</a>
                    <a href="/rkvy-krushi-anudan-yojana-2026.html">RKVY Krushi Anudan 2026</a>
                    <a href="/shetkari-karjmafi-yojana-2026.html">Shetkari Karjmafi Yojana 2026</a>
                    <a href="/shetkari-karjmafi-app-marathi.html">Shetkari Karjmafi App 2026</a>
                </div>

                <div class="footer-col">
                    <div class="footer-col-title">Blog & Guides</div>
                    <a href="/mars-exploration-internship.html">MARS Exploration Internship Program</a>
                    <a href="/check-engine-light-dtc-codes-indian-cars-obd2-guide.html">Check Engine Light Guide (OBD2)</a>
                    <a href="/evm-voting-machine-review-2026.html">EVM Voting Machine Review 2026</a>
                    <a href="/udhari-book-vs-okcredit-khatabook-vyapar.html">Udhari Book vs OkCredit & Khatabook</a>
                    <a href="/govfitai-vs-sarkariresult.html">GovFitAI vs SarkariResult</a>
                    <a href="/free-voting-app-android-india.html">Free Voting App for Android India</a>
                    <a href="/society-rwa-election-app-android.html">Society RWA Election App for Android</a>
                    <a href="/school-college-election-app-india.html">School College Election App India</a>
                    <a href="/panchayat-election-app-india.html">Panchayat Election App India</a>
                    <a href="/evm-voting-machine-app-hindi.html">EVM Voting Machine App Hindi</a>
                </div>

                <div class="footer-col">
                    <div class="footer-col-title">Company</div>
                    <a href="/about.html">About Us</a>
                    <a href="/privacy-policy.html">Privacy Policy</a>
                    <a href="/terms.html">Terms of Service</a>
                </div>
            </div>
        </div>

        <div class="footer-bottom-bar">
            <span>&copy; 2026 GovFitAI - All rights reserved.</span>
            <span>
                <a href="/about.html">About</a>
                <a href="/privacy-policy.html">Privacy</a>
                <a href="/terms.html">Terms</a>
            </span>
        </div>
    </footer>`;
}

function pageShell({ title, description, canonicalUrl, content, jsonLd = null }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="google-adsense-account" content="ca-pub-2221858776975716">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    ${jsonLd ? jsonLdScript(jsonLd) : ''}
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif; color: #202124; background: #f5f7fa; line-height: 1.65; }
        a { color: #335dcc; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .site-header { background: #fff; padding: 10px 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); position: sticky; top: 0; z-index: 1000; border-bottom: 1px solid #e0e0e0; }
        .header-inner { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; gap: 18px; }
        .site-logo { display: flex; align-items: center; gap: 12px; flex-shrink: 0; transition: transform 0.2s; }
        .site-logo:hover { transform: translateY(-2px); text-decoration: none; }
        .logo-img { height: 55px; width: auto; object-fit: contain; display: block; }
        .site-nav { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; font-size: 14px; font-weight: 650; }
        .site-nav a { color: #333; }
        .site-nav a:hover { color: #667eea; text-decoration: none; }
        .wrap { max-width: 1160px; margin: 0 auto; padding: 28px 20px 48px; }
        .breadcrumb { font-size: 13px; color: #687386; margin-bottom: 18px; }
        .hero { background: #fff; border: 1px solid #e6e8ef; border-radius: 8px; padding: 28px; margin-bottom: 20px; }
        h1 { font-size: 30px; line-height: 1.25; margin: 0 0 12px; color: #1f2937; }
        h2 { font-size: 22px; margin: 26px 0 12px; color: #1f2937; }
        h3 { font-size: 17px; margin: 18px 0 8px; color: #1f2937; }
        .subtle { color: #5f6b7a; }
        .layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 20px; align-items: start; }
        .card { background: #fff; border: 1px solid #e6e8ef; border-radius: 8px; padding: 22px; margin-bottom: 18px; }
        .side { position: sticky; top: 78px; }
        .badge-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        .badge { display: inline-flex; align-items: center; padding: 5px 10px; background: #eef4ff; color: #234a91; border-radius: 999px; font-size: 12px; font-weight: 700; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 18px; }
        .stat { border: 1px solid #e6e8ef; border-radius: 8px; padding: 14px; background: #fbfcff; }
        .stat-label { font-size: 12px; color: #687386; text-transform: uppercase; letter-spacing: .04em; }
        .stat-value { font-weight: 800; color: #1f2937; margin-top: 4px; }
        .table-scroll { width: 100%; overflow-x: auto; border: 1px solid #edf0f5; border-radius: 8px; }
        .compact-list { margin: 6px 0 0 18px; padding: 0; }
        .compact-list li { margin: 3px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 11px 10px; border-bottom: 1px solid #edf0f5; text-align: left; vertical-align: top; font-size: 14px; }
        th { background: #f8fafc; color: #4b5563; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
        .posts-table { min-width: 1120px; table-layout: fixed; }
        .posts-table th { white-space: nowrap; }
        .posts-table td { overflow-wrap: normal; word-break: normal; }
        .posts-table .col-post { width: 210px; }
        .posts-table .col-education { width: 110px; }
        .posts-table .col-field { width: 150px; }
        .posts-table .col-location { width: 95px; }
        .posts-table .col-age { width: 95px; }
        .posts-table .col-marks { width: 110px; }
        .posts-table .col-category { width: 150px; }
        .posts-table .col-extra { width: 300px; }
        .requirements-cell { line-height: 1.55; }
        .button { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 13px 16px; background: #335dcc; color: #fff; border-radius: 8px; font-weight: 800; margin: 8px 0; }
        .button:hover { color: #fff; text-decoration: none; background: #274ba8; }
        .list { display: grid; gap: 12px; }
        .list-item { background: #fff; border: 1px solid #e6e8ef; border-radius: 8px; padding: 18px; }
        .question { scroll-margin-top: 90px; }
        details { background: #f8fafc; border: 1px solid #e6e8ef; border-radius: 8px; padding: 12px 14px; margin-top: 12px; }
        summary { cursor: pointer; font-weight: 800; color: #1f2937; }
        .site-footer { background: #1a202c; color: #a0aec0; padding: 56px 20px 0; margin-top: 60px; font-size: 14px; }
        .footer-inner { max-width: 1200px; margin: 0 auto; }
        .footer-brand { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding-bottom: 36px; border-bottom: 1px solid #2d3748; flex-wrap: wrap; }
        .footer-brand-left h3 { font-size: 20px; font-weight: 800; color: #fff; margin: 0 0 6px; }
        .footer-brand-left p { font-size: 13px; color: #718096; max-width: 300px; line-height: 1.6; margin: 0; }
        .footer-company { display: flex; flex-direction: column; gap: 6px; text-align: right; font-size: 12px; color: #4a5568; }
        .footer-store-badge { display: inline-flex; align-items: center; gap: 8px; background: #2d3748; border: 1px solid #4a5568; border-radius: 10px; padding: 10px 18px; color: #e2e8f0; text-decoration: none; font-size: 13px; font-weight: 600; transition: all 0.2s; margin-top: 14px; white-space: nowrap; }
        .footer-store-badge:hover { background: #667eea; border-color: #667eea; color: white; transform: translateY(-1px); text-decoration: none; }
        .footer-apps-row { padding: 32px 0 28px; border-bottom: 1px solid #2d3748; }
        .footer-apps-pills { display: flex; flex-wrap: wrap; gap: 10px; }
        .footer-app-pill { display: inline-flex; align-items: center; gap: 8px; background: #2d3748; border: 1px solid #4a5568; border-radius: 30px; padding: 7px 14px; color: #cbd5e0; text-decoration: none; font-size: 12px; font-weight: 600; transition: all 0.2s; white-space: nowrap; }
        .footer-app-pill:hover { background: #667eea; border-color: #667eea; color: white; transform: translateY(-1px); text-decoration: none; }
        .footer-link-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 36px 28px; padding: 40px 0 36px; border-bottom: 1px solid #2d3748; }
        .footer-col-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: #667eea; margin-bottom: 16px; }
        .footer-apps-row .footer-col-title { margin-bottom: 18px; }
        .footer-col a { color: #718096; text-decoration: none; display: block; margin-bottom: 10px; font-size: 13px; line-height: 1.4; transition: color 0.18s, padding-left 0.18s; border-left: 2px solid transparent; padding-left: 0; }
        .footer-col a:hover { color: #e2e8f0; border-left-color: #667eea; padding-left: 8px; text-decoration: none; }
        .footer-bottom-bar { max-width: 1200px; margin: 0 auto; padding: 20px 0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 12px; color: #4a5568; }
        .footer-bottom-bar a { color: #667eea; text-decoration: none; margin: 0 6px; }
        .footer-bottom-bar a:hover { color: #a3bffa; }
        @media (max-width: 860px) {
            .layout { grid-template-columns: 1fr; }
            .side { position: static; }
            h1 { font-size: 24px; }
            .hero { padding: 22px; }
            .header-inner { align-items: flex-start; flex-direction: column; }
            .site-nav { gap: 12px; }
            .footer-company { text-align: left; }
        }
    </style>
</head>
<body>
    ${siteHeaderHtml()}
    ${content}
    ${siteFooterHtml()}
</body>
</html>`;
}

function groupJobs(allJobs) {
    const seenIds = new Set();
    const groups = new Map();

    allJobs.forEach(job => {
        if (!job || !job.id || !job.title || isBlockedJob(job)) return;
        if (seenIds.has(job.id)) return;
        seenIds.add(job.id);

        const key = getJobGroupKey(job);
        if (!groups.has(key)) {
            groups.set(key, { key, jobs: [] });
        }
        groups.get(key).jobs.push(job);
    });

    return [...groups.values()].map(group => {
        group.jobs.sort((a, b) => new Date(b.posted_date || 0) - new Date(a.posted_date || 0));
        group.primary = group.jobs[0];
        group.slug = getJobGroupSlug(group.primary);
        group.title = asText(group.primary.title, 'Government Job Notification');
        group.organization = asText(group.primary.organization, 'Government Organization');
        group.posts = buildUniquePosts(group.jobs);
        group.postCount = group.posts.reduce((total, job) => total + postNames(job).length, 0);
        group.latestPosted = firstValidDate(group.jobs.map(job => job.posted_date), 'latest');
        group.earliestStart = firstValidDate(group.jobs.map(job => job.application_start_date), 'earliest');
        group.latestDeadline = firstValidDate(group.jobs.map(job => job.application_deadline), 'latest');
        group.states = uniqueValues(group.jobs.map(job => job.state));
        group.education = uniqueValues(group.jobs.map(job => job.education_required));
        group.educationFields = uniqueValues(group.jobs.flatMap(job => job.education_fields || []));
        group.categories = uniqueValues(group.jobs.flatMap(job => job.categories || []));
        group.applyLinks = uniqueValues(group.jobs.map(job => job.apply_link)).filter(link => /^https?:\/\//i.test(link));
        group.descriptions = uniqueValues(group.jobs.map(job => stripHtml(job.description))).filter(text => text.length > 40);
        group.requirements = uniqueValues(group.jobs.map(job => stripHtml(job.additional_requirements))).filter(text => text.length > 10);
        return group;
    }).sort((a, b) => new Date(b.latestPosted || 0) - new Date(a.latestPosted || 0));
}

function buildUniquePosts(jobs) {
    const posts = new Map();
    jobs.forEach(job => {
        const key = [
            normalizeText(job.post_name || job.title),
            normalizeText(job.education_required),
            normalizeText(job.state)
        ].join('|');
        const current = posts.get(key);
        if (!current || jobCompletenessScore(job) > jobCompletenessScore(current)) posts.set(key, job);
    });
    return [...posts.values()].sort((a, b) => asText(a.post_name || a.title).localeCompare(asText(b.post_name || b.title)));
}

function splitPostNames(value) {
    return asText(value)
        .split(/\r?\n|[•●▪]/)
        .map(item => item.replace(/^\s*[-*]\s*/, '').trim())
        .filter(Boolean);
}

function postNames(job, fallback = 'listed post') {
    const names = splitPostNames(job.post_name);
    return names.length ? names : [asText(job.post_name || job.title, fallback)];
}

function postNamesText(job, fallback = 'listed post') {
    return postNames(job, fallback).join(', ');
}

function postNamesHtml(job, fallback) {
    const names = postNames(job, fallback);
    if (names.length === 1) return `<strong>${escapeHtml(names[0])}</strong>`;
    return `<strong>${escapeHtml(names.length)} posts</strong><ul class="compact-list">${names.map(name => `<li>${escapeHtml(name)}</li>`).join('')}</ul>`;
}

function jobCompletenessScore(job) {
    return [
        job.post_name,
        job.education_required,
        job.education_fields,
        job.state,
        job.min_age,
        job.max_age,
        job.min_percentage,
        job.apply_link,
        job.description,
        job.additional_requirements
    ].reduce((score, value) => score + (asText(value) ? 1 : 0), 0) + stripHtml(job.description).length / 500;
}

function jobEducationSummary(job) {
    const parts = uniqueValues([
        job.education_required,
        ...(Array.isArray(job.education_fields) ? job.education_fields : [])
    ]);
    return parts.join(', ') || 'See notification';
}

function jobRequirementSummary(job) {
    return stripHtml(job.additional_requirements) || 'As per official notification';
}

function jobDescription(group) {
    const primaryDescription = group.descriptions[0];
    if (primaryDescription) return primaryDescription;
    const posts = group.posts.slice(0, 6).map(job => postNamesText(job, 'listed post')).join(', ');
    const education = group.education.length ? group.education.join(', ') : 'the required qualification';
    const locations = group.states.length ? group.states.join(', ') : 'India';
    const requirements = group.requirements.length ? ` Additional requirements noted in GovFitAI data include ${group.requirements.slice(0, 4).join('; ')}.` : '';
    return `${group.organization} has published ${group.title}. This consolidated page covers ${group.postCount} post option${group.postCount === 1 ? '' : 's'} including ${posts}. Candidates can review eligibility, age limit, education requirement, important dates, official links, and preparation resources for ${locations}. Applicants should verify the final details in the official notification before applying. Required education includes ${education}.${requirements}`;
}

function jobJsonLd(group) {
    return {
        '@context': 'https://schema.org',
        '@graph': group.posts.slice(0, 40).map(job => ({
            '@type': 'JobPosting',
            title: postNamesText(job, group.title),
            description: stripHtml(job.description) || jobDescription(group),
            datePosted: isoDate(job.posted_date || group.latestPosted),
            validThrough: isoDate(group.latestDeadline) ? `${isoDate(group.latestDeadline)}T23:59:00+05:30` : undefined,
            employmentType: 'FULL_TIME',
            hiringOrganization: {
                '@type': 'Organization',
                name: asText(job.organization || group.organization)
            },
            jobLocation: {
                '@type': 'Place',
                address: {
                    '@type': 'PostalAddress',
                    addressRegion: asText(job.state, 'India'),
                    addressCountry: 'IN'
                }
            },
            educationRequirements: jobEducationSummary(job),
            qualifications: jobRequirementSummary(job),
            url: `${SITE_URL}/jobs/${group.slug}`
        }))
    };
}

function getJobHtml(group) {
    const description = jobDescription(group);
    const canonicalUrl = `${SITE_URL}/jobs/${group.slug}`;
    const title = `${group.title} - Posts, Eligibility, Dates | GovFitAI`;
    const meta = `${group.organization} ${group.title}: see ${group.postCount} post option${group.postCount === 1 ? '' : 's'}, eligibility, age limit, education, dates, official links and preparation resources.`;

    const postRows = group.posts.map(job => `
        <tr>
            <td>${postNamesHtml(job, group.title)}</td>
            <td>${escapeHtml(job.education_required || 'See notification')}</td>
            <td>${escapeHtml(Array.isArray(job.education_fields) && job.education_fields.length ? job.education_fields.join(', ') : 'Any relevant field')}</td>
            <td>${escapeHtml(job.state || 'India')}</td>
            <td>${escapeHtml(job.min_age || 'NA')} - ${escapeHtml(job.max_age || 'NA')}</td>
            <td>${escapeHtml(job.min_percentage ? `${job.min_percentage}%` : 'Not specified')}</td>
            <td>${escapeHtml(uniqueValues(job.categories || []).join(', ') || 'As per rules')}</td>
            <td class="requirements-cell">${escapeHtml(jobRequirementSummary(job))}</td>
        </tr>`).join('');

    const dateRows = [
        ['Posted / Updated', formatDate(group.latestPosted)],
        ['Application Start', formatDate(group.earliestStart)],
        ['Last Date', formatDate(group.latestDeadline)],
        ['Admit Card', formatDate(firstValidDate(group.jobs.map(job => job.admit_card_date), 'latest'))],
        ['Result', formatDate(firstValidDate(group.jobs.map(job => job.result_date), 'latest'))]
    ].map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('');

    const officialLinks = group.applyLinks.length
        ? group.applyLinks.map((link, index) => `<a class="button" href="${escapeHtml(link)}" target="_blank" rel="nofollow noopener">Official link ${index + 1}</a>`).join('')
        : '<div class="subtle">Official apply link will be updated when available. Always verify details on the recruiting organization website.</div>';

    const content = `
    <main class="wrap">
        <div class="breadcrumb"><a href="/">Home</a> / <a href="/jobs/">Jobs</a> / ${escapeHtml(group.title)}</div>
        <section class="hero">
            <h1>${escapeHtml(group.title)}</h1>
            <p class="subtle">${escapeHtml(group.organization)} recruitment page with all available posts grouped in one place.</p>
            <div class="badge-row">
                <span class="badge">${escapeHtml(group.postCount)} post${group.postCount === 1 ? '' : 's'} covered</span>
                <span class="badge">${escapeHtml(group.states.join(', ') || 'India')}</span>
                <span class="badge">Last date: ${escapeHtml(formatDate(group.latestDeadline))}</span>
            </div>
            <div class="stat-grid">
                <div class="stat"><div class="stat-label">Organization</div><div class="stat-value">${escapeHtml(group.organization)}</div></div>
                <div class="stat"><div class="stat-label">Education</div><div class="stat-value">${escapeHtml(group.education.join(', ') || 'See notification')}</div></div>
                <div class="stat"><div class="stat-label">Fields</div><div class="stat-value">${escapeHtml(group.educationFields.join(', ') || 'Any relevant field')}</div></div>
                <div class="stat"><div class="stat-label">Categories</div><div class="stat-value">${escapeHtml(group.categories.join(', ') || 'As per rules')}</div></div>
            </div>
        </section>

        <div class="layout">
            <div>
                <section class="card">
                    <h2>Recruitment Overview</h2>
                    <p>${escapeHtml(description)}</p>
                    ${group.descriptions.slice(1, 3).map(text => `<p>${escapeHtml(text)}</p>`).join('')}
                </section>

                <section class="card">
                    <h2>Posts Included In This Notification</h2>
                    <p class="subtle">All available posts for this recruitment are grouped here so candidates can compare eligibility, dates and official links in one place.</p>
                    <div class="table-scroll">
                        <table class="posts-table">
                            <colgroup>
                                <col class="col-post">
                                <col class="col-education">
                                <col class="col-field">
                                <col class="col-location">
                                <col class="col-age">
                                <col class="col-marks">
                                <col class="col-category">
                                <col class="col-extra">
                            </colgroup>
                            <thead>
                                <tr><th>Post</th><th>Education</th><th>Field</th><th>Location</th><th>Age</th><th>Marks</th><th>Category</th><th>Extra Requirements</th></tr>
                            </thead>
                            <tbody>${postRows}</tbody>
                        </table>
                    </div>
                </section>

                <section class="card">
                    <h2>Eligibility Notes</h2>
                    <p>Check the post-wise education, age limit and category rules above, then confirm the final conditions in the official notification. Age relaxation, fee exemption and reservation benefits normally depend on the recruiting body's rules and candidate category.</p>
                    <p>Use GovFitAI's profile matching on the homepage to compare your age, education, state and category against available government jobs.</p>
                </section>

                <section class="card">
                    <h2>Frequently Asked Questions</h2>
                    <h3>How many posts are covered on this page?</h3>
                    <p>This page currently groups ${escapeHtml(group.postCount)} post option${group.postCount === 1 ? '' : 's'} for ${escapeHtml(group.organization)} under one canonical recruitment page.</p>
                    <h3>What is the last date to apply?</h3>
                    <p>The latest available deadline in GovFitAI data is ${escapeHtml(formatDate(group.latestDeadline))}. If the official notification has been updated, follow the official website date.</p>
                    <h3>Where should I apply?</h3>
                    <p>Use only the official recruiting body website or official application link. GovFitAI is an eligibility and discovery tool, not the recruiting authority.</p>
                </section>
            </div>

            <aside class="side">
                <section class="card">
                    <h2>Important Dates</h2>
                    <table><tbody>${dateRows}</tbody></table>
                </section>
                <section class="card">
                    <h2>Official Links</h2>
                    ${officialLinks}
                </section>
                <section class="card">
                    <h2>Preparation Resources</h2>
                    <p><a href="/government-exam-eligibility-guide.html">Government exam eligibility guide</a></p>
                    <p><a href="/government-job-salary-guide.html">Government job salary guide</a></p>
                    <p><a href="/SSC-CGL-Preparation.html">SSC CGL preparation plan</a></p>
                </section>
            </aside>
        </div>
    </main>`;

    return pageShell({ title, description: meta, canonicalUrl, content, jsonLd: jobJsonLd(group) });
}

function groupMcqs(allMcqs) {
    const seen = new Set();
    const groups = new Map();

    allMcqs.forEach(question => {
        const text = getQuestionText(question);
        if (!text) return;
        const key = normalizeText(text);
        if (seen.has(key)) return;
        seen.add(key);

        const category = asText(question.category, 'General Knowledge');
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(question);
    });

    return [...groups.entries()]
        .map(([category, questions]) => ({ category, questions }))
        .sort((a, b) => a.category.localeCompare(b.category));
}

function quizJsonLd(category, questions) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Quiz',
        name: `${category} MCQ Practice`,
        about: { '@type': 'Thing', name: category },
        hasPart: questions.slice(0, 100).map(question => {
            const qText = getQuestionText(question);
            const options = getQuestionOptions(question);
            const correct = options[getCorrectIndex(question)] || '';
            return {
                '@type': 'Question',
                eduQuestionType: 'Flashcard',
                text: qText,
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: correct
                }
            };
        })
    };
}

function getQuestionOptions(question) {
    const englishOptions = Array.isArray(question.options_en) ? question.options_en.filter(option => asText(option)) : [];
    const hindiOptions = Array.isArray(question.options_hi) ? question.options_hi.filter(option => asText(option)) : [];
    return englishOptions.length ? englishOptions : hindiOptions;
}

function getCorrectIndex(question) {
    const index = Number(question.correct_option || 1) - 1;
    return Math.max(0, index);
}

function getQuizCategoryHtml(group) {
    const { category, questions } = group;
    const slug = getQuizCategorySlug(category);
    const canonicalUrl = `${SITE_URL}/quiz/${slug}`;
    const title = `${category} MCQ Practice Questions With Answers | GovFitAI`;
    const description = `Practice ${questions.length} ${category} MCQs with options, correct answers and exam-focused context for government job preparation.`;
    const labels = ['A', 'B', 'C', 'D', 'E'];

    const questionCards = questions.map((question, index) => {
        const qText = getQuestionText(question);
        const options = getQuestionOptions(question);
        const correctIndex = getCorrectIndex(question);
        const correctAnswer = options[correctIndex] || 'See answer';
        const explanation = asText(question.explanation, `${category} questions are useful for government exams because they test accuracy, recall and concept clarity. Review the correct option, then practice similar questions to improve speed.`);

        return `<article class="card question" id="${escapeHtml(questionAnchor(question))}">
            <div class="badge">${escapeHtml(category)}</div>
            <h2>${index + 1}. ${escapeHtml(qText)}</h2>
            <ol type="A">
                ${options.map((option, optionIndex) => `<li><strong>${escapeHtml(labels[optionIndex] || String(optionIndex + 1))}.</strong> ${escapeHtml(option)}</li>`).join('')}
            </ol>
            <details>
                <summary>Show answer and explanation</summary>
                <p><strong>Correct answer:</strong> ${escapeHtml(correctAnswer)}</p>
                <p>${escapeHtml(explanation)}</p>
            </details>
        </article>`;
    }).join('');

    const content = `
    <main class="wrap">
        <div class="breadcrumb"><a href="/">Home</a> / <a href="/quiz/">MCQ Practice</a> / ${escapeHtml(category)}</div>
        <section class="hero">
            <h1>${escapeHtml(category)} MCQ Practice Questions</h1>
            <p class="subtle">${escapeHtml(description)}</p>
            <div class="badge-row">
                <span class="badge">${questions.length} questions</span>
                <span class="badge">Answers included</span>
                <span class="badge">Government exam practice</span>
            </div>
        </section>
        ${questionCards}
    </main>`;

    return pageShell({ title, description, canonicalUrl, content, jsonLd: quizJsonLd(category, questions) });
}

function getJobsIndexHtml(groups) {
    const content = `
    <main class="wrap">
        <section class="hero">
            <h1>Latest Government Jobs</h1>
            <p class="subtle">Browse ${groups.length} consolidated recruitment pages with post-wise eligibility, dates and official application links.</p>
        </section>
        <section class="list">
            ${groups.map(group => `<article class="list-item">
                <h2 style="margin-top:0;"><a href="/jobs/${escapeHtml(group.slug)}">${escapeHtml(group.title)}</a></h2>
                <p class="subtle">${escapeHtml(group.organization)} | ${escapeHtml(group.postCount)} post${group.postCount === 1 ? '' : 's'} | Last date: ${escapeHtml(formatDate(group.latestDeadline))}</p>
                <p>${escapeHtml(jobDescription(group).slice(0, 220))}${jobDescription(group).length > 220 ? '...' : ''}</p>
            </article>`).join('')}
        </section>
    </main>`;

    return pageShell({
        title: 'Latest Government Jobs - GovFitAI',
        description: 'Browse consolidated government job notifications with post-wise eligibility, dates, official links and preparation resources.',
        canonicalUrl: `${SITE_URL}/jobs/`,
        content
    });
}

function getQuizIndexHtml(groups) {
    const content = `
    <main class="wrap">
        <section class="hero">
            <h1>Government Exam MCQ Practice</h1>
            <p class="subtle">Choose a topic and practice MCQ sets with answers, explanations and exam-focused context.</p>
        </section>
        <section class="list">
            ${groups.map(group => `<article class="list-item">
                <h2 style="margin-top:0;"><a href="/quiz/${escapeHtml(getQuizCategorySlug(group.category))}">${escapeHtml(group.category)} MCQs</a></h2>
                <p class="subtle">${escapeHtml(group.questions.length)} questions with answers and exam context.</p>
            </article>`).join('')}
        </section>
    </main>`;

    return pageShell({
        title: 'MCQ Practice for Government Exams - GovFitAI',
        description: 'Practice GK, current affairs, SSC, UPSC and other government exam MCQs with answers and explanations.',
        canonicalUrl: `${SITE_URL}/quiz/`,
        content
    });
}

function getRootPagesForSitemap(today) {
    const excluded = new Set(['404.html', 'admin.html', 'job-details.html', 'quiz-details.html']);
    return fs.readdirSync(__dirname)
        .filter(file => file.endsWith('.html'))
        .filter(file => file !== 'index.html' && !excluded.has(file) && !BLOCKED_ROOT_SITEMAP_PAGES.has(file))
        .filter(file => {
            const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
            if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)) return false;

            const canonicalMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)
                || html.match(/<link\s+href=["']([^"']+)["']\s+rel=["']canonical["']/i);
            if (!canonicalMatch) return true;

            try {
                const canonical = new URL(canonicalMatch[1]);
                return canonical.origin === SITE_URL && canonical.pathname === `/${file}`;
            } catch {
                return true;
            }
        })
        .sort()
        .map(file => urlEntry(`${SITE_URL}/${file}`, today, 'weekly', '0.8'))
        .join('');
}

async function run() {
    console.log('Starting GovFitAI static publishing build...');

    console.log('Fetching jobs from Supabase...');
    const fetchedJobs = await fetchFromSupabase('jobs', 'posted_date');
    const allJobs = fetchedJobs.filter(job => !isBlockedJob(job));
    console.log(`Fetched ${fetchedJobs.length} job rows, ${allJobs.length} publishable.`);

    console.log('Fetching MCQs from Supabase...');
    const allMcqs = await fetchFromSupabase('quiz_questions', 'posted_date');
    console.log(`Fetched ${allMcqs.length} MCQ rows.`);

    if (!allJobs.length && !allMcqs.length) {
        throw new Error('No Supabase data was fetched. Refusing to clean generated folders.');
    }

    const jobGroups = groupJobs(allJobs);
    const quizGroups = groupMcqs(allMcqs);
    const today = new Date().toISOString().split('T')[0];

    emptyDir(path.join(__dirname, 'jobs'));
    emptyDir(path.join(__dirname, 'quiz'));

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    sitemap += urlEntry(`${SITE_URL}/`, today, 'daily', '1.0');
    sitemap += urlEntry(`${SITE_URL}/jobs/`, today, 'daily', '0.9');
    sitemap += urlEntry(`${SITE_URL}/quiz/`, today, 'weekly', '0.9');
    sitemap += getRootPagesForSitemap(today);

    jobGroups.forEach(group => {
        fs.writeFileSync(path.join(__dirname, 'jobs', group.slug), getJobHtml(group), 'utf8');
        sitemap += urlEntry(`${SITE_URL}/jobs/${group.slug}`, isoDate(group.latestPosted) || today, 'weekly', '0.8');
    });

    quizGroups.forEach(group => {
        const slug = getQuizCategorySlug(group.category);
        fs.writeFileSync(path.join(__dirname, 'quiz', slug), getQuizCategoryHtml(group), 'utf8');
        sitemap += urlEntry(`${SITE_URL}/quiz/${slug}`, today, 'weekly', '0.8');
    });

    fs.writeFileSync(path.join(__dirname, 'jobs', 'index.html'), getJobsIndexHtml(jobGroups), 'utf8');
    fs.writeFileSync(path.join(__dirname, 'quiz', 'index.html'), getQuizIndexHtml(quizGroups), 'utf8');

    sitemap += '</urlset>\n';
    fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap, 'utf8');

    console.log(`Build complete: ${allJobs.length} job rows collapsed into ${jobGroups.length} recruitment pages.`);
    console.log(`Build complete: ${allMcqs.length} MCQ rows collapsed into ${quizGroups.length} topic pages.`);
    console.log('sitemap.xml updated with canonical public URLs only.');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
