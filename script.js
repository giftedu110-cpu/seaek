const origin={lat:35.1587,lng:129.1604};
const tileUrl='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
let chosen={...origin}, reportPoint=null, inputMap, resultMap, reportMap, inputPin, reportPin;
let guards=[], landFeatures=[];

const $=s=>document.querySelector(s);
L.Marker.prototype.options.icon=L.divIcon({className:'seaek-pin',iconSize:[30,30],iconAnchor:[15,30]});
const num=id=>Number($(id).value)||0;
const dir=d=>['북','북동','동','남동','남','남서','서','북서'][Math.round(((d%360)+360)%360/45)%8];
function nowValue(){return new Date().toISOString().slice(0,16)}
function showView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $('#'+id).classList.add('active');
  $('#page-title').textContent=id==='find-view'?'분실 신고':id==='result-view'?'예측 결과':id==='report-view'?'발견 제보':'바다 분실물 추적';
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('selected',b.dataset.view===id||(id==='home-view'&&b.hasAttribute('data-home'))));
  setTimeout(()=>{if(id==='find-view')inputMap.invalidateSize();if(id==='report-view')reportMap.invalidateSize();if(id==='result-view')resultMap?.invalidateSize()},100);
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
document.querySelectorAll('[data-home]').forEach(b=>b.addEventListener('click',()=>showView('home-view')));

function addTiles(map){L.tileLayer(tileUrl,{attribution:'&copy; OpenStreetMap'}).addTo(map)}
inputMap=L.map('input-map').setView([origin.lat,origin.lng],13); addTiles(inputMap);
inputPin=L.marker([origin.lat,origin.lng],{draggable:true}).addTo(inputMap);
function setChosen(p){chosen={lat:p.lat,lng:p.lng};inputPin.setLatLng(p);$('#location').textContent=`선택 위치: 위도 ${p.lat.toFixed(5)}, 경도 ${p.lng.toFixed(5)}`}
inputMap.on('click',e=>setChosen(e.latlng)); inputPin.on('dragend',e=>setChosen(e.target.getLatLng()));
reportMap=L.map('report-map').setView([origin.lat,origin.lng],13); addTiles(reportMap);
reportMap.on('click',e=>{reportPoint={lat:e.latlng.lat,lng:e.latlng.lng};if(reportPin)reportPin.setLatLng(e.latlng);else reportPin=L.marker(e.latlng).addTo(reportMap);$('#report-location').textContent=`선택 위치: 위도 ${reportPoint.lat.toFixed(5)}, 경도 ${reportPoint.lng.toFixed(5)}`});

