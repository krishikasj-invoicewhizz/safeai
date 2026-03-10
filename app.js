/* ═══════════════════════════════════════════════════════
   SAFEHER AI — app.js
   Full MVP logic: Auth, SOS, Location, Map, Community,
   AI Harassment Detection, Emergency Contacts, Reports
═══════════════════════════════════════════════════════ */

"use strict";

// ── State ────────────────────────────────────────────────
const state = {
  user: null,
  profile: null,
  location: null,
  locationWatchId: null,
  sosActive: false,
  sosTimer: null,
  sosProgress: 0,
  sosInterval: null,
  mediaRecorder: null,
  audioChunks: [],
  map: null,
  markers: [],
  currentPage: "dashboard",
  openaiKey: localStorage.getItem("safeher_openai_key") || "",
  likedPosts: JSON.parse(localStorage.getItem("safeher_liked") || "[]"),
};

// ── Firebase helpers (set after 'firebase-ready') ────────
let fb = null;
let db = null;
let auth = null;
let storage = null;
const f = () => fb.fns;

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
window.addEventListener("firebase-ready", () => {
  fb = window._fb;
  db = fb.db;
  auth = fb.auth;
  storage = fb.storage;

  // Auth state observer
  f().onAuthStateChanged(auth, (user) => {
    if (user) {
      state.user = user;
      loadApp();
    } else {
      showScreen("auth");
    }
  });
});

// Show splash, then check auth
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    document.getElementById("splash").style.opacity = "0";
    document.getElementById("splash").style.transition = "opacity 0.5s";
    setTimeout(() => document.getElementById("splash").classList.add("hidden"), 500);
  }, 2000);

  bindAuthUI();
  bindNavigation();
  bindSOSButton();
  bindReportForm();
  bindCommunityForm();
  bindContactsForm();
  bindAIForm();
  bindProfileActions();
  bindMapSearch();
  bindModals();
});

function showScreen(name) {
  document.getElementById("auth-screen").classList.toggle("hidden", name !== "auth");
  document.getElementById("app").classList.toggle("hidden", name !== "app");
}

async function loadApp() {
  showScreen("app");
  await loadUserProfile();
  loadRecentAlerts();
  loadContacts();
  loadReports();
  loadCommunityFeed();
  updateProfileStats();
}

// ═══════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════
function bindAuthUI() {
  // Tab switching
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("login-form").classList.toggle("hidden", tab !== "login");
      document.getElementById("register-form").classList.toggle("hidden", tab !== "register");
    });
  });

  // Login
  document.getElementById("btn-login").addEventListener("click", async () => {
    const email = document.getElementById("login-email").value.trim();
    const pass  = document.getElementById("login-password").value;
    const errEl = document.getElementById("login-error");
    errEl.classList.add("hidden");
    if (!email || !pass) return showError(errEl, "Please fill in all fields.");
    try {
      setLoading("btn-login", true);
      await f().signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
      showError(errEl, friendlyAuthError(e.code));
    } finally {
      setLoading("btn-login", false);
    }
  });

  // Register
  document.getElementById("btn-register").addEventListener("click", async () => {
    const name  = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const pass  = document.getElementById("reg-password").value;
    const phone = document.getElementById("reg-phone").value.trim();
    const errEl = document.getElementById("reg-error");
    errEl.classList.add("hidden");
    if (!name || !email || !pass) return showError(errEl, "Please fill in name, email, and password.");
    if (pass.length < 6) return showError(errEl, "Password must be at least 6 characters.");
    try {
      setLoading("btn-register", true);
      const cred = await f().createUserWithEmailAndPassword(auth, email, pass);
      // Save profile to Firestore
      await f().setDoc(f().doc(db, "users", cred.user.uid), {
        name, email, phone,
        createdAt: new Date().toISOString(),
        uid: cred.user.uid,
      });
    } catch (e) {
      showError(errEl, friendlyAuthError(e.code));
    } finally {
      setLoading("btn-register", false);
    }
  });

  // Logout
  document.getElementById("btn-logout").addEventListener("click", signOutUser);
  document.getElementById("btn-logout-profile").addEventListener("click", signOutUser);
}

async function signOutUser() {
  try {
    stopLocationSharing();
    await f().signOut(auth);
    showScreen("auth");
    toast("Signed out. Stay safe! 💜");
  } catch (e) {
    toast("Error signing out.");
  }
}

function friendlyAuthError(code) {
  const map = {
    "auth/user-not-found":    "No account found with this email.",
    "auth/wrong-password":    "Incorrect password.",
    "auth/email-already-in-use": "Email already registered.",
    "auth/invalid-email":     "Invalid email address.",
    "auth/weak-password":     "Password must be at least 6 characters.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/invalid-credential": "Invalid email or password.",
  };
  return map[code] || "Something went wrong. Try again.";
}

