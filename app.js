const SUPABASE_URL = 'https://yhgqtbbxsbptssybgbrl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3F0YmJ4c2JwdHNzeWJnYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTQ4NDYsImV4cCI6MjA4MTE3MDg0Nn0.cktVnZkay3MjYIG_v0WJSkotyq79Nnkr3JJn_munDi8';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let userProfile = null;
let pinnedJobs = [];
let isLoginMode = false;
let currentTab = 'all';
let educationFieldsMap = {};
let configCategories = [];
let configStates = [];
let educationLevels = [];

async function loadAppConfig() {
    try {
        const { data: levels } = await supabaseClient.from('education_levels').select('*').order('name');
        educationLevels = (levels || []).map(l => l.name);
        
        const { data: fields } = await supabaseClient.from('education_fields').select('*');
        educationFieldsMap = {};
        (fields || []).forEach(f => {
            if (!educationFieldsMap[f.level]) educationFieldsMap[f.level] = [];
            educationFieldsMap[f.level].push(f.field_name);
        });

        const { data: cats } = await supabaseClient.from('categories').select('name');
        configCategories = (cats || []).map(c => c.name);

        const { data: sts } = await supabaseClient.from('states').select('name');
        configStates = (sts || []).map(s => s.name);
    } catch (e) {
        console.error('Config load error:', e);
    }
}

loadAppConfig();

function updateFields() {
    const level = document.getElementById('educationLevel').value;
    const fieldGroup = document.getElementById('fieldGroup');
    const fieldSelect = document.getElementById('educationField');

    if (level === '10th' || level === '12th') {
        fieldGroup.classList.add('hidden');
        fieldSelect.removeAttribute('required');
    } else if (educationFieldsMap[level]) {
        fieldGroup.classList.remove('hidden');
        fieldSelect.setAttribute('required', 'required');
        fieldSelect.innerHTML = '<option value="">Select Field</option>' +
            educationFieldsMap[level].map(f => `<option value="${f}">${f}</option>`).join('');
    }
}

checkAuth();
loadAllJobs();

async function checkAuth() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        currentUser = user;
        await loadUserProfile();
        await loadPinnedJobs();
    }
    updateAuthButton();
    updateGetStartedButton();
}

async function loadUserProfile() {
    try {
        const { data, error } = await supabaseClient
            .from('users_profiles')
            .select('*')
            .eq('user_id', currentUser.id)
            .limit(1)
            .single();

        if (data) {
            userProfile = data;
        }
    } catch (error) {
        console.log('No profile found');
    }
}

async function loadPinnedJobs() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('pinned_jobs')
            .select('job_id')
            .eq('user_id', currentUser.id);
        
        if (data) {
            pinnedJobs = data.map(p => p.job_id);
        }
    } catch (error) {
        console.log('No pinned jobs');
    }
}

