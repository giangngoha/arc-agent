"use client";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import Script from "next/script";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Agent {
  id: string; owner: string; name: string; description: string;
  type: string; caps: string[]; price: number;
  reputation: number; reviews: number; verified: boolean;
  icon: string; color: string; bg: string;
}
type ModalState =
  | "closed" | "wallet"
  | "deploy-1" | "deploy-2" | "deploying" | "deploy-done" | "deploy-err"
  | "hire-1" | "hiring" | "hire-done";

// ─── Constants ────────────────────────────────────────────────────────────────
const ARC_CHAIN = {
  chainId: "0x4CEF52", // 5042002
  chainName: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: ["https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://testnet.arcscan.app"],
};
const ARC_CHAIN_ID_DEC = 5042002;

// Arc Testnet contract addresses
const ID_ADDR   = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const REP_ADDR  = "0x8004B663056A597Dffe9eCcC1965A193B7388713";

// USDC on Arc Testnet — native gas token, use standard ERC-20 ABI for transfers
// Arc uses USDC as the gas token; address below is the canonical USDC on Arc Testnet
const USDC_ADDR = "0xf2298b9b79A0Cb4a24E671A3e4B84AaA8d29C37";

const ID_ABI = [
  "function register(string metadataURI) external",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const USDC_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function approve(address spender, uint256 amount) external returns (bool)",
];

const CAPS_LIST = ["Arbitrage Detection","Yield Farming","NFT Monitoring",
  "Liquidity Management","Risk Management","Cross-Chain Bridge",
  "Auto Rebalance","Price Monitoring","Portfolio Hedge","Fee Optimization"];

const TYPE_ICONS:  Record<string,string> = {trading:"◈",yield:"⬡",nft:"◆",liquidity:"◉",risk:"◎",bridge:"⬢"};
const TYPE_COLORS: Record<string,string> = {trading:"#00e5ff",yield:"#00ffa3",nft:"#a855f7",liquidity:"#ffb700",risk:"#ff3d6b",bridge:"#38bdf8"};