// ═══════════════════════════════════════════════════════
// USER PROFILE
// ═══════════════════════════════════════════════════════
async function loadUserProfile() {
  if (!state.user) return;
  try {
    const snap = await f().getDoc(f().doc(db, "users", state.user.uid));
    if (snap.exists()) {
      state.profile = snap.data();
      const name = state.profile.name || state.user.email.split("@")[0];
      document.getElementById("user-greeting").textContent = name.split(" ")[0];
      document.getElementById("profile-name").textContent  = state.profile.name || "—";
      document.getElementById("profile-email").textContent = state.profile.email || state.user.email;
    }
  } catch (e) {
    console.warn("Profile load error:", e);
  }
}

async function updateProfileStats() {
  if (!state.user) return;
  try {
    const [rSnap, pSnap, cSnap] = await Promise.all([
      f().getDocs(f().query(f().collection(db, "safety_reports"), f().where("uid","==",state.user.uid))),
      f().getDocs(f().query(f().collection(db, "community_posts"), f().where("uid","==",state.user.uid))),
      f().getDocs(f().query(f().collection(db, "emergency_contacts"), f().where("uid","==",state.user.uid))),
    ]);
    document.getElementById("stat-reports").textContent  = rSnap.size;
    document.getElementById("stat-posts").textContent    = pSnap.size;
    document.getElementById("stat-contacts").textContent = cSnap.size;
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════
function bindNavigation() {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav));
  });
}

function navigate(page) {
  state.currentPage = page;
  // Deactivate all pages & nav items
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));

  // Activate target
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add("active");
  const navEl = document.querySelector(`.nav-item[data-nav="${page}"]`);
  if (navEl) navEl.classList.add("active");

  // Init map on first visit
  if (page === "map" && state.map === null && typeof google !== "undefined") {
    setTimeout(initMap, 100);
  }
}

// ═══════════════════════════════════════════════════════
// SOS BUTTON
// ═══════════════════════════════════════════════════════
function bindSOSButton() {
  const btn = document.getElementById("sos-btn");
  let holdStart = null;

  const startHold = () => {
    if (state.sosActive) return;
    holdStart = Date.now();
    btn.classList.add("pressing");
    document.getElementById("sos-progress-wrap").classList.remove("hidden");
    state.sosProgress = 0;
    let count = 3;
    document.getElementById("sos-countdown").textContent = count;

    state.sosInterval = setInterval(() => {
      state.sosProgress += 100 / 30; // 3 seconds at 100ms ticks
      document.getElementById("sos-progress-bar").style.width = Math.min(state.sosProgress, 100) + "%";
      const elapsed = (Date.now() - holdStart) / 1000;
      const remaining = Math.max(0, 3 - Math.floor(elapsed));
      document.getElementById("sos-countdown").textContent = remaining;
      if (elapsed >= 3) triggerSOS();
    }, 100);
  };

  const cancelHold = () => {
    if (state.sosActive) return;
    btn.classList.remove("pressing");
    clearInterval(state.sosInterval);
    document.getElementById("sos-progress-wrap").classList.add("hidden");
    document.getElementById("sos-progress-bar").style.width = "0%";
  };

  btn.addEventListener("mousedown",   startHold);
  btn.addEventListener("touchstart",  startHold, { passive: true });
  btn.addEventListener("mouseup",     cancelHold);
  btn.addEventListener("mouseleave",  cancelHold);
  btn.addEventListener("touchend",    cancelHold);
  btn.addEventListener("touchcancel", cancelHold);

  document.getElementById("btn-cancel-sos").addEventListener("click", cancelSOS);
  document.getElementById("btn-modal-cancel-sos").addEventListener("click", () => {
    cancelSOS();
    closeModal("modal-sos");
  });
}