async function togglePinJob(jobId) {
    if (!currentUser) {
        alert('Please login to pin jobs');
        openAuthModal();
        return;
    }
    
    try {
        if (pinnedJobs.includes(jobId)) {
            const { error } = await supabaseClient
                .from('pinned_jobs')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('job_id', jobId);
            
            if (error) throw error;
            pinnedJobs = pinnedJobs.filter(id => id !== jobId);
            alert('✅ Job unpinned');
        } else {
            const { error } = await supabaseClient
                .from('pinned_jobs')
                .insert([{ user_id: currentUser.id, job_id: jobId }]);
            
            if (error) throw error;
            pinnedJobs.push(jobId);
            alert('✅ Job pinned! View in your profile.');
        }
        
        if (currentTab === 'recommended') {
            loadRecommendedJobs();
        } else {
            loadAllJobs();
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function updateAuthButton() {
    const btn = document.getElementById('authButton');
    if (currentUser && userProfile) {
        btn.innerHTML = `<div class="profile-icon" onclick="openProfileMenu()">👤</div>`;
    } else {
        btn.innerHTML = '<button class="btn btn-primary" onclick="openAuthModal()">Login / Sign Up</button>';
    }
}

function openProfileMenu() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 300px;">
            <span class="close-modal" onclick="this.parentElement.parentElement.remove()">&times;</span>
            <h2 style="margin-bottom: 20px;">Profile Menu</h2>
            <button class="btn btn-primary" onclick="showProfilePage(); this.closest('.modal').remove();" style="width: 100%; margin-bottom: 10px;">👤 My Profile</button>
            <button class="btn btn-primary" onclick="showPinnedJobs(); this.closest('.modal').remove();" style="width: 100%; margin-bottom: 10px; background: #ffc107; color: #333;">📌 Saved Jobs (${pinnedJobs.length})</button>
            <button class="btn btn-apply" onclick="logout(); this.closest('.modal').remove();" style="width: 100%; background: #dc3545;">🚪 Logout</button>
        </div>
    `;
    document.body.appendChild(modal);
}

function updateGetStartedButton() {
    const btn = document.getElementById('getStartedBtn');
    if (currentUser && userProfile) {
        btn.onclick = () => {
            showTab('recommended');
            document.getElementById('jobs').scrollIntoView({ behavior: 'smooth' });
        };
    } else {
        btn.onclick = openAuthModal;
    }
}

function showProfilePage() {
    document.getElementById('profileSection').classList.remove('hidden');
    document.getElementById('jobs').classList.add('hidden');
    const pinnedSection = document.getElementById('pinnedJobsSection');
    if (pinnedSection) pinnedSection.classList.add('hidden');
    displayProfile();
    document.getElementById('profileSection').scrollIntoView({ behavior: 'smooth' });
}

async function showPinnedJobs() {
    document.getElementById('jobs').classList.add('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    
    let pinnedSection = document.getElementById('pinnedJobsSection');
    if (!pinnedSection) {
        pinnedSection = document.createElement('div');
        pinnedSection.id = 'pinnedJobsSection';
        pinnedSection.className = 'container';
        pinnedSection.innerHTML = `
            <h2 class="section-title">📌 My Saved Jobs</h2>
            <div id="pinnedJobsContainer"></div>
            <button class="btn btn-primary" onclick="showTab('all')" style="margin-top: 20px; margin-bottom: 60px;">← Back to All Jobs</button>
        `;
        document.getElementById('jobs').parentElement.insertBefore(pinnedSection, document.getElementById('jobs').nextSibling);
    }
    
    pinnedSection.classList.remove('hidden');
    pinnedSection.scrollIntoView({ behavior: 'smooth' });
    
    if (pinnedJobs.length === 0) {
        document.getElementById('pinnedJobsContainer').innerHTML = `
            <div class="loading"><p>No pinned jobs yet. Pin jobs to save them for later!</p></div>
        `;
        return;
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('jobs')
            .select('*')
            .in('id', pinnedJobs);
        
        if (error) throw error;
        renderJobs(data, 'pinnedJobsContainer', true);
    } catch (error) {
        console.error(error);
    }
}

function showTab(tab) {
    currentTab = tab;
    const tabRecommended = document.getElementById('tabRecommended');
    const tabAll = document.getElementById('tabAll');
    const recommendedSection = document.getElementById('recommendedJobsSection');
    const allSection = document.getElementById('allJobsSection');
    const pinnedSection = document.getElementById('pinnedJobsSection');

    document.getElementById('jobs').classList.remove('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    if (pinnedSection) pinnedSection.classList.add('hidden');

    if (tab === 'recommended') {
        tabRecommended.classList.add('active');
        tabAll.classList.remove('active');
        recommendedSection.classList.remove('hidden');
        allSection.classList.add('hidden');

        if (currentUser && userProfile) {
            loadRecommendedJobs();
        } else {
            document.getElementById('recommendedJobs').innerHTML = `
                <div class="loading">
                    <p style="margin-bottom: 20px;">Please login and complete your profile to see personalized job recommendations</p>
                    <button class="btn btn-primary" onclick="openAuthModal()">Login / Sign Up</button>
                </div>
            `;
        }
    } else {
        tabRecommended.classList.remove('active');
        tabAll.classList.add('active');
        recommendedSection.classList.add('hidden');
        allSection.classList.remove('hidden');
    }
}

async function loadAllJobs() {
    try {
        const { data, error } = await supabaseClient
            .from('jobs')
            .select('*')
            .order('posted_date', { ascending: false });

        if (error) throw error;
        renderJobs(data, 'allJobs');
    } catch (error) {
        console.error(error);
        document.getElementById('allJobs').innerHTML = '<div class="loading">Error loading jobs. Please refresh the page.</div>';
    }
}

async function loadRecommendedJobs() {
    if (!userProfile) return;

    document.getElementById('recommendedJobs').innerHTML = '<div class="loading">Loading your recommended jobs...</div>';

    try {
        const { data: levelsData } = await supabaseClient
            .from('education_levels')
            .select('name, hierarchy')
            .order('hierarchy');
        
        const educationLevelHierarchy = {};
        (levelsData || []).forEach(l => {
            educationLevelHierarchy[l.name] = l.hierarchy;
        });

        const { data: allJobs, error } = await supabaseClient
            .from('jobs')
            .select('*')
            .gte('application_deadline', new Date().toISOString())
            .order('posted_date', { ascending: false });

        if (error) throw error;

        const matched = allJobs.filter(job => {
            if (job.min_age && userProfile.age < job.min_age) return false;
            if (job.max_age && userProfile.age > job.max_age) return false;

            const userLevel = educationLevelHierarchy[userProfile.education_level] || 0;
            const jobLevel = educationLevelHierarchy[job.education_required] || 0;
            if (userLevel < jobLevel) return false;

            if (job.education_fields?.length && userProfile.education_field) {
                if (!job.education_fields.includes(userProfile.education_field)) return false;
            }

            if (userProfile.percentage < job.min_percentage) return false;

            if (job.categories?.length && !job.categories.includes(userProfile.category)) return false;

            if (job.state !== 'All India' && job.state !== userProfile.state) return false;

            return true;
        });

        renderJobs(matched, 'recommendedJobs');
    } catch (error) {
        console.error(error);
        document.getElementById('recommendedJobs').innerHTML = '<div class="loading">Error loading jobs</div>';
    }
}

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

function getJobUrl(jobId, jobTitle) {
    const slug = generateJobSlug(jobTitle);
    const shortId = getShortId(jobId);
    return `job-details.html?job=${slug}&id=${shortId}`;
}

function renderJobs(jobs, containerId, isPinnedView = false) {
    const container = document.getElementById(containerId);

    if (jobs.length === 0) {
        container.innerHTML = `<div class="loading"><p>No jobs found</p></div>`;
        return;
    }

    container.innerHTML = jobs.map(job => {
        const description = job.description || `${job.organization} invites applications for ${job.post_name}.`;
        const shortDesc = description.length > 150 ? description.substring(0, 150) + '...' : description;
        const isPinned = pinnedJobs.includes(job.id);
        const jobUrl = getJobUrl(job.id, job.title);
        
        return `
        <article class="job-card" itemscope itemtype="https://schema.org/JobPosting">
            <meta itemprop="datePosted" content="${job.posted_date}" />
            <meta itemprop="validThrough" content="${job.application_deadline}" />
            
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div class="job-title" itemprop="title">
                    <a href="${jobUrl}" style="color: #667eea; text-decoration: none;">${job.title}</a>
                </div>
                ${currentUser ? `
                <button onclick="togglePinJob('${job.id}')" style="background: none; border: none; font-size: 24px; cursor: pointer; padding: 0 10px;">
                    ${isPinned ? '📌' : '📍'}
                </button>
                ` : ''}
            </div>
            
            <div class="job-org" itemprop="hiringOrganization" itemscope itemtype="https://schema.org/Organization">
                <span itemprop="name">${job.organization}</span> • ${job.post_name}
            </div>
            
            <div itemprop="description" style="color: #666; margin: 10px 0; font-size: 14px;">${shortDesc}</div>
            
            <div class="job-meta">
                <span>📅 Start: ${formatDate(job.application_start_date || job.posted_date)}</span>
                <span>⏰ Deadline: ${formatDate(job.application_deadline)}</span>
                <span itemprop="educationRequirements">🎓 ${job.education_required}</span>
                <span itemprop="jobLocation" itemscope itemtype="https://schema.org/Place">
                    <span itemprop="address">📍 ${job.state}</span>
                </span>
                ${job.min_age || job.max_age ? `<span>👤 Age: ${job.min_age || 'N/A'}-${job.max_age || 'N/A'}</span>` : ''}
                <span>📊 Min ${job.min_percentage || 0}%</span>
            </div>
            
            ${job.admit_card_date ? `<div style="margin: 5px 0; color: #666; font-size: 14px;">🎫 Admit Card: ${job.admit_card_date}</div>` : ''}
            ${job.result_date ? `<div style="margin: 5px 0; color: #666; font-size: 14px;">📋 Result: ${job.result_date}</div>` : ''}
            
            ${job.education_fields?.length ? `
                <div style="margin: 10px 0;">
                    ${job.education_fields.map(f => `<span class="badge">${f}</span>`).join('')}
                </div>
            ` : ''}
            
            <div style="display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap;">
                <a href="${jobUrl}" class="btn-apply" style="flex: 1; text-align: center; min-width: 120px;">View Details →</a>
                <button onclick="shareJob('${job.id}', '${job.title.replace(/'/g, "\\'")}', '${jobUrl}')" class="btn-apply" style="flex: 0; background: #4CAF50; padding: 0 20px;">
                    📤 Share
                </button>
            </div>
        </article>
    `;
    }).join('');
    
    if (containerId === 'allJobs') {
        const seoLinks = document.getElementById('seoJobLinks');
        if (seoLinks) {
            seoLinks.innerHTML = jobs.map(job => {
                const jobUrl = getJobUrl(job.id, job.title);
                return `<a href="${jobUrl}">${job.title}</a><br>`;
            }).join('');
        }
    }
}

function shareJob(jobId, jobTitle, jobUrl) {
    const fullUrl = `${window.location.origin}/${jobUrl}`;
    const shareText = `🎯 ${jobTitle}

🔗 ${fullUrl}

📱 SarkariAI - AI job recommendations
#SarkariAI #GovernmentJobs`;

    if (navigator.share) {
        navigator.share({
            title: jobTitle,
            text: shareText,
            url: fullUrl
        }).catch(err => console.log('cancelled'));
    } else {
        navigator.clipboard.writeText(shareText).then(() => {
            alert('✅ Link copied!');
        });
    }
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function openAuthModal() {
    document.getElementById('authModal').classList.add('active');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');
}

function toggleAuthMode(e) {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    if (isLoginMode) {
        document.getElementById('authTitle').textContent = 'Login';
        document.getElementById('authBtn').textContent = 'Login';
        document.getElementById('authToggleText').textContent = "Don't have an account?";
        e.target.textContent = 'Sign Up';
    } else {
        document.getElementById('authTitle').textContent = 'Create Account';
        document.getElementById('authBtn').textContent = 'Sign Up';
        document.getElementById('authToggleText').textContent = 'Already have an account?';
        e.target.textContent = 'Login';
    }
}

document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('authBtn');
    btn.disabled = true;
    btn.textContent = 'Please wait...';

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        if (isLoginMode) {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            currentUser = data.user;
            await loadUserProfile();
            await loadPinnedJobs();
            closeAuthModal();
            updateAuthButton();
            updateGetStartedButton();
            if (userProfile) {
                showTab('recommended');
            } else {
                alert('Welcome! Please complete your profile to get personalized job recommendations.');
                openProfileModal();
            }
        } else {
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) throw error;
            currentUser = data.user;
            closeAuthModal();
            alert('Account created successfully! Please complete your profile.');
            openProfileModal();
        }
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = isLoginMode ? 'Login' : 'Sign Up';
    }
});

