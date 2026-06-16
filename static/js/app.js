/* ── State ───────────────────────────────────────────── */
let patients = [];
let deleteTargetId = null;

const patientModal  = new bootstrap.Modal(document.getElementById('patientModal'));
const viewModal     = new bootstrap.Modal(document.getElementById('viewModal'));
const deleteModal   = new bootstrap.Modal(document.getElementById('deleteModal'));
const toastEl       = document.getElementById('appToast');
const bsToast       = new bootstrap.Toast(toastEl, { delay: 3500 });

/* ── Init ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', loadPatients);

document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
  if (deleteTargetId !== null) confirmDelete(deleteTargetId);
});

/* ── API helpers ─────────────────────────────────────── */
async function api(url, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

/* ── Load / render ───────────────────────────────────── */
async function loadPatients() {
  try {
    patients = await api('/api/patients');
    renderTable(patients);
    updateStats(patients);
  } catch (e) {
    showToast('Failed to load patients: ' + e.message, 'danger');
  }
}

function renderTable(data) {
  const tbody = document.getElementById('tableBody');
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="9">
      <div class="empty-state">
        <i class="bi bi-person-x"></i>
        <p class="mb-1 fw-semibold">No patients found</p>
        <p class="small">Click <strong>Add Patient</strong> to get started.</p>
      </div></td></tr>`;
    return;
  }

  // dispose existing tooltips before re-rendering
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
    bootstrap.Tooltip.getInstance(el)?.dispose();
  });

  tbody.innerHTML = data.map((p, i) => `
    <tr>
      <td class="ps-4 text-muted small">${i + 1}</td>
      <td class="fw-semibold">${esc(p.full_name)}</td>
      <td>${formatDate(p.date_of_birth)}</td>
      <td><a href="mailto:${esc(p.email)}" class="text-decoration-none text-primary">${esc(p.email)}</a></td>
      <td class="text-end"><span class="${glucoseClass(p.glucose)}">${p.glucose}</span></td>
      <td class="text-end"><span class="${hbClass(p.haemoglobin)}">${p.haemoglobin}</span></td>
      <td class="text-end"><span class="${cholClass(p.cholesterol)}">${p.cholesterol}</span></td>
      <td>
        <span class="remarks-cell d-block"
              data-bs-toggle="tooltip"
              data-bs-placement="top"
              data-bs-custom-class="remarks-tooltip"
              title="${esc(p.remarks || '')}">${esc(p.remarks || '—')}</span>
      </td>
      <td class="text-center pe-4">
        <button class="btn btn-outline-info btn-action me-1" title="View remarks"
                onclick="viewPatient(${p.id})"><i class="bi bi-eye"></i></button>
        <button class="btn btn-outline-primary btn-action me-1" title="Edit"
                onclick="openModal(${p.id})"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger btn-action" title="Delete"
                onclick="promptDelete(${p.id}, '${esc(p.full_name)}')"><i class="bi bi-trash3"></i></button>
      </td>
    </tr>`).join('');
}

function updateStats(data) {
  document.getElementById('statTotal').textContent = data.length;
  document.getElementById('statHighRisk').textContent =
    data.filter(p => isHighRisk(p)).length;
  document.getElementById('statModerate').textContent =
    data.filter(p => isModerateRisk(p)).length;
  document.getElementById('statNormal').textContent =
    data.filter(p => !isHighRisk(p) && !isModerateRisk(p)).length;
}

/* ── Modal: Add / Edit ───────────────────────────────── */
function openModal(id = null) {
  clearForm();
  if (id) {
    const p = patients.find(x => x.id === id);
    if (!p) return;
    document.getElementById('modalTitle').innerHTML =
      '<i class="bi bi-pencil-fill me-2"></i>Edit Patient';
    document.getElementById('patientId').value     = p.id;
    document.getElementById('full_name').value     = p.full_name;
    document.getElementById('date_of_birth').value = p.date_of_birth;
    document.getElementById('email').value         = p.email;
    document.getElementById('glucose').value       = p.glucose;
    document.getElementById('haemoglobin').value   = p.haemoglobin;
    document.getElementById('cholesterol').value   = p.cholesterol;
    document.getElementById('saveBtnText').textContent = 'Update & Re-analyse';
  } else {
    document.getElementById('modalTitle').innerHTML =
      '<i class="bi bi-person-plus-fill me-2"></i>Add Patient';
    document.getElementById('saveBtnText').textContent = 'Save & Analyse';
  }
  patientModal.show();
}

function clearForm() {
  ['full_name','date_of_birth','email','glucose','haemoglobin','cholesterol'].forEach(f => {
    const el = document.getElementById(f);
    el.value = '';
    el.classList.remove('is-invalid', 'is-valid');
  });
  document.getElementById('patientId').value = '';
  ['err_full_name','err_date_of_birth','err_email','err_glucose','err_haemoglobin','err_cholesterol']
    .forEach(id => { document.getElementById(id).textContent = ''; });
}

async function savePatient() {
  const id = document.getElementById('patientId').value;
  const payload = {
    full_name:     document.getElementById('full_name').value.trim(),
    date_of_birth: document.getElementById('date_of_birth').value,
    email:         document.getElementById('email').value.trim(),
    glucose:       document.getElementById('glucose').value,
    haemoglobin:   document.getElementById('haemoglobin').value,
    cholesterol:   document.getElementById('cholesterol').value,
  };

  if (!frontendValidate(payload)) return;

  setSaving(true);
  try {
    if (id) {
      await api(`/api/patients/${id}`, 'PUT', payload);
      showToast('Patient updated successfully!', 'success');
    } else {
      await api('/api/patients', 'POST', payload);
      showToast('Patient added and AI remarks generated!', 'success');
    }
    patientModal.hide();
    loadPatients();
  } catch (e) {
    showToast(e.message, 'danger');
    if (e.message.includes('Email')) markInvalid('email', e.message);
  } finally {
    setSaving(false);
  }
}

function setSaving(on) {
  document.getElementById('saveBtn').disabled = on;
  document.getElementById('saveBtnSpinner').classList.toggle('d-none', !on);
  document.getElementById('saveBtnIcon').classList.toggle('d-none', on);
  document.getElementById('saveBtnText').textContent = on ? 'Analysing…' : (
    document.getElementById('patientId').value ? 'Update & Re-analyse' : 'Save & Analyse'
  );
}

/* ── Modal: View ─────────────────────────────────────── */
function viewPatient(id) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  document.getElementById('viewName').textContent = p.full_name;
  document.getElementById('viewMeta').textContent =
    `DOB: ${formatDate(p.date_of_birth)}  ·  ${p.email}`;
  document.getElementById('viewGlucose').textContent     = p.glucose;
  document.getElementById('viewHaemoglobin').textContent = p.haemoglobin;
  document.getElementById('viewCholesterol').textContent = p.cholesterol;
  document.getElementById('viewRemarks').textContent     = p.remarks || 'No remarks available.';
  viewModal.show();
}

/* ── Modal: Delete ───────────────────────────────────── */
function promptDelete(id, name) {
  deleteTargetId = id;
  document.getElementById('deletePatientName').textContent = name;
  deleteModal.show();
}

async function confirmDelete(id) {
  try {
    await api(`/api/patients/${id}`, 'DELETE');
    deleteModal.hide();
    showToast('Patient deleted.', 'warning');
    loadPatients();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

/* ── Search / filter ─────────────────────────────────── */
function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const filtered = q
    ? patients.filter(p =>
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q))
    : patients;
  renderTable(filtered);
}

/* ── Frontend validation ─────────────────────────────── */
function frontendValidate(d) {
  let ok = true;
  const clearAll = () => {
    ['full_name','date_of_birth','email','glucose','haemoglobin','cholesterol'].forEach(f => {
      document.getElementById(f).classList.remove('is-invalid');
    });
  };
  clearAll();

  if (!d.full_name) { markInvalid('full_name', 'Full name is required.'); ok = false; }
  if (!d.date_of_birth) {
    markInvalid('date_of_birth', 'Date of birth is required.'); ok = false;
  } else if (new Date(d.date_of_birth) >= new Date()) {
    markInvalid('date_of_birth', 'Date of birth cannot be today or a future date.'); ok = false;
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(d.email)) { markInvalid('email', 'Enter a valid email address.'); ok = false; }

  ['glucose','haemoglobin','cholesterol'].forEach(f => {
    const v = parseFloat(d[f]);
    if (isNaN(v) || v <= 0) {
      markInvalid(f, `${f.charAt(0).toUpperCase()+f.slice(1)} must be a positive number.`);
      ok = false;
    }
  });
  return ok;
}

function markInvalid(field, msg) {
  const el = document.getElementById(field);
  el.classList.add('is-invalid');
  const err = document.getElementById('err_' + field);
  if (err) err.textContent = msg;
}

/* ── Utilities ───────────────────────────────────────── */
function formatDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function glucoseClass(v) {
  if (v < 70) return 'val-low';
  if (v <= 100) return 'val-normal';
  return 'val-high';
}
function hbClass(v) {
  if (v < 12) return 'val-low';
  if (v <= 17.5) return 'val-normal';
  return 'val-high';
}
function cholClass(v) {
  if (v < 200) return 'val-normal';
  if (v < 240) return 'val-low';
  return 'val-high';
}

function isHighRisk(p) {
  return p.glucose > 125 || p.cholesterol >= 240 || p.haemoglobin < 10;
}
function isModerateRisk(p) {
  return (!isHighRisk(p)) &&
    (p.glucose > 100 || (p.cholesterol >= 200 && p.cholesterol < 240) || p.haemoglobin < 12);
}

function showToast(msg, type = 'success') {
  const colours = {
    success: 'bg-success text-white',
    danger:  'bg-danger text-white',
    warning: 'bg-warning text-dark',
    info:    'bg-info text-dark',
  };
  toastEl.className = `toast align-items-center border-0 ${colours[type] || colours.info}`;
  document.getElementById('toastMsg').textContent = msg;
  bsToast.show();
}