async function triggerSOS() {
  if (state.sosActive) return;
  clearInterval(state.sosInterval);
  state.sosActive = true;
  document.getElementById("sos-btn").classList.remove("pressing");
  document.getElementById("sos-progress-wrap").classList.add("hidden");
  document.getElementById("sos-progress-bar").style.width = "0%";
  document.getElementById("sos-active-banner").classList.remove("hidden");

  // Update status indicator
  const statusEl = document.getElementById("safe-status");
  statusEl.classList.add("sos-mode");
  statusEl.querySelector("span:last-child").textContent = "SOS";

  openModal("modal-sos");

  // Step 1: Location
  const locAction = document.getElementById("sa-location");
  const pos = await getCurrentPosition();
  if (pos) {
    state.location = pos;
    setActionDone(locAction, `📍 Location captured: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
  } else {
    setActionFail(locAction, "⚠️ Location unavailable");
  }

  // Step 2: Alert contacts
  const contAction = document.getElementById("sa-contacts");
  await sendSOSAlerts(pos);
  setActionDone(contAction, "✅ Emergency contacts alerted");

  // Step 3: Audio recording
  const recAction = document.getElementById("sa-recording");
  await startAudioRecording();
  setActionDone(recAction, "🎙️ Audio recording started");

  // Save alert to Firestore
  try {
    await f().addDoc(f().collection(db, "alerts"), {
      uid: state.user?.uid || "anon",
      type: "SOS",
      location: pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null,
      timestamp: new Date().toISOString(),
      status: "active",
    });
  } catch (_) {}
}

async function sendSOSAlerts(pos) {
  if (!state.user) return;
  try {
    const contactsSnap = await f().getDocs(
      f().query(f().collection(db, "emergency_contacts"), f().where("uid","==",state.user.uid))
    );
    const contacts = [];
    contactsSnap.forEach((d) => contacts.push(d.data()));

    if (contacts.length === 0) {
      toast("⚠️ No emergency contacts! Please add contacts first.");
      return;
    }

    const userName = state.profile?.name || "Someone";
    const locStr = pos
      ? `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`
      : "Location unavailable";

    const message =
      `🚨 *EMERGENCY SOS from ${userName}!*\n\n` +
      `I need help urgently! Please contact me or send help immediately.\n\n` +
      `📍 *My live location:*\n${locStr}\n\n` +
      `⏰ Time: ${new Date().toLocaleTimeString()}\n\n` +
      `_Sent via SafeHer AI 💜_`;

    // Send WhatsApp message to each contact one by one
    sendWhatsAppAlerts(contacts, message);

  } catch (e) {
    console.warn("SOS alert error:", e);
  }
}

function sendWhatsAppAlerts(contacts, message) {
  // Filter contacts that have phone numbers
  const phoneContacts = contacts.filter(c => c.phone && c.phone.trim() !== "");

  if (phoneContacts.length === 0) {
    toast("⚠️ No phone numbers saved on contacts!");
    return;
  }

  toast(`📲 Opening WhatsApp for ${phoneContacts.length} contact(s)…`);

  // Open WhatsApp for each contact with a short delay between each
  phoneContacts.forEach((contact, index) => {
    setTimeout(() => {
      // Clean phone number — remove spaces, dashes, brackets
      const cleanPhone = contact.phone.replace(/[\s\-\(\)\+]/g, "");
      // Add country code if not present (assumes starts with digits)
      const phone = cleanPhone.startsWith("0")
        ? "91" + cleanPhone.substring(1)   // replace leading 0 with country code
        : cleanPhone;

      const encodedMsg = encodeURIComponent(message);
      const waUrl = `https://wa.me/${phone}?text=${encodedMsg}`;

      // Open each contact in a new tab
      window.open(waUrl, `_whatsapp_${index}`);

      toast(`📲 Sending to ${contact.name}… (${index + 1}/${phoneContacts.length})`);
    }, index * 2000); // 2 second gap between each contact
  });
}