async function openProfileModal() {
    await loadAppConfig();
    
    const levelSelect = document.getElementById('educationLevel');
    levelSelect.innerHTML = '<option value="">Select</option>' + educationLevels.map(l => `<option value="${l}">${l}</option>`).join('');
    
    const categorySelect = document.getElementById('category');
    categorySelect.innerHTML = configCategories.map(c => `<option value="${c}">${c}</option>`).join('');
    
    const stateSelect = document.getElementById('state');
    stateSelect.innerHTML = configStates.map(s => `<option value="${s}">${s}</option>`).join('');
    
    document.getElementById('profileModal').classList.add('active');
    
    if (userProfile) {
        document.getElementById('fullName').value = userProfile.full_name;
        document.getElementById('phone').value = userProfile.phone || '';
        document.getElementById('age').value = userProfile.age;
        document.getElementById('educationLevel').value = userProfile.education_level;
        updateFields();
        document.getElementById('educationField').value = userProfile.education_field || '';
        document.getElementById('percentage').value = userProfile.percentage;
        document.getElementById('category').value = userProfile.category;
        document.getElementById('state').value = userProfile.state;
    }
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('active');
}

function openEditProfile() {
    openProfileModal();
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('profileBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const level = document.getElementById('educationLevel').value;
    const profileData = {
        user_id: currentUser.id,
        full_name: document.getElementById('fullName').value,
        email: currentUser.email,
        phone: document.getElementById('phone').value || null,
        age: parseInt(document.getElementById('age').value),
        education_level: level,
        education_field: (level !== '10th' && level !== '12th') ? document.getElementById('educationField').value : null,
        percentage: parseFloat(document.getElementById('percentage').value),
        category: document.getElementById('category').value,
        state: document.getElementById('state').value
    };

    try {
        const { error } = await supabaseClient
            .from('users_profiles')
            .upsert(profileData, { onConflict: 'user_id' });

        if (error) throw error;

        userProfile = profileData;
        closeProfileModal();
        updateAuthButton();
        updateGetStartedButton();
        alert('Profile saved successfully!');
        showTab('recommended');
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Profile';
    }
});

