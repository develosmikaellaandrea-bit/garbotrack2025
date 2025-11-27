// ------------ SUPABASE INIT -------------
const SUPABASE_URL = "https://llbtejglhysuxgculmdf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsYnRlamdsaHlzdXhnY3VsbWRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MTY0ODEsImV4cCI6MjA3OTA5MjQ4MX0.ZJYs0OX_1uEo-mgbKPdhnlIRI3V0UkDchcl_-M0kpk8";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// helper: get body page
const page = document.body.dataset.page;

// helper messages
function setMessage(elId, msg, isError = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#b91c1c" : "#15803d";
}

// ---------- SIGNUP PAGE ----------
if (page === "signup") {
  const form = document.getElementById("signupForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const role = document.getElementById("signupRole").value;

    setMessage("signupMessage", "Creating account...");

    // sign up user in supabase auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: role },
      },
    });

    if (error) {
      console.error(error);
      setMessage("signupMessage", error.message, true);
      return;
    }

    // create profile row
    const userId = data.user?.id;
    if (userId) {
      await supabase.from("profiles").insert({
        id: userId,
        full_name: fullName,
        role: role,
      });
    }

    setMessage(
      "signupMessage",
      "Account created! You can now login. (Check your email if confirmation is required.)"
    );
    form.reset();
  });
}

// ---------- LOGIN PAGE ----------
if (page === "login") {
  const form = document.getElementById("loginForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const selectedRole = document.getElementById("loginRole").value;

    setMessage("loginMessage", "Logging in...");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error(error);
      setMessage("loginMessage", error.message, true);
      return;
    }

    const user = data.user;
    // get role from profiles table
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profErr || !profile) {
      console.error(profErr);
      setMessage("loginMessage", "Profile not found.", true);
      return;
    }

    if (profile.role !== selectedRole) {
      setMessage(
        "loginMessage",
        `This account is registered as ${profile.role}.`,
        true
      );
      return;
    }

    // redirect
    if (profile.role === "admin") {
      window.location.href = "admin.html";
    } else {
      window.location.href = "resident.html";
    }
  });
}

// ------------- COMMON: LOGOUT & SESSION --------------
async function getCurrentProfile() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error(error);
    return null;
  }
  return { user, profile: data };
}

async function handleLogout(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "index.html";
  });
}

// ------------- ADMIN PAGE LOGIC -----------------
if (page === "admin") {
  (async () => {
    const result = await getCurrentProfile();
    if (!result || result.profile.role !== "admin") {
      window.location.href = "index.html";
      return;
    }
    document.getElementById("adminName").textContent =
      result.profile.full_name || "Admin";

    handleLogout("logoutBtnAdmin");

    // Load initial data
    await Promise.all([
      loadResidents(),
      loadDocumentRequests(),
      loadBlotters(),
      loadOfficials(),
      loadAnnouncementsAdmin(),
    ]);
    await refreshStatsAndReports();

    // --- Add resident ---
    document
      .getElementById("addResidentForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("residentName").value.trim();
        const address = document.getElementById("residentAddress").value.trim();
        if (!name || !address) return;

        await supabase.from("residents").insert({ name, address });
        e.target.reset();
        await loadResidents();
        await refreshStatsAndReports();
      });

    // --- Add blotter ---
    document
      .getElementById("addBlotterForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const complainant = document
          .getElementById("blotterComplainant")
          .value.trim();
        const respondent = document
          .getElementById("blotterRespondent")
          .value.trim();
        const details = document
          .getElementById("blotterDetails")
          .value.trim();

        await supabase.from("blotters").insert({
          complainant,
          respondent,
          details,
        });
        e.target.reset();
        await loadBlotters();
        await refreshStatsAndReports();
      });

    // --- Add official ---
    document
      .getElementById("addOfficialForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("officialName").value.trim();
        const position = document
          .getElementById("officialPosition")
          .value.trim();
        await supabase.from("officials").insert({ name, position });
        e.target.reset();
        await loadOfficials();
      });

    // --- Add announcement ---
    document
      .getElementById("addAnnouncementForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = document
          .getElementById("announcementTitle")
          .value.trim();
        const body = document.getElementById("announcementBody").value.trim();
        await supabase.from("announcements").insert({ title, body });
        e.target.reset();
        await loadAnnouncementsAdmin();
        await refreshStatsAndReports();
      });
  })();

  // Loaders
  async function loadResidents() {
    const { data, error } = await supabase
      .from("residents")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    const tbody = document.querySelector("#residentTable tbody");
    tbody.innerHTML = "";
    data.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.name}</td><td>${r.address}</td>`;
      tbody.appendChild(tr);
    });
  }

  async function loadDocumentRequests() {
    const { data, error } = await supabase
      .from("document_requests")
      .select("*, profiles(full_name)")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    const tbody = document.querySelector("#documentRequestsTable tbody");
    tbody.innerHTML = "";
    data.forEach((d) => {
      const residentName = d.profiles?.full_name || "Resident";
      const status = d.status || "Pending";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${residentName}</td><td>${d.type}</td><td>${status}</td>`;
      tbody.appendChild(tr);
    });
  }

  async function loadBlotters() {
    const { data, error } = await supabase
      .from("blotters")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    const tbody = document.querySelector("#blotterTable tbody");
    tbody.innerHTML = "";
    data.forEach((b) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${b.complainant}</td><td>${b.respondent}</td><td>${b.details}</td>`;
      tbody.appendChild(tr);
    });
  }

  async function loadOfficials() {
    const { data, error } = await supabase
      .from("officials")
      .select("*")
      .order("position", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    const tbody = document.querySelector("#officialsTable tbody");
    tbody.innerHTML = "";
    data.forEach((o) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${o.name}</td><td>${o.position}</td>`;
      tbody.appendChild(tr);
    });
  }

  async function loadAnnouncementsAdmin() {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    const container = document.getElementById("announcementList");
    container.innerHTML = "";
    data.forEach((a) => {
      const div = document.createElement("div");
      div.className = "announcement-item";
      const date = new Date(a.created_at).toLocaleString();
      div.innerHTML = `
        <h4>${a.title}</h4>
        <p>${a.body}</p>
        <div class="announcement-meta"><i class="fa-regular fa-clock"></i> ${date}</div>
      `;
      container.appendChild(div);
    });
  }

  async function refreshStatsAndReports() {
    const [{ count: residentCount }, { count: docCount }, { count: blotCount }, { count: annCount }, { data: pendingDocs }] =
      await Promise.all([
        supabase.from("residents").select("*", { count: "exact", head: true }),
        supabase
          .from("document_requests")
          .select("*", { count: "exact", head: true }),
        supabase.from("blotters").select("*", { count: "exact", head: true }),
        supabase
          .from("announcements")
          .select("*", { count: "exact", head: true }),
        supabase
          .from("document_requests")
          .select("id,status")
          .eq("status", "Pending"),
      ]);

    document.getElementById("statResidents").textContent =
      residentCount ?? 0;
    document.getElementById("statDocuments").textContent = docCount ?? 0;
    document.getElementById("statBlotters").textContent = blotCount ?? 0;
    document.getElementById("statAnnouncements").textContent =
      annCount ?? 0;

    document.getElementById("reportTotalResidents").textContent =
      residentCount ?? 0;
    document.getElementById("reportPendingDocs").textContent =
      pendingDocs?.length ?? 0;
    document.getElementById("reportTotalBlotters").textContent =
      blotCount ?? 0;
  }
}