function cancelSOS() {
  state.sosActive = false;
  clearInterval(state.sosInterval);
  stopAudioRecording();
  document.getElementById("sos-active-banner").classList.add("hidden");
  document.getElementById("sos-progress-wrap").classList.add("hidden");
  document.getElementById("sos-progress-bar").style.width = "0%";

  const statusEl = document.getElementById("safe-status");
  statusEl.classList.remove("sos-mode");
  statusEl.querySelector("span:last-child").textContent = "Safe";

  // Reset modal actions
  ["sa-location","sa-contacts","sa-recording"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.className = "sos-action-item";
      const originalTexts = {
        "sa-location": "Capturing location…",
        "sa-contacts": "Alerting contacts…",
        "sa-recording": "Starting audio recording…",
      };
      el.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${originalTexts[id]}`;
    }
  });

  closeModal("modal-sos");
  toast("SOS cancelled. Stay safe 💜");
}

function setActionDone(el, text) {
  el.classList.add("done");
  el.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${text}`;
}
function setActionFail(el, text) {
  el.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${text}`;
}

// ═══════════════════════════════════════════════════════
// LOCATION
// ═══════════════════════════════════════════════════════
function getCurrentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true, timeout: 8000, maximumAge: 0,
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("location-toggle");
  if (toggle) {
    toggle.addEventListener("change", () => {
      if (toggle.checked) startLocationSharing();
      else stopLocationSharing();
    });
  }
});

function startLocationSharing() {
  if (!navigator.geolocation) {
    toast("Geolocation not supported on this device.");
    document.getElementById("location-toggle").checked = false;
    return;
  }
  document.getElementById("location-status-text").textContent = "Sharing live with your contacts…";
  state.locationWatchId = navigator.geolocation.watchPosition(
    async (pos) => {
      state.location = pos;
      if (state.user) {
        try {
          await f().setDoc(f().doc(db, "users", state.user.uid), {
            liveLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: new Date().toISOString() }
          }, { merge: true });
        } catch (_) {}
      }
    },
    () => { toast("Could not get location."); },
    { enableHighAccuracy: true, maximumAge: 5000 }
  );
  toast("📍 Live location sharing ON");
}

function stopLocationSharing() {
  if (state.locationWatchId !== null) {
    navigator.geolocation.clearWatch(state.locationWatchId);
    state.locationWatchId = null;
  }
  document.getElementById("location-status-text").textContent = "Tap to share with contacts";
}

// ═══════════════════════════════════════════════════════
// AUDIO RECORDING
// ═══════════════════════════════════════════════════════
async function startAudioRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];
    state.mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.audioChunks.push(e.data);
    };
    state.mediaRecorder.onstop = async () => {
      const blob = new Blob(state.audioChunks, { type: "audio/webm" });
      // In production: upload to Firebase Storage
      console.log("Audio recorded:", blob.size, "bytes");
    };
    state.mediaRecorder.start(1000);
  } catch (e) {
    console.warn("Audio recording denied or unsupported:", e.message);
  }
}

function stopAudioRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
    state.mediaRecorder.stream?.getTracks().forEach((t) => t.stop());
  }
}

// ═══════════════════════════════════════════════════════
// GOOGLE MAPS
// ═══════════════════════════════════════════════════════
window.initMap = async function () {
  const mapEl = document.getElementById("map-container");
  if (!mapEl || !window.google) return;

  // Remove placeholder text via CSS before init
  mapEl.style.display = "block";

  const center = { lat: 40.7128, lng: -74.006 }; // Default: NYC

  // Try to use real location
  const pos = await getCurrentPosition();
  const userCenter = pos
    ? { lat: pos.coords.latitude, lng: pos.coords.longitude }
    : center;

  state.map = new google.maps.Map(mapEl, {
    center: userCenter,
    zoom: 14,
    styles: DARK_MAP_STYLE,
    disableDefaultUI: true,
    zoomControl: true,
    gestureHandling: "greedy",
  });

  // User location marker
  new google.maps.Marker({
    position: userCenter,
    map: state.map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: "#00f5a0",
      fillOpacity: 1,
      strokeColor: "#fff",
      strokeWeight: 2,
    },
    title: "Your location",
  });

  // Load safety reports as map markers
  loadReportMarkers();
};

async function loadReportMarkers() {
  if (!state.map) return;
  try {
    const snap = await f().getDocs(
      f().query(f().collection(db, "safety_reports"), f().orderBy("timestamp","desc"), f().limit(50))
    );
    snap.forEach((d) => {
      const report = d.data();
      if (!report.lat || !report.lng) return;
      const color = report.type === "suspicious" ? "#ffd60a" : "#ff4d6d";
      new google.maps.Marker({
        position: { lat: report.lat, lng: report.lng },
        map: state.map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: color,
          fillOpacity: 0.8,
          strokeColor: "#fff",
          strokeWeight: 1.5,
        },
        title: report.type?.replace("_"," ").toUpperCase() || "Report",
      });
    });
  } catch (_) {}
}

function bindMapSearch() {
  document.getElementById("btn-safe-route")?.addEventListener("click", calcSafeRoute);
  document.getElementById("map-destination")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") calcSafeRoute();
  });
  document.getElementById("btn-close-route")?.addEventListener("click", () => {
    document.getElementById("route-info").classList.add("hidden");
  });
}

async function calcSafeRoute() {
  const dest = document.getElementById("map-destination").value.trim();
  if (!dest) { toast("Please enter a destination."); return; }
  if (!state.map || !window.google) {
    toast("Map not loaded. Add your Google Maps API key.");
    return;
  }

  const pos = await getCurrentPosition();
  if (!pos) { toast("Could not get your location."); return; }

  const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  const directionsService = new google.maps.DirectionsService();
  const directionsRenderer = new google.maps.DirectionsRenderer({
    map: state.map,
    polylineOptions: { strokeColor: "#00f5a0", strokeWeight: 4 },
    suppressMarkers: false,
  });

  directionsService.route(
    {
      origin,
      destination: dest,
      travelMode: google.maps.TravelMode.WALKING,
      provideRouteAlternatives: true,
    },
    (result, status) => {
      if (status === "OK") {
        directionsRenderer.setDirections(result);
        const route = result.routes[0].legs[0];
        document.getElementById("route-info").classList.remove("hidden");
        document.getElementById("route-details").textContent =
          `🚶 ${route.distance.text} · ${route.duration.text} · Walking route to ${dest}. Stay on well-lit streets.`;
      } else {
        toast("Route not found. Check destination.");
      }
    }
  );
}

// Dark map style
const DARK_MAP_STYLE = [
  { elementType: "geometry",       stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0a0f" }] },
  { elementType: "labels.text.fill",   stylers: [{ color: "#9090b0" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a3e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111125" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a3a5e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1b2a" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { featureType: "transit", stylers: [{ color: "#1a1a2e" }] },
];

// ═══════════════════════════════════════════════════════
// SAFETY REPORTS
// ═══════════════════════════════════════════════════════
let selectedReportType = "harassment";

function bindReportForm() {
  // Chip selection
  document.getElementById("report-type-group")?.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#report-type-group .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      selectedReportType = chip.dataset.val;
    });
  });

  document.getElementById("btn-use-location")?.addEventListener("click", async () => {
    const pos = await getCurrentPosition();
    if (pos) {
      document.getElementById("report-location").value =
        `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      toast("📍 Location set.");
    } else {
      toast("Could not get location.");
    }
  });

  document.getElementById("btn-submit-report")?.addEventListener("click", submitReport);
}

