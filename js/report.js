const API_BASE = 'https://mdvmhkrsc3.execute-api.us-east-1.amazonaws.com';
const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
const PART_SIZE = 50 * 1024 * 1024;
const MAX_CONCURRENT = 4;

// ── Upload helpers ────────────────────────────────────────────────────────────

function uploadSinglePut(uploadUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

function uploadPart(url, chunk, partNumber, onPartProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onPartProgress(partNumber, e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag');
        if (!etag) { reject(new Error(`No ETag for part ${partNumber}`)); return; }
        resolve({ PartNumber: partNumber, ETag: etag });
      } else {
        reject(new Error(`Part ${partNumber} failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error(`Network error on part ${partNumber}`));
    xhr.send(chunk);
  });
}

async function uploadMultipart(uploadData, file, onProgress, jwt) {
  const { upload_id, part_urls, part_size, total_parts, s3_key } = uploadData;
  const partProgress = new Array(total_parts).fill(0);

  function onPartProgress(partNumber, loaded, total) {
    partProgress[partNumber - 1] = loaded / total;
    const overall = partProgress.reduce((a, b) => a + b, 0) / total_parts;
    onProgress(overall);
  }

  const parts = [];
  let idx = 0;

  async function worker() {
    while (idx < total_parts) {
      const i = idx++;
      const start = i * part_size;
      const end = Math.min(start + part_size, file.size);
      const chunk = file.slice(start, end);
      const result = await uploadPart(part_urls[i], chunk, i + 1, onPartProgress);
      parts.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, total_parts) }, worker);
  await Promise.all(workers);
  parts.sort((a, b) => a.PartNumber - b.PartNumber);

  const headers = { 'Content-Type': 'application/json' };
  if (jwt) headers['Authorization'] = 'Bearer ' + jwt;

  const resp = await fetch(`${API_BASE}/complete-upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ upload_id, s3_key, parts }),
  });
  if (!resp.ok) throw new Error(`complete-upload failed: ${resp.status}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function gradeColor(grade) {
  if (!grade) return '#888';
  const g = grade[0].toUpperCase();
  if (g === 'A') return '#00e676';
  if (g === 'B') return '#69f0ae';
  if (g === 'C') return '#ffd600';
  return '#ef5350';
}

const RATING_MAP = {
  green:  { cls: 'positive', label: 'STRENGTH' },
  yellow: { cls: 'neutral',  label: 'MONITOR'  },
  red:    { cls: 'negative', label: 'IMPROVE'  },
};

const MATCH_TYPE_LABEL = {
  League:     'League Game',
  Tournament: 'Tournament',
  Friendly:   'Friendly Game',
  Training:   'Training Session',
};

// ── Report rendering ──────────────────────────────────────────────────────────

let reportData = null;

function show(id) {
  document.getElementById(id).style.display = id.startsWith('state') ? 'flex' : 'block';
}

function hide(id) {
  document.getElementById(id).style.display = 'none';
}

function renderReport(data, isUploadFlow) {
  reportData = data;

  const gradeEl = document.getElementById('report-grade');
  gradeEl.textContent = data.overall_grade || '—';
  gradeEl.style.color = gradeColor(data.overall_grade);

  document.getElementById('report-summary').textContent = data.summary || '';

  const playerLabel = data.jersey_number ? '#' + data.jersey_number : 'Report';
  document.getElementById('report-title-line').textContent = playerLabel;

  const meta = [];
  if (data.position)      meta.push(data.position);
  if (data.age_bracket)   meta.push(data.age_bracket);
  if (data.dominant_foot) meta.push(data.dominant_foot + ' foot');
  const matchLabel = MATCH_TYPE_LABEL[data.match_type] || data.match_type || '';
  if (matchLabel) meta.push(matchLabel);
  document.getElementById('report-meta').textContent = meta.join(' · ');

  const grid = document.getElementById('feedback-grid');
  grid.innerHTML = '';
  (data.feedback || []).forEach(item => {
    const rating = RATING_MAP[item.rating] || RATING_MAP.yellow;
    const card = document.createElement('div');
    card.className = 'obs-card ' + rating.cls;

    const timestamps = item.timestamps || (item.timestamp ? [item.timestamp] : []);
    const tsHtml = timestamps.length
      ? '<div class="obs-timestamps">' + timestamps.map(t => `<span class="obs-timestamp">${esc(t)}</span>`).join('') + '</div>'
      : '';

    card.innerHTML =
      `<div class="obs-tag">${rating.label} · ${esc(item.category || '')}</div>` +
      `<div class="obs-text">${esc(item.comment || '')}</div>` +
      tsHtml +
      '</div>';
    grid.appendChild(card);
  });

  if (isUploadFlow) {
    show('report-eyebrow');
    document.getElementById('report-eyebrow').textContent = 'Analysis complete';
  }
  hide('state-loading');
  show('report-content');
}

// ── PDF generation ────────────────────────────────────────────────────────────

function generatePDF() {
  if (!reportData) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const pageW = 210;
  const margin = 16;
  const colW = (pageW - margin * 2 - 5) / 2;
  let y = 0;

  const C = {
    dark:   [8,  15, 10],
    green:  [0,  230, 118],
    greenD: [0,  160, 75],
    text:   [25, 35, 30],
    muted:  [100, 120, 110],
    surf:   [244, 250, 246],
    red:    [220, 80, 80],
    yellow: [200, 160, 20],
    white:  [255, 255, 255],
  };

  const fill = (...c) => doc.setFillColor(...c);
  const ink  = (...c) => doc.setTextColor(...c);
  const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };

  // Header
  fill(...C.dark);
  doc.rect(0, 0, pageW, 26, 'F');
  ink(...C.green);
  font('bold', 16);
  doc.text('PitchScout AI', margin, 11);
  ink(180, 210, 195);
  font('normal', 7);
  doc.text('Analysis Report', margin, 18);
  ink(...C.muted);
  font('normal', 6.5);
  doc.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), pageW - margin, 18, { align: 'right' });
  y = 36;

  // Grade badge + player header
  const gradeColors = { A: C.green, B: [105, 240, 174], C: [255, 214, 0] };
  const badgeColor = gradeColors[reportData.overall_grade?.[0]] || C.red;
  const badgeX = pageW - margin - 28;
  fill(...C.dark);
  doc.roundedRect(badgeX, y + 6, 28, 26, 2, 2, 'F');
  ink(...badgeColor);
  font('bold', 20);
  doc.text(reportData.overall_grade || '-', badgeX + 14, y + 22, { align: 'center' });
  ink(...C.muted);
  font('normal', 5.5);
  doc.text('OVERALL GRADE', badgeX + 14, y + 29, { align: 'center' });

  ink(...C.muted);
  font('normal', 6.5);
  doc.text('PLAYER', margin, y);
  ink(...C.green);
  font('bold', 26);
  doc.text(reportData.jersey_number ? '#' + reportData.jersey_number : 'Report', margin, y + 14);

  const metaParts = [reportData.position, reportData.age_bracket,
    reportData.dominant_foot ? reportData.dominant_foot + ' foot' : null,
    MATCH_TYPE_LABEL[reportData.match_type] || reportData.match_type].filter(Boolean);
  ink(...C.muted);
  font('normal', 8);
  doc.text(metaParts.join(' · '), margin, y + 22);
  y += 34;

  // Divider
  doc.setDrawColor(...C.green);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Summary
  ink(...C.muted);
  font('bold', 6.5);
  doc.text('SUMMARY', margin, y);
  y += 5;
  const summaryLines = doc.splitTextToSize(reportData.summary || '', pageW - margin * 2 - 5);
  const summaryH = summaryLines.length * 4.8 + 8;
  fill(...C.surf);
  doc.rect(margin, y, pageW - margin * 2, summaryH, 'F');
  fill(...C.green);
  doc.rect(margin, y, 1.5, summaryH, 'F');
  ink(...C.text);
  font('normal', 8);
  doc.text(summaryLines, margin + 6, y + 5);
  y += summaryH + 10;

  // Feedback grid (2-col)
  ink(...C.muted);
  font('bold', 6.5);
  doc.text('FEEDBACK', margin, y);
  y += 6;

  const ratingMeta = {
    green:  { c: C.green,  label: 'STRENGTH' },
    yellow: { c: C.yellow, label: 'MONITOR'  },
    red:    { c: C.red,    label: 'IMPROVE'  },
  };

  let col = 0;
  let rowStartY = y;
  (reportData.feedback || []).forEach(item => {
    const rm = ratingMeta[item.rating] || ratingMeta.yellow;
    const colX = margin + col * (colW + 5);
    const commentLines = doc.splitTextToSize(item.comment || '', colW - 8);
    const cardH = 10 + commentLines.length * 4.5 + 4;

    if (y + cardH > 272) {
      doc.addPage();
      y = 20;
      rowStartY = y;
      col = 0;
    }

    fill(...C.surf);
    doc.roundedRect(colX, y, colW, cardH, 1.5, 1.5, 'F');
    fill(...rm.c);
    doc.rect(colX, y, 1.5, cardH, 'F');

    ink(...rm.c);
    font('bold', 6);
    doc.text(rm.label + ' · ' + (item.category || ''), colX + 4, y + 5.5);

    const timestamps = item.timestamps || (item.timestamp ? [item.timestamp] : []);
    if (timestamps.length) {
      ink(...C.muted);
      font('normal', 5.5);
      doc.text(timestamps.map(t => '[' + t + ']').join('  '), colX + colW - 3, y + 5.5, { align: 'right' });
    }

    ink(...C.text);
    font('normal', 7.5);
    doc.text(commentLines, colX + 4, y + 10.5);

    if (col === 0) {
      col = 1;
    } else {
      y = Math.max(y, rowStartY) + cardH + 4;
      rowStartY = y;
      col = 0;
    }
  });

  // Footer on each page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...C.muted);
    doc.setLineWidth(0.2);
    doc.line(margin, 287, pageW - margin, 287);
    ink(...C.muted);
    font('normal', 5.5);
    doc.text('pitchscout.ai', margin, 291);
    doc.text(p + ' / ' + totalPages, pageW - margin, 291, { align: 'right' });
  }

  const fname = `PitchScout_${reportData.jersey_number || 'player'}_${reportData.position || ''}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fname);
}

