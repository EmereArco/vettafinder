// Pagina Leaflet caricata nella WebView: mappa OpenTopoMap / satellite senza chiavi API.
// Comunica con React Native via window.ReactNativeWebView.postMessage.
export const MAP_HTML = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin:0; padding:0; height:100%; width:100%; background:#0E1620; }
  .pk { display:flex; flex-direction:column; align-items:center; transform: translate(-50%, -100%); position:absolute; }
  .pk .b { background:rgba(14,22,32,.9); color:#EAF1F7; font:600 11px -apple-system,Roboto,sans-serif;
           padding:3px 6px; border-radius:8px; white-space:nowrap; }
  .pk.big .b { background:#F2B134; color:#0E1620; }
  .pk.osm .b { background:rgba(40,60,80,.85); }
  .pk .t { width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent;
           border-top:6px solid rgba(14,22,32,.9); }
  .pk.big .t { border-top-color:#F2B134; }
  .me { width:16px; height:16px; border-radius:8px; background:#5FB3E8; border:3px solid #fff;
        box-shadow:0 0 0 6px rgba(95,179,232,.3); transform:translate(-50%,-50%); position:absolute; }
  .vp { width:14px; height:14px; background:#E8795F; border:2px solid #fff; transform:translate(-50%,-50%) rotate(45deg); position:absolute; }
  .leaflet-div-icon { background:transparent; border:none; }
  .leaflet-control-attribution { font-size:9px; }
</style>
</head><body><div id="map"></div>
<script>
  function send(o){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  var map = L.map('map', { zoomControl:false, attributionControl:true }).setView([45.0, 7.0], 8);
  var topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom:17, subdomains:'abc',
    attribution:'© OpenStreetMap, SRTM · © OpenTopoMap (CC-BY-SA)'
  }).addTo(map);
  var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom:18, attribution:'Tiles © Esri'
  });
  var peaks = [];
  var layer = L.layerGroup().addTo(map);
  var meMarker = null, vpMarker = null;

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function render(){
    layer.clearLayers();
    var b = map.getBounds().pad(0.1), z = map.getZoom();
    var minEle = z < 8 ? 3500 : z < 9 ? 3000 : z < 10 ? 2000 : 0;
    var vis = peaks.filter(function(p){ return p.ele >= minEle && b.contains([p.lat, p.lon]); });
    vis.sort(function(a,b){ return b.ele - a.ele; });
    vis = vis.slice(0, 150);
    vis.forEach(function(p){
      var name = p.name.length > 18 ? p.name.slice(0,17) + '…' : p.name;
      var cls = 'pk' + (p.ele >= 4000 ? ' big' : '') + (p.osm ? ' osm' : '');
      var icon = L.divIcon({ className:'', html:'<div class="'+cls+'"><div class="b">'+esc(name)+' '+p.ele+'</div><div class="t"></div></div>', iconSize:[0,0] });
      L.marker([p.lat, p.lon], { icon:icon }).on('click', function(){ send({ type:'peak', id:p.id }); }).addTo(layer);
    });
  }
  map.on('moveend', function(){
    render();
    var c = map.getCenter(), b = map.getBounds();
    send({ type:'move', lat:c.lat, lon:c.lng, radiusKm: map.distance(c, b.getNorthEast())/1000 });
  });
  map.on('contextmenu', function(e){ send({ type:'longpress', lat:e.latlng.lat, lon:e.latlng.lng }); });

  window.setPeaks = function(list){ peaks = list; render(); };
  window.flyTo = function(lat, lon, z){ map.flyTo([lat, lon], z || 12, { duration: 0.8 }); };
  window.setMe = function(lat, lon){
    if (!meMarker) meMarker = L.marker([lat, lon], { icon: L.divIcon({ className:'', html:'<div class="me"></div>', iconSize:[0,0] }), interactive:false }).addTo(map);
    else meMarker.setLatLng([lat, lon]);
  };
  window.setVp = function(lat, lon){
    if (lat == null) { if (vpMarker) { map.removeLayer(vpMarker); vpMarker = null; } return; }
    if (!vpMarker) vpMarker = L.marker([lat, lon], { icon: L.divIcon({ className:'', html:'<div class="vp"></div>', iconSize:[0,0] }), interactive:false }).addTo(map);
    else vpMarker.setLatLng([lat, lon]);
  };
  window.setLayer = function(name){
    if (name === 'sat') { map.removeLayer(topo); sat.addTo(map); }
    else { map.removeLayer(sat); topo.addTo(map); }
  };
  send({ type:'ready' });
</script></body></html>`;