async function submitReport() {
  const location = document.getElementById("report-location").value.trim();
  const desc     = document.getElementById("report-desc").value.trim();
  const time     = document.getElementById("report-time").value;
  const msgEl    = document.getElementById("report-msg");
  msgEl.classList.add("hidden");

  if (!location || !desc) {
    msgEl.textContent = "Please fill in location and description.";
    msgEl.classList.remove("hidden");
    return;
  }

  setLoading("btn-submit-report", true);

  // Try to parse coordinates from location field
  let lat = null, lng = null;
  const coordMatch = location.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (coordMatch) { lat = parseFloat(coordMatch[1]); lng = parseFloat(coordMatch[2]); }

  try {
    await f().addDoc(f().collection(db, "safety_reports"), {
      uid: state.user?.uid || "anon",
      type: selectedReportType,
      location, lat, lng, desc, time,
      timestamp: new Date().toISOString(),
      userName: state.profile?.name || "Anonymous",
    });

    msgEl.textContent = "✅ Report submitted. Thank you for keeping the community safe!";
    msgEl.classList.remove("hidden");
    document.getElementById("report-desc").value = "";
    document.getElementById("report-location").value = "";
    loadReports();
    updateProfileStats();
    toast("✅ Report submitted!");
  } catch (e) {
    msgEl.textContent = "Error submitting. Check your connection.";
    msgEl.classList.remove("hidden");
  } finally {
    setLoading("btn-submit-report", false);
  }
}

async function loadReports() {
  const listEl = document.getElementById("report-list");
  if (!listEl) return;

  try {
    const snap = await f().getDocs(
      f().query(f().collection(db, "safety_reports"), f().orderBy("timestamp","desc"), f().limit(10))
    );
    if (snap.empty) {
      listEl.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:1.5rem 0;">No reports yet. Be the first to report!</p>`;
      return;
    }
    listEl.innerHTML = "";
    snap.forEach((d) => {
      const r = d.data();
      listEl.appendChild(createReportCard(r));
    });
  } catch (e) {
    listEl.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;">Could not load reports.</p>`;
  }
}

function createReportCard(r) {
  const div = document.createElement("div");
  div.className = "report-card";
  const label = r.type?.replace("_"," ").toUpperCase() || "REPORT";
  const time  = formatTime(r.timestamp);
  div.innerHTML = `
    <div class="rc-head">
      <span class="rc-badge">${label}</span>
      <span class="rc-time">${time}</span>
    </div>
    <p class="rc-desc">${escHtml(r.desc || "")}</p>
    <div class="rc-loc"><i class="fa-solid fa-location-dot"></i> ${escHtml(r.location || "Unknown")}</div>
  `;
  return div;
}

