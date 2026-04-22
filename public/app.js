/* ═══════════════════════════════════════════════════
   AI Marketing Agent — Frontend Logic
   with Human Feedback Loop
   ═══════════════════════════════════════════════════ */

// ── State ──
let appData = null;       // Stores the API response
let inputMetrics = null;  // Stores the user's input metrics
let reviewState = [];     // Tracks approval state per content item
let currentFeedbackIndex = -1; // Which content item is being edited

// ── DOM Elements ──
const pages = {
    input: document.getElementById('page-input'),
    results: document.getElementById('page-results'),
    review: document.getElementById('page-review'),
    dashboard: document.getElementById('page-dashboard'),
};

const navBtns = {
    input: document.getElementById('nav-input'),
    results: document.getElementById('nav-results'),
    review: document.getElementById('nav-review'),
    dashboard: document.getElementById('nav-dashboard'),
};

const form = document.getElementById('marketing-form');
const generateBtn = document.getElementById('generate-btn');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');

// ═══════════════ NAVIGATION ═══════════════

function navigateTo(pageName) {
    // Hide all pages
    Object.values(pages).forEach(p => p.classList.remove('active'));
    // Deactivate all nav
    Object.values(navBtns).forEach(b => b.classList.remove('active'));

    // Show target page
    pages[pageName].classList.add('active');
    navBtns[pageName].classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Nav button clicks
Object.entries(navBtns).forEach(([key, btn]) => {
    btn.addEventListener('click', () => {
        if (!btn.disabled) navigateTo(key);
    });
});

// Page action buttons
document.getElementById('back-to-input').addEventListener('click', () => navigateTo('input'));
document.getElementById('go-to-review').addEventListener('click', () => {
    navigateTo('review');
    renderReviewPage();
});
document.getElementById('back-to-results').addEventListener('click', () => navigateTo('results'));
document.getElementById('back-to-review').addEventListener('click', () => navigateTo('review'));
document.getElementById('restart-btn').addEventListener('click', () => {
    // Reset everything
    appData = null;
    inputMetrics = null;
    reviewState = [];
    currentFeedbackIndex = -1;
    form.reset();
    navBtns.results.disabled = true;
    navBtns.review.disabled = true;
    navBtns.dashboard.disabled = true;
    navigateTo('input');
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// UX: Click on card focuses the input/textarea
document.querySelectorAll('.form-card, .textarea-card').forEach(card => {
    card.addEventListener('click', (e) => {
        // Don't focus if the click was already on the input/textarea itself
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        const field = card.querySelector('input, textarea');
        if (field) {
            field.focus();
            // If it's a number input and currently empty, put cursor at start
            if (field.type === 'number' && !field.value) {
                // Number inputs are slightly different, but focus is usually enough
            }
        }
    });
});


// ═══════════════ FORM SUBMISSION ═══════════════

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btnText = generateBtn.querySelector('.btn-text');
    const btnLoader = generateBtn.querySelector('.btn-loader');

    // Show loading state
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-flex';
    generateBtn.disabled = true;

    const payload = {
        num_users: parseInt(document.getElementById('num-users').value) || 0,
        instagram_followers: parseInt(document.getElementById('instagram-followers').value) || 0,
        linkedin_followers: parseInt(document.getElementById('linkedin-followers').value) || 0,
        email_responses: parseInt(document.getElementById('email-responses').value) || 0,
        long_term_goals: document.getElementById('long-term-goals').value.trim(),
        current_state: document.getElementById('current-state').value.trim(),
    };

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || 'Server error');
        }

        if (result.success) {
            appData = result.data;
            inputMetrics = result.input_metrics;

            // Initialize review state — all content starts as "pending"
            reviewState = (appData.content || []).map(() => ({
                status: 'pending', // 'pending' | 'approved' | 'regenerating'
            }));

            // Enable nav buttons
            navBtns.results.disabled = false;
            navBtns.review.disabled = false;

            // Render results
            renderResults();

            // Navigate to results
            navigateTo('results');
        } else {
            showToast(result.error || 'AI failed to generate. Try again.');
        }

    } catch (err) {
        showToast('Error: ' + err.message);
        console.error(err);
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        generateBtn.disabled = false;
    }
});


