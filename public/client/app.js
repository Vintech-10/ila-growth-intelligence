/* Scale9X Client Portal (Phase 2) — talks to the shared DB via the platform API. */
const $=s=>document.getElementById(s);
const esc=s=>(''+(s==null?'':s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// Normalise growth-position labels (maps legacy stored quadrants to the current names).
function normPos(q){ q=String(q||'');
  if(/best client|high growth potential/i.test(q)) return 'High Growth Potential';
  if(/scale/i.test(q)) return 'Scale Ready';
  if(/mature/i.test(q)) return 'Mature — Limited Headroom';
  if(/high risk|reposition/i.test(q)) return 'Reposition Required';
  return q||'—'; }
const go=h=>location.hash=h;
const TOK=()=>localStorage.getItem('1xl_tok');
const UI=()=>{try{return JSON.parse(localStorage.getItem('1xl_ui'))||{}}catch(e){return{}}};
const saveUI=o=>localStorage.setItem('1xl_ui',JSON.stringify(Object.assign(UI(),o)));

let S = { loaded:false };
async function api(method,path,body){
  const r=await fetch(path,{method,headers:Object.assign({'Content-Type':'application/json'},TOK()?{Authorization:'Bearer '+TOK()}:{}),body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));
  if(r.status===401 && TOK()){ localStorage.removeItem('1xl_tok'); S={loaded:false}; go('#/login'); throw new Error('Your session expired — please sign in again.'); }
  if(!r.ok) throw new Error(d.error||('Request failed ('+r.status+')'));
  return d;
}
async function loadState(){
  const d=await api('GET','/api/portal/state');
  S=Object.assign({loaded:true},d);
  S.assign={}; (S.members||[]).forEach(m=>(m.sections||[]).forEach(sec=>S.assign[sec]=m.id));
  // Transient UI state (idx/drafts/activeMember) lives in localStorage, which is SHARED across every
  // client signed in on this browser. Scope it to THIS engagement so a previous client's progress can't
  // leak into a new one (which would jump a brand-new client past every question with no input box).
  const cid=S.responseId||(S.company&&S.company.name)||'';
  let ui=UI();
  if(ui._cid!==cid){ ui={_cid:cid}; localStorage.setItem('1xl_ui',JSON.stringify(ui)); }
  const fu=firstUnanswered();
  S.idx=Math.max(0,Math.min(typeof ui.idx==='number'?ui.idx:fu,fu)); // never run ahead of the first unanswered question
  S.activeMember=ui.activeMember||S.ownerId;
  if(!(S.members||[]).some(m=>m.id===S.activeMember)) S.activeMember=S.ownerId;
  S.drafts=ui.drafts||{};
  S.reports=[]; S.reportSections={};
  try{ S.reports=((await api('GET','/api/portal/reports')).reports)||[]; }catch(e){}
  for(const rp of S.reports){ try{ S.reportSections[rp.id]=await api('GET','/api/portal/report/'+rp.id); }catch(e){} }
  S.reportData=(S.report&&S.reportSections[S.report.id])?S.reportSections[S.report.id]:null;
  try{ const n=await api('GET','/api/portal/notifications'); S.notifs=n.items||[]; S.unread=n.unread||0; }catch(e){ S.notifs=[]; S.unread=S.unread||0; }
}
function firstUnanswered(){ for(let i=0;i<PROMPTS.length;i++){ if(!(S.answers&&S.answers[PROMPTS[i].id])) return i; } return PROMPTS.length; }
function members(){ return S.members||[{id:'owner',name:'You',role:'Owner'}]; }
function memberName(id){ const m=members().find(x=>x.id===id); return m?m.name:'You'; }

/* progress */
function profileDone(){ return ['company','industry','revenue','team'].every(k=>S.profile&&S.profile[k]); }
function answeredCount(){ return PROMPTS.filter(p=>S.answers&&S.answers[p.id]&&(''+S.answers[p.id]).trim()).length; }
function ivFraction(){ return answeredCount()/PROMPTS.length; }
function ivDone(){ return answeredCount()>=PROMPTS.length; }
function smartDone(){ return !!(S.smart&&S.smart.confirmed); }
function docCats(){ return Object.keys(S.docs||{}).filter(k=>(S.docs[k]||[]).length).length; }
function docFraction(){ return Math.min(1,docCats()/3); }
function overall(){ return Math.round(100*(profileDone()*.15+ivFraction()*.45+(smartDone()?1:0)*.2+docFraction()*.2)); }

/* shell */
function rail(active){
  const item=(h,label,done)=>`<a class="navitem ${active===h?'active':''}" href="#/${h}">${label}${done?'<span class="tick">✓</span>':''}</a>`;
  return `<aside class="rail"><div class="brand"><div class="mark">S9</div><div><div class="logo">Scale<span class="t">9X</span></div><span>${t('brand.tag')}</span></div></div>
    ${item('dashboard',t('nav.dashboard'),false)}${item('profile',t('nav.profile'),profileDone())}${item('interview',t('nav.interview'),ivDone())}
    ${item('team',t('nav.team'),(S.members&&S.members.length>1))}${item('smart',t('nav.smart'),smartDone())}${item('documents',t('nav.documents'),docCats()>0)}${item('review',t('nav.review'),S.submitted)}${item('reports',t('nav.reports'),!!S.report)}
    <div style="margin-top:auto"><div class="small muted">${t('signedin')} · ${esc(S.company?S.company.name:'')}</div><a href="#/logout" class="btn ghost" style="margin-top:8px;width:100%;justify-content:center;padding:9px">${t('signout')}</a></div></aside>`;
}
function shell(active,body,title){ return `<div class="app">${rail(active)}<div class="main">
  <div class="topbar"><div style="display:flex;align-items:center;gap:10px"><a onclick="history.back()" title="Back" style="cursor:pointer;font-size:20px;color:var(--muted);text-decoration:none">←</a><b>${esc(title||'')}</b></div><div style="display:flex;gap:14px;align-items:center">${langSelect()}<a href="#/notifications" class="muted" title="Updates" style="position:relative;text-decoration:none;display:inline-flex;align-items:center"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>${S.unread?`<span style="position:absolute;top:-7px;right:-9px;background:var(--red);color:#fff;font-size:10px;font-weight:700;border-radius:999px;padding:1px 5px">${S.unread}</span>`:''}</a>${S.submitted?'':`<span class="pill accent">${overall()}% ${t('status.complete')}</span>`}</div></div>
  <div class="content">${body}</div></div></div>`; }
function ring(pct){const r=52,c=2*Math.PI*r,off=c*(1-pct/100);return `<div class="ring"><svg width="120" height="120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="#eee" stroke-width="10"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/></svg><div class="val">${pct}%</div></div>`;}

/* auth */
function vLogin(signup){return `<div class="landing"><div class="left">
  <div>
    <div class="brand" style="padding:0 0 28px"><div class="mark" style="background:rgba(255,255,255,.18);box-shadow:none">S9</div><div class="logo" style="color:#fff;font-size:17px">Scale<span style="color:#C9A77E">9X</span></div></div>
    <div class="tagline">Research · Audit · Diagnose · Grow</div>
    <h1>${t('auth.lead')}</h1><div class="sub">${t('auth.leadsub')}</div>
    <div class="proof">
      <div class="pf"><span class="ic">✓</span><span>${t('auth.p1')}</span></div>
      <div class="pf"><span class="ic">✓</span><span>${t('auth.p2')}</span></div>
      <div class="pf"><span class="ic">✓</span><span>${t('auth.p3')}</span></div>
    </div>
    <div class="mini-score">
      <div class="small" style="opacity:.85;font-weight:600">Sample growth scorecard</div>
      <div class="small" style="display:flex;justify-content:space-between;margin-top:8px"><span>Sales Excellence</span><b>72</b></div><div class="bar"><i style="width:72%"></i></div>
      <div class="small" style="display:flex;justify-content:space-between"><span>Funnel Performance</span><b>41</b></div><div class="bar"><i style="width:41%"></i></div>
      <div class="small" style="display:flex;justify-content:space-between"><span>Technology &amp; Data</span><b>58</b></div><div class="bar" style="margin-bottom:0"><i style="width:58%"></i></div>
    </div>
  </div>
  <div class="small" style="color:rgba(255,255,255,.7)">${t('auth.confidential')}</div></div>
  <div class="right" style="position:relative"><div style="position:absolute;top:22px;right:26px">${langSelect()}</div>
  <div class="authbox">
  <div class="ab-mark"><div class="mark">S9</div><div class="logo">Scale<span class="t">9X</span></div></div>
  <h2 style="font-size:23px">${signup?t('auth.create'):t('auth.welcome')}</h2>
  <div class="muted small" style="margin-top:4px">${signup?t('auth.signup_sub'):t('auth.signin_sub')}</div>
  ${signup?`<div class="field"><label>${t('auth.name')}</label><input class="input" id="f_name"></div><div class="field"><label>${t('auth.company')}</label><input class="input" id="f_company"></div>`:''}
  <div class="field"><label>${t('auth.email')}</label><input class="input" id="f_email"></div><div class="field"><label>${t('auth.password')}</label><input class="input" type="password" id="f_pass" onkeydown="if(event.key==='Enter')${signup?'doSignup()':'doLogin()'}"></div>
  <div id="auth_err" class="small" style="color:var(--red)"></div>
  <button class="btn lg" style="width:100%;justify-content:center;margin-top:4px" onclick="${signup?'doSignup()':'doLogin()'}">${signup?t('auth.createacct'):t('auth.signin')} →</button>
  <div class="muted small" style="text-align:center;margin-top:16px">${signup?`${t('auth.haveacct')} <a href="#/login" style="color:var(--accent);font-weight:600">${t('auth.signin_link')}</a>`:`${t('auth.new')} <a href="#/signup" style="color:var(--accent);font-weight:600">${t('auth.create_link')}</a>`}</div></div></div></div>`;}
async function doSignup(){ try{ const d=await api('POST','/api/auth/signup',{full_name:$('f_name').value.trim(),company:$('f_company').value.trim(),email:$('f_email').value.trim(),password:$('f_pass').value}); localStorage.setItem('1xl_tok',d.token); await loadState(); go('#/dashboard'); }catch(e){ $('auth_err').textContent=e.message; } }
async function doLogin(){ try{ const d=await api('POST','/api/auth/login',{email:$('f_email').value.trim(),password:$('f_pass').value}); localStorage.setItem('1xl_tok',d.token); await loadState(); go('#/dashboard'); }catch(e){ $('auth_err').textContent=e.message; } }
function logout(){ localStorage.removeItem('1xl_tok'); S={loaded:false}; go('#/login'); }

/* dashboard */
function vDashboard(){
  if(S.report && S.reportData) return vDeliveredDashboard();
  const company=esc((S.profile&&S.profile.company)||'your business');
  const pct=overall();
  const next=!profileDone()?['Complete your business profile','#/profile']:!ivDone()?['Continue your discovery interview ('+answeredCount()+'/'+PROMPTS.length+')','#/interview']:!smartDone()?['Confirm your discovery summary','#/smart']:docCats()<3?['Add supporting documents','#/documents']:!S.submitted?['Review and submit','#/review']:['Your diagnostic is under review','#/review'];
  const stages=[['Business profile',profileDone()],['Discovery interview',ivDone()],['Discovery summary',smartDone()],['Supporting documents',docCats()>0],['Review & submit',!!S.submitted]];
  let cur=stages.findIndex(x=>!x[1]); if(cur<0)cur=stages.length-1;
  const jrail=`<div style="position:relative">
     <div style="position:absolute;left:13px;top:16px;bottom:18px;width:1.5px;background:var(--line)"></div>
     ${stages.map((st,i)=>{const done=st[1],active=i===cur&&!done;const bg=done?'background:var(--green-soft);color:var(--green)':active?'background:var(--accent);color:#fff':'background:#fff;border:1.5px solid var(--line-soft);color:var(--muted)';const tc=done?'var(--ink-soft)':active?'var(--ink)':'var(--muted)';return `<div style="position:relative;display:flex;gap:15px;padding-bottom:18px;align-items:center"><div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:0 0 auto;z-index:1;font-size:13px;font-weight:700;${bg}">${done?'✓':String(i+1)}</div><div style="font-size:14px;font-weight:${active?600:500};color:${tc}">${st[0]}${active?' <span class="pill accent" style="margin-left:8px">In progress</span>':''}</div></div>`;}).join('')}
   </div>`;
  return shell('dashboard',`
   <div class="eyebrow">Growth diagnostic</div>
   <h1 class="h-title" style="margin-top:8px">${company}</h1>
   <div class="muted" style="margin-top:8px;max-width:520px;line-height:1.6">You're ${pct}% of the way to a board-ready growth diagnostic.</div>
   <div style="background:var(--card);border:0.5px solid var(--line);border-radius:14px;padding:24px 26px;margin-top:26px;display:flex;align-items:center;justify-content:space-between;gap:22px;flex-wrap:wrap">
     <div style="flex:1;min-width:240px"><div class="tiny">Step ${Math.min(cur+1,5)} of 5 · ${esc(stages[cur][0])}</div><div style="font-size:19px;font-weight:700;color:var(--ink);margin:9px 0 4px;letter-spacing:-.01em">${esc(next[0])}</div><div class="muted small">${pct}% complete</div><div style="height:6px;border-radius:999px;background:var(--bg-soft);margin-top:16px;overflow:hidden;max-width:360px"><div style="width:${pct}%;height:100%;background:var(--accent);border-radius:999px"></div></div></div>
     <a class="btn lg" href="${next[1]}" style="padding:14px 28px">${S.submitted?'View status':'Continue'} →</a>
   </div>
   <div class="divider" style="margin:34px 0 0"></div>
   <div class="tiny" style="margin:26px 0 16px">Your readiness</div>
   ${jrail}
   <div style="margin-top:14px;color:var(--muted);font-size:12.5px">Confidential · reviewed only by your Scale9X analyst team</div>
   `,t('nav.dashboard'));
}

/* profile */
function vProfile(){
  const f=fl=>{const v=(S.profile&&S.profile[fl.id])||'';if(fl.type==='select')return `<div class="field"><label>${fl.label}${fl.req?' *':''}</label><select class="sel" id="p_${fl.id}">${['',...fl.opts].map(o=>`<option ${o===v?'selected':''}>${o}</option>`).join('')}</select></div>`;return `<div class="field"><label>${fl.label}${fl.req?' *':''}</label><input class="input" id="p_${fl.id}" value="${esc(v)}" placeholder="${esc(fl.ph||'')}"></div>`;};
  return shell('profile',`<div class="eyebrow">Business Profile</div><h1 class="h-title">A few basics about your company</h1><p class="muted">Quick context so your discovery feels tailored.</p>
   <div class="card pad" style="margin-top:14px;max-width:620px">${PROFILE_FIELDS.map(f).join('')}<button class="btn" onclick="saveProfile()">Save & continue →</button></div>`,'Business Profile');
}
async function saveProfile(){ const b={}; PROFILE_FIELDS.forEach(fl=>b[fl.id]=$('p_'+fl.id).value.trim()); if(!['company','industry','revenue','team'].every(k=>b[k])){toast('Please complete the required fields (*).');return;} await api('PATCH','/api/portal/profile',b); S.profile=Object.assign(S.profile||{},b); if(S.company)S.company.name=b.company; go('#/interview'); }

/* interview */
function sectionOf(i){return SECTIONS.find(s=>s.key===PROMPTS[i].sec);}
function vInterview(){
  if(ivDone()) return shell('interview',`<div class="eyebrow">Business Discovery Interview</div><h1 class="h-title">That's everything — thank you.</h1><p class="muted">You've completed the interview. Next, review what we heard.</p><div class="card pad" style="margin-top:14px"><div class="turn int"><div class="av">${INTERVIEWER.initial}</div><div class="bubble">Thank you for walking me through your business so openly. Let's confirm what I understood.</div></div><button class="btn lg" style="margin-top:16px" onclick="go('#/smart')">Review what we heard →</button></div>`,'Discovery Interview');
  let thread='',lastSec=null;
  for(let i=0;i<=S.idx&&i<PROMPTS.length;i++){const p=PROMPTS[i],sec=sectionOf(i);if(sec.key!==lastSec){const n=SECTIONS.findIndex(s=>s.key===sec.key)+1;thread+=`<div class="sectionchip">Part ${n} of 10 · ${esc(sec.title)}</div>`;lastSec=sec.key;}
    const ans=S.answers[p.id];const ack=(i>0&&S.answers[PROMPTS[i-1].id])?`<div style="font-size:13px;color:var(--muted);margin-bottom:6px">${ACKS[i%ACKS.length]}</div>`:'';
    thread+=`<div class="turn int"><div class="av">${INTERVIEWER.initial}</div><div class="bubble">${ack}${esc(p.q)}</div></div>`;
    if(ans&&i<S.idx){const who=S.answeredBy[p.id]||S.ownerId;thread+=`<div class="turn cli"><div class="av">${esc((memberName(who)[0]||'Y').toUpperCase())}</div><div class="bubble">${esc(ans)}<div class="edit">— ${esc(memberName(who))} · <span onclick="ivEdit(${i})" style="text-decoration:underline;cursor:pointer">edit</span></div></div></div>`;}}
  const cur=PROMPTS[S.idx];const curSec=cur?sectionOf(S.idx):null;let composer='';
  if(cur){ if(cur.type==='scale'){composer=`<div class="scale">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button onclick="ivScale(${n})">${n}</button>`).join('')}</div>`;}
    else{const draft=esc(S.drafts[cur.id]||S.answers[cur.id]||'');composer=`<textarea class="ta" id="iv_input" placeholder="${esc(cur.ph||'Type your answer…')}" oninput="ivDraft('${cur.id}',this.value)" onblur="ivFlush()">${draft}</textarea>
      <div class="between" style="margin-top:10px"><div class="whyline"><b onclick="document.getElementById('why_${cur.id}').style.display='inline'">Why we ask</b> <span id="why_${cur.id}" style="display:none">— ${esc(cur.why)}</span></div>
      <div style="display:flex;gap:8px;align-items:center"><span id="iv_save" class="muted small" style="min-width:64px;text-align:right">${(S.answers[cur.id]!=null&&S.answers[cur.id]!=='')?'✓ Saved':''}</span><button class="btn" onclick="ivContinue()">Continue →</button></div></div>
      <div class="muted small" style="margin-top:8px">Every question needs an answer before you can submit. Not sure? Write what you can — even “not sure yet” counts. Please don’t leave it blank.</div>`;}}
  const pct=Math.round(ivFraction()*100),part=cur?SECTIONS.findIndex(s=>s.key===cur.sec)+1:10;
  return shell('interview',`<div class="iv-head"><div class="between"><div><div class="eyebrow">Business Discovery Interview</div><div class="muted small">Part ${part} of 10 · with ${INTERVIEWER.name}, ${INTERVIEWER.role}</div></div><span class="pill">${answeredCount()}/${PROMPTS.length}</span></div>
    <div class="iv-progress"><i style="width:${pct}%"></i></div>
    ${cur?`<div class="between" style="margin-top:10px"><div class="muted small">${curSec&&S.assign[curSec.key]?('This part is assigned to <b style="color:var(--accent)">'+esc(memberName(S.assign[curSec.key]))+'</b>'):'Invite teammates to help'} · <a href="#/team" style="color:var(--accent)">Manage team</a></div>
    <div class="small">Answering as <select id="iv_as" class="sel" style="display:inline-block;width:auto;padding:5px 9px;margin-left:4px" onchange="setActiveMember(this.value)">${members().map(m=>`<option value="${m.id}" ${((curSec&&S.assign[curSec.key])||S.activeMember||S.ownerId)===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div></div>`:''}
    </div><div class="thread">${thread}</div><div class="composer">${composer}</div>`,'Discovery Interview');
}
/* --- continuous autosave: persist the in-progress answer to the SERVER as the user types --- */
let _ivTimer=null;
function ivDraft(code,val){
  S.drafts[code]=val; saveUI({drafts:S.drafts});            // instant local safety net
  const ind=$('iv_save'); if(ind){ind.textContent=val.trim()?'Saving…':'';ind.style.color='';}
  clearTimeout(_ivTimer); _ivTimer=setTimeout(()=>ivSaveDraft(code,val),700);  // debounced server save
}
async function ivSaveDraft(code,val){
  const v=(val||'').trim(); const ind=$('iv_save');
  if(!v){ if(ind)ind.textContent=''; return; }
  const p=PROMPTS.find(x=>x.id===code); const by=($('iv_as')||{}).value||S.activeMember||S.ownerId;
  try{
    await api('PUT','/api/portal/answer',{code,section:p?p.sec:null,value:v,by});
    S.answers[code]=v; S.answeredBy[code]=by;
    const i2=$('iv_save'); if(i2){i2.textContent='✓ Saved';i2.style.color='var(--green,#16a34a)';}
  }catch(e){ const i2=$('iv_save'); if(i2){i2.textContent='Saving…';} clearTimeout(_ivTimer); _ivTimer=setTimeout(()=>ivSaveDraft(code,val),2500); }  // keep retrying — never silently lose work
}
function ivFlush(){ clearTimeout(_ivTimer); const el=$('iv_input'); const cur=PROMPTS[S.idx]; if(el&&cur) ivSaveDraft(cur.id,el.value); }
async function ivContinue(){
  clearTimeout(_ivTimer);
  const p=PROMPTS[S.idx];const el=$('iv_input');const v=el?el.value.trim():'';
  if(!v){toast('Please type an answer before continuing. If you’re unsure, write what you can — even “not sure yet”. Questions can’t be left blank.');return;}
  const by=($('iv_as')||{}).value||S.activeMember||S.ownerId;
  const ind=$('iv_save'); if(ind){ind.textContent='Saving…';ind.style.color='';}
  // Save to the SERVER first; only advance once it's persisted (prevents silent answer loss).
  try{ await api('PUT','/api/portal/answer',{code:p.id,section:p.sec,value:v,by}); }
  catch(e){ S.drafts[p.id]=v; saveUI({drafts:S.drafts}); toast('Could not save your answer — the server was unreachable. Your text is kept; please click Continue again in a moment.'); return; }
  S.answers[p.id]=v;S.answeredBy[p.id]=by;delete S.drafts[p.id];S.idx++;saveUI({idx:S.idx,drafts:S.drafts});render();window.scrollTo(0,document.body.scrollHeight);
}
async function ivScale(n){const p=PROMPTS[S.idx];const by=($('iv_as')||{}).value||S.activeMember||S.ownerId;
  try{ await api('PUT','/api/portal/answer',{code:p.id,section:p.sec,value:String(n),by}); }
  catch(e){ toast('Could not save — server unreachable. Please try again.'); return; }
  S.answers[p.id]=String(n);S.answeredBy[p.id]=by;S.idx++;saveUI({idx:S.idx});render();window.scrollTo(0,document.body.scrollHeight);}
function ivEdit(i){S.idx=i;saveUI({idx:i});render();}
function setActiveMember(id){S.activeMember=id;saveUI({activeMember:id});}

/* team */
function vTeam(){
  const ml=members();const secProg=k=>{const ps=PROMPTS.filter(p=>p.sec===k);return ps.filter(p=>S.answers[p.id]).length+'/'+ps.length;};const secWho=k=>{const ps=PROMPTS.filter(p=>p.sec===k);const w=[...new Set(ps.map(p=>S.answeredBy[p.id]).filter(Boolean))];return w.map(memberName).join(', ')||'—';};
  return shell('team',`<div class="eyebrow">Your Team</div><h1 class="h-title">Invite your team to help complete this</h1><p class="muted">Invite teammates, assign them sections, and see exactly who completed what.</p>
   <div class="card pad" style="margin-top:14px;max-width:660px"><b>Invite a team member</b>
     <div class="row wrap" style="margin-top:8px"><div class="field" style="flex:1;min-width:150px"><label>Name</label><input class="input" id="tm_name"></div><div class="field" style="flex:1;min-width:150px"><label>Email</label><input class="input" id="tm_email"></div><div class="field" style="width:150px"><label>Role</label><select class="sel" id="tm_role"><option>Contributor</option><option>Admin</option></select></div></div>
     <label class="small" style="font-weight:600">Assign sections</label><div class="chips" style="margin-top:6px">${SECTIONS.map(s=>`<label class="chip" style="cursor:pointer;font-weight:500"><input type="checkbox" value="${s.key}" class="tm_sec" style="margin-right:6px;vertical-align:middle">${esc(s.sub)}</label>`).join('')}</div>
     <button class="btn" style="margin-top:14px" onclick="inviteMember()">Send invite</button><div class="muted small" style="margin-top:8px">Saved to your shared workspace; in production this emails a secure login link.</div></div>
   <h2 style="font-size:18px;margin:24px 0 8px">Team members</h2><div class="card pad">${ml.map(m=>{const secs=(m.sections||[]).map(k=>(SECTIONS.find(s=>s.key===k)||{}).sub);const ans=PROMPTS.filter(p=>S.answeredBy[p.id]===m.id).length;return `<div class="checkrow"><div><b>${esc(m.name)}</b> <span class="pill ${m.role==='Owner'?'accent':''}">${esc(m.role)}</span><div class="muted small" style="margin-top:3px">${secs.length?('Assigned: '+secs.map(esc).join(', ')):'No sections assigned'}</div></div><div class="muted small">${ans} answers</div></div>`;}).join('')}</div>
   <h2 style="font-size:18px;margin:24px 0 8px">Who's completing what</h2><div class="card pad">${SECTIONS.map(s=>`<div class="checkrow"><div style="flex:1"><b>${esc(s.sub)}</b><div class="muted small" style="margin-top:3px">Answered by: ${esc(secWho(s.key))}</div></div><select class="sel" style="width:180px;padding:6px 9px;margin-right:14px" onchange="assignSection('${s.key}',this.value)"><option value="">Unassigned</option>${ml.map(m=>`<option value="${m.id}" ${S.assign[s.key]===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select><span class="kpi" style="width:52px;text-align:right">${secProg(s.key)}</span></div>`).join('')}</div>`,'Team');
}
let _busy=false; // prevents double-click on mutating client actions
async function inviteMember(){if(_busy)return;const n=$('tm_name').value.trim();if(!n){toast('Enter a name.');return;}_busy=true;try{const secs=[...document.querySelectorAll('.tm_sec:checked')].map(c=>c.value);const d=await api('POST','/api/portal/team',{name:n,email:$('tm_email').value.trim(),role:$('tm_role').value,sections:secs});applyState(d);render();}catch(e){toast(e.message);}finally{_busy=false;}}
async function assignSection(key,mid){const d=await api('POST','/api/portal/assign',{section:key,member_id:mid});applyState(d);render();}
function applyState(d){S.members=d.members;S.assign={};(S.members||[]).forEach(m=>(m.sections||[]).forEach(sec=>S.assign[sec]=m.id));if(d.answeredBy)S.answeredBy=d.answeredBy;}

/* smart */
function smartText(card){if(S.smart&&S.smart[card.key]!=null&&S.smart[card.key]!=='')return S.smart[card.key];return card.from.map(id=>S.answers[id]).filter(Boolean).join('\n\n');}
function vSmart(){
  if(!ivDone())return shell('smart',`<div class="eyebrow">Discovery Summary</div><h1 class="h-title">Finish your interview first</h1><p class="muted">Complete the discovery interview and we'll show what we understood.</p><a class="btn" href="#/interview">Go to interview →</a>`,'Discovery Summary');
  return shell('smart',`<div class="eyebrow">Discovery Summary</div><h1 class="h-title">What we understood about your business</h1><p class="muted">A structured summary of your interview. Refine anything that needs adjusting.</p>
   <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:14px">${SMART_MAP.map(c=>`<div class="card smartcard"><div class="tiny" style="color:var(--accent)">${esc(c.title)}</div><textarea class="ta" id="sm_${c.key}" style="min-height:120px">${esc(smartText(c))}</textarea></div>`).join('')}</div>
   <div class="between" style="margin-top:18px"><div class="muted small">${smartDone()?'✓ Confirmed':'Review and confirm to continue.'}</div><button class="btn lg" onclick="smartConfirm()">This is accurate — confirm →</button></div>`,'Discovery Summary');
}
async function smartConfirm(){const b={confirmed:true};SMART_MAP.forEach(c=>b[c.key]=$('sm_'+c.key).value.trim());await api('POST','/api/portal/smart',b);S.smart=Object.assign({},b);go('#/documents');}

/* documents */
function vDocuments(){
  return shell('documents',`<div class="eyebrow">Supporting Documents</div><h1 class="h-title">Share supporting evidence</h1><p class="muted">Our analysts review your real data as part of the audit. Upload what you have — it makes your diagnostic far more accurate.</p>
   <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:14px">${DOC_CATS.map(cat=>{const files=(S.docs&&S.docs[cat.key])||[];return `<div class="card pad"><div class="between"><b>${esc(cat.title)}</b><div style="display:flex;gap:8px;align-items:center">${files.length?'<span class="pill green">✓ '+files.length+'</span>':'<span class="pill amber">Recommended</span>'}<label class="addbtn">+ Add files<input type="file" multiple style="display:none" onchange="docAdd('${cat.key}',this)"></label></div></div><div class="muted small" style="margin:8px 0 0">${cat.recs.map(r=>esc(r)).join(' · ')}</div>${files.length?`<div class="droom">${files.map(f=>{const x=(f.name.split('.').pop()||'FILE').toUpperCase().slice(0,4);const col={PDF:'#B87333',XLS:'#2C3E50',XLSX:'#2C3E50',CSV:'#2C3E50',DOC:'#001F3F',DOCX:'#001F3F',PPT:'#A86A2E',PPTX:'#A86A2E',PNG:'#64748B',JPG:'#64748B',JPEG:'#64748B',ZIP:'#94A3B8'}[x]||'#94A3B8';return `<div class="drow"><div class="dext" style="background:${col}">${x}</div><div class="dmeta" style="cursor:pointer" title="Download ${esc(f.name)}" onclick="downloadDoc('${f.id}','${esc(f.name).replace(/'/g,"\\'")}')"><div class="dname">${esc(f.name)}</div><div class="dsub">${x} file · click to download</div></div><span class="dstatus">✓ Uploaded</span><span style="cursor:pointer;color:var(--muted);font-size:13px" title="Remove" onclick="docRemove('${f.id}')">✕</span></div>`;}).join('')}</div>`:''}</div>`;}).join('')}</div>
   <button class="btn lg" style="margin-top:18px" onclick="go('#/review')">Continue to review →</button>`,'Supporting Documents');
}
function readAsBase64(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]||''); r.onerror=()=>rej(new Error('Could not read file')); r.readAsDataURL(file); }); }
async function docAdd(cat,input){
  for(const f of [...input.files]){
    if(f.size>10*1024*1024){ toast('"'+f.name+'" is larger than 10MB and was skipped.'); continue; }
    try{
      const data=await readAsBase64(f);
      const d=await api('POST','/api/portal/document',{category:cat,name:f.name,mime:f.type||'application/octet-stream',data});
      S.docs[cat]=S.docs[cat]||[]; S.docs[cat].push({id:d.id,name:f.name});
    }catch(e){ toast('Upload failed for "'+f.name+'": '+e.message); }
  }
  input.value=''; render();
}
async function docRemove(id){ try{ await api('DELETE','/api/portal/document/'+id); }catch(e){ toast(e.message); return; } Object.keys(S.docs).forEach(k=>S.docs[k]=S.docs[k].filter(f=>f.id!==id)); render(); }
// Download via authenticated fetch → blob (a plain link wouldn't carry the Bearer token).
async function downloadDoc(id,name){
  try{
    const r=await fetch('/api/portal/document/'+id,{headers:TOK()?{Authorization:'Bearer '+TOK()}:{}});
    if(!r.ok) throw new Error('Download failed ('+r.status+')');
    const blob=await r.blob(); const u=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=u; a.download=name||'document'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
  }catch(e){ toast(e.message); }
}

/* review */
function vReview(){
  if(S.submitted)return shell('review',`<div class="eyebrow">Submitted</div><h1 class="h-title">Your diagnostic is underway</h1><p class="muted">Thank you. Our analyst team has everything they need to begin your growth diagnostic.</p><div class="card pad" style="margin-top:14px;max-width:560px"><div class="tiny">Current status</div><div style="font-size:18px;font-weight:700;margin:6px 0">Submitted · Under review</div><div class="muted small">You'll be notified when your diagnostic and growth blueprint are ready.</div></div>`,'Review & Submit');
  const rows=[['Business Profile',profileDone(),'#/profile'],['Discovery Interview',ivDone(),'#/interview'],['Discovery Summary confirmed',smartDone(),'#/smart'],['Supporting documents',docCats()>0,'#/documents']];const ready=profileDone()&&ivDone()&&smartDone();
  return shell('review',`<div class="eyebrow">Review & Submit</div><h1 class="h-title">You're almost ready for diagnosis</h1><p class="muted">A quick check before our analysts begin. Documents are recommended but optional.</p>
   <div class="card pad" style="margin-top:14px;max-width:620px">${rows.map(r=>`<div class="checkrow"><div style="display:flex;align-items:center;gap:12px"><span class="checkmark ${r[1]?'on':'off'}">${r[1]?'✓':''}</span><b>${r[0]}</b></div>${r[1]?'<span class="pill green">Complete</span>':`<a href="${r[2]}" class="muted small" style="color:var(--accent)">Complete →</a>`}</div>`).join('')}
   <div class="divider"></div><div class="between"><div><div class="tiny">Completion</div><div style="font-size:22px;font-weight:750">${overall()}%</div></div><button class="btn lg" ${ready?'':'disabled'} onclick="submitDiagnostic()">Submit for Diagnostic →</button></div>${ready?'':'<div class="muted small" style="margin-top:8px">Complete Profile, Interview and Discovery Summary to submit.</div>'}</div>`,'Review & Submit');
}
async function submitDiagnostic(){ if(_busy)return; _busy=true; try{ await api('POST','/api/portal/submit'); S.submitted=true; render(); window.scrollTo(0,0); }catch(e){ toast(e.message); }finally{_busy=false;} }

/* ---- Phase 6: delivered dashboard, report center, viewer, notifications ---- */
function vDeliveredDashboard(){
  const sec=S.reportData.sections||{}, ds=sec.diagnostic_scores||{}, mx=sec.magic_matrix||{}, ex=sec.executive_summary||{};
  const company=esc((S.profile&&S.profile.company)||'your business');
  const date=esc((S.report.published_at||'').slice(0,10));
  const pos=normPos(mx.quadrant);
  const POSSUB={
    'High Growth Potential':'Strong market opportunity, currently constrained by organisational maturity.',
    'Scale Ready':'Built and positioned to scale; the priority is disciplined acceleration.',
    'Mature — Limited Headroom':'Well-run, with limited upside in the current model; growth requires new vectors.',
    'Reposition Required':'Both market position and organisational maturity need rebuilding before scaling.'};
  const mat=ds.maturity?ds.maturity.total:'—', pot=ds.potential?ds.potential.total:'—';
  const prio=(ex.prescription&&ex.prescription.length)||(sec.key_findings&&sec.key_findings.length)||0;
  const num=(v,suf)=>`<div style="font-size:32px;font-weight:800;color:var(--ink);letter-spacing:-.03em;line-height:1;margin-top:9px">${v}${suf?`<span style="font-size:14px;color:var(--muted);font-weight:400">${suf}</span>`:''}</div>`;
  const jstep=(mark,markStyle,title,titleColor,body,link)=>`<div style="position:relative;display:flex;gap:15px;padding-bottom:20px"><div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:0 0 auto;z-index:1;font-size:13px;font-weight:700;${markStyle}">${mark}</div><div style="padding-top:3px"><div style="font-size:14px;font-weight:600;color:${titleColor}">${title}</div><div class="muted small" style="margin-top:2px;line-height:1.5">${body}</div>${link||''}</div></div>`;
  return shell('dashboard',`
   <div class="eyebrow">${t('db.yourdiag')} · ${date}</div>
   <h1 class="h-title" style="margin-top:8px">${company}</h1>
   <div style="margin-top:26px"><div class="tiny">Current growth position</div><div style="font-size:27px;font-weight:800;color:var(--ink);letter-spacing:-.025em;margin-top:7px">${esc(pos)}</div><div class="muted" style="margin-top:9px;max-width:540px;line-height:1.6">${esc(POSSUB[pos]||'')}</div></div>
   <div style="display:flex;margin-top:30px;flex-wrap:wrap;gap:18px 0">
     <div style="flex:1;min-width:120px"><div class="tiny">Growth maturity</div>${num(mat,' / 100')}</div>
     <div style="flex:1;min-width:120px;border-left:0.5px solid var(--line);padding-left:26px"><div class="tiny">Growth potential</div>${num(pot,' / 100')}</div>
     <div style="flex:1;min-width:120px;border-left:0.5px solid var(--line);padding-left:26px"><div class="tiny">Priorities</div>${num(prio,'')}</div>
   </div>
   <div style="margin-top:32px"><a class="btn lg" href="#/report/${S.report.id}" style="padding:14px 30px">Open your diagnostic report →</a><div class="muted small" style="margin-top:12px">Executive summary · priorities · 12-month direction</div></div>
   <div class="divider" style="margin:36px 0 0"></div>
   <div class="tiny" style="margin:26px 0 18px">Your growth journey</div>
   <div style="position:relative">
     <div style="position:absolute;left:13px;top:16px;bottom:22px;width:1.5px;background:var(--line)"></div>
     ${jstep('✓','background:var(--green-soft);color:var(--green)','Diagnostic complete','var(--ink-soft)','Delivered '+date,'')}
     ${jstep('1','background:var(--accent);color:#fff','Review findings <span class="pill accent" style="margin-left:8px">You\'re here</span>','var(--ink)','Read the full diagnostic and the priorities behind your scores.','')}
     ${jstep('2','background:#fff;border:1.5px solid var(--line);color:var(--ink-soft)','Review session with Scale9X','var(--ink)','Discuss your results and priorities with your Scale9X growth lead.','<a href="#" onclick="toast(\'Your Scale9X growth lead will reach out to schedule your review session.\',\'success\');return false;" class="small" style="color:var(--accent-ink);font-weight:600;display:inline-block;margin-top:6px">Schedule a review session →</a>')}
     ${jstep('3','background:#fff;border:1.5px solid var(--line-soft);color:var(--muted)','Recommended next engagement','var(--ink-soft)','Recommended from your findings and discussed in your review session.','')}
   </div>`,t('nav.dashboard'));
}
function miniMatrix(mx){
  if(!mx||mx.quadrant==null) return `<div class="muted">Matrix pending.</div>`;
  const x=Math.max(0,Math.min(100,mx.potential)), y=Math.max(0,Math.min(100,mx.maturity));
  const active = x>=60 ? (y>=60?'Scale Ready':'High Growth Potential') : (y>=60?'Mature — Limited Headroom':'Reposition Required');
  const QDESC={
    'High Growth Potential':'significant market opportunity, currently constrained by organisational maturity — the highest-upside position. Build the execution capability and the potential converts quickly.',
    'Scale Ready':'strong maturity and strong potential — built and positioned to scale. Press the advantage and expand with discipline.',
    'Mature — Limited Headroom':'well-run, but limited upside in the current model — defend the core and open new growth vectors.',
    'Reposition Required':'both maturity and potential are low today — reposition the model before scaling.'};
  const q=(name,sub,pos)=>{const on=name===active;return `<div style="position:absolute;${pos};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center;padding:10px;${on?'background:var(--grad-soft);':''}">
    <div style="font-size:12.5px;font-weight:800;color:${on?'var(--accent-ink)':'var(--ink-soft)'}">${name}</div>
    <div style="font-size:10px;color:${on?'#2C3E50':'#aab2c2'};font-weight:600;text-transform:uppercase;letter-spacing:.04em">${sub}</div></div>`;};
  return `<div style="display:flex;gap:14px;align-items:stretch">
    <div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.04em;display:flex;align-items:center;justify-content:center">GROWTH MATURITY →</div>
    <div style="flex:1;max-width:440px">
      <div style="position:relative;width:100%;aspect-ratio:1;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:#fff">
        ${q('Mature — Limited Headroom','Solid, less upside','top:0;left:0;width:60%;height:40%;border-right:1.5px dashed #E6DDD0;border-bottom:1.5px dashed #E6DDD0')}
        ${q('Scale Ready','Strong all-round','top:0;left:60%;width:40%;height:40%;border-bottom:1.5px dashed #E6DDD0')}
        ${q('Reposition Required','Reposition first','top:40%;left:0;width:60%;height:60%;border-right:1.5px dashed #E6DDD0')}
        ${q('High Growth Potential','Highest upside','top:40%;left:60%;width:40%;height:60%')}
        <div style="position:absolute;left:${x}%;bottom:${y}%;width:20px;height:20px;border-radius:50%;background:var(--accent);border:3px solid #fff;transform:translate(-50%,50%);box-shadow:0 2px 10px rgba(184,115,51,.55);z-index:3"></div>
      </div>
      <div style="text-align:center;font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.04em;margin-top:8px">GROWTH POTENTIAL →</div>
      <div class="callout" style="margin-top:12px"><div class="ttl">Current growth position</div><p><b>${esc(normPos(mx.quadrant))}</b> — ${QDESC[active]||'plotted on maturity vs. potential to set the strategic priority.'}</p></div>
    </div></div>`;
}
function donut(val){const v=Math.max(0,Math.min(100,Math.round(val||0)));const r=40,c=2*Math.PI*r,off=c*(1-v/100);
  return `<div class="donut"><svg width="96" height="96"><circle cx="48" cy="48" r="${r}" fill="none" stroke="#eef0f4" stroke-width="9"/><circle cx="48" cy="48" r="${r}" fill="none" stroke="#B87333" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/></svg><div class="dv">${val==null?'—':v}</div></div>`;}
function scoreCol(label,total,grade,cats){
  return `<div style="flex:1;min-width:268px">
    <div class="row" style="align-items:center;gap:16px"><div>${donut(total)}</div><div><div class="tiny">${label}</div><div class="scorehead"><span class="big">${total==null?'—':total}<small>/100</small></span></div><span class="pill accent">${esc(grade||'—')}</span></div></div>
    <div class="scorebars" style="margin-top:16px">${(cats||[]).map(x=>{const pct=x.weight?Math.round((x.score/x.weight)*100):0;const cls=pct<50?'weak':pct<75?'mid':'';return `<div class="sb"><div class="sb-name">${esc(x.name)}</div><div class="sb-val">${x.score==null?'—':x.score}/${x.weight}</div><div class="sb-track"><i class="${cls}" style="width:${Math.max(4,pct)}%"></i></div></div>`;}).join('')}</div></div>`;
}
function radarChart(cats){
  cats=(cats||[]).filter(c=>c&&c.weight);
  if(cats.length<3) return '';
  const N=cats.length, cx=140, cy=140, R=100;
  const ang=i=>(-Math.PI/2)+(i*2*Math.PI/N);
  const pt=(i,r)=>[cx+Math.cos(ang(i))*r, cy+Math.sin(ang(i))*r];
  let rings=''; [0.25,0.5,0.75,1].forEach(g=>{ rings+=`<polygon points="${cats.map((c,i)=>pt(i,R*g).map(n=>n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#e7ecf4" stroke-width="1"/>`; });
  let axes='',labels='';
  cats.forEach((c,i)=>{ const [x,y]=pt(i,R); axes+=`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#eef0f4" stroke-width="1"/>`;
    const [lx,ly]=pt(i,R+15); const anchor=Math.abs(lx-cx)<10?'middle':(lx>cx?'start':'end');
    const nm=c.name.length>15?c.name.slice(0,14)+'…':c.name;
    labels+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="8.5" font-weight="600" fill="#697587" text-anchor="${anchor}" dominant-baseline="middle">${esc(nm)}</text>`; });
  const dpts=cats.map((c,i)=>{const p=Math.max(0,Math.min(1,c.score/c.weight));return pt(i,R*p).map(n=>n.toFixed(1)).join(',');}).join(' ');
  const dots=cats.map((c,i)=>{const p=Math.max(0,Math.min(1,c.score/c.weight));const[x,y]=pt(i,R*p);return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#B87333"/>`;}).join('');
  return `<svg class="radar" viewBox="-80 -8 440 296" style="width:330px;max-width:100%;height:auto">${rings}${axes}<polygon points="${dpts}" fill="rgba(184,115,51,.16)" stroke="#B87333" stroke-width="2"/>${dots}${labels}</svg>`;
}
function renderReport(d){
  const s=d.sections||{}, ex=s.executive_summary||{}, ds=s.diagnostic_scores||{}, sw=s.strengths_weaknesses||{}, kf=s.key_findings||[], nar=s.diagnostic_narrative||[], recs=s.strategic_recommendations||[], plan=s.ninety_day_plan||[], road=s.twelve_month_roadmap||[], kpis=s.kpi_framework||[], budget=s.budget_allocation||[];
  const oppV2=s.opportunity_matrix_v2||{}, rev=s.revenue_expansion||{}, bets=s.strategic_bets||{}, fi=s.focus_ignore||{};
  const company=esc((d.report&&d.report.company)||(S.company&&S.company.name)||'');
  const date=esc(((d.report&&d.report.published_at)||'').slice(0,10));
  let _sn=0; const sh=(title)=>`<h2><span class="h2num">${String(++_sn).padStart(2,'0')}</span>${title}</h2>`;
  const scrubLegacy=(x)=>String(x||'').replace(/Magic Matrix/gi,'Growth Position Matrix').replace(/Best Client \(Huge Opportunity\)/gi,'High Growth Potential').replace(/Best Client/gi,'High Growth Potential');
  const KPIWHY={Business:'The headline numbers that prove the business is growing.',Marketing:'Whether demand generation is efficient and attributable.',Sales:'How reliably pipeline converts into revenue.',Customer:'Whether customers stay, expand and refer.',Operations:'Whether delivery keeps pace with growth.',Finance:'Whether growth is profitable and well-funded.'};
  const findings=kf.map((f,i)=>Object.assign({},nar[i]||{},f));
  const oqV2=(cls,label,sub,items)=>`<div class="oppq ${cls}"><div class="oh"><span class="od"></span>${label}</div><div class="small muted" style="margin:-2px 0 7px">${sub}</div>${(items&&items.length)?items.map(o=>`<div class="oi">• ${esc(o.title)}</div>`).join(''):'<div class="oi muted">—</div>'}</div>`;
  const quad=normPos((s.magic_matrix||{}).quadrant);
  const POSSUB={'High Growth Potential':'Strong market opportunity, currently constrained by organisational maturity.','Scale Ready':'Built and positioned to scale; the priority is disciplined acceleration.','Mature — Limited Headroom':'Well-run, with limited upside in the current model; growth requires new vectors.','Reposition Required':'Both market position and organisational maturity need rebuilding before scaling.'};
  const BP=85, bench=(v)=>{v=Math.max(0,Math.min(100,v||0));return `<div style="position:relative;height:7px;background:#EDE7DD;border-radius:999px;margin-top:12px"><div style="position:absolute;left:0;top:0;bottom:0;width:${v}%;background:var(--navy);border-radius:999px"></div><div style="position:absolute;left:${BP}%;top:-3px;bottom:-3px;width:1.5px;background:var(--copper)"></div></div><div style="font-size:11.5px;margin-top:8px;color:var(--muted)">Best practice <span style="color:var(--accent-ink)">${BP}</span> · Gap ${Math.max(0,BP-v)}</div>`;};
  const esNum=(label,val)=>`<div style="flex:1;min-width:150px"><div class="tiny">${label}</div><div style="font-size:30px;font-weight:800;color:var(--ink);letter-spacing:-.03em;margin-top:6px;line-height:1">${val==null?'—':val}<span style="font-size:14px;color:var(--muted);font-weight:400"> / 100</span></div>${bench(val)}</div>`;
  return `<div class="report">
    <div class="rcover">
      <div class="rc-brand"><div class="mark">S9</div><div class="logo" style="color:#fff;font-weight:800;font-size:15px">Scale<span style="color:#C9A77E">9X</span></div></div>
      <div class="rc-kicker">${t('r.kicker')}</div>
      <h1>${company}</h1>
      <div style="font-size:16px;color:rgba(255,255,255,.92);font-weight:600;margin-top:2px">${t('r.growthdiag')}</div>
      <div class="rc-meta">${t('r.delivered')} ${date}<span class="dot">•</span>${t('r.confidential')}</div>
    </div>
    <div class="report-body">

    <div class="execsum">
      <div class="es-eyebrow">Executive summary</div>
      <div class="tiny" style="margin-top:18px">Current growth position</div>
      <div style="font-size:27px;font-weight:800;color:var(--ink);letter-spacing:-.025em;margin-top:6px">${esc(quad)}</div>
      <div class="muted" style="margin-top:9px;max-width:560px;line-height:1.6">${esc(POSSUB[quad]||'')}</div>
      <div style="display:flex;gap:30px;margin-top:24px;flex-wrap:wrap">${esNum('Growth maturity',ds.maturity?ds.maturity.total:null)}${esNum('Growth potential',ds.potential?ds.potential.total:null)}</div>
      <div class="es-divider"></div>
      <div class="tiny">Why we are here</div>
      <p style="margin-top:8px;color:var(--ink-soft);line-height:1.7">${esc(scrubLegacy(ex.diagnosis))}</p>
      <div class="es-divider"></div>
      <div class="tiny">Top three priorities</div>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:13px">${(ex.prescription||[]).slice(0,3).map((p,i)=>`<div style="display:flex;gap:13px"><div style="font-size:15px;font-weight:800;color:var(--accent);flex:0 0 auto;line-height:1.4">${String(i+1).padStart(2,'0')}</div><div style="font-size:14.5px;color:var(--ink);font-weight:600;padding-top:1px">${esc(p)}</div></div>`).join('')||'<div class="muted small">See strategic priorities.</div>'}</div>
      ${ex.opportunity?`<div class="es-outcome"><div class="tiny" style="color:var(--accent-ink)">Expected outcome</div><p style="margin-top:7px;color:var(--ink-soft);line-height:1.65">${esc(scrubLegacy(ex.opportunity))}</p></div>`:''}
    </div>

    ${sh('Current growth position')}<div class="row wrap" style="gap:30px">${scoreCol(t('db.maturity'),ds.maturity?ds.maturity.total:null,ds.maturity&&ds.maturity.label,ds.maturity&&ds.maturity.categories)}${scoreCol(t('db.potential'),ds.potential?ds.potential.total:null,ds.potential&&ds.potential.label,ds.potential&&ds.potential.categories)}</div>
    <div class="radarwrap">
      <div style="text-align:center"><div class="tiny" style="margin-bottom:2px">${t('db.maturity')} · category profile</div>${radarChart(ds.maturity&&ds.maturity.categories)}</div>
      <div style="text-align:center"><div class="tiny" style="margin-bottom:2px">${t('db.potential')} · category profile</div>${radarChart(ds.potential&&ds.potential.categories)}</div>
    </div>
    <div style="margin-top:8px">${miniMatrix(s.magic_matrix||{})}</div>
    <div class="row wrap" style="margin-top:18px"><div style="flex:1;min-width:240px"><div class="tiny" style="color:var(--green)">${t('r.strengths')}</div><div style="margin-top:8px">${(sw.strengths||[]).map(c=>`<span class="pill green" style="margin:0 6px 6px 0">${esc(c.name)} · ${c.score}/${c.weight}</span>`).join('')||'<span class="muted small">—</span>'}</div></div><div style="flex:1;min-width:240px"><div class="tiny" style="color:var(--red)">${t('r.weaknesses')}</div><div style="margin-top:8px">${(sw.weaknesses||[]).map(c=>`<span class="pill red" style="margin:0 6px 6px 0">${esc(c.name)} · ${c.score}/${c.weight}</span>`).join('')||'<span class="muted small">—</span>'}</div></div></div>

    ${sh('Root cause analysis')}<div class="findings">${findings.map((f,i)=>`<div class="finding"><div class="f-head"><div class="f-title"><span class="f-no">${i+1}</span><span class="f-area">${esc(f.area||'Finding '+(i+1))}</span></div><span class="sev ${f.severity||'medium'}">${t('f.priority')}: ${t('sev.'+(f.severity||'medium'))}</span></div><div class="f-body">
      <div class="frow"><div class="fk"><span class="fdot"></span>${t('f.observation')}</div><div class="fv">${esc(f.observation||'')}</div></div>
      ${f.root_cause?`<div class="frow"><div class="fk"><span class="fdot"></span>${t('f.rootcause')}</div><div class="fv">${esc(f.root_cause)}</div></div>`:''}
      <div class="frow impact"><div class="fk"><span class="fdot"></span>${t('f.impact')}</div><div class="fv">${esc(f.business_impact||'')}</div></div>
      ${f.action?`<div class="frow action"><div class="fk"><span class="fdot"></span>${t('f.action')}</div><div class="fv">${esc(f.action)}</div></div>`:''}
    </div></div>`).join('')||'<div class="muted small">No findings recorded.</div>'}</div>

    ${sh('Strategic priorities')}<div class="reclist">${recs.map((r,i)=>{const m=String(r).split(/ — (.+)/s);const area=m.length>1?m[0]:(t('r.rec')+' '+(i+1));const txt=m.length>1?m[1]:String(r);const sev=(findings[i]&&findings[i].severity)||'medium';return `<div class="initiative"><span class="inum">${i+1}</span><div class="ibody"><div class="ihead"><span class="iarea">${esc(area)}</span><span class="prio ${sev}">${t('f.priority')}: ${t('sev.'+sev)}</span></div><div class="itext">${esc(txt)}</div></div></div>`;}).join('')||'<div class="muted small">—</div>'}</div>

    ${sh('Growth opportunities')}<div class="muted small" style="margin:8px 0 8px">${t('r.revexpsub')}${rev.industry?` · <b style="color:var(--accent-ink)">${esc(rev.industry)}</b>`:''}</div>${(rev.items||[]).map(r=>`<div class="revrow"><div class="rvmeta"><div class="rvn">${esc(r.name)}</div><div class="rvw">${esc(r.why)}</div></div><div class="rvtags"><span class="tag ${String(r.difficulty||'').toLowerCase()}"><span class="tl">${t('r.difficulty')}</span>${esc(r.difficulty)}</span><span class="tag impact"><span class="tl">${t('r.impact2')}</span>${esc(r.impact)}</span><span class="tag time"><span class="tl">${t('r.timeline')}</span>${esc(r.timeline)}</span></div></div>`).join('')}
    ${(bets.items&&bets.items.length)?`<div class="tiny" style="margin:18px 0 8px">${t('r.bets')}</div><div class="bets">${bets.items.map(b=>`<div class="bet"><div><div class="bn">${esc(b.name)}</div><div class="bw">${esc(b.why)}</div></div></div>`).join('')}</div>`:''}
    <div class="fi">${(fi.focus&&fi.focus.length)?`<div class="fi-col focus"><div class="fih">${t('r.focus')}</div>${fi.focus.map(f=>`<div class="fi-item"><span class="fic">→</span><div><div class="fii">${esc(f.item)}</div>${f.why?`<div class="fiw">${esc(f.why)}</div>`:''}</div></div>`).join('')}</div>`:''}${(fi.ignore&&fi.ignore.length)?`<div class="fi-col ignore"><div class="fih">${t('r.ignore')}</div>${fi.ignore.map(x=>`<div class="fi-item"><span class="fic">—</span><div class="fii">${esc(x)}</div></div>`).join('')}</div>`:''}</div>

    ${sh('The next 12 months')}<div class="tiny" style="margin-bottom:8px">${t('r.plan')}</div><div class="planblocks">${plan.map(p=>`<div class="planblock"><div class="pw">${esc(p.weeks)}</div><ul>${(p.items||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>
    <div class="tiny" style="margin:20px 0 8px">${t('r.roadmap')}</div><div class="timeline">${road.map(q=>`<div class="tl"><div class="tq"><div class="qbadge">${esc(q.quarter)}</div></div><div class="tc"><b>${esc(q.objective)}</b><div class="ti2">${(q.initiatives||[]).map(esc).join(' · ')}</div></div></div>`).join('')}</div>
    <div class="tiny" style="margin:20px 0 8px">${t('r.kpi')}</div><div class="kpigrid">${kpis.map(k=>`<div class="kpiq2"><div class="kh"><span class="kn">${esc(k.layer)}</span></div><div class="kw">${esc(KPIWHY[k.layer]||'Key metrics to track for this layer.')}</div><div class="km"><span class="kdir">↗</span> ${(k.items||[]).map(esc).join(' · ')}</div></div>`).join('')}</div>
    <div style="margin-top:20px"><div class="tiny" style="margin-bottom:8px">${t('r.budget')}</div><div class="budgetbar">${budget.map(x=>`<div class="bb"><div class="bn">${esc(x.area)}</div><b>${x.pct}%</b><div class="bt"><i style="width:${x.pct}%"></i></div></div>`).join('')}</div></div>

    ${sh('Appendix — methodology & evidence')}${s.business_reality?`<div class="callout"><div class="ttl">${t('r.reality')}</div><p>${esc(scrubLegacy(s.business_reality))}</p></div>`:''}
    <p class="muted small" style="line-height:1.7;margin-top:12px">This diagnostic scores Growth Maturity (how built-out the business is today) and Growth Potential (the upside available) across weighted categories, drawn from a structured discovery interview and supporting evidence, and validated by a Scale9X analyst. The Growth Position Matrix plots maturity against potential to set the strategic priority. No figures are generated without analyst review.</p>

    <div class="divider"></div><div class="between"><div class="brand" style="padding:0"><div class="mark" style="width:26px;height:26px;font-size:11px">S9</div><div class="logo" style="font-size:14px">Scale<span class="t">9X</span> <span class="muted" style="font-weight:600">Growth Leadership</span></div></div><div class="muted small">${t('r.confidential')}</div></div>
    </div></div>`;
}
function printReport(id){
  const d=S.reportSections[id]; if(!d){ window.print(); return; }
  const company=(d.report&&d.report.company)||(S.company&&S.company.name)||'Client';
  const lang=(localStorage.getItem('1xl_lang')||'en');
  const O=location.origin;
  const body=renderReport(d);
  const w=window.open('','_blank');
  if(!w){ try{toast('Please allow pop-ups so the report can open for download.');}catch(e){} return; }
  w.document.open();
  w.document.write('<!doctype html><html lang="'+lang+'"><head><meta charset="utf-8">'
    +'<title>Scale9X — '+esc(company)+' Growth Diagnostic Report</title>'
    +'<meta name="viewport" content="width=device-width, initial-scale=1">'
    +'<link rel="preconnect" href="https://fonts.googleapis.com">'
    +'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    +'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">'
    +'<link rel="stylesheet" href="'+O+'/client/styles.css">'
    +'<link rel="stylesheet" href="'+O+'/client/print.css">'
    +'<scr'+'ipt>window.PagedConfig={auto:true,after:function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},400);}};</scr'+'ipt>'
    +'<scr'+'ipt src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></scr'+'ipt>'
    +'</head><body class="pagedreport">'+body+'</body></html>');
  w.document.close();
}
function vReport(id){ const d=S.reportSections[id]; if(!d) return shell('reports',`<p class="muted">This report isn't available. <a href="#/reports" style="color:var(--accent)">Back to Report Center</a></p>`,'Report');
  // Name the page so the browser's "Save as PDF" filename = client + report type.
  const company=(d.report&&d.report.company)||(S.company&&S.company.name)||'Client';
  document.title='Scale9X — '+company+' Growth Diagnostic Report';
  return shell('reports',`<div class="noprint between" style="margin-bottom:12px"><a href="#/reports" class="muted small" style="color:var(--accent)">← ${t('r.reportcenter')}</a><button class="btn ghost" onclick="printReport('${id}')">⤓ ${t('r.download')}</button></div>${renderReport(d)}`,t('nav.reports')); }
function vReports(){ const rs=S.reports||[];
  return shell('reports',`<div class="eyebrow">${t('r.reportcenter')}</div><h1 class="h-title">${t('r.yourreports')}</h1><p class="muted">${t('r.reportsub')}</p>
   <div class="card pad" style="margin-top:14px">${rs.length?rs.map(r=>`<div class="checkrow"><div><b>${t('r.growthdiag')}</b> <span class="pill">v${r.version}</span><div class="muted small">${t('r.delivered')} ${esc((r.published_at||'').slice(0,10))}</div></div><a class="btn" href="#/report/${r.id}">${t('r.open')} →</a></div>`).join(''):'<div class="muted">No reports yet. Your report will appear here once your diagnostic is delivered.</div>'}</div>`,t('r.reportcenter')); }
function vNotifications(){ const ns=S.notifs||[];
  return shell('notifications',`<div class="between"><div><div class="eyebrow">Notifications</div><h1 class="h-title">Updates</h1></div>${S.unread?`<button class="btn ghost" onclick="markRead()">Mark all read</button>`:''}</div>
   <div class="card pad" style="margin-top:14px">${ns.length?ns.map(n=>`<div class="notif ${n.read?'read':''}"><div class="dot"></div><div style="flex:1"><div>${esc(n.message||n.status||'Update')}</div><div class="muted small">${esc((n.at||'').replace('T',' ').slice(0,16))}</div></div></div>`).join(''):'<div class="muted">No notifications yet.</div>'}</div>`,'Notifications'); }
async function markRead(){ await api('POST','/api/portal/notifications/read'); S.notifs=(S.notifs||[]).map(n=>Object.assign({},n,{read:true})); S.unread=0; render(); }

/* router */
function render(){
  let h=location.hash||'';
  if(h==='#/logout'){logout();return;}
  if(!TOK()){ $('app').innerHTML = h.includes('signup')?vLogin(true):vLogin(false); return; }
  if(!S.loaded){ $('app').innerHTML='<div style="display:grid;place-items:center;height:100vh;gap:14px"><div class="s9load"></div><div class="muted small">Loading…</div></div>'; loadState().then(render).catch(()=>{$('app').innerHTML=vLogin(false);}); return; }
  let out,m;
  document.title='Scale9X — Growth Leadership'; // default; vReport overrides with the client + report name
  if((m=h.match(/^#\/report\/(.+)$/)))out=vReport(m[1]);
  else if(h.includes('reports'))out=vReports();
  else if(h.includes('notifications'))out=vNotifications();
  else if(h.includes('profile'))out=vProfile();else if(h.includes('interview'))out=vInterview();else if(h.includes('team'))out=vTeam();
  else if(h.includes('smart'))out=vSmart();else if(h.includes('documents'))out=vDocuments();else if(h.includes('review'))out=vReview();else out=vDashboard();
  $('app').innerHTML=out;
}
window.addEventListener('hashchange',render);
window.addEventListener('DOMContentLoaded',()=>{ if(!location.hash) location.hash=TOK()?'#/dashboard':'#/login'; render(); });
