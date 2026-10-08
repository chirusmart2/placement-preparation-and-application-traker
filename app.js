let applications = [];
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
    const statusClass = app.status.toLowerCase().replaceAll(' ', '-');
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
  try {
    const [applicationResponse, recommendationResponse] = await Promise.all([
      fetch('/api/applications'),
      fetch('/api/recommendations')
    ]);
    if (!applicationResponse.ok || !recommendationResponse.ok) throw new Error('The API did not respond successfully.');
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
const applicationDialog = document.querySelector('#application-dialog');
const openApplicationDialog = () => applicationDialog.showModal();
document.querySelector('#add-application').addEventListener('click', openApplicationDialog);
document.querySelector('#add-inline').addEventListener('click', openApplicationDialog);
document.querySelector('#application-form').addEventListener('submit', (event) => {
  if (event.submitter?.classList.contains('dialog-close')) return;
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  fetch('/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: form.get('company').trim(), role: form.get('role').trim(), status: form.get('status'), deadline: form.get('deadline') }) })
    .then(async (response) => { if (!response.ok) throw new Error((await response.json()).error || 'Could not save application.'); return response.json(); })
    .then(() => { event.currentTarget.reset(); applicationDialog.close(); return loadDashboard(); })
    .catch((error) => alert(error.message));
});
document.querySelector('#application-rows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove]');
  if (!button) return;
  fetch(`/api/applications/${encodeURIComponent(button.dataset.remove)}`, { method: 'DELETE' })
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
