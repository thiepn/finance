import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Icon } from "../icons/Icon.js";
import {
 AccountSwitcher, ActionMenu, AttentionRow, BudgetAllocationRow, DataProvenance,
 FilterBar, FinanceButton, FinancePageHeader, FinanceState, FinanceTable, FinanceTrend,
 LedgerRow, MoneyMetric, MoneyValue, PeriodPicker, ReceiptCompare, SignalCurrentScope,
 type FinancialStateKind
} from "./SignalCurrent.js";
import "./signal-current.css";
import "./showcase.css";

type Screen = "home" | "activity" | "receipt" | "plan" | "states";
const nav: Array<{id:Screen;label:string}> = [
 {id:"home",label:"Home"},{id:"activity",label:"Activity"},
 {id:"plan",label:"Plan"},{id:"receipt",label:"Receipts"},{id:"states",label:"States"}
];
const transactions = [
 {id:"tr-1",date:"8 Oct",merchant:"REWE",category:"Groceries",account:"Main checking",amount:-4235},
 {id:"tr-2",date:"7 Oct",merchant:"DB Regio",category:"Transport",account:"Main checking",amount:-1280},
 {id:"tr-3",date:"6 Oct",merchant:"dm",category:"Personal care",account:"Main checking",amount:-1845},
 {id:"tr-4",date:"5 Oct",merchant:"Amazon",category:"Shopping",account:"Visa",amount:-3799},
 {id:"tr-5",date:"4 Oct",merchant:"Spotify",category:"Subscriptions",account:"Main checking",amount:-1099},
 {id:"tr-6",date:"1 Oct",merchant:"Salary",category:"Income",account:"Main checking",amount:165000},
];
const allocations = [
 {label:"Groceries",planned:30000,spent:18475},
 {label:"Housing",planned:60000,spent:41000},
 {label:"Transport",planned:15000,spent:8420},
 {label:"Dining",planned:12000,spent:7260},
 {label:"Shopping",planned:10000,spent:6840},
 {label:"Other",planned:23000,spent:4245},
];
const trend = [
 {label:"Oct 1",actualMinor:0,plannedMinor:0},
 {label:"Oct 5",actualMinor:11000,plannedMinor:25000},
 {label:"Oct 10",actualMinor:38000,plannedMinor:50000},
 {label:"Oct 15",actualMinor:51000,plannedMinor:75000},
 {label:"Oct 20",actualMinor:86240,plannedMinor:100000},
 {label:"Oct 25",actualMinor:null,plannedMinor:125000},
 {label:"Oct 31",actualMinor:null,plannedMinor:150000}
];
const receiptSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="350" height="520" viewBox="0 0 350 520"><rect width="350" height="520" fill="#eee9e0"/><rect x="40" y="20" width="270" height="480" fill="white"/><g fill="#181818" font-family="monospace"><text x="175" y="88" font-family="Arial" text-anchor="middle" font-size="37" font-weight="bold">REWE</text><text x="175" y="112" text-anchor="middle" font-size="12">MARKT KÖLN</text><text x="68" y="168" font-size="12">Bio Vollkornbrot</text><text x="285" y="168" text-anchor="end" font-size="12">3,29</text><text x="68" y="193" font-size="12">Äpfel 1.5 kg</text><text x="285" y="193" text-anchor="end" font-size="12">5,06</text><text x="68" y="218" font-size="12">Milch 2x</text><text x="285" y="218" text-anchor="end" font-size="12">2,58</text><text x="68" y="243" font-size="12">Gemüse / Obst</text><text x="285" y="243" text-anchor="end" font-size="12">12,40</text><text x="68" y="268" font-size="12">Haushalt</text><text x="285" y="268" text-anchor="end" font-size="12">19,02</text><path stroke="#333" d="M68 294H285"/><text x="68" y="325" font-size="15" font-weight="bold">SUMME EUR</text><text x="285" y="325" text-anchor="end" font-size="15" font-weight="bold">42,35</text><text x="175" y="404" text-anchor="middle" font-size="11">08.10.2026 · Karte</text><text x="175" y="451" text-anchor="middle" font-size="10">Synthetic design fixture — not evidence</text></g></svg>`;
const sourceUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(receiptSvg);
function Showcase(){
  const [theme,setTheme]=useState<"dark"|"light">("dark");
  const [screen,setScreen]=useState<Screen>(()=> {
    const q=new URLSearchParams(location.search).get("screen");
    return nav.some(item=>item.id===q)?q as Screen:"home";
  });
  const [period,setPeriod]=useState("2026-10");
  const [account,setAccount]=useState("all");
  const [selected,setSelected]=useState(transactions[0]?.id ?? "");
  const [notice,setNotice]=useState("This preview contains synthetic data only.");
  const [stateKind,setStateKind]=useState<FinancialStateKind>("sign-in");
  const [search,setSearch]=useState("");
  const announce=(s:string)=>setNotice(s);
  const navigate=(s:Screen)=>{setScreen(s);history.replaceState(null,"","?screen="+s);};
  const matched=transactions.filter(t => (account==="all"||t.account===account)
    && (t.merchant+" "+t.category).toLowerCase().includes(search.trim().toLowerCase()));
  const selectedTx=transactions.find(t=>t.id===selected)??transactions[0];
  return <SignalCurrentScope theme={theme} className="sc-showcase">
    <aside className="sc-demo-sidebar"><div className="sc-demo-brand"><span className="sc-demo-logo">▮▮</span><span><strong>THIEPN</strong><small>FINANCE · V2</small></span></div>
      <nav aria-label="Demo primary navigation">{nav.map(item=><button type="button" key={item.id}
        className={screen===item.id?"is-active":""} onClick={()=>navigate(item.id)}>
        <Icon name={item.id==="home"?"overview":item.id==="plan"?"plan":item.id==="receipt"?"receipts":item.id==="states"?"settings":"activity"} size={17}/>{item.label}</button>)}</nav>
      <p className="sc-demo-aside">SIGNAL CURRENT<br/>Dark-first · Finance-native<br/>Synthetic values only</p>
    </aside>
    <div className="sc-demo-body"><header className="sc-demo-topbar">
      <div><strong>Finance</strong> <span>/ {nav.find(n=>n.id===screen)?.label}</span></div>
      <div className="sc-demo-top-actions"><label className="sc-demo-theme-label">Theme <select aria-label="Theme" value={theme} onChange={e=>setTheme(e.currentTarget.value as "dark"|"light")}><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <ActionMenu><button onClick={()=>navigate("states")} type="button">System states</button><button onClick={()=>navigate("receipt")} type="button">Receipt review</button></ActionMenu>
      <span className="sc-demo-avatar">TN</span></div>
    </header>
    <main className="sc-demo-content">
      {screen==="home"?<><FinancePageHeader title="Home" eyebrow="October 2026" action={<FinanceButton onClick={()=>navigate("activity")}>+ New transaction</FinanceButton>} supplementary={<FinanceButton variant="quiet" onClick={()=>navigate("receipt")}>Scan receipt</FinanceButton>}/>
        <div className="sc-demo-metrics"><MoneyMetric label="Available to spend" amountMinor={124050} source="planned" description="After commitments" emphasis/>
        <MoneyMetric label="Cash position" amountMinor={287030} source="posted" description="2 cash accounts"/>
        <MoneyMetric label="Upcoming" amountMinor={74500} source="forecast" tone="warning" description="Next 30 days"/>
        <MoneyMetric label="Spent this month" amountMinor={86240} source="posted" description="€1,500 budget"/></div>
        <div className="sc-demo-home-mid"><section className="sc-demo-panel sc-demo-attention"><h2>Needs attention <span>3</span></h2>
          <AttentionRow title="2 transactions" detail="Awaiting classification" icon="alert" onClick={()=>navigate("activity")}/>
          <AttentionRow title="1 receipt" detail="Ready to review and match" icon="receipt" onClick={()=>navigate("receipt")}/>
          <AttentionRow title="Upcoming rent" detail="1 Nov · €600.00 planned" icon="recurring" onClick={()=>navigate("plan")}/></section>
          <FinanceTrend title="Spending pace" description="Posted expenses against monthly budget" points={trend}/></div>
        <div className="sc-demo-home-bottom"><section className="sc-demo-panel"><h2>Budget progress</h2><MoneyValue amountMinor={63760} size="medium"/> <span>remaining</span>
          {allocations.slice(0,2).map(x=><BudgetAllocationRow key={x.label} label={x.label} plannedMinor={x.planned} spentMinor={x.spent}/>)}</section>
          <section className="sc-demo-panel"><h2>Recent activity</h2>{transactions.slice(0,3).map(t=>
            <LedgerRow key={t.id} merchant={t.merchant} dateLabel={t.date} category={t.category} amountMinor={t.amount} href="?screen=activity"/>)}</section></div>
      </>:null}
      {screen==="activity"?<><FinancePageHeader title="Activity" eyebrow="Financial ledger" action={<FinanceButton onClick={()=>announce("Transaction creation is implemented in Finance P29, not this design preview.")}>+ New transaction</FinanceButton>}
       supplementary={<FinanceButton variant="secondary" onClick={()=>announce("Import flows live in the production Finance app.")}>Import</FinanceButton>}/>
       <FilterBar><label className="sc-demo-search">Search <input aria-label="Search transactions" placeholder="Merchant or category" value={search} onChange={e=>setSearch(e.currentTarget.value)}/></label>
        <PeriodPicker options={[{value:"2026-10",label:"Oct 2026"},{value:"2026-09",label:"Sep 2026"}]} value={period} onChange={setPeriod}/>
        <AccountSwitcher options={[{id:"all",name:"All accounts"},{id:"Main checking",name:"Main checking"},{id:"Visa",name:"Visa"}]} value={account} onChange={setAccount}/>
       </FilterBar>
       <div className="sc-demo-activity-grid"><FinanceTable caption={"Transactions · "+matched.length+" synthetic results"} rows={matched} rowKey={t=>t.id}
        columns={[{id:"date",label:"Date",render:t=>t.date},{id:"merchant",label:"Merchant",render:t=><strong>{t.merchant}</strong>},
          {id:"category",label:"Category",render:t=>t.category},{id:"account",label:"Account",render:t=>t.account},
          {id:"amount",label:"Amount",align:"end",render:t=><MoneyValue amountMinor={t.amount} tone={t.amount<0?"negative":"positive"}/>}]}/>
          <aside className="sc-demo-panel sc-demo-detail"><h2>Transaction detail</h2><label>Select record <select value={selected} onChange={e=>setSelected(e.currentTarget.value)}>{transactions.map(t=><option value={t.id} key={t.id}>{t.merchant}</option>)}</select></label>
          {selectedTx?<><h3>{selectedTx.merchant}</h3><MoneyValue size="large" amountMinor={selectedTx.amount} tone={selectedTx.amount<0?"negative":"positive"}/>
          <p>{selectedTx.date} · {selectedTx.category}</p><DataProvenance source="posted"/><FinanceButton variant="secondary" onClick={()=>navigate("receipt")}>View receipt evidence</FinanceButton></>:null}</aside></div>
      </>:null}
      {screen==="receipt"?<><FinancePageHeader title="Receipt review" eyebrow="REWE · 8 Oct 2026" action={<FinanceButton onClick={()=>announce("Review confirmation disabled in synthetic design preview.")}>Review match</FinanceButton>}/>
        <ReceiptCompare title="Extracted details" status="needs-review" sourceUrl={sourceUri} sourceAlt="Synthetic sample REWE receipt with a 42.35 EUR total"
          details={<div className="sc-demo-form"><label>Merchant<input value="REWE" readOnly /></label><label>Date<input value="08.10.2026" readOnly /></label>
            <label>Total <MoneyValue amountMinor={4235}/></label><label>Category<input value="Groceries" readOnly /></label>
            <div className="sc-demo-match"><strong>Possible transaction match</strong><p>Main checking · 8 Oct · −€42.35</p><DataProvenance source="receipt"/></div></div>}
          footer={<FinanceButton variant="secondary" onClick={()=>announce("Receipt editing will be implemented in P30.")}>Save corrections</FinanceButton>} />
      </>:null}
      {screen==="plan"?<><FinancePageHeader title="Plan" eyebrow="October 2026" action={<FinanceButton onClick={()=>announce("Budget editing will be implemented in P31.")}>Adjust allocations</FinanceButton>}/>
      <div className="sc-demo-plan-head"><MoneyMetric label="Monthly budget" amountMinor={150000} source="planned"/>
        <MoneyMetric label="Spent" amountMinor={86240} source="posted"/>
        <MoneyMetric label="Remaining" amountMinor={63760} source="planned"/></div>
      <section className="sc-demo-panel"><h2>Budget allocations</h2>{allocations.map(x=><BudgetAllocationRow key={x.label} label={x.label} plannedMinor={x.planned} spentMinor={x.spent}/>)}</section></>:null}
      {screen==="states"?<><FinancePageHeader title="System states" eyebrow="Authenticated and error-state references"/>
        <FilterBar><div className="sc-control"><label htmlFor="sc-state">Choose state</label><select id="sc-state" value={stateKind} onChange={e=>setStateKind(e.currentTarget.value as FinancialStateKind)}>
          {(["sign-in","empty","offline","error","forbidden","loading","processing"] as FinancialStateKind[]).map(k=><option value={k} key={k}>{k}</option>)}</select></div></FilterBar>
        <FinancialState kind={stateKind} title={stateKind==="sign-in"?"Sign in to view Activity":stateKind==="empty"?"No transactions yet":stateKind==="offline"?"Activity couldn't load":stateKind==="error"?"Something went wrong":stateKind==="forbidden"?"No access to this record":stateKind==="processing"?"Reading receipt":"Restoring your finance session"}
        description={stateKind==="sign-in"?"You'll return to your previous search after sign-in. No private data is loaded while signed out.":stateKind==="empty"?"Add an account or import a statement. Your actual balance will appear here.":stateKind==="processing"?"Receipt evidence is being analyzed; this does not create a ledger posting.":"Your finance records remain unchanged. Retry when available."}
        primaryAction={stateKind==="sign-in"?{label:"Continue with Google",onClick:()=>announce("Synthetic demo: sign-in not connected.")}:stateKind==="offline"||stateKind==="error"?{label:"Retry",onClick:()=>announce("Synthetic demo retry.")}:undefined}/>
      </>:null}
    </main><footer className="sc-demo-notice" role="status">{notice}</footer></div>
    <nav className="sc-demo-mobile-tabs" aria-label="Mobile synthetic preview navigation">
      {[{id:"home" as Screen,label:"Home",icon:"overview" as const},{id:"activity" as Screen,label:"Activity",icon:"activity" as const},
        {id:"receipt" as Screen,label:"Scan",icon:"scan" as const},{id:"plan" as Screen,label:"Plan",icon:"plan" as const},
        {id:"states" as Screen,label:"More",icon:"settings" as const}].map(t=><button type="button" key={t.id} onClick={()=>navigate(t.id)} aria-current={screen===t.id?"page":undefined}><Icon name={t.icon} size={18}/><span>{t.label}</span></button>)}
    </nav>
   </SignalCurrentScope>;
}
const mount=document.getElementById("p26-preview-root");
if (!mount) throw new Error("P26 preview root missing");
createRoot(mount).render(<StrictMode><Showcase/></StrictMode>);