// ── Error reporting ───────────────────────────────────────────────────────────

function reportError({ sessionId, reportToken, errorType, errorMessage, stage }) {
  fetch(API_BASE + '/session-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id:    sessionId    || undefined,
      report_token:  reportToken  || undefined,
      error_type:    errorType    || 'unknown',
      error_message: String(errorMessage || '').slice(0, 500),
      stage:         stage        || 'unknown',
    }),
  }).catch(() => {/* fire-and-forget */});
}

// ── Upload form ───────────────────────────────────────────────────────────────

let selectedFile = null;

function validateForm() {
  const jersey   = document.getElementById('input-jersey').value.trim();
  const position = document.getElementById('input-position').value;
  const foot     = document.getElementById('input-foot').value;
  const age      = document.getElementById('input-age').value;
  const matchT   = document.getElementById('input-match').value;
  const kit      = document.getElementById('input-kit').value;

  const valid = jersey && position && foot && age && matchT && kit && selectedFile !== null;
  document.getElementById('btn-submit').disabled = !valid;
}

['input-jersey', 'input-position', 'input-foot', 'input-age', 'input-match', 'input-kit'].forEach(id =>
  document.getElementById(id).addEventListener('change', validateForm));
document.getElementById('input-jersey').addEventListener('input', validateForm);