$('#lost-time').value=nowValue(); $('#report-time').value=nowValue();
document.querySelector('fieldset .environment-grid').insertAdjacentHTML('beforeend','<label>태풍 영향<select id="typhoon"><option value="0">없음</option><option value="1">주의</option><option value="2">강함</option></select></label>');
fetch('data/coast-guard.geojson').then(r=>r.ok?r.json():null).then(d=>guards=d?.features||[]).catch(()=>{});
fetch('data/land.geojson').then(r=>r.ok?r.json():null).then(d=>landFeatures=d?.features||[]).catch(()=>{});
function nearestGuard(p){
  return guards.map(f=>{const q=f.properties;const lat=Number(q.LAT),lng=Number(q.LOT);return {name:q.POL_NM,d:Math.hypot((lat-p.lat)*111,(lng-p.lng)*91)}}).sort((a,b)=>a.d-b.d)[0];
}
function vector(d,s){const r=d*Math.PI/180;return{x:Math.sin(r)*s,y:Math.cos(r)*s}}
function destination(start,heading,km){
  const r=Math.PI/180,a=km/6371,b=heading*r,p=start.lat*r,l=start.lng*r;
  const p2=Math.asin(Math.sin(p)*Math.cos(a)+Math.cos(p)*Math.sin(a)*Math.cos(b));
  return {lat:p2/r,lng:(l+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(p),Math.cos(a)-Math.sin(p)*Math.sin(p2)))/r};
}
function curvedRoute(start,end,heading){
  const points=[];const bend=Math.min(.012,Math.hypot(end.lat-start.lat,end.lng-start.lng)*.35);const side=(heading+90)*Math.PI/180;
  for(let i=0;i<=32;i++){const t=i/32,curve=Math.sin(Math.PI*t)*bend;const point={lat:start.lat+(end.lat-start.lat)*t+Math.cos(side)*curve,lng:start.lng+(end.lng-start.lng)*t+Math.sin(side)*curve};if(landFeatures.length&&landAt(point))break;points.push([point.lat,point.lng])}return points;
}
function inRing(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j],cross=((a[1]>p.lat)!=(b[1]>p.lat))&&p.lng<(b[0]-a[0])*(p.lat-a[1])/(b[1]-a[1])+a[0];if(cross)inside=!inside}return inside}
function landAt(p){return landFeatures.some(f=>{const g=f.geometry;if(g.type==='Polygon')return inRing(p,g.coordinates[0]);return g.type==='MultiPolygon'&&g.coordinates.some(x=>inRing(p,x[0]))})}
$('#live-button').addEventListener('click',async()=>{
  const b=$('#live-button');b.textContent='현재 값 불러오는 중…';
  try{
    const [weather,marine]=await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${chosen.lat}&longitude=${chosen.lng}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`).then(r=>r.json()),
      fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${chosen.lat}&longitude=${chosen.lng}&current=wave_height,wave_direction,ocean_current_velocity,ocean_current_direction`).then(r=>r.json())
    ]);
    $('#wind-dir').value=weather.current.wind_direction_10m;$('#wind-speed').value=Number(weather.current.wind_speed_10m).toFixed(2);
    $('#current-dir').value=marine.current.ocean_current_direction;$('#current-speed').value=Number(marine.current.ocean_current_velocity).toFixed(2);
    $('#wave-dir').value=marine.current.wave_direction;$('#wave-height').value=Number(marine.current.wave_height).toFixed(2);
    $('#live-note').textContent='현재 예보 값이 입력되었습니다. 시연에서는 필요에 따라 직접 바꿔도 됩니다.';b.textContent='현재 값 자동 입력 완료';
  }catch{b.textContent='자동 입력 실패';$('#live-note').textContent='연결이 되지 않아 직접 입력한 값을 그대로 사용합니다.'}
});
const oldLiveButton=$('#live-button'), timedLiveButton=oldLiveButton.cloneNode(true);
oldLiveButton.replaceWith(timedLiveButton);
timedLiveButton.textContent='분실 시각 기준 값 불러오기';
timedLiveButton.addEventListener('click',async()=>{
  const selected=new Date($('#lost-time').value);
  if(Number.isNaN(selected.getTime())){alert('분실 시각을 먼저 선택해 주세요.');return}
  const date=$('#lost-time').value.slice(0,10), hour=$('#lost-time').value.slice(0,13)+':00';
  timedLiveButton.textContent='선택 시각 자료 불러오는 중…';
  try{
    const base=`latitude=${chosen.lat}&longitude=${chosen.lng}&start_date=${date}&end_date=${date}&timezone=auto`;
    const [weather,marine]=await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${base}&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`).then(r=>r.json()),
      fetch(`https://marine-api.open-meteo.com/v1/marine?${base}&hourly=wave_height,wave_direction,ocean_current_velocity,ocean_current_direction`).then(r=>r.json())
    ]);
    const wi=weather.hourly?.time?.indexOf(hour), mi=marine.hourly?.time?.indexOf(hour);
    if(wi<0||mi<0)throw new Error('no hourly data');
    $('#wind-dir').value=weather.hourly.wind_direction_10m[wi];
    $('#wind-speed').value=Number(weather.hourly.wind_speed_10m[wi]).toFixed(2);
    $('#current-dir').value=marine.hourly.ocean_current_direction[mi];
    $('#current-speed').value=Number(marine.hourly.ocean_current_velocity[mi]).toFixed(2);
    $('#wave-dir').value=marine.hourly.wave_direction[mi];
    $('#wave-height').value=Number(marine.hourly.wave_height[mi]).toFixed(2);
    $('#live-note').textContent=`${date} ${hour.slice(11)} 기준의 시간별 예보 값이 입력되었습니다.`;
    timedLiveButton.textContent='분실 시각 기준 값 입력 완료';
  }catch{
    $('#live-note').textContent='해당 날짜·시각 자료를 불러오지 못했습니다. 직접 입력한 값을 사용해 주세요.';
    timedLiveButton.textContent='분실 시각 기준 값 불러오기';
  }
});
$('#prediction-form').addEventListener('submit',e=>{
  e.preventDefault();
  if($('#floating').value==='no'){alert('가라앉는 물체는 수면 이동 예측 대상이 아닙니다. 마지막 위치 주변을 수색해 주세요.');return}
  const hours=Math.max(1,Math.min(24,(Date.now()-new Date($('#lost-time').value))/36e5));
  const mass=num('#weight'),resist=1/(1+mass*.25), wd=num('#wind-dir'),ws=num('#wind-speed'),cd=num('#current-dir'),cs=num('#current-speed'),pd=num('#wave-dir'),ph=num('#wave-height');
  const typhoon=Number($('#typhoon').value)||0, stormBoost=1+typhoon*.28;
  const a=vector(cd,cs*(.6+.4*resist)*stormBoost), b=vector((wd+180)%360,ws*.198*resist*stormBoost), c=vector((pd+180)%360,ph*.32*resist*stormBoost);
  const total={x:a.x+b.x+c.x,y:a.y+b.y+c.y}; const heading=(Math.atan2(total.x,total.y)*180/Math.PI+360)%360;
  const km=Math.max(.05,Math.min(20,Math.hypot(total.x,total.y)*hours)); const end=destination(chosen,heading,km);
  const radius=Math.min(3,.25+ph*.35+ws*.035+hours*.025+typhoon*.45), probability=Math.max(35,Math.round(88-ph*10-ws*1.2-hours*.7-typhoon*7));
  $('#summary').textContent=`입력한 풍향·풍속, 해류, 파고를 기준으로 ${dir(heading)}쪽 약 ${km.toFixed(2)}km 지점이 예상 중심 위치입니다. 반경 ${radius.toFixed(2)}km 안에서 발견될 가능성을 약 ${probability}%로 표시합니다.`;
  $('#wind-stat').textContent=`${dir(wd)}풍 ${ws.toFixed(2)}m/s`;$('#current-stat').textContent=`${dir(cd)} ${cs.toFixed(2)}km/h`;$('#wave-stat').textContent=`${dir(pd)} · ${ph.toFixed(2)}m`;
  if(resultMap)resultMap.remove();resultMap=L.map('result-map').setView([end.lat,end.lng],13);addTiles(resultMap);
  const safeEnd=[end.lat,end.lng], route=[safeEnd,[safeEnd[0]+.008,safeEnd[1]+.008]];
  L.marker([chosen.lat,chosen.lng]).addTo(resultMap).bindTooltip('분실 위치');
  [[.35,'높음 55%','#f05b5b'],[.7,'보통 30%','#ffad22'],[1,'낮음 15%','#ffd761']].forEach(([s,label,color])=>L.circle(safeEnd,{radius:radius*1000*s,color,weight:2,fillColor:color,fillOpacity:.12}).addTo(resultMap).bindTooltip(label));
  L.marker(safeEnd).addTo(resultMap).bindPopup(`예상 중심 위치 · ${probability}%`).openPopup();resultMap.fitBounds(route,{padding:[25,25]});showView('result-view');
});
function safe(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('#report-form').addEventListener('submit',e=>{
  e.preventDefault();if(!reportPoint){alert('발견 위치를 지도에서 먼저 선택해 주세요.');return}
  const guard=nearestGuard(reportPoint), item=safe($('#report-item').value), time=$('#report-time').value.replace('T',' '), note=safe($('#report-note').value);
  const storage=guard?`가까운 해양경찰 관서: ${safe(guard.name)} (${guard.d.toFixed(1)}km) · 전달 전 보관 가능 여부 확인`:'가까운 해양경찰 관서 정보를 불러오는 중입니다.';
  $('#report-list').insertAdjacentHTML('afterbegin',`<article class="report-item"><b>${item} 발견</b><small>${time}${note?` · ${note}`:''}</small><small class="storage">${storage}</small></article>`);
  $('#report-note').value='';alert('제보가 최근 제보 목록에 등록되었습니다.');
});
$('#report-form').addEventListener('submit',()=>setTimeout(()=>{
  const card=$('#report-list .report-item');
  if(card&&!card.querySelector('.complete-report'))card.insertAdjacentHTML('beforeend','<button type="button" class="complete-report">물건 인계 완료</button><small class="handoff-message" hidden>물건을 찾은 분에게 인계되어 제보가 완료되었습니다.</small>');
},0));
$('#report-list').addEventListener('click',e=>{
  const button=e.target.closest('.complete-report');if(!button)return;
  const card=button.closest('.report-item');button.disabled=true;button.textContent='인계 완료';card.classList.add('completed');card.querySelector('.handoff-message').hidden=false;
});
