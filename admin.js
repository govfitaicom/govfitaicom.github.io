const sb = window.supabase.createClient('https://yhgqtbbxsbptssybgbrl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3F0YmJ4c2JwdHNzeWJnYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTQ4NDYsImV4cCI6MjA4MTE3MDg0Nn0.cktVnZkay3MjYIG_v0WJSkotyq79Nnkr3JJn_munDi8');
const ADM = ['sonawalesvijay@gmail.com'];
let selFlds = [], isEdit = false, currentField = '';

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

function switchTab(t) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(t + 'Tab').classList.add('active');
    if (t === 'levels') loadLvls();
    if (t === 'fields') loadFlds();
    if (t === 'cats') loadCats();
    if (t === 'states') loadSts();
}

async function loadLvls() {
    const { data } = await sb.from('education_levels').select('*').order('hierarchy');
    document.getElementById('lvlsDisplay').innerHTML = (data || []).map(l =>
        `<div class="item-tag">${l.name} (${l.hierarchy})<button onclick="delLvl('${l.name}')">×</button></div>`
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
        msg('✅ Added', 'success');
    } else {
        alert('Error: ' + error.message);
    }
}

async function delLvl(n) {
    if (!confirm('Delete?')) return;
    await sb.from('education_levels').delete().eq('name', n);
    await sb.from('education_fields').delete().eq('level', n);
    loadLvls();
    msg('✅ Deleted', 'success');
}

