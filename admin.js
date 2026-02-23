const sb = window.supabase.createClient(
    'https://yhgqtbbxsbptssybgbrl.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3F0YmJ4c2JwdHNzeWJnYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTQ4NDYsImV4cCI6MjA4MTE3MDg0Nn0.cktVnZkay3MjYIG_v0WJSkotyq79Nnkr3JJn_munDi8'
);

const ADM = ['sonawalesvijay@gmail.com'];
let selFlds = [], isEdit = false, currentField = '';
let isQuizEdit = false;

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
checkAuth();
async function checkAuth() {
    const { data: { user } } = await sb.auth.getUser();
    if (user && ADM.includes(user.email)) showDash(user);
    else document.getElementById('loginScreen').classList.remove('hidden');
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const { data, error } = await sb.auth.signInWithPassword({
            email: document.getElementById('loginEmail').value,
            password: document.getElementById('loginPassword').value
        });
        if (error) throw error;
        if (!ADM.includes(data.user.email)) throw new Error('Access Denied');
        showDash(data.user);
    } catch (e) {
        msg(e.message, 'error', 'loginMessage');
    }
});

function showDash(u) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('adminEmail').textContent = u.email;
    loadJobs();
}

async function logout() {
    await sb.auth.signOut();
    location.reload();
}

// ─────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────
function switchTab(t, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    else document.querySelectorAll('.tab-btn')[0].classList.add('active');
    document.getElementById(t + 'Tab').classList.add('active');
    if (t === 'levels') loadLvls();
    if (t === 'fields') loadFlds();
    if (t === 'cats') loadCats();
    if (t === 'states') loadSts();
    if (t === 'quiz') loadQuizQuestions();
}