// Seed agents shown while loading from chain
const SEED_AGENTS: Agent[] = [
  {id:"1",owner:"0x0000000000000000000000000000000000000001",name:"DeFi Arbitrage Agent",description:"Autonomous trading agent for cross-DEX arbitrage on Arc. Monitors price discrepancies and executes trades within milliseconds.",type:"trading",caps:["Arbitrage Detection","Liquidity Monitoring","Auto Execution"],price:25,reputation:94,reviews:127,verified:true,icon:"◈",color:"#00e5ff",bg:"rgba(0,229,255,.08)"},
  {id:"2",owner:"0x0000000000000000000000000000000000000002",name:"Yield Optimizer Pro",description:"Automatically rebalances yield farming positions to maximize APY while managing risk and reducing impermanent loss.",type:"yield",caps:["Yield Farming","Auto Rebalance","Risk Management"],price:15,reputation:88,reviews:84,verified:true,icon:"⬡",color:"#00ffa3",bg:"rgba(0,255,163,.08)"},
  {id:"3",owner:"0x0000000000000000000000000000000000000003",name:"NFT Sniper Bot",description:"Monitors NFT marketplaces for undervalued listings based on rarity scores and floor price analysis.",type:"nft",caps:["NFT Monitoring","Rarity Analysis","Floor Tracking"],price:10,reputation:76,reviews:42,verified:true,icon:"◆",color:"#a855f7",bg:"rgba(168,85,247,.08)"},
  {id:"4",owner:"0x0000000000000000000000000000000000000004",name:"Liquidity Guardian",description:"Manages concentrated liquidity positions in AMM pools. Adjusts ranges to maximize fee collection.",type:"liquidity",caps:["Range Management","Fee Collection","IL Control"],price:35,reputation:97,reviews:203,verified:true,icon:"◉",color:"#ffb700",bg:"rgba(255,183,0,.08)"},
  {id:"5",owner:"0x0000000000000000000000000000000000000005",name:"Risk Sentinel",description:"Monitors wallet exposure around the clock and automatically hedges positions when risk thresholds are breached.",type:"risk",caps:["Risk Monitoring","Auto Hedge","Alert System"],price:20,reputation:91,reviews:156,verified:true,icon:"◎",color:"#ff3d6b",bg:"rgba(255,61,107,.08)"},
  {id:"6",owner:"0x0000000000000000000000000000000000000006",name:"Cross-Chain Bridge Scout",description:"Finds the cheapest bridge routes, executing multi-hop transfers to minimize fees and slippage on Arc.",type:"bridge",caps:["Route Optimization","Multi-Hop","Fee Comparison"],price:8,reputation:65,reviews:18,verified:false,icon:"⬢",color:"#38bdf8",bg:"rgba(56,189,248,.08)"},
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep  = (ms: number) => new Promise(r => setTimeout(r, ms));
const rh     = (n: number)  => Array.from({length:n},()=>Math.floor(Math.random()*16).toString(16)).join("");
const short  = (a: string)  => a.slice(0,6)+"…"+a.slice(-4);

// Decode base64 data URI metadata safely
function decodeMetadata(uri: string): Partial<Agent> {
  try {
    if (uri.startsWith("data:application/json;base64,")) {
      const json = atob(uri.replace("data:application/json;base64,",""));
      return JSON.parse(json);
    }
    if (uri.startsWith("data:application/json,")) {
      return JSON.parse(decodeURIComponent(uri.replace("data:application/json,","")));
    }
  } catch(_) {}
  return {};
}

function agentFromChainData(id: string, owner: string, uri: string): Agent {
  const meta = decodeMetadata(uri);
  const type = (meta as {agent_type?:string}).agent_type || "trading";
  return {
    id,
    owner,
    name:        (meta as {name?:string}).name        || `Agent #${id}`,
    description: (meta as {description?:string}).description || "Onchain AI agent registered via ERC-8004.",
    type,
    caps:        (meta as {capabilities?:string[]}).capabilities || [],
    price:       (meta as {price_usdc?:number}).price_usdc || 0,
    reputation:  0,
    reviews:     0,
    verified:    false,
    icon:        TYPE_ICONS[type]  || "◈",
    color:       TYPE_COLORS[type] || "#00e5ff",
    bg:          `rgba(0,229,255,.08)`,
  };
}

function ReputationRing({ score }: { score: number }) {
  const r = 22, c = 2*Math.PI*r;
  const col = score>=90?"#00ffa3":score>=70?"#00e5ff":score>=50?"#ffb700":"#ff3d6b";
  return (
    <div style={{position:"relative",width:54,height:54,flexShrink:0}}>
      <svg viewBox="0 0 54 54" style={{width:"100%",height:"100%",transform:"rotate(-90deg)"}}>
        <circle cx="27" cy="27" r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="3"/>
        {score>0&&<circle cx="27" cy="27" r={r} fill="none" stroke={col} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c*(1-score/100)}
          style={{filter:`drop-shadow(0 0 5px ${col}88)`}}/>}
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:13,fontWeight:800,color:score>0?col:"var(--muted)"}}>
        {score||"—"}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scrolled,     setScrolled]     = useState(false);
  const [agents,       setAgents]       = useState<Agent[]>(SEED_AGENTS);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainLoaded,  setChainLoaded]  = useState(false);
  const [modal,        setModal]        = useState<ModalState>("closed");
  const [search,       setSearch]       = useState("");
  const [sortBy,       setSortBy]       = useState("reputation");
  const [typeFilter,   setTypeFilter]   = useState("all");
  const [ethersReady,  setEthersReady]  = useState(false);

  // Wallet
  const [walletAddr, setWalletAddr] = useState<string|null>(null);
  const [isDemo,     setIsDemo]     = useState(false);
  const signerRef   = useRef<unknown>(null);

  // Deploy
  const [dName,  setDName]  = useState("");
  const [dType,  setDType]  = useState("");
  const [dDesc,  setDDesc]  = useState("");
  const [dPrice, setDPrice] = useState("");
  const [dCaps,  setDCaps]  = useState<string[]>([]);
  const [deployResult, setDeployResult] = useState<{tx:string;agentId:string}|null>(null);
  const [deployError,  setDeployError]  = useState("");

  // Hire
  const [hireAgent, setHireAgent] = useState<Agent|null>(null);
  const [hireJob,   setHireJob]   = useState("");
  const [hireTx,    setHireTx]    = useState("");
  const [hireError, setHireError] = useState("");

  // Toast
  const [toast, setToast] = useState<{msg:string;type:string}|null>(null);
  const showToast = useCallback((msg:string,type="info")=>{
    setToast({msg,type}); setTimeout(()=>setToast(null),4000);
  },[]);

  const pendingRef = useRef<(()=>void)|null>(null);

  // ── Particle canvas ──────────────────────────────────────────────────────
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext("2d")!;
    let raf=0;
    const resize=()=>{canvas.width=innerWidth;canvas.height=innerHeight;};
    resize(); window.addEventListener("resize",resize);
    const pts=Array.from({length:50},()=>({
      x:Math.random()*innerWidth,y:Math.random()*innerHeight,
      vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:Math.random()*1.2+.4
    }));
    function loop(){
      ctx.clearRect(0,0,canvas!.width,canvas!.height);
      for(let i=0;i<pts.length;i++){
        for(let j=i+1;j<pts.length;j++){
          const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);
          if(d<130){ctx.beginPath();ctx.strokeStyle=`rgba(0,229,255,${(1-d/130)*.1})`;ctx.lineWidth=.5;ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.stroke();}
        }
        ctx.beginPath();ctx.arc(pts[i].x,pts[i].y,pts[i].r,0,Math.PI*2);ctx.fillStyle="rgba(0,229,255,.3)";ctx.fill();
        pts[i].x+=pts[i].vx;pts[i].y+=pts[i].vy;
        if(pts[i].x<0||pts[i].x>canvas!.width)pts[i].vx*=-1;
        if(pts[i].y<0||pts[i].y>canvas!.height)pts[i].vy*=-1;
      }
      raf=requestAnimationFrame(loop);
    }
    loop();
    const onScroll=()=>setScrolled(window.scrollY>30);
    window.addEventListener("scroll",onScroll,{passive:true});
    return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",resize);window.removeEventListener("scroll",onScroll);};
  },[]);

  // ── Load real agents from blockchain ─────────────────────────────────────
  const loadChainAgents = useCallback(async()=>{
  if(!ethersReady||chainLoaded||chainLoading) return;
  setChainLoading(true);
  try{
    const E = (window as unknown as {ethers:{
      JsonRpcProvider:new(url:string)=>unknown;
      Contract:new(a:string,b:string[],p:unknown)=>unknown;
    }}).ethers;

    const provider = new E.JsonRpcProvider("https://rpc.testnet.arc.network");

    // Lấy block hiện tại
    const latestBlock = await (provider as {getBlockNumber:()=>Promise<number>}).getBlockNumber();
    // Chỉ quét 10000 block gần nhất (giới hạn RPC của Arc)
    const fromBlock = Math.max(0, latestBlock - 10000);

    const contract = new E.Contract(ID_ADDR, ID_ABI, provider);

    // Dùng queryFilter thay vì getLogs thủ công — đơn giản và ít lỗi hơn
    const filter = {
      address: ID_ADDR,
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer topic
        "0x0000000000000000000000000000000000000000000000000000000000000000", // from zero = mint
      ],
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: "latest",
    };

    const logs = await (provider as {getLogs:(f:unknown)=>Promise<{topics:string[]}[]>}).getLogs(filter);

    if(!logs.length){
      setChainLoading(false);
      setChainLoaded(true);
      return;
    }

    const chainAgents: Agent[] = [];
    // Lấy tối đa 20 agent gần nhất
    for(const log of logs.slice(-20)){
      try{
        const tokenId = BigInt(log.topics[3]).toString();
        const [owner, uri] = await Promise.all([
          (contract as {ownerOf:(id:string)=>Promise<string>}).ownerOf(tokenId),
          (contract as {tokenURI:(id:string)=>Promise<string>}).tokenURI(tokenId),
        ]);
        chainAgents.push(agentFromChainData(tokenId, owner, uri));
      }catch(_){ continue; }
    }

    if(chainAgents.length > 0){
      setAgents(prev=>{
        const chainIds = new Set(chainAgents.map(a=>a.id));
        const seedOnly = SEED_AGENTS.filter(a=>!chainIds.has(a.id));
        return [...chainAgents, ...seedOnly];
      });
    }
    setChainLoaded(true);
  }catch(e){
    console.warn("Chain load error:", e);
    // Không throw — fallback về seed data
  }finally{
    setChainLoading(false);
  }
},[ethersReady, chainLoaded, chainLoading]);

  useEffect(()=>{ loadChainAgents(); },[loadChainAgents]);

  // ── Filter ───────────────────────────────────────────────────────────────
  const filtered = useMemo(()=>{
    return [...agents]
      .filter(a=>(typeFilter==="all"||a.type===typeFilter)&&
        (!search||a.name.toLowerCase().includes(search.toLowerCase())||
         a.description.toLowerCase().includes(search.toLowerCase())||
         a.caps.some(c=>c.toLowerCase().includes(search.toLowerCase()))))
      .sort((a,b)=>
        sortBy==="reputation"?b.reputation-a.reputation:
        sortBy==="price-asc"?a.price-b.price:
        sortBy==="price-desc"?b.price-a.price:
        b.reviews-a.reviews);
  },[agents,typeFilter,search,sortBy]);

  // ── Wallet ───────────────────────────────────────────────────────────────
  function needWallet(fn:()=>void){ if(walletAddr){fn();return;} pendingRef.current=fn; setModal("wallet"); }

  async function connectMM(){
    const eth=(window as unknown as {ethereum?:unknown}).ethereum;
    if(!eth){showToast("MetaMask not found — install it first","err");return;}
    try{
      await (eth as {request:(a:unknown)=>Promise<unknown>}).request({method:"eth_requestAccounts"});

      // Add Arc Testnet
      try{
        await (eth as {request:(a:unknown)=>Promise<unknown>}).request({
          method:"wallet_addEthereumChain",params:[ARC_CHAIN]
        });
      }catch(_){}

      // Switch to Arc Testnet
      try{
        await (eth as {request:(a:unknown)=>Promise<unknown>}).request({
          method:"wallet_switchEthereumChain",params:[{chainId:ARC_CHAIN.chainId}]
        });
      }catch(switchErr){
        showToast("Please switch to Arc Testnet in MetaMask","err"); return;
      }

      // Verify chain ID
      const chainId = await (eth as {request:(a:unknown)=>Promise<string>}).request({method:"eth_chainId"});
      const chainIdDec = parseInt(chainId as string, 16);
      if(chainIdDec !== ARC_CHAIN_ID_DEC){
        showToast(`Wrong network (chainId ${chainIdDec}). Please switch to Arc Testnet manually.`,"err");
        return;
      }

      const E = (window as unknown as {ethers:{BrowserProvider:new(p:unknown)=>unknown}}).ethers;
      const prov = new E.BrowserProvider(eth);
      const sgn  = await (prov as {getSigner:()=>Promise<unknown>}).getSigner();
      const addr = await (sgn as {getAddress:()=>Promise<string>}).getAddress();
      signerRef.current = sgn;
      setWalletAddr(addr); setIsDemo(false); setModal("closed");
      showToast("Connected to Arc Testnet ✓","ok");
      if(pendingRef.current){pendingRef.current();pendingRef.current=null;}
    }catch(_){showToast("Connection rejected","err");}
  }

  function disconnect(){
    signerRef.current=null; setWalletAddr(null); setIsDemo(false);
    showToast("Wallet disconnected","info");
  }

  function connectDemo(){
    setWalletAddr("0xDemo"+rh(36)); setIsDemo(true); setModal("closed");
    showToast("Demo mode — transactions are simulated","warn");
    if(pendingRef.current){pendingRef.current();pendingRef.current=null;}
  }

  // ── Deploy ───────────────────────────────────────────────────────────────
  function openDeploy(){ needWallet(()=>{resetDeploy();setModal("deploy-1");}); }
  function resetDeploy(){ setDName("");setDType("");setDDesc("");setDPrice("");setDCaps([]);setDeployResult(null);setDeployError(""); }
  function toggleCap(c:string){ setDCaps(prev=>prev.includes(c)?prev.filter(x=>x!==c):[...prev,c]); }

  function toDeploy2(){
    if(!dName.trim()){showToast("Enter an agent name","err");return;}
    if(!dType){showToast("Select an agent type","err");return;}
    if(!dDesc.trim()){showToast("Enter a description","err");return;}
    setModal("deploy-2");
  }

  async function execDeploy(){
    setModal("deploying");
    try{
      const meta = {
        name:dName, description:dDesc, agent_type:dType,
        capabilities:dCaps, price_usdc:Number(dPrice)||0,
        version:"1.0.0", owner:walletAddr,
        registered_at:new Date().toISOString(),
      };
      const uri = "data:application/json;base64,"+btoa(unescape(encodeURIComponent(JSON.stringify(meta))));

      let txHash = "0x"+rh(64);
      let agentId = String(Math.floor(Math.random()*9000)+1000);

      if(!isDemo){
        const E = (window as unknown as {ethers:{Contract:new(a:string,b:string[],s:unknown)=>unknown}}).ethers;
        const contract = new E.Contract(ID_ADDR, ID_ABI, signerRef.current);
        const tx = await (contract as {register:(u:string)=>Promise<{hash:string;wait:()=>Promise<{logs:{topics:string[]}[]}>}>}).register(uri);
        txHash = tx.hash;
        const receipt = await tx.wait();
        // Extract agent ID from Transfer event (topic[3] = tokenId)
        for(const log of receipt.logs){
          if(log.topics && log.topics[3]){
            try{ agentId = String(parseInt(log.topics[3],16)); break; }catch(_){}
          }
        }
      } else {
        await sleep(2200);
      }

      // Add to local state immediately (persists until page reload)
      const newAgent: Agent = {
        id:agentId, owner:walletAddr!, name:dName, description:dDesc,
        type:dType, caps:dCaps, price:Number(dPrice)||0,
        reputation:0, reviews:0, verified:false,
        icon:TYPE_ICONS[dType]||"◈", color:TYPE_COLORS[dType]||"#00e5ff",
        bg:`rgba(0,229,255,.08)`,
      };
      setAgents(prev=>[newAgent,...prev]);
      setDeployResult({tx:txHash, agentId});
      setModal("deploy-done");
      showToast("Agent deployed onchain ✓","ok");
    }catch(e:unknown){
      setDeployError((e as {message?:string}).message||"Transaction rejected.");
      setModal("deploy-err");
    }
  }

  // ── Hire (real USDC transfer) ─────────────────────────────────────────────
  function openHire(a:Agent){ needWallet(()=>{setHireAgent(a);setHireJob("");setHireTx("");setHireError("");setModal("hire-1");}); }

  async function execHire(){
  if(!hireAgent) return;
  setModal("hiring");
  try{
    let txHash = "0x"+rh(64);

    // Kiểm tra địa chỉ hợp lệ — không phải zero address hoặc seed address
    const isRealAddress = (addr: string) => {
      const lower = addr.toLowerCase();
      // Loại trừ seed agents (0x000...001 đến 0x000...00f) và demo
      if(lower.startsWith("0xdemo")) return false;
      if(/^0x0{38}[0-9a-f]{2}$/.test(lower)) return false;
      return addr.length === 42;
    };

    if(!isDemo && isRealAddress(hireAgent.owner)){
      const E = (window as unknown as {ethers:{
        Contract:new(a:string,b:string[],s:unknown)=>unknown;
        parseUnits:(v:string,d:number)=>bigint;
        getAddress:(a:string)=>string;
      }}).ethers;

      const usdcContract = new E.Contract(USDC_ADDR, USDC_ABI, signerRef.current);
      const totalUsdc = hireAgent.price * 1.02;

      let decimals = 6;
      try{
        decimals = await (usdcContract as {decimals:()=>Promise<number>}).decimals();
      }catch(_){}

      const amount = E.parseUnits(totalUsdc.toFixed(decimals), decimals);
      const toAddr = E.getAddress(hireAgent.owner);

      const tx = await (usdcContract as {
        transfer:(to:string,amt:bigint)=>Promise<{hash:string;wait:()=>Promise<unknown>}>
      }).transfer(toAddr, amount);

      txHash = tx.hash;
      await tx.wait();

    } else {
      // Seed agents hoặc demo — simulate
      await sleep(2000);
    }

    setHireTx(txHash);
    setModal("hire-done");
    setAgents(prev=>prev.map(a=>a.id===hireAgent.id?{...a,reviews:a.reviews+1}:a));

  }catch(e:unknown){
    const msg = (e as {message?:string}).message || "Transaction rejected.";
    setHireError(msg);
    setModal("hire-1");
    showToast("Payment failed: "+msg,"err");
  }
}

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function closeModal(){ if(modal==="deploying"||modal==="hiring") return; setModal("closed"); }
  function copyAddr(addr:string, el:HTMLElement){
    navigator.clipboard.writeText(addr);
    const span=el.querySelector(".adr") as HTMLElement;
    if(span){const o=span.textContent;span.textContent="Copied!";setTimeout(()=>span.textContent=o,1500);}
  }

  const toastColors:{[k:string]:string} = {ok:"var(--green)",err:"var(--red)",warn:"var(--amber)",info:"var(--cyan)"};

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.umd.min.js"
        onLoad={()=>setEthersReady(true)}
        strategy="beforeInteractive"
      />

      <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"'Outfit',sans-serif",position:"relative"}}>
        <canvas ref={canvasRef} style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,opacity:.6}}/>
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:1,backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='.03'/%3E%3C/svg%3E")`,backgroundSize:"300px"}}/>
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:1,backgroundImage:"linear-gradient(rgba(0,229,255,.016) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.016) 1px,transparent 1px)",backgroundSize:"60px 60px"}}/>

        <div style={{position:"relative",zIndex:2}}>

          {/* ── HEADER ─────────────────────────────────────────────────── */}
          <header style={{position:"sticky",top:0,zIndex:100,height:64,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 32px",borderBottom:`1px solid ${scrolled?"var(--border)":"transparent"}`,background:scrolled?"rgba(3,6,15,.9)":"transparent",backdropFilter:scrolled?"blur(20px)":"none",transition:"all .3s"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
                <polygon points="17,2 30,9.5 30,24.5 17,32 4,24.5 4,9.5" stroke="#00e5ff" strokeWidth="1.5" fill="rgba(0,229,255,.07)"/>
                <polygon points="17,9 24,13 24,21 17,25 10,21 10,13" fill="rgba(0,229,255,.15)"/>
                <circle cx="17" cy="17" r="3" fill="#00e5ff" opacity=".9"/>
              </svg>
              <span style={{fontSize:18,fontWeight:800,color:"#fff",letterSpacing:"-.5px"}}>Arc<span style={{color:"var(--cyan)"}}>Agents</span></span>
            </div>

            <nav style={{display:"flex",gap:4}}>
              {[["#marketplace","Marketplace"],["https://docs.arc.network","Docs"],["https://testnet.arcscan.app","Explorer"]].map(([h,l])=>(
                <a key={l} href={h} target={h.startsWith("http")?"_blank":undefined}
                  style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,letterSpacing:".06em",textTransform:"uppercase",color:"var(--muted)",textDecoration:"none",padding:"6px 14px",borderRadius:6,transition:"color .2s"}}
                  onMouseEnter={e=>(e.currentTarget.style.color="var(--text)")}
                  onMouseLeave={e=>(e.currentTarget.style.color="var(--muted)")}>{l}</a>
              ))}
            </nav>

            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <Btn variant="grad" onClick={openDeploy} style={{fontSize:11,padding:"9px 18px",display:"flex",alignItems:"center",gap:6}}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                Deploy Agent
              </Btn>

              {walletAddr ? (
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:700,padding:"9px 14px",borderRadius:10,border:"1px solid var(--green)",background:"rgba(0,255,163,.06)",color:"var(--green)"}}>
                    <span style={{width:7,height:7,borderRadius:"50%",background:"var(--green)",animation:"pdot 2s infinite",display:"inline-block"}}/>
                    {isDemo?"DEMO":short(walletAddr)}
                  </div>
                  <button onClick={disconnect}
                    title="Disconnect wallet"
                    style={{width:34,height:34,borderRadius:8,border:"1px solid var(--border2)",background:"var(--surface)",color:"var(--muted)",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="var(--red)";(e.currentTarget as HTMLElement).style.color="var(--red)";}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="var(--border2)";(e.currentTarget as HTMLElement).style.color="var(--muted)";}}>
                    ⏻
                  </button>
                </div>
              ) : (
                <Btn variant="wallet" onClick={()=>setModal("wallet")}>
                  <span style={{width:7,height:7,borderRadius:"50%",background:"currentColor",animation:"pdot 2s infinite",display:"inline-block",marginRight:6}}/>
                  Connect Wallet
                </Btn>
              )}
            </div>
          </header>

          {/* ── HERO ───────────────────────────────────────────────────── */}
          <section style={{minHeight:"90vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"80px 32px 60px",textAlign:"center",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-100,left:"50%",transform:"translateX(-50%)",width:800,height:500,background:"radial-gradient(ellipse,rgba(0,229,255,.07) 0%,transparent 65%)",pointerEvents:"none"}}/>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:100,padding:"6px 16px",fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--muted2)",marginBottom:32,letterSpacing:".05em"}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:"var(--green)",animation:"pdot 1.5s infinite",display:"inline-block"}}/>
              LIVE ON ARC TESTNET · ERC-8004
            </div>
            <h1 style={{fontSize:"clamp(40px,7vw,86px)",fontWeight:900,lineHeight:1.02,letterSpacing:-2,color:"#fff",marginBottom:8}}>
              <span style={{background:"linear-gradient(110deg,var(--cyan),var(--green))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>AI Agents</span>
              <br/><span style={{color:"var(--muted2)",fontWeight:300}}>with Onchain</span> Reputation
            </h1>
            <p style={{maxWidth:520,fontSize:16,color:"var(--muted2)",lineHeight:1.65,margin:"24px auto 40px"}}>
              Every agent carries a <strong style={{color:"var(--text)"}}>verified onchain identity</strong> via ERC-8004.
              Browse reputation scores, validate credentials, and pay with <strong style={{color:"var(--text)"}}>USDC</strong> — all on Arc Network.
            </p>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center",marginBottom:56}}>
              <Btn variant="grad" onClick={()=>document.getElementById("marketplace")?.scrollIntoView({behavior:"smooth"})}>Browse Agents</Btn>
              <Btn variant="outline" onClick={openDeploy}>Deploy Your Agent →</Btn>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:8}}>
              {[["Identity","0x8004A818BFB912233c491871b3d84c89A494BD9e","0x8004A818…4BD9e"],
                ["Reputation","0x8004B663056A597Dffe9eCcC1965A193B7388713","0x8004B663…8713"],
                ["Validation","0x8004Cb1BF31DAf7788923b405b754f57acEB4272","0x8004Cb1B…4272"]].map(([lbl,full,display])=>(
                <div key={lbl} onClick={e=>copyAddr(full,e.currentTarget)}
                  style={{display:"flex",alignItems:"center",gap:8,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:8,padding:"7px 14px",fontFamily:"'JetBrains Mono',monospace",fontSize:10,cursor:"pointer"}}>
                  <span style={{color:"var(--muted)"}}>{lbl}</span>
                  <span className="adr" style={{color:"var(--cyan)"}}>{display}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── STATS ──────────────────────────────────────────────────── */}
          <div style={{borderTop:"1px solid var(--border)",borderBottom:"1px solid var(--border)",background:"rgba(8,14,30,.6)"}}>
            <div style={{maxWidth:1200,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)"}}>
              {[
                [agents.length.toString(),"Registered Agents"],
                [agents.filter(a=>a.verified).length.toString(),"KYC Verified"],
                [chainLoading?"…":"Live on Arc","Chain Status"],
                [agents.reduce((s,a)=>s+a.reviews,0).toString(),"Total Reviews"],
              ].map(([v,l],i)=>(
                <div key={l} style={{padding:"20px 32px",textAlign:"center",borderRight:i<3?"1px solid var(--border)":"none"}}>
                  <span style={{fontSize:28,fontWeight:800,color:"#fff",letterSpacing:-1,display:"block"}}>{v}</span>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,letterSpacing:".1em",textTransform:"uppercase",color:"var(--muted)",marginTop:2,display:"block"}}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── MARKETPLACE ────────────────────────────────────────────── */}
          <section id="marketplace" style={{maxWidth:1200,margin:"0 auto",padding:"64px 32px"}}>
            <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:32,flexWrap:"wrap",gap:16}}>
              <div>
                <h2 style={{fontSize:28,fontWeight:800,color:"#fff",letterSpacing:-1}}>Agent Registry</h2>
                {chainLoading&&<p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--amber)",marginTop:4}}>⟳ Loading agents from blockchain…</p>}
                {chainLoaded&&<p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--green)",marginTop:4}}>✓ Live data from Arc Testnet</p>}
              </div>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:"var(--muted)"}}>Showing {filtered.length} agent{filtered.length!==1?"s":""}</span>
            </div>

            <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{flex:1,minWidth:200,position:"relative"}}>
                <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"var(--muted)",fontSize:16,pointerEvents:"none"}}>⌕</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or capability…"
                  style={{width:"100%",background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:10,padding:"10px 14px 10px 40px",fontFamily:"'Outfit',sans-serif",fontSize:14,color:"var(--text)",outline:"none"}}/>
              </div>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
                style={{background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:10,padding:"10px 14px",fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:"var(--text)",outline:"none",cursor:"pointer"}}>
                <option value="reputation">Sort: Reputation ↓</option>
                <option value="price-asc">Sort: Price ↑</option>
                <option value="price-desc">Sort: Price ↓</option>
                <option value="reviews">Sort: Most Reviewed</option>
              </select>
            </div>

            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:32}}>
              {["all","trading","yield","nft","liquidity","risk","bridge"].map(t=>(
                <button key={t} onClick={()=>setTypeFilter(t)}
                  style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,padding:"7px 16px",borderRadius:100,border:`1px solid ${typeFilter===t?"var(--cyan)":"var(--border2)"}`,background:typeFilter===t?"var(--cyan)":"transparent",color:typeFilter===t?"#03060f":"var(--muted)",fontWeight:typeFilter===t?700:400,cursor:"pointer",textTransform:"capitalize"}}>
                  {t==="all"?"All Types":t}
                </button>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:20}}>
              {filtered.length===0
                ?<div style={{gridColumn:"1/-1",textAlign:"center",padding:"80px 20px",color:"var(--muted)"}}>
                  <p style={{fontSize:22,fontWeight:700,color:"var(--muted2)",marginBottom:8}}>No agents found</p>
                  <p>Try different search or filters</p>
                </div>
                :filtered.map(a=>(
                <div key={a.id}
                  style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,overflow:"hidden",display:"flex",flexDirection:"column",transition:"transform .3s,border-color .3s,box-shadow .3s"}}
                  onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform="translateY(-5px)";el.style.borderColor="var(--border2)";el.style.boxShadow="0 24px 60px rgba(0,0,0,.5)";}}
                  onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform="translateY(0)";el.style.borderColor="var(--border)";el.style.boxShadow="none";}}>
                  <div style={{padding:"22px 22px 18px",flex:1}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:16}}>
                      <div style={{width:48,height:48,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0,border:`1px solid ${a.color}33`,background:a.bg,color:a.color}}>{a.icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:15,fontWeight:700,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.name}</div>
                        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,marginTop:4,textTransform:"uppercase",letterSpacing:".06em",color:a.color}}>
                          {a.type}{a.verified&&<span style={{color:"var(--green)",marginLeft:6}}>✓ Verified</span>}
                        </div>
                      </div>
                      <ReputationRing score={a.reputation}/>
                    </div>
                    <p style={{fontSize:13,color:"var(--muted2)",lineHeight:1.6,display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical" as const,overflow:"hidden",marginBottom:16}}>{a.description}</p>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
                      {a.caps.slice(0,3).map(c=><span key={c} style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,padding:"3px 10px",borderRadius:4,border:"1px solid var(--border2)",background:"rgba(255,255,255,.02)",color:"var(--muted2)"}}>{c}</span>)}
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"var(--muted)"}}>
                      <span>Owner: {short(a.owner)}</span>
                      <span>{a.reviews} reviews</span>
                    </div>
                  </div>
                  <div style={{borderTop:"1px solid var(--border)",padding:"14px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                    <div>
                      {a.price>0
                        ?<><span style={{fontSize:22,fontWeight:800,color:"#fff",letterSpacing:-1}}>${a.price}</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"var(--muted)",marginLeft:4}}>USDC/job</span></>
                        :<span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--muted)"}}>Price TBD</span>}
                    </div>
                    <Btn variant="grad" style={{fontSize:12,padding:"10px 20px",borderRadius:10}} onClick={()=>openHire(a)}>Hire Agent</Btn>
                  </div>
                  <div style={{background:"rgba(0,0,0,.2)",padding:"8px 22px",display:"flex",alignItems:"center",gap:6,fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"var(--muted)"}}>
                    <span>Agent ID</span><span style={{color:"var(--cyan)"}}># {a.id}</span>
                    <a href={`https://testnet.arcscan.app/token/${ID_ADDR}?a=${a.id}`} target="_blank"
                      style={{color:"var(--muted)",textDecoration:"none",marginLeft:"auto",transition:"color .2s"}}
                      onMouseEnter={e=>(e.currentTarget.style.color="var(--cyan)")}
                      onMouseLeave={e=>(e.currentTarget.style.color="var(--muted)")}>Explorer ↗</a>
                  </div>
                </div>
              ))}
            </div>

            {/* Reload from chain button */}
            <div style={{textAlign:"center",marginTop:40}}>
              <button onClick={()=>{setChainLoaded(false);setTimeout(loadChainAgents,100);}}
                style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,padding:"10px 24px",borderRadius:10,border:"1px solid var(--border2)",background:"transparent",color:chainLoading?"var(--amber)":"var(--muted)",cursor:"pointer",transition:"all .2s"}}
                disabled={chainLoading}>
                {chainLoading?"⟳ Loading…":"↻ Refresh from blockchain"}
              </button>
            </div>
          </section>

          <footer style={{borderTop:"1px solid var(--border)",padding:32,textAlign:"center",fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--muted)"}}>
            Built on <a href="https://arc.network" target="_blank" style={{color:"var(--cyan)",textDecoration:"none"}}>Arc Network</a> · ERC-8004 Onchain Agent Identity · <a href="https://testnet.arcscan.app" target="_blank" style={{color:"var(--cyan)",textDecoration:"none"}}>Testnet Explorer</a>
          </footer>
        </div>

        {/* ── MODALS ─────────────────────────────────────────────────────── */}
        {modal!=="closed"&&(
          <div onClick={e=>{if(e.target===e.currentTarget)closeModal();}}
            style={{position:"fixed",inset:0,zIndex:200,background:"rgba(3,6,15,.82)",backdropFilter:"blur(16px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{width:"100%",maxWidth:480,background:"var(--card)",border:"1px solid var(--border2)",borderRadius:24,overflow:"hidden",boxShadow:"0 40px 120px rgba(0,0,0,.6)",animation:"modal-in .25s cubic-bezier(.34,1.56,.64,1) both",maxHeight:"90vh",overflowY:"auto"}}>

              {/* WALLET */}
              {modal==="wallet"&&<>
                <MHdr title="Connect Wallet" onClose={closeModal}/>
                <div style={{padding:"22px 24px"}}>
                  <Alert type="info">Connect to Arc Testnet (Chain ID: 5042002) to deploy agents and pay with USDC.</Alert>
                  {[{icon:"🦊",label:"MetaMask",sub:"Browser Extension",action:connectMM},
                    {icon:"🐰",label:"Rabby Wallet",sub:"Browser Extension",action:connectMM}].map(w=>(
                    <div key={w.label} onClick={w.action}
                      style={{display:"flex",alignItems:"center",gap:14,background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:12,padding:"14px 16px",cursor:"pointer",marginBottom:10,transition:"border-color .2s"}}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor="var(--cyan)")}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border2)")}>
                      <div style={{width:36,height:36,borderRadius:10,background:"rgba(0,229,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{w.icon}</div>
                      <div><div style={{fontWeight:700}}>{w.label}</div><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--muted)",marginTop:2}}>{w.sub}</div></div>
                      <span style={{marginLeft:"auto",fontFamily:"'JetBrains Mono',monospace",fontSize:9,padding:"3px 8px",borderRadius:4,border:"1px solid rgba(0,229,255,.3)",color:"var(--cyan)",background:"rgba(0,229,255,.08)"}}>
                        {typeof window!=="undefined"&&(window as unknown as {ethereum?:unknown}).ethereum?"DETECTED":"NOT FOUND"}
                      </span>
                    </div>
                  ))}
                  <div onClick={connectDemo}
                    style={{display:"flex",alignItems:"center",gap:14,background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:12,padding:"14px 16px",cursor:"pointer",marginBottom:16,transition:"border-color .2s"}}
                    onMouseEnter={e=>(e.currentTarget.style.borderColor="var(--cyan)")}
                    onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border2)")}>
                    <div style={{width:36,height:36,borderRadius:10,background:"rgba(0,229,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🔑</div>
                    <div><div style={{fontWeight:700}}>Demo Mode</div><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:"var(--muted)",marginTop:2}}>Simulate without real wallet</div></div>
                    <span style={{marginLeft:"auto",fontFamily:"'JetBrains Mono',monospace",fontSize:9,padding:"3px 8px",borderRadius:4,border:"1px solid rgba(0,255,163,.3)",color:"var(--green)",background:"rgba(0,255,163,.08)"}}>ALWAYS ON</span>
                  </div>
                  <p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"var(--muted)",textAlign:"center"}}>
                    Need testnet USDC? <a href="https://faucet.circle.com" target="_blank" style={{color:"var(--cyan)"}}>faucet.circle.com →</a>
                  </p>
                </div>
              </>}

              {/* DEPLOY 1 */}
              {modal==="deploy-1"&&<>
                <MHdr title="Deploy AI Agent" onClose={closeModal}/>
                <div style={{padding:"22px 24px"}}>
                  <Steps active={1}/>
                  <Alert type="info">Your agent will be minted as an NFT on Arc Testnet via ERC-8004.</Alert>
                  {isDemo&&<Alert type="warn">Demo mode — transaction will be simulated.</Alert>}
                  <Field label="Agent Name *"><input value={dName} onChange={e=>setDName(e.target.value)} placeholder="e.g. DeFi Arbitrage Agent v2" maxLength={60} style={inputSty}/></Field>
                  <Field label="Agent Type *">
                    <select value={dType} onChange={e=>setDType(e.target.value)} style={{...inputSty,cursor:"pointer"}}>
                      <option value="">Select a type…</option>
                      {["trading","yield","nft","liquidity","risk","bridge"].map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                    </select>
                  </Field>
                  <Field label="Description *"><textarea value={dDesc} onChange={e=>setDDesc(e.target.value)} placeholder="Describe what your agent does…" rows={3} style={{...inputSty,resize:"vertical" as const,minHeight:80,lineHeight:"1.5"}}/></Field>
                  <Field label="Capabilities">
                    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
                      {CAPS_LIST.map(c=>(
                        <div key={c} onClick={()=>toggleCap(c)}
                          style={{display:"flex",alignItems:"center",gap:8,background:"var(--surface)",border:`1px solid ${dCaps.includes(c)?"rgba(0,229,255,.4)":"var(--border2)"}`,borderRadius:8,padding:"9px 12px",cursor:"pointer",fontSize:12,color:dCaps.includes(c)?"var(--text)":"var(--muted2)",transition:"all .2s"}}>
                          <div style={{width:8,height:8,borderRadius:2,border:`1.5px solid ${dCaps.includes(c)?"var(--cyan)":"var(--border2)"}`,background:dCaps.includes(c)?"var(--cyan)":"transparent",flexShrink:0,transition:"all .2s"}}/>
                          {c}
                        </div>
                      ))}
                    </div>
                  </Field>
                  <Field label="Hire Price (USDC / job)"><input type="number" value={dPrice} onChange={e=>setDPrice(e.target.value)} placeholder="20" min="1" style={inputSty}/></Field>
                  <Btn variant="grad" style={{width:"100%",padding:14,fontSize:13}} onClick={toDeploy2}>Review →</Btn>
                </div>
              </>}

              {/* DEPLOY 2 */}
              {modal==="deploy-2"&&<>
                <MHdr title="Review & Sign" onClose={closeModal}/>
                <div style={{padding:"22px 24px"}}>
                  <Steps active={2}/>
                  <div style={{display:"flex",alignItems:"center",gap:14,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:14,marginBottom:20}}>
                    <div style={{width:44,height:44,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:"1px solid rgba(0,229,255,.2)",background:"rgba(0,229,255,.08)",color:"var(--cyan)",flexShrink:0}}>{TYPE_ICONS[dType]||"◈"}</div>
                    <div><div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{dName}</div><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"var(--muted)",marginTop:3}}>{dType} · {dCaps.length} cap{dCaps.length!==1?"s":""} · ${dPrice||0} USDC/job</div></div>
                  </div>
                  <Breakdown rows={[["Network","Arc Testnet"],["Contract","IdentityRegistry"],["Function","register(metadataURI)"],["Gas fee","~0.006 USDC"],["USDC to agent","Free (just gas)"]]}/>
                  {isDemo&&<Alert type="warn">Demo mode — no real transaction will be sent.</Alert>}
                  <div style={{display:"flex",gap:10}}>
                    <Btn variant="sec" style={{flex:1,padding:14,fontSize:13}} onClick={()=>setModal("deploy-1")}>← Back</Btn>
                    <Btn variant="grad" style={{flex:1,padding:14,fontSize:13}} onClick={execDeploy}>Sign & Deploy</Btn>
                  </div>
                </div>
              </>}

              {/* DEPLOYING */}
              {modal==="deploying"&&<>
                <MHdr title="Deploying…" onClose={()=>{}}/>
                <div style={{padding:"48px 24px",textAlign:"center"}}>
                  <div style={{width:56,height:56,border:"3px solid var(--border2)",borderTopColor:"var(--cyan)",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 24px"}}/>
                  <p style={{fontSize:17,fontWeight:700,color:"#fff",marginBottom:8}}>Registering identity onchain…</p>
                  <p style={{fontSize:13,color:"var(--muted2)"}}>{isDemo?"Simulating…":"Please confirm in your wallet"}</p>
                </div>
              </>}

              {/* DEPLOY DONE */}
              {modal==="deploy-done"&&deployResult&&<>
                <MHdr title="Agent Deployed!" onClose={closeModal}/>
                <div style={{padding:"22px 24px"}}>
                  <div style={{width:64,height:64,borderRadius:"50%",background:"rgba(0,255,163,.08)",border:"2px solid rgba(0,255,163,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 16px",animation:"pop .4s cubic-bezier(.34,1.56,.64,1) both"}}>✓</div>
                  <p style={{textAlign:"center",fontSize:14,color:"var(--muted2)",marginBottom:20}}>
                    <span style={{color:"var(--green)",fontWeight:700,fontSize:18}}>{dName}</span><br/>
                    registered on Arc Testnet
                  </p>
                  <TxBox label="Agent ID" value={`#${deployResult.agentId}`} valueColor="var(--green)"/>
                  <TxBox label="Transaction Hash" value={deployResult.tx}/>
                  <Alert type="info">Your agent is now visible in the marketplace. It persists onchain — F5 will reload it from the blockchain.</Alert>
                  <div style={{display:"flex",gap:10}}>
                    <a href={`https://testnet.arcscan.app/tx/${deployResult.tx}`} target="_blank" style={{flex:1,padding:12,borderRadius:12,border:"1px solid var(--border2)",background:"transparent",color:"var(--text)",fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,textAlign:"center",textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>Explorer ↗</a>
                    <Btn variant="grad" style={{flex:1,padding:12,fontSize:12}} onClick={closeModal}>Done</Btn>
                  </div>
                </div>
              </>}

              {/* DEPLOY ERR */}
              {modal==="deploy-err"&&<>
                <MHdr title="Deploy Failed" onClose={closeModal}/>
                <div style={{padding:"22px 24px"}}>
                  <Alert type="err">{deployError||"Transaction was rejected."}</Alert>
                  <Btn variant="grad" style={{width:"100%",padding:14,fontSize:13}} onClick={()=>setModal("deploy-1")}>Try Again</Btn>
                </div>
              </>}

              {/* HIRE 1 */}
              {modal==="hire-1"&&hireAgent&&<>
                <MHdr title="Hire Agent" onClose={closeModal}/>
                <div style={{padding:"22px 24px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:14,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:14,marginBottom:20}}>
                    <div style={{width:44,height:44,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:`1px solid ${hireAgent.color}33`,background:hireAgent.bg,color:hireAgent.color,flexShrink:0}}>{hireAgent.icon}</div>
                    <div><div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{hireAgent.name}</div><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"var(--muted)",marginTop:3}}>Agent #{hireAgent.id} · Owner: {short(hireAgent.owner)}</div></div>
                  </div>
                  {hireError&&<Alert type="err">{hireError}</Alert>}
                  <Field label="Describe the job (optional)">
                    <textarea value={hireJob} onChange={e=>setHireJob(e.target.value)} rows={3}
                      placeholder="e.g. Monitor ETH/USDC pool and execute when spread > 0.5%…"
                      style={{...inputSty,resize:"none" as const}}/>
                  </Field>
                  <Breakdown
                    rows={[["Service fee",`$${hireAgent.price}.00 USDC`],["Platform fee (2%)",`$${(hireAgent.price*.02).toFixed(2)} USDC`],["---","---"],["Total",`$${(hireAgent.price*1.02).toFixed(2)} USDC`]]}
                    totalIdx={3}/>
                  {isDemo
                    ?<Alert type="warn">Demo mode — no real USDC will be transferred.</Alert>
                    :<Alert type="info">This will transfer <strong>${(hireAgent.price*1.02).toFixed(2)} USDC</strong> to the agent owner's wallet on Arc Testnet.</Alert>}
                  <Btn variant="grad" style={{width:"100%",padding:14,fontSize:13}} onClick={execHire}>
                    Pay ${(hireAgent.price*1.02).toFixed(2)} USDC →
                  </Btn>
                </div>
              </>}

              {/* HIRING */}
              {modal==="hiring"&&hireAgent&&<>
                <MHdr title="Processing Payment…" onClose={()=>{}}/>
                <div style={{padding:"48px 24px",textAlign:"center"}}>
                  <div style={{width:48,height:48,border:"3px solid var(--border2)",borderTopColor:"var(--cyan)",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 20px"}}/>
                  <p style={{fontSize:16,fontWeight:700,color:"#fff",marginBottom:8}}>Transferring USDC…</p>
                  <p style={{fontSize:13,color:"var(--muted2)"}}>${(hireAgent.price*1.02).toFixed(2)} USDC → {short(hireAgent.owner)}</p>
                </div>
              </>}

              {/* HIRE DONE */}
              {modal==="hire-done"&&hireAgent&&<>
                <MHdr title="Agent Hired!" onClose={closeModal}/>
                <div style={{padding:"22px 24px"}}>
                  <div style={{width:64,height:64,borderRadius:"50%",background:"rgba(0,255,163,.08)",border:"2px solid rgba(0,255,163,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 16px",animation:"pop .4s cubic-bezier(.34,1.56,.64,1) both"}}>✓</div>
                  <p style={{textAlign:"center",fontSize:14,color:"var(--muted2)",marginBottom:20}}>
                    <span style={{color:"var(--green)",fontWeight:700,fontSize:20}}>${(hireAgent.price*1.02).toFixed(2)} USDC</span><br/>
                    {(isDemo||hireAgent.owner.toLowerCase().startsWith("0x000000000000000000000000000000000000000"))
                      ?"(demo) sent to":"sent to"} Agent #{hireAgent.id}
                  </p>
                  <TxBox label="Transaction Hash" value={hireTx}/>
                  <div style={{display:"flex",gap:10}}>
                    <a href={`https://testnet.arcscan.app/tx/${hireTx}`} target="_blank"
                      style={{flex:1,padding:12,borderRadius:12,border:"1px solid var(--border2)",background:"transparent",color:"var(--text)",fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:600,textAlign:"center",textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {isDemo?"(Demo) Explorer ↗":"Explorer ↗"}
                    </a>
                    <Btn variant="grad" style={{flex:1,padding:12,fontSize:12}} onClick={closeModal}>Done</Btn>
                  </div>
                </div>
              </>}

            </div>
          </div>
        )}

        {/* TOAST */}
        {toast&&(
          <div style={{position:"fixed",bottom:24,right:24,zIndex:9999,background:"var(--card)",border:`1px solid ${toastColors[toast.type]||"var(--cyan)"}44`,borderRadius:12,padding:"12px 18px",fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:toastColors[toast.type]||"var(--cyan)",maxWidth:340,boxShadow:"0 8px 32px rgba(0,0,0,.4)",animation:"modal-in .25s ease both"}}>
            {toast.msg}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const inputSty: React.CSSProperties = {width:"100%",background:"var(--surface)",border:"1px solid var(--border2)",borderRadius:10,padding:"11px 14px",fontFamily:"'Outfit',sans-serif",fontSize:13,color:"var(--text)",outline:"none"};

function Btn({variant,onClick,children,style}:{variant:string;onClick?:()=>void;children:React.ReactNode;style?:React.CSSProperties}){
  const base:React.CSSProperties={fontFamily:"'JetBrains Mono',monospace",fontWeight:700,letterSpacing:".04em",borderRadius:12,border:"none",cursor:"pointer",transition:"all .2s",fontSize:12,padding:"9px 20px"};
  const vars:Record<string,React.CSSProperties>={
    grad:{background:"linear-gradient(110deg,var(--cyan),var(--green))",color:"#03060f"},
    outline:{background:"transparent",border:"1px solid var(--border2)",color:"var(--text)"},
    wallet:{background:"rgba(0,229,255,.06)",border:"1px solid var(--cyan)",color:"var(--cyan)"},
    sec:{background:"transparent",border:"1px solid var(--border2)",color:"var(--text)"},
  };
  return <button onClick={onClick} style={{...base,...(vars[variant]||{}),...style}}>{children}</button>;
}

function MHdr({title,onClose}:{title:string;onClose:()=>void}){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px",borderBottom:"1px solid var(--border)",position:"sticky",top:0,background:"var(--card)",zIndex:1}}>
      <span style={{fontSize:17,fontWeight:700,color:"#fff"}}>{title}</span>
      <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:"1px solid var(--border2)",background:"var(--surface)",color:"var(--muted2)",cursor:"pointer",fontSize:18,lineHeight:"1",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
    </div>
  );
}

function Alert({type,children}:{type:string;children:React.ReactNode}){
  const map:{[k:string]:string}={info:"rgba(0,229,255,.05)/rgba(0,229,255,.2)/var(--cyan)",warn:"rgba(255,183,0,.05)/rgba(255,183,0,.2)/var(--amber)",err:"rgba(255,61,107,.05)/rgba(255,61,107,.2)/var(--red)"};
  const [bg,border,color]=(map[type]||map.info).split("/");
  return<div style={{borderRadius:10,padding:"12px 14px",fontSize:13,marginBottom:16,border:`1px solid ${border}`,background:bg,color,lineHeight:1.5,display:"flex",gap:8}}><span>{type==="info"?"ℹ":type==="warn"?"⚠":"✕"}</span><span>{children}</span></div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){
  return<div style={{marginBottom:16}}><label style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,textTransform:"uppercase" as const,letterSpacing:".1em",color:"var(--muted)",marginBottom:8,display:"block"}}>{label}</label>{children}</div>;
}

function Steps({active}:{active:number}){
  return(
    <div style={{display:"flex",alignItems:"center",marginBottom:24}}>
      {[["1","Info"],["2","Review"],["3","Sign"]].map(([n,l],i)=>{
        const done=i+1<active,act=i+1===active;
        const c=done?"var(--green)":act?"var(--cyan)":"var(--muted)";
        return(
          <div key={n} style={{display:"flex",alignItems:"center",flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:28,height:28,borderRadius:"50%",border:`1.5px solid ${c}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:c,background:done?"rgba(0,255,163,.1)":act?"rgba(0,229,255,.1)":"transparent"}}>{done?"✓":n}</div>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:c,textTransform:"uppercase" as const,letterSpacing:".06em",whiteSpace:"nowrap" as const}}>{l}</span>
            </div>
            {i<2&&<div style={{flex:1,height:1,background:"var(--border)",margin:"0 8px"}}/>}
          </div>
        );
      })}
    </div>
  );
}

function Breakdown({rows,totalIdx}:{rows:[string,string][];totalIdx?:number}){
  return(
    <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:14,padding:14,marginBottom:18}}>
      {rows.map(([k,v],i)=>k==="---"
        ?<div key={i} style={{borderTop:"1px solid var(--border)",margin:"10px 0"}}/>
        :<div key={k} style={{display:"flex",justifyContent:"space-between",fontFamily:"'JetBrains Mono',monospace",fontSize:i===totalIdx?13:11,color:"var(--muted)",marginBottom:i<rows.length-1?8:0}}>
          <span>{k}</span>
          <span style={{color:i===totalIdx?"var(--green)":v.includes("Free")?"var(--green)":"var(--text)",fontSize:i===totalIdx?16:undefined,fontWeight:i===totalIdx?700:undefined}}>{v}</span>
        </div>
      )}
    </div>
  );
}

function TxBox({label,value,valueColor}:{label:string;value:string;valueColor?:string}){
  return(
    <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,padding:"12px 14px",marginBottom:16}}>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:"var(--muted)",marginBottom:4,textTransform:"uppercase" as const,letterSpacing:".08em"}}>{label}</div>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:valueColor||"var(--cyan)",wordBreak:"break-all" as const}}>{value}</div>
    </div>
  );
}
