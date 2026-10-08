/** P27 canonical route resolver. No browser globals, safe for Node tests and SSR. */
export const financeRoutes = [
  { id:"home", path:"/", section:"home", label:"Home", legacy:"overview" },
  { id:"activity", path:"/activity", section:"activity", label:"Activity", legacy:"activity" },
  { id:"activity-new", path:"/activity/new", section:"activity", label:"New transaction" },
  { id:"activity-detail", path:"/activity/transaction/:transactionId", section:"activity", label:"Transaction" },
  { id:"plan", path:"/plan", section:"plan", label:"Plan", legacy:"budget" },
  { id:"goals", path:"/plan/goals", section:"plan", label:"Goals", legacy:"goals" },
  { id:"recurring", path:"/plan/recurring", section:"plan", label:"Recurring", legacy:"recurring" },
  { id:"explore", path:"/explore", section:"explore", label:"Explore", legacy:"insights" },
  { id:"categories", path:"/explore/categories", section:"explore", label:"Categories", legacy:"categories" },
  { id:"merchants", path:"/explore/merchants", section:"explore", label:"Merchants", legacy:"merchants" },
  { id:"products", path:"/explore/products", section:"explore", label:"Products", legacy:"products" },
  { id:"product-detail", path:"/explore/products/:productId", section:"explore", label:"Product detail" },
  { id:"receipts", path:"/receipts", section:"receipts", label:"Receipts", legacy:"receipts" },
  { id:"capture", path:"/receipts/capture", section:"receipts", label:"Scan receipt", legacy:"scan" },
  { id:"receipt-detail", path:"/receipts/:receiptId", section:"receipts", label:"Receipt detail" },
  { id:"accounts", path:"/wealth/accounts", section:"wealth", label:"Accounts", legacy:"accounts" },
  { id:"account-detail", path:"/wealth/accounts/:accountId", section:"wealth", label:"Account detail" },
  { id:"net-worth", path:"/wealth/net-worth", section:"wealth", label:"Net worth", legacy:"net-worth" },
  { id:"imports", path:"/import", section:"activity", label:"Imports", legacy:"imports" },
  { id:"rules", path:"/settings/rules", section:"settings", label:"Rules", legacy:"rules" },
  { id:"settings", path:"/settings", section:"settings", label:"Settings", legacy:"settings" },
  { id:"ask", path:"/ask", section:"explore", label:"Ask Finance", legacy:"ask" },
  { id:"sign-in", path:"/sign-in", section:"auth", label:"Sign in", public:true },
  { id:"auth-callback", path:"/auth/callback", section:"auth", label:"Finishing sign in", public:true },
] as const;
export type FinanceRouteId = (typeof financeRoutes)[number]["id"];
export type FinanceRoute = (typeof financeRoutes)[number];
export interface RouteLocation { id: FinanceRouteId | "not-found"; pathname: string; search: string; section: string; title: string; params: Record<string,string>; isPublic: boolean; canonical: string; normalized: boolean; }

const byId = new Map<string,FinanceRoute>(financeRoutes.map(route=>[route.id,route]));
const byLegacy = new Map<string,FinanceRoute>(financeRoutes.flatMap(route => ("legacy" in route) ? [[route.legacy,route] as const] : []));
const routesBySpecificity=[...financeRoutes].sort((a,b) => (a.path.includes(":")?1:0)-(b.path.includes(":")?1:0));
const whitelistedQueries: Record<string,readonly string[]> = {
  "/activity":["q","from","to","merchant","kind","account"],
  "/activity/new":["type","returnTo"],
  "/plan":["period","category"],
  "/plan/goals":["period"],
  "/explore":["period","compare"],
  "/explore/categories":["period","category"],
  "/explore/merchants":["period","merchant"],
  "/explore/products":["q","period"],
  "/receipts":["status","q"],
  "/wealth/net-worth":["period"],
  "/sign-in":["next"]
};

export function safePrivatePath(raw: string | null | undefined): string | null {
  if(!raw||!raw.startsWith("/")||raw.startsWith("//")||raw.includes("\\")||/[\u0000-\u001f]/.test(raw))return null;
  let url:URL;
  try{url=new URL(raw,"https://finance.invalid")}catch{return null}
  if(url.origin!=="https://finance.invalid"||url.username||url.password)return null;
  const route=resolveFinanceLocation(url.pathname+url.search);
  if(route.id==="not-found"||route.isPublic)return null;
  return route.canonical;
}

