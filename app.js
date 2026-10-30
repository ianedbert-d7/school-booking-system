// ==========================================
// 1. SUPABASE CONFIGURATION (REPLACE THESE)
// ==========================================
const SUPABASE_URL = 'https://ujwbbgoaatevcylyxtgb.supabase.co/'; // e.g., https://xyzcompany.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqd2JiZ29hYXRldmN5bHl4dGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMTYzMTcsImV4cCI6MjEwODg5MjMxN30.xpO8LofuJx3Zw-1YAL0E4wIB3aKHxgtQ8ODtALbJ-FU'; // e.g., eyJhbGciOi...

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

// Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('datePicker').value = selectedDate;
  document.getElementById('datePicker').addEventListener('change', (e) => {
    selectedDate = e.target.value;
    renderGrid();
  });

  document.addEventListener('mouseup', handleGlobalMouseUp);

  generateTimeLabels();
  populateTimeSelects();

  // Load live data from Supabase
  await loadDataFromSupabase();

  // Synchronize time column scrolling with grid scrolling
  const viewport = document.getElementById('gridViewport');
  const timeWrapper = document.getElementById('timeColumnSlots');
  viewport.addEventListener('scroll', () => {
    timeWrapper.scrollTop = viewport.scrollTop;
  });
});

// Load Resources and Bookings from Supabase
async function loadDataFromSupabase() {
  try {
    // 1. Fetch Resources
    const { data: resData, error: resError } = await supabaseClient.from('resources').select('*');
    if (resError) throw resError;
    resources = resData || [];

    // 2. Fetch Bookings
    const { data: bookData, error: bookError } = await supabaseClient.from('bookings').select('*');
    if (bookError) throw bookError;
    
    bookings = (bookData || []).map(b => ({
      id: b.id,
      resourceId: b.resource_id,
      date: b.date,
      title: b.title,
      user: b.user_name,
      email: b.user_email,
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
// Global Role State
let currentRole = 'user'; // default to standard user
let currentUserEmail = ''; // track active staff email

function handleRoleChange() {
  const roleSelect = document.getElementById('userRoleSelect');
  currentRole = roleSelect.value;
  
  // Update UI permissions visually
  updateRoleUI();
  // Re-render grid to reflect role-based controls (e.g. edit/delete buttons)
  renderGrid();
}

function updateRoleUI() {
  const adminElements = document.querySelectorAll('.admin-only');
  adminElements.forEach(el => {
    el.style.display = (currentRole === 'admin') ? 'block' : 'none';
  });
}

function generateTimeLabels() {
  const container = document.getElementById('timeColumnSlots');
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
// List of official admin staff emails
const ADMIN_EMAILS = [
  'ian.dermawan@sph.ac.id',
  'riana.haryanto@sph.ac.id',
  'ferdinand.christian@sph.ac.id'
];

// Verify school domain and determine role
function setRoleFromEmail(userEmail) {
  const schoolDomain = '@sph.ac.id'; // Replace with your actual domain

  if (!userEmail.toLowerCase().endsWith(schoolDomain)) {
    alert(`Access restricted. Please sign in using your official ${schoolDomain} email.`);
    return false;
  }

  // Assign role based on email match
  if (ADMIN_EMAILS.includes(userEmail.toLowerCase())) {
    currentRole = 'admin';
  } else {
    currentRole = 'user';
  }

  currentUserEmail = userEmail;
  updateRoleUI();
  return true;
}

// ==========================================
// AUTHENTICATION & ROLE CONFIGURATION
// ==========================================
const SCHOOL_DOMAIN = '@sph.ac.id'; // Change this to your actual school domain


// Initialize Auth State Listener on Page Load
document.addEventListener('DOMContentLoaded', () => {
  checkAuthSession();
});

async function checkAuthSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    handleUserSession(session.user);
  }

  // Listen for login/logout state changes
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) {
      handleUserSession(session.user);
    } else {
      handleSignedOut();
    }
  });
}

async function sendMagicLink() {
  const emailInput = document.getElementById('loginEmailInput');
  const email = emailInput.value.trim().toLowerCase();

  if (!email.endsWith(SCHOOL_DOMAIN)) {
    alert(`Access denied. Please use your official school email ending in ${SCHOOL_DOMAIN}`);
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOtp({
    email: email,
    options: {
      emailRedirectTo: window.location.origin // Redirects back to your live site or localhost
    }
  });

  if (error) {
    console.error('Magic link error:', error.message);
    alert('Failed to send magic link: ' + error.message);
  } else {
    alert('Success! Check your email inbox for your secure login link.');
  }
}

function handleUserSession(user) {
  currentUserEmail = user.email;

  // Determine Role based on Admin email list
  if (ADMIN_EMAILS.includes(currentUserEmail.toLowerCase())) {
    currentRole = 'admin';
  } else {
    currentRole = 'user';
  }

  // Update UI Views
  document.getElementById('loggedOutView').style.display = 'none';
  document.getElementById('loggedInView').style.display = 'flex';
  document.getElementById('userDisplayEmail').innerText = currentUserEmail;
  document.getElementById('userDisplayRole').innerText = currentRole;

  updateRoleUI();
  renderGrid();
}

function handleSignedOut() {
  currentUserEmail = '';
  currentRole = 'user';

  document.getElementById('loggedOutView').style.display = 'block';
  document.getElementById('loggedInView').style.display = 'none';

  updateRoleUI();
  renderGrid();
}

async function handleSignOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) console.error('Error signing out:', error.message);
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
  select.innerHTML = resources.map(r => `<option value="${r.id}">${r.name} (${r.type})</option>`).join('');
}

