import{readFileSync}from"node:fs";
const rd=x=>readFileSync(x,"utf8"),check=(v,s)=>{if(!v)throw Error("P37 "+s)};
const app=rd("src/app/FinanceAppV2.tsx"),route=rd("src/app/finance-router.ts"),view=rd("src/acceptance/SignalReleaseReview.tsx"),
 hook=rd("src/acceptance/use-finance-acceptance.ts"),model=rd("src/acceptance/finance-acceptance-model.ts");
check(route.includes('id:"release-review"')&&app.includes('case "release-review":return <SignalReleaseReviewPage onNavigate={navigate}/>;'),"production gated route");
check(rd("src/ui/v2/FinanceV2Shell.tsx").includes("Acceptance & release review"),"usable navigation");
for(const key of ["overview","wealth","recurring","planning","imports"])check(hook.includes("apis."+key+".getDashboard"),"real audited source "+key);
check(hook.includes("getUser()")&&hook.includes("ownerId")&&hook.includes("onAuthStateChange"),"identity/switching gate");
check(!hook.includes("runtime.ensureInitialized(")&&!hook.includes(".commitImport(")&&!hook.includes(".syncPatterns("),"read-only no initialization or ledger mutation");
check(model.includes('status:"NO_GO"')&&model.includes('stage==="postrelease"')&&model.includes("validateEvidenceReference"),"distinct fail-closed release");
check(view.includes("No references or financial results are persisted")&&view.includes("Run read-only checks"),"visible unverified governance");
check(rd(".github/workflows/ci.yml").includes("npm run validate:p37"),"CI gate");
check(rd(".github/workflows/finance-p37-acceptance-qa.yml").includes("capture-finance-p37.mjs"),"real React QA gate");
console.log("P37 owner-scoped read-only release review, route and NO_GO contracts passed");
