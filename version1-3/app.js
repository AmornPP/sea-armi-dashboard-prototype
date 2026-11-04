/* SEA-ARMi v1.3. Source records and biological mappings are unchanged. */
const $=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('en-US');
const state={country:'Thailand',sample:'',risk:'',search:'',taxons:[],siteFilter:'',site:'',radius:20,page:0,mapMode:'site',facility:'',drug:'',lang:'th'};
const tr=(th,en)=>state.lang==='en'?en:th;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const group=(rows,key)=>d3.group(rows,r=>r[key]);
let D,map,siteLayer,facilityLayer,radiusLayer,activeTaxa=[],activeHits=[],displayHits=[],activeEvidence=[],facilityMarkers=new Map();
let facilityLimit=40,taxonLimit=40,facilityOpen=false,taxonOpen=false,selectedHit='',expanded=null,expandTrigger=null;
const norm=s=>String(s??'').trim().normalize('NFC').toLocaleLowerCase();
function options(id,items,first){const el=$(id);el.replaceChildren();if(first!==null)el.add(new Option(first,''));items.forEach(([v,label])=>el.add(new Option(label,v)));}
function syncSamples(){options('sample',D.samples.filter(s=>!state.country||s.country===state.country).map(s=>[s.sample_key,s.sample_id]),tr('ทุกตัวอย่าง','All samples'));if(![...$('sample').options].some(o=>o.value===state.sample))state.sample='';$('sample').value=state.sample;}
function facilityPairs(){return state.facility?(D.distancesByFacility.get(state.facility)||[]).filter(d=>Number(d.distance_km)<=state.radius):[];}
function pickedSamples(){
 if(state.mapMode==='facility'){const sites=new Set(facilityPairs().map(d=>d.site_key)),keys=new Set(D.sampleSites.filter(e=>sites.has(e.site_key)).map(e=>e.sample_key));return D.samples.filter(s=>keys.has(s.sample_key));}
 return D.samples.filter(s=>(!state.country||s.country===state.country)&&(!state.sample||s.sample_key===state.sample)&&(!state.siteFilter||D.sampleSites.some(e=>e.site_key===state.siteFilter&&e.sample_key===s.sample_key)));
}
function evidenceFor(hits){const ids=new Set(hits.flatMap(h=>(D.edgesByHit.get(h.source_row)||[]).map(e=>e.amr_source_row)));return D.amr.filter(a=>ids.has(a.source_row));}
function filteredEvidence(hits){return evidenceFor(hits).filter(a=>!state.drug||a.drug===state.drug);}
function calculate(){
 const samples=pickedSamples(),keys=new Set(samples.map(s=>s.sample_key)),indexes=samples.map(s=>String(D.sampleIndex.get(s.sample_key)));
 activeTaxa=D.taxa.filter(t=>(!state.risk||t.risk===state.risk)&&(!state.search||norm(t.taxon).includes(norm(state.search)))).map(t=>{const cells=indexes.map(i=>t.samples[i]).filter(Boolean);return {...t,n:cells.reduce((a,c)=>a+c[0],0),sampleCount:cells.length,min:Math.min(...cells.map(c=>c[1])),max:Math.max(...cells.map(c=>c[2]))};}).filter(t=>t.n);
 activeTaxa.sort((a,b)=>(!!b.risk-!!a.risk)||a.taxon.localeCompare(b.taxon));
 state.taxons=state.taxons.filter(id=>D.taxa.some(t=>t.taxon_key===id&&(!state.risk||t.risk===state.risk)&&indexes.some(i=>t.samples[i])));
 const chosen=D.taxa.filter(t=>state.taxons.includes(t.taxon_key)),allowed=new Set((chosen.length?chosen:activeTaxa).map(t=>t.taxon_key));
 const hitIds=new Set(D.taxonHit.filter(e=>allowed.has(e.taxon_key)&&keys.has(e.sample_key)).map(e=>e.hit_source_row));
 // No taxon/WHO/name filter: preserve unmatched species hits, as in v1.2.
 activeHits=D.hits.filter(h=>keys.has(D.sampleIdToKey.get(h.sample_id))&&((!state.taxons.length&&!state.risk&&!state.search)||hitIds.has(h.source_row)));
 activeEvidence=filteredEvidence(activeHits);
 const evidenceIds=new Set(activeEvidence.map(a=>a.source_row));
 displayHits=state.drug?activeHits.filter(h=>(D.edgesByHit.get(h.source_row)||[]).some(e=>evidenceIds.has(e.amr_source_row))):activeHits;
 return {samples,chosen};
}
function bar(id,entries,color){
 const root=d3.select('#'+id);root.selectAll('*').remove();if(!entries.length){root.append('p').attr('class','empty').text(tr('ไม่มีข้อมูลที่ตรงตัวกรอง','No matching data'));return;}
 const rows=entries.slice(0,6),svg=root.append('svg').attr('viewBox','0 0 350 200').attr('role','img').attr('aria-label',rows.map(([n,c])=>`${n}: ${c}`).join('; '));
 const x=d3.scaleLinear().domain([0,d3.max(rows,d=>d[1])||1]).range([0,150]);rows.forEach(([name,n],i)=>{svg.append('text').attr('x',0).attr('y',23+i*30).text(name.length>21?name.slice(0,19)+'…':name).append('title').text(name);svg.append('rect').attr('x',160).attr('y',9+i*30).attr('width',x(n)).attr('height',20).attr('rx',2).attr('fill',color);svg.append('text').attr('x',165+x(n)).attr('y',24+i*30).text(fmt(n));});
}
function render(){
 const {samples,chosen}=calculate();
 $('selections').innerHTML=chosen.length?chosen.map(t=>`<button type="button" data-remove="${escape(t.taxon_key)}" aria-label="${escape(tr('นำออก ','Remove ')+t.taxon)}">${escape(t.taxon)} <small>${escape(t.rank_code)}</small> ×</button>`).join(''):escape(tr('ยังไม่ได้เลือกเชื้อเฉพาะ — ค้นแล้วเลือกหลายรายการได้','No specific taxa selected — search to select multiple taxa'));
 $('selections').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>toggleTaxon(b.dataset.remove));
 $('siteScope').textContent=state.mapMode==='facility'?facilityScope():state.siteFilter?tr('กรองจุด ','Site filter: ')+D.siteLabel.get(state.siteFilter)+` · ${samples.length} `+tr('ตัวอย่าง','samples'):tr('ข้อมูลทุกจุดตามประเทศ / ตัวอย่างที่เลือก','All sites within the selected country / sample');
 $('clearSite').disabled=state.mapMode==='facility'?!state.facility:!state.siteFilter;
 const cards=[[samples.length,tr('ตัวอย่างในตัวกรอง','Samples in scope')],[activeTaxa.length,tr('รายการเชื้อรา / ระดับอนุกรมวิธาน','Taxon / rank records')],[displayHits.length,tr('ผลเทียบลำดับพันธุกรรม (hits)','Sequence alignment hits')],[activeEvidence.length,tr('หลักฐานอ้างอิงไม่ซ้ำ','Distinct reference records')]];
 $('metrics').innerHTML=cards.map(([n,label])=>`<div class="metric"><strong>${fmt(n)}</strong><span>${label}</span></div>`).join('');
 const pages=Math.max(1,Math.ceil(activeTaxa.length/25));state.page=Math.min(state.page,pages-1);$('page').textContent=tr('หน้า ','Page ')+`${state.page+1} / ${pages}`;$('prev').disabled=!state.page;$('next').disabled=state.page>=pages-1;$('taxonCount').textContent=fmt(activeTaxa.length)+' '+tr('รายการ','records');
 $('taxa').innerHTML=activeTaxa.slice(state.page*25,state.page*25+25).map(t=>`<tr class="${state.taxons.includes(t.taxon_key)?'selected':''}"><td><input type="checkbox" aria-label="${escape(tr('เลือก ','Select ')+t.taxon)}" data-taxon="${escape(t.taxon_key)}" ${state.taxons.includes(t.taxon_key)?'checked':''}> <button type="button" class="taxon-button" data-taxon="${escape(t.taxon_key)}">${escape(t.taxon)}</button><small>${escape(t.rank_code)} · taxid ${escape(t.ncbi_taxid)}</small></td><td>${escape(t.risk||tr('ไม่พบ exact WHO match','No exact WHO match'))}</td><td>${t.sampleCount}</td><td>${fmt(t.min)}–${fmt(t.max)}</td></tr>`).join('')||`<tr><td colspan="4" class="empty">${tr('ไม่พบเชื้อที่ตรงตัวกรอง','No matching taxa')}</td></tr>`;
 $('taxa').querySelectorAll('[data-taxon]').forEach(b=>b.onclick=()=>toggleTaxon(b.dataset.taxon));
 const members=d3.groups((chosen.length?chosen:activeTaxa).filter(t=>t.risk),t=>t.risk).map(([name,rows])=>[name,[...new Set(rows.map(t=>t.taxon))].sort()]).sort((a,b)=>b[1].length-a[1].length);
 bar('riskChart',members.map(([n,ts])=>[n,ts.length]),'#aa3044');
 const openGroups=new Set([...$('riskMembers').querySelectorAll('details[open]')].map(el=>el.dataset.group));
 $('riskMembers').innerHTML=members.map(([name,ts])=>`<details data-group="${escape(name)}" ${openGroups.has(name)?'open':''}><summary>${escape(name)} · ${ts.length} ${tr('ชื่อ','names')}</summary><ul>${ts.map(t=>`<li><i>${escape(t)}</i></li>`).join('')}</ul></details>`).join('');
 renderEvidence(chosen);
 syncMapControls();renderMap();updateFilterSummary();
 if(taxonOpen)showTaxonResults();
}
function renderEvidence(chosen){
 bar('drugChart',d3.rollups(activeEvidence,v=>v.length,a=>a.drug).sort((a,b)=>b[1]-a[1]),'#218f8c');
 $('detailTitle').textContent=tr('หลักฐานอ้างอิงการดื้อยา','Resistance reference evidence')+(chosen.length?' · '+chosen.length+' taxa':'');
 $('detailSummary').textContent=`${displayHits.length} hits · ${activeEvidence.length} `+tr('หลักฐานไม่ซ้ำ','distinct references')+(state.drug?' · '+tr('ยา: ','Drug: ')+state.drug:'')+' · '+tr('กดจำนวนหลักฐานเพื่ออ่านรายละเอียด','Open an evidence count for details');
 $('hits').innerHTML=displayHits.map(h=>`<tr><td>${escape(h.sample_id)}<small>${escape(h.species)}</small></td><td>${escape(h.accession)}<small>${escape(h.gene)}</small></td><td>${escape(h.pident)}%<small>${escape(h.evalue)}</small></td><td>${escape(h.protein)}</td><td><button type="button" data-hit="${escape(h.source_row)}">${filteredEvidence([h]).length} ${tr('หลักฐาน','references')}</button></td></tr>`).join('')||`<tr><td colspan="5" class="empty">${tr('ไม่มี alignment / หลักฐานที่ตรงตัวกรอง','No alignment / evidence matches these filters')}</td></tr>`;
 $('hits').querySelectorAll('[data-hit]').forEach(b=>b.onclick=()=>showEvidence(b.dataset.hit));
 if(selectedHit&&displayHits.some(h=>h.source_row===selectedHit))showEvidence(selectedHit);else{selectedHit='';$('evidence').replaceChildren();}
}
function showEvidence(id){
 const h=D.hits.find(h=>h.source_row===id);if(!h)return;selectedHit=id;const rows=filteredEvidence([h]);
 $('evidence').innerHTML=`<h3>${tr('ข้อมูลอ้างอิงสำหรับ','References for')} ${escape(h.sample_id)} / ${escape(h.accession)}</h3><p class="hint">${tr('จับคู่ accession เท่านั้น ไม่ยืนยัน mutation หรือ phenotype ของตัวอย่าง · MIC และ confidence score คงตามต้นฉบับ ยังไม่ตีความคะแนนหรือ breakpoints','Accession link only; does not confirm a sample mutation or phenotype. MIC and confidence score are shown verbatim, without score or breakpoint interpretation.')}</p>`+(rows.length?`<table><thead><tr><th>Species / Gene</th><th>Drug / Usage</th><th>Mutation</th><th>MIC (${tr('ต้นฉบับ','source')})</th><th>Confidence score (${tr('ต้นฉบับ','source')})</th><th>Host / Origin</th><th>${tr('อ้างอิง','Reference')}</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${escape(a.species)}<small>${escape(a.gene_or_protein_name)}</small></td><td>${escape(a.drug)}<small>${escape(a.drug_usage)}</small></td><td>${escape(a.mutation)}</td><td>${escape(a.mic||tr('ไม่ระบุ','Not supplied'))}</td><td>${escape(a.confidence_score)}</td><td>${escape(a.host)}<small>${escape(a.strain_origin_if_available)}</small></td><td>${escape(a.first_author_name)} ${escape(a.year)}<small>${pmidLink(a.pubmedid)}</small></td></tr>`).join('')}</tbody></table>`:`<p class="empty">${tr('ไม่มีหลักฐานที่ตรงตัวกรองสำหรับ accession นี้','No matching reference evidence for this accession')}</p>`);
}
function pmidLink(value){const id=String(value||'').trim();return /^\d+$/.test(id)?`<a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank" rel="noopener noreferrer">PMID ${id} ↗</a>`:`PMID ${escape(id||tr('ไม่ระบุ','Not supplied'))}`;}
function toggleTaxon(id){state.taxons=state.taxons.includes(id)?state.taxons.filter(k=>k!==id):[...state.taxons,id];render();}
function searchFacilities(query){const q=norm(query);return D.sortedFacilities.filter(f=>!q||D.facilitySearchIndex.get(f.facility_id).includes(q));}
function setPickerOpen(open){facilityOpen=open;$('facilityDropdown').hidden=!open;for(const id of ['facilitySearch','facilityDropdownButton'])$(id).setAttribute('aria-expanded',String(open));if(open)showFacilityResults();}
function showFacilityResults(){
 const matches=searchFacilities($('facilitySearch').value);$('facilitySearchStatus').textContent=tr('พบ ','Found ')+fmt(matches.length)+tr(' แห่ง · แสดง ',' facilities · Showing ')+Math.min(matches.length,facilityLimit)+tr(' รายการ · พิมพ์เพิ่มเพื่อกรอง',' · Type to narrow results');
 $('facilityOptions').innerHTML=matches.slice(0,facilityLimit).map(f=>`<button type="button" data-facility-choice="${escape(f.facility_id)}" aria-pressed="${state.facility===f.facility_id}">${escape(f.facility_name)}<small>${escape(f.facility_id)}</small></button>`).join('');
 $('moreFacilities').hidden=matches.length<=facilityLimit;
 $('facilityOptions').querySelectorAll('button').forEach(b=>b.onclick=()=>selectFacility(b.dataset.facilityChoice));
}
function selectFacility(id){if(!D.facilityById.has(id))return;state.mapMode='facility';state.facility=id;state.country='Thailand';state.sample='';state.siteFilter='';state.page=0;$('country').value='Thailand';$('facilitySearch').value=D.facilityById.get(id).facility_name;setPickerOpen(false);syncSamples();render();focusFacility();$('facilityDropdownButton').focus();}
function setTaxonOpen(open){taxonOpen=open;$('taxonDropdown').hidden=!open;$('search').setAttribute('aria-expanded',String(open));if(open)showTaxonResults();}
function showTaxonResults(){
 $('taxonSearchStatus').textContent=tr('พบ ','Found ')+fmt(activeTaxa.length)+tr(' รายการ · แสดง ',' records · Showing ')+Math.min(activeTaxa.length,taxonLimit);
 $('taxonOptions').innerHTML=activeTaxa.slice(0,taxonLimit).map(t=>`<button type="button" data-taxon-choice="${escape(t.taxon_key)}" aria-pressed="${state.taxons.includes(t.taxon_key)}">${state.taxons.includes(t.taxon_key)?'✓ ':''}${escape(t.taxon)} <small>${escape(t.rank_code)} · taxid ${escape(t.ncbi_taxid)}</small></button>`).join('');$('moreTaxa').hidden=activeTaxa.length<=taxonLimit;
 $('taxonOptions').querySelectorAll('button').forEach(b=>b.onclick=()=>{const id=b.dataset.taxonChoice;toggleTaxon(id);$('taxonOptions').querySelector(`[data-taxon-choice="${CSS.escape(id)}"]`)?.focus();});
}
function syncMapControls(){
 $('facilityControls').hidden=state.mapMode!=='facility';$('siteControl').hidden=state.mapMode==='facility';$('modeSite').setAttribute('aria-pressed',String(state.mapMode==='site'));$('modeFacility').setAttribute('aria-pressed',String(state.mapMode==='facility'));
 $('clearSite').textContent=state.mapMode==='facility'?tr('ยกเลิกเลือกสถานพยาบาล','Clear facility'):tr('ยกเลิกกรองจุด','Clear site filter');
 if(state.mapMode==='site')setPickerOpen(false);
}
function leaveFacilityMode(){state.mapMode='site';state.facility='';$('facilitySearch').value='';syncMapControls();}
function switchPickerMode(mode){if(mode===state.mapMode)return;state.mapMode=mode;state.siteFilter='';state.sample='';state.page=0;if(mode==='facility'){state.country='Thailand';$('country').value='Thailand';}syncSamples();render();if(mode==='facility')focusFacility();}
function availableSites(){const keys=new Set(D.samples.filter(s=>(!state.country||s.country===state.country)&&(!state.sample||s.sample_key===state.sample)).map(s=>s.sample_key));return D.sites.filter(s=>D.sampleSites.some(e=>e.site_key===s.site_key&&keys.has(e.sample_key)));}
function selectSite(key){if(!D.sites.some(s=>s.site_key===key))return;state.site=key;state.siteFilter=key;state.sample='';state.page=0;syncSamples();render();focusSite(key);}
function focusSite(key){if(state.mapMode==='facility'){focusFacility();return;}state.site=key;renderMap();const s=D.sites.find(s=>s.site_key===key);if(s)map.fitBounds(L.latLng(s.latitude,s.longitude).toBounds(state.radius*2400),{maxZoom:13,padding:[15,15]});}
function focusFacility(){const f=D.facilityById.get(state.facility);if(f)map.fitBounds(L.latLng(f.latitude,f.longitude).toBounds(state.radius*2400),{maxZoom:13,padding:[20,20]});}
function facilityScope(){const f=D.facilityById.get(state.facility);return f?`${f.facility_name} · ${state.radius} km · ${facilityPairs().length} `+tr('จุด','sites')+` · ${pickedSamples().length} `+tr('ตัวอย่าง','samples'):tr('โหมดสถานพยาบาล · เลือกสถานพยาบาลเพื่อเริ่มสำรวจ','Facility mode · Select a facility to begin');}
function renderMap(){
 siteLayer.clearLayers();facilityLayer.clearLayers();radiusLayer.clearLayers();facilityMarkers.clear();$('radiusText').textContent=state.radius+tr(' กม.',' km');
 $('legend').innerHTML=`<span class="red">● ${tr('จุดเก็บตัวอย่าง','Sampling sites')}</span><span class="teal">● ${state.mapMode==='facility'?tr('สถานพยาบาลที่เลือก','Selected facility'):tr('สถานพยาบาลในรัศมี','Facilities within radius')}</span>`;
 if(state.mapMode==='facility'){
  const f=D.facilityById.get(state.facility),pairs=facilityPairs().sort((a,b)=>+a.distance_km-+b.distance_km);$('facilitySelected').textContent=f?tr('ศูนย์กลาง: ','Centre: ')+f.facility_name+' · '+f.facility_id:'';
  if(!f){$('mapMessage').textContent=tr('ค้นหาและเลือกสถานพยาบาลด้านบนเพื่อดูตัวอย่างใกล้เคียง','Search and select a facility above to see nearby samples');$('nearbyTitle').textContent=tr('จุดเก็บตัวอย่างใกล้สถานพยาบาล','Sites near the facility');$('nearby').replaceChildren();return;}
  L.circleMarker([f.latitude,f.longitude],{radius:10,color:'#075b58',weight:3,fillColor:'#39aaa0',fillOpacity:1}).bindPopup(`<b>${escape(f.facility_name)}</b><br>${tr('ศูนย์กลางการค้นหา','Search centre')} · ${escape(f.facility_id)}`).addTo(facilityLayer);
  L.circle([f.latitude,f.longitude],{radius:state.radius*1000,color:'#168b88',weight:2,fillOpacity:.08}).addTo(radiusLayer);
  pairs.forEach(p=>{const s=D.sites.find(s=>s.site_key===p.site_key);L.circleMarker([s.latitude,s.longitude],{radius:8,color:'#fff',weight:2,fillColor:'#ba253e',fillOpacity:1}).bindPopup(`<b>${escape(D.siteLabel.get(s.site_key))}</b><br>${Number(p.distance_km).toFixed(2)} km ${tr('จากสถานพยาบาล','from facility')}`).addTo(siteLayer);});siteLayer.bringToFront();
  $('mapMessage').textContent=pairs.length?`${pairs.length} `+tr('จุด','sites')+` · ${pickedSamples().length} `+tr('ตัวอย่างในรัศมี (ไม่ใช่ข้อมูลผู้ป่วยของสถานพยาบาล)','samples within radius (not facility patient records)'):tr('ไม่มีข้อมูลตัวอย่างในระยะนี้ ไม่ได้แปลว่าไม่มีเชื้อหรือไม่มีการดื้อยา','No sample data in this radius; this does not establish absence of fungi or resistance');
  $('nearbyTitle').textContent=tr('จุดเก็บตัวอย่างในระยะ ','Sampling sites within ')+`${state.radius} km (${pairs.length})`;
  $('nearby').innerHTML=pairs.map(p=>`<button type="button" data-near-site="${escape(p.site_key)}"><span>${escape(D.siteLabel.get(p.site_key))}</span><strong>${Number(p.distance_km).toFixed(1)} km</strong></button>`).join('')||`<p class="empty">${tr('ลองเพิ่มรัศมีหรือเลือกสถานพยาบาลอื่น','Increase the radius or select another facility')}</p>`;
  $('nearby').querySelectorAll('[data-near-site]').forEach(b=>b.onclick=()=>{const s=D.sites.find(s=>s.site_key===b.dataset.nearSite);map.setView([s.latitude,s.longitude],12);});return;
 }
 const sites=availableSites();if(!sites.some(s=>s.site_key===state.site))state.site=sites[0]?.site_key||'';options('site',sites.map(s=>[s.site_key,D.siteLabel.get(s.site_key)]),sites.length?null:tr('ไม่มีพิกัดในตัวกรองนี้','No coordinates in scope'));$('site').value=state.site;
 sites.forEach(s=>L.circleMarker([s.latitude,s.longitude],{radius:s.site_key===state.site?10:7,color:'#fff',weight:2,fillColor:'#ba253e',fillOpacity:1}).bindTooltip(escape(D.siteLabel.get(s.site_key))).on('click',()=>selectSite(s.site_key)).addTo(siteLayer));
 const site=sites.find(s=>s.site_key===state.site);if(!site){$('mapMessage').textContent=tr('ตัวอย่างที่เลือกไม่มีพิกัด จึงไม่คำนวณสถานพยาบาลใกล้เคียง','Selected samples have no coordinates; nearby facilities cannot be calculated');$('nearbyTitle').textContent=tr('ไม่มีจุดสำหรับคำนวณระยะ','No site for distance calculation');$('nearby').replaceChildren();return;}
 L.circle([site.latitude,site.longitude],{radius:state.radius*1000,color:'#b82a43',weight:2,fillOpacity:.08}).addTo(radiusLayer);
 const near=(D.distanceBySite.get(site.site_key)||[]).filter(d=>+d.distance_km<=state.radius).sort((a,b)=>+a.distance_km-+b.distance_km);
 near.forEach(d=>{const f=D.facilityById.get(d.facility_id);const marker=L.circleMarker([f.latitude,f.longitude],{radius:4,color:'#116965',weight:1,fillColor:'#39aaa0',fillOpacity:.8}).bindPopup(`<b>${escape(f.facility_name)}</b><br>${(+d.distance_km).toFixed(2)} km ${tr('จากจุดเก็บตัวอย่าง','from sampling site')}<br>MOPH type: ${escape(f.facility_type_code)}`).addTo(facilityLayer);facilityMarkers.set(f.facility_id,marker);});siteLayer.bringToFront();
 $('mapMessage').textContent=`${sites.length} `+tr('จุด · กำลังดู ','sites · Viewing ')+D.siteLabel.get(site.site_key)+' · '+tr('ลากแผนที่หรือใช้ + / − เพื่อซูม','Drag or use + / − to zoom');$('nearbyTitle').textContent=`${near.length} `+tr('สถานพยาบาลในระยะ ','facilities within ')+`${state.radius} km`;
 $('nearby').innerHTML=near.slice(0,100).map(d=>`<button type="button" data-facility="${escape(d.facility_id)}"><span>${escape(D.facilityById.get(d.facility_id).facility_name)}</span><strong>${(+d.distance_km).toFixed(1)} km</strong></button>`).join('')||`<p class="empty">${tr('ไม่มีสถานพยาบาลในรัศมีนี้ ลองเพิ่มระยะทาง','No facilities within this radius; try a larger distance')}</p>`;
 if(near.length>100)$('nearby').insertAdjacentHTML('beforeend',`<p class="hint">${tr('ลิสต์แสดง 100 แห่งแรก แผนที่แสดงครบตามรัศมี','List shows the first 100; the map shows all facilities within radius')}</p>`);
 $('nearby').querySelectorAll('[data-facility]').forEach(b=>b.onclick=()=>{const marker=facilityMarkers.get(b.dataset.facility);map.setView(marker.getLatLng(),13);marker.openPopup();});
}
function filterDescription(){
 const names=state.taxons.map(id=>D.taxa.find(t=>t.taxon_key===id)?.taxon).filter(Boolean);
 return [tr('ประเทศ: ','Country: ')+(state.country||tr('ทั้งหมด','All')),tr('ตัวอย่าง: ','Sample: ')+(D.samples.find(s=>s.sample_key===state.sample)?.sample_id||tr('ทั้งหมดในพื้นที่','All in scope')),tr('WHO: ','WHO: ')+(state.risk||tr('ทุกกลุ่ม','All groups')),tr('ค้นชื่อ: ','Name search: ')+(state.search||'—'),tr('เชื้อที่เลือก: ','Selected taxa: ')+(names.join(', ')||'—'),tr('ยา (หลักฐานเท่านั้น): ','Drug (evidence only): ')+(state.drug||tr('ทั้งหมด','All'))].join(' · ');
}
function updateFilterSummary(){$('filterSummary').textContent=filterDescription();}
function applyLanguage(){
 document.documentElement.lang=state.lang;document.querySelectorAll('[data-th][data-en]').forEach(el=>el.textContent=el.dataset[state.lang]);
 $('search').placeholder=tr('เช่น Aspergillus fumigatus','e.g. Aspergillus fumigatus');$('facilitySearch').placeholder=tr('พิมพ์ชื่อ หรือกด ▾ เพื่อเลือกรายการ','Type a name, or use ▾ to browse');$('facilityDropdownButton').setAttribute('aria-label',tr('เปิดรายชื่อสถานพยาบาล','Open facility list'));
 options('country',[...new Set(D.samples.map(s=>s.country))].map(c=>[c,c]),tr('ทุกประเทศ','All countries'));$('country').value=state.country;syncSamples();options('risk',[...new Set(D.who.map(w=>w.risk_group))].map(r=>[r,r]),tr('ทุกกลุ่ม / รวม unmatched','All groups / include unmatched'));$('risk').value=state.risk;
 options('drug',[...new Set(D.amr.map(a=>a.drug).filter(Boolean))].sort().map(d=>[d,d]),tr('ยาทั้งหมด','All drug labels'));$('drug').value=state.drug;
 document.querySelectorAll('[data-expand]').forEach(b=>b.textContent=b.getAttribute('aria-expanded')==='true'?tr('ย่อกลับ · Esc','Collapse · Esc'):tr('ขยายตาราง','Expand table'));
 render();if(facilityOpen)showFacilityResults();
}
function closeExpanded(){if(!expanded)return;expanded.classList.remove('expanded');expanded=null;document.body.classList.remove('has-expanded');expandTrigger.setAttribute('aria-expanded','false');expandTrigger.textContent=tr('ขยายตาราง','Expand table');expandTrigger.focus();}
function setupExpansion(){
 document.querySelectorAll('[data-expand]').forEach(b=>b.onclick=()=>{const panel=$(b.dataset.expand);if(panel===expanded){closeExpanded();return;}closeExpanded();expanded=panel;expandTrigger=b;panel.classList.add('expanded');document.body.classList.add('has-expanded');b.textContent=tr('ย่อกลับ · Esc','Collapse · Esc');b.setAttribute('aria-expanded','true');b.focus();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeExpanded();if(e.key==='Tab'&&expanded){const all=[...expanded.querySelectorAll('button:not(:disabled),input,a[href],select,summary')].filter(el=>el.getClientRects().length);const first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
}
function setupPickers(){
 $('modeSite').onclick=()=>switchPickerMode('site');$('modeFacility').onclick=()=>switchPickerMode('facility');
 // A bounded button list avoids rebuilding 11,000 native options on every keypress.
 // No focusout-close: mobile keyboards and option taps can cause transient blur.
 // Search provisional IME text too: mobile keyboards may compose an entire word.
 // Avoid replacing option buttons on duplicate input/compositionend during a tap.
 let lastFacilityQuery=null;
 const refreshFacilitySearch=()=>{
  const query=$('facilitySearch').value;
  if(facilityOpen&&query===lastFacilityQuery)return;
  lastFacilityQuery=query;facilityLimit=40;setPickerOpen(true);
  $('facilityOptions').scrollTop=0;
 };
 $('facilitySearch').onfocus=refreshFacilitySearch;
 $('facilitySearch').oninput=refreshFacilitySearch;
 $('facilitySearch').addEventListener('compositionend',refreshFacilitySearch);
 $('facilitySearch').addEventListener('change',refreshFacilitySearch);
 $('facilitySearch').addEventListener('search',refreshFacilitySearch);
 $('facilityDropdownButton').onclick=()=>{if(facilityOpen)setPickerOpen(false);else{$('facilitySearch').value='';facilityLimit=40;setPickerOpen(true);}};
 $('moreFacilities').onclick=()=>{facilityLimit+=40;showFacilityResults();};$('closeFacilities').onclick=()=>{setPickerOpen(false);$('facilityDropdownButton').focus();};
 $('search').onfocus=()=>{taxonLimit=40;setTaxonOpen(true);};$('search').oninput=e=>{if(e.isComposing)return;state.search=$('search').value;state.page=0;taxonLimit=40;taxonOpen=true;$('taxonDropdown').hidden=false;$('search').setAttribute('aria-expanded','true');render();};
 $('search').addEventListener('compositionend',()=>{$('search').oninput({isComposing:false});});
 $('moreTaxa').onclick=()=>{taxonLimit+=40;showTaxonResults();};$('closeTaxa').onclick=()=>{setTaxonOpen(false);$('search').focus({preventScroll:true});setTaxonOpen(false);};
 for(const [input,list,close] of [['facilitySearch','facilityOptions',()=>setPickerOpen(false)],['search','taxonOptions',()=>setTaxonOpen(false)]]){
  $(input).onkeydown=e=>{if(e.isComposing)return;if(e.key==='ArrowDown'){e.preventDefault();if(input==='search')setTaxonOpen(true);else setPickerOpen(true);$(list).querySelector('button')?.focus();}if(e.key==='Escape')close();};
  $(list).onkeydown=e=>{const buttons=[...$(list).querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,i+(e.key==='ArrowDown'?1:-1)))]?.focus();}if(e.key==='Escape'){close();$(input).focus();close();}};
 }
 document.addEventListener('pointerdown',e=>{if(!$('facilityPicker').contains(e.target))setPickerOpen(false);if(!$('taxonPicker').contains(e.target))setTaxonOpen(false);});
}
function preparePrint(){
 const date=new Date().toLocaleString(state.lang==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok'});
 $('printContext').innerHTML=`<h1>SEA–ARMi · v1.3</h1><p>${escape(date)} (Asia/Bangkok)</p><p>${escape(filterDescription())}</p><p>${escape($('siteScope').textContent)} · ${tr('รัศมี','Radius')}: ${state.radius} km</p><p>${tr('รายงานนี้มีตารางเชื้อหน้าปัจจุบัน','This report includes the current taxon page')} (${state.page+1}/${Math.max(1,Math.ceil(activeTaxa.length/25))}), ${displayHits.length} alignment hits. ${tr('แสดงหลักฐานรายละเอียดเฉพาะ hit ที่เปิดอยู่ ไม่รวมแผนที่ออนไลน์ ไม่ใช่ผลทดสอบความไวต่อยาหรืออัตราดื้อยา','Detailed evidence is included only for the opened hit. Online maps are excluded. Not susceptibility results or resistance rates.')}</p>`;
}
async function start(){
 D=await d3.json('data/dashboard.json');D.sampleIndex=new Map(D.samples.map((s,i)=>[s.sample_key,i]));D.sampleIdToKey=new Map(D.samples.map(s=>[s.sample_id,s.sample_key]));D.edgesByHit=group(D.hitAmr,'hit_source_row');D.distanceBySite=group(D.distances,'site_key');D.distancesByFacility=group(D.distances,'facility_id');D.facilityById=new Map(D.facilities.map(f=>[f.facility_id,f]));
 D.sortedFacilities=[...D.facilities].sort((a,b)=>a.facility_name.localeCompare(b.facility_name,'th')||a.facility_id.localeCompare(b.facility_id,undefined,{numeric:true}));D.facilitySearchIndex=new Map(D.facilities.map(f=>[f.facility_id,norm(f.facility_name+' '+f.facility_id)]));
 const who=new Map(D.who.map(w=>[w.source_row,w.risk_group])),links=new Map(D.taxonWho.map(e=>[e.taxon_key,who.get(e.who_source_row)]));D.taxa.forEach(t=>t.risk=links.get(t.taxon_key)||'');D.siteLabel=new Map(D.sites.map(s=>[s.site_key,D.sampleSites.filter(e=>e.site_key===s.site_key).map(e=>D.samples.find(s=>s.sample_key===e.sample_key).sample_id).join(' / ')]));
 map=L.map('map',{scrollWheelZoom:true,preferCanvas:true}).setView([17.35,103.65],8);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);siteLayer=L.featureGroup().addTo(map);facilityLayer=L.layerGroup().addTo(map);radiusLayer=L.layerGroup().addTo(map);
 d3.json('data/thailand.geojson').then(g=>L.geoJSON(g,{interactive:false,style:{color:'#81919c',weight:1,fillOpacity:.025}}).addTo(map).bringToBack()).catch(()=>{});
 $('country').onchange=()=>{leaveFacilityMode();state.country=$('country').value;state.siteFilter='';state.sample='';state.page=0;syncSamples();render();};$('sample').onchange=()=>{leaveFacilityMode();state.siteFilter='';state.sample=$('sample').value;state.page=0;render();if(state.site)focusSite(state.site);};$('risk').onchange=()=>{state.risk=$('risk').value;state.page=0;render();};$('drug').onchange=()=>{state.drug=$('drug').value;selectedHit='';render();};$('site').onchange=()=>selectSite($('site').value);
 $('radius').oninput=()=>{state.radius=+$('radius').value;if(state.mapMode==='facility')render();else{renderMap();updateFilterSummary();}};$('radius').onchange=()=>focusSite(state.site);
 $('prev').onclick=()=>{state.page--;render();};$('next').onclick=()=>{state.page++;render();};$('clearTaxon').onclick=()=>{state.taxons=[];render();};$('fit').onclick=()=>{if(state.mapMode==='facility'){focusFacility();return;}const ss=availableSites();if(ss.length)map.fitBounds(ss.map(s=>[s.latitude,s.longitude]),{padding:[40,40],maxZoom:11});};
 $('reset').onclick=()=>{leaveFacilityMode();Object.assign(state,{country:'Thailand',sample:'',risk:'',search:'',taxons:[],siteFilter:'',radius:20,page:0,drug:''});selectedHit='';$('search').value='';$('radius').value=20;setTaxonOpen(false);applyLanguage();$('fit').click();};
 $('clearSite').onclick=()=>{if(state.mapMode==='facility'){state.facility='';$('facilitySearch').value='';setPickerOpen(false);}state.siteFilter='';state.page=0;render();};
 $('languageButton').onclick=()=>{state.lang=state.lang==='th'?'en':'th';applyLanguage();};
 $('filterFields').hidden=window.matchMedia('(max-width:650px)').matches;$('filterToggle').setAttribute('aria-expanded',String(!$('filterFields').hidden));$('filterToggle').onclick=()=>{$('filterFields').hidden=!$('filterFields').hidden;$('filterToggle').setAttribute('aria-expanded',String(!$('filterFields').hidden));};
 $('helpButton').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();$('printButton').onclick=()=>{preparePrint();window.print();};window.addEventListener('beforeprint',preparePrint);
 setupPickers();setupExpansion();applyLanguage();$('status').textContent='';
}
start().catch(e=>{$('status').textContent=tr('โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ','Unable to load data. Please refresh')+' ('+e.message+')';console.error(e);});
