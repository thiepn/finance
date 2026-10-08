import {useEffect,useState} from "react";
import type {LocalReceiptPage} from "../domain/receipt-capture.js";

export function ReceiptLocalPagePreview({page}:{page:LocalReceiptPage}){
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{
  // Object URLs never enter the DOM as a public Storage path or leave the device.
  // Revoke when a draft changes or the preview unmounts.
  const next=URL.createObjectURL(page.blob);
  setUrl(next);
  return()=>{URL.revokeObjectURL(next)};
 },[page.blob]);
 const image=["image/jpeg","image/png","image/webp"].includes(page.mimeType);
 return <div className="sc-capture-preview" aria-label={"Local preview of page "+(page.pageIndex+1)}>
   {url&&image?<img alt={"Local receipt page "+(page.pageIndex+1)} src={url}/>:
     <div className="sc-capture-preview__file">{page.mimeType==="application/pdf"?"PDF document":
       page.mimeType.includes("heic")||page.mimeType.includes("heif")?"HEIC image":"Local receipt file"}</div>}
   {url?<a download={"receipt-page-"+(page.pageIndex+1)} href={url}>Open local file</a>:null}
 </div>;
}