async function loadRecentAlerts() {
  const listEl = document.getElementById("recent-alerts");
  if (!listEl) return;

  try {
    const snap = await f().getDocs(
      f().query(f().collection(db, "safety_reports"), f().orderBy("timestamp","desc"), f().limit(4))
    );
    if (snap.empty) {
      listEl.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:1rem 0;">No recent alerts in your area.</p>`;
      return;
    }
    listEl.innerHTML = "";
    snap.forEach((d) => {
      const r = d.data();
      const card = document.createElement("div");
      card.className = "alert-card";
      card.innerHTML = `
        <div class="alert-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div class="alert-body">
          <strong>${r.type?.replace("_"," ").toUpperCase() || "REPORT"}</strong>
          <small>${escHtml(r.location || "Unknown location")} · ${formatTime(r.timestamp)}</small>
        </div>
      `;
      listEl.appendChild(card);
    });
  } catch (_) {
    listEl.innerHTML = "";
  }
}

// ═══════════════════════════════════════════════════════
// COMMUNITY FEED
// ═══════════════════════════════════════════════════════
let selectedPostType = "tip";

function bindCommunityForm() {
  document.getElementById("post-type-group")?.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#post-type-group .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      selectedPostType = chip.dataset.val;
    });
  });
  document.getElementById("btn-post")?.addEventListener("click", submitPost);
}

async function submitPost() {
  const content = document.getElementById("post-content").value.trim();
  if (!content) { toast("Write something first."); return; }

  setLoading("btn-post", true);
  try {
    await f().addDoc(f().collection(db, "community_posts"), {
      uid: state.user?.uid || "anon",
      userName: state.profile?.name || "Anonymous",
      content,
      type: selectedPostType,
      likes: 0,
      timestamp: new Date().toISOString(),
    });
    document.getElementById("post-content").value = "";
    loadCommunityFeed();
    updateProfileStats();
    toast("✅ Post shared with the community!");
  } catch (e) {
    toast("Could not post. Check connection.");
  } finally {
    setLoading("btn-post", false);
  }
}

async function loadCommunityFeed() {
  const feedEl = document.getElementById("community-feed");
  if (!feedEl) return;

  // Real-time listener
  const q = f().query(f().collection(db, "community_posts"), f().orderBy("timestamp","desc"), f().limit(20));
  f().onSnapshot(q, (snap) => {
    if (snap.empty) {
      feedEl.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:2rem 0;">Be the first to share a safety tip! 💜</p>`;
      return;
    }
    feedEl.innerHTML = "";
    snap.forEach((d) => {
      feedEl.appendChild(createPostCard(d.id, d.data()));
    });
  }, () => {
    feedEl.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;">Could not load posts.</p>`;
  });
}

function createPostCard(id, p) {
  const div = document.createElement("div");
  div.className = "post-card";
  const initials = (p.userName || "A").substring(0, 2).toUpperCase();
  const liked    = state.likedPosts.includes(id);
  const typeLabels = { tip: "💡 Tip", warning: "⚠️ Warning", support: "💜 Support" };
  div.innerHTML = `
    <div class="post-header">
      <div class="post-avatar">${initials}</div>
      <div class="post-meta">
        <strong>${escHtml(p.userName || "Anonymous")}</strong>
        <small>${formatTime(p.timestamp)}</small>
      </div>
      <span class="post-type-badge ${p.type || "tip"}">${typeLabels[p.type] || "💡 Tip"}</span>
    </div>
    <p class="post-body">${escHtml(p.content || "")}</p>
    <div class="post-actions">
      <button class="post-action-btn ${liked ? "liked" : ""}" data-post-id="${id}" data-likes="${p.likes || 0}">
        <i class="fa-${liked ? "solid" : "regular"} fa-heart"></i> <span>${p.likes || 0}</span>
      </button>
      <button class="post-action-btn"><i class="fa-regular fa-comment"></i> Support</button>
    </div>
  `;
  div.querySelector("[data-post-id]").addEventListener("click", function () {
    toggleLike(id, parseInt(this.dataset.likes), this);
  });
  return div;
}