async function loadFlds() {
    // Force fresh data - no cache
    const { data: lvls } = await sb.from('education_levels').select('name').order('name');
    document.getElementById('lvlForField').innerHTML = (lvls || []).map(l =>
        `<option value="${l.name}">${l.name}</option>`
    ).join('');

    // Force fresh data with timestamp to bypass cache
    const { data: flds, error } = await sb
        .from('education_fields')
        .select('*')
        .order('level, field_name');

    if (error) {
        console.error('Load error:', error);
        return;
    }

    console.log('Loaded fields:', flds); // Debug log

    const grouped = {};
    (flds || []).forEach(f => {
        if (!grouped[f.level]) grouped[f.level] = [];
        grouped[f.level].push(f);
    });

    document.getElementById('fldsDisplay').innerHTML = Object.entries(grouped).map(([lvl, fs]) => `
                <div style="margin: 15px 0; padding: 15px; background: white; border-radius: 8px;">
                    <h4 style="color: #667eea; margin-bottom: 10px;">${lvl}</h4>
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
        msg('✅ Added', 'success');
    }
}

async function delFld(id) {
    if (!confirm('Delete?')) return;

    const { error } = await sb.from('education_fields').delete().eq('id', id);

    if (error) {
        alert('Error: ' + error.message);
        return;
    }

    // Wait and reload
    await new Promise(resolve => setTimeout(resolve, 300));
    await loadFlds();
    msg('✅ Deleted', 'success');
}

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
        msg('✅ Added', 'success');
    }
}

async function delCat(n) {
    if (!confirm('Delete?')) return;
    await sb.from('categories').delete().eq('name', n);
    loadCats();
    msg('✅ Deleted', 'success');
}

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
        msg('✅ Added', 'success');
    }
}

async function delSt(n) {
    if (!confirm('Delete?')) return;
    await sb.from('states').delete().eq('name', n);
    loadSts();
    msg('✅ Deleted', 'success');
}

async function loadJobs() {
    let q = sb.from('jobs').select('*').order('posted_date', { ascending: false });
    const { data } = await q;
    const c = document.getElementById('jobsContainer');
    if (!data || !data.length) { c.innerHTML = '<p>No jobs</p>'; return; }
    c.innerHTML = data.map(j => {
        return `
            <div class="job-card">
                <h3 style="color: #667eea;">${j.title}</h3>
                <p>${j.organization} • ${j.post_name}</p>
                <p style="margin-top: 10px;"><b>Start:</b> ${fd(j.application_start_date || j.posted_date)}</p>
                <p><b>Deadline:</b> ${fd(j.application_deadline)}</p>
                <div style="margin-top: 15px;">
                    <button class="btn btn-primary" onclick="editJobById('${j.id}')">Edit</button>
                    <button class="btn btn-danger" onclick="delJob('${j.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
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

function closeJobModal() {
    document.getElementById('jobModal').classList.remove('active');
}

async function popMdl() {
    const { data: lvls } = await sb.from('education_levels').select('name').order('hierarchy');
    document.getElementById('eduReq').innerHTML = (lvls || []).map(l =>
        `<option value="${l.name}">${l.name}</option>`
    ).join('');

    const { data: sts } = await sb.from('states').select('name').order('name');
    document.getElementById('stateSel').innerHTML = (sts || []).map(s =>
        `<option value="${s.name}">${s.name}</option>`
    ).join('');

    const { data: cats } = await sb.from('categories').select('name').order('name');
    document.getElementById('catsCb').innerHTML = (cats || []).map(c =>
        `<label style="margin-right: 15px;"><input type="checkbox" value="${c.name}" class="cat-cb"> ${c.name}</label>`
    ).join('');

    await updFlds();
}

async function updFlds() {
    const lvl = document.getElementById('eduReq').value;
    const { data } = await sb.from('education_fields').select('field_name').eq('level', lvl).order('field_name');
    document.getElementById('fldInput').innerHTML =
        '<option value="">Select</option>' +
        (data || []).map(f => `<option value="${f.field_name}">${f.field_name}</option>`).join('');
}

function addJobFld() {
    const f = document.getElementById('fldInput').value;
    if (f && !selFlds.includes(f)) {
        selFlds.push(f);
        document.getElementById('fldsCont').innerHTML = selFlds.map(x =>
            `<div class="item-tag">${x}<button type="button" onclick="rmFld('${x}')">×</button></div>`
        ).join('');
    }
}

function rmFld(f) {
    selFlds = selFlds.filter(x => x !== f);
    document.getElementById('fldsCont').innerHTML = selFlds.map(x =>
        `<div class="item-tag">${x}<button type="button" onclick="rmFld('${x}')">×</button></div>`
    ).join('');
}

async function editJobById(id) {
    // Fetch fresh data from database
    const { data: jobs } = await sb.from('jobs').select('*').eq('id', id).single();
    if (!jobs) {
        alert('Job not found!');
        return;
    }
    
    const j = jobs;
    isEdit = true;
    document.getElementById('modalTitle').textContent = 'Edit';
    document.getElementById('jobId').value = j.id;
    document.getElementById('title').value = j.title;
    document.getElementById('organization').value = j.organization;
    document.getElementById('postName').value = j.post_name;
    document.getElementById('description').value = j.description || '';
    document.getElementById('minAge').value = j.min_age || '';
    document.getElementById('maxAge').value = j.max_age || '';
    document.getElementById('minPct').value = j.min_percentage;
    document.getElementById('addReq').value = j.additional_requirements || '';
    document.getElementById('startDt').value = (j.application_start_date || j.posted_date).split('T')[0];
    document.getElementById('deadDt').value = j.application_deadline.split('T')[0];
    document.getElementById('admitDt').value = j.admit_card_date || '';
    document.getElementById('resDt').value = j.result_date || '';
    document.getElementById('link').value = j.apply_link;
    selFlds = j.education_fields || [];
    await popMdl();
    document.getElementById('eduReq').value = j.education_required;
    await updFlds();
    document.getElementById('stateSel').value = j.state;
    document.getElementById('fldsCont').innerHTML = selFlds.map(x =>
        `<div class="item-tag">${x}<button type="button" onclick="rmFld('${x}')">×</button></div>`
    ).join('');
    document.querySelectorAll('.cat-cb').forEach(cb => {
        cb.checked = j.categories?.includes(cb.value);
    });
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
        msg('✅ Saved', 'success');
    } catch (e) {
        msg('❌ ' + e.message, 'error');
    }
});

async function delJob(id) {
    if (!confirm('Delete?')) return;
    await sb.from('jobs').delete().eq('id', id);
    loadJobs();
    msg('✅ Deleted', 'success');
}

function msg(t, ty, id = 'message') {
    const m = document.getElementById(id);
    m.textContent = t;
    m.className = `message ${ty}`;
    setTimeout(() => m.className = 'message', 5000);
}

async function logout() {
    await sb.auth.signOut();
    location.reload();
}

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
            body: { 
                text: text, 
                fieldType: fieldId === 'description' ? 'description' : 'requirement' 
            }
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
    msg('✅ AI applied!', 'success');
}

function closeAiModal() {
    document.getElementById('aiModal').classList.remove('active');
}