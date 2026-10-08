import {useEffect,useState,type FormEvent} from "react";
import type {PlanningDashboard,PlanningAllocation,PlanningGoal,BudgetPeriodKind,PlanningGoalKind} from "../domain/planning.js";
import {usePlanningWorkspace,type PlanningWorkspace} from "./use-planning.js";
import {FinanceButton,MoneyValue,FinanceTrend,DataProvenance,FinancialState} from "../ui/v2/SignalCurrent.js";
import {Icon} from "../ui/icons/Icon.js";
import {currencyMinorDigits} from "../ui/v2/finance-presentation.js";
import {actionableBudgetCount,budgetFraction,budgetOutcomeLabel,minorToPlanInput,orderedAllocations,
 planForecastPoints,planMoneyToMinor,validPlanAnchor,verifiedPlanMoney,isEligibleGoalMovement} from "./signal-plan-model.js";
import "./signal-plan.css";
type Mode="budget"|"goals";
const dateLabel=(value:string|null,locale:string,timeZone:string)=>{
 if(!value)return"Not scheduled";
 const d=new Date(value.includes("T")?value:value+"T12:00:00Z");
 return Number.isFinite(d.valueOf())?new Intl.DateTimeFormat(locale,{day:"numeric",month:"short",year:"numeric",timeZone}).format(d):"Date unavailable";
};
function MoneyOrUnknown({value,board}:{value:number|null|undefined;board:PlanningDashboard}){
 const n=verifiedPlanMoney(value);
 return n===null?<span className="sc-plan-unknown">—</span>:<MoneyValue amountMinor={n} currency={board.profile.currencyCode}
 locale={board.profile.locale} tone={n<0?"negative":"default"}/>;
}
function PlanKpi({label,value,board,note,tone="default"}:{
 label:string;value:number|null|undefined;board:PlanningDashboard;note:string;tone?:"default"|"negative"|"positive"|"warning"
}){
 const n=verifiedPlanMoney(value);
 return <section className="sc-plan-kpi"><span>{label}</span>
   {n===null?<strong className="sc-plan-unknown" aria-label="Not available">—</strong>:
   <MoneyValue amountMinor={n} currency={board.profile.currencyCode} locale={board.profile.locale}
     tone={n<0?"negative":tone} size="large"/>}
   <small>{note}</small></section>;
}
function AllocationEditor({allocation,board,busy,workspace}:{
 allocation:PlanningAllocation;board:PlanningDashboard;busy:boolean;workspace:PlanningWorkspace;
}){
 const [editing,setEditing]=useState(false);
 const [raw,setRaw]=useState(minorToPlanInput(allocation.plannedMinor));
 const [rollover,setRollover]=useState(allocation.rollover);
 const [removal,setRemoval]=useState(false);
 useEffect(()=>{setRaw(minorToPlanInput(allocation.plannedMinor));setRollover(allocation.rollover);},[allocation.plannedMinor,allocation.rollover]);
 const amount=planMoneyToMinor(raw);
 const percent=budgetFraction(allocation.spentMinor,allocation.effectivePlannedMinor);
 function save(e:FormEvent){e.preventDefault();if(amount===null||!board.budget.periodId||busy)return;
  void workspace.saveAllocation({allocationId:allocation.allocationId,budgetPeriodId:board.budget.periodId,
    categoryId:allocation.categoryId,plannedMinor:amount,rollover});}
 const status=allocation.status.replaceAll("_"," ");
 return <div className={"sc-plan-allocation"+(allocation.status==="over"?" sc-plan-allocation--over":"")}>
   <div className="sc-plan-allocation__main"><div className="sc-plan-allocation__identity">
     <strong>{allocation.categoryName}</strong><small>{allocation.categoryPath.join(" / ")}</small>
     <span className={"sc-plan-status sc-plan-status--"+allocation.status}>{status}</span>
     </div><div className="sc-plan-allocation__values">
     <span><MoneyOrUnknown value={allocation.spentMinor} board={board}/> <small>used of <MoneyOrUnknown value={allocation.effectivePlannedMinor} board={board}/></small></span>
     <strong><MoneyOrUnknown value={allocation.remainingMinor} board={board}/></strong></div>
   </div>
   <div className="sc-plan-usage" role="progressbar" aria-label={allocation.categoryName+" budget used"}
     aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent??0}
     aria-valuetext={percent===null?"No allocation":Math.round(100*allocation.spentMinor/Math.max(1,allocation.effectivePlannedMinor))+"% of allowance"}>
      <span style={{width:(percent??0)+"%"}}/></div>
   <div className="sc-plan-allocation__foot"><small>
     Expected final spend <MoneyOrUnknown value={allocation.projectedSpendMinor} board={board}/>
     {allocation.rollover?" · Rollover enabled":""}</small>
     <button type="button" onClick={()=>{setEditing(v=>!v);setRemoval(false)}} disabled={busy}>{editing?"Close":"Adjust"}</button></div>
   {editing?<form onSubmit={save} className="sc-plan-allocation__edit">
     <label>Planned amount · {board.profile.currencyCode}<input value={raw} onChange={e=>setRaw(e.target.value)}
       disabled={busy} inputMode="decimal" aria-invalid={amount===null}/></label>
     <label className="sc-plan-check"><input type="checkbox" checked={rollover} disabled={busy}
       onChange={e=>setRollover(e.target.checked)}/>Carry unused allocation</label>
     <FinanceButton type="submit" disabled={busy||amount===null}>{busy?"Saving…":"Save allocation"}</FinanceButton>
     {!removal?<FinanceButton variant="quiet" disabled={busy} onClick={()=>setRemoval(true)}>Remove</FinanceButton>:
       <div className="sc-plan-confirm"><span>Remove this category allocation?</span>
        <FinanceButton variant="danger" disabled={busy} onClick={()=>void workspace.deleteAllocation(allocation.allocationId)}>Confirm removal</FinanceButton>
        <FinanceButton variant="secondary" disabled={busy} onClick={()=>setRemoval(false)}>Cancel</FinanceButton></div>}
   </form>:null}
 </div>;
}
function PlanBudgetSetup({workspace,board}:{workspace:PlanningWorkspace;board:PlanningDashboard}){
 const [name,setName]=useState("My budget"),[kind,setKind]=useState<BudgetPeriodKind>("monthly"),[income,setIncome]=useState("");
 const amount=income.trim()?planMoneyToMinor(income):null;
 return <section className="sc-plan-setup"><span className="sc-eyebrow">START PLANNING</span><h2>Create a budget period</h2>
  <p>Set the cadence and expected income, then assign category allowances. Until these allocations exist, no spendable balance is assumed.</p>
  <form onSubmit={e=>{e.preventDefault();if(!name.trim()||(income.trim()&&amount===null))return;
    void workspace.setupBudget({name:name.trim(),periodKind:kind,plannedIncomeMinor:amount});}}>
    <label>Name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>Cadence<select value={kind} onChange={e=>setKind(e.target.value as BudgetPeriodKind)}>
      <option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label>
    <label>Expected income · {board.profile.currencyCode}<input inputMode="decimal" value={income}
       placeholder="Optional" aria-invalid={income.trim()!==""&&amount===null} onChange={e=>setIncome(e.target.value)}/></label>
    <FinanceButton type="submit" disabled={!!workspace.busyKey||!name.trim()||!!(income.trim()&&amount===null)}>Create plan</FinanceButton>
  </form>
 </section>;
}
function AddPlanAllocation({board,workspace}:{board:PlanningDashboard;workspace:PlanningWorkspace}){
 const [category,setCategory]=useState(""),[amount,setAmount]=useState(""),[roll,setRoll]=useState(false);
 const minor=planMoneyToMinor(amount);
 const assigned=new Set(board.allocations.map(a=>a.categoryId));
 const categories=board.availableCategories.filter(c=>!assigned.has(c.categoryId));
 const canSubmit=!!board.budget.periodId&&!!category&&minor!==null&&!workspace.busyKey;
 return <form className="sc-plan-new" onSubmit={e=>{e.preventDefault();if(!canSubmit||minor===null||!board.budget.periodId)return;
   void workspace.saveAllocation({budgetPeriodId:board.budget.periodId,categoryId:category,plannedMinor:minor,rollover:roll});}}>
  <div><strong>Add allocation</strong><small>Set a limit for a category; values remain editable.</small></div>
  <label>Category<select value={category} onChange={e=>setCategory(e.target.value)} required>
    <option value="">Choose category</option>{categories.map(c=><option key={c.categoryId} value={c.categoryId}>{c.path.join(" / ")}</option>)}</select></label>
  <label>Planned · {board.profile.currencyCode}<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}
     placeholder="100,00" aria-invalid={amount!==""&&minor===null}/></label>
  <label className="sc-plan-check"><input type="checkbox" checked={roll} onChange={e=>setRoll(e.target.checked)}/>Rollover</label>
  <FinanceButton type="submit" disabled={!canSubmit}>Add category</FinanceButton></form>;
}
function PlanIncome({board,workspace}:{board:PlanningDashboard;workspace:PlanningWorkspace}){
 const [editing,setEditing]=useState(false),[raw,setRaw]=useState(minorToPlanInput(board.budget.plannedIncomeMinor));
 useEffect(()=>setRaw(minorToPlanInput(board.budget.plannedIncomeMinor)),[board.budget.plannedIncomeMinor]);
 const n=raw.trim()?planMoneyToMinor(raw):null;
 return <div className="sc-plan-income"><span>Planned income <MoneyOrUnknown value={board.budget.plannedIncomeMinor} board={board}/></span>
  {!editing?<button type="button" onClick={()=>setEditing(true)}>Change</button>:
    <form onSubmit={e=>{e.preventDefault();if(raw&&n===null)return;void workspace.updatePlannedIncome(n);}}>
      <label>Income · {board.profile.currencyCode}<input inputMode="decimal" value={raw} onChange={e=>setRaw(e.target.value)}
         aria-invalid={!!(raw.trim()&&n===null)} /></label>
      <FinanceButton type="submit" disabled={!!workspace.busyKey||!!(raw.trim()&&n===null)}>Save income</FinanceButton>
      <FinanceButton variant="quiet" onClick={()=>setEditing(false)}>Close</FinanceButton>
    </form>}</div>;
}
function PlanGoals({board,workspace}:{board:PlanningDashboard;workspace:PlanningWorkspace}){
 const [showAdd,setShowAdd]=useState(false),[name,setName]=useState(""),[kind,setKind]=useState<PlanningGoalKind>("savings"),
   [amount,setAmount]=useState(""),[targetDate,setTargetDate]=useState("");
 const target=planMoneyToMinor(amount,false);
 return <section className="sc-plan-goals" aria-label="Savings goals">
  <div className="sc-plan-section-title"><div><span className="sc-eyebrow">LONGER TERM</span><h2>Savings goals</h2></div>
    <FinanceButton variant="secondary" onClick={()=>setShowAdd(v=>!v)}>{showAdd?"Close":"Create goal"}</FinanceButton></div>
  {showAdd?<form className="sc-plan-new sc-plan-goal-create" onSubmit={e=>{e.preventDefault();if(!name.trim()||target===null)return;
    void workspace.saveGoal({name:name.trim(),kind,targetMinor:target,currencyCode:board.profile.currencyCode,
      targetDate:targetDate||null});}}>
    <label>Goal name<input value={name} maxLength={120} onChange={e=>setName(e.target.value)} required/></label>
    <label>Type<select value={kind} onChange={e=>setKind(e.target.value as PlanningGoalKind)}>
      <option value="savings">Savings</option><option value="sinking_fund">Sinking fund</option></select></label>
    <label>Target · {board.profile.currencyCode}<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required aria-invalid={!!amount&&target===null}/></label>
    <label>Target date<input type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)}/></label>
    <FinanceButton disabled={target===null||!!workspace.busyKey} type="submit">Save goal</FinanceButton>
   </form>:null}
  {!board.goals.length?<p className="sc-plan-empty">No goals yet. You can set savings or sinking-fund targets.</p>:
    <div className="sc-plan-goal-grid">{board.goals.map(goal=><GoalRow key={goal.goalId} goal={goal} board={board} workspace={workspace}/>)}</div>}
  <p className="sc-plan-footnote">Goal movements track progress. They do not transfer money between bank accounts or create a ledger transaction.</p>
 </section>;
}
function GoalRow({goal,board,workspace}:{goal:PlanningGoal;board:PlanningDashboard;workspace:PlanningWorkspace}){
 const [raw,setRaw]=useState(""),[confirmWithdraw,setConfirmWithdraw]=useState(false);
 const [confirmStatus,setConfirmStatus]=useState<"completed"|"cancelled"|null>(null);
 const minor=planMoneyToMinor(raw,false),percentage=budgetFraction(goal.fundedMinor,goal.targetMinor);
 const currencySupported=currencyMinorDigits(goal.currencyCode)===2;
 const ready=(kind:"contribution"|"withdrawal")=>currencySupported&&minor!==null&&isEligibleGoalMovement(goal.goalId,minor,kind,board)&&!workspace.busyKey;
 const submit=(kind:"contribution"|"withdrawal")=>{
   if(!ready(kind)||minor===null)return;
   if(kind==="withdrawal"&&!confirmWithdraw){setConfirmWithdraw(true);return;}
   void workspace.addGoalMovement(goal.goalId,minor,kind);
   setConfirmWithdraw(false);
 };
 return <article className="sc-plan-goal"><div className="sc-plan-goal__top"><div>
   <strong>{goal.name}</strong><small>{goal.kind==="sinking_fund"?"Sinking fund":"Savings"} · {goal.health.replaceAll("_"," ")}</small></div>
   <span>{goal.status}</span></div>
   <div className="sc-plan-goal__amount"><MoneyValue amountMinor={goal.fundedMinor} currency={goal.currencyCode}/>
     <small>of <MoneyValue amountMinor={goal.targetMinor} currency={goal.currencyCode}/></small></div>
   <div className="sc-plan-usage" role="progressbar" aria-label={goal.name+" goal funded"}
      aria-valuenow={percentage??0} aria-valuemin={0} aria-valuemax={100}><span style={{width:(percentage??0)+"%"}}/></div>
   <p>{goal.targetDate?"Target "+dateLabel(goal.targetDate,board.profile.locale,board.profile.timeZone):"No target date"}
     {goal.requiredMonthlyMinor>0?" · Required monthly "+new Intl.NumberFormat(board.profile.locale,{style:"currency",currency:goal.currencyCode}).format(goal.requiredMonthlyMinor/100):""}</p>
   {!currencySupported?<p className="sc-plan-error">Manual movement is disabled for this currency until exact minor-unit support is qualified.</p>:null}
   {goal.status==="active"?<div className="sc-plan-goal__actions">
     <label>Movement · {goal.currencyCode}<input inputMode="decimal" value={raw} onChange={e=>{setRaw(e.target.value);setConfirmWithdraw(false)}} placeholder="0,00"/></label>
     <FinanceButton variant="secondary" disabled={!ready("contribution")} onClick={()=>submit("contribution")}>Contribute</FinanceButton>
     <FinanceButton variant={confirmWithdraw?"danger":"quiet"} disabled={!ready("withdrawal")} onClick={()=>submit("withdrawal")}>
       {confirmWithdraw?"Confirm withdrawal":"Withdraw"}</FinanceButton>
     <FinanceButton variant="quiet" disabled={!!workspace.busyKey} onClick={()=>void workspace.setGoalStatus(goal.goalId,"paused")}>Pause</FinanceButton>
     </div>:goal.status==="paused"?<FinanceButton variant="secondary" disabled={!!workspace.busyKey}
         onClick={()=>void workspace.setGoalStatus(goal.goalId,"active")}>Resume</FinanceButton>:null}
   {["active","paused"].includes(goal.status)?<div className="sc-plan-goal__status">
     {!confirmStatus?<><FinanceButton variant="quiet" disabled={!!workspace.busyKey}
       onClick={()=>setConfirmStatus("completed")}>Mark completed</FinanceButton>
       <FinanceButton variant="quiet" disabled={!!workspace.busyKey}
       onClick={()=>setConfirmStatus("cancelled")}>Cancel goal</FinanceButton></>:
       <div className="sc-plan-confirm"><span>{confirmStatus==="completed"?"Mark this goal completed?":"Cancel this goal? Progress history is retained."}</span>
       <FinanceButton variant={confirmStatus==="cancelled"?"danger":"primary"} disabled={!!workspace.busyKey}
         onClick={()=>{void workspace.setGoalStatus(goal.goalId,confirmStatus);setConfirmStatus(null);}}>Confirm {confirmStatus}</FinanceButton>
       <FinanceButton variant="secondary" disabled={!!workspace.busyKey} onClick={()=>setConfirmStatus(null)}>Keep goal</FinanceButton></div>}
    </div>:null}
 </article>;
}
export interface SignalPlanViewProps{
 dashboard:PlanningDashboard;workspace:PlanningWorkspace;mode:Mode;
 onNavigate:(path:string)=>void;anchor:string;onAnchor:(date:string)=>void;
}
export function SignalPlanView({dashboard:board,workspace,mode,onNavigate,anchor,onAnchor}:SignalPlanViewProps){
 const b=board.budget,totals=orderedAllocations(board.allocations),attention=actionableBudgetCount(board);
 const points=planForecastPoints(board);
 const currency=board.profile.currencyCode;
 const commitments=[...board.commitments].filter(c=>c.currencyCode===currency&&c.transactionType==="expense")
   .sort((a,b)=>a.expectedAt.localeCompare(b.expectedAt)).slice(0,6);
 return <div className="sc-plan" data-testid="finance-plan-workspace">
  <header className="sc-plan-heading"><div><span className="sc-eyebrow">BUDGETS, GOALS & COMMITMENTS</span><h1>Plan</h1>
   <p>What you assigned, what you spent, and what is still expected.</p></div>
   <div className="sc-plan-heading__actions"><label>Period date<input type="date" value={anchor} onChange={e=>{if(validPlanAnchor(e.target.value))onAnchor(e.target.value)}}/></label>
    <button type="button" className="sc-plan-refresh" onClick={()=>void workspace.refresh()} disabled={!!workspace.busyKey}>Refresh</button></div></header>
  <nav className="sc-plan-tabs" aria-label="Planning sections">
    <button type="button" aria-current={mode==="budget"?"page":undefined} onClick={()=>onNavigate("/plan")}>Budget & categories</button>
    <button type="button" aria-current={mode==="goals"?"page":undefined} onClick={()=>onNavigate("/plan/goals")}>Savings goals</button>
    <button type="button" onClick={()=>onNavigate("/plan/recurring")}>Recurring commitments</button>
  </nav>
  {workspace.actionError?<p className="sc-plan-error" role="alert">{workspace.actionError}</p>:null}
  {mode==="goals"?<PlanGoals board={board} workspace={workspace}/>:
  <>
   <div className="sc-plan-context"><span className={"sc-plan-status sc-plan-status--"+b.status}>{budgetOutcomeLabel(b.status)}</span>
     <strong>{b.budgetName??"No active budget"}</strong><span>{dateLabel(b.startsOn,board.profile.locale,board.profile.timeZone)} – {dateLabel(b.endsOn,board.profile.locale,board.profile.timeZone)}</span>
     {attention?<span className="sc-plan-alert-count">{attention} allocations need review</span>:null}</div>
   {!b.configured?<PlanBudgetSetup workspace={workspace} board={board}/>:
   <>
    <div className="sc-plan-kpis">
     <PlanKpi board={board} label="Safe to spend" value={b.safeToSpendMinor} note="Calculated allocation headroom, not cash in bank" tone="positive"/>
     <PlanKpi board={board} label="Budget remaining" value={b.remainingMinor} note="Effective plan minus actual spending"/>
     <PlanKpi board={board} label="Spent this period" value={b.actualSpendMinor} note="Actual posted spending"/>
     <PlanKpi board={board} label="Expected future bills" value={b.futureRecurringExpenseMinor} note="Unposted recurring commitments" tone="warning"/>
    </div>
    <div className="sc-plan-grid">
     <section className="sc-plan-section sc-plan-chart"><div className="sc-plan-section-title"><div><span className="sc-eyebrow">SPENDING PACE</span><h2>Actual vs. plan</h2></div></div>
      {points.length?<FinanceTrend title="Period spending" description="Cumulative actual posted spend versus cumulative planned allocation; future actuals not invented." points={points} currency={currency}/>:
       <p className="sc-plan-empty">No verified trend points are available for this budget period.</p>}
      <div className="sc-plan-forecast"><span>Estimated period-end spending <MoneyOrUnknown value={b.projectedSpendMinor} board={board}/></span>
        <DataProvenance source="forecast"/></div></section>
     <section className="sc-plan-section sc-plan-obligations"><div className="sc-plan-section-title"><div><span className="sc-eyebrow">COMING UP</span><h2>Recurring commitments</h2></div>
        <button type="button" onClick={()=>onNavigate("/plan/recurring")}>Open recurring <Icon name="chevronRight" size={14}/></button></div>
      {commitments.length?commitments.map(c=><div className="sc-plan-obligation" key={c.patternId+":"+c.expectedAt}>
         <span><strong>{board.availableCategories.find(x=>x.categoryId===c.categoryId)?.path.join(" / ")||"Recurring expense"}</strong>
           <small>{dateLabel(c.expectedAt,board.profile.locale,board.profile.timeZone)} · expected, not posted</small></span><MoneyValue amountMinor={c.amountMinor} currency={c.currencyCode}/></div>):
        <p className="sc-plan-empty">No tracked upcoming expenses in this plan period.</p>}
      <DataProvenance source="forecast"/></section>
    </div>
    <section className="sc-plan-section sc-plan-allocations"><div className="sc-plan-section-title"><div><span className="sc-eyebrow">CATEGORY ALLOCATIONS</span>
         <h2>{totals.length} category {totals.length===1?"budget":"budgets"}</h2></div>
       <span className="sc-plan-section-meta">Sorted by overspend and attention</span></div>
      <PlanIncome board={board} workspace={workspace}/>
      {b.unallocatedSpendMinor!==null&&b.unallocatedSpendMinor>0?<p className="sc-plan-alert">
        Unallocated posted spending: <MoneyOrUnknown value={b.unallocatedSpendMinor} board={board}/>. Review uncategorized transactions in Activity.</p>:null}
      <div className="sc-plan-allocation-list">{totals.length?totals.map(a=><AllocationEditor key={a.allocationId} allocation={a} board={board}
         workspace={workspace} busy={!!workspace.busyKey}/>):
         <p className="sc-plan-empty">No category limits yet. Add your first allocation below.</p>}</div>
      <AddPlanAllocation board={board} workspace={workspace}/>
    </section>
    <section className="sc-plan-shortcuts"><button type="button" onClick={()=>onNavigate("/plan/goals")}>
       View {board.goals.length} saving goal{board.goals.length===1?"":"s"} <Icon name="chevronRight" size={14}/></button>
       <button type="button" onClick={()=>onNavigate("/activity")}>Review spending in Activity <Icon name="chevronRight" size={14}/></button></section>
   </>}
  </>}
  <p className="sc-plan-footnote"><DataProvenance source="planned"/> Plan figures and projections come from your account-scoped budget service. Planning alone does not move money.</p>
 </div>;
}
export function PlanningPage({mode,onNavigate}:{mode:Mode;onNavigate:(path:string)=>void}){
 const [anchor,setAnchor]=useState(()=>{
   const q=new URLSearchParams(typeof window!=="undefined"?window.location.search:"");
   const raw=q.get("period");
   return raw&&validPlanAnchor(raw)?raw:"";
 });
 const workspace=usePlanningWorkspace(anchor||null);
 useEffect(()=>{
  const sync=()=>{
   const q=new URLSearchParams(window.location.search),raw=q.get("period");
   setAnchor(raw&&validPlanAnchor(raw)?raw:"");
  };
  window.addEventListener("popstate",sync);window.addEventListener("finance:navigate",sync);
  return()=>{window.removeEventListener("popstate",sync);window.removeEventListener("finance:navigate",sync);};
 },[]);
 function anchorChange(date:string){
  setAnchor(date);
  const suffix=date?"?period="+date:"";
  onNavigate((mode==="goals"?"/plan/goals":"/plan")+suffix);
 }
 if(workspace.state==="loading")return <div className="sc-plan"><FinancialState kind="loading" title="Loading plan" description="Retrieving your private budget and goals."/></div>;
 if(workspace.state!=="ready"||!workspace.dashboard)return <div className="sc-plan"><FinancialState kind="error"
   title="Plan unavailable" description={workspace.error??"Your planning data could not be loaded."}
   primaryAction={{label:"Retry",onClick:()=>void workspace.refresh()}}/></div>;
 return <SignalPlanView dashboard={workspace.dashboard} workspace={workspace} mode={mode} onNavigate={onNavigate}
   anchor={anchor} onAnchor={anchorChange}/>;
}