// ═══════════════ RENDER RESULTS ═══════════════

function renderResults() {
    if (!appData) return;

    // ── Insights ──
    document.getElementById('insights-text').textContent = appData.insights || 'No insights available.';

    // ── Tasks ──
    const tasksContainer = document.getElementById('tasks-container');
    tasksContainer.innerHTML = '';

    (appData.tasks || []).forEach((task, i) => {
        const priorityClass = `priority-${(task.priority || 'medium').toLowerCase()}`;
        const card = document.createElement('div');
        card.className = 'task-card';
        card.style.animationDelay = `${i * 0.1}s`;
        card.innerHTML = `
            <div class="task-card-header">
                <span class="task-number">Task ${task.id || i + 1}</span>
                <span class="task-priority ${priorityClass}">${task.priority || 'Medium'}</span>
            </div>
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="task-desc">${escapeHtml(task.description)}</div>
            <span class="task-platform">${getPlatformEmoji(task.platform)} ${task.platform || 'General'}</span>
        `;
        tasksContainer.appendChild(card);
    });

    // ── Content ──
    const contentContainer = document.getElementById('content-container');
    contentContainer.innerHTML = '';

    (appData.content || []).forEach((item, i) => {
        const badgeClass = `badge-${(item.platform || 'general').toLowerCase()}`;
        const card = document.createElement('div');
        card.className = 'content-card';
        card.style.animationDelay = `${i * 0.15}s`;

        const hashtagsHtml = (item.hashtags || [])
            .map(h => `<span class="hashtag">#${h}</span>`)
            .join('');

        card.innerHTML = `
            <div class="content-card-header">
                <span class="content-platform-badge ${badgeClass}">${item.platform}</span>
                <span class="content-type">${item.type || 'Post'}</span>
            </div>
            <div class="content-hook">"${escapeHtml(item.hook)}"</div>
            <div class="content-body">${escapeHtml(item.body)}</div>
            ${hashtagsHtml ? `<div class="content-hashtags">${hashtagsHtml}</div>` : ''}
            ${item.cta ? `<div class="content-cta">CTA: ${escapeHtml(item.cta)}</div>` : ''}
        `;
        contentContainer.appendChild(card);
    });
}


// ═══════════════ REVIEW / HUMAN FEEDBACK PAGE ═══════════════

function renderReviewPage() {
    if (!appData || !appData.content) return;

    const container = document.getElementById('review-content-container');
    container.innerHTML = '';

    appData.content.forEach((item, i) => {
        const badgeClass = `badge-${(item.platform || 'general').toLowerCase()}`;
        const state = reviewState[i] || { status: 'pending' };
        const isApproved = state.status === 'approved';

        const card = document.createElement('div');
        card.className = `review-card${isApproved ? ' approved' : ''}`;
        card.id = `review-card-${i}`;

        const hashtagsHtml = (item.hashtags || [])
            .map(h => `<span class="hashtag">#${h}</span>`)
            .join('');

        card.innerHTML = `
            <div class="review-card-header">
                <span class="content-platform-badge ${badgeClass}">${item.platform}</span>
                <span class="content-type">${item.type || 'Post'}</span>
            </div>
            <div class="review-content-preview">
                <div class="content-hook">"${escapeHtml(item.hook)}"</div>
                <div class="content-body">${escapeHtml(item.body)}</div>
                ${hashtagsHtml ? `<div class="content-hashtags">${hashtagsHtml}</div>` : ''}
                ${item.cta ? `<div class="content-cta">CTA: ${escapeHtml(item.cta)}</div>` : ''}
            </div>
            <div class="review-actions">
                <button class="review-btn approve" data-index="${i}" ${isApproved ? 'disabled' : ''}>
                    ${isApproved ? '✅ Approved' : '👍 Approve'}
                </button>
                <button class="review-btn request-change" data-index="${i}" ${isApproved ? 'disabled' : ''}>
                    ✏️ Request Changes
                </button>
                <span class="review-status-text">
                    ${isApproved ? 'Content approved ✓' : 'Awaiting your review'}
                </span>
            </div>
        `;

        container.appendChild(card);
    });

    // Attach event listeners
    container.querySelectorAll('.review-btn.approve').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            approveContent(idx);
        });
    });

    container.querySelectorAll('.review-btn.request-change').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            openFeedbackModal(idx);
        });
    });

    updateReviewProgress();
}