function matchRoute(pathname:string): {route:FinanceRoute;params:Record<string,string>}|null {
  for(const route of routesBySpecificity){
    const parts=route.path.split("/").filter(Boolean), actual=pathname.split("/").filter(Boolean);
    if(parts.length!==actual.length)continue;
    const params:Record<string,string>={};let matches=true;
    for(let i=0;i<parts.length;i++){
      const p=parts[i]!,a=actual[i]!;
      if(p.startsWith(":")) {
        let decoded:string;
        try{decoded=decodeURIComponent(a)}catch{matches=false;break}
        if(!decoded||decoded.includes("/")||decoded.includes("\\")||decoded.length>160||decoded==="."||decoded===".."){matches=false;break}
        params[p.slice(1)]=decoded;
      } else if(p!==a){matches=false;break}
    }
    if(matches)return{route,params};
  }
  return null;
}
function cleanQuery(pathname:string,search:string):string {
  const allow=whitelistedQueries[pathname];
  if(!allow)return "";
  const input=new URLSearchParams(search),result=new URLSearchParams();
  for(const key of allow){
    const value=input.get(key);
    if(value&&value.length<=250) result.set(key,value);
  }
  return result.toString()?"?"+result.toString():"";
}
function fromPath(pathname:string,search:string, normalized=false):RouteLocation {
  const m=matchRoute(pathname);
  if(!m)return{id:"not-found",pathname,search,section:"none",title:"Page not found",params:{},isPublic:true,canonical:pathname,normalized};
  const isPublic="public" in m.route && m.route.public===true;
  const canonical=m.route.path.includes(":")?pathname+cleanQuery(pathname,search):m.route.path+cleanQuery(pathname,search);
  return{id:m.route.id,pathname,search,section:m.route.section,title:m.route.label,params:m.params,isPublic,canonical,normalized};
}
export function resolveFinanceLocation(input:string):RouteLocation {
  const url=new URL(input,"https://finance.invalid");
  // Legacy hash URLs only. OAuth access_token fragments and skip-link targets
  // must be left untouched until auth code has processed the callback.
  const hash=url.hash.startsWith("#")?url.hash.slice(1):"";
  // Supabase must consume OAuth PKCE codes or implicit fragments before any
  // client-side route normalization can strip those credentials.
  if(url.searchParams.has("code")||url.searchParams.has("error")||/^(access_token|refresh_token|error_description)=/.test(hash)) {
    return {...fromPath("/",""),normalized:false};
  }
  const [alias,legacyQuery=""]=hash.split("?",2);
  const legacy=byLegacy.get(alias??"");
  if(legacy){
    let path:string=legacy.path;
    const query=new URLSearchParams(legacyQuery);
    if(alias==="products" && query.get("product")){
      const product=query.get("product")!;
      if(product.length<=160&&!product.includes("/")&&!product.includes("\\")) path="/explore/products/"+encodeURIComponent(product);
    }
    const result=fromPath(path,cleanQuery(path,legacyQuery),true);
    return {...result,canonical:result.canonical,normalized:true};
  }
  const path=url.pathname.replace(/\/$/,"")||"/";
  const result=fromPath(path,url.search);
  const norm=result.canonical!==path+url.search || (path!==url.pathname);
  return {...result,normalized:norm};
}
export function financePathFor(id:FinanceRouteId,params:Record<string,string>={}):string {
  const route=byId.get(id);
  if(!route)throw Error("Unknown route");
  return route.path.replace(/:([A-Za-z]+)/g,(_,key:string)=>{
    const v=params[key];
    if(!v||v.length>160||v.includes("/")||v.includes("\\"))throw Error("Unsafe route parameter");
    return encodeURIComponent(v);
  });
}
export function fromLegacyKey(key:string,productId?:string|null):string {
  const route=byLegacy.get(key);
  if(!route)return "/";
  if(key==="products"&&productId)return financePathFor("product-detail",{productId});
  return route.path;
}
export function isServerPath(pathname:string):boolean {
  return pathname==="/privacy"||pathname==="/terms"||pathname==="/support"||
    pathname.startsWith("/api/")||pathname==="/api"||
    pathname.startsWith("/.well-known/")||
    pathname.startsWith("/assets/");
}
