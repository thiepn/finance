import {useEffect,useMemo,useState,type FormEvent,type ReactNode,type MouseEvent} from "react";
import type {CategoryNode,ClassificationRule,MerchantSummary,CreateClassificationRuleInput} from "../domain/classification.js";
import type {FinanceClassificationService} from "../services/classification.js";
import {SupabaseFinanceClassificationService} from "../services/supabase-classification.js";
import {createFinanceBrowserRuntime} from "../integrations/supabase-client.js";
import {useProductCatalog} from "./use-product-intelligence.js";
import {FinanceButton,FinancialState,DataProvenance} from "../ui/v2/SignalCurrent.js";
import {formatSignalMoney} from "../ui/v2/finance-presentation.js";
import {merchantSearch,merchantExploreHref,safeRuleSummary,validRuleDraft} from "./signal-product-model.js";
import "./signal-products.css";
function Nav({href,onNavigate,children}:{href:string|null;onNavigate:(path:string)=>void;children:ReactNode}){
 const click=(e:MouseEvent<HTMLAnchorElement>)=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;e.preventDefault();if(href)onNavigate(href);};
 return href?<a className="sc-product-link" href={href} onClick={click}>{children}</a>:<span className="sc-product-unavailable">{children}</span>;
}
function useClassificationService():FinanceClassificationService|null {
 const runtime=useMemo(createFinanceBrowserRuntime,[]);
 return useMemo(()=>runtime?new SupabaseFinanceClassificationService(runtime.rpcClient):null,[runtime]);
}
export function SignalMerchantsView({rows,currency,onNavigate,onCreate,onAlias,busy=false}:{
 rows:readonly MerchantSummary[];currency:{code:string;locale:string}|null;onNavigate:(path:string)=>void;
 onCreate:(name:string)=>Promise<void>;onAlias:(id:string,name:string)=>Promise<void>;busy?:boolean;
}){
 const [query,setQuery]=useState("");const [newName,setNewName]=useState("");
 const [selected,setSelected]=useState<string|null>(null);const [alias,setAlias]=useState("");const [confirmAlias,setConfirmAlias]=useState(false);
 const [error,setError]=useState(false);
 const visible=merchantSearch(rows,query);
 const add=async(e:FormEvent)=>{e.preventDefault();if(!newName.trim()||busy)return;setError(false);try{await onCreate(newName.trim());setNewName("");}catch{setError(true)}};
 const saveAlias=async(e:FormEvent)=>{e.preventDefault();if(!selected||!alias.trim()||!confirmAlias||busy)return;setError(false);
 try{await onAlias(selected,alias.trim());setAlias("");setConfirmAlias(false);}catch{setError(true)}};
 return <div className="sc-products"><header className="sc-products-header"><div><span className="sc-eyebrow">Signal Current / Merchant intelligence</span>
 <h1>Merchants</h1><p>Normalized merchant names, confirmed aliases and ledger-derived history.</p></div>
 <Nav href="/explore" onNavigate={onNavigate}>Explore spending →</Nav></header>
 <div className="sc-products-layout"><section className="sc-products-catalog" aria-label="Merchant directory"><label>Find merchants
 <input value={query} aria-label="Find merchants" placeholder="Search names and aliases" onChange={e=>setQuery(e.currentTarget.value)} /></label>
 <p className="sc-products-count">{visible.length} merchants</p>
 <div className="sc-products-list">{visible.map(m=><button type="button" aria-pressed={selected===m.id} className="sc-product-row sc-merchant-select" key={m.id}
 onClick={()=>{setSelected(m.id);setConfirmAlias(false);setAlias("");}}><strong>{m.name}</strong>
 <small>{m.merchantGroup??"Independent"} · {m.aliases.length} aliases</small></button>)}</div>
 {!visible.length?<p className="sc-products-muted">No matching merchants.</p>:null}
 <form className="sc-product-create" onSubmit={add}><label>Add a normalized merchant
 <input value={newName} onChange={e=>setNewName(e.currentTarget.value)} maxLength={120}/></label>
 <FinanceButton disabled={busy||newName.trim().length<2} type="submit">Add merchant</FinanceButton></form></section>
 <section className="sc-products-detail" aria-label="Merchant details">{selected&&rows.some(m=>m.id===selected)?(()=>{
 const m=rows.find(row=>row.id===selected)!;
 return <><div className="sc-products-detail-header"><div><span className="sc-eyebrow">Merchant profile</span><h2>{m.name}</h2><p>{m.merchantGroup??"No merchant group"} · {m.purchaseCount} linked purchases</p></div>
 <Nav href={merchantExploreHref(m.id)} onNavigate={onNavigate}>Analyze spending →</Nav></div>
 <div className="sc-product-metrics"><div><span>Net ledger spending</span><strong>{currency?formatSignalMoney(m.netSpendMinor,currency.code,currency.locale):"Currency not verified"}</strong>
 <DataProvenance source="posted"/></div><div><span>Stored aliases</span><strong>{m.aliases.length}</strong><small>User and recognized names</small></div></div>
 <section className="sc-products-panel"><h3>Known aliases</h3><div className="sc-products-ranked">{m.aliases.map(a=><div className="sc-products-rank" key={a.id}>
 <span><strong>{a.rawName}</strong><small>{a.source} · {a.timesConfirmed} confirmations</small></span></div>)}
 {!m.aliases.length?<p className="sc-products-muted">No aliases recorded.</p>:null}</div></section>
 <section className="sc-products-panel"><h3>Record a merchant alias</h3><p>Aliases influence merchant resolution. Review the exact spelling before saving.</p>
 <form onSubmit={saveAlias} className="sc-product-create"><label>Additional name
 <input value={alias} maxLength={160} onChange={e=>{setAlias(e.currentTarget.value);setConfirmAlias(false)}} aria-label="Merchant alias" /></label>
 {alias.trim().length>=2?<label className="sc-product-confirm"><input type="checkbox" checked={confirmAlias} onChange={e=>setConfirmAlias(e.currentTarget.checked)}/>
 Confirm alias “{alias.trim()}” for {m.name}</label>:null}
 <FinanceButton type="submit" disabled={!confirmAlias||alias.trim().length<2||busy}>Save alias</FinanceButton></form></section></>;
 })():<FinancialState kind="empty" title="Select a merchant" description="Review aliases and evidence-backed spending, or create a merchant."/ >}
 </section></div>
 {error?<p role="alert" className="sc-product-error">Unable to save. No success is claimed; verify account permissions and retry.</p>:null}
 <p className="sc-products-footnote">Spending is reported only when an authenticated Finance profile confirms its display currency. Merchant aliases are user-governed writes.</p></div>;
}
export function SignalMerchantsPage({onNavigate}:{onNavigate:(path:string)=>void}){
 const service=useClassificationService();const catalog=useProductCatalog("");
 const [rows,setRows]=useState<readonly MerchantSummary[]>([]);const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;if(!service){setStatus("error");return;}
 void service.getMerchants().then(v=>{if(active){setRows(v);setStatus("ready")}}).catch(()=>{if(active)setStatus("error")});
 return()=>{active=false}},[service]);
 const refresh=async()=>{if(!service)return;setRows(await service.getMerchants())};
 const create=async(name:string)=>{if(!service||busy)throw Error("Unavailable");setBusy(true);
 try{await service.upsertMerchant({name});await refresh()}finally{setBusy(false)}};
 const addAlias=async(id:string,name:string)=>{if(!service||busy)throw Error("Unavailable");setBusy(true);
 try{await service.addMerchantAlias(id,name);await refresh()}finally{setBusy(false)}};
 if(status!=="ready")return <FinancialState kind={status==="loading"?"loading":"error"} title="Merchant directory unavailable"
  description="Finance could not load account-scoped merchant records." />;
 const currency=catalog.state==="ready"&&catalog.catalog?{code:catalog.catalog.profile.currencyCode,locale:catalog.catalog.profile.locale}:null;
 return <SignalMerchantsView rows={rows} currency={currency} onNavigate={onNavigate} onCreate={create} onAlias={addAlias} busy={busy}/>;
}
type PreviewField="merchant_name_contains"|"description_contains";
export function SignalRulesView({rules,categories,onCreate,onUpdate,onDelete,busy=false}:{
 rules:readonly ClassificationRule[];categories:readonly CategoryNode[];
 onCreate:(input:CreateClassificationRuleInput)=>Promise<void>;
 onUpdate:(rule:ClassificationRule,enabled:boolean)=>Promise<void>;
 onDelete:(rule:ClassificationRule)=>Promise<void>;busy?:boolean;
}){
 const [name,setName]=useState("");const [pattern,setPattern]=useState("");const [field,setField]=useState<PreviewField>("merchant_name_contains");
 const [category,setCategory]=useState("");const [sample,setSample]=useState("");const [confirmDelete,setConfirmDelete]=useState<string|null>(null);
 const [error,setError]=useState(false);
 const valid=validRuleDraft(name,pattern,category,categories);
 const preview=sample.trim()?sample.toLocaleLowerCase().includes(pattern.trim().toLocaleLowerCase()):null;
 const create=async(e:FormEvent)=>{e.preventDefault();if(!valid||busy)return;setError(false);
 try{await onCreate({name:name.trim(),scope:"transaction",condition:{[field]:pattern.trim()},action:{category_id:category},priority:1000});setName("");setPattern("");setSample("");setCategory("");}
 catch{setError(true)}};
 const toggle=async(rule:ClassificationRule)=>{setError(false);try{await onUpdate(rule,!rule.enabled)}catch{setError(true)}};
 const remove=async(rule:ClassificationRule)=>{if(confirmDelete!==rule.id||busy)return;setError(false);
 try{await onDelete(rule);setConfirmDelete(null)}catch{setError(true)}};
 return <div className="sc-products sc-rules"><header className="sc-products-header"><div><span className="sc-eyebrow">Signal Current / Rules</span>
 <h1>Classification rules</h1><p>Transparent matching, explicit changes, no automatic rewriting of posted history.</p></div></header>
 <div className="sc-products-layout"><section className="sc-products-catalog"><h2>Create rule</h2>
 <form className="sc-product-create" onSubmit={create}><label>Rule name<input aria-label="Rule name" value={name} onChange={e=>setName(e.currentTarget.value)} maxLength={120}/></label>
 <label>Match source<select aria-label="Match source" value={field} onChange={e=>setField(e.currentTarget.value as PreviewField)}><option value="merchant_name_contains">Merchant contains</option><option value="description_contains">Description contains</option></select></label>
 <label>Match text<input aria-label="Match text" value={pattern} onChange={e=>setPattern(e.currentTarget.value)} maxLength={160}/></label>
 <label>Assign category<select aria-label="Assign category" value={category} onChange={e=>setCategory(e.currentTarget.value)}><option value="">Choose category</option>
 {categories.filter(c=>!c.isArchived&&c.kind!=="income").map(c=><option key={c.id} value={c.id}>{c.namePath.join(" / ")||c.name}</option>)}</select></label>
 <div className="sc-product-preview"><strong>Illustrative match preview</strong><p>Enter a sample {field==="merchant_name_contains"?"merchant name":"transaction description"} below. This only tests substring matching locally; it does not execute the backend rule engine.</p>
 <label>Sample input<input value={sample} aria-label="Sample input" onChange={e=>setSample(e.currentTarget.value)}/></label>
 <p role="status">{preview===null?"Enter a sample to evaluate.":preview?"Sample contains the rule text.":"Sample does not contain the rule text."}</p></div>
 <FinanceButton type="submit" disabled={busy||!valid}>Create rule</FinanceButton></form></section>
 <section className="sc-products-detail"><h2>Saved rules</h2><div className="sc-products-ranked">{rules.map(rule=><div className="sc-rule-row" key={rule.id}>
 <div><strong>{rule.name}</strong><p>{safeRuleSummary(rule)}</p><small>{rule.scope} · priority {rule.priority} · {rule.matchCount} historical matches · {rule.enabled?"Enabled":"Paused"}</small></div>
 <div className="sc-product-actions"><FinanceButton variant="secondary" disabled={busy} onClick={()=>void toggle(rule)}>{rule.enabled?"Pause":"Enable"}</FinanceButton>
 {confirmDelete===rule.id?<><span>Delete this rule? This action is permanent.</span>
 <FinanceButton variant="danger" disabled={busy} onClick={()=>void remove(rule)}>Confirm delete</FinanceButton>
 <FinanceButton variant="quiet" onClick={()=>setConfirmDelete(null)}>Cancel</FinanceButton></>:
 <FinanceButton variant="quiet" disabled={busy} onClick={()=>setConfirmDelete(rule.id)}>Delete</FinanceButton>}</div>
 </div>)}{!rules.length?<p className="sc-products-muted">No classification rules yet.</p>:null}</div></section></div>
 {error?<p role="alert" className="sc-product-error">The rule operation failed. Nothing is represented as saved until the server confirms it.</p>:null}
 <p className="sc-products-footnote">Creating, enabling and deleting rules uses existing account-scoped Finance RPCs. The preview is explicitly illustrative, not a production match simulation.</p></div>;
}
export function SignalRulesPage(){
 const service=useClassificationService();const [rules,setRules]=useState<readonly ClassificationRule[]>([]);
 const [categories,setCategories]=useState<readonly CategoryNode[]>([]);const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");const [busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;if(!service){setStatus("error");return;}
 void Promise.all([service.getRules(),service.getCategories()]).then(([rs,cs])=>{if(active){setRules(rs);setCategories(cs);setStatus("ready")}}).catch(()=>{if(active)setStatus("error")});
 return()=>{active=false}},[service]);
 const refresh=async()=>{if(!service)return;const [rs,cs]=await Promise.all([service.getRules(),service.getCategories()]);setRules(rs);setCategories(cs)};
 const perform=async(action:()=>Promise<unknown>)=>{if(busy)throw Error("Busy");setBusy(true);try{await action();await refresh()}finally{setBusy(false)}};
 if(status!=="ready")return <FinancialState kind={status==="loading"?"loading":"error"} title="Rules unavailable" description="Account-scoped classification records could not be retrieved."/>;
 return <SignalRulesView rules={rules} categories={categories} busy={busy}
 onCreate={input=>perform(()=>service!.createRule(input))}
 onUpdate={(rule,enabled)=>perform(()=>service!.updateRule(rule.id,{name:rule.name,scope:rule.scope,condition:rule.condition,action:rule.action,priority:rule.priority,stopProcessing:rule.stopProcessing,enabled}))}
 onDelete={rule=>perform(()=>service!.deleteRule(rule.id))}/>;
}