const fileInput = document.getElementById('input-file');
const fileDrop  = document.getElementById('file-drop');

function onFileChosen(file) {
  if (!file) return;
  if (!file.type.startsWith('video/')) {
    showUploadError('Please select a video file (MP4, MOV, AVI, etc.)');
    return;
  }
  if (file.size > 5 * 1024 * 1024 * 1024) {
    showUploadError('File exceeds the 5 GB limit.');
    return;
  }
  selectedFile = file;
  const label = document.getElementById('file-name-display');
  label.textContent = file.name + ' (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)';
  label.style.display = 'block';
  hide('upload-error');
  validateForm();
}

fileInput.addEventListener('change', () => onFileChosen(fileInput.files[0]));
fileDrop.addEventListener('dragover', e => { e.preventDefault(); fileDrop.classList.add('drag-over'); });
fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));
fileDrop.addEventListener('drop', e => {
  e.preventDefault();
  fileDrop.classList.remove('drag-over');
  onFileChosen(e.dataTransfer.files[0]);
});

function showUploadError(msg) {
  const el = document.getElementById('upload-error');
  el.textContent = msg;
  el.style.display = 'block';
}

document.getElementById('btn-submit').addEventListener('click', async () => {
  if (!selectedFile) return;

  const jwt = await Auth.getToken();
  if (!jwt) {
    hide('state-upload');
    showAuthScreen('auth-signin');
    show('state-auth');
    return;
  }

  hide('state-upload');
  hide('upload-error');
  show('state-uploading');

  let sessionId    = null;
  let reportToken  = null;

  try {
    let urlResp;
    try {
      urlResp = await fetch(API_BASE + '/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + jwt,
        },
        body: JSON.stringify({
          filename:      selectedFile.name,
          content_type:  selectedFile.type || 'video/mp4',
          file_size:     selectedFile.size,
          jersey_number: document.getElementById('input-jersey').value.trim(),
          position:      document.getElementById('input-position').value,
          dominant_foot: document.getElementById('input-foot').value,
          age_bracket:   document.getElementById('input-age').value,
          match_type:    document.getElementById('input-match').value,
          kit_colour:    document.getElementById('input-kit').value,
        }),
      });
    } catch (netErr) {
      reportError({ errorType: 'network_error', errorMessage: netErr.message, stage: 'upload_url' });
      throw netErr;
    }

    if (!urlResp.ok) {
      const errData = await urlResp.json().catch(() => ({}));
      const errMsg  = errData.error || `HTTP ${urlResp.status}`;
      const errType = urlResp.status === 403 ? 'allowlist_rejected'
                    : urlResp.status === 401 ? 'auth_error'
                    : urlResp.status === 429 ? 'rate_limited'
                    : 'upload_failed';
      reportError({ errorType: errType, errorMessage: errMsg, stage: 'upload_url' });
      if (errType === 'allowlist_rejected') {
        throw new Error('Your account isn\'t on the beta list yet. Contact us at pitchscout.ai to request access.');
      }
      throw new Error(errMsg);
    }

    const uploadData = await urlResp.json();
    sessionId   = uploadData.session_id   || null;
    reportToken = uploadData.report_token || null;

    const setProgress = pct => {
      document.getElementById('progress-fill').style.width = pct + '%';
      document.getElementById('progress-label').textContent = pct + '%';
    };

    try {
      if (uploadData.multipart) {
        await uploadMultipart(uploadData, selectedFile, p => setProgress(Math.round(p * 100)), jwt);
      } else {
        await uploadSinglePut(uploadData.upload_url, selectedFile, p => setProgress(Math.round(p * 100)));
      }
    } catch (s3Err) {
      reportError({ sessionId, reportToken, errorType: 'upload_failed', errorMessage: s3Err.message, stage: 's3_upload' });
      throw s3Err;
    }

    hide('state-uploading');
    const userEmail = await Auth.getEmail();
    document.getElementById('success-email').textContent = userEmail || 'your inbox';

    const reportLink = document.getElementById('report-link');
    if (reportLink && reportToken) {
      reportLink.href = `/?token=${reportToken}`;
    }

    show('state-success');
  } catch (err) {
    hide('state-uploading');
    show('state-upload');
    showUploadError('Upload failed — please try again. ' + err.message);
  }
});

