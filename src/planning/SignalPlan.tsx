import {useEffect,useMemo,useState,type FormEvent} from "react";
import type {BudgetPeriodKind,PlanningAllocation,PlanningDashboard} from "../domain/planning.js";
import {FinanceButton,MoneyValue,DataProvenance,FinancialState,FinanceTrend} from "../ui/v2/SignalCurrent.js";
import {currencyMinorDigits} from "../ui/v2/finance-presentation.js";
import type {PlanningWorkspace} from "./use-planning.js";
import {usePlanningWorkspace} from "./use-planning.js";
import {canCommitPlanAllocation,parsePlanMoney,planMoneyInput,planPercent,planPeriodLabel,planStatusCopy,
  planTrend,safePlanValue,shiftPlanPeriod,sortedAllocations,verifiedAnchor} from "./signal-plan-model.js";
import "./signal-plan.css";
const cadences:{value:BudgetPeriodKind;name:string}[]=[
 {value:"weekly",name:"Weekly"},{value:"monthly",name:"Monthly"},
 {value:"quarterly",name:"Quarterly"},{value:"yearly",name:"Yearly"}
];
function Actual({value,dashboard,tone}:{
 value:number|null|undefined;dashboard:PlanningDashboard;tone?:"negative"|"positive"|"default"}){
 const safe=safePlanValue(value);
 return safe===null?<span className="sc-plan-unavailable">Not available</span>:
  <MoneyValue amountMinor={safe} currency={dashboard.profile.currencyCode}
   locale={dashboard.profile.locale} tone={tone??(safe<0?"negative":"default")}/>;
}
function Setup({workspace,dashboard}: {workspace:PlanningWorkspace;dashboard:PlanningDashboard}){
 const [name,setName]=useState("Monthly budget");
 const [kind,setKind]=useState<BudgetPeriodKind>("monthly");
 const [income,setIncome]=useState("");
 const minor=income.trim()?parsePlanMoney(income):null;
 const valid=!!name.trim() && (!income.trim()||minor!==null);
 function submit(event:FormEvent){
  event.preventDefault();if(!valid||workspace.busyKey)return;
  void workspace.setupBudget({name:name.trim(),periodKind:kind,plannedIncomeMinor:minor});
 }
 return <section className="sc-plan-setup"><div><span className="sc-eyebrow">FIRST PLAN</span>
  <h2>Define your spending plan</h2><p>Choose a period and your expected income. Then allocate category limits using your actual budget records.</p></div>
  <form onSubmit={submit}>
   <label>Budget name<input required value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></label>
   <label>Frequency<select value={kind} onChange={e=>setKind(e.target.value as BudgetPeriodKind)}>
    {cadences.map(c=><option key={c.value} value={c.value}>{c.name}</option>)}</select></label>
   <label>Expected income · {dashboard.profile.currencyCode}<input inputMode="decimal"
     placeholder="Optional (e.g. 1800,00)" value={income} onChange={e=>setIncome(e.target.value)}
     aria-invalid={!!income&&minor===null}/></label>
   <FinanceButton disabled={!valid||!!workspace.busyKey} type="submit">{workspace.busyKey?"Creating…":"Create budget"}</FinanceButton>
  </form>
  <p className="sc-plan-footnote">A budget is an estimate and not an account balance. No transfer or ledger entry is created.</p>
 </section>;
}
function IncomeEditor({workspace,dashboard}:{workspace:PlanningWorkspace;dashboard:PlanningDashboard}){
 const [editing,setEditing]=useState(false);
 const [amount,setAmount]=useState(()=>planMoneyInput(dashboard.budget.plannedIncomeMinor));
 useEffect(()=>{setAmount(planMoneyInput(dashboard.budget.plannedIncomeMinor))},[dashboard.budget.plannedIncomeMinor]);
 const valid=amount.trim()===""||parsePlanMoney(amount)!==null;
 return <div className="sc-plan-income">
   <div><span className="sc-eyebrow">EXPECTED INCOME</span><strong><Actual value={dashboard.budget.plannedIncomeMinor} dashboard={dashboard}/></strong>
    <small>Planned estimate, not posted income</small></div>
   {!editing?<FinanceButton variant="secondary" onClick={()=>setEditing(true)}>Edit income</FinanceButton>:
    <form onSubmit={e=>{e.preventDefault();if(!valid||workspace.busyKey)return;void workspace.updatePlannedIncome(amount.trim()?parsePlanMoney(amount):null);setEditing(false)}}>
     <label>Expected income · {dashboard.profile.currencyCode}<input value={amount}
       inputMode="decimal" onChange={e=>setAmount(e.target.value)} aria-invalid={!valid} autoFocus/></label>
     <FinanceButton type="submit" disabled={!valid||!!workspace.busyKey}>Save</FinanceButton>
     <FinanceButton variant="quiet" onClick={()=>{setEditing(false);setAmount(planMoneyInput(dashboard.budget.plannedIncomeMinor))}}>Cancel</FinanceButton>
    </form>}
  </div>;
}
function AllocationRow({allocation,dashboard,workspace}:{
 allocation:PlanningAllocation;dashboard:PlanningDashboard;workspace:PlanningWorkspace;
}){
 const [edit,setEdit]=useState(false),[confirmRemove,setConfirmRemove]=useState(false);
 const [amount,setAmount]=useState(planMoneyInput(allocation.plannedMinor)),[rollover,setRollover]=useState(allocation.rollover);
 useEffect(()=>{setAmount(planMoneyInput(allocation.plannedMinor));setRollover(allocation.rollover);setEdit(false);setConfirmRemove(false)},
  [allocation.plannedMinor,allocation.rollover,allocation.allocationId]);
 const busy=!!workspace.busyKey;
 const parsed=parsePlanMoney(amount);
 const percent=planPercent(allocation.spentMinor,allocation.effectivePlannedMinor);
 const label=allocation.status.replaceAll("_"," ");
 const isRisk=allocation.status==="over"||allocation.status==="at_risk";
 function save(e:FormEvent){
  e.preventDefault();if(parsed===null||busy||!dashboard.budget.periodId)return;
  void workspace.saveAllocation({
   allocationId:allocation.allocationId,budgetPeriodId:dashboard.budget.periodId,
   categoryId:allocation.categoryId,plannedMinor:parsed,rollover,
  });setEdit(false);
 }
 return <div className={"sc-plan-allocation"+(isRisk?" sc-plan-allocation--risk":"")}>
   <div className="sc-plan-allocation__main"><div className="sc-plan-allocation__identity">
     <strong>{allocation.categoryName}</strong><small>{allocation.categoryPath.join(" › ")}</small>
     <span className={"sc-plan-status sc-plan-status--"+allocation.status}>{label}{allocation.rollover?" · rollover":""}</span>
   </div><div className="sc-plan-allocation__figures"><strong><Actual value={allocation.spentMinor} dashboard={dashboard}/></strong>
     <span>of <Actual value={allocation.effectivePlannedMinor} dashboard={dashboard}/></span></div></div>
   <div className="sc-plan-allocation__meter" role="progressbar" aria-label={allocation.categoryName+" spending"}
     aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
     <span style={{width:percent+"%"}}/></div>
   <div className="sc-plan-allocation__footer"><div><span>Remaining <Actual value={allocation.remainingMinor} dashboard={dashboard}/></span>
     <span>Projected <Actual value={allocation.projectedSpendMinor} dashboard={dashboard}/></span>
     {allocation.carryInMinor!==0?<span>Carry <Actual value={allocation.carryInMinor} dashboard={dashboard}/></span>:null}
     {allocation.futureRecurringMinor>0?<span>Scheduled <Actual value={allocation.futureRecurringMinor} dashboard={dashboard}/></span>:null}</div>
     {!edit&&!confirmRemove?<button type="button" className="sc-plan-link" onClick={()=>setEdit(true)}>Adjust</button>:null}</div>
   {edit?<form className="sc-plan-allocation__edit" onSubmit={save}>
      <label>Category limit · {dashboard.profile.currencyCode}<input inputMode="decimal" value={amount}
        onChange={e=>setAmount(e.target.value)} aria-invalid={parsed===null} required/></label>
      <label className="sc-plan-check"><input type="checkbox" checked={rollover} onChange={e=>setRollover(e.target.checked)}/> Carry unused funds into next period</label>
      <FinanceButton disabled={busy||parsed===null} type="submit">Save limit</FinanceButton>
      <FinanceButton disabled={busy} variant="quiet" onClick={()=>{setEdit(false);setAmount(planMoneyInput(allocation.plannedMinor))}}>Cancel</FinanceButton>
      <button type="button" className="sc-plan-link sc-plan-link--danger" disabled={busy} onClick={()=>{setEdit(false);setConfirmRemove(true)}}>Remove allocation</button>
    </form>:null}
   {confirmRemove?<div className="sc-plan-remove" role="group" aria-label={"Remove "+allocation.categoryName+" allocation"}>
     <strong>Remove this category limit?</strong><p>Spending remains in Activity. Only the budget allocation is removed.</p>
     <FinanceButton variant="danger" disabled={busy} onClick={()=>{void workspace.deleteAllocation(allocation.allocationId)}}>Confirm removal</FinanceButton>
     <FinanceButton variant="secondary" disabled={busy} onClick={()=>setConfirmRemove(false)}>Keep limit</FinanceButton></div>:null}
  </div>;
}
function AddAllocation({dashboard,workspace}:{
 dashboard:PlanningDashboard;workspace:PlanningWorkspace;
}){
 const [open,setOpen]=useState(false),[categoryId,setCategoryId]=useState(""),[amount,setAmount]=useState(""),[rollover,setRollover]=useState(false);
 const categories=dashboard.availableCategories.filter(c=>!dashboard.allocations.some(a=>a.categoryId===c.categoryId));
 const minor=parsePlanMoney(amount);
 const valid=minor!==null&&canCommitPlanAllocation(dashboard,minor,categoryId);
 function submit(e:FormEvent){
  e.preventDefault();if(!valid||minor===null||!dashboard.budget.periodId||workspace.busyKey)return;
  void workspace.saveAllocation({budgetPeriodId:dashboard.budget.periodId,categoryId,plannedMinor:minor,rollover});
  // Leave form values intact until server refresh confirms the write.
 }
 useEffect(()=>{
  if(dashboard.allocations.some(a=>a.categoryId===categoryId)){
    setOpen(false);setCategoryId("");setAmount("");setRollover(false);
  }
 },[dashboard.allocations,categoryId]);
 return <div className="sc-plan-add">
   {!open?<FinanceButton variant="secondary" onClick={()=>setOpen(true)} disabled={!categories.length}>Add category limit</FinanceButton>:
   <form onSubmit={submit}><label>Category<select value={categoryId} required onChange={e=>setCategoryId(e.target.value)}>
     <option value="">Select category</option>{categories.map(c=><option key={c.categoryId} value={c.categoryId}>{c.path.join(" › ")}</option>)}</select></label>
     <label>Limit · {dashboard.profile.currencyCode}<input value={amount} required inputMode="decimal"
       aria-invalid={amount!==""&&minor===null} placeholder="150,00" onChange={e=>setAmount(e.target.value)}/></label>
     <label className="sc-plan-check"><input type="checkbox" checked={rollover} onChange={e=>setRollover(e.target.checked)}/> Rollover</label>
     <FinanceButton type="submit" disabled={!valid||!!workspace.busyKey}>Save category</FinanceButton>
     <FinanceButton variant="quiet" onClick={()=>setOpen(false)}>Cancel</FinanceButton>
   </form>}
  </div>;
}
export function SignalPlanView({dashboard,workspace,onNavigate,onPeriod}:{
 dashboard:PlanningDashboard;workspace:PlanningWorkspace;
 onNavigate:(path:string)=>void;onPeriod:(offset:number)=>void;
}){
 const b=dashboard.budget,ccy=dashboard.profile.currencyCode,locale=dashboard.profile.locale;
 const money=(amount:number|null|undefined)=><Actual value={amount} dashboard={dashboard}/>;
 const points=planTrend(dashboard);
 const tone=b.status==="over"||b.status==="overplanned"?"danger":b.status==="at_risk"?"warning":"normal";
 const busy=!!workspace.busyKey;
 return <div className="sc-plan" data-testid="finance-plan-workspace">
   <header className="sc-plan-heading"><div><span className="sc-eyebrow">BUDGET & ALLOCATIONS</span><h1>Plan</h1>
     <p>{b.configured?planPeriodLabel(dashboard):"Make a realistic plan for your spending."}</p></div>
     <div className="sc-plan-heading__tools">
       {b.configured?<nav className="sc-plan-period" aria-label="Budget period">
         <button type="button" disabled={b.periodKind==="custom"||busy} onClick={()=>onPeriod(-1)} aria-label="Previous period">‹</button>
         <button type="button" disabled={busy} onClick={()=>onNavigate("/plan")} aria-label="Current period">Current</button>
         <button type="button" disabled={b.periodKind==="custom"||busy} onClick={()=>onPeriod(1)} aria-label="Next period">›</button>
       </nav>:null}
       <FinanceButton variant="secondary" onClick={()=>onNavigate("/plan/goals")}>Savings goals</FinanceButton>
       <FinanceButton variant="quiet" disabled={busy} onClick={()=>void workspace.refresh()}>Refresh</FinanceButton>
     </div>
   </header>
   {workspace.actionError?<p role="alert" className="sc-plan-error">{workspace.actionError}</p>:null}
   {!b.configured?<Setup dashboard={dashboard} workspace={workspace}/>:
   <>
    <section className={"sc-plan-position sc-plan-position--"+tone} aria-label="Budget position">
      <div className="sc-plan-position__primary"><span className="sc-eyebrow">SAFE TO SPEND · PLANNED ESTIMATE</span>
        <strong>{money(b.safeToSpendMinor)}</strong><p>Budget-based projection after planned obligations. Not a bank balance.</p>
        <span className="sc-plan-condition">{planStatusCopy[b.status]}</span></div>
      <div className="sc-plan-position__other">
       <div><span>Planned limit</span><strong>{money(b.effectivePlannedMinor)}</strong></div>
       <div><span>Posted spending</span><strong>{money(b.actualSpendMinor)}</strong></div>
       <div><span>Remaining allocated</span><strong>{money(b.remainingMinor)}</strong></div>
       <div><span>Projected spending</span><strong>{money(b.projectedSpendMinor)}</strong></div>
      </div>
    </section>
    <IncomeEditor workspace={workspace} dashboard={dashboard}/>
    <div className="sc-plan-body">
      <section className="sc-plan-panel sc-plan-categories"><div className="sc-plan-panel__heading"><div>
        <span className="sc-eyebrow">CATEGORY LIMITS</span><h2>Where your money goes</h2></div>
        <span className="sc-plan-count">{dashboard.allocations.length} allocated</span></div>
       {dashboard.allocations.length===0?<p className="sc-plan-empty">No category limits yet. Allocate spending categories to calculate your remaining budget.</p>:
         <div className="sc-plan-categories__list">{sortedAllocations(dashboard.allocations).map(a=>
           <AllocationRow key={a.allocationId} allocation={a} dashboard={dashboard} workspace={workspace}/>)}</div>}
       <AddAllocation dashboard={dashboard} workspace={workspace}/>
      </section>
      <aside className="sc-plan-sidebar">
       <section className="sc-plan-panel"><div className="sc-plan-panel__heading"><div><span className="sc-eyebrow">PLANNING OUTLOOK</span><h2>Spending pace</h2></div></div>
         {points.length?<FinanceTrend title="Actual versus plan" description="Cumulative posted expenses versus the budget allocation, not an automatic prediction" currency={ccy} points={points}/>:
           <p className="sc-plan-empty">No comparable trend is available for this budget period.</p>}
         <DataProvenance source="planned"/>
       </section>
       <section className="sc-plan-panel"><div className="sc-plan-panel__heading"><div><span className="sc-eyebrow">FUTURE OBLIGATIONS</span><h2>Upcoming commitments</h2></div>
          <button type="button" className="sc-plan-link" onClick={()=>onNavigate("/plan/recurring")}>Manage</button></div>
          {dashboard.commitments.filter(c=>c.transactionType==="expense"&&c.currencyCode===ccy).length===0?
            <p className="sc-plan-empty">No scheduled expense commitments in this period.</p>:
            dashboard.commitments.filter(c=>c.transactionType==="expense"&&c.currencyCode===ccy).slice(0,6).map(c=>
             <div className="sc-plan-commitment" key={c.patternId+":"+c.expectedAt}>
                <span>{new Intl.DateTimeFormat(locale,{month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(c.expectedAt))}</span>
                <span>{dashboard.availableCategories.find(x=>x.categoryId===c.categoryId)?.name??"Recurring expense"}</span>
                <strong>{money(c.amountMinor)}</strong></div>)}
         <p className="sc-plan-footnote">Forecast obligations are not already-posted transactions.</p>
       </section>
       <section className="sc-plan-panel"><div className="sc-plan-panel__heading"><div><span className="sc-eyebrow">SAVINGS</span><h2>Goals this period</h2></div>
        <button type="button" className="sc-plan-link" onClick={()=>onNavigate("/plan/goals")}>Open goals</button></div>
        <div className="sc-plan-goals-summary"><div><span>Period funding target</span><strong>{money(b.goalPeriodTargetMinor)}</strong></div>
         <div><span>Contributed</span><strong>{money(b.goalPeriodContributedMinor)}</strong></div>
         <div><span>Remaining</span><strong>{money(b.goalFundingRemainingMinor)}</strong></div></div>
        <p className="sc-plan-footnote">Goal tracking is not a confirmed transfer between bank accounts.</p>
       </section>
       <section className="sc-plan-panel"><span className="sc-eyebrow">BUDGET RECONCILIATION</span>
         <div className="sc-plan-reconcile"><span>Allocated spending</span><strong>{money(b.allocatedSpendMinor)}</strong>
           <span>Unallocated spending</span><strong>{money(b.unallocatedSpendMinor)}</strong>
           <span>Unassigned plan</span><strong>{money(b.unallocatedPlanMinor)}</strong>
           <span>Future recurring expenses</span><strong>{money(b.futureRecurringExpenseMinor)}</strong></div>
         <p className="sc-plan-footnote">Values are read from the account-scoped planning service, never reconstructed from the UI.</p>
       </section>
      </aside>
    </div>
   </>}
 </div>;
}
export function SignalPlanPage({onNavigate}:{onNavigate:(path:string)=>void}){
 const [anchor,setAnchor]=useState<string|null>(()=>verifiedAnchor(new URLSearchParams(window.location.search).get("period")));
 useEffect(()=>{
  const sync=()=>{if(location.pathname==="/plan")setAnchor(verifiedAnchor(new URLSearchParams(location.search).get("period")))};
  window.addEventListener("popstate",sync);window.addEventListener("finance:navigate",sync);
  return()=>{window.removeEventListener("popstate",sync);window.removeEventListener("finance:navigate",sync)};
 },[]);
 const workspace=usePlanningWorkspace(anchor);
 const dashboard=workspace.dashboard;
 function changePeriod(offset:number){
   if(!dashboard)return;
   const next=shiftPlanPeriod(anchor??dashboard.anchorDate,dashboard.budget.periodKind,offset);
   if(next){setAnchor(next);onNavigate("/plan?period="+next)}
 }
 if(workspace.state==="loading")return <div className="sc-plan sc-plan-loading" aria-busy="true"><span className="sc-eyebrow">BUDGET</span><h1>Plan</h1>
   <div className="sc-plan-skeleton"/><div className="sc-plan-skeleton"/></div>;
 if(workspace.state!=="ready"||!dashboard)return <FinancialState
   kind={workspace.state==="unconfigured"?"error":workspace.state==="unauthenticated"?"sign-in":"offline"}
   title="Budget unavailable" description={workspace.error??"The budget could not be loaded. Your financial records were not changed."}
   primaryAction={{label:"Retry",onClick:()=>void workspace.refresh()}}/>;
 if(currencyMinorDigits(dashboard.profile.currencyCode)!==2)return <FinancialState kind="error"
   title="Unsupported budgeting precision" description="This budget uses a currency with unsupported decimal precision. Edits are disabled to prevent inaccurate amounts."/>;
 return <SignalPlanView dashboard={dashboard} workspace={workspace} onNavigate={onNavigate} onPeriod={changePeriod}/>;
}