function approveContent(index) {
    reviewState[index].status = 'approved';

    // Update the card UI
    const card = document.getElementById(`review-card-${index}`);
    if (card) {
        card.classList.add('approved');
        const approveBtn = card.querySelector('.review-btn.approve');
        const changeBtn = card.querySelector('.review-btn.request-change');
        const statusText = card.querySelector('.review-status-text');
        if (approveBtn) {
            approveBtn.textContent = '✅ Approved';
            approveBtn.disabled = true;
        }
        if (changeBtn) changeBtn.disabled = true;
        if (statusText) statusText.textContent = 'Content approved ✓';
    }

    updateReviewProgress();
}

function updateReviewProgress() {
    const total = reviewState.length;
    const approved = reviewState.filter(s => s.status === 'approved').length;
    const pct = total > 0 ? Math.round((approved / total) * 100) : 0;

    document.getElementById('review-count').textContent = `${approved} / ${total} approved`;
    document.getElementById('review-progress-fill').style.width = pct + '%';

    const finalizeBtn = document.getElementById('finalize-review');
    finalizeBtn.disabled = approved < total;
}


// ── Feedback Modal ──

function openFeedbackModal(index) {
    currentFeedbackIndex = index;
    const item = appData.content[index];
    const modal = document.getElementById('feedback-modal');
    const subtitle = document.getElementById('feedback-modal-subtitle');

    subtitle.textContent = `Tell the AI what to change about the ${item.platform} ${item.type || 'post'}:`;
    document.getElementById('feedback-text').value = '';
    modal.style.display = 'flex';
}

function closeFeedbackModal() {
    document.getElementById('feedback-modal').style.display = 'none';
    currentFeedbackIndex = -1;
}

document.getElementById('feedback-modal-close').addEventListener('click', closeFeedbackModal);
document.getElementById('feedback-cancel').addEventListener('click', closeFeedbackModal);

// Close modal when clicking backdrop
document.getElementById('feedback-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeFeedbackModal();
});

// Submit feedback → regenerate single content
document.getElementById('feedback-submit').addEventListener('click', async () => {
    const feedback = document.getElementById('feedback-text').value.trim();
    if (!feedback) {
        showToast('Please provide feedback on what to change.');
        return;
    }

    const index = currentFeedbackIndex;
    const item = appData.content[index];

    const submitBtn = document.getElementById('feedback-submit');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-flex';
    submitBtn.disabled = true;

    try {
        const response = await fetch('/api/regenerate-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                original_content: item,
                feedback: feedback,
                platform: item.platform,
                long_term_goals: document.getElementById('long-term-goals').value.trim(),
                current_state: document.getElementById('current-state').value.trim(),
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || 'Server error');
        }

        if (result.success) {
            // Replace the content in appData
            appData.content[index] = result.data;
            reviewState[index].status = 'pending';

            // Close modal and re-render
            closeFeedbackModal();
            renderReviewPage();
            renderResults(); // Also update the results page
            showToast('✅ Content regenerated with your feedback!');
        } else {
            showToast(result.error || 'Failed to regenerate. Try again.');
        }
    } catch (err) {
        showToast('Error: ' + err.message);
        console.error(err);
    } finally {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        submitBtn.disabled = false;
    }
});