// ─────────────────────────────────────────────
// JOBS
// ─────────────────────────────────────────────
async function loadJobs() {
    let q = sb.from('jobs').select('*').order('posted_date', { ascending: false });
    const { data } = await q;
    const c = document.getElementById('jobsContainer');
    if (!data || !data.length) { c.innerHTML = '<p>No jobs found.</p>'; return; }
    c.innerHTML = data.map(j => `
        <div class="job-card">
            <h3 style="color:#667eea;">${j.title}</h3>
            <p style="color:#666;">${j.organization} • ${j.post_name}</p>
            <p style="margin-top:8px;font-size:13px;"><b>Start:</b> ${fd(j.application_start_date || j.posted_date)} &nbsp; <b>Deadline:</b> ${fd(j.application_deadline)}</p>
            <div style="margin-top:12px;">
                <button class="btn btn-primary" onclick="editJobById('${j.id}')">✏️ Edit</button>
                <button class="btn btn-danger" onclick="delJob('${j.id}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

function fd(d) { return d ? new Date(d).toLocaleDateString('en-IN') : 'N/A'; }

async function openAddJobModal() {
    isEdit = false;
    document.getElementById('modalTitle').textContent = 'Add Job';
    document.getElementById('jobForm').reset();
    selFlds = [];
    await popMdl();
    document.getElementById('jobModal').classList.add('active');
}

function closeJobModal() { document.getElementById('jobModal').classList.remove('active'); }

async function popMdl() {
    const { data: lvls } = await sb.from('education_levels').select('name').order('hierarchy');
    document.getElementById('eduReq').innerHTML = (lvls || []).map(l => `<option value="${l.name}">${l.name}</option>`).join('');
    const { data: sts } = await sb.from('states').select('name').order('name');
    document.getElementById('stateSel').innerHTML = (sts || []).map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    const { data: cats } = await sb.from('categories').select('name').order('name');
    document.getElementById('catsCb').innerHTML = (cats || []).map(c => `<label style="margin-right:15px;"><input type="checkbox" value="${c.name}" class="cat-cb"> ${c.name}</label>`).join('');
    await updFlds();
}

async function updFlds() {
    const lvl = document.getElementById('eduReq').value;
    const { data } = await sb.from('education_fields').select('field_name').eq('level', lvl).order('field_name');
    document.getElementById('fldInput').innerHTML = '<option value="">Select</option>' + (data || []).map(f => `<option value="${f.field_name}">${f.field_name}</option>`).join('');
}

function addJobFld() {
    const f = document.getElementById('fldInput').value;
    if (f && !selFlds.includes(f)) {
        selFlds.push(f);
        renderSelFlds();
    }
}

function rmFld(f) {
    selFlds = selFlds.filter(x => x !== f);
    renderSelFlds();
}

function renderSelFlds() {
    document.getElementById('fldsCont').innerHTML = selFlds.map(x =>
        `<div class="item-tag">${x}<button type="button" onclick="rmFld('${x}')">×</button></div>`
    ).join('');
}

async function editJobById(id) {
    const { data: j } = await sb.from('jobs').select('*').eq('id', id).single();
    if (!j) { alert('Job not found!'); return; }
    isEdit = true;
    document.getElementById('modalTitle').textContent = 'Edit Job';
    document.getElementById('jobId').value = j.id;
    document.getElementById('title').value = j.title;
    document.getElementById('organization').value = j.organization;
    document.getElementById('postName').value = j.post_name;
    document.getElementById('description').value = j.description || '';
    document.getElementById('minAge').value = j.min_age || '';
    document.getElementById('maxAge').value = j.max_age || '';
    document.getElementById('minPct').value = j.min_percentage;
    document.getElementById('addReq').value = j.additional_requirements || '';
    document.getElementById('startDt').value = (j.application_start_date || j.posted_date || '').split('T')[0];
    document.getElementById('deadDt').value = (j.application_deadline || '').split('T')[0];
    document.getElementById('admitDt').value = j.admit_card_date || '';
    document.getElementById('resDt').value = j.result_date || '';
    document.getElementById('link').value = j.apply_link;
    selFlds = j.education_fields || [];
    await popMdl();
    document.getElementById('eduReq').value = j.education_required;
    await updFlds();
    document.getElementById('stateSel').value = j.state;
    renderSelFlds();
    document.querySelectorAll('.cat-cb').forEach(cb => { cb.checked = j.categories?.includes(cb.value); });
    document.getElementById('jobModal').classList.add('active');
}

document.getElementById('jobForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cats = Array.from(document.querySelectorAll('.cat-cb:checked')).map(c => c.value);
    const d = {
        title: document.getElementById('title').value,
        organization: document.getElementById('organization').value,
        post_name: document.getElementById('postName').value,
        description: document.getElementById('description').value || null,
        min_age: document.getElementById('minAge').value || null,
        max_age: document.getElementById('maxAge').value || null,
        education_required: document.getElementById('eduReq').value,
        education_fields: selFlds,
        min_percentage: parseFloat(document.getElementById('minPct').value) || 0,
        additional_requirements: document.getElementById('addReq').value || null,
        categories: cats,
        state: document.getElementById('stateSel').value,
        application_start_date: document.getElementById('startDt').value,
        application_deadline: document.getElementById('deadDt').value,
        admit_card_date: document.getElementById('admitDt').value || null,
        result_date: document.getElementById('resDt').value || null,
        apply_link: document.getElementById('link').value
    };
    try {
        if (isEdit) {
            const { error } = await sb.from('jobs').update(d).eq('id', document.getElementById('jobId').value);
            if (error) throw error;
        } else {
            const { error } = await sb.from('jobs').insert([d]);
            if (error) throw error;
        }
        closeJobModal();
        loadJobs();
        msg('✅ Job saved successfully', 'success');
    } catch (e) {
        msg('❌ ' + e.message, 'error');
    }
});

async function delJob(id) {
    if (!confirm('Delete this job?')) return;
    await sb.from('jobs').delete().eq('id', id);
    loadJobs();
    msg('✅ Job deleted', 'success');
}

// ─────────────────────────────────────────────
// QUIZ QUESTIONS
// ─────────────────────────────────────────────
async function loadQuizQuestions() {
    const categoryFilter = document.getElementById('quizCategoryFilter')?.value || '';
    let query = sb.from('quiz_questions').select('*').order('posted_date', { ascending: false });
    if (categoryFilter) query = query.eq('category', categoryFilter);

    const { data, error } = await query;
    const c = document.getElementById('quizContainer');

    if (error) { c.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`; return; }
    if (!data || !data.length) { c.innerHTML = '<p style="color:#888;text-align:center;padding:40px;">No quiz questions found. Add your first question!</p>'; return; }

    // Stats
    const total = data.length;
    const cats = [...new Set(data.map(q => q.category))];
    document.getElementById('quizStats').innerHTML = `
        <div class="stat-chip">📝 Total: ${total}</div>
        <div class="stat-chip">📂 Categories: ${cats.length}</div>
        ${cats.map(c => `<div class="stat-chip" style="background:#f0fff4;color:#155724;border-color:#c3e6cb;">${c}: ${data.filter(q => q.category === c).length}</div>`).join('')}
    `;

    const labels = ['A', 'B', 'C', 'D'];

    c.innerHTML = data.map(q => {
        const opts_hi = q.options_hi || [];
        const opts_en = q.options_en || [];
        const correct = (q.correct_option || 1) - 1; // 0-indexed

        const optionsHtml = labels.map((lbl, i) => {
            const isCorrect = i === correct;
            return `
                <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:8px;margin-bottom:6px;background:${isCorrect ? '#d4edda' : '#f8f9fa'};border:1px solid ${isCorrect ? '#c3e6cb' : '#e9ecef'};">
                    <div style="width:26px;height:26px;border-radius:50%;background:${isCorrect ? '#28a745' : '#adb5bd'};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">
                        ${isCorrect ? '✓' : lbl}
                    </div>
                    <div style="flex:1;">
                        <div style="font-size:13px;font-weight:${isCorrect ? '700' : '500'};color:${isCorrect ? '#155724' : '#333'};">${opts_hi[i] || ''}</div>
                        <div style="font-size:12px;color:${isCorrect ? '#1e7e34' : '#666'};">${opts_en[i] || ''}</div>
                    </div>
                    ${isCorrect ? '<span class="correct-badge">✅ Correct</span>' : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="quiz-card">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                    <span class="quiz-badge">${q.category}</span>
                    <span style="font-size:12px;color:#aaa;">${fd(q.posted_date)}</span>
                </div>
                <div class="q-text">${q.question_hi || ''}</div>
                <div class="q-en">${q.question_en || ''}</div>
                <div style="margin-bottom:12px;">${optionsHtml}</div>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-primary" onclick="editQuizQuestion('${q.id}')">✏️ Edit</button>
                    <button class="btn btn-danger" onclick="delQuizQuestion('${q.id}')">🗑️ Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function openAddQuizModal() {
    isQuizEdit = false;
    document.getElementById('quizModalTitle').textContent = '📚 Add Quiz Question';
    document.getElementById('quizForm').reset();
    document.getElementById('quizQId').value = '';
    document.querySelectorAll('.correct-radio').forEach(r => r.classList.remove('selected'));
    document.getElementById('quizModal').classList.add('active');
}

function closeQuizModal() {
    document.getElementById('quizModal').classList.remove('active');
}

function selectCorrect(num) {
    document.querySelectorAll('.correct-radio').forEach(r => r.classList.remove('selected'));
    const radios = document.querySelectorAll('.correct-radio');
    if (radios[num - 1]) radios[num - 1].classList.add('selected');
    // Set radio value
    const radio = document.querySelector(`input[name="correctOpt"][value="${num}"]`);
    if (radio) radio.checked = true;
}

async function editQuizQuestion(id) {
    const { data: q, error } = await sb.from('quiz_questions').select('*').eq('id', id).single();
    if (!q || error) { alert('Question not found!'); return; }

    isQuizEdit = true;
    document.getElementById('quizModalTitle').textContent = '✏️ Edit Quiz Question';
    document.getElementById('quizQId').value = q.id;
    document.getElementById('qCategory').value = q.category || 'GK';

    // Support both old bilingual and new single-field storage
    const qText = q.question_en || q.question_hi || '';
    document.getElementById('qQuestion').value = qText;

    // Options: prefer options_en, fallback to options_hi
    const opts = (q.options_en && q.options_en.length ? q.options_en : q.options_hi) || [];
    document.getElementById('qOpt1').value = opts[0] || '';
    document.getElementById('qOpt2').value = opts[1] || '';
    document.getElementById('qOpt3').value = opts[2] || '';
    document.getElementById('qOpt4').value = opts[3] || '';

    selectCorrect(q.correct_option || 1);
    document.getElementById('quizModal').classList.add('active');
}

document.getElementById('quizForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const correctRadio = document.querySelector('input[name="correctOpt"]:checked');
    if (!correctRadio) { alert('Please select the correct answer option!'); return; }
    const correctOption = parseInt(correctRadio.value);

    const qText = document.getElementById('qQuestion').value.trim();
    const options = [
        document.getElementById('qOpt1').value.trim(),
        document.getElementById('qOpt2').value.trim(),
        document.getElementById('qOpt3').value.trim(),
        document.getElementById('qOpt4').value.trim(),
    ];

    if (options.some(o => !o)) { alert('Please fill all 4 options!'); return; }

    // Store same text in both fields so old clients (if any) still work
    const payload = {
        question_hi: qText,
        question_en: qText,
        options_hi: options,
        options_en: options,
        correct_option: correctOption,
        category: document.getElementById('qCategory').value,
        posted_date: new Date().toISOString(),
    };

    try {
        const qId = document.getElementById('quizQId').value;
        if (isQuizEdit && qId) {
            const { error } = await sb.from('quiz_questions').update(payload).eq('id', qId);
            if (error) throw error;
        } else {
            const { error } = await sb.from('quiz_questions').insert([payload]);
            if (error) throw error;
        }
        closeQuizModal();
        loadQuizQuestions();
        msg('✅ Quiz question saved!', 'success');
    } catch (err) {
        msg('❌ Error: ' + err.message, 'error');
    }
});

async function delQuizQuestion(id) {
    if (!confirm('Delete this quiz question? This will also remove all user attempts for it.')) return;
    try {
        // Delete attempts first
        await sb.from('quiz_attempts').delete().eq('question_id', id);
        const { error } = await sb.from('quiz_questions').delete().eq('id', id);
        if (error) throw error;
        loadQuizQuestions();
        msg('✅ Question deleted', 'success');
    } catch (err) {
        msg('❌ Error: ' + err.message, 'error');
    }
}

// ─────────────────────────────────────────────
// EDUCATION LEVELS
// ─────────────────────────────────────────────
async function loadLvls() {
    const { data } = await sb.from('education_levels').select('*').order('hierarchy');
    document.getElementById('lvlsDisplay').innerHTML = (data || []).map(l =>
        `<div class="item-tag">${l.name} <span style="color:#888;font-size:11px;">(${l.hierarchy})</span><button onclick="delLvl('${l.name}')">×</button></div>`
    ).join('');
}

async function addLvl() {
    const n = document.getElementById('newLevel').value.trim();
    const h = parseInt(document.getElementById('newLevelHierarchy').value);
    if (!n || !h) return alert('Fill both fields');
    const { error } = await sb.from('education_levels').insert([{ name: n, hierarchy: h }]);
    if (!error) {
        document.getElementById('newLevel').value = '';
        document.getElementById('newLevelHierarchy').value = '';
        loadLvls();
        msg('✅ Level added', 'success');
    } else { alert('Error: ' + error.message); }
}

async function delLvl(n) {
    if (!confirm('Delete level and all its fields?')) return;
    await sb.from('education_levels').delete().eq('name', n);
    await sb.from('education_fields').delete().eq('level', n);
    loadLvls();
    msg('✅ Deleted', 'success');
}

// ─────────────────────────────────────────────
// EDUCATION FIELDS
// ─────────────────────────────────────────────
async function loadFlds() {
    const { data: lvls } = await sb.from('education_levels').select('name').order('name');
    document.getElementById('lvlForField').innerHTML = (lvls || []).map(l => `<option value="${l.name}">${l.name}</option>`).join('');
    const { data: flds, error } = await sb.from('education_fields').select('*').order('level, field_name');
    if (error) { console.error('Load error:', error); return; }
    const grouped = {};
    (flds || []).forEach(f => {
        if (!grouped[f.level]) grouped[f.level] = [];
        grouped[f.level].push(f);
    });
    document.getElementById('fldsDisplay').innerHTML = Object.entries(grouped).map(([lvl, fs]) => `
        <div style="margin:15px 0;padding:15px;background:white;border-radius:8px;">
            <h4 style="color:#667eea;margin-bottom:10px;">${lvl}</h4>
            <div class="items-grid">
                ${fs.map(f => `<div class="item-tag">${f.field_name}<button onclick='delFld("${f.id}")'>×</button></div>`).join('')}
            </div>
        </div>
    `).join('');
}

async function addFld() {
    const lvl = document.getElementById('lvlForField').value;
    const n = document.getElementById('newFld').value.trim();
    if (!n) return;
    const { error } = await sb.from('education_fields').insert([{ level: lvl, field_name: n }]);
    if (!error) {
        document.getElementById('newFld').value = '';
        loadFlds();
        msg('✅ Field added', 'success');
    }
}

async function delFld(id) {
    if (!confirm('Delete?')) return;
    const { error } = await sb.from('education_fields').delete().eq('id', id);
    if (error) { alert('Error: ' + error.message); return; }
    await new Promise(r => setTimeout(r, 300));
    await loadFlds();
    msg('✅ Deleted', 'success');
}

// ─────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────
async function loadCats() {
    const { data } = await sb.from('categories').select('*').order('name');
    document.getElementById('catsDisplay').innerHTML = (data || []).map(c =>
        `<div class="item-tag">${c.name}<button onclick="delCat('${c.name}')">×</button></div>`
    ).join('');
}

async function addCat() {
    const n = document.getElementById('newCat').value.trim();
    if (!n) return;
    const { error } = await sb.from('categories').insert([{ name: n }]);
    if (!error) {
        document.getElementById('newCat').value = '';
        loadCats();
        msg('✅ Category added', 'success');
    }
}

async function delCat(n) {
    if (!confirm('Delete?')) return;
    await sb.from('categories').delete().eq('name', n);
    loadCats();
    msg('✅ Deleted', 'success');
}

// ─────────────────────────────────────────────
// STATES
// ─────────────────────────────────────────────
async function loadSts() {
    const { data } = await sb.from('states').select('*').order('name');
    document.getElementById('stsDisplay').innerHTML = (data || []).map(s =>
        `<div class="item-tag">${s.name}<button onclick="delSt('${s.name}')">×</button></div>`
    ).join('');
}

async function addSt() {
    const n = document.getElementById('newState').value.trim();
    if (!n) return;
    const { error } = await sb.from('states').insert([{ name: n }]);
    if (!error) {
        document.getElementById('newState').value = '';
        loadSts();
        msg('✅ State added', 'success');
    }
}

async function delSt(n) {
    if (!confirm('Delete?')) return;
    await sb.from('states').delete().eq('name', n);
    loadSts();
    msg('✅ Deleted', 'success');
}

// ─────────────────────────────────────────────
// AI REWRITE
// ─────────────────────────────────────────────
async function aiRewrite(fieldId) {
    const field = document.getElementById(fieldId);
    const text = field.value.trim();
    if (!text) { alert('Enter text first!'); return; }
    currentField = fieldId;
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Generating...';
    try {
        const { data, error } = await sb.functions.invoke('ai-rewrite', {
            body: { text, fieldType: fieldId === 'description' ? 'description' : 'requirement' }
        });
        if (error) throw error;
        document.getElementById('aiResult').textContent = data.result;
        document.getElementById('aiModal').classList.add('active');
    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '✨ AI Magic';
    }
}

function useAiResult() {
    document.getElementById(currentField).value = document.getElementById('aiResult').textContent;
    closeAiModal();
    msg('✅ AI content applied!', 'success');
}

function closeAiModal() { document.getElementById('aiModal').classList.remove('active'); }

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function msg(t, ty, id = 'message') {
    const m = document.getElementById(id);
    m.textContent = t;
    m.className = `message ${ty}`;
    setTimeout(() => { m.className = 'message'; }, 5000);
}