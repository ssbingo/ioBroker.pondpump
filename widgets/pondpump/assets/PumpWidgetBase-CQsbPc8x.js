import{_ as d,a as b}from"./_virtual_mf___mfe_internal__pondpump__mf_owner__1__loadShare__react_mf_1_jsx_mf_2_runtime__loadShare__.js-Cia6Arx-.js";import{k as g,i as h}from"./_virtual_mf___mfe_internal__pondpump__mf_owner__1__loadShare__react__loadShare__.js-C3bH2rNL.js";import{_ as x,a as w,b as v,c as f}from"./_virtual_mf___mfe_internal__pondpump__mf_owner__1__loadShare___mf_0_mui_mf_1_material__loadShare__.js-0EPpg8Me.js";const y=`
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
.pp-stage svg{display:block;height:100%;width:auto;max-height:220px;max-width:100%}
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

@media (prefers-reduced-motion:reduce){.pp-spin,.pp-sfc button.pp-busy::after{animation:none}}
`;function k(){if(typeof document>"u"||document.getElementById("pp-pump-styles"))return;const n=document.createElement("style");n.id="pp-pump-styles",n.appendChild(document.createTextNode(y)),document.head.appendChild(n)}const l="pondpump";function m(n){return((n==null?void 0:n.instance)!==void 0&&n.instance!==""?String(n.instance):"0").split(".").pop()||"0"}function _(n){const t=n==null?void 0:n.pumpId;return t?`${l}.${m(n)}.pumps.${t}`:""}async function S(n,t){const e=`${l}.${t}.pumps.`,o=`${e}香`;let r={};try{if(typeof n.getObjectViewSystem=="function")r=await n.getObjectViewSystem("device",e,o)||{};else if(typeof n.getObjectView=="function"){const a=await n.getObjectView("system","device",{startkey:e,endkey:o});for(const i of(a==null?void 0:a.rows)||[])r[i.id]=i.value}}catch{return[]}const s=[];for(const[a,i]of Object.entries(r)){if(!a.startsWith(e))continue;const c=a.substring(e.length);if(!c||c.includes("."))continue;const p=(i==null?void 0:i.common)||{};let u="";typeof p.name=="string"?u=p.name:p.name&&typeof p.name=="object"&&(u=p.name.en||Object.values(p.name)[0]||""),s.push({id:c,name:u.trim()||c})}return s.sort((a,i)=>a.name.localeCompare(i.name)),s}function P(n){const{socket:t,data:e,onDataChange:o,label:r}=n,[s,a]=g([]),i=m(e);h(()=>{let p=!0;return S(t,i).then(u=>p&&a(u)),()=>{p=!1}},[t,i]);const c=e.pumpId||"";return b(x,{fullWidth:!0,variant:"standard",size:"small",children:[d(w,{children:r}),d(v,{value:s.some(p=>p.id===c)?c:"",onChange:p=>o({...e,pumpId:p.target.value}),children:s.length?s.map(p=>d(f,{value:p.id,children:p.name},p.id)):d(f,{value:"",disabled:!0,children:"—"})})]})}function C(){return{name:"common",fields:[{name:"instance",type:"instance",label:"pondpump_instance",adapter:l,isShort:!0,default:"0"},{name:"pumpId",type:"custom",label:"pump",component:(n,t,e,o)=>d(P,{socket:o.context.socket,data:t,onDataChange:e,label:n.label||"pump"})}]}}class $ extends window.visRxWidget{static adapter;subscribedIds=[];ppMounted=!1;tickTimer=null;tickMs=0;applyPartial(t){this.setState(t)}constructor(t){super(t),this.state={...this.state,fv:{},tick:0}}componentDidMount(){super.componentDidMount(),this.ppMounted=!0,k(),this.subscribePump(),this.tickMs>0&&(this.tickTimer=setInterval(()=>this.ppMounted&&this.applyPartial(t=>({tick:t.tick+1})),this.tickMs))}componentWillUnmount(){this.ppMounted=!1,this.tickTimer&&(clearInterval(this.tickTimer),this.tickTimer=null),this.unsubscribePump(),super.componentWillUnmount()}onRxDataChanged(){this.subscribePump()}channel(){return _(this.state.rxData)}pumpIds(){const t=this.channel();return t?this.relIds().map(e=>`${t}.${e}`):[]}async subscribePump(){this.unsubscribePump();const t=this.pumpIds();if(!t.length){this.applyPartial(()=>({fv:{}}));return}this.subscribedIds=t;try{await this.props.context.socket.subscribeState(t,this.onPumpState)}catch{}for(const e of t)try{const o=await this.props.context.socket.getState(e);this.applyState(e,o)}catch{}}unsubscribePump(){if(this.subscribedIds.length){try{this.props.context.socket.unsubscribeState(this.subscribedIds,this.onPumpState)}catch{}this.subscribedIds=[]}}onPumpState=(t,e)=>{this.applyState(t,e)};applyState(t,e){if(!this.ppMounted)return;const o=this.channel(),r=o&&t.startsWith(`${o}.`)?t.substring(o.length+1):t;this.applyPartial(s=>({fv:{...s.fv,[r]:e?e.val:null}}))}write(t,e){const o=this.channel();o&&this.props.context.socket.setState(`${o}.${t}`,e,!1)}num(t){const e=this.state.fv[t];return e==null||e===""?null:Number(e)}str(t){const e=this.state.fv[t];return typeof e=="string"?e:""}bool(t){return this.state.fv[t]===!0}}export{$ as P,_ as a,C as p};