// ── Report page ───────────────────────────────────────────────────────────────

async function init() {
  const params    = new URLSearchParams(window.location.search);
  const token     = params.get('token');
  const sessionId = params.get('session_id') || params.get('id');

  if (!token && !sessionId) {
    const jwt = await Auth.getToken();
    hide('state-loading');
    if (jwt) {
      await showSignedIn();
      show('state-upload');
    } else {
      showAuthScreen('auth-signin');
      show('state-auth');
    }
    return;
  }

  const query = token
    ? 'token=' + encodeURIComponent(token)
    : 'session_id=' + encodeURIComponent(sessionId);

  try {
    const resp = await fetch(API_BASE + '/report?' + query);

    if (resp.status === 404) {
      hide('state-loading');
      show('state-error');
      return;
    }

    const data = await resp.json();
    const status = data.job_status;

    if (status === 'complete') {
      renderReport(data, false);
      return;
    }

    hide('state-loading');

    if (status === 'failed' || status === 'analysis_failed') {
      showFailedState(status);
    } else {
      showProcessingState();
    }
  } catch {
    hide('state-loading');
    show('state-error');
  }
}

async function showSignedIn() {
  const email = await Auth.getEmail();
  if (email) document.getElementById('nav-email').textContent = email;
  document.getElementById('nav-badge').style.display = 'none';
  document.getElementById('nav-user').style.display = 'flex';
}

