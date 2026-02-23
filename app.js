const SUPABASE_URL     = 'https://yhgqtbbxsbptssybgbrl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3F0YmJ4c2JwdHNzeWJnYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTQ4NDYsImV4cCI6MjA4MTE3MDg0Nn0.cktVnZkay3MjYIG_v0WJSkotyq79Nnkr3JJn_munDi8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── STATE ──────────────────────────────────────────────────────────────────────
let userProfile        = null;   // loaded from localStorage / DB by email
let pinnedJobs         = [];
let currentTab         = 'all';
let educationFieldsMap = {};
let configCategories   = [];
let configStates       = [];
let educationLevels    = [];

// Pagination
const PAGE_SIZE = 10;
let allJobsPage      = 0;
let allJobsTotal     = 0;
let allJobsData      = [];    // accumulated
let recJobsData      = [];    // all matched
let recJobsPage      = 0;

// Quiz
let quizAllQuestions  = [];
let quizQuestions     = [];
let quizIndex         = 0;
let quizScore         = 0;
let quizAnswered      = false;
let quizCategory      = '';
let quizAttemptedIds  = new Set();
let quizLoaded        = false;

// ── BOOT ───────────────────────────────────────────────────────────────────────
(async () => {
    await loadAppConfig();
    await loadProfileFromStorage();
    updateProfileNavBtn();
    loadAllJobs(true);
    // Only load recommended banner count if profile exists
    if (userProfile) showRecommendedBanner();
})();

// ── CONFIG ─────────────────────────────────────────────────────────────────────
async function loadAppConfig() {
    try {
        const [lvl, fld, cat, sts] = await Promise.all([
            sb.from('education_levels').select('*').order('hierarchy'),
            sb.from('education_fields').select('*'),
            sb.from('categories').select('name'),
            sb.from('states').select('name')
        ]);
        educationLevels = (lvl.data || []).map(l => l.name);
        educationFieldsMap = {};
        (fld.data || []).forEach(f => {
            if (!educationFieldsMap[f.level]) educationFieldsMap[f.level] = [];
            educationFieldsMap[f.level].push(f.field_name);
        });
        configCategories = (cat.data || []).map(c => c.name);
        configStates     = (sts.data || []).map(s => s.name);
    } catch (e) { console.error('Config error:', e); }
}

// ── PROFILE FROM LOCALSTORAGE ──────────────────────────────────────────────────
async function loadProfileFromStorage() {
    const email = localStorage.getItem('gf_email');
    if (!email) return;
    try {
        const { data } = await sb.from('users_profiles').select('*').eq('email', email).maybeSingle();
        if (data) {
            userProfile = data;
            pinnedJobs  = await loadPinnedJobs(email);
        } else {
            localStorage.removeItem('gf_email');
        }
    } catch (e) { console.error('Profile load error:', e); }
}

async function loadPinnedJobs(email) {
    try {
        const { data } = await sb.from('pinned_jobs').select('job_id').eq('user_email', email);
        return (data || []).map(p => p.job_id);
    } catch { return []; }
}

// ── RECOMMENDED BANNER ─────────────────────────────────────────────────────────
async function showRecommendedBanner() {
    if (!userProfile) return;
    try {
        const count = await countMatchedJobs();
        if (count > 0) {
            document.getElementById('matchCount').textContent = count;
            document.getElementById('recommendedBanner').style.display = 'block';
        }
    } catch (e) { console.error(e); }
}

async function countMatchedJobs() {
    const { data: levelsData } = await sb.from('education_levels').select('name, hierarchy').order('hierarchy');
    const eduH = {};
    (levelsData || []).forEach(l => { eduH[l.name] = l.hierarchy; });
    const { data: jobs } = await sb.from('jobs')
        .select('id, min_age, max_age, education_required, education_fields, min_percentage, categories, state, application_deadline')
        .gte('application_deadline', new Date().toISOString());
    return (jobs || []).filter(j => jobMatchesProfile(j, userProfile, eduH)).length;
}

