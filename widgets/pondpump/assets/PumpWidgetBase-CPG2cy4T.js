import{b as u,a as w}from"./_virtual_mf___mfe_internal__pondpump__mf_owner__169659973448624__loadShare__react_mf_1_jsx_mf_2_runtime__loadShare__.js-WvFV32sY.js";import{_ as z,a as A}from"./_virtual_mf___mfe_internal__pondpump__mf_owner__169659973448624__loadShare__react__loadShare__.js-DS23sZkI.js";import{a as I,b as P,c as j,d as v,e as M,f as b,g as O}from"./_virtual_mf___mfe_internal__pondpump__mf_owner__169659973448624__loadShare___mf_0_mui_mf_1_material__loadShare__.js-DOB9QSV2.js";import k from"./translations-8lhnQtWM.js";const $=`
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
.pp-stage--temp{gap:14px}
.pp-stage--temp .pp-graphic{flex:1 1 68%}
.pp-thermo{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:46px}
.pp-thermo-svg{display:block;height:auto;width:auto;max-height:74px;max-width:24px}
.pp-thermo-val{display:flex;align-items:baseline;gap:2px;font-variant-numeric:tabular-nums;line-height:1}
.pp-thermo-val .n{font-size:19px;font-weight:800;letter-spacing:-.02em}
.pp-thermo-val .u{font-size:10px;color:#8fa0b6;font-weight:600}
.pp-thermo-k{font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:#8fa0b6;font-weight:700}
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
.pp-hero{display:flex;align-items:center;gap:10px;margin:6px 0 8px}
.pp-mini-impeller{flex:0 0 auto;width:50px;height:50px;display:flex;align-items:center;justify-content:center}
.pp-mini-impeller svg{width:100%;height:100%;display:block}
/* actuator rows (icon — name — status wheel) */
.pp-actuators{display:flex;flex-direction:column;gap:4px;margin:2px 0 8px}
.pp-act{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.04);border-radius:8px;padding:4px 8px}
.pp-act-icon{flex:0 0 auto;width:22px;text-align:center;font-size:16px;line-height:1}
.pp-act-name{flex:1 1 auto;min-width:0;font-size:12px;font-weight:600;color:#dbe4ef;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pp-act-wheel{flex:0 0 auto;width:22px;height:22px;display:flex;align-items:center;justify-content:center}
.pp-act-wheel svg{width:100%;height:100%;display:block}
.pp-act-off{opacity:.7}
.pp-act-on{filter:drop-shadow(0 0 4px rgba(140,224,120,.55))}
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
`;function N(){if(typeof document>"u"||document.getElementById("pp-pump-styles"))return;const n=document.createElement("style");n.id="pp-pump-styles",n.appendChild(document.createTextNode($)),document.head.appendChild(n)}function x(n){const t=typeof window<"u"&&window.systemLang||"en",e=k[t],o=k.en;return(e==null?void 0:e[n])||(o==null?void 0:o[n])||n}const m="pondpump";function y(n){return((n==null?void 0:n.instance)!==void 0&&n.instance!==""?String(n.instance):"0").split(".").pop()||"0"}function D(n){const t=n==null?void 0:n.pumpId;return t?`${m}.${y(n)}.pumps.${t}`:""}function T(n){const t=n==null?void 0:n.name;if(typeof t=="string")return t;if(t&&typeof t=="object"){const e=t;return e.en||Object.values(e)[0]||""}return""}async function X(n,t){try{const e=await n.getObject(t);return T((e==null?void 0:e.common)||{})}catch{return""}}async function W(n,t){const e=`${m}.${t}.pumps.`,o=`${e}香`;let c={};try{if(typeof n.getObjectViewSystem=="function")c=await n.getObjectViewSystem("device",e,o)||{};else if(typeof n.getObjectView=="function"){const l=await n.getObjectView("system","device",{startkey:e,endkey:o});for(const r of(l==null?void 0:l.rows)||[])c[r.id]=r.value}}catch{return[]}const s=[];for(const[l,r]of Object.entries(c)){if(!l.startsWith(e))continue;const f=l.substring(e.length);if(!f||f.includes("."))continue;const p=(r==null?void 0:r.common)||{};let i="";typeof p.name=="string"?i=p.name:p.name&&typeof p.name=="object"&&(i=p.name.en||Object.values(p.name)[0]||""),s.push({id:f,name:i.trim()||f})}return s.sort((l,r)=>l.name.localeCompare(r.name)),s}function q(n){const{socket:t,data:e,onDataChange:o,label:c}=n,[s,l]=z([]),r=y(e);A(()=>{let p=!0;return W(t,r).then(i=>p&&l(i)),()=>{p=!1}},[t,r]);const f=e.pumpId||"";return w(I,{fullWidth:!0,variant:"standard",size:"small",children:[u(P,{children:c}),u(j,{value:s.some(p=>p.id===f)?f:"",onChange:p=>o({...e,pumpId:p.target.value}),children:s.length?s.map(p=>u(v,{value:p.id,children:p.name},p.id)):u(v,{value:"",disabled:!0,children:"—"})})]})}function Q(){return{name:"common",fields:[{name:"instance",type:"instance",label:"pondpump_instance",adapter:m,isShort:!0,default:"0"},{name:"pumpId",type:"custom",label:"pump",component:(n,t,e,o)=>u(q,{socket:o.context.socket,data:t,onDataChange:e,label:n.label||"pump"})}]}}function F(n,t){return n&&n.trim()||`#${t}`}function V(n){if(typeof n!="string"||!n.trim())return new Set;try{const t=JSON.parse(n);return new Set(Array.isArray(t)?t.filter(e=>typeof e=="string"):[])}catch{return new Set}}const E="#a6e77d",U="#6b7669";function J(n){if(typeof n!="string"||!n.trim())return{};try{const t=JSON.parse(n);return t&&typeof t=="object"&&!Array.isArray(t)?t:{}}catch{return{}}}function _(n,t,e){const o=n[t];return(e?o==null?void 0:o.on:o==null?void 0:o.off)||(e?E:U)}async function L(n,t,e){var o,c;if(!e)return[];try{const s=await n.getObject(`system.adapter.${m}.${t}`),r=((c=(o=((s==null?void 0:s.native)??{}).schedules)==null?void 0:o[e])==null?void 0:c.plans)??[],f=[];let p=0;for(const i of r){if((i==null?void 0:i.mode)!=="actuator")continue;p+=1;const h=typeof i.target=="string"?i.target:"",a=(typeof i.actuatorName=="string"?i.actuatorName:"").trim()||`Aktor ${p}`,d=typeof i.actuatorIcon=="string"&&i.actuatorIcon?i.actuatorIcon:"⚙️";f.push({key:F(h,p),name:a,icon:d})}return f}catch{return[]}}function S(n){return u("input",{type:"color",title:n.title,"aria-label":n.title,value:n.value,onChange:t=>n.onChange(t.target.value),style:{width:26,height:22,padding:0,border:"none",background:"none",cursor:"pointer"}})}function R(n){const{socket:t,data:e,onDataChange:o}=n,[c,s]=z([]),l=y(e),r=e.pumpId||"";A(()=>{let a=!0;return L(t,l,r).then(d=>a&&s(d)),()=>{a=!1}},[t,l,r]);const f=V(e.hiddenActuators),p=J(e.actuatorColors),i=(a,d)=>{const g=new Set(f);d?g.delete(a):g.add(a),o({...e,hiddenActuators:JSON.stringify([...g])})},h=(a,d,g)=>{const C={...p,[a]:{...p[a],[d]:g}};o({...e,actuatorColors:JSON.stringify(C)})};return c.length?u(b,{sx:{display:"flex",flexDirection:"column",gap:.25},children:c.map(a=>w(b,{sx:{display:"flex",alignItems:"center",gap:.5},children:[u(O,{size:"small",sx:{p:.5},checked:!f.has(a.key),onChange:d=>i(a.key,d.target.checked)}),w(b,{sx:{flex:1,minWidth:0,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:[a.icon," ",a.name]}),u(S,{title:x("act_color_on"),value:_(p,a.key,!0),onChange:d=>h(a.key,"on",d)}),u(S,{title:x("act_color_off"),value:_(p,a.key,!1),onChange:d=>h(a.key,"off",d)})]},a.key))}):u(M,{sx:{fontSize:12,color:"text.secondary"},children:x("no_actuators")})}function Y(){return{name:"hiddenActuators",type:"custom",label:"actuators_visibility",component:(n,t,e,o)=>u(R,{socket:o.context.socket,data:t,onDataChange:e})}}class Z extends window.visRxWidget{static adapter;subscribedIds=[];ppMounted=!1;tickTimer=null;tickMs=0;rpmAt100=0;applyPartial(t){this.setState(t)}constructor(t){super(t),this.state={...this.state,fv:{},tick:0}}componentDidMount(){super.componentDidMount(),this.ppMounted=!0,N(),this.subscribePump(),this.tickMs>0&&(this.tickTimer=setInterval(()=>this.ppMounted&&this.applyPartial(t=>({tick:t.tick+1})),this.tickMs))}componentWillUnmount(){this.ppMounted=!1,this.tickTimer&&(clearInterval(this.tickTimer),this.tickTimer=null),this.unsubscribePump(),super.componentWillUnmount()}onRxDataChanged(){this.subscribePump()}channel(){return D(this.state.rxData)}pumpIds(){const t=this.channel();return t?this.relIds().map(e=>`${t}.${e}`):[]}async subscribePump(){this.unsubscribePump();const t=this.pumpIds();if(!t.length){this.applyPartial(()=>({fv:{}}));return}this.subscribedIds=t;for(const e of t)try{const o=await this.props.context.socket.getState(e);this.applyState(e,o)}catch{}for(const e of t)try{await this.props.context.socket.subscribeState(e,this.onPumpState)}catch{}}unsubscribePump(){if(this.subscribedIds.length){for(const t of this.subscribedIds)try{this.props.context.socket.unsubscribeState(t,this.onPumpState)}catch{}this.subscribedIds=[]}}onPumpState=(t,e)=>{this.applyState(t,e)};applyState(t,e){if(!this.ppMounted)return;const o=this.channel(),c=o&&t.startsWith(`${o}.`)?t.substring(o.length+1):t;this.applyPartial(s=>({fv:{...s.fv,[c]:e?e.val:null}}))}write(t,e){const o=this.channel();o&&this.props.context.socket.setState(`${o}.${t}`,e,!1)}num(t){const e=this.state.fv[t];return e==null||e===""?null:Number(e)}str(t){const e=this.state.fv[t];return typeof e=="string"?e:""}bool(t){return this.state.fv[t]===!0}sfcActive(){const t=this.state.fv["control.sfc"];if(typeof t=="boolean")return t;const e=this.str("status.fcStatus").trim().toLowerCase();return e!==""&&!e.includes("off")&&!["0","inactive","none","aus","false"].includes(e)}actualSpeedPct(){const t=this.num("control.speed"),e=this.num("telemetry.speed");return!this.sfcActive()&&t!==null&&t>5&&e!==null&&e>0&&(this.rpmAt100=e/(t/100)),e!==null&&this.rpmAt100>0?Math.max(0,Math.min(100,e/this.rpmAt100*100)):t??0}spinDuration(){const t=this.actualSpeedPct(),e=Math.round(Math.max(0,Math.min(100,t))/10)*10;if(e<=0)return 0;const o=5;return Math.round(o*Math.pow(.25/o,e/100)*100)/100}}export{Z as P,D as a,Y as b,X as c,J as d,F as e,_ as f,V as h,Q as p};