function showProcessingState() {
  const el = document.getElementById('state-error');
  if (!el) return;
  el.innerHTML = `
    <div class="state-icon">⏳</div>
    <h2>Analysis in progress</h2>
    <p>Your video is being analyzed. This typically takes 5–15 minutes.<br>
    Check back soon or keep an eye on your inbox — we'll email you when it's ready.</p>
  `;
  show('state-error');
}

function showFailedState(status) {
  const el = document.getElementById('state-error');
  if (!el) return;
  const detail = status === 'analysis_failed'
    ? 'The video was received but the analysis could not be completed.'
    : 'There was a problem processing your video.';
  el.innerHTML = `
    <div class="state-icon">⚠️</div>
    <h2>Analysis unavailable</h2>
    <p>${detail}<br>
    Please contact us at <a href="mailto:support@pitchscout.ai" style="color:var(--green)">support@pitchscout.ai</a> and we'll sort it out.</p>
  `;
  show('state-error');
}

document.getElementById('btn-pdf')?.addEventListener('click', generatePDF);

// ── Auth UI handlers ──────────────────────────────────────────────────────────

let pendingVerifyEmail = '';

function showAuthScreen(screenId) {
  ['auth-signin', 'auth-signup', 'auth-verify', 'auth-forgot'].forEach(id => {
    document.getElementById(id).style.display = id === screenId ? '' : 'none';
  });
}

function setAuthError(errorId, msg, isSuccess) {
  const el = document.getElementById(errorId);
  el.textContent = msg;
  el.style.color = isSuccess ? 'var(--green)' : 'var(--red)';
  el.style.display = msg ? 'block' : 'none';
}

async function afterSignIn() {
  await showSignedIn();
  hide('state-auth');
  show('state-upload');
}

document.getElementById('btn-signin').addEventListener('click', async () => {
  const email = document.getElementById('auth-si-email').value.trim();
  const pass  = document.getElementById('auth-si-pass').value;
  setAuthError('auth-si-error', '');
  if (!email || !pass) return setAuthError('auth-si-error', 'Email and password required.');

  const btn = document.getElementById('btn-signin');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  const res = await Auth.signIn(email, pass);
  btn.disabled = false;
  btn.textContent = 'Sign in →';

  if (res.ok) return afterSignIn();
  if (res.needsVerification) {
    pendingVerifyEmail = res.email;
    document.getElementById('auth-verify-sub').textContent =
      `We sent a code to ${res.email}. Enter it below to verify your account.`;
    showAuthScreen('auth-verify');
    return;
  }
  setAuthError('auth-si-error', friendlyAuthError(res.error));
});

document.getElementById('btn-signup').addEventListener('click', async () => {
  const email = document.getElementById('auth-su-email').value.trim();
  const pass  = document.getElementById('auth-su-pass').value;
  const pass2 = document.getElementById('auth-su-pass2').value;
  setAuthError('auth-su-error', '');
  if (!email || !pass) return setAuthError('auth-su-error', 'Email and password required.');
  if (pass.length < 8)  return setAuthError('auth-su-error', 'Password must be at least 8 characters.');
  if (pass !== pass2)   return setAuthError('auth-su-error', 'Passwords do not match.');

  const btn = document.getElementById('btn-signup');
  btn.disabled = true;
  btn.textContent = 'Creating account…';
  const res = await Auth.signUp(email, pass);
  btn.disabled = false;
  btn.textContent = 'Create account →';

  if (!res.ok) return setAuthError('auth-su-error', friendlyAuthError(res.error));
  pendingVerifyEmail = email;
  document.getElementById('auth-verify-sub').textContent =
    `We sent a 6-digit code to ${email}. Enter it below.`;
  showAuthScreen('auth-verify');
});

