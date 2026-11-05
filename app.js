// ==========================================
// 1. SUPABASE CONFIGURATION (REPLACE THESE)
// ==========================================
const SUPABASE_URL = 'https://ujwbbgoaatevcylyxtgb.supabase.co/'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqd2JiZ29hYXRldmN5bHl4dGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMTYzMTcsImV4cCI6MjEwODg5MjMxN30.xpO8LofuJx3Zw-1YAL0E4wIB3aKHxgtQ8ODtALbJ-FU'; 
const RESEND_API_KEY = 're_iAV2k2bQ_6wnfMFT1evn4N8oesuRY2Prb';

// Safely initialize Supabase
let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error("Supabase library not loaded. Check if a browser extension or ad blocker is blocking jsDelivr.");
}

// State & Config
const START_HOUR = 7;
const END_HOUR = 17; // 5 PM
const INTERVAL_MINS = 15;
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / INTERVAL_MINS;

let selectedDate = new Date().toISOString().split('T')[0];

let resources = [];
let bookings = [];
let emailOutbox = [];

// Drag State
let isDragging = false;
let dragResourceId = null;
let dragStartSlot = null;
let dragCurrentSlot = null;

// Global Role State & School Domain
let currentRole = 'user'; 
let currentUserEmail = ''; 
const SCHOOL_DOMAIN = '@sph.ac.id';

const ADMIN_EMAILS = [
  'ian.dermawan@sph.ac.id',
  'riana.haryanto@sph.ac.id',
  'ferdinand.christian@sph.ac.id'
];

// ==========================================
// INITIALIZATION ON PAGE LOAD
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  const datePicker = document.getElementById('datePicker');
  if (datePicker) {
    datePicker.value = selectedDate;
    datePicker.addEventListener('change', (e) => {
      selectedDate = e.target.value;
      renderGrid();
    });
  }

  document.addEventListener('mouseup', handleGlobalMouseUp);

  generateTimeLabels();
  populateTimeSelects();

  // Load live data from Supabase
  await loadDataFromSupabase();
  await checkAuthSession();
});

// ==========================================
// AUTHENTICATION & SESSION MANAGEMENT
// ==========================================
async function checkAuthSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    handleUserSession(session.user);
  } else {
    handleSignedOut();
  }

  // Unified Auth State Change listener
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      const loggedOutView = document.getElementById('loggedOutView');
      if (loggedOutView) loggedOutView.style.display = 'flex';
      toggleAuthMode('update');
    } else if (session) {
      handleUserSession(session.user);
    } else {
      handleSignedOut();
    }
  });
}

async function handleEmailPasswordLogin() {
  const emailInput = document.getElementById('loginEmailInput');
  const passwordInput = document.getElementById('loginPasswordInput');
  
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!email || !password) {
    alert('Please enter both email and password.');
    return;
  }

  if (!email.endsWith(SCHOOL_DOMAIN)) {
    alert('Access restricted to @sph.ac.id school accounts.');
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) throw error;

    alert('Successfully signed in!');
    window.location.reload();
  } catch (err) {
    console.error('Sign-in error:', err.message);
    alert('Failed to sign in: ' + err.message);
  }
}

async function handleSignOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) console.error('Error signing out:', error.message);
}

function handleUserSession(user) {
  currentUserEmail = user.email;

  if (ADMIN_EMAILS.includes(currentUserEmail.toLowerCase())) {
    currentRole = 'admin';
  } else {
    currentRole = 'user';
  }

  const loggedOutView = document.getElementById('loggedOutView');
  if (loggedOutView) loggedOutView.style.display = 'none';

  const loggedInView = document.getElementById('loggedInView');
  if (loggedInView) loggedInView.style.display = 'flex';

  const displayEmail = document.getElementById('userDisplayEmail');
  const displayRole = document.getElementById('userDisplayRole');
  if (displayEmail) displayEmail.innerText = currentUserEmail;
  if (displayRole) displayRole.innerText = currentRole;

  updateRoleUI();
  renderGrid();
}

function handleSignedOut() {
  const loginView = document.getElementById('loggedOutView');
  if (loginView) {
    loginView.style.display = 'flex';
  }
}

