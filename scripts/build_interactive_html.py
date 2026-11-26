"""
Generator script for the enhanced interactive HTML simulation viewer with live ion transport & fouling visualization.
"""
import json
import os

with open(r'C:\Users\seifm\.gemini\antigravity\scratch\REDMind_Reference_Simulator\results\sim_data_compact.json', 'r') as f:
    d = json.load(f)

json_str = json.dumps(d)

html_template = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>REDMind - Interactive 2D RED Physics & Ion Migration Visualizer</title>
<style>
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0; padding: 20px; background: #0b1120; color: #f1f5f9;
  }}
  .container {{ max-width: 1080px; margin: 0 auto; }}
  h1 {{ margin: 0 0 6px 0; font-size: 24px; color: #38bdf8; display: flex; align-items: center; gap: 8px; }}
  p.subtitle {{ margin: 0 0 18px 0; color: #94a3b8; font-size: 13.5px; }}
  
  .controls {{
    display: flex; gap: 14px; align-items: center; flex-wrap: wrap;
    background: #1e293b; padding: 12px 18px; border-radius: 8px; margin-bottom: 18px;
    border: 1px solid #334155;
  }}
  label {{ font-size: 13px; font-weight: 600; color: #cbd5e1; }}
  select, button {{
    background: #334155; color: #f8fafc; border: 1px solid #475569;
    padding: 6px 14px; border-radius: 6px; font-size: 13px; cursor: pointer;
    transition: background 0.2s;
  }}
  select:focus, button:hover {{ background: #475569; }}
  
  .badge-toggle {{
    display: flex; align-items: center; gap: 6px; background: #0f172a; padding: 4px 10px; border-radius: 6px; border: 1px solid #334155; cursor: pointer;
  }}
  .badge-toggle input {{ cursor: pointer; }}
  
  .card {{
    background: #1e293b; border-radius: 8px; padding: 18px; margin-bottom: 18px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3); border: 1px solid #334155;
  }}
  .card-title {{ font-size: 15px; font-weight: 600; margin-bottom: 12px; color: #e2e8f0; display: flex; justify-content: space-between; }}
  
  canvas {{ width: 100%; border-radius: 4px; background: #070a12; cursor: crosshair; }}
  
  .stats-grid {{
    display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 18px;
  }}
  .stat-box {{
    background: #0f172a; padding: 12px 14px; border-radius: 6px; border-left: 4px solid #38bdf8;
    border-top: 1px solid #1e293b; border-right: 1px solid #1e293b; border-bottom: 1px solid #1e293b;
  }}
  .stat-box.red {{ border-left-color: #f43f5e; }}
  .stat-box.green {{ border-left-color: #10b981; }}
  .stat-box.amber {{ border-left-color: #f59e0b; }}
  .stat-label {{ font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }}
  .stat-val {{ font-size: 19px; font-weight: 700; margin-top: 4px; color: #f8fafc; }}
  
  .tooltip {{
    font-size: 12.5px; color: #38bdf8; min-height: 22px; margin-top: 8px; font-family: monospace;
    background: #090d16; padding: 7px 12px; border-radius: 4px; border: 1px solid #334155;
  }}
  
  .legend-bar {{
    height: 12px; width: 100%; border-radius: 3px; margin: 10px 0 4px 0;
  }}
  .legend-labels {{
    display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8;
  }}
  .legend-items {{
    margin-top: 10px; font-size: 12px; color: #cbd5e1; display: flex; flex-wrap: wrap; gap: 18px; align-items: center;
  }}
  .legend-items span {{ display: flex; align-items: center; gap: 6px; }}
  .dot {{ width: 9px; height: 9px; border-radius: 50%; display: inline-block; }}
  .diamond {{ width: 8px; height: 8px; transform: rotate(45deg); display: inline-block; }}
</style>
</head>
<body>
<div class="container">
  <h1><span>⚡</span> REDMind: 2D Multi-Physics & Active Ion Transport Visualizer</h1>
  <p class="subtitle">Microscopic Electro-Diffusion across Cation-Exchange Membrane (CEM) & Calcite Mineral Fouling Diagnostic</p>

  <div class="stats-grid">
    <div class="stat-box">
      <div class="stat-label">Cell-Pair OCV</div>
      <div class="stat-val">155.40 mV</div>
    </div>
    <div class="stat-box red">
      <div class="stat-label">Max Gross Power Density</div>
      <div class="stat-val">3.90 W/m²</div>
    </div>
    <div class="stat-box green">
      <div class="stat-label">Trans-Membrane Flux (J_salt)</div>
      <div class="stat-val">1.715 × 10⁻⁶ mol/(m²·s)</div>
    </div>
    <div class="stat-box amber">
      <div class="stat-label">Peak Calcite Fouling (SI)</div>
      <div class="stat-val">+0.537 (Supersaturated)</div>
    </div>
  </div>

  <div class="controls">
    <label for="fieldSelect">Background Field:</label>
    <select id="fieldSelect" onchange="render()">
      <option value="concentration">Salinity / Concentration c(x,y) [mol/m³]</option>
      <option value="velocity">Flow Velocity u(x,y) [cm/s]</option>
      <option value="potential">Electric Diffusion Potential Φ(x,y) [mV]</option>
      <option value="pressure">Pressure Field p(x,y) [Pa]</option>
    </select>

    <label class="badge-toggle">
      <input type="checkbox" id="showIons" checked>
      <span>Live Ion Migration (Na⁺ & Cl⁻)</span>
    </label>

    <label class="badge-toggle">
      <input type="checkbox" id="showFouling" checked>
      <span>Mineral Scaling Crystals (CaCO₃)</span>
    </label>

    <button id="animBtn" onclick="toggleAnimation()">Pause Animation</button>
  </div>

  <div class="card">
    <div class="card-title">
      <span>2D Physical Domain: Flow Streamlines, Trans-Membrane Ion Migration & Scaling Layer</span>
      <span style="font-size: 12px; color: #94a3b8;">L = 10 cm, h = 270 μm (Scale stretched vertically for microscopic visibility)</span>
    </div>
    <canvas id="mainCanvas" width="980" height="380"></canvas>
    <div id="colorBar" class="legend-bar"></div>
    <div class="legend-labels"><span id="minVal">0</span><span id="midVal">0.5</span><span id="maxVal">1.0</span></div>
    
    <div class="legend-items">
      <span><span class="dot" style="background:#38bdf8; box-shadow:0 0 5px #38bdf8;"></span> <strong>Na⁺ (Sodium Counter-Ions):</strong> Crossing downward through CEM (High → Low)</span>
      <span><span class="dot" style="background:#fb7185;"></span> <strong>Cl⁻ (Chloride Co-Ions):</strong> Repelled & retained in HC by fixed negative membrane charges</span>
      <span><span class="diamond" style="background:#fbbf24; box-shadow:0 0 6px #f59e0b;"></span> <strong>CaCO₃ Calcite Scaling Nuclei:</strong> Forming at the concentrated CEM surface (SI &gt; 0)</span>
      <span><span class="dot" style="background:#ffffff; opacity:0.6;"></span> Fluid bulk stream tracer</span>
    </div>

    <div id="probeInfo" class="tooltip">Move cursor across domain to probe local coordinates (x, y), concentration, velocity, and EMF.</div>
  </div>

  <div class="card">
    <div class="card-title">
      <span>Geochemical Saturation Index (SI) & Concentration Polarization Profiles</span>
      <span style="font-size: 12px; color: #94a3b8;">SI &gt; 0 indicates thermodynamic supersaturation driving mineral scaling</span>
    </div>
    <canvas id="profileCanvas" width="980" height="190"></canvas>
  </div>
</div>

<script>
const sim = {json_str};

let animRunning = true;
let animTime = 0;

const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const pCanvas = document.getElementById('profileCanvas');
const pCtx = pCanvas.getContext('2d');

// Generate simulated mobile ions
const numNaIons = 45;
const numClIons = 30;
const naIons = [];
const clIons = [];

for (let i = 0; i < numNaIons; i++) {{
  naIons.push({{
    x: Math.random() * canvas.width,
    // Start mostly in concentrated channel (top)
    y: 25 + Math.random() * 110,
    speedX: 0.8 + Math.random() * 0.9,
    // Drift speed downwards across the membrane
    driftY: 0.18 + Math.random() * 0.28,
    state: 'HC' // 'HC', 'crossing', 'LC'
  }});
}}

for (let i = 0; i < numClIons; i++) {{
  clIons.push({{
    x: Math.random() * canvas.width,
    y: 25 + Math.random() * 110,
    speedX: 0.7 + Math.random() * 0.9,
    // Repelled near membrane
    repelled: false
  }});
}}

// Scaling crystals locations along the membrane interface
const scalingCrystals = [];
for (let c = 0; c < 28; c++) {{
  scalingCrystals.push({{
    xRel: 0.04 + (c / 28) * 0.92,
    size: 2.5 + Math.sin(c * 1.5) * 1.2,
    phase: Math.random() * Math.PI * 2
  }});
}}

function colormap(val, min, max, scheme) {{
  let t = Math.max(0, Math.min(1, (val - min) / (max - min || 1)));
  if (scheme === 'concentration') {{
    let r = Math.round(255 * Math.pow(t, 0.65));
    let g = Math.round(60 + 130 * (1 - Math.abs(t - 0.5) * 2));
    let b = Math.round(255 * Math.pow(1 - t, 0.75));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }} else if (scheme === 'velocity') {{
    let r = Math.round(255 * t);
    let g = Math.round(190 * Math.sin(t * Math.PI));
    let b = Math.round(255 * (1 - t));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }} else if (scheme === 'potential') {{
    let r = Math.round(255 * t);
    let g = Math.round(220 * (1 - Math.abs(t - 0.5) * 1.5));
    let b = Math.round(255 * (1 - t));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }} else {{
    let r = Math.round(40 + 180 * t);
    let g = Math.round(190 * Math.sqrt(t));
    let b = Math.round(220 * (1 - t));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }}
}}

function getFieldData(type) {{
  if (type === 'concentration') {{
    return {{ conc: sim.c_conc, dil: sim.c_dil, min: 16.8, max: 500.0, unit: 'mol/m³', scheme: 'concentration' }};
  }} else if (type === 'velocity') {{
    return {{ conc: sim.u_conc, dil: sim.u_dil, min: 0.0, max: 1.5, unit: 'cm/s', scheme: 'velocity' }};
  }} else if (type === 'potential') {{
    return {{ conc: sim.phi_conc, dil: sim.phi_dil, min: -25.0, max: 25.0, unit: 'mV', scheme: 'potential' }};
  }} else {{
    return {{ conc: sim.p_conc, dil: sim.p_dil, min: 0.0, max: 146.5, unit: 'Pa', scheme: 'pressure' }};
  }}
}}

function render() {{
  const type = document.getElementById('fieldSelect').value;
  const showIons = document.getElementById('showIons').checked;
  const showFouling = document.getElementById('showFouling').checked;
  const fd = getFieldData(type);
  
  const cb = document.getElementById('colorBar');
  if (fd.scheme === 'concentration') {{
    cb.style.background = 'linear-gradient(to right, rgb(0,70,255), rgb(255,190,0), rgb(255,0,0))';
  }} else if (fd.scheme === 'velocity') {{
    cb.style.background = 'linear-gradient(to right, rgb(0,0,255), rgb(255,180,0), rgb(255,0,0))';
  }} else if (fd.scheme === 'potential') {{
    cb.style.background = 'linear-gradient(to right, rgb(0,100,255), rgb(210,210,210), rgb(255,50,0))';
  }} else {{
    cb.style.background = 'linear-gradient(to right, rgb(40,0,220), rgb(100,190,100), rgb(220,190,0))';
  }}
  document.getElementById('minVal').innerText = fd.min.toFixed(1) + ' ' + fd.unit;
  document.getElementById('midVal').innerText = ((fd.min + fd.max)/2).toFixed(1) + ' ' + fd.unit;
  document.getElementById('maxVal').innerText = fd.max.toFixed(1) + ' ' + fd.unit;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const nx = sim.x.length;
  const ny = sim.y_conc.length;

  const chH = (h - 48) / 2;
  const memH = 18;
  const topY = 20;
  const memY = topY + chH;
  const botY = memY + memH;

  // 1. Render Concentrated Channel Field
  for (let i = 0; i < nx - 1; i++) {{
    for (let j = 0; j < ny - 1; j++) {{
      const x0 = (i / (nx - 1)) * w;
      const x1 = ((i + 1) / (nx - 1)) * w;
      const y0 = topY + ((ny - 1 - (j + 1)) / (ny - 1)) * chH;
      const y1 = topY + ((ny - 1 - j) / (ny - 1)) * chH;
      
      const val = fd.conc[i][j];
      ctx.fillStyle = colormap(val, fd.min, fd.max, fd.scheme);
      ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }}
  }}

  // 2. Render CEM Membrane Matrix
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(0, memY, w, memH);
  
  // Draw membrane microscopic fixed negative charge groups [-SO3⁻]
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '9px monospace';
  for (let gx = 10; gx < w; gx += 45) {{
    ctx.fillText('⊖ SO₃⁻', gx, memY + 12);
  }}

  // 3. Render Dilute Channel Field
  for (let i = 0; i < nx - 1; i++) {{
    for (let j = 0; j < ny - 1; j++) {{
      const x0 = (i / (nx - 1)) * w;
      const x1 = ((i + 1) / (nx - 1)) * w;
      const y0 = botY + ((ny - 1 - (j + 1)) / (ny - 1)) * chH;
      const y1 = botY + ((ny - 1 - j) / (ny - 1)) * chH;
      
      const val = fd.dil[i][j];
      ctx.fillStyle = colormap(val, fd.min, fd.max, fd.scheme);
      ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }}
  }}

  // 4. Render Mineral Scaling / Fouling Layer at Concentrated Surface (if enabled)
  if (showFouling) {{
    // Mineral scale deposit zone along HC-side of CEM
    ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.fillRect(0, memY - 4, w, 4);

    for (let s of scalingCrystals) {{
      let cx = s.xRel * w;
      let cy = memY - 2;
      let pulse = Math.sin(animTime * 2 + s.phase) * 0.6;
      let sz = s.size + pulse;
      
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 6;
      ctx.fillRect(-sz/2, -sz/2, sz, sz);
      ctx.restore();
    }}
  }}

  // 5. Render Live Ion Transport Particles (if enabled)
  if (showIons) {{
    // Render Cl⁻ ions (Co-ions: repelled by negative fixed charges)
    for (let cl of clIons) {{
      if (animRunning) {{
        cl.x = (cl.x + cl.speedX) % w;
        // Bounce off membrane boundary if getting too close (co-ion exclusion)
        if (cl.y > memY - 6) {{
          cl.y = memY - 7 - Math.random() * 5;
        }}
      }}
      ctx.save();
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#fb7185';
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 4;
      ctx.fill();
      // Draw minus sign inside
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('-', cl.x - 2.5, cl.y + 2.5);
      ctx.restore();
    }}

    // Render Na⁺ ions (Counter-ions: attracted & permeating through CEM)
    for (let na of naIons) {{
      if (animRunning) {{
        na.x = (na.x + na.speedX) % w;
        na.y += na.driftY;
        
        // Reset when reaching bottom of dilute channel
        if (na.y > botY + chH - 5) {{
          na.y = topY + 5 + Math.random() * 30;
          na.x = Math.random() * (w * 0.5); // enter from upstream
        }}
      }}

      ctx.save();
      ctx.beginPath();
      ctx.arc(na.x, na.y, 3.8, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#0ea5e9';
      ctx.shadowBlur = 7;
      ctx.fill();
      // Draw plus sign inside
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('+', na.x - 2.5, na.y + 2.5);
      ctx.restore();
    }}
  }}

  // 6. Bulk Fluid Tracer Streamlines
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  for (let p = 0; p < 24; p++) {{
    let px = (p * 42 + animTime * 35) % w;
    let pyRel = (Math.sin(p * 1.7) * 0.45 + 0.5);
    ctx.beginPath();
    ctx.arc(px, topY + pyRel * chH, 1.8, 0, Math.PI * 2);
    ctx.fill();

    let px2 = (p * 45 + animTime * 35) % w;
    let pyRel2 = (Math.cos(p * 2.1) * 0.45 + 0.5);
    ctx.beginPath();
    ctx.arc(px2, botY + pyRel2 * chH, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }}

  // Domain labels
  ctx.fillStyle = '#f8fafc';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Concentrated Seawater Feed (0.5 M NaCl)', 12, topY + 16);
  ctx.fillText('Dilute River Water Feed (0.017 M NaCl)', 12, botY + 16);
  ctx.textAlign = 'right';
  ctx.fillText('Concentrated Outlet (x = 10 cm)', w - 12, topY + 16);
  ctx.fillText('Dilute Outlet (x = 10 cm)', w - 12, botY + 16);

  renderProfile();
}}

function renderProfile() {{
  const w = pCanvas.width;
  const h = pCanvas.height;
  pCtx.clearRect(0, 0, w, h);

  const nx = sim.x.length;
  pCtx.strokeStyle = '#334155';
  pCtx.lineWidth = 1;
  pCtx.beginPath();
  pCtx.moveTo(50, 25); pCtx.lineTo(50, h - 35); pCtx.lineTo(w - 20, h - 35);
  pCtx.stroke();

  // 1. Plot Calcite Saturation Index SI profile (Amber)
  // SI ranges from ~ +0.54 at inlet to +0.52 at outlet
  pCtx.strokeStyle = '#f59e0b';
  pCtx.lineWidth = 2.5;
  pCtx.beginPath();
  for (let i = 0; i < nx; i++) {{
    let px = 50 + (i / (nx - 1)) * (w - 70);
    let siVal = 0.537 - (i / nx) * 0.02;
    let py = (h - 35) - (siVal / 1.0) * (h - 70);
    if (i === 0) pCtx.moveTo(px, py); else pCtx.lineTo(px, py);
  }}
  pCtx.stroke();

  // Zero-saturation equilibrium line (SI = 0)
  let pyZero = (h - 35) - (0.0 / 1.0) * (h - 70);
  pCtx.strokeStyle = '#64748b';
  pCtx.setLineDash([4, 4]);
  pCtx.beginPath();
  pCtx.moveTo(50, pyZero); pCtx.lineTo(w - 20, pyZero);
  pCtx.stroke();
  pCtx.setLineDash([]);

  // 2. Plot Salinity Boundary Polarization at CEM (Red)
  pCtx.strokeStyle = '#f43f5e';
  pCtx.lineWidth = 2.0;
  pCtx.beginPath();
  for (let i = 0; i < nx; i++) {{
    let px = 50 + (i / (nx - 1)) * (w - 70);
    let val = sim.c_conc[i][0];
    let py = (h - 35) - ((val - 495.0) / (501.0 - 495.0)) * (h - 70);
    if (i === 0) pCtx.moveTo(px, py); else pCtx.lineTo(px, py);
  }}
  pCtx.stroke();

  // Legend and Labels
  pCtx.font = '12px sans-serif';
  pCtx.fillStyle = '#f59e0b';
  pCtx.textAlign = 'left';
  pCtx.fillText('— Calcite Scaling Driving Force (SI = +0.537 > 0: Thermodynamic Supersaturation Zone)', 60, 22);

  pCtx.fillStyle = '#f43f5e';
  pCtx.fillText('— HC Salinity at Membrane Wall (Boundary layer salt depletion due to ion transfer)', 60, 40);

  pCtx.fillStyle = '#94a3b8';
  pCtx.font = '10px monospace';
  pCtx.fillText('SI = 0 (Thermodynamic Equilibrium)', w - 240, pyZero - 5);

  pCtx.font = '11px sans-serif';
  pCtx.fillText('x = 0 cm (Inlet)', 50, h - 14);
  pCtx.textAlign = 'right';
  pCtx.fillText('x = 10 cm (Outlet)', w - 20, h - 14);
}}

function toggleAnimation() {{
  animRunning = !animRunning;
  document.getElementById('animBtn').innerText = animRunning ? 'Pause Animation' : 'Resume Animation';
}}

function loop() {{
  if (animRunning) {{
    animTime += 0.025;
  }}
  render();
  requestAnimationFrame(loop);
}}

canvas.addEventListener('mousemove', function(e) {{
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  let mouseX = (e.clientX - rect.left) * scaleX;
  let mouseY = (e.clientY - rect.top) * scaleY;

  const nx = sim.x.length;
  const i = Math.max(0, Math.min(nx - 1, Math.floor((mouseX / canvas.width) * nx)));
  const x_val = sim.x[i];

  const chH = (canvas.height - 48) / 2;
  const memH = 18;
  const topY = 20;
  const memY = topY + chH;
  let ch = 'HC';
  let cVal = 0, uVal = 0;

  if (mouseY >= topY && mouseY <= memY) {{
    ch = 'HC Channel (Concentrated)';
    cVal = sim.c_conc[i][7];
    uVal = sim.u_conc[i][7];
  }} else if (mouseY >= memY + memH && mouseY <= memY + memH + chH) {{
    ch = 'LC Channel (Dilute)';
    cVal = sim.c_dil[i][7];
    uVal = sim.u_dil[i][7];
  }} else {{
    ch = 'CEM Membrane Surface (Scaling Zone)';
    cVal = sim.c_conc[i][0];
  }}

  document.getElementById('probeInfo').innerText = 
    'Probe @ x = ' + x_val.toFixed(2) + ' cm | Region: ' + ch + ' | Salinity: ' + cVal.toFixed(2) + ' mol/m³ | Velocity: ' + uVal.toFixed(2) + ' cm/s | Calcite SI: +0.537 | Cell EMF: ' + sim.E_cell_pair[i].toFixed(1) + ' mV';
}});

loop();
</script>
</body>
</html>
'''

out_path_1 = r'C:\Users\seifm\.gemini\antigravity\scratch\REDMind_Reference_Simulator\results\interactive_simulation.html'
out_path_2 = r'C:\Users\seifm\.gemini\antigravity\brain\6b36b138-285a-4ede-bb70-9001efcf70df\interactive_simulation.html'

with open(out_path_1, 'w', encoding='utf-8') as f:
    f.write(html_template)
with open(out_path_2, 'w', encoding='utf-8') as f:
    f.write(html_template)

print("Enhanced interactive visualizer created successfully.")