// ── Finalize Review → Generate Checklist & Go to Dashboard ──

document.getElementById('finalize-review').addEventListener('click', () => {
    // All approved — enable dashboard
    navBtns.dashboard.disabled = false;
    navigateTo('dashboard');
    renderDashboard();
    renderChecklist();
});


// ═══════════════ RENDER CHECKLIST ═══════════════

function renderChecklist() {
    if (!appData || !appData.checklist) return;

    const checklistContainer = document.getElementById('checklist-container');
    checklistContainer.innerHTML = '';

    (appData.checklist || []).forEach((item, i) => {
        const div = document.createElement('div');
        div.className = `checklist-item${item.completed ? ' completed' : ''}`;
        div.innerHTML = `
            <input type="checkbox" class="checklist-checkbox" id="check-${i}" ${item.completed ? 'checked' : ''}>
            <label class="checklist-label" for="check-${i}">${escapeHtml(item.task)}</label>
        `;
        // Toggle handler
        const checkbox = div.querySelector('.checklist-checkbox');
        checkbox.addEventListener('change', () => {
            item.completed = checkbox.checked;
            div.classList.toggle('completed', checkbox.checked);
            updateProgress();
        });
        checklistContainer.appendChild(div);
    });

    updateProgress();
}


function updateProgress() {
    if (!appData || !appData.checklist) return;
    const total = appData.checklist.length;
    const done = appData.checklist.filter(c => c.completed).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('progress-text').textContent = `${pct}% Complete (${done}/${total})`;

    // Also update dashboard ring if visible
    updateCompletionRing(pct);
}

function updateCompletionRing(pct) {
    const ring = document.getElementById('completion-ring-fill');
    const text = document.getElementById('completion-text');
    if (!ring || !text) return;

    const circumference = 2 * Math.PI * 80; // r=80
    const offset = circumference - (pct / 100) * circumference;
    ring.style.strokeDashoffset = offset;
    text.textContent = pct + '%';
}


// ═══════════════ DASHBOARD ═══════════════

function renderDashboard() {
    if (!inputMetrics) return;

    // Animate metric values
    animateValue('dash-users', inputMetrics.num_users);
    animateValue('dash-instagram', inputMetrics.instagram_followers);
    animateValue('dash-linkedin', inputMetrics.linkedin_followers);
    animateValue('dash-email', inputMetrics.email_responses);

    // Update completion
    if (appData && appData.checklist) {
        const total = appData.checklist.length;
        const done = appData.checklist.filter(c => c.completed).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        updateCompletionRing(pct);
    }

    // Draw charts
    drawChart('chart-instagram', inputMetrics.instagram_followers, '#E1306C', '#FF6B9D');
    drawChart('chart-linkedin', inputMetrics.linkedin_followers, '#0077B5', '#00A0DC');
    drawChart('chart-users', inputMetrics.num_users, '#00D4AA', '#4FACFE');
    drawChart('chart-email', inputMetrics.email_responses, '#FF6B9D', '#FF9F43');
}

function animateValue(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const duration = 1200;
    const start = performance.now();

    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        el.textContent = formatNumber(Math.floor(target * eased));
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}


// ═══════════════ CHART DRAWING ═══════════════