function jobMatchesProfile(job, profile, eduH) {
    if (job.min_age && profile.age < job.min_age) return false;
    if (job.max_age && profile.age > job.max_age) return false;
    if ((eduH[profile.education_level] || 0) < (eduH[job.education_required] || 0)) return false;
    if (job.education_fields?.length && profile.education_field &&
        !job.education_fields.includes(profile.education_field)) return false;
    if (profile.percentage < job.min_percentage) return false;
    if (job.categories?.length && !job.categories.includes(profile.category)) return false;
    if (job.state !== 'All India' && job.state !== profile.state) return false;
    return true;
}

// ── PROFILE NAV BUTTON ─────────────────────────────────────────────────────────
function updateProfileNavBtn() {
    const btn = document.getElementById('profileNavBtn');
    if (!btn) return;
    if (userProfile) {
        btn.textContent = '👤 ' + (userProfile.full_name || userProfile.email.split('@')[0]);
    } else {
        btn.textContent = '👤 Create Profile';
    }
}

function toggleProfilePanel() {
    if (userProfile) {
        // Show profile section
        document.getElementById('profileSection').classList.remove('hidden');
        document.getElementById('profileSection').scrollIntoView({ behavior: 'smooth' });
        displayProfile();
    } else {
        openProfileModal();
    }
}

// ── TABS ───────────────────────────────────────────────────────────────────────
function showTab(tab) {
    currentTab = tab;
    ['recommended','all','quiz'].forEach(t => {
        document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.remove('active');
        document.getElementById(t === 'recommended' ? 'recommendedSection' : t === 'all' ? 'allSection' : 'quizSection').classList.add('hidden');
    });
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');

    if (tab === 'recommended') {
        document.getElementById('recommendedSection').classList.remove('hidden');
        if (userProfile) {
            loadRecommendedJobs();
        } else {
            document.getElementById('recommendedJobs').innerHTML = `
                <div class="loading" style="padding:60px 20px;">
                    <div style="font-size:48px;margin-bottom:16px;">👤</div>
                    <p style="font-size:18px;font-weight:700;color:#333;margin-bottom:8px;">No Profile Yet</p>
                    <p style="color:#888;margin-bottom:24px;">Create your profile to get jobs matched to your education, age &amp; category.</p>
                    <button class="btn-apply" onclick="openProfileModal()" style="font-size:15px;padding:12px 32px;">Create Profile Now</button>
                </div>`;
        }
    } else if (tab === 'all') {
        document.getElementById('allSection').classList.remove('hidden');
    } else {
        document.getElementById('quizSection').classList.remove('hidden');
        if (!quizLoaded) { loadQuizQuestions(); quizLoaded = true; }
        loadLeaderboard();
    }
}

