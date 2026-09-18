import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { formatNumber } from './format';
import type { FinancialReport } from './financial-report';

/** Searchable Unicode PDF with measured cells, repeated headers and untruncated rows. */
export async function renderFinancialReportPdf(report:FinancialReport,fontBytes:Uint8Array):Promise<Uint8Array>{
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(fontBytes,{subset:true});
 doc.setTitle(report.title);doc.setSubject('Personal financial data for review');doc.setCreator('Personal Finance');doc.setLanguage(report.locale);
 const width=595.28,height=841.89,margin=40,bottom=52,contentWidth=width-margin*2;
 const ink=rgb(.12,.18,.14),muted=rgb(.35,.42,.37),green=rgb(.23,.39,.24),rule=rgb(.8,.85,.81),wash=rgb(.94,.96,.94);
 let page=doc.addPage([width,height]),y=height-margin;
 const supported=new Set(font.getCharacterSet());
 const clean=(text:string)=>Array.from(text.normalize('NFC').replace(/\t/g,'  ')).filter(char=>char==='\n'||char.charCodeAt(0)>=32).map(char=>char==='\n'||supported.has(char.codePointAt(0)!)?char:'?').join('');
 function nextPage(){page=doc.addPage([width,height]);y=height-margin;}
 function lines(text:string,size:number,maxWidth=contentWidth):string[]{
  const result:string[]=[];
  for(const paragraph of clean(text).split('\n')){
   let line='';
   for(const word of paragraph.split(/\s+/)){
    const candidate=line?line+' '+word:word;
    if(font.widthOfTextAtSize(candidate,size)<=maxWidth){line=candidate;continue;}
    if(line){result.push(line);line='';}
    for(const char of word){if(font.widthOfTextAtSize(line+char,size)>maxWidth&&line){result.push(line);line='';}line+=char;}
   }
   result.push(line);
  }
  return result;
 }
 function drawText(text:string,x:number,baseline:number,size:number,color=ink){page.drawText(text,{x,y:baseline,size,font,color});}
 for(let index=0;index<report.blocks.length;index++){
  const block=report.blocks[index];
  if(block.kind==='pageBreak'){if(y<height-margin)nextPage();continue;}
  if(block.kind==='table'){
   y-=5;
   const size=8.5,leading=11.5,pad=4;
   const widths=block.widths.map(w=>w*contentWidth);
   const wrap=(cells:string[])=>cells.map((cell,i)=>lines(cell,size,widths[i]-pad*2));
   const header=wrap(block.headers),headerHeight=Math.max(...header.map(c=>c.length))*leading+pad*2;
   function drawRow(cells:string[][],isHeader:boolean){
    const h=Math.max(...cells.map(c=>c.length),1)*leading+pad*2;
    if(isHeader)page.drawRectangle({x:margin,y:y-h,width:contentWidth,height:h,color:wash});
    let x=margin;
    cells.forEach((cell,i)=>{
     cell.forEach((line,j)=>{const right=!isHeader&&block.kind==='table'&&block.numeric?.includes(i);drawText(line,right?x+widths[i]-pad-font.widthOfTextAtSize(line,size):x+pad,y-pad-size-j*leading,size,isHeader?green:ink);});
     x+=widths[i];
    });
    y-=h;page.drawLine({start:{x:margin,y},end:{x:margin+contentWidth,y},thickness:.4,color:rule});
   }
   const first=block.rows.length?Math.max(...wrap(block.rows[0]).map(c=>c.length))*leading+pad*2:0;
   const totalHeight=headerHeight+block.rows.reduce((sum,row)=>sum+Math.max(...wrap(row).map(c=>c.length))*leading+pad*2,0);
   if(y-headerHeight-Math.min(first,120)<bottom||(totalHeight<220&&y-totalHeight<bottom))nextPage();
   drawRow(header,true);
   for(const row of block.rows){
    let cells=wrap(row);
    const h=Math.max(...cells.map(c=>c.length))*leading+pad*2;
    if(y-h<bottom&&h<height-margin-bottom-headerHeight){nextPage();drawRow(header,true);}
    // Oversized paragraphs span pages by line, without clipping or dropped text.
    while(cells.some(c=>c.length)){
     let capacity=Math.floor((y-bottom-pad*2)/leading);
     if(capacity<1){nextPage();drawRow(header,true);capacity=Math.floor((y-bottom-pad*2)/leading);}
     const chunk=cells.map(c=>c.slice(0,capacity));drawRow(chunk,false);
     cells=cells.map(c=>c.slice(capacity));
     if(cells.some(c=>c.length)){nextPage();drawRow(header,true);}
    }
   }
   y-=6;continue;
  }
  const size=block.kind==='title'?23:block.kind==='heading'?14:block.kind==='subheading'?10:9;
  const leading=size*1.3,space=block.kind==='heading'?12:block.kind==='subheading'?7:4;
  const wrapped=lines(block.text,size);
  const next=report.blocks[index+1];
  const tableReserve=(candidate:typeof next)=>{
   if(candidate?.kind!=='table')return 0;
   const rowHeight=(cells:string[])=>Math.max(...cells.map((cell,i)=>lines(cell,8.5,candidate.widths[i]*contentWidth-8).length))*11.5+8;
   const header=rowHeight(candidate.headers),total=header+candidate.rows.reduce((sum,row)=>sum+rowHeight(row),0);
   return 5+(total<220?total:header+Math.min(candidate.rows.length?rowHeight(candidate.rows[0]):0,120));
  };
  const keep=next?.kind==='table'?tableReserve(next):block.kind==='heading'&&next?.kind==='subheading'?24+tableReserve(report.blocks[index+2]):block.kind==='text'?0:30;
  if(y-space-Math.min(leading*wrapped.length+keep,300)<bottom)nextPage();else y-=space;
  for(const line of wrapped){if(y-leading<bottom)nextPage();y-=leading;drawText(line,margin,y,size,block.kind==='heading'||block.kind==='title'?green:ink);}
 }
 const pages=doc.getPages();
 for(const [index,current] of pages.entries()){
  const footer=`${formatNumber(index+1,report.locale,0)} / ${formatNumber(pages.length,report.locale,0)}`;
  current.drawLine({start:{x:margin,y:36},end:{x:width-margin,y:36},thickness:.5,color:rule});
  current.drawText(footer,{x:width-margin-font.widthOfTextAtSize(footer,8),y:22,size:8,font,color:muted});
 }
 return doc.save();
}