function drawChart(canvasId, currentValue, color1, color2) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 20, right: 20, bottom: 35, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Generate simulated growth data (past 6 months + projected 3 months)
    const months = ['6mo ago', '5mo', '4mo', '3mo', '2mo', '1mo', 'Now', '+1mo', '+2mo', '+3mo'];
    const data = generateGrowthData(currentValue, months.length);

    const maxVal = Math.max(...data) * 1.15;
    const minVal = Math.min(...data) * 0.85;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
    }

    // Y axis labels
    ctx.fillStyle = 'rgba(148,148,168,0.6)';
    ctx.font = '10px Inter';
    ctx.textAlign = 'right';
    for (let i = 0; i < 5; i++) {
        const y = padding.top + (chartH / 4) * i;
        const val = maxVal - ((maxVal - minVal) / 4) * i;
        ctx.fillText(formatNumber(Math.round(val)), padding.left - 8, y + 4);
    }

    // X axis labels
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(148,148,168,0.5)';
    ctx.font = '9px Inter';
    months.forEach((label, i) => {
        const x = padding.left + (chartW / (months.length - 1)) * i;
        ctx.fillText(label, x, h - 8);
    });

    // Line path
    const points = data.map((val, i) => ({
        x: padding.left + (chartW / (data.length - 1)) * i,
        y: padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH,
    }));

    // Area gradient
    const grad = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
    grad.addColorStop(0, hexToRgba(color1, 0.2));
    grad.addColorStop(1, hexToRgba(color1, 0.0));

    ctx.beginPath();
    ctx.moveTo(points[0].x, h - padding.bottom);
    drawSmoothLine(ctx, points);
    ctx.lineTo(points[points.length - 1].x, h - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    const lineGrad = ctx.createLinearGradient(padding.left, 0, w - padding.right, 0);
    lineGrad.addColorStop(0, color1);
    lineGrad.addColorStop(1, color2);

    ctx.beginPath();
    drawSmoothLine(ctx, points);
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // "Now" divider (dashed line at index 6)
    const nowX = points[6].x;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(nowX, padding.top);
    ctx.lineTo(nowX, h - padding.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label for projected
    ctx.fillStyle = 'rgba(108,99,255,0.6)';
    ctx.font = 'italic 9px Inter';
    ctx.textAlign = 'left';
    ctx.fillText('← Projected →', nowX + 8, padding.top + 10);

    // Dots
    points.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 6 ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = i >= 7 ? color2 : color1;
        ctx.fill();

        if (i === 6) {
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });
}

function drawSmoothLine(ctx, points) {
    if (points.length < 2) return;
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
        const cp1x = (points[i].x + points[i + 1].x) / 2;
        const cp1y = points[i].y;
        const cp2x = (points[i].x + points[i + 1].x) / 2;
        const cp2y = points[i + 1].y;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, points[i + 1].x, points[i + 1].y);
    }
}

function generateGrowthData(currentValue, count) {
    const data = [];
    // Past data: simulate gradual growth to current value
    const startValue = currentValue * (0.4 + Math.random() * 0.3);
    for (let i = 0; i < 7; i++) {
        const progress = i / 6;
        const noise = (Math.random() - 0.5) * currentValue * 0.08;
        const value = startValue + (currentValue - startValue) * Math.pow(progress, 0.8) + noise;
        data.push(Math.max(1, Math.round(value)));
    }
    data[6] = currentValue; // Ensure "Now" is exact

    // Projected (3 months forward) — optimistic growth
    const growthRate = 1 + (0.1 + Math.random() * 0.15);
    for (let i = 1; i <= 3; i++) {
        data.push(Math.round(currentValue * Math.pow(growthRate, i)));
    }
    return data;
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}


// ═══════════════ PARTICLES ═══════════════

function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.3;
            this.speedY = (Math.random() - 0.5) * 0.3;
            this.opacity = Math.random() * 0.4 + 0.1;
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
            if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(108, 99, 255, ${this.opacity})`;
            ctx.fill();
        }
    }

    // Create particles
    const count = Math.min(60, Math.floor((window.innerWidth * window.innerHeight) / 15000));
    for (let i = 0; i < count; i++) {
        particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.update();
            p.draw();
        });

        // Draw connections
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(108, 99, 255, ${0.06 * (1 - dist / 150)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(animate);
    }
    animate();
}


// ═══════════════ UTILITIES ═══════════════

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function getPlatformEmoji(platform) {
    const map = {
        'Instagram': '📸',
        'LinkedIn': '💼',
        'Email': '📧',
        'General': '🌐',
    };
    return map[platform] || '📌';
}

function showToast(message) {
    toastMsg.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 4000);
}


// ═══════════════ INIT ═══════════════
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
});
