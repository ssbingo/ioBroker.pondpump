import{b as f,a as g}from"./_virtual_mf___mfe_internal__pondpump__mf_owner__169659973448624__loadShare__react_mf_1_jsx_mf_2_runtime__loadShare__.js-WvFV32sY.js";import{_ as m,a as h}from"./_virtual_mf___mfe_internal__pondpump__mf_owner__169659973448624__loadShare__react__loadShare__.js-DS23sZkI.js";import{a as x,b as w,c as y,d as u}from"./_virtual_mf___mfe_internal__pondpump__mf_owner__169659973448624__loadShare___mf_0_mui_mf_1_material__loadShare__.js-DNVKB3Ot.js";const v=`
.pp-card{box-sizing:border-box;height:100%;width:100%;display:flex;flex-direction:column;position:relative;
  font-family:Arial,Helvetica,sans-serif;color:#eef2f7;border-radius:16px;padding:14px 16px;overflow:hidden}
.pp-card.pp-bg{background:linear-gradient(160deg,#243244 0%,#1a2431 60%,#151d28 100%);box-shadow:0 6px 20px rgba(0,0,0,.35)}
.pp-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
.pp-title{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8fa0b6;font-weight:700;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pp-badge{font-size:11px;padding:3px 10px;border-radius:999px;font-weight:700;display:inline-flex;align-items:center;
  gap:6px;flex:0 0 auto}
.pp-badge::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.pp-badge--on{background:rgba(76,175,80,.16);color:#5ac36a}
.pp-badge--off{background:rgba(244,67,54,.16);color:#f0645a}
.pp-badge--sfc{background:rgba(56,170,255,.18);color:#59b6ff}

/* graphic stage */
.pp-stage{flex:1 1 auto;display:flex;align-items:center;justify-content:center;position:relative;min-height:96px;margin:4px 0}
.pp-stage .pp-graphic{flex:1 1 auto;display:flex;align-items:center;justify-content:center;height:100%;min-width:0}
.pp-stage .pp-graphic svg{display:block;height:100%;width:auto;max-height:220px;max-width:100%}
/* with a water-temperature reading: impeller left, thermometer right */
.pp-stage--temp{gap:12px}
.pp-stage--temp .pp-graphic{flex:1 1 62%}
.pp-thermo{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-width:56px}
.pp-thermo-svg{display:block;height:auto;width:auto;max-height:150px;filter:drop-shadow(0 0 8px rgba(0,0,0,.35))}
.pp-thermo-val{display:flex;align-items:baseline;gap:2px;font-variant-numeric:tabular-nums;line-height:1}
.pp-thermo-val .n{font-size:20px;font-weight:800;letter-spacing:-.02em}
.pp-thermo-val .u{font-size:11px;color:#8fa0b6;font-weight:600}
.pp-thermo-k{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#8fa0b6;font-weight:700}
.pp-spin{transform-origin:50% 50%;animation:pp-rot var(--pp-dur,2s) linear infinite}
.pp-spin.pp-ccw{animation-direction:reverse}
@keyframes pp-rot{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.pp-glow{filter:drop-shadow(0 0 10px rgba(89,182,255,.55))}
/* red "off" cross — drawn inside the impeller SVG so it always stays centred on the hub */
.pp-crossmark line{stroke:#f0433a;stroke-width:9;stroke-linecap:round;filter:drop-shadow(0 0 4px rgba(0,0,0,.5))}

/* value readouts */
.pp-values{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:auto}
.pp-val{background:rgba(255,255,255,.05);border-radius:10px;padding:8px 3px;text-align:center;min-width:0}
.pp-val .n{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.05;
  letter-spacing:-.03em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pp-val .u{font-size:9px;color:#8fa0b6;font-weight:600;margin-left:1px}
.pp-val .k{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#8fa0b6;font-weight:700;margin-top:3px}

.pp-hint{font-size:13px;color:#8fa0b6;margin-top:6px}

/* ---- control widget ---- */
.pp-onoff{display:flex;gap:8px;margin:4px 0 10px}
.pp-onoff button{flex:1 1 0;border:0;border-radius:10px;padding:10px 6px;font-size:14px;font-weight:700;cursor:pointer;
  color:#cdd7e4;background:rgba(255,255,255,.06);transition:background .15s,color .15s}
.pp-onoff button:hover{background:rgba(255,255,255,.12)}
.pp-onoff button.pp-active-on{background:#2e9e46;color:#fff}
.pp-onoff button.pp-active-off{background:#c53a30;color:#fff}
.pp-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:13px;margin:8px 0 4px}
.pp-row .k{color:#8fa0b6}
.pp-row .v{font-weight:700;font-variant-numeric:tabular-nums}
.pp-slider{width:100%;accent-color:var(--pp-accent,#38aaff);cursor:pointer}
.pp-slider:disabled{opacity:.5;cursor:not-allowed}
.pp-quick button:disabled{opacity:.5;cursor:not-allowed}
.pp-sliderrow{display:flex;align-items:center;gap:8px}
.pp-sliderrow .pp-slider{flex:1 1 auto;width:auto;min-width:0}
.pp-select{flex:0 0 auto;background:rgba(255,255,255,.06);color:#eef2f7;border:1px solid rgba(255,255,255,.14);
  border-radius:8px;padding:5px 6px;font-size:12px;font-weight:700;cursor:pointer;font-variant-numeric:tabular-nums}
.pp-select:disabled{opacity:.5;cursor:not-allowed}
.pp-select option{background:#1a2431;color:#eef2f7}
.pp-quick{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.pp-quick button{flex:1 1 0;min-width:44px;border:0;border-radius:8px;padding:6px 2px;font-size:12px;font-weight:700;
  cursor:pointer;color:#cdd7e4;background:rgba(255,255,255,.06)}
.pp-quick button:hover{background:rgba(255,255,255,.14)}
.pp-div{height:1px;background:rgba(255,255,255,.08);margin:12px 0 10px}
.pp-sfc{display:flex;justify-content:space-between;align-items:center;gap:10px}
.pp-sfc-t{font-size:13px;font-weight:700}
.pp-sfc-s{font-size:11px;color:#8fa0b6;margin-top:2px}
.pp-sfc button{border:0;border-radius:10px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;
  color:#fff;background:#2b7fc0}
.pp-sfc button.pp-active-sfc{background:#0f6fd6;box-shadow:0 0 10px rgba(56,170,255,.5)}
.pp-sfc button:disabled{background:rgba(255,255,255,.10);color:#6b7a8d;cursor:not-allowed;box-shadow:none}

/* tactile press feedback (all buttons) + SFC busy spinner (optimistic UI) */
.pp-onoff button,.pp-quick button,.pp-sfc button{transition:background .15s,color .15s,transform .08s ease}
.pp-onoff button:active,.pp-quick button:active,.pp-sfc button:active{transform:scale(.95)}
.pp-sfc button.pp-busy{opacity:.85;cursor:progress}
.pp-sfc button.pp-busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;
  vertical-align:-1px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;
  animation:pp-rot .7s linear infinite}

/* ---- scheduler widget ---- */
.pp-badge--idle{background:rgba(143,160,182,.16);color:#a7b4c6}
.pp-hero{display:flex;align-items:center;gap:12px;margin:6px 0 8px}
.pp-hero-main{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;background:rgba(255,255,255,.05);
  border-radius:14px;padding:8px 14px;min-width:96px}
.pp-hero-pct{font-size:34px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.03em;
  color:var(--pp-accent,#38aaff)}
.pp-hero-pct .u{font-size:15px;color:#8fa0b6;font-weight:700;margin-left:2px}
.pp-hero-k{font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:#8fa0b6;font-weight:700;margin-top:4px}
.pp-hero-side{flex:1 1 auto;display:flex;flex-direction:column;gap:5px;align-items:flex-start;min-width:0}
.pp-pill{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap}
.pp-pill--on{background:rgba(76,175,80,.16);color:#5ac36a}
.pp-pill--off{background:rgba(244,67,54,.16);color:#f0645a}
.pp-pill--sfc{background:rgba(56,170,255,.18);color:#59b6ff}
.pp-pill--muted{background:rgba(255,255,255,.06);color:#a7b4c6}
.pp-target{font-size:12px;color:#cdd7e4}
.pp-target b{color:#eef2f7;font-variant-numeric:tabular-nums}
.pp-chips{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 8px}
.pp-chip{font-size:10.5px;font-weight:700;letter-spacing:.02em;padding:3px 9px;border-radius:8px;
  background:rgba(255,255,255,.06);color:#cdd7e4}
.pp-chip--base{background:rgba(56,170,255,.14);color:#7cc2ff}
.pp-chip--night{background:rgba(126,120,255,.16);color:#9d97ff}
.pp-chip--raise{background:rgba(255,193,58,.16);color:#ffcf5a}
.pp-chip--hold{background:rgba(120,180,255,.14);color:#9fc6ff}
.pp-chip--warn{background:rgba(244,67,54,.18);color:#f0645a}
.pp-info{display:grid;grid-template-columns:1fr 1fr;gap:5px 12px;margin-bottom:8px}
.pp-info-i{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;
  border-bottom:1px solid rgba(255,255,255,.06);padding-bottom:3px;min-width:0}
.pp-info-i .k{color:#8fa0b6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pp-info-i .v{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.pp-note{font-size:10.5px;color:#8fa0b6;margin-top:8px;line-height:1.35}
.pp-onoff .pp-sfc-btn{background:#2b7fc0;color:#fff}
.pp-onoff .pp-sfc-btn.pp-active-sfc{background:#0f6fd6;box-shadow:0 0 10px rgba(56,170,255,.5)}
.pp-onoff .pp-sfc-btn:disabled{background:rgba(255,255,255,.10);color:#6b7a8d;cursor:not-allowed;box-shadow:none}
.pp-onoff .pp-sfc-btn.pp-busy{opacity:.85;cursor:progress}
.pp-onoff .pp-sfc-btn.pp-busy::after{content:"";display:inline-block;width:11px;height:11px;margin-left:8px;
  vertical-align:-1px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;
  animation:pp-rot .7s linear infinite}

@media (prefers-reduced-motion:reduce){.pp-spin,.pp-sfc button.pp-busy::after,.pp-onoff .pp-sfc-btn.pp-busy::after{animation:none}}
`;function k(){if(typeof document>"u"||document.getElementById("pp-pump-styles"))return;const p=document.createElement("style");p.id="pp-pump-styles",p.appendChild(document.createTextNode(v)),document.head.appendChild(p)}const d="pondpump";function b(p){return((p==null?void 0:p.instance)!==void 0&&p.instance!==""?String(p.instance):"0").split(".").pop()||"0"}function z(p){const t=p==null?void 0:p.pumpId;return t?`${d}.${b(p)}.pumps.${t}`:""}function _(p){const t=p==null?void 0:p.name;if(typeof t=="string")return t;if(t&&typeof t=="object"){const e=t;return e.en||Object.values(e)[0]||""}return""}async function M(p,t){try{const e=await p.getObject(t);return _((e==null?void 0:e.common)||{})}catch{return""}}async function S(p,t){const e=`${d}.${t}.pumps.`,n=`${e}香`;let s={};try{if(typeof p.getObjectViewSystem=="function")s=await p.getObjectViewSystem("device",e,n)||{};else if(typeof p.getObjectView=="function"){const a=await p.getObjectView("system","device",{startkey:e,endkey:n});for(const i of(a==null?void 0:a.rows)||[])s[i.id]=i.value}}catch{return[]}const r=[];for(const[a,i]of Object.entries(s)){if(!a.startsWith(e))continue;const c=a.substring(e.length);if(!c||c.includes("."))continue;const o=(i==null?void 0:i.common)||{};let l="";typeof o.name=="string"?l=o.name:o.name&&typeof o.name=="object"&&(l=o.name.en||Object.values(o.name)[0]||""),r.push({id:c,name:l.trim()||c})}return r.sort((a,i)=>a.name.localeCompare(i.name)),r}function P(p){const{socket:t,data:e,onDataChange:n,label:s}=p,[r,a]=m([]),i=b(e);h(()=>{let o=!0;return S(t,i).then(l=>o&&a(l)),()=>{o=!1}},[t,i]);const c=e.pumpId||"";return g(x,{fullWidth:!0,variant:"standard",size:"small",children:[f(w,{children:s}),f(y,{value:r.some(o=>o.id===c)?c:"",onChange:o=>n({...e,pumpId:o.target.value}),children:r.length?r.map(o=>f(u,{value:o.id,children:o.name},o.id)):f(u,{value:"",disabled:!0,children:"—"})})]})}function $(){return{name:"common",fields:[{name:"instance",type:"instance",label:"pondpump_instance",adapter:d,isShort:!0,default:"0"},{name:"pumpId",type:"custom",label:"pump",component:(p,t,e,n)=>f(P,{socket:n.context.socket,data:t,onDataChange:e,label:p.label||"pump"})}]}}class O extends window.visRxWidget{static adapter;subscribedIds=[];ppMounted=!1;tickTimer=null;tickMs=0;rpmAt100=0;applyPartial(t){this.setState(t)}constructor(t){super(t),this.state={...this.state,fv:{},tick:0}}componentDidMount(){super.componentDidMount(),this.ppMounted=!0,k(),this.subscribePump(),this.tickMs>0&&(this.tickTimer=setInterval(()=>this.ppMounted&&this.applyPartial(t=>({tick:t.tick+1})),this.tickMs))}componentWillUnmount(){this.ppMounted=!1,this.tickTimer&&(clearInterval(this.tickTimer),this.tickTimer=null),this.unsubscribePump(),super.componentWillUnmount()}onRxDataChanged(){this.subscribePump()}channel(){return z(this.state.rxData)}pumpIds(){const t=this.channel();return t?this.relIds().map(e=>`${t}.${e}`):[]}async subscribePump(){this.unsubscribePump();const t=this.pumpIds();if(!t.length){this.applyPartial(()=>({fv:{}}));return}this.subscribedIds=t;try{await this.props.context.socket.subscribeState(t,this.onPumpState)}catch{}for(const e of t)try{const n=await this.props.context.socket.getState(e);this.applyState(e,n)}catch{}}unsubscribePump(){if(this.subscribedIds.length){try{this.props.context.socket.unsubscribeState(this.subscribedIds,this.onPumpState)}catch{}this.subscribedIds=[]}}onPumpState=(t,e)=>{this.applyState(t,e)};applyState(t,e){if(!this.ppMounted)return;const n=this.channel(),s=n&&t.startsWith(`${n}.`)?t.substring(n.length+1):t;this.applyPartial(r=>({fv:{...r.fv,[s]:e?e.val:null}}))}write(t,e){const n=this.channel();n&&this.props.context.socket.setState(`${n}.${t}`,e,!1)}num(t){const e=this.state.fv[t];return e==null||e===""?null:Number(e)}str(t){const e=this.state.fv[t];return typeof e=="string"?e:""}bool(t){return this.state.fv[t]===!0}sfcActive(){const t=this.state.fv["control.sfc"];if(typeof t=="boolean")return t;const e=this.str("status.fcStatus").trim().toLowerCase();return e!==""&&!e.includes("off")&&!["0","inactive","none","aus","false"].includes(e)}actualSpeedPct(){const t=this.num("control.speed"),e=this.num("telemetry.speed");return!this.sfcActive()&&t!==null&&t>5&&e!==null&&e>0&&(this.rpmAt100=e/(t/100)),e!==null&&this.rpmAt100>0?Math.max(0,Math.min(100,e/this.rpmAt100*100)):t??0}}export{O as P,z as a,M as b,$ as p};