function populateTimeSelects() {
  const startSelect = document.getElementById('modalStartTime');
  const endSelect = document.getElementById('modalEndTime');
  
  let options = '';
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    options += `<option value="${i}">${getTimeString(i)}</option>`;
  }
  
  startSelect.innerHTML = options;
  endSelect.innerHTML = options;
}

function switchRole(role) {
  currentRole = role;
  document.getElementById('roleUser').classList.toggle('active', role === 'user');
  document.getElementById('roleAdmin').classList.toggle('active', role === 'admin');
  document.getElementById('roleAdmin').classList.toggle('admin-mode', role === 'admin');
  renderGrid();
}

function renderGrid() {
  const viewport = document.getElementById('gridViewport');
  const typeFilter = document.getElementById('typeFilter').value;
  
  // 1. Filter by dropdown selection
  const filteredResources = typeFilter === 'ALL' 
    ? resources 
    : resources.filter(r => r.type === typeFilter);

  // 2. Sort resources alphabetically by type, then by name
  const sortedResources = [...filteredResources].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type.localeCompare(b.type);
    }
    return a.name.localeCompare(b.name);
  });

  viewport.innerHTML = '';

  // 3. Loop through sortedResources instead of filteredResources
  sortedResources.forEach(res => {
    const col = document.createElement('div');
    col.className = 'resource-column';
    // ... rest of your code remains the same

    // Header
    const header = document.createElement('div');
    header.className = 'resource-header';
    header.innerHTML = `<div class="resource-name">${res.name}</div><div class="resource-type">${res.type}</div>`;
    col.appendChild(header);

    // Slots container
    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'grid-slots';

    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const isHour = ((START_HOUR * 60) + (i * INTERVAL_MINS)) % 60 === 0;
      const cell = document.createElement('div');
      cell.className = `grid-cell ${isHour ? 'hour-mark' : ''}`;
      cell.dataset.resourceId = res.id;
      cell.dataset.slotIndex = i;

      cell.onmousedown = (e) => {
        e.preventDefault();
        isDragging = true;
        dragResourceId = res.id;
        dragStartSlot = i;
        dragCurrentSlot = i;
        updateDragUI();
      };

      cell.onmouseenter = () => {
        if (isDragging && dragResourceId === res.id) {
          dragCurrentSlot = i;
          updateDragUI();
        }
      };

      slotsContainer.appendChild(cell);
    }

    // Render bookings for this resource and date
    const resBookings = bookings.filter(b => b.resourceId === res.id && b.date === selectedDate);
    resBookings.forEach(b => {
      const card = document.createElement('div');
      card.className = 'booking-card';
      
      const topPx = b.startSlot * 30;
      const heightPx = (b.endSlot - b.startSlot) * 30;

      card.style.top = `${topPx}px`;
      card.style.height = `${heightPx - 2}px`;

      card.innerHTML = `
        <div class="booking-title">${b.title}</div>
        <div class="booking-time">${getTimeString(b.startSlot)} - ${getTimeString(b.endSlot)} • ${b.user}</div>
      `;

      card.onclick = (e) => {
        e.stopPropagation();
        openBookingModal(res.id, b.startSlot, b.endSlot, b);
      };

      slotsContainer.appendChild(card);
    });

    col.appendChild(slotsContainer);
    viewport.appendChild(col);
  });
}

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