// ==========================================
// PASSWORD RESET & UPDATE
// ==========================================
function toggleAuthMode(mode) {
  const loginSec = document.getElementById('authLoginSection');
  const resetSec = document.getElementById('authResetSection');
  const updateSec = document.getElementById('authUpdatePasswordSection');

  if (loginSec) loginSec.style.display = 'none';
  if (resetSec) resetSec.style.display = 'none';
  if (updateSec) updateSec.style.display = 'none';

  if (mode === 'reset' && resetSec) {
    resetSec.style.display = 'flex';
  } else if (mode === 'update' && updateSec) {
    updateSec.style.display = 'flex';
  } else if (loginSec) {
    loginSec.style.display = 'flex';
  }
}

async function sendPasswordResetEmail() {
  const emailInput = document.getElementById('resetEmailInput');
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';

  if (!email) {
    alert('Please enter your school email.');
    return;
  }

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

    if (error) throw error;

    alert('Password reset link sent! Please check your email inbox.');
    toggleAuthMode('login');
  } catch (err) {
    console.error('Password reset error:', err.message);
    alert('Failed to send reset email: ' + err.message);
  }
}

async function updateNewPassword() {
  const newPasswordInput = document.getElementById('newPasswordInput');
  const newPassword = newPasswordInput ? newPasswordInput.value.trim() : '';

  if (!newPassword || newPassword.length < 6) {
    alert('Password must be at least 6 characters long.');
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({
    password: newPassword
  });

  if (error) {
    console.error('Error updating password:', error.message);
    alert('Failed to update password: ' + error.message);
  } else {
    alert('Password successfully updated! You are now logged in.');
    window.location.href = window.location.origin;
  }
}

// ==========================================
// DATA LOADING & GRID RENDERING
// ==========================================
async function loadDataFromSupabase() {
  try {
    const { data: resData, error: resError } = await supabaseClient.from('resources').select('*');
    if (resError) throw resError;
    resources = resData || [];

    const { data: bookData, error: bookError } = await supabaseClient.from('bookings').select('*');
    if (bookError) throw bookError;
    
    bookings = (bookData || []).map(b => ({
      id: b.id,
      resourceId: b.resource_id,
      date: b.date,
      title: b.title,
      user: b.user_name,
      email: b.user_email,
      note: b.note,
      startSlot: b.start_slot,
      endSlot: b.end_slot
    }));

    populateResourceSelect();
    renderGrid();
  } catch (err) {
    console.error('Error loading data from Supabase:', err.message);
    alert('Failed to connect to Supabase database. Check your API credentials.');
  }
}

function updateRoleUI() {
  const roleBadge = document.getElementById('userRoleBadge');
  if (roleBadge) {
    roleBadge.innerText = currentRole;
    if (currentRole === 'admin') {
      roleBadge.style.background = '#d4edda';
      roleBadge.style.color = '#155724';
    } else {
      roleBadge.style.background = '#e9ecef';
      roleBadge.style.color = '#383d41';
    }
  }

  const adminElements = document.querySelectorAll('.admin-only');
  adminElements.forEach(el => {
    el.style.display = (currentRole === 'admin') ? 'block' : 'none';
  });
}

function generateTimeLabels() {
  const container = document.getElementById('timeColumnSlots');
  if (!container) return;
  container.innerHTML = '';

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const totalMins = (START_HOUR * 60) + (i * INTERVAL_MINS);
    const hour = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    
    const isHour = mins === 0;
    const label = document.createElement('div');
    label.className = `time-slot-label ${isHour ? 'hour-mark' : ''}`;
    label.innerText = formatTime(hour, mins);
    container.appendChild(label);
  }
}

function formatTime(h, m) {
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  const displayMins = m < 10 ? `0${m}` : m;
  return `${displayHour}:${displayMins} ${period}`;
}

function getTimeString(slotIndex) {
  const totalMins = (START_HOUR * 60) + (slotIndex * INTERVAL_MINS);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return formatTime(h, m);
}

function populateResourceSelect() {
  const select = document.getElementById('modalResource');
  if (select) {
    select.innerHTML = resources.map(r => `<option value="${r.id}">${r.name} (${r.type})</option>`).join('');
  }
}

