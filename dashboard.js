// V13 Dashboard Follow Up & navigasi halaman
(function(){
  const viewMeta={
    dashboard:['Dashboard Follow Up','Pantau performa follow up service kendaraan Anda'],
    map:['Peta Kendaraan','Lihat lokasi kendaraan dan filter customer di peta'],
    followup:['Follow Up Customer','Kelola status, reason, dan WhatsApp customer'],
    data:['Data & Upload','Upload, proses, perbaiki, dan download data kendaraan'],
    settings:['Pengaturan','Kelola template WhatsApp dan pengaturan aplikasi']
  };
  const statusMeta=[
    ['TERKIRIM','Sudah Terkirim','#2fb25b','Pesan WhatsApp berhasil dikirim'],
    ['BELUM_DIBACA','Belum Dibaca','#ffb000','Pesan terkirim namun belum dibaca'],
    ['DIBACA','Sudah Dibaca','#8bcf59','Pesan sudah dibaca customer'],
    ['DIBALAS','Sudah Dibalas','#15954a','Customer sudah membalas pesan'],
    ['NOMOR_TIDAK_AKTIF','Nomor Tidak Aktif','#ef2929','Nomor WhatsApp tidak aktif'],
    ['TIDAK_ADA_WHATSAPP','Tidak Ada WhatsApp','#ed4b62','Customer tidak memiliki WhatsApp'],
    ['BOOKING','Booking','#9138d1','Customer sudah booking service'],
    ['FOLLOW_UP_ULANG','Follow Up Ulang','#078a86','Perlu dilakukan follow up ulang'],
    ['TIDAK_TERHUBUNG','Tidak Terhubung','#64748b','Customer belum dapat dihubungi'],
    ['SELESAI','Selesai','#2563eb','Proses follow up sudah selesai']
  ];
  const percent=(n,total)=>total?Math.round(n/total*1000)/10:0;
  const formatPercent=n=>`${Number(n||0).toLocaleString('id-ID',{maximumFractionDigits:1})}%`;
  const asDate=v=>{if(!v)return null;const d=new Date(String(v).length===10?`${v}T00:00:00`:v);return isNaN(d)?null:d;};
  const setOptions=(select,items,label,current)=>{if(!select)return;select.innerHTML=`<option value="">${label}</option>`+items.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');select.value=items.includes(current)?current:'';};

  function switchView(view){
    if(!viewMeta[view])view='dashboard';
    document.body.className=document.body.className.replace(/\bview-\S+/g,'').trim()+` view-${view}`;
    document.querySelectorAll('.main-menu-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    $('pageTitle').textContent=viewMeta[view][0];$('pageSubtitle').textContent=viewMeta[view][1];
    document.body.classList.remove('nav-mobile-open');
    localStorage.setItem('vehicleMapActiveViewV13',view);
    if(view==='dashboard')renderDashboard();
    if(view==='map')setTimeout(()=>{refreshMapSize();applyFilter();},80);
    if(view==='followup')applyFilter();
  }

  function dashboardVehicles(){
    enrichRegions();
    const adv=$('dashboardAdvisor')?.value||'',reg=$('dashboardRegency')?.value||'',dist=$('dashboardDistrict')?.value||'',days=$('dashboardPeriod')?.value||'all';
    const cutoff=days==='all'?null:new Date(Date.now()-Number(days)*86400000);
    return vehicles.filter(v=>{
      if(adv&&advisorKey(v.SERVICE_ADVISOR)!==advisorKey(adv))return false;
      if(reg&&v._regency!==reg)return false;
      if(dist&&v._district!==dist)return false;
      if(cutoff){const f=followUps[followUpKey(v)],d=asDate(f?.updatedAt||f?.date);if(!d||d<cutoff)return false;}
      return true;
    });
  }

  function refreshDashboardFilters(){
    const advSel=$('dashboardAdvisor'),regSel=$('dashboardRegency'),distSel=$('dashboardDistrict');
    if(!advSel||!regSel||!distSel)return;
    const oldAdv=advSel.value,oldReg=regSel.value,oldDist=distSel.value;
    const byKey=new Map();vehicles.forEach(v=>{const n=advisorName(v.SERVICE_ADVISOR);if(n&&!byKey.has(advisorKey(n)))byKey.set(advisorKey(n),n);});
    const advisors=[...byKey.values()].sort((a,b)=>a.localeCompare(b,'id'));
    const regencies=[...new Set(vehicles.map(v=>inferRegion(v).regency).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id'));
    setOptions(advSel,advisors,'Semua Service Advisor',advisors.find(n=>advisorKey(n)===advisorKey(oldAdv))||'');
    setOptions(regSel,regencies,'Semua Kabupaten/Kota',oldReg);
    const districts=[...new Set(vehicles.filter(v=>!regSel.value||inferRegion(v).regency===regSel.value).map(v=>inferRegion(v).district).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id'));
    setOptions(distSel,districts,'Semua Kecamatan',oldDist);
  }

  function renderStatusChart(rows,total){
    const max=Math.max(1,...rows.map(x=>x.count));
    $('statusBarChart').innerHTML=rows.map(x=>`<div class="status-column"><b>${x.count}</b><i style="--height:${Math.max(2,x.count/max*135)}px;--bar:${x.color}"></i><span>${esc(x.short)}</span></div>`).join('');
    $('statusSummaryRows').innerHTML=rows.map(x=>`<tr><td><span class="status-cell" style="--dot:${x.color}"><i></i>${esc(x.label)}</span></td><td><b>${x.count}</b></td><td>${formatPercent(percent(x.count,total))}</td><td>${esc(x.description)}</td></tr>`).join('')+`<tr><td><b>Belum Follow Up</b></td><td><b>${rows.pending}</b></td><td>${formatPercent(percent(rows.pending,total))}</td><td>Customer belum ditindaklanjuti</td></tr>`;
  }

  function renderAdvisorChart(rows){
    const groups=new Map();rows.forEach(v=>{const name=advisorName(v.SERVICE_ADVISOR)||'Tanpa SA',key=advisorKey(name)||'TANPA SA';if(!groups.has(key))groups.set(key,{name,total:0,done:0});const g=groups.get(key);g.total++;if(currentFollowUpStatus(v)!=='BELUM')g.done++;});
    const list=[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'id'));
    $('advisorBarChart').innerHTML=list.length?list.map(g=>{const p=percent(g.done,g.total);return `<div class="advisor-row"><span title="${esc(g.name)}">${esc(g.name)}</span><div class="advisor-track"><div class="advisor-fill" style="--width:${p}%"></div></div><b>${formatPercent(p)}</b></div>`;}).join(''):'<div class="empty-chart">Belum ada data Service Advisor.</div>';
  }

  function renderTrend(rows){
    const activity=new Map();rows.forEach(v=>{const f=followUps[followUpKey(v)];(f?.history||[]).forEach(h=>{const d=String(h.date||h.savedAt||'').slice(0,10);if(d)activity.set(d,(activity.get(d)||0)+1);});if(f?.date&&!f?.history?.length){const d=String(f.date).slice(0,10);activity.set(d,(activity.get(d)||0)+1);}});
    const labels=[...activity.keys()].sort().slice(-14);if(!labels.length){$('trendChart').innerHTML='<div class="empty-chart">Grafik akan muncul setelah status follow up mulai disimpan.</div>';return;}
    const values=labels.map(d=>activity.get(d)||0);let cumulative=0;const totals=values.map(v=>cumulative+=v),max=Math.max(1,...totals),w=900,h=220,pad=28;
    const pts=(arr)=>arr.map((v,i)=>`${pad+(labels.length===1?0:i*(w-pad*2)/(labels.length-1))},${h-pad-v/max*(h-pad*2)}`).join(' ');
    const labelSvg=labels.map((d,i)=>{const x=pad+(labels.length===1?0:i*(w-pad*2)/(labels.length-1));return `<text class="trend-label" x="${x}" y="215" text-anchor="middle">${new Date(d+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short'})}</text>`;}).join('');
    $('trendChart').innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line class="trend-axis" x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}"/><polyline class="trend-line" points="${pts(totals)}"/><polyline class="trend-activity" points="${pts(values)}"/>${totals.map((v,i)=>{const x=pad+(labels.length===1?0:i*(w-pad*2)/(labels.length-1)),y=h-pad-v/max*(h-pad*2);return `<circle class="trend-point" cx="${x}" cy="${y}" r="3"/>`;}).join('')}${labelSvg}</svg>`;
  }

  function renderDashboard(){
    if(!$('dashboardView'))return;
    refreshDashboardFilters();
    const rows=dashboardVehicles(),total=rows.length,followed=rows.filter(v=>currentFollowUpStatus(v)!=='BELUM').length,pending=total-followed,p=percent(followed,total);
    $('dashTotal').textContent=total;$('dashFollowed').textContent=followed;$('dashPending').textContent=pending;$('dashAchievement').textContent=formatPercent(p);$('dashFollowedHint').textContent=`${formatPercent(p)} dari total customer`;$('dashPendingHint').textContent=`${formatPercent(percent(pending,total))} dari total customer`;
    $('achievementRing').style.setProperty('--p',p);$('achievementRing').querySelector('b').textContent=formatPercent(p);$('followUpDonut').style.setProperty('--p',p);$('donutPercent').textContent=formatPercent(p);
    $('donutLegend').innerHTML=`<div class="legend-line"><i style="background:#2db45d"></i><span>Sudah Follow Up <b>${followed} (${formatPercent(p)})</b></span></div><div class="legend-line"><i style="background:#ff8218"></i><span>Belum Follow Up <b>${pending} (${formatPercent(percent(pending,total))})</b></span></div>`;
    const statusRows=statusMeta.map(([key,label,color,description])=>({key,label,color,description,count:rows.filter(v=>currentFollowUpStatus(v)===key).length,short:label.replace('Sudah ','').replace('Tidak Ada ','Tanpa ')}));statusRows.pending=pending;renderStatusChart(statusRows,total);renderAdvisorChart(rows);renderTrend(rows);
    $('dashboardUpdated').textContent=`Data diperbarui terakhir: ${new Date().toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}`;
  }
  window.renderDashboard=renderDashboard;

  document.querySelectorAll('.main-menu-item').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  $('applyDashboardFilter').onclick=renderDashboard;$('dashboardRegency').onchange=()=>{refreshDashboardFilters();renderDashboard();};$('dashboardAdvisor').onchange=renderDashboard;$('dashboardDistrict').onchange=renderDashboard;$('dashboardPeriod').onchange=renderDashboard;
  $('toggleLeftSidebar').onclick=()=>{if(matchMedia('(max-width:780px)').matches)document.body.classList.toggle('nav-mobile-open');};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.body.classList.remove('nav-mobile-open');});
  const saved=localStorage.getItem('vehicleMapActiveViewV13')||'dashboard';switchView(saved);
})();
