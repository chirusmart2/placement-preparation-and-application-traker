let applications = [];
let authToken = sessionStorage.getItem('pathway-auth-token') || '';
let authMode = 'login';
let currentUser = null;
let recommendation = null;
let applicationFilter = 'all';
const esc = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const formatDate = (value, options = { month: 'short', day: 'numeric' }) => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', options);
const dateOnly = (value) => new Date(`${value}T00:00:00`);
const formatGreeting = (name) => {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${greeting}, ${name.split(/\s+/)[0]}`;
};
const getLogoClass = (company) => {
  const name = company.toLowerCase();
  if (name.includes('figma')) return 'logo-figma';
  if (name.includes('vercel')) return 'logo-vercel';
  if (name.includes('stripe')) return 'logo-stripe';
  if (name.includes('northstar')) return 'logo-northstar';
  return 'logo-acme';
};
function renderApplications() {
  const filtered = applications.filter((app) => {
    if (applicationFilter === 'all') return true;
    if (applicationFilter === 'due') {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const soon = new Date(today); soon.setDate(soon.getDate() + 7);
      const deadline = dateOnly(app.deadline);
      return deadline >= today && deadline <= soon;
    }
    return app.status === applicationFilter;
  });
  const rows = filtered.map((app) => {
    const logo = app.logo || app.company.trim().charAt(0).toUpperCase();
    const logoClass = app.logoClass || getLogoClass(app.company);
    const statusClass = app.status === 'In review' ? 'review' : app.status.toLowerCase();
    return `<tr><td><div class="company-cell"><span class="company-logo ${logoClass}">${esc(logo)}</span><span class="company-name"><strong>${esc(app.company)}</strong><small>${esc(app.role)}</small></span></div></td><td><span class="status status-${esc(statusClass)}">${esc(app.status)}</span></td><td class="deadline">${formatDate(app.deadline)}</td><td><button class="row-menu" aria-label="Remove ${esc(app.company)} application" data-remove="${esc(app.id)}">···</button></td></tr>`;
  }).join('');
  document.querySelector('#application-rows').innerHTML = rows;
  document.querySelector('#nav-count').textContent = String(applications.length);
  document.querySelector('#applications-caption').textContent = applicationFilter === 'all'
    ? `${applications.length} saved ${applications.length === 1 ? 'opportunity' : 'opportunities'}, synced to your account.`
    : `${filtered.length} ${applicationFilter === 'due' ? 'deadlines in the next 7 days' : `${applicationFilter.toLowerCase()} applications`}.`;
  document.querySelector('#show-all-applications').hidden = applicationFilter === 'all';
  if (!filtered.length) {
    document.querySelector('#application-rows').innerHTML = `<tr><td colspan="4" class="empty-row">${applications.length ? 'No applications match this filter.' : 'No applications yet. Add your first opportunity.'}</td></tr>`;
  }
  updateStats();
  renderEvents();
}
function updateStats() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const inSevenDays = new Date(today); inSevenDays.setDate(inSevenDays.getDate() + 7);
  const interviews = applications.filter((app) => app.status === 'Interview').length;
  const offers = applications.filter((app) => app.status === 'Offer').length;
  const deadlines = applications.filter((app) => { const due = dateOnly(app.deadline); return due >= today && due <= inSevenDays; }).length;
  document.querySelector('#application-total').textContent = applications.length;
  document.querySelector('#interview-total').textContent = interviews;
  document.querySelector('#offer-total').textContent = offers;
  document.querySelector('#deadline-total').textContent = deadlines;
}
function renderEvents() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = applications.filter((app) => dateOnly(app.deadline) >= today)
    .slice().sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5);
  const events = upcoming.map((app) => {
    const date = new Date(`${app.deadline}T12:00:00`);
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const day = date.toLocaleDateString('en-US', { day: 'numeric' });
    const tag = app.status === 'Interview' ? 'Interview' : 'Deadline';
    return `<div class="event"><div class="date-box"><strong>${day}</strong><small>${weekday}</small></div><div class="event-copy"><strong>${esc(app.company)} · ${tag.toLowerCase()}</strong><span>${tag === 'Interview' ? 'Technical interview' : 'Application deadline'} · ${formatDate(app.deadline, { month: 'long', day: 'numeric' })}</span></div><span class="event-tag">${tag}</span></div>`;
  }).join('');
  document.querySelector('#event-list').innerHTML = events || '<p class="welcome-sub">No upcoming dates in your saved applications. Add an opportunity with a deadline to see it here.</p>';
}
function renderAccount() {
  const emailName = currentUser.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const name = currentUser.full_name?.trim() || emailName;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
  document.querySelector('#profile-name').textContent = name;
  document.querySelector('#profile-email').textContent = currentUser.email;
  document.querySelector('#profile-avatar').textContent = initials;
  document.querySelector('#top-profile-button').textContent = initials;
  document.querySelector('#welcome-title').textContent = formatGreeting(name);
  document.querySelector('#welcome-subtitle').textContent = currentUser.target_role
    ? `Your ${currentUser.target_role} placement plan, synced to your account.`
    : 'Your applications and progress, synced to your account.';
  document.querySelector('#sidebar-target').textContent = currentUser.target_role || 'Set your target role';
  document.querySelector('#sidebar-university').textContent = currentUser.university || 'Add your university and graduation date to your profile.';
  document.querySelector('#practice-role').textContent = currentUser.target_role || 'Choose a target role in profile';
  document.querySelector('#practice-subtitle').textContent = currentUser.target_role
    ? `Practice questions for ${currentUser.target_role}.` : 'Add a target role to personalize your practice.';
  if (currentUser.graduation_date) {
    const days = Math.ceil((dateOnly(currentUser.graduation_date) - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
    document.querySelector('#sidebar-university').textContent = `${currentUser.university || 'University not set'} · Graduation ${formatDate(currentUser.graduation_date, { month: 'short', year: 'numeric' })} (${Math.max(0, days)} days)`;
  }
  const profileForm = document.querySelector('#profile-form');
  for (const field of ['full_name', 'university', 'target_role', 'graduation_date']) {
    profileForm.elements[field].value = currentUser[field] || '';
  }
}
function renderRecommendation() {
  const titles = recommendation?.topics || [];
  document.querySelector('#recommendation-title').textContent = recommendation?.title || 'Set a target role in your profile';
  document.querySelector('#recommendation-match').textContent = recommendation?.matched_roles
    ? `Matches ${recommendation.matched_roles} of your saved application roles`
    : 'Add a target role and applications to see relevant matches.';
  document.querySelector('#match-pill').textContent = recommendation?.match_boost == null ? '—' : `${recommendation.match_boost}% match`;
  document.querySelector('#match-meter').style.width = `${recommendation?.match_boost ?? 0}%`;
  document.querySelector('#recommendation-topics').textContent = titles.length
    ? `Suggested next · ${titles.length} topics: ${titles[0]}` : 'Suggested topics will appear here';
}
async function loadDashboard() {
  if (!authToken) {
    document.querySelector('#auth-gate').hidden = false;
    return;
  }
  try {
    const headers = { Authorization: `Bearer ${authToken}` };
    const [meResponse, applicationResponse, recommendationResponse] = await Promise.all([
      fetch('/api/auth/me', { headers }),
      fetch('/api/applications', { headers }),
      fetch('/api/recommendations', { headers })
    ]);
    if ([meResponse, applicationResponse, recommendationResponse].some((response) => response.status === 401)) {
      authToken = '';
      sessionStorage.removeItem('pathway-auth-token');
      document.querySelector('#auth-gate').hidden = false;
      return;
    }
    if (!meResponse.ok || !applicationResponse.ok || !recommendationResponse.ok) throw new Error('The API did not respond successfully.');
    currentUser = (await meResponse.json()).user;
    applications = await applicationResponse.json();
    recommendation = await recommendationResponse.json();
    document.querySelector('#auth-gate').hidden = true;
    renderAccount();
    renderApplications();
    renderRecommendation();
  } catch (error) {
    document.querySelector('#application-rows').innerHTML = `<tr><td colspan="4" class="deadline">Could not connect to the API. Start the app with <code>python server.py</code> and refresh.</td></tr>`;
    console.error(error);
  }
}
function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === 'register';
  document.querySelector('#auth-gate').classList.toggle('register-mode', registering);
  document.querySelector('#register-fields').hidden = !registering;
  document.querySelectorAll('#register-fields input').forEach((field) => { field.required = registering; });
  document.querySelector('#auth-title').textContent = registering ? 'Create your account' : 'Welcome back';
  document.querySelector('#auth-subtitle').textContent = registering ? 'Create a private space for your placement journey.' : 'Sign in to keep your applications private and in sync.';
  document.querySelector('#auth-submit').innerHTML = registering ? 'Create account <span>→</span>' : 'Sign in <span>→</span>';
  document.querySelector('#auth-switch-copy').textContent = registering ? 'Already have an account?' : 'New to Pathway?';
  document.querySelector('#auth-toggle').textContent = registering ? 'Sign in' : 'Create an account';
  document.querySelector('#auth-form [name="password"]').autocomplete = registering ? 'new-password' : 'current-password';
  document.querySelector('#auth-form [name="password"]').minLength = registering ? 10 : 1;
  document.querySelector('#auth-error').hidden = true;
}
document.querySelector('#auth-toggle').addEventListener('click', () => {
  setAuthMode(authMode === 'login' ? 'register' : 'login');
});
document.querySelector('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const error = document.querySelector('#auth-error');
  const submit = document.querySelector('#auth-submit');
  submit.disabled = true;
  error.hidden = true;
  try {
    const response = await fetch(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email').trim(), password: form.get('password'),
        full_name: form.get('full_name'), university: form.get('university'),
        target_role: form.get('target_role'), graduation_date: form.get('graduation_date')
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Authentication failed.');
    authToken = data.token;
    sessionStorage.setItem('pathway-auth-token', authToken);
    formElement.reset();
    setAuthMode('login');
    await loadDashboard();
  } catch (caught) {
    error.textContent = caught.message;
    error.hidden = false;
  } finally {
    submit.disabled = false;
  }
});
document.querySelector('#logout-button').addEventListener('click', () => {
  authToken = '';
  sessionStorage.removeItem('pathway-auth-token');
  applications = [];
  currentUser = null;
  recommendation = null;
  document.querySelector('#auth-gate').hidden = false;
  document.querySelector('#register-fields').hidden = true;
  document.querySelectorAll('#register-fields input').forEach((field) => { field.required = false; });
  setAuthMode('login');
});
const profileDialog = document.querySelector('#profile-dialog');
const openProfile = () => { if (currentUser) renderAccount(); document.querySelector('#profile-error').hidden = true; profileDialog.showModal(); };
document.querySelectorAll('[data-open-profile], #profile-button, #top-profile-button').forEach((button) => button.addEventListener('click', openProfile));
document.querySelector('[data-close-profile]').addEventListener('click', () => profileDialog.close());
document.querySelector('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const error = document.querySelector('#profile-error');
  error.hidden = true;
  try {
    const response = await fetch('/api/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(Object.fromEntries(form.entries())) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not save your profile.');
    currentUser = data.user;
    await loadDashboard(true);
    profileDialog.close();
  } catch (caught) { error.textContent = caught.message; error.hidden = false; }
});
document.querySelectorAll('.stat-card[data-filter]').forEach((card) => card.addEventListener('click', () => {
  applicationFilter = card.dataset.filter;
  renderApplications();
}));
document.querySelector('#show-all-applications').addEventListener('click', () => { applicationFilter = 'all'; renderApplications(); });
window.addEventListener('hashchange', () => {
  const section = location.hash.slice(1) || 'overview';
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${section}`));
  document.querySelector('#breadcrumb-current').textContent = ({ overview: 'Overview', applications: 'Applications', deadlines: 'Coming up', practice: 'Interview practice', skills: 'Skill roadmap' })[section] || 'Overview';
});
const applicationDialog = document.querySelector('#application-dialog');
const openApplicationDialog = () => applicationDialog.showModal();
document.querySelector('#add-application').addEventListener('click', openApplicationDialog);
document.querySelector('#add-inline').addEventListener('click', openApplicationDialog);
document.querySelector('#application-form').addEventListener('submit', (event) => {
  if (event.submitter?.classList.contains('dialog-close')) return;
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  fetch('/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ company: form.get('company').trim(), role: form.get('role').trim(), status: form.get('status'), deadline: form.get('deadline') }) })
    .then(async (response) => { if (!response.ok) throw new Error((await response.json()).error || 'Could not save application.'); return response.json(); })
    .then(() => { formElement.reset(); applicationDialog.close(); return loadDashboard(); })
    .catch((error) => alert(error.message));
});
document.querySelector('#application-rows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove]');
  if (!button) return;
  fetch(`/api/applications/${encodeURIComponent(button.dataset.remove)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` } })
    .then((response) => { if (!response.ok) throw new Error('Could not remove application.'); return loadDashboard(); })
    .catch((error) => alert(error.message));
});