// ── ALL JOBS (paginated) ───────────────────────────────────────────────────────
async function loadAllJobs(reset = false) {
    if (reset) { allJobsPage = 0; allJobsData = []; allJobsTotal = 0; }
    const btn = document.getElementById('loadMoreBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }

    try {
        const from = allJobsPage * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;

        const { data, error, count } = await sb.from('jobs')
            .select('*', { count: 'exact' })
            .order('posted_date', { ascending: false })
            .range(from, to);

        if (error) throw error;
        allJobsTotal = count || 0;
        allJobsData  = [...allJobsData, ...(data || [])];
        allJobsPage++;

        if (reset) {
            document.getElementById('allJobs').innerHTML = '';
        }
        appendJobCards(data || [], 'allJobs');

        // Update SEO links
        const seo = document.getElementById('seoJobLinks');
        if (seo) seo.innerHTML = allJobsData.map(j => `<a href="${getJobUrl(j.id,j.title)}">${j.title}</a><br>`).join('');

        const hasMore = allJobsData.length < allJobsTotal;
        if (btn) {
            btn.disabled = false;
            btn.textContent = hasMore ? `Load More Jobs (${allJobsTotal - allJobsData.length} remaining)` : 'All Jobs Loaded';
            btn.disabled = !hasMore;
        }
    } catch (e) {
        console.error(e);
        if (reset) document.getElementById('allJobs').innerHTML = '<div class="loading">Error loading jobs. Please refresh.</div>';
        if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
    }
}

function loadMoreJobs() { loadAllJobs(false); }

// ── RECOMMENDED JOBS (paginated) ───────────────────────────────────────────────
async function loadRecommendedJobs() {
    const container = document.getElementById('recommendedJobs');
    container.innerHTML = '<div class="loading">Finding jobs that match your profile...</div>';
    document.getElementById('loadMoreRec').classList.add('hidden');

    try {
        const { data: levelsData } = await sb.from('education_levels').select('name, hierarchy').order('hierarchy');
        const eduH = {};
        (levelsData || []).forEach(l => { eduH[l.name] = l.hierarchy; });

        const { data: allJobs } = await sb.from('jobs')
            .select('*')
            .gte('application_deadline', new Date().toISOString())
            .order('posted_date', { ascending: false });

        recJobsData = (allJobs || []).filter(j => jobMatchesProfile(j, userProfile, eduH));
        recJobsPage = 0;

        container.innerHTML = '';
        if (recJobsData.length === 0) {
            container.innerHTML = `<div class="loading">
                <div style="font-size:48px;margin-bottom:16px;">😕</div>
                <p style="font-size:18px;font-weight:700;color:#333;margin-bottom:8px;">No matching jobs found</p>
                <p style="color:#888;margin-bottom:20px;">Try updating your profile or check back when new jobs are posted.</p>
                <button class="btn-outline" onclick="openProfileModal()">Update Profile</button>
            </div>`;
            return;
        }

        const firstPage = recJobsData.slice(0, PAGE_SIZE);
        appendJobCards(firstPage, 'recommendedJobs');
        recJobsPage = 1;

        const btn = document.getElementById('loadMoreRec');
        if (recJobsData.length > PAGE_SIZE) {
            btn.classList.remove('hidden');
            btn.textContent = `Load More (${recJobsData.length - PAGE_SIZE} remaining)`;
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="loading">Error loading recommended jobs.</div>';
    }
}

function loadMoreRecommended() {
    const start = recJobsPage * PAGE_SIZE;
    const chunk = recJobsData.slice(start, start + PAGE_SIZE);
    appendJobCards(chunk, 'recommendedJobs');
    recJobsPage++;
    const remaining = recJobsData.length - recJobsPage * PAGE_SIZE;
    const btn = document.getElementById('loadMoreRec');
    if (remaining <= 0) {
        btn.classList.add('hidden');
    } else {
        btn.textContent = `Load More (${remaining} remaining)`;
    }
}

// ── RENDER JOBS ────────────────────────────────────────────────────────────────
function appendJobCards(jobs, containerId) {
    const container = document.getElementById(containerId);
    if (!jobs || jobs.length === 0) {
        if (container.children.length === 0)
            container.innerHTML = `<div class="loading" style="grid-column:1/-1;">No jobs found</div>`;
        return;
    }
    jobs.forEach(job => {
        const el = document.createElement('article');
        el.className = 'job-card';
        el.setAttribute('itemscope', '');
        el.setAttribute('itemtype', 'https://schema.org/JobPosting');
        const desc    = job.description || `${job.organization} invites applications for ${job.post_name}.`;
        const short   = desc.length > 120 ? desc.substring(0, 120) + '…' : desc;
        const jobUrl  = getJobUrl(job.id, job.title);
        const isPinned = pinnedJobs.includes(job.id);
        el.innerHTML = `
            <meta itemprop="datePosted" content="${job.posted_date}"/>
            <meta itemprop="validThrough" content="${job.application_deadline}"/>
            <div class="job-card-header">
                <div class="job-title" itemprop="title">
                    <a href="${jobUrl}">${job.title}</a>
                </div>
                ${userProfile ? `<button class="pin-btn" onclick="togglePin('${job.id}',this)" title="${isPinned?'Unpin':'Pin'}">${isPinned?'📌':'📍'}</button>` : ''}
            </div>
            <div class="job-org" itemprop="hiringOrganization" itemscope itemtype="https://schema.org/Organization">
                <span itemprop="name">${job.organization}</span> • ${job.post_name}
            </div>
            <div class="job-desc" itemprop="description">${short}</div>
            <div class="job-meta">
                <span class="job-meta-item">📅 ${formatDate(job.application_start_date || job.posted_date)}</span>
                <span class="job-meta-item">⏰ ${formatDate(job.application_deadline)}</span>
                <span class="job-meta-item" itemprop="educationRequirements">🎓 ${job.education_required}</span>
                <span class="job-meta-item" itemprop="jobLocation">📍 ${job.state}</span>
                ${job.min_age||job.max_age ? `<span class="job-meta-item">👤 ${job.min_age||'N/A'}–${job.max_age||'N/A'} yrs</span>` : ''}
                <span class="job-meta-item">📊 Min ${job.min_percentage||0}%</span>
            </div>
            ${job.education_fields?.length ? `<div style="margin-bottom:10px;">${job.education_fields.map(f=>`<span class="badge">${f}</span>`).join(' ')}</div>` : ''}
            ${job.admit_card_date ? `<div style="font-size:12px;color:#888;margin-bottom:4px;">🎫 Admit Card: ${job.admit_card_date}</div>` : ''}
            ${job.result_date ? `<div style="font-size:12px;color:#888;margin-bottom:8px;">📋 Result: ${job.result_date}</div>` : ''}
            <div class="job-actions">
                <a href="${jobUrl}" class="btn-apply">View Details →</a>
                <button class="btn-share" onclick="shareJob('${job.id}','${job.title.replace(/'/g,"\\'")}','${jobUrl}')">📤 Share</button>
            </div>`;
        container.appendChild(el);
    });
}

// ── PIN JOB ────────────────────────────────────────────────────────────────────
async function togglePin(jobId, btn) {
    if (!userProfile) { alert('Please create your profile first'); openProfileModal(); return; }
    const email = userProfile.email;
    try {
        if (pinnedJobs.includes(jobId)) {
            await sb.from('pinned_jobs').delete().eq('user_email', email).eq('job_id', jobId);
            pinnedJobs = pinnedJobs.filter(id => id !== jobId);
            btn.textContent = '📍';
            btn.title = 'Pin';
        } else {
            await sb.from('pinned_jobs').insert([{ user_email: email, job_id: jobId }]);
            pinnedJobs.push(jobId);
            btn.textContent = '📌';
            btn.title = 'Unpin';
        }
    } catch (e) { alert('Error: ' + e.message); }
}

// ── SHARE ──────────────────────────────────────────────────────────────────────
function shareJob(jobId, jobTitle, jobUrl) {
    const fullUrl = `${window.location.origin}/${jobUrl}`;
    const text    = `🎯 ${jobTitle}\n\n🔗 ${fullUrl}\n\n📱 GovFitAI - AI job recommendations\n#GovFitAI #GovernmentJobs`;
    if (navigator.share) {
        navigator.share({ title: jobTitle, text, url: fullUrl }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text).then(() => alert('✅ Link copied!'));
    }
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
function generateJobSlug(title) {
    return title.toLowerCase().trim()
        .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
        .replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}
function getShortId(id)       { return id.substring(0, 8); }
function getJobUrl(id, title) { return `job-details.html?job=${generateJobSlug(title)}&id=${getShortId(id)}`; }
function formatDate(ds) {
    if (!ds) return 'N/A';
    return new Date(ds).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

// ── PROFILE MODAL ──────────────────────────────────────────────────────────────
async function openProfileModal() {
    // Populate dropdowns
    const ls = document.getElementById('educationLevel');
    ls.innerHTML = '<option value="">Select Level</option>' + educationLevels.map(l => `<option value="${l}">${l}</option>`).join('');
    document.getElementById('category').innerHTML = configCategories.map(c => `<option value="${c}">${c}</option>`).join('');
    document.getElementById('state').innerHTML    = configStates.map(s => `<option value="${s}">${s}</option>`).join('');

    document.getElementById('profileModalTitle').textContent = userProfile ? 'Edit Profile' : 'Create Your Profile';

    // Pre-fill if editing
    if (userProfile) {
        document.getElementById('profileEmail').value     = userProfile.email;
        document.getElementById('profileEmail').disabled  = true; // email is the key, can't change
        document.getElementById('age').value              = userProfile.age || '';
        document.getElementById('educationLevel').value   = userProfile.education_level || '';
        updateFields();
        setTimeout(() => {
            document.getElementById('educationField').value = userProfile.education_field || '';
        }, 50);
        document.getElementById('percentage').value   = userProfile.percentage || '';
        document.getElementById('category').value     = userProfile.category || '';
        document.getElementById('state').value        = userProfile.state || '';
    } else {
        document.getElementById('profileEmail').disabled = false;
        document.getElementById('profileEmail').value = '';
    }

    document.getElementById('profileModal').classList.add('active');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('active');
    document.getElementById('profileEmail').disabled = false;
}

function updateFields() {
    const level = document.getElementById('educationLevel').value;
    const fg    = document.getElementById('fieldGroup');
    const fs    = document.getElementById('educationField');
    if (!level || level === '10th' || level === '12th') {
        fg.classList.add('hidden'); fs.removeAttribute('required');
    } else if (educationFieldsMap[level]) {
        fg.classList.remove('hidden'); fs.setAttribute('required', 'required');
        fs.innerHTML = '<option value="">Select Field</option>' +
            (educationFieldsMap[level] || []).map(f => `<option value="${f}">${f}</option>`).join('');
    } else {
        fg.classList.add('hidden'); fs.removeAttribute('required');
    }
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('profileBtn');
    btn.disabled = true; btn.textContent = 'Saving…';

    const level = document.getElementById('educationLevel').value;
    const email = (document.getElementById('profileEmail').value || '').trim().toLowerCase();

    if (!email) { alert('Email is required'); btn.disabled = false; btn.textContent = 'Save Profile'; return; }

    const data = {
        email,
        age            : parseInt(document.getElementById('age').value),
        education_level: level,
        education_field: (level && level !== '10th' && level !== '12th')
            ? document.getElementById('educationField').value || null : null,
        percentage : parseFloat(document.getElementById('percentage').value),
        category   : document.getElementById('category').value,
        state      : document.getElementById('state').value,
    };

    try {
        // Check if exists
        const { data: existing } = await sb.from('users_profiles').select('id').eq('email', email).maybeSingle();
        if (existing) {
            await sb.from('users_profiles').update(data).eq('email', email);
        } else {
            await sb.from('users_profiles').insert([data]);
        }
        localStorage.setItem('gf_email', email);
        userProfile = data;
        pinnedJobs  = await loadPinnedJobs(email);
        closeProfileModal();
        updateProfileNavBtn();
        showRecommendedBanner();
        document.getElementById('profileSection').classList.remove('hidden');
        displayProfile();
        alert('✅ Profile saved! Loading your job recommendations…');
        showTab('recommended');
        document.getElementById('jobsSection').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Save Profile';
    }
});

function displayProfile() {
    if (!userProfile) return;
    document.getElementById('profileInfo').innerHTML = `
        <div class="profile-info">
            <div class="info-item"><div class="info-label">Email</div><div class="info-value">${userProfile.email}</div></div>
            <div class="info-item"><div class="info-label">Age</div><div class="info-value">${userProfile.age} yrs</div></div>
            <div class="info-item"><div class="info-label">Education</div><div class="info-value">${userProfile.education_level}${userProfile.education_field ? ' — ' + userProfile.education_field : ''}</div></div>
            <div class="info-item"><div class="info-label">Percentage</div><div class="info-value">${userProfile.percentage}%</div></div>
            <div class="info-item"><div class="info-label">Category</div><div class="info-value">${userProfile.category}</div></div>
            <div class="info-item"><div class="info-label">State</div><div class="info-value">${userProfile.state}</div></div>
            <div class="info-item"><div class="info-label">Pinned Jobs</div><div class="info-value">${pinnedJobs.length} saved</div></div>
        </div>`;
}

async function deleteProfile() {
    if (!userProfile) return;
    if (!confirm('Delete your profile and all saved jobs? This cannot be undone.')) return;
    const email = userProfile.email;
    try {
        await sb.from('pinned_jobs').delete().eq('user_email', email);
        await sb.from('quiz_attempts').delete().eq('user_email', email);
        await sb.from('users_profiles').delete().eq('email', email);
        localStorage.removeItem('gf_email');
        userProfile = null; pinnedJobs = [];
        document.getElementById('profileSection').classList.add('hidden');
        document.getElementById('recommendedBanner').style.display = 'none';
        updateProfileNavBtn();
        alert('✅ Profile deleted successfully.');
        showTab('all');
        window.location.reload();
    } catch (e) { alert('Error: ' + e.message); }
}

// ── GET STARTED BUTTON ─────────────────────────────────────────────────────────
document.getElementById('getStartedBtn').onclick = () => {
    if (userProfile) {
        showTab('recommended');
        document.getElementById('jobsSection').scrollIntoView({ behavior: 'smooth' });
    } else {
        openProfileModal();
    }
};

// ── QUIZ ───────────────────────────────────────────────────────────────────────
function setQuizCategory(cat, btn) {
    quizCategory = cat;
    document.querySelectorAll('.quiz-cat-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    startQuizSession();
}

async function loadQuizQuestions() {
    document.getElementById('quizArea').innerHTML =
        '<div class="quiz-card"><div class="loading" style="padding:40px;color:#aaa;">Loading questions…</div></div>';
    try {
        const { data, error } = await sb
            .from('quiz_questions').select('*').order('posted_date', { ascending: false }).limit(100);
        if (error) throw error;
        quizAllQuestions = data || [];
        startQuizSession();
    } catch (e) {
        document.getElementById('quizArea').innerHTML =
            '<div class="quiz-card"><div class="loading" style="color:#aaa;padding:40px;">Failed to load questions.</div></div>';
    }
}

function startQuizSession() {
    const pool = quizCategory
        ? quizAllQuestions.filter(q => q.category === quizCategory)
        : quizAllQuestions;

    if (pool.length === 0) {
        document.getElementById('quizArea').innerHTML = `
            <div class="quiz-card" style="text-align:center;padding:40px;">
                <div style="font-size:44px;margin-bottom:14px;">📭</div>
                <p style="color:#aaa;">No questions in this category yet. Try another!</p>
            </div>`;
        return;
    }
    quizQuestions = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
    quizIndex = 0; quizScore = 0; quizAnswered = false;
    quizAttemptedIds.clear();
    renderQuestion();
}

function renderQuestion() {
    if (quizIndex >= quizQuestions.length) { renderScore(); return; }
    quizAnswered = false;
    const q      = quizQuestions[quizIndex];
    const opts   = (q.options_en && q.options_en.some(o => o?.trim())) ? q.options_en : q.options_hi;
    const qText  = (q.question_en?.trim()) ? q.question_en : q.question_hi;
    const labels = ['A','B','C','D'];
    const pct    = Math.round((quizIndex / quizQuestions.length) * 100);

    document.getElementById('quizArea').innerHTML = `
        <div class="quiz-card">
            <div class="quiz-progress-row">
                <span style="font-weight:600;">Q${quizIndex + 1} / ${quizQuestions.length}</span>
                <span style="font-weight:700;color:#667eea;">⭐ ${quizScore} pts</span>
                <span class="badge" style="background:#e8f0ff;color:#667eea;">${q.category}</span>
            </div>
            <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${pct}%"></div></div>
            <div class="quiz-question-text">${qText}</div>
            <div class="quiz-options">
                ${(opts||[]).map((opt,i) => `
                    <button class="quiz-option" id="qopt_${i}"
                        onclick="answerQuiz(${i},${q.correct_option-1},'${q.id}')">
                        <span class="option-label">${labels[i]}</span>
                        <span>${opt}</span>
                    </button>`).join('')}
            </div>
            <button class="quiz-next-btn" id="quizNextBtn" onclick="nextQ()">
                ${quizIndex + 1 < quizQuestions.length ? 'Next Question →' : 'See My Score 🏆'}
            </button>
        </div>`;
}

function answerQuiz(sel, correct, qId) {
    if (quizAnswered) return;
    quizAnswered = true;
    const opts = document.querySelectorAll('.quiz-option');
    opts.forEach(o => o.disabled = true);
    const isCorrect = sel === correct;
    if (isCorrect) {
        quizScore++;
        opts[sel].classList.add('correct');
        opts[sel].querySelector('.option-label').textContent = '✓';
    } else {
        opts[sel].classList.add('wrong');
        opts[sel].querySelector('.option-label').textContent = '✗';
        opts[correct].classList.add('reveal-correct');
        opts[correct].querySelector('.option-label').textContent = '✓';
    }
    document.getElementById('quizNextBtn').style.display = 'block';

    // Save attempt if user has profile
    if (userProfile && !quizAttemptedIds.has(qId)) {
        quizAttemptedIds.add(qId);
        sb.from('quiz_attempts').insert([{
            user_email     : userProfile.email,
            question_id    : qId,
            is_correct     : isCorrect,
            selected_option: sel + 1
        }]).then(({ error }) => { if (error) console.error(error.message); });
    }
}

function nextQ() { quizIndex++; renderQuestion(); }

function renderScore() {
    const total = quizQuestions.length;
    const pct   = Math.round((quizScore / total) * 100);
    let msg = '', emoji = '';
    if (pct >= 90) { msg = 'Outstanding! 🌟'; emoji = '🏆'; }
    else if (pct >= 70) { msg = 'Great Job! 🎉'; emoji = '🥇'; }
    else if (pct >= 50) { msg = 'Good Effort! 💪'; emoji = '🥈'; }
    else { msg = 'Keep Practising! 📚'; emoji = '💡'; }

    const note = userProfile
        ? `<div class="quiz-saved-note">✅ Answers saved! Your score counts towards the leaderboard.</div>`
        : `<div class="quiz-profile-prompt">
               <strong>🏆 Want to appear on the leaderboard?</strong>
               <a onclick="openProfileModal()">Create your profile</a> — no password needed, just your email!
           </div>`;

    document.getElementById('quizArea').innerHTML = `
        <div class="quiz-score-card">
            <div style="font-size:56px;">${emoji}</div>
            <div class="score-circle">
                <div class="score-number">${quizScore}</div>
                <div class="score-total">/ ${total}</div>
            </div>
            <div class="quiz-score-msg">${msg}</div>
            <div class="quiz-score-sub">${quizScore} correct out of ${total} (${pct}%)</div>
            ${note}
            <button class="quiz-restart-btn" onclick="startQuizSession()">🔄 Play Again</button>
            <button class="quiz-restart-btn" onclick="showTab('recommended')" style="background:#28a745;">💼 My Jobs</button>
        </div>`;

    loadLeaderboard();
}

// ── LEADERBOARD ────────────────────────────────────────────────────────────────
async function loadLeaderboard() {
    const body = document.getElementById('leaderboardBody');
    if (!body) return;
    body.innerHTML = '<div class="lb-empty">Loading…</div>';
    try {
        const { data, error } = await sb
            .from('quiz_attempts').select('user_email, is_correct').eq('is_correct', true);
        if (error) throw error;
        if (!data || data.length === 0) {
            body.innerHTML = '<div class="lb-empty">No scores yet. Play the quiz! 🎯</div>'; return;
        }
        const tally = {};
        data.forEach(r => { tally[r.user_email] = (tally[r.user_email] || 0) + 1; });
        const sorted = Object.entries(tally)
            .map(([email, n]) => ({ email, n }))
            .sort((a, b) => b.n - a.n).slice(0, 10);
        const medals = ['🥇','🥈','🥉'];
        body.innerHTML = sorted.map(({ email, n }, i) => {
            const isMe  = userProfile && email === userProfile.email;
            const [nm]  = email.split('@');
            const masked = (nm.length > 3 ? nm.substring(0,3) + '***' : nm) + '@' + email.split('@')[1];
            return `
                <div class="lb-row ${isMe ? 'me' : ''}">
                    <div class="lb-rank">${i < 3 ? medals[i] : '#' + (i+1)}</div>
                    <div class="lb-name">
                        ${isMe ? `<span class="you-badge">You</span>${nm}` : masked}
                    </div>
                    <div class="lb-score">${n}</div>
                </div>`;
        }).join('');
    } catch (e) {
        body.innerHTML = '<div class="lb-empty">Play to be first! 🎯</div>';
    }
}