let applications = [];
let authToken = sessionStorage.getItem('pathway-auth-token') || '';
let authMode = 'login';
const esc = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const formatDate = (value, options = { month: 'short', day: 'numeric' }) => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', options);
const getLogoClass = (company) => {
  const name = company.toLowerCase();
  if (name.includes('figma')) return 'logo-figma';
  if (name.includes('vercel')) return 'logo-vercel';
  if (name.includes('stripe')) return 'logo-stripe';
  if (name.includes('northstar')) return 'logo-northstar';
  return 'logo-acme';
};
function renderApplications() {
  const rows = applications.slice(0, 5).map((app, index) => {
    const logo = app.logo || app.company.trim().charAt(0).toUpperCase();
    const logoClass = app.logoClass || getLogoClass(app.company);
    const statusClass = app.status === 'In review' ? 'review' : app.status.toLowerCase();
    return `<tr><td><div class="company-cell"><span class="company-logo ${logoClass}">${esc(logo)}</span><span class="company-name"><strong>${esc(app.company)}</strong><small>${esc(app.role)}</small></span></div></td><td><span class="status status-${esc(statusClass)}">${esc(app.status)}</span></td><td class="deadline">${formatDate(app.deadline)}</td><td><button class="row-menu" aria-label="Remove ${esc(app.company)} application" data-remove="${esc(app.id)}">···</button></td></tr>`;
  }).join('');
  document.querySelector('#application-rows').innerHTML = rows;
  document.querySelector('#active-total').textContent = String(applications.length).padStart(2, '0');
  document.querySelector('#nav-count').textContent = applications.length;
  renderEvents();
}
function renderEvents() {
  const upcoming = applications.slice().sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 3);
  const events = upcoming.map((app) => {
    const date = new Date(`${app.deadline}T12:00:00`);
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const day = date.toLocaleDateString('en-US', { day: 'numeric' });
    const tag = app.status === 'Interview' ? 'Interview' : 'Deadline';
    return `<div class="event"><div class="date-box"><strong>${day}</strong><small>${weekday}</small></div><div class="event-copy"><strong>${esc(app.company)} · ${tag.toLowerCase()}</strong><span>${tag === 'Interview' ? 'Technical interview' : 'Application deadline'} · ${formatDate(app.deadline, { month: 'long', day: 'numeric' })}</span></div><span class="event-tag">${tag}</span></div>`;
  }).join('');
  document.querySelector('#event-list').innerHTML = events || '<p class="welcome-sub">No upcoming dates yet. Add an application to get started.</p>';
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
    if (!applicationResponse.ok || !recommendationResponse.ok) throw new Error('The API did not respond successfully.');
    const { user } = await meResponse.json();
    const name = user.email.split('@')[0];
    document.querySelector('#profile-name').textContent = name;
    document.querySelector('#profile-email').textContent = user.email;
    document.querySelector('#profile-avatar').textContent = name.slice(0, 2).toUpperCase();
    document.querySelector('.top-avatar').textContent = name.slice(0, 2).toUpperCase();
    document.querySelector('#auth-gate').hidden = true;
    applications = await applicationResponse.json();
    const recommendation = await recommendationResponse.json();
    renderApplications();
    document.querySelector('.skill-copy strong').textContent = recommendation.title;
    document.querySelector('.skill-copy span').textContent = `Relevant to ${recommendation.matched_roles} of your target roles`;
    document.querySelector('.match-pill').textContent = `+${recommendation.match_boost}% match`;
    document.querySelector('.skill-meta span').textContent = `Suggested next · ${recommendation.topics} topics`;
  } catch (error) {
    document.querySelector('#application-rows').innerHTML = `<tr><td colspan="4" class="deadline">Could not connect to the API. Start the app with <code>python server.py</code> and refresh.</td></tr>`;
    console.error(error);
  }
}
function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === 'register';
  document.querySelector('#auth-title').textContent = registering ? 'Create your account' : 'Welcome back';
  document.querySelector('#auth-subtitle').textContent = registering ? 'Create a private space for your placement journey.' : 'Sign in to keep your applications private and in sync.';
  document.querySelector('#auth-submit').innerHTML = registering ? 'Create account <span>→</span>' : 'Sign in <span>→</span>';
  document.querySelector('#auth-switch-copy').textContent = registering ? 'Already have an account?' : 'New to Pathway?';
  document.querySelector('#auth-toggle').textContent = registering ? 'Sign in' : 'Create an account';
  document.querySelector('#auth-form [name="password"]').autocomplete = registering ? 'new-password' : 'current-password';
  document.querySelector('#auth-form [name="password"]').minLength = registering ? 10 : 1;
  document.querySelector('#auth-error').hidden = true;
}
document.querySelector('#auth-toggle').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
document.querySelector('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const error = document.querySelector('#auth-error');
  const submit = document.querySelector('#auth-submit');
  submit.disabled = true;
  error.hidden = true;
  try {
    const response = await fetch(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email').trim(), password: form.get('password') })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Authentication failed.');
    authToken = data.token;
    sessionStorage.setItem('pathway-auth-token', authToken);
    event.currentTarget.reset();
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
  document.querySelector('#auth-gate').hidden = false;
  setAuthMode('login');
});
const applicationDialog = document.querySelector('#application-dialog');
const openApplicationDialog = () => applicationDialog.showModal();
document.querySelector('#add-application').addEventListener('click', openApplicationDialog);
document.querySelector('#add-inline').addEventListener('click', openApplicationDialog);
document.querySelector('#application-form').addEventListener('submit', (event) => {
  if (event.submitter?.classList.contains('dialog-close')) return;
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  fetch('/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ company: form.get('company').trim(), role: form.get('role').trim(), status: form.get('status'), deadline: form.get('deadline') }) })
    .then(async (response) => { if (!response.ok) throw new Error((await response.json()).error || 'Could not save application.'); return response.json(); })
    .then(() => { event.currentTarget.reset(); applicationDialog.close(); return loadDashboard(); })
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
const questions = [
  'Tell me about a project you’re proud of.',
  'How would you find and fix a performance bottleneck in a web app?',
  'Tell me about a time you got feedback that changed your approach.'
];
let questionIndex = 0;
document.querySelector('#start-practice').addEventListener('click', () => { questionIndex = 0; showQuestion(); practiceDialog.showModal(); });
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
loadDashboard();