document.getElementById('btn-verify').addEventListener('click', async () => {
  const code = document.getElementById('auth-code').value.trim();
  setAuthError('auth-verify-error', '');
  if (!code) return setAuthError('auth-verify-error', 'Enter the verification code.');

  const btn = document.getElementById('btn-verify');
  btn.disabled = true;
  btn.textContent = 'Verifying…';
  const res = await Auth.confirmSignUp(pendingVerifyEmail, code);
  btn.disabled = false;
  btn.textContent = 'Verify →';

  if (!res.ok) return setAuthError('auth-verify-error', friendlyAuthError(res.error));
  document.getElementById('auth-si-email').value = pendingVerifyEmail;
  setAuthError('auth-si-error', 'Account verified! Sign in below.', true);
  showAuthScreen('auth-signin');
});

document.getElementById('link-resend').addEventListener('click', async e => {
  e.preventDefault();
  const res = await Auth.resendCode(pendingVerifyEmail);
  setAuthError('auth-verify-error', res.ok ? 'Code resent — check your inbox.' : res.error, res.ok);
});

document.getElementById('btn-forgot').addEventListener('click', async () => {
  const email   = document.getElementById('auth-fp-email').value.trim();
  const isReset = document.getElementById('auth-fp-new-wrap').style.display !== 'none';
  const btn     = document.getElementById('btn-forgot');
  setAuthError('auth-fp-error', '');

  if (isReset) {
    const code    = document.getElementById('auth-fp-code').value.trim();
    const newPass = document.getElementById('auth-fp-pass').value;
    if (!code || !newPass) return setAuthError('auth-fp-error', 'Code and new password required.');

    btn.disabled = true;
    btn.textContent = 'Resetting…';
    const res = await Auth.confirmNewPassword(email, code, newPass);
    btn.disabled = false;
    btn.textContent = 'Reset password →';

    if (!res.ok) return setAuthError('auth-fp-error', friendlyAuthError(res.error));
    document.getElementById('auth-si-email').value = email;
    setAuthError('auth-si-error', 'Password reset! Sign in with your new password.', true);
    showAuthScreen('auth-signin');
    return;
  }

  if (!email) return setAuthError('auth-fp-error', 'Enter your email address.');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  const res = await Auth.forgotPassword(email);
  btn.disabled = false;
  btn.textContent = 'Reset password →';

  if (!res.ok) return setAuthError('auth-fp-error', friendlyAuthError(res.error));
  document.getElementById('auth-fp-new-wrap').style.display = '';
  document.getElementById('auth-forgot-sub').textContent =
    `Code sent to ${email}. Enter it below with your new password.`;
  btn.textContent = 'Set new password →';
});

document.getElementById('btn-signout').addEventListener('click', () => {
  Auth.signOut();
  document.getElementById('nav-badge').style.display = '';
  document.getElementById('nav-user').style.display = 'none';
  hide('state-upload');
  showAuthScreen('auth-signin');
  show('state-auth');
});

document.getElementById('link-to-signup').addEventListener('click', e => { e.preventDefault(); showAuthScreen('auth-signup'); });
document.getElementById('link-to-signin').addEventListener('click', e => { e.preventDefault(); showAuthScreen('auth-signin'); });
document.getElementById('link-to-forgot').addEventListener('click', e => { e.preventDefault(); showAuthScreen('auth-forgot'); });
document.getElementById('link-fp-signin').addEventListener('click', e => { e.preventDefault(); showAuthScreen('auth-signin'); });

// Enter-key shortcuts on auth forms
document.getElementById('auth-si-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-signin').click(); });
document.getElementById('auth-su-pass2')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-signup').click(); });
document.getElementById('auth-code')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-verify').click(); });

function friendlyAuthError(msg) {
  if (!msg) return 'Something went wrong. Please try again.';
  if (msg.includes('UserNotFoundException') || msg.includes('Incorrect username or password'))
    return 'Incorrect email or password.';
  if (msg.includes('UsernameExistsException'))
    return 'An account with this email already exists.';
  if (msg.includes('InvalidPasswordException'))
    return 'Password must be at least 8 characters.';
  if (msg.includes('CodeMismatchException'))
    return 'Invalid code — check your email and try again.';
  if (msg.includes('ExpiredCodeException'))
    return 'Code has expired. Request a new one.';
  if (msg.includes('LimitExceededException'))
    return 'Too many attempts. Please wait a few minutes.';
  if (msg.includes('NotAuthorizedException'))
    return 'Incorrect email or password.';
  return msg;
}

init();