function displayProfile() {
    if (!userProfile) return;

    document.getElementById('profileInfo').innerHTML = `
        <div class="profile-info">
            <div class="info-item"><div class="info-label">Name</div><div class="info-value">${userProfile.full_name}</div></div>
            <div class="info-item"><div class="info-label">Email</div><div class="info-value">${userProfile.email}</div></div>
            ${userProfile.phone ? `<div class="info-item"><div class="info-label">Phone</div><div class="info-value">${userProfile.phone}</div></div>` : ''}
            <div class="info-item"><div class="info-label">Age</div><div class="info-value">${userProfile.age} years</div></div>
            <div class="info-item"><div class="info-label">Education</div><div class="info-value">${userProfile.education_level}${userProfile.education_field ? ' - ' + userProfile.education_field : ''}</div></div>
            <div class="info-item"><div class="info-label">Percentage</div><div class="info-value">${userProfile.percentage}%</div></div>
            <div class="info-item"><div class="info-label">Category</div><div class="info-value">${userProfile.category}</div></div>
            <div class="info-item"><div class="info-label">Preferred State</div><div class="info-value">${userProfile.state}</div></div>
            <div class="info-item"><div class="info-label">Pinned Jobs</div><div class="info-value">${pinnedJobs.length} jobs</div></div>
        </div>
    `;
}

async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        await supabaseClient.auth.signOut();
        currentUser = null;
        userProfile = null;
        pinnedJobs = [];
        updateAuthButton();
        updateGetStartedButton();
        showTab('all');
        alert('Logged out successfully!');
        window.location.reload();
    }
}