function populateTimeSelects() {
  const startSelect = document.getElementById('modalStartTime');
  const endSelect = document.getElementById('modalEndTime');
  
  let options = '';
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    options += `<option value="${i}">${getTimeString(i)}</option>`;
  }
  
  if (startSelect) startSelect.innerHTML = options;
  if (endSelect) endSelect.innerHTML = options;
}

function handleCellMouseDown(e, resourceId, slotIndex) {
  e.preventDefault();
  isDragging = true;
  dragResourceId = resourceId;
  dragStartSlot = slotIndex;
  dragCurrentSlot = slotIndex;
  updateDragUI();
}

function handleCellMouseEnter(resourceId, slotIndex) {
  if (isDragging && dragResourceId === resourceId) {
    dragCurrentSlot = slotIndex;
    updateDragUI();
  }
}

function renderGrid() {
  const viewport = document.getElementById('gridViewport');
  const typeFilterEl = document.getElementById('typeFilter');
  if (!viewport) return;

  const typeFilter = typeFilterEl ? typeFilterEl.value : 'ALL';
  
  const filteredResources = typeFilter === 'ALL' 
    ? resources 
    : resources.filter(r => r.type === typeFilter);

  const sortedResources = [...filteredResources].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.name.localeCompare(b.name);
  });

  viewport.style.setProperty('--resource-count', sortedResources.length);

  let html = `<div class="schedule-grid">`;
  
  // 1. Top-Left Corner Header (Row 1, Column 1 - for time labels column header)
  html += `<div class="grid-header-time" style="grid-row: 1; grid-column: 1;"></div>`;

  // 2. Resource Headers (Row 1, Columns 2 to N+1)
  sortedResources.forEach((res, colIdx) => {
    const colIndex = colIdx + 2; // Shifted over by 1 so Column 1 is reserved for time labels
    html += `
      <div class="resource-header" style="grid-row: 1; grid-column: ${colIndex};">
        <div class="resource-name">${res.name}</div>
        <div class="resource-type">${res.type}</div>
      </div>
    `;
  });

  // 3. Time Slots & Resource Cells (Rows 2 to 41)
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const totalMins = (START_HOUR * 60) + (i * INTERVAL_MINS);
    const hour = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const isHour = mins === 0;
    const gridRowIndex = i + 2;

    // KEEP THIS ONE: This is the correct time column in Column 1!
    html += `<div class="time-slot-label ${isHour ? 'hour-mark' : ''}" style="grid-row: ${gridRowIndex}; grid-column: 1;">${formatTime(hour, mins)}</div>`;

    // Resource Cells (Columns 2 to N+1)
    sortedResources.forEach((res, colIdx) => {
      const colIndex = colIdx + 2;
      html += `
        <div class="grid-cell ${isHour ? 'hour-mark' : ''}" 
             style="grid-row: ${gridRowIndex}; grid-column: ${colIndex};"
             data-resource-id="${res.id}" 
             data-slot-index="${i}"
             onmousedown="handleCellMouseDown(event, '${res.id}', ${i})"
             onmouseenter="handleCellMouseEnter('${res.id}', ${i})">
        </div>
      `;
    });
  }

  html += `</div>`;
  viewport.innerHTML = html;
}

// ==========================================
// DRAG & DROP SELECTION
// ==========================================
function updateDragUI() {
  if (!isDragging) return;
  const minSlot = Math.min(dragStartSlot, dragCurrentSlot);
  const maxSlot = Math.max(dragStartSlot, dragCurrentSlot);

  document.querySelectorAll('.grid-cell').forEach(cell => {
    if (cell.dataset.resourceId === dragResourceId) {
      const idx = parseInt(cell.dataset.slotIndex);
      if (idx >= minSlot && idx <= maxSlot) {
        cell.classList.add('drag-selected');
      } else {
        cell.classList.remove('drag-selected');
      }
    } else {
      cell.classList.remove('drag-selected');
    }
  });
}

function handleGlobalMouseUp() {
  if (!isDragging) return;
  isDragging = false;

  const minSlot = Math.min(dragStartSlot, dragCurrentSlot);
  const maxSlot = Math.max(dragStartSlot, dragCurrentSlot) + 1;

  document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('drag-selected'));

  openBookingModal(dragResourceId, minSlot, maxSlot);
}