const practiceDialog = document.querySelector('#practice-dialog');
const defaultQuestions = [
  'Tell me about a project you’re proud of.',
  'How would you find and fix a performance bottleneck in a web app?',
  'Tell me about a time you got feedback that changed your approach.'
];
const roleQuestions = {
  engineering: ['Walk me through a technical project you built and a tradeoff you made.', 'How would you debug a slow API endpoint?', 'Tell me about a time you improved reliability or performance.'],
  data: ['How would you validate a dataset before using it?', 'Describe an analysis that changed a decision.', 'How would you explain an unexpected metric to a non-technical teammate?'],
  product: ['How would you decide which user problem to solve first?', 'Describe a product decision you made with incomplete data.', 'How would you measure whether a new feature helped users?'],
  general: defaultQuestions
};
let questions = defaultQuestions;
let questionIndex = 0;
document.querySelector('#start-practice').addEventListener('click', () => {
  const target = (currentUser?.target_role || '').toLowerCase();
  const category = /data|analyst|analytics/.test(target) ? 'data' : /product|design|ux|marketing/.test(target) ? 'product' : /engineer|developer|software|backend|frontend/.test(target) ? 'engineering' : 'general';
  questions = roleQuestions[category];
  document.querySelector('.practice-dialog .eyebrow').textContent = `PRACTICE SESSION · ${currentUser?.target_role || 'GENERAL'}`;
  questionIndex = 0; showQuestion(); practiceDialog.showModal();
});
function showQuestion() {
  document.querySelector('#question-title').textContent = questions[questionIndex];
  document.querySelector('.question-progress > span').textContent = `QUESTION ${questionIndex + 1} OF ${questions.length}`;
  document.querySelector('.progress-track i').style.width = `${((questionIndex + 1) / questions.length) * 100}%`;
  document.querySelector('#next-question').innerHTML = questionIndex === questions.length - 1 ? 'Finish session <span>✓</span>' : 'Next question <span>→</span>';
  document.querySelector('#hint-text').hidden = true;
  document.querySelector('.practice-dialog textarea').value = '';
}
document.querySelector('#next-question').addEventListener('click', () => {
  if (questionIndex === questions.length - 1) { practiceDialog.close(); return; }
  questionIndex += 1;
  showQuestion();
});
document.querySelector('#show-hint').addEventListener('click', () => { document.querySelector('#hint-text').hidden = !document.querySelector('#hint-text').hidden; });

document.querySelector('#today-label').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
setAuthMode('login');
loadDashboard();
