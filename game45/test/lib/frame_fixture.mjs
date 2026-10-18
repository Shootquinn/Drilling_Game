// Fixture page for the B-FRAME and B-KEY2 detectors (zero control and mutants). Not the game: it draws the storyboard frame at the storyboard rects,
// exposes the __s45 members the checkers read (ready, state, uiGeometry, setWallClock, setPhase) and shows controls and keys per phase.
// opts: shiftX, shiftY (fractions of the viewport, shifts every zone and panel), controls 'spine' | 'under', frameW, frameColor, keys (phase -> ids), omitZones.
import { SB, KEY_MATRIX } from './frame.mjs';
import { LEGAL, KEY_TEXT } from './ui.mjs';

export function fixtureHtml(opts = {}) {
  const o = { shiftX: 0, shiftY: 0, controls: 'spine', frameW: SB.FRAME_PX, frameColor: SB.INK, keys: KEY_MATRIX, omitZones: [], ...opts };
  const data = JSON.stringify({ SB, o, LEGAL, KEY_TEXT });
  return `<!doctype html><html><head><meta charset="utf-8"><title>frame fixture</title>
<style>html,body{margin:0;padding:0;overflow:hidden;background:rgb(251,248,241);font:12px Arial,sans-serif}
canvas{position:absolute;left:0;top:0}.z{position:absolute;box-sizing:border-box}
button,input{position:absolute;box-sizing:border-box;margin:0;font:inherit}.k{position:absolute;white-space:nowrap}</style></head><body>
<canvas id="cv"></canvas>
<script>
(function(){
const D=${data}, SB=D.SB, o=D.o;
const vw=innerWidth, vh=innerHeight;
const s=Math.min(vw/SB.WD,vh/SB.HT), ox=(vw-SB.WD*s)/2+o.shiftX*vw, oy=(vh-SB.HT*s)/2+o.shiftY*vh;
const R=(x,y,w,h)=>({x:ox+x*s,y:oy+y*s,w:w*s,h:h*s});
const ph=SB.PW*100/200;
const rect={title:R(0,0,SB.WD,SB.TITLE_H),heading:R(SB.XL,SB.SKY,SB.XR+SB.PW-SB.XL,SB.SURF-SB.SKY),spine:R(SB.SP0,SB.SP_Y0,SB.SP1-SB.SP0,SB.SP_Y1-SB.SP_Y0),info:R(SB.XL,SB.BOT,SB.XR+SB.PW-SB.XL,SB.INFO_Y1-SB.BOT),left:R(SB.XL,SB.SURF,SB.PW,ph),right:R(SB.XR,SB.SURF,SB.PW,ph)};
const cv=document.getElementById('cv'); cv.width=vw; cv.height=vh; const g=cv.getContext('2d');
const rgb=c=>'rgb('+c.join(',')+')';
g.fillStyle=rgb(SB.PAGE); g.fillRect(0,0,vw,vh);
g.fillStyle=rgb(SB.BAND); g.fillRect(Math.round(rect.heading.x),Math.round(rect.heading.y),Math.round(rect.heading.w),Math.round(rect.heading.h));
g.fillStyle='#fff'; g.fillRect(0,0,vw,Math.round(rect.title.h));
for(const p of [rect.left,rect.right]){
  const x0=Math.round(p.x),y0=Math.round(p.y),x1=Math.round(p.x+p.w),y1=Math.round(p.y+p.h),f=o.frameW;
  g.fillStyle=rgb(o.frameColor);
  g.fillRect(x0-f,y0-f,x1-x0+2*f,f); g.fillRect(x0-f,y1,x1-x0+2*f,f); g.fillRect(x0-f,y0,f,y1-y0); g.fillRect(x1,y0,f,y1-y0);
  g.fillStyle='rgb(232,223,205)'; g.fillRect(x0,y0,x1-x0,y1-y0);
}
function zone(id,r,bg){
  if(o.omitZones.indexOf(id)>=0) return null;
  const d=document.createElement('div'); d.className='z'; d.setAttribute('data-s45',id);
  d.style.cssText='left:'+r.x+'px;top:'+r.y+'px;width:'+r.w+'px;height:'+r.h+'px;'+(bg?'background:'+bg:'')+';pointer-events:none';
  document.body.appendChild(d); return d;
}
zone('zone-title',rect.title,null); zone('zone-heading',rect.heading,null);
const spine=zone('zone-spine',rect.spine,'rgba(235,229,214,0.9)'); const info=zone('zone-info',rect.info,null);
const host=document.createElement('div'); host.className='z'; host.style.cssText='left:0;top:0;width:'+vw+'px;height:'+vh+'px;pointer-events:none'; document.body.appendChild(host);
const IDS=['show-formation','done-painting','brush-tool','brush-2','brush-5','brush-8','brush-12','brush-20','erase','fill','undo','clear','peek','next-gen','grow-12','plan-undo','back-to-paint','start','speed-1','speed-4','speed-16','pause','skip','play-again'];
const bw=(rect.spine.w-8), bh=Math.max(14,20*s), under=o.controls==='under';
const ux=rect.left.x, uy=rect.left.y+rect.left.h+8*s, uw=Math.max(50,60*s);
const ctl={};
IDS.forEach(function(id){ const b=document.createElement('button'); b.setAttribute('data-s45',id); b.textContent=id; b.style.display='none'; host.appendChild(b); ctl[id]=b; });
const sl=document.createElement('input'); sl.type='range'; sl.setAttribute('data-s45','dbranch'); sl.style.display='none'; host.appendChild(sl);
const KEYIDS=['key-intersected','key-imaged','key-unseen','key-outline','key-planned','key-ghost','key-shadow','key-portal','key-hole','key-drilled','key-dropped','key-run-intersected','key-run-imaged','key-run-unseen','key-run-barren'];
const kn={};
KEYIDS.forEach(function(id){ const k=document.createElement('div'); k.className='k'; k.setAttribute(id==='key-hole'?'data-key2':'data-s45',id); k.textContent=D.KEY_TEXT[id]||id.replace('key-',''); k.style.display='none'; host.appendChild(k); kn[id]=k; });
let phase='LEVEL_START';
function render(){
  const ids=D.LEGAL[phase]; let i=0;
  IDS.forEach(function(id){ const b=ctl[id]; const on=ids.indexOf(id)>=0; b.style.display=on?'block':'none';
    if(on){ if(under){ b.style.left=(ux+i*(uw+4))+'px'; b.style.top=uy+'px'; b.style.width=uw+'px'; b.style.height=bh+'px'; }
            else { b.style.left=(rect.spine.x+4)+'px'; b.style.top=(rect.spine.y+8*s+i*(bh+4*s))+'px'; b.style.width=bw+'px'; b.style.height=bh+'px'; } i++; } });
  sl.style.display=phase==='PLAN'?'block':'none';
  if(under){ sl.style.left=ux+'px'; sl.style.top=(uy+bh+6)+'px'; sl.style.width=(120*s)+'px'; sl.style.height=bh+'px'; }
  else { sl.style.left=(rect.spine.x+4)+'px'; sl.style.top=(rect.spine.y+8*s+i*(bh+4*s))+'px'; sl.style.width=bw+'px'; sl.style.height=bh+'px'; }
  const want=o.keys[phase]||[]; let j=0;
  KEYIDS.forEach(function(id){ const k=kn[id]; const on=want.indexOf(id)>=0; k.style.display=on?'block':'none';
    if(on){ k.style.left=(rect.info.x+8+j*130*s)+'px'; k.style.top=(rect.info.y+10*s)+'px'; j++; } });
}
render();
globalThis.__s45={ready:true,
  state:function(){return {phase:phase};}, stateHash:function(){return 0;}, setWallClock:function(){}, frame:function(){},
  setPhase:function(p){phase=p;render();},
  uiGeometry:function(){return {dpr:1,viewport:{w:vw,h:vh},canvas:{x:0,y:0,w:vw,h:vh},cellPx:SB.PW/200*s,W:200,H:100,panels:{left:rect.left,right:rect.right},portals:[],buttons:{},key:rect.info,readout:{left:rect.info,right:rect.info},offPanel:{x:rect.spine.x+10,y:rect.spine.y+10}};}
};
})();
</script></body></html>`;
}