// ==========================================
// BOOKING MODAL ACTIONS
// ==========================================
function openBookingModal(resourceId = null, startSlot = 0, endSlot = null, existingBooking = null) {
  const modal = document.getElementById('bookingModal');
  const headerTitle = document.getElementById('modalHeaderTitle');
  const saveBtn = document.getElementById('saveBookingBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const repeatContainer = document.getElementById('repeatSettingsContainer');

  if (resourceId) document.getElementById('modalResource').value = resourceId;
  document.getElementById('modalStartTime').value = startSlot;
  document.getElementById('modalEndTime').value = endSlot !== null ? Math.min(endSlot, TOTAL_SLOTS) : Math.min(startSlot + 2, TOTAL_SLOTS);

  if (existingBooking) {
    document.getElementById('bookingId').value = existingBooking.id;
    document.getElementById('modalTitleInput').value = existingBooking.title;
    document.getElementById('modalUser').value = existingBooking.user || '';
    document.getElementById('modalEmail').value = existingBooking.email || '';
    document.getElementById('modalNote').value = existingBooking.note || '';
    document.getElementById('modalStartTime').value = existingBooking.startSlot;
    document.getElementById('modalEndTime').value = existingBooking.endSlot;

    if (headerTitle) headerTitle.innerText = 'Edit Booking Details';
    if (saveBtn) saveBtn.innerText = 'Update Booking';
    if (deleteBtn) deleteBtn.style.display = 'block';
    if (repeatContainer) repeatContainer.style.display = 'none';
  } else {
    document.getElementById('bookingId').value = '';
    document.getElementById('modalTitleInput').value = '';
    document.getElementById('modalUser').value = '';
    document.getElementById('modalEmail').value = currentUserEmail || '';
    document.getElementById('modalNote').value = '';

    if (headerTitle) headerTitle.innerText = 'Book a Space';
    if (saveBtn) saveBtn.innerText = 'Confirm Booking';
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (repeatContainer) repeatContainer.style.display = 'block';
  }

  modal.classList.add('active');
}

function closeBookingModal() {
  const modal = document.getElementById('bookingModal');
  if (modal) modal.classList.remove('active');
}

function toggleRepeatOptions() {
  const freq = document.getElementById('repeatFrequency').value;
  const container = document.getElementById('repeatSubSettings') || document.getElementById('repeatSettingsContainer');
  if (container) container.style.display = freq === 'none' ? 'none' : 'flex';
}

function toggleEndType() {
  const endType = document.getElementById('repeatEndType').value;
  const countWrapper = document.getElementById('repeatCountWrapper');
  const dateWrapper = document.getElementById('repeatDateWrapper');
  if (countWrapper) countWrapper.style.display = endType === 'count' ? 'block' : 'none';
  if (dateWrapper) dateWrapper.style.display = endType === 'date' ? 'block' : 'none';
}

async function saveBooking() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session || !currentUserEmail) {
    alert("Authentication Required: Please sign in with your school email to book.");
    return;
  }

  const bookingId = document.getElementById('bookingId').value;
  const resourceId = document.getElementById('modalResource').value;
  const title = document.getElementById('modalTitleInput').value.trim() || 'Untitled Booking';
  const user = document.getElementById('modalUser').value.trim() || currentUserEmail.split('@')[0];
  const email = currentUserEmail; 
  const note = document.getElementById('modalNote').value.trim(); 
  const startSlot = parseInt(document.getElementById('modalStartTime').value);
  const endSlot = parseInt(document.getElementById('modalEndTime').value);
  const frequency = document.getElementById('repeatFrequency').value;

  if (startSlot >= endSlot) {
    alert('End time must be after start time!');
    return;
  }

  let datesToBook = [selectedDate];

  if (frequency !== 'none' && !bookingId) {
    const endType = document.getElementById('repeatEndType').value;
    let maxCount = parseInt(document.getElementById('repeatCount').value) || 1;
    let endDateStr = document.getElementById('repeatEndDate').value;
    let endDate = endDateStr ? new Date(endDateStr) : null;

    let currentDateObj = new Date(selectedDate);
    let count = 1;

    while (true) {
      if (endType === 'count' && count >= maxCount) break;

      if (frequency === 'daily') {
        currentDateObj.setDate(currentDateObj.getDate() + 1);
      } else if (frequency === 'weekly') {
        currentDateObj.setDate(currentDateObj.getDate() + 7);
      } else if (frequency === 'monthly') {
        currentDateObj.setMonth(currentDateObj.getMonth() + 1);
      }

      let dateString = currentDateObj.toISOString().split('T')[0];

      if (endType === 'date' && endDate && currentDateObj > endDate) {
        break;
      }

      if (count >= 100) break;

      datesToBook.push(dateString);
      count++;
    }
  }

  for (let d of datesToBook) {
    const hasCollision = bookings.some(b => {
      if (bookingId && b.id === bookingId) return false;
      if (b.resourceId !== resourceId || b.date !== d) return false;
      return (startSlot < b.endSlot && endSlot > b.startSlot);
    });

    if (hasCollision) {
      alert(`Collision detected on ${d}. This space is already booked during that time slot. Recurring booking cancelled.`);
      return;
    }
  }

  try {
    if (bookingId) {
      const { error } = await supabaseClient
        .from('bookings')
        .update({
          resource_id: resourceId,
          date: selectedDate,
          title: title,
          user_name: user,
          user_email: email,
          note: note,
          start_slot: startSlot,
          end_slot: endSlot
        })
        .eq('id', bookingId);

      if (error) throw error;
    } else {
      const recordsToInsert = datesToBook.map(d => ({
        resource_id: resourceId,
        date: d,
        title: title,
        user_name: user,
        user_email: email,
        note: note,
        start_slot: startSlot,
        end_slot: endSlot
      }));

      const { error } = await supabaseClient
        .from('bookings')
        .insert(recordsToInsert);

      if (error) throw error;

      try {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            title: title,
            datesCount: datesToBook.length,
            selectedDate: selectedDate,
            note: note
          })
        });
      } catch (emailErr) {
        console.error('Failed to trigger email API:', emailErr);
      }

      sendSimulatedEmail(
        email, 
        'Booking Confirmation:', 
        `Successfully booked "${title}" for ${datesToBook.length} session(s) starting ${selectedDate}.`
      );
    }

    closeBookingModal();
    await loadDataFromSupabase();
  } catch (err) {
    console.error('Error saving bookings:', err.message);
    alert('Failed to save bookings to database.');
  }
}

