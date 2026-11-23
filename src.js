import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import "./style.css";

const locations = [
  "Library", "STEM Lab (Robotics Lab)", "Sports Ground", "Physics Lab",
  "Chemistry Lab", "Art Room", "Medical Room"
];
const cfg = window.APP_CONFIG || {};
const connected = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
const db = connected ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
const $ = (s) => document.querySelector(s);
const app = $("#app");
let activeMode = "overview";
let teams = Array.from({length:7}, (_,i)=>({
  team_number:i+1, team_name:`Team ${i+1}`, status:"Not started",
  route:[], elapsed:"—"
}));
let routes = {};
let stationTokens = {};
let adminUser = null;
let cameraStream = null;
let scanFrame = 0;

const escapeHtml = (v="") => String(v).replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const showToast = (msg) => {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),2600);
};
function shell() {
  app.innerHTML = `
    <header class="topbar">
      <div class="brand"><div class="mark">TF</div><div><b>TECH FEST</b><span>QR TREASURE HUNT</span></div></div>
      <span class="status ${connected?"online":"demo"}">${connected?"BACKEND CONFIGURED":"PREVIEW MODE"}</span>
    </header>
    <main>
      <section class="hero"><p class="eyebrow">SCHOOL EVENT CONTROL</p><h1>QR Treasure Hunt</h1>
      <p class="sub">Seven checkpoint stations. Different routes for every team. One common finish at the Mandap area.</p></section>
      <div id="notice" class="notice"></div>
      <nav class="tabs">
        <button data-mode="overview" class="tab active">Overview</button>
        <button data-mode="admin" class="tab">Admin</button>
        <button data-mode="volunteer" class="tab">Volunteer</button>
        <button data-mode="print" class="tab">QR print sheets</button>
      </nav>
      <section id="view"></section>
      <footer>TECH FEST · QR TREASURE HUNT <span>Use test mode before event day</span></footer>
    </main>
    <div id="toast" class="toast"></div>`;
  $("#notice").innerHTML = connected
    ? `<b>Backend settings found.</b> Apply the SQL setup and configure users/routes before enabling real event operations.`
    : `<b>Preview mode only.</b> This build demonstrates the workflow. Shared timers, logins and live results require the hosted database setup. Do not use preview mode for the actual competition.`;
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>switchMode(b.dataset.mode)));
  switchMode("overview");
}
function switchMode(mode) {
  activeMode=mode;
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  if(mode==="overview") renderOverview();
  if(mode==="admin") renderAdmin();
  if(mode==="volunteer") renderVolunteer();
  if(mode==="print") renderPrint();
}
function renderOverview() {
  $("#view").innerHTML = `
    <div class="stats">
      <article class="stat"><span>Teams</span><strong>7</strong><small>4 players each</small></article>
      <article class="stat"><span>Checkpoint locations</span><strong>7</strong><small>Each team visits 5</small></article>
      <article class="stat"><span>Final destination</span><strong>1</strong><small>Mandap area</small></article>
    </div>
    <section class="panel">
      <div class="panel-head"><div><p class="eyebrow">CHECKPOINT NETWORK</p><h2>Seven school locations</h2></div><span class="count">7 VOLUNTEER STATIONS</span></div>
      <div class="locations">${locations.map((n,i)=>`<div class="location"><span class="number">${String(i+1).padStart(2,"0")}</span><strong>${escapeHtml(n)}</strong><i></i></div>`).join("")}</div>
      <div class="finish"><span class="flag">FINISH</span><div><b>Mandap area</b><small>Common final destination for all teams</small></div></div>
    </section>
    <section class="panel"><p class="eyebrow">EVENT FLOW</p><h2>How the hunt works</h2>
      <div class="flow">
        ${[
          ["01","One team QR","Each team keeps one unique QR for the entire hunt."],
          ["02","Start","A volunteer scans it once to start the server timer and reveal the first clue."],
          ["03","Five checkpoints","At each assigned station, the volunteer scans the same QR and enters the team keyword."],
          ["04","Next clue","The server checks the team's expected station and keyword before revealing the next clue."],
          ["05","Mandap finish","The Mandap volunteer scans that same team QR to record the finish time."]
        ].map(x=>`<div class="flowrow"><b>${x[0]}</b><div><strong>${x[1]}</strong><small>${x[2]}</small></div></div>`).join("")}
      </div>
    </section>`;
}
function renderAdmin() {
  if (!connected) {
    $('#view').innerHTML = `<section class="panel"><h2>Admin dashboard</h2><div class="notice">Connect Supabase and run <code>supabase/schema.sql</code> to enable admin tools.</div></section>`;
    return;
  }
  $('#view').innerHTML = `<section class="panel"><div class="panel-head"><div><p class="eyebrow">ADMIN CONTROL</p><h2>Event dashboard</h2></div><span class="count">ADMIN ONLY</span></div><div id="authbox"></div><div id="admin-controls"></div></section>`;
  renderAuthBox();
}
async function renderAuthBox() {
  const box=$('#authbox'); if(!box)return;
  const {data:{session}}=await db.auth.getSession();
  if(session) {
    adminUser=session.user;
    box.innerHTML=`<div class="signed"><span>Signed in as ${escapeHtml(session.user.email)}</span><button id="logout" class="smallbtn">Sign out</button></div>`;
    $('#logout').onclick=async()=>{await db.auth.signOut();adminUser=null;renderAdmin();};
    if(activeMode==='admin') renderAdminControls();
    if(activeMode==='volunteer') renderVolunteerControls();
  } else {
    box.innerHTML=`<div class="loginrow"><input id="email" type="email" placeholder="Email"><input id="password" type="password" placeholder="Password"><button id="login" class="primary">Sign in</button></div><small class="muted">Use the individual account created for your role.</small>`;
    $('#login').onclick=async()=>{
      const {error}=await db.auth.signInWithPassword({email:$('#email').value,password:$('#password').value});
      if(error)showToast(error.message);else {showToast('Signed in'); if(activeMode==='admin')renderAdmin();else renderVolunteer();}
    };
  }
}
async function renderAdminControls() {
  const host=$('#admin-controls'); if(!host)return;
  host.innerHTML='<p class="muted">Loading event setup…</p>';
  const {data,error}=await db.rpc('admin_get_setup');
  if(error){host.innerHTML=`<div class="notice">${escapeHtml(error.message)}. Check that this account has the admin role.</div>`;return;}
  const ev=data.event;
  host.innerHTML=`
    <div class="stats compact"><article class="stat"><span>Event status</span><strong>${ev.is_open?'OPEN':'CLOSED'}</strong><small>Do not open until routes are ready</small></article><article class="stat"><span>Teams configured</span><strong>${data.teams.length}/7</strong><small>Five stops per team</small></article><article class="stat"><span>Finish point</span><strong>Mandap</strong><small>Common finish</small></article></div>
    <div class="notice">Configure each team's five stops below. The keyword is saved as a secure hash and is not shown again after saving.</div>
    <h3>Team and route setup</h3>
    <label>Team</label><select id="route-team">${data.teams.map(t=>`<option value="${t.team_number}">${escapeHtml(t.team_name)}</option>`).join('')}</select>
    <label>Stop number</label><select id="route-seq">${[1,2,3,4,5].map(n=>`<option>${n}</option>`).join('')}</select>
    <label>Checkpoint location</label><select id="route-location">${data.checkpoints.map(c=>`<option>${escapeHtml(c.location)}</option>`).join('')}</select>
    <label>Location riddle</label><textarea id="route-riddle" rows="2" placeholder="Enter the clue that leads the team here"></textarea>
    <label>Checkpoint keyword answer</label><input id="route-keyword" placeholder="Set the answer volunteers will verify">
    <button id="save-route" class="primary wide">Save this route stop</button>
    <div class="notice" id="route-result">${data.teams.map(t=>`${escapeHtml(t.team_name)}: ${t.route.length}/5 stops`).join(' · ')}</div>
    <h3>Event controls</h3><button id="toggle-event" class="primary wide">${ev.is_open?'Close event':'Open event'}</button>
    <h3>Leaderboard</h3><button id="refresh-board" class="smallbtn">Refresh leaderboard</button><div id="leaderboard"></div>
    <h3>QR token material</h3><p class="muted">Private tokens for printing. Keep these sheets with event staff only.</p><button id="load-qrs" class="smallbtn">Load QR print data</button><div id="qr-data"></div>`;
  $('#save-route').onclick=async()=>{
    const args={p_team_number:Number($('#route-team').value),p_sequence:Number($('#route-seq').value),p_location_name:$('#route-location').value,p_riddle:$('#route-riddle').value,p_keyword:$('#route-keyword').value};
    const {error}=await db.rpc('admin_set_route',args);
    if(error)showToast(error.message);else{showToast('Route stop saved');$('#route-keyword').value='';$('#route-result').textContent='Saved. Refresh setup to review route progress.';renderAdminControls();}
  };
  $('#toggle-event').onclick=async()=>{
    const {error}=await db.rpc('admin_set_event_open',{p_is_open:!ev.is_open});
    if(error)showToast(error.message);else{showToast(ev.is_open?'Event closed':'Event opened');renderAdminControls();}
  };
  $('#refresh-board').onclick=loadLeaderboard;
  $('#load-qrs').onclick=async()=>{
    const {data:setup,error}=await db.rpc('admin_get_setup'); if(error){showToast(error.message);return;}
    const out=$('#qr-data');out.innerHTML='';
    for(const t of setup.teams){const url=await QRCode.toDataURL(t.team_token,{width:180,margin:2});out.insertAdjacentHTML('beforeend',`<div class="teamcard"><b>${escapeHtml(t.team_name)} — TEAM QR</b><img width="180" src="${url}"><span>Use this exact QR at start, all five checkpoints and Mandap. Keep private.</span></div>`);}
  };
  loadLeaderboard();
}
async function loadLeaderboard(){
  const host=$('#leaderboard');if(!host)return;
  const {data,error}=await db.rpc('admin_leaderboard');
  if(error){host.innerHTML=`<p class="muted">${escapeHtml(error.message)}</p>`;return;}
  host.innerHTML=`<div class="teamgrid">${data.map((t,i)=>`<div class="teamcard"><b>${i+1}. ${escapeHtml(t.team_name)}</b><span>${escapeHtml(t.status)} · ${t.completed_count}/5 stops · ${t.elapsed_seconds==null?'—':Math.floor(t.elapsed_seconds/60)+'m '+(t.elapsed_seconds%60)+'s'}</span></div>`).join('')}</div>`;
}
function renderVolunteer() {
  if(!connected){$('#view').innerHTML=`<section class="panel"><h2>Volunteer station</h2><div class="notice">Connect Supabase and deploy the backend before checkpoint verification can work.</div></section>`;return;}
  $('#view').innerHTML=`<section class="panel"><div class="panel-head"><div><p class="eyebrow">CHECKPOINT OPERATIONS</p><h2>Volunteer station</h2></div><span class="count">VOLUNTEER LOGIN</span></div><div id="authbox"></div><div id="volunteer-controls"></div></section>`;
  renderAuthBox();
}
function renderVolunteerControls(){
  const host=$('#volunteer-controls');if(!host)return;
  host.innerHTML=`<div class="notice">Scan the team's ONE QR at every stage. The server knows your assigned station and checks the team's next expected checkpoint automatically.</div>
    <h3>Scan team QR</h3>
    <video id="qr-video" playsinline muted style="display:none;width:100%;max-width:420px;border-radius:12px;background:#000"></video>
    <div class="buttonrow"><button id="start-camera" class="primary">Open camera scanner</button><button id="stop-camera" class="smallbtn" disabled>Stop camera</button></div>
    <label>Scanned team QR token (manual fallback)</label><input id="team-token" placeholder="Scan QR or paste token here" autocomplete="off">
    <label>Keyword given by team (leave blank for the very first start scan and Mandap finish)</label><input id="team-keyword" placeholder="Enter checkpoint keyword" autocomplete="off">
    <button id="submit-team-scan" class="primary wide">Submit scan</button>
    <div id="scan-result" class="notice" aria-live="polite">Ready to scan.</div>`;

  const video=$('#qr-video'), tokenInput=$('#team-token');
  const stopCamera=()=>{
    if(scanFrame)cancelAnimationFrame(scanFrame); scanFrame=0;
    if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
    video.pause();video.srcObject=null;video.style.display='none';
    $('#stop-camera').disabled=true;$('#start-camera').disabled=false;
  };
  $('#stop-camera').onclick=stopCamera;
  $('#start-camera').onclick=async()=>{
    if(!('BarcodeDetector' in window)){showToast('Camera QR scanning is not supported in this browser. Use the manual token field or try updated Chrome/Edge.');return;}
    try{
      const detector=new BarcodeDetector({formats:['qr_code']});
      cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      video.srcObject=cameraStream;video.style.display='block';await video.play();
      $('#start-camera').disabled=true;$('#stop-camera').disabled=false;
      const scan=async()=>{
        if(!cameraStream)return;
        try{
          const codes=await detector.detect(video);
          if(codes.length && codes[0].rawValue){tokenInput.value=codes[0].rawValue.trim();stopCamera();showToast('Team QR scanned. Enter the keyword if this is a checkpoint.');return;}
        }catch(e){/* wait for the next camera frame */}
        scanFrame=requestAnimationFrame(scan);
      };
      scanFrame=requestAnimationFrame(scan);
    }catch(e){stopCamera();showToast(`Could not open camera: ${e.message}`);}
  };
  $('#submit-team-scan').onclick=async()=>{
    const token=tokenInput.value.trim();
    if(!token){showToast("Scan or enter the team's QR token first.");return;}
    const button=$('#submit-team-scan');button.disabled=true;button.textContent='Checking…';
    const {data,error}=await db.rpc('volunteer_scan_team',{p_team_token:token,p_keyword:$('#team-keyword').value.trim()||null});
    button.disabled=false;button.textContent='Submit scan';
    const result=$('#scan-result');
    if(error){result.textContent=error.message;showToast(error.message);return;}
    if(data.action==='started'){
      result.innerHTML=`<b>${escapeHtml(data.team_name)} — timer started</b><br>Give them this first clue:<br><strong>${escapeHtml(data.next_riddle)}</strong>`;
    }else if(data.action==='checkpoint'){
      result.innerHTML=`<b>${escapeHtml(data.team_name)} — correct keyword</b><br>Progress: ${data.completed_count}/5<br>${data.proceed_to_finish?'All five checkpoints complete. Send the team to Mandap.':`Next clue: <strong>${escapeHtml(data.next_riddle)}</strong>`}`;
      $('#team-keyword').value='';
    }else if(data.action==='finished'){
      const mins=Math.floor(data.elapsed_seconds/60),secs=data.elapsed_seconds%60;
      result.innerHTML=`<b>${escapeHtml(data.team_name)} — FINISHED!</b><br>Total time: ${mins}m ${secs}s`;
      tokenInput.value='';$('#team-keyword').value='';
    }
  };
  window.addEventListener('pagehide',stopCamera,{once:true});
}
function renderPrint() {
  $("#view").innerHTML=`
    <section class="panel">
      <div class="panel-head"><div><p class="eyebrow">PRINT MATERIALS</p><h2>QR sheet planning</h2></div><span class="count">DRAFT</span></div>
      <p class="muted">Generate exactly seven private team QR codes. Each team keeps the same QR from the starting desk through all five checkpoints and the Mandap finish.</p>
      <div class="printgrid"><div><b>7 permanent team QR codes</b><small>One unique QR per team, reused at every station.</small></div><div><b>No station QR codes</b><small>The signed-in volunteer account identifies the station.</small></div><div><b>No separate finish QR</b><small>The Mandap volunteer scans the team's QR to finish.</small></div></div>
      <div class="notice">Real team QR codes are generated from private database tokens after setup. Keep printed sheets with event staff; never post QR images publicly.</div>
    </section>`;
}
shell();
