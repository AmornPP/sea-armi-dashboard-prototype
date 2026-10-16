/* Local, read-only explorer. Counts remain at their original fact grain. */
const $=id=>document.getElementById(id), fmt=n=>Number(n).toLocaleString('en-US');
const state={country:'Thailand',sample:'',risk:'',search:'',taxons:[],siteFilter:'',site:'',radius:20,page:0};
let D,map,siteLayer,facilityLayer,radiusLayer,activeTaxa=[],activeHits=[],facilityMarkers=new Map();
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const group=(rows,key)=>d3.group(rows,r=>r[key]);
function options(id,items,first){$(id).replaceChildren();if(first!==null)$(id).add(new Option(first,''));items.forEach(([v,label])=>$(id).add(new Option(label,v)));}
function pickedSamples(){return D.samples.filter(s=>(!state.country||s.country===state.country)&&(!state.sample||s.sample_key===state.sample)&&(!state.siteFilter||D.sampleSites.some(e=>e.site_key===state.siteFilter&&e.sample_key===s.sample_key)));}
function syncSamples(){options('sample',D.samples.filter(s=>!state.country||s.country===state.country).map(s=>[s.sample_key,s.sample_id]),'ทุกตัวอย่าง');if(![...$('sample').options].some(o=>o.value===state.sample))state.sample='';$('sample').value=state.sample;}
function bar(id,entries,color){const root=d3.select('#'+id);root.selectAll('*').remove();if(!entries.length){root.append('p').attr('class','empty').text('ไม่มีข้อมูลที่ตรงตัวกรอง');return;}const rows=entries.slice(0,6), svg=root.append('svg').attr('viewBox','0 0 350 200');const x=d3.scaleLinear().domain([0,d3.max(rows,d=>d[1])||1]).range([0,150]);rows.forEach(([name,n],i)=>{svg.append('text').attr('x',0).attr('y',23+i*30).text(name.length>21?name.slice(0,19)+'…':name).append('title').text(name);svg.append('rect').attr('x',160).attr('y',9+i*30).attr('width',x(n)).attr('height',20).attr('rx',2).attr('fill',color);svg.append('text').attr('x',165+x(n)).attr('y',24+i*30).text(fmt(n));});}
function evidenceFor(hits){const ids=new Set(hits.flatMap(h=>(D.edgesByHit.get(h.source_row)||[]).map(e=>e.amr_source_row)));return D.amr.filter(a=>ids.has(a.source_row));}
function render(){
 const samples=pickedSamples(), keys=new Set(samples.map(s=>s.sample_key)), indexes=samples.map(s=>String(D.sampleIndex.get(s.sample_key)));
 activeTaxa=D.taxa.filter(t=>(!state.risk||t.risk===state.risk)&&(!state.search||t.taxon.toLowerCase().includes(state.search.toLowerCase()))).map(t=>{const cells=indexes.map(i=>t.samples[i]).filter(Boolean);return {...t,n:cells.reduce((a,c)=>a+c[0],0),sampleCount:cells.length,min:Math.min(...cells.map(c=>c[1])),max:Math.max(...cells.map(c=>c[2]))};}).filter(t=>t.n);
 activeTaxa.sort((a,b)=>(!!b.risk-!!a.risk)||a.taxon.localeCompare(b.taxon));
 state.taxons=state.taxons.filter(id=>D.taxa.some(t=>t.taxon_key===id&&(!state.risk||t.risk===state.risk)&&indexes.some(i=>t.samples[i])));
 const chosen=D.taxa.filter(t=>state.taxons.includes(t.taxon_key));
 $('selections').innerHTML=chosen.length?chosen.map(t=>`<button data-remove="${t.taxon_key}">${escape(t.taxon)} <small>${escape(t.rank_code)}</small> ×</button>`).join(''):'ยังไม่ได้เลือกเชื้อเฉพาะ — ติ๊กหลายรายการเพื่อเปรียบเทียบ';
 $('selections').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>toggleTaxon(b.dataset.remove));
 $('siteScope').textContent=state.siteFilter?'กรองข้อมูลจากจุด '+D.siteLabel.get(state.siteFilter)+' · '+samples.length+' ตัวอย่าง':'ข้อมูลทุกจุดตามประเทศ / ตัวอย่างที่เลือก';
 $('clearSite').disabled=!state.siteFilter;
 const allowed=new Set((chosen.length?chosen:activeTaxa).map(t=>t.taxon_key));
 const hitIds=new Set(D.taxonHit.filter(e=>allowed.has(e.taxon_key)&&keys.has(e.sample_key)).map(e=>e.hit_source_row));
 // With no taxon/WHO/name restriction, keep ALL sample hits, including unmatched species.
 activeHits=D.hits.filter(h=>keys.has(D.sampleIdToKey.get(h.sample_id))&&((!state.taxons.length&&!state.risk&&!state.search)||hitIds.has(h.source_row)));
 const evidence=evidenceFor(activeHits), cards=[[samples.length,'ตัวอย่างในตัวกรอง'],[activeTaxa.length,'Taxa / rank combinations'],[activeHits.length,'Alignment hits'],[evidence.length,'หลักฐานอ้างอิงไม่ซ้ำ']];
 $('metrics').innerHTML=cards.map(([n,label])=>`<div class="metric"><strong>${fmt(n)}</strong><span>${label}</span></div>`).join('');
 const pages=Math.max(1,Math.ceil(activeTaxa.length/25));state.page=Math.min(state.page,pages-1);$('page').textContent=`หน้า ${state.page+1} / ${pages}`;$('prev').disabled=!state.page;$('next').disabled=state.page>=pages-1;$('taxonCount').textContent=fmt(activeTaxa.length)+' รายการ';
 $('taxa').innerHTML=activeTaxa.slice(state.page*25,state.page*25+25).map(t=>`<tr class="${state.taxons.includes(t.taxon_key)?'selected':''}"><td><input type="checkbox" aria-label="เลือก ${escape(t.taxon)}" data-taxon="${t.taxon_key}" ${state.taxons.includes(t.taxon_key)?'checked':''}> <button class="taxon-button" data-taxon="${t.taxon_key}">${escape(t.taxon)}</button><small>${escape(t.rank_code)} · taxid ${escape(t.ncbi_taxid)}</small></td><td>${escape(t.risk||'ไม่พบ exact WHO match')}</td><td>${t.sampleCount}</td><td>${fmt(t.n)}</td><td>${fmt(t.min)}–${fmt(t.max)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">ไม่พบเชื้อที่ตรงตัวกรอง</td></tr>';
 $('taxa').querySelectorAll('[data-taxon]').forEach(b=>b.onclick=()=>toggleTaxon(b.dataset.taxon));
 const risks=d3.rollups((chosen.length?chosen:activeTaxa).filter(t=>t.risk),v=>new Set(v.map(t=>t.taxon)).size,t=>t.risk).sort((a,b)=>b[1]-a[1]);bar('riskChart',risks,'#aa3044');bar('drugChart',d3.rollups(evidence,v=>v.length,a=>a.drug).sort((a,b)=>b[1]-a[1]),'#218f8c');
 $('detailTitle').textContent=chosen.length?'เปรียบเทียบ '+chosen.length+' Taxa · Alignment และหลักฐาน':'Alignment และหลักฐาน FungAMR';
 $('detailSummary').textContent=`${activeHits.length} hits · ${evidence.length} หลักฐานอ้างอิงไม่ซ้ำ · คลิกจำนวนหลักฐานเพื่อดู drug, MIC, score และ host ของแต่ละ hit`;
 $('hits').innerHTML=activeHits.map(h=>`<tr><td>${escape(h.sample_id)}<small>${escape(h.species)}</small></td><td>${escape(h.accession)}<small>${escape(h.gene)}</small></td><td>${escape(h.pident)}%<small>${escape(h.evalue)}</small></td><td>${escape(h.protein)}</td><td><button data-hit="${h.source_row}">${(D.edgesByHit.get(h.source_row)||[]).length} หลักฐาน</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">ไม่มี alignment ที่จับคู่ได้ในตัวอย่างและเชื้อที่เลือก</td></tr>';
 $('hits').querySelectorAll('[data-hit]').forEach(b=>b.onclick=()=>showEvidence(b.dataset.hit));$('evidence').replaceChildren();renderMap();
}
function showEvidence(id){const h=D.hits.find(h=>h.source_row===id), rows=evidenceFor([h]);$('evidence').innerHTML=`<h3>ข้อมูลอ้างอิงสำหรับ ${escape(h.sample_id)} / ${escape(h.accession)}</h3><p class="hint">จับคู่ accession เท่านั้น ไม่ยืนยันว่าตัวอย่างมี mutation หรือ phenotype ตามรายการนี้</p>`+(rows.length?`<table><thead><tr><th>Species / Gene</th><th>Drug / Usage</th><th>Mutation</th><th>MIC (ต้นฉบับ)</th><th>Score</th><th>Host / Origin</th><th>อ้างอิง</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${escape(a.species)}<small>${escape(a.gene_or_protein_name)}</small></td><td>${escape(a.drug)}<small>${escape(a.drug_usage)}</small></td><td>${escape(a.mutation)}</td><td>${escape(a.mic||'ไม่ระบุ')}</td><td>${escape(a.confidence_score)}</td><td>${escape(a.host)}<small>${escape(a.strain_origin_if_available)}</small></td><td>${escape(a.first_author_name)} ${escape(a.year)}<small>${pmidLink(a.pubmedid)}</small></td></tr>`).join('')}</tbody></table>`:'<p class="empty">ไม่พบ accession นี้ใน FungAMR reference accession</p>');}
function availableSites(){const keys=new Set(D.samples.filter(s=>(!state.country||s.country===state.country)&&(!state.sample||s.sample_key===state.sample)).map(s=>s.sample_key));return D.sites.filter(s=>D.sampleSites.some(e=>e.site_key===s.site_key&&keys.has(e.sample_key)));}
function focusSite(key){state.site=key;renderMap();const s=D.sites.find(s=>s.site_key===key);if(s)map.fitBounds(L.latLng(s.latitude,s.longitude).toBounds(state.radius*2400),{maxZoom:13,padding:[15,15]});}
function renderMap(){
 const sites=availableSites();if(!sites.some(s=>s.site_key===state.site))state.site=sites[0]?.site_key||'';
 options('site',sites.map(s=>[s.site_key,D.siteLabel.get(s.site_key)]),sites.length?null:'ไม่มีพิกัดในตัวกรองนี้');$('site').value=state.site;
 siteLayer.clearLayers();facilityLayer.clearLayers();radiusLayer.clearLayers();facilityMarkers.clear();
 sites.forEach(s=>L.circleMarker([s.latitude,s.longitude],{radius:s.site_key===state.site?10:7,color:'#fff',weight:2,fillColor:'#ba253e',fillOpacity:1}).bindTooltip(escape(D.siteLabel.get(s.site_key))).on('click',()=>selectSite(s.site_key)).addTo(siteLayer));
 const site=sites.find(s=>s.site_key===state.site);$('radiusText').textContent=state.radius+' กม.';
 if(!site){$('mapMessage').textContent='ตัวอย่างที่เลือกไม่มีพิกัด จึงไม่แสดงจุดหรือคำนวณสถานพยาบาลใกล้เคียง';$('nearbyTitle').textContent='ไม่มีจุดสำหรับคำนวณระยะ';$('nearby').replaceChildren();return;}
 L.circle([site.latitude,site.longitude],{radius:state.radius*1000,color:'#b82a43',weight:2,fillOpacity:.08}).addTo(radiusLayer);
 const near=(D.distanceBySite.get(site.site_key)||[]).filter(d=>+d.distance_km<=state.radius).sort((a,b)=>+a.distance_km-+b.distance_km);
 near.forEach(d=>{const f=D.facilityById.get(d.facility_id);const marker=L.circleMarker([f.latitude,f.longitude],{radius:4,color:'#116965',weight:1,fillColor:'#39aaa0',fillOpacity:.8}).bindPopup(`<b>${escape(f.facility_name)}</b><br>${(+d.distance_km).toFixed(2)} กม. จากจุดเก็บตัวอย่าง<br>ประเภท MOPH: ${escape(f.facility_type_code)}`).addTo(facilityLayer);facilityMarkers.set(f.facility_id,marker);});siteLayer.bringToFront();
 $('mapMessage').textContent=`${sites.length} จุดในตัวกรอง · กำลังดู ${D.siteLabel.get(site.site_key)} · ลากแผนที่หรือใช้ + / − เพื่อซูม`;
 $('nearbyTitle').textContent=`${near.length} สถานพยาบาลในระยะ ${state.radius} กม.`;
 $('nearby').innerHTML=near.slice(0,100).map(d=>`<button data-facility="${d.facility_id}"><span>${escape(D.facilityById.get(d.facility_id).facility_name)}</span><strong>${(+d.distance_km).toFixed(1)} กม.</strong></button>`).join('')||'<p class="empty">ไม่มีสถานพยาบาลในรัศมีนี้ ลองเพิ่มระยะทาง</p>';
 if(near.length>100)$('nearby').insertAdjacentHTML('beforeend','<p class="hint">ลิสต์แสดง 100 แห่งแรก แผนที่แสดงครบตามรัศมี</p>');
 $('nearby').querySelectorAll('[data-facility]').forEach(b=>b.onclick=()=>{const marker=facilityMarkers.get(b.dataset.facility);map.setView(marker.getLatLng(),13);marker.openPopup();});
}

function toggleTaxon(id){state.taxons=state.taxons.includes(id)?state.taxons.filter(k=>k!==id):[...state.taxons,id];render();}
function selectSite(key){
 if(!D.sites.some(s=>s.site_key===key))return;
 state.site=key;state.siteFilter=key;state.sample='';state.page=0;
 syncSamples();render();focusSite(key);
}
function pmidLink(value){const id=String(value||'').trim();return /^\d+$/.test(id)?`<a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank" rel="noopener noreferrer">PMID ${id} ↗</a>`:`PMID ${escape(id||'ไม่ระบุ')}`;}
function setupExpansion(){
 let expanded=null,trigger=null;
 function close(){if(expanded){expanded.classList.remove('expanded');expanded=null;document.body.classList.remove('has-expanded');trigger?.setAttribute('aria-expanded','false');if(trigger){trigger.textContent='ขยายตาราง';trigger.focus();}}}
 document.querySelectorAll('[data-expand]').forEach(b=>b.onclick=()=>{const panel=$(b.dataset.expand);if(panel===expanded){close();return;}close();expanded=panel;trigger=b;panel.classList.add('expanded');document.body.classList.add('has-expanded');b.textContent='ย่อกลับ · Esc';b.setAttribute('aria-expanded','true');b.focus();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'&&expanded){const all=[...expanded.querySelectorAll('button:not(:disabled),input,a[href],select')].filter(el=>el.getClientRects().length);if(!all.length)return;const first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
}

async function start(){
 D=await d3.json('data/dashboard.json');D.sampleIndex=new Map(D.samples.map((s,i)=>[s.sample_key,i]));D.sampleIdToKey=new Map(D.samples.map(s=>[s.sample_id,s.sample_key]));D.edgesByHit=group(D.hitAmr,'hit_source_row');D.distanceBySite=group(D.distances,'site_key');D.facilityById=new Map(D.facilities.map(f=>[f.facility_id,f]));
 const who=new Map(D.who.map(w=>[w.source_row,w.risk_group])), links=new Map(D.taxonWho.map(e=>[e.taxon_key,who.get(e.who_source_row)]));D.taxa.forEach(t=>t.risk=links.get(t.taxon_key)||'');D.siteLabel=new Map(D.sites.map(s=>[s.site_key,D.sampleSites.filter(e=>e.site_key===s.site_key).map(e=>D.samples.find(s=>s.sample_key===e.sample_key).sample_id).join(' / ')]));
 map=L.map('map',{scrollWheelZoom:true,preferCanvas:true}).setView([17.35,103.65],8);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
 siteLayer=L.featureGroup().addTo(map);facilityLayer=L.layerGroup().addTo(map);radiusLayer=L.layerGroup().addTo(map);
 d3.json('data/thailand.geojson').then(g=>L.geoJSON(g,{interactive:false,style:{color:'#81919c',weight:1,fillOpacity:.025}}).addTo(map).bringToBack()).catch(()=>{});
 options('country',[...new Set(D.samples.map(s=>s.country))].map(c=>[c,c]),'ทุกประเทศ');$('country').value=state.country;syncSamples();options('risk',[...new Set(D.who.map(w=>w.risk_group))].map(r=>[r,r]),'ทุกกลุ่ม / รวม unmatched');
 $('country').onchange=()=>{state.country=$('country').value;state.siteFilter='';state.sample='';state.page=0;syncSamples();render();};$('sample').onchange=()=>{state.siteFilter='';state.sample=$('sample').value;state.page=0;render();if(state.site)focusSite(state.site);};$('risk').onchange=()=>{state.risk=$('risk').value;state.page=0;render();};$('search').oninput=()=>{state.search=$('search').value;state.page=0;render();};$('site').onchange=()=>selectSite($('site').value);$('radius').oninput=()=>{state.radius=+$('radius').value;renderMap();};$('radius').onchange=()=>focusSite(state.site);
 $('prev').onclick=()=>{state.page--;render();};$('next').onclick=()=>{state.page++;render();};$('clearTaxon').onclick=()=>{state.taxons=[];render();};$('fit').onclick=()=>{const ss=availableSites();if(ss.length)map.fitBounds(ss.map(s=>[s.latitude,s.longitude]),{padding:[40,40],maxZoom:11});};$('reset').onclick=()=>{Object.assign(state,{country:'Thailand',sample:'',risk:'',search:'',taxons:[],siteFilter:'',radius:20,page:0});$('country').value='Thailand';$('risk').value='';$('search').value='';$('radius').value=20;syncSamples();render();$('fit').click();};
 $('clearSite').onclick=()=>{state.siteFilter='';state.page=0;render();};
 setupExpansion();
 render();$('status').textContent='';
 if(document.modelContext?.registerTool)Promise.resolve(document.modelContext.registerTool({name:'set_map_radius',description:'Set the visible map radius in kilometers around the selected sampling site.',inputSchema:{type:'object',properties:{radiusKm:{type:'number',minimum:1,maximum:100}},required:['radiusKm'],additionalProperties:false},execute:({radiusKm})=>{if(!Number.isFinite(radiusKm)||radiusKm<1||radiusKm>100)throw Error('Radius must be 1–100 km');state.radius=radiusKm;$('radius').value=radiusKm;focusSite(state.site);return {site:state.site,radiusKm};}})).catch(()=>{});
}
start().catch(e=>{$('status').textContent='โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ ('+e.message+')';console.error(e);});