async function deleteBooking() {
  const bookingId = document.getElementById('bookingId').value;
  if (!bookingId) return;

  const booking = bookings.find(item => item.id === bookingId);
  if (!booking) return;

  const isOwner = currentUserEmail && (booking.email.toLowerCase() === currentUserEmail.toLowerCase());
  const isAdmin = currentRole === 'admin';

  if (!isAdmin && !isOwner) {
    alert('Permission Denied: You can only delete or cancel your own bookings.');
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('bookings')
      .delete()
      .eq('id', bookingId);

    if (error) throw error;

    if (booking.email) {
      sendSimulatedEmail(
        booking.email, 
        'Booking Cancellation', 
        `Your booking "${booking.title}" for ${selectedDate} has been cancelled.`
      );
    }

    closeBookingModal();
    await loadDataFromSupabase();
  } catch (err) {
    console.error('Error deleting booking:', err.message);
    alert('Failed to delete booking.');
  }
}

// ==========================================
// SIMULATED EMAIL OUTBOX
// ==========================================
function sendSimulatedEmail(to, subject, body) {
  if (!to) return;
  emailOutbox.unshift({ to, subject, body, time: new Date().toLocaleTimeString() });
  const countEl = document.getElementById('emailCount');
  if (countEl) countEl.innerText = emailOutbox.length;
  renderOutbox();
}

function renderOutbox() {
  const list = document.getElementById('outboxList');
  if (!list) return;

  if (emailOutbox.length === 0) {
    list.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">No emails sent yet.</p>';
    return;
  }

  list.innerHTML = emailOutbox.map(e => `
    <div class="email-card">
      <div class="to">To: ${e.to} <span style="font-weight:normal; font-size: 0.75rem; color: var(--text-muted);">(${e.time})</span></div>
      <div class="subject">${e.subject}</div>
      <div class="body">${e.body}</div>
    </div>
  `).join('');
}

function toggleOutbox() {
  const drawer = document.getElementById('outboxDrawer');
  if (drawer) drawer.classList.toggle('open');
}