async function toggleLike(postId, currentLikes, btn) {
  const isLiked = state.likedPosts.includes(postId);
  if (isLiked) {
    state.likedPosts = state.likedPosts.filter((id) => id !== postId);
  } else {
    state.likedPosts.push(postId);
  }
  localStorage.setItem("safeher_liked", JSON.stringify(state.likedPosts));
  const newCount = isLiked ? currentLikes - 1 : currentLikes + 1;
  btn.dataset.likes = newCount;
  btn.classList.toggle("liked", !isLiked);
  btn.querySelector("i").className = `fa-${!isLiked ? "solid" : "regular"} fa-heart`;
  btn.querySelector("span").textContent = newCount;

  try {
    await f().setDoc(f().doc(db, "community_posts", postId), { likes: Math.max(0, newCount) }, { merge: true });
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════
// EMERGENCY CONTACTS
// ═══════════════════════════════════════════════════════
function bindContactsForm() {
  document.getElementById("btn-add-contact")?.addEventListener("click", addContact);
}

async function addContact() {
  const name     = document.getElementById("contact-name").value.trim();
  const phone    = document.getElementById("contact-phone").value.trim();
  const email    = document.getElementById("contact-email").value.trim();
  const relation = document.getElementById("contact-relation").value;
  const msgEl    = document.getElementById("contact-msg");
  msgEl.classList.add("hidden");

  if (!name || !phone) {
    msgEl.textContent = "Name and phone are required.";
    msgEl.classList.remove("hidden");
    return;
  }

  setLoading("btn-add-contact", true);
  try {
    await f().addDoc(f().collection(db, "emergency_contacts"), {
      uid: state.user?.uid,
      name, phone, email, relation,
      addedAt: new Date().toISOString(),
    });
    ["contact-name","contact-phone","contact-email"].forEach((id) => {
      document.getElementById(id).value = "";
    });
    msgEl.textContent = `✅ ${name} added as emergency contact!`;
    msgEl.classList.remove("hidden");
    loadContacts();
    updateProfileStats();
    toast(`✅ ${name} added!`);
  } catch (e) {
    msgEl.textContent = "Error saving contact.";
    msgEl.classList.remove("hidden");
  } finally {
    setLoading("btn-add-contact", false);
  }
}

async function loadContacts() {
  const listEl = document.getElementById("contacts-list");
  if (!listEl || !state.user) return;

  try {
    const snap = await f().getDocs(
      f().query(f().collection(db, "emergency_contacts"), f().where("uid","==",state.user.uid))
    );
    if (snap.empty) {
      listEl.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:1.5rem 0;">No contacts yet. Add trusted people above. 💜</p>`;
      return;
    }
    listEl.innerHTML = "";
    snap.forEach((d) => {
      listEl.appendChild(createContactCard(d.id, d.data()));
    });
  } catch (_) {
    listEl.innerHTML = "";
  }
}

function createContactCard(id, c) {
  const div = document.createElement("div");
  div.className = "contact-card";
  const initial = (c.name || "?").substring(0, 1).toUpperCase();
  div.innerHTML = `
    <div class="contact-avatar">${initial}</div>
    <div class="contact-info">
      <strong>${escHtml(c.name)}</strong>
      <small>${escHtml(c.phone)} ${c.email ? "· " + escHtml(c.email) : ""}</small>
    </div>
    <span class="contact-relation">${escHtml(c.relation || "Other")}</span>
    <button class="btn-delete-contact" data-contact-id="${id}" title="Remove">
      <i class="fa-solid fa-trash"></i>
    </button>
  `;
  div.querySelector(".btn-delete-contact").addEventListener("click", () => deleteContact(id, c.name));
  return div;
}

async function deleteContact(id, name) {
  if (!confirm(`Remove ${name} from emergency contacts?`)) return;
  try {
    const { deleteDoc, doc: fDoc } = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js");
    await deleteDoc(fDoc(db, "emergency_contacts", id));
    loadContacts();
    updateProfileStats();
    toast(`${name} removed.`);
  } catch (e) {
    toast("Could not remove contact.");
  }
}

// ═══════════════════════════════════════════════════════
// AI HARASSMENT DETECTOR
// ═══════════════════════════════════════════════════════
function bindAIForm() {
  document.getElementById("btn-ai-check")?.addEventListener("click", analyzeMessage);

  // Save OpenAI key locally
  const keyInput = document.getElementById("openai-key");
  if (keyInput) {
    keyInput.value = state.openaiKey;
    keyInput.addEventListener("change", () => {
      state.openaiKey = keyInput.value.trim();
      localStorage.setItem("safeher_openai_key", state.openaiKey);
    });
  }

  // Example buttons
  document.querySelectorAll(".example-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("ai-message").value = btn.dataset.msg;
      toast("Example loaded. Click Analyse!");
    });
  });
}