// ------------- RESIDENT PAGE LOGIC ---------------
if (page === "resident") {
  (async () => {
    const result = await getCurrentProfile();
    if (!result || result.profile.role !== "resident") {
      window.location.href = "index.html";
      return;
    }
    const { user, profile } = result;
    document.getElementById("residentName").textContent =
      profile.full_name || "Resident";

    handleLogout("logoutBtnResident");

    await Promise.all([
      loadMyDocumentRequests(user.id),
      loadAnnouncementsResident(),
    ]);

    document
      .getElementById("requestDocumentForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const type = document.getElementById("documentType").value;
        const purpose = document
          .getElementById("documentPurpose")
          .value.trim();

        await supabase.from("document_requests").insert({
          user_id: user.id,
          type,
          purpose,
          status: "Pending",
        });

        e.target.reset();
        await loadMyDocumentRequests(user.id);
      });
  })();

  async function loadMyDocumentRequests(userId) {
    const { data, error } = await supabase
      .from("document_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }
    const tbody = document.querySelector("#myRequestsTable tbody");
    tbody.innerHTML = "";
    data.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.type}</td><td>${r.purpose}</td><td>${
        r.status || "Pending"
      }</td>`;
      tbody.appendChild(tr);
    });
  }

  async function loadAnnouncementsResident() {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    const container = document.getElementById("residentAnnouncements");
    container.innerHTML = "";
    data.forEach((a) => {
      const div = document.createElement("div");
      div.className = "announcement-item";
      const date = new Date(a.created_at).toLocaleString();
      div.innerHTML = `
        <h4>${a.title}</h4>
        <p>${a.body}</p>
        <div class="announcement-meta"><i class="fa-regular fa-clock"></i> ${date}</div>
      `;
      container.appendChild(div);
    });
  }
}

/*
NOTE: sa Supabase database, kailangan mo gumawa ng tables (simplest version):

profiles:      id (uuid, PK, references auth.users), full_name text, role text
residents:     id bigserial PK, name text, address text, created_at timestamp default now()
document_requests: id bigserial PK, user_id uuid references auth.users, type text, purpose text, status text, created_at timestamp default now()
blotters:      id bigserial PK, complainant text, respondent text, details text, created_at timestamp default now()
officials:     id bigserial PK, name text, position text
announcements: id bigserial PK, title text, body text, created_at timestamp default now()

Set RLS policies para ma-access ng anon key as needed.
*/