function openBookingModal(resourceId = null, startSlot = 0, endSlot = null, existingBooking = null) {
  const modal = document.getElementById('bookingModal');
  const deleteBtn = document.getElementById('deleteBtn');

  if (resourceId) document.getElementById('modalResource').value = resourceId;
  document.getElementById('modalStartTime').value = startSlot;
  document.getElementById('modalEndTime').value = endSlot !== null ? Math.min(endSlot, TOTAL_SLOTS) : Math.min(startSlot + 2, TOTAL_SLOTS);

  if (existingBooking) {
    document.getElementById('bookingId').value = existingBooking.id;
    document.getElementById('modalTitleInput').value = existingBooking.title;
    document.getElementById('modalUser').value = existingBooking.user;
    document.getElementById('modalEmail').value = existingBooking.email || '';
    document.getElementById('modalStartTime').value = existingBooking.startSlot;
    document.getElementById('modalEndTime').value = existingBooking.endSlot;
    deleteBtn.style.display = 'block';
  } else {
    document.getElementById('bookingId').value = '';
    document.getElementById('modalTitleInput').value = '';
    document.getElementById('modalUser').value = '';
    document.getElementById('modalEmail').value = '';
    deleteBtn.style.display = 'none';
  }

  modal.classList.add('active');
}

function closeBookingModal() {
  document.getElementById('bookingModal').classList.remove('active');
}

async function saveBooking() {
  const bookingId = document.getElementById('bookingId').value;
  const resourceId = document.getElementById('modalResource').value;
  const title = document.getElementById('modalTitleInput').value.trim() || 'Untitled Booking';
  const user = document.getElementById('modalUser').value.trim() || 'Anonymous Staff';
  const email = document.getElementById('modalEmail').value.trim();
  const startSlot = parseInt(document.getElementById('modalStartTime').value);
  const endSlot = parseInt(document.getElementById('modalEndTime').value);

  if (startSlot >= endSlot) {
    alert('End time must be after start time!');
    return;
  }

  // Check collision locally before saving
  const hasCollision = bookings.some(b => {
    if (bookingId && b.id === bookingId) return false;
    if (b.resourceId !== resourceId || b.date !== selectedDate) return false;
    return (startSlot < b.endSlot && endSlot > b.startSlot);
  });

  if (hasCollision) {
    alert('This space is already booked during that time slot.');
    return;
  }

  try {
    if (bookingId) {
      // Update existing booking in Supabase
      const { error } = await supabaseClient
        .from('bookings')
        .update({
          resource_id: resourceId,
          date: selectedDate,
          title: title,
          user_name: user,
          user_email: email,
          start_slot: startSlot,
          end_slot: endSlot
        })
        .eq('id', bookingId);

      if (error) throw error;
    } else {
      // Insert new booking into Supabase
      const { error } = await supabaseClient
        .from('bookings')
        .insert([{
          resource_id: resourceId,
          date: selectedDate,
          title,
          user_name: user,
          user_email: email,
          start_slot: startSlot,
          end_slot: endSlot
        }]);

      if (error) throw error;
      sendSimulatedEmail(email, 'Booking Confirmation', `Your booking for "${title}" on ${selectedDate} from ${getTimeString(startSlot)} to ${getTimeString(endSlot)} is confirmed.`);
    }

    closeBookingModal();
    await loadDataFromSupabase(); // Refresh live data
  } catch (err) {
    console.error('Error saving booking:', err.message);
    alert('Failed to save booking to database.');
  }
}

async function deleteBooking() {
  const bookingId = document.getElementById('bookingId').value;
  if (!bookingId) return;

  const booking = bookings.find(item => item.id === bookingId);
  if (!booking) return;

  // Role Validation Check
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

function sendSimulatedEmail(to, subject, body) {
  if (!to) return;
  emailOutbox.unshift({ to, subject, body, time: new Date().toLocaleTimeString() });
  document.getElementById('emailCount').innerText = emailOutbox.length;
  renderOutbox();
}

function renderOutbox() {
  const list = document.getElementById('outboxList');
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
  document.getElementById('outboxDrawer').classList.toggle('open');
}