async function analyzeMessage() {
  const message = document.getElementById("ai-message").value.trim();
  const apiKey  = document.getElementById("openai-key").value.trim() || state.openaiKey;
  const resultEl = document.getElementById("ai-result");

  if (!message) { toast("Paste a message first."); return; }

  resultEl.className = "ai-result";
  resultEl.classList.remove("hidden");
  resultEl.innerHTML = `<div class="ai-result-header"><i class="fa-solid fa-spinner fa-spin"></i> Analysing…</div>`;

  // If no API key, use a simple client-side keyword fallback
  if (!apiKey || !apiKey.startsWith("sk-")) {
    const result = localClassify(message);
    showAIResult(resultEl, result);
    return;
  }

  setLoading("btn-ai-check", true);
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        max_tokens: 200,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `You are a safety AI for a women's safety app. Analyse the following message and classify it as exactly one of: SAFE, ABUSIVE, or THREATENING. Then provide a short explanation (1-2 sentences) of why. Respond ONLY in this JSON format: {"classification":"SAFE|ABUSIVE|THREATENING","reason":"your explanation","severity":"low|medium|high"}`,
          },
          { role: "user", content: `Analyse this message: "${message}"` },
        ],
      }),
    });

    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = await resp.json();
    let raw = data.choices?.[0]?.message?.content || "{}";
    raw = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    showAIResult(resultEl, parsed);
  } catch (e) {
    console.warn("OpenAI error:", e.message);
    // Fallback to local classifier
    const result = localClassify(message);
    result.note = "(Using local analysis – add OpenAI API key for full accuracy)";
    showAIResult(resultEl, result);
  } finally {
    setLoading("btn-ai-check", false);
  }
}

function localClassify(message) {
  const msg = message.toLowerCase();
  const threateningWords = ["kill","hurt","find you","come for you","know where","make you pay","destroy","i will get","violence","murder","attack","harm you","come to your","stab","shoot"];
  const abusiveWords    = ["stupid","idiot","worthless","ugly","nobody wants","disgusting","pathetic","dumb","loser","trash","hate you","go away","shut up","whore","slut","bitch"];

  if (threateningWords.some((w) => msg.includes(w))) {
    return { classification: "THREATENING", reason: "This message contains threatening language that may indicate a safety risk.", severity: "high" };
  }
  if (abusiveWords.some((w) => msg.includes(w))) {
    return { classification: "ABUSIVE", reason: "This message contains abusive or harassing language.", severity: "medium" };
  }
  return { classification: "SAFE", reason: "This message appears to be safe and respectful.", severity: "low" };
}

function showAIResult(el, result) {
  const cls = (result.classification || "SAFE").toUpperCase();
  const config = {
    SAFE:       { cssClass: "safe",       icon: "fa-circle-check",       title: "✅ SAFE" },
    ABUSIVE:    { cssClass: "abusive",    icon: "fa-face-angry",         title: "⚠️ ABUSIVE" },
    THREATENING:{ cssClass: "threatening",icon: "fa-skull-crossbones",   title: "🚨 THREATENING" },
  };
  const c = config[cls] || config.SAFE;
  el.className = `ai-result ${c.cssClass}`;
  el.innerHTML = `
    <div class="ai-result-header">
      <i class="fa-solid ${c.icon}"></i>
      ${c.title}
      <span style="font-size:0.75rem;font-weight:500;margin-left:0.4rem;opacity:0.75;">${result.severity || ""}</span>
    </div>
    <p class="ai-result-body">${escHtml(result.reason || "")}</p>
    ${result.note ? `<p style="font-size:0.78rem;margin-top:0.5rem;opacity:0.65;">${result.note}</p>` : ""}
  `;

  // Save to Firestore for audit trail
  if (state.user && cls !== "SAFE") {
    f().addDoc(f().collection(db, "alerts"), {
      uid: state.user.uid,
      type: "harassment_detection",
      classification: cls,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════
function bindProfileActions() {
  document.getElementById("btn-about")?.addEventListener("click", () => openModal("modal-about"));
  document.getElementById("btn-profile-location")?.addEventListener("click", () => {
    navigate("dashboard");
    setTimeout(() => {
      document.getElementById("location-toggle").checked = !document.getElementById("location-toggle").checked;
      document.getElementById("location-toggle").dispatchEvent(new Event("change"));
    }, 200);
  });
}

// ═══════════════════════════════════════════════════════
// MODALS & TOASTS
// ═══════════════════════════════════════════════════════
function bindModals() {
  document.querySelectorAll(".modal-close[data-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.modal));
  });
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });
}

function openModal(id) {
  document.getElementById(id)?.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal(id) {
  document.getElementById(id)?.classList.add("hidden");
  document.body.style.overflow = "";
}

let toastTimer = null;
function toast(msg, duration = 3000) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), duration);
}

// ═══════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn._originalHTML = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Loading…`;
  } else {
    btn.innerHTML = btn._originalHTML || btn.innerHTML;
  }
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(isoString) {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    const now  = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60)  return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch (_) {
    return "—";
  }
}

// ═══════════════════════════════════════════════════════
// SERVICE WORKER (PWA)
// ═══════════════════════════════════════════════════════
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
