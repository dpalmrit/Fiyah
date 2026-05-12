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

async function uploadMultipart(uploadData, file, onProgress) {
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

  const resp = await fetch(`${API_BASE}/complete-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  green:  { cls: 'obs-card--green',  label: 'STRENGTH' },
  yellow: { cls: 'obs-card--yellow', label: 'MONITOR' },
  red:    { cls: 'obs-card--red',    label: 'IMPROVE' },
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
      ? '<div class="obs-timestamps">' + timestamps.map(t => `<span class="ts-badge">${esc(t)}</span>`).join('') + '</div>'
      : '';

    card.innerHTML =
      `<div class="obs-rating-label">${rating.label}</div>` +
      `<div class="obs-category">${esc(item.category || '')}</div>` +
      `<div class="obs-comment">${esc(item.comment || '')}</div>` +
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

// ── Upload form (index.html) ──────────────────────────────────────────────────

let selectedFile = null;

function validateForm() {
  const email    = document.getElementById('input-email').value.trim();
  const jersey   = document.getElementById('input-jersey').value.trim();
  const position = document.getElementById('input-position').value;
  const foot     = document.getElementById('input-foot').value;
  const age      = document.getElementById('input-age').value;
  const matchT   = document.getElementById('input-match').value;
  const kit      = document.getElementById('input-kit').value;

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    jersey && position && foot && age && matchT && kit && selectedFile !== null;
  document.getElementById('btn-submit').disabled = !valid;
}

['input-jersey', 'input-position', 'input-foot', 'input-age', 'input-match', 'input-kit'].forEach(id =>
  document.getElementById(id).addEventListener('change', validateForm));
document.getElementById('input-email').addEventListener('input', validateForm);
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
  const email = document.getElementById('input-email').value.trim();
  if (!selectedFile || !email) return;

  hide('upload-error');
  show('state-uploading');

  try {
    const urlResp = await fetch(API_BASE + '/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
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

    if (!urlResp.ok) throw new Error('Failed to get upload URL');
    const uploadData = await urlResp.json();

    const setProgress = pct => {
      document.getElementById('progress-fill').style.width = pct + '%';
      document.getElementById('progress-label').textContent = pct + '%';
    };

    if (uploadData.multipart) {
      await uploadMultipart(uploadData, selectedFile, p => setProgress(Math.round(p * 100)));
    } else {
      await uploadSinglePut(uploadData.upload_url, selectedFile, p => setProgress(Math.round(p * 100)));
    }

    hide('state-uploading');
    document.getElementById('success-email').textContent = email;
    show('state-success');
  } catch (err) {
    hide('state-uploading');
    showUploadError('Upload failed — please try again. ' + err.message);
  }
});

// ── Report page (report.html / ?id=) ─────────────────────────────────────────

async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    hide('state-loading');
    show('state-upload');
    return;
  }

  try {
    const resp = await fetch(API_BASE + '/report?id=' + encodeURIComponent(id));
    if (!resp.ok) throw new Error('not found');
    renderReport(await resp.json(), false);
  } catch {
    hide('state-loading');
    show('state-error');
  }
}

document.getElementById('btn-pdf')?.addEventListener('click', generatePDF);

init();
