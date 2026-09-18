import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { formatNumber } from './format';
import type { FinancialReport } from './financial-report';

/** Text PDF: searchable and readable by agents; never rasterize financial text. */
export async function renderFinancialReportPdf(report:FinancialReport,fontBytes:Uint8Array):Promise<Uint8Array>{
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(fontBytes,{subset:true});
 doc.setTitle(report.title);doc.setSubject('Personal financial data for review');doc.setCreator('Personal Finance');doc.setLanguage(report.locale);
 const width=595.28,height=841.89,margin=46,bottom=54,contentWidth=width-margin*2;
 const ink=rgb(.12,.18,.14),muted=rgb(.35,.42,.37),green=rgb(.23,.39,.24);
 let page=doc.addPage([width,height]),y=height-margin;
 const supported=new Set(font.getCharacterSet());
 const clean=(text:string)=>Array.from(text.normalize('NFC').replace(/\t/g,'  ')).filter(char=>char==='\n'||char.charCodeAt(0)>=32).map(char=>char==='\n'||supported.has(char.codePointAt(0)!)?char:'?').join('');
 function nextPage(){page=doc.addPage([width,height]);y=height-margin;}
 function lines(text:string,size:number):string[]{
  const result:string[]=[];
  for(const paragraph of clean(text).split('\n')){
   let line='';
   for(const word of paragraph.split(/\s+/)){
    const candidate=line?line+' '+word:word;
    if(font.widthOfTextAtSize(candidate,size)<=contentWidth){line=candidate;continue;}
    if(line){result.push(line);line='';}
    // Long IDs, URLs and unbroken notes still wrap within the page.
    for(const char of word){if(font.widthOfTextAtSize(line+char,size)>contentWidth&&line){result.push(line);line='';}line+=char;}
   }
   result.push(line);
  }
  return result;
 }
 for(const block of report.blocks){
  const size=block.kind==='title'?22:block.kind==='heading'?12:block.kind==='subheading'?10:9;
  const leading=size*1.3,space=block.kind==='heading'?12:block.kind==='subheading'?6:3;
  const wrapped=lines(block.text,size);
  // Keep headings with at least a few lines of the section they introduce.
  const reserve=block.kind==='text'?leading:leading*wrapped.length+42;
  if(y-space-reserve<bottom)nextPage();else y-=space;
  if(block.kind==='heading'){page.drawLine({start:{x:margin,y:y+8},end:{x:width-margin,y:y+8},thickness:.5,color:rgb(.78,.83,.79)});}
  for(const line of wrapped){if(y-leading<bottom)nextPage();y-=leading;page.drawText(line,{x:margin,y,size,font,color:block.kind==='heading'||block.kind==='title'?green:ink});}
 }
 const pages=doc.getPages();
 for(const [index,current] of pages.entries()){
  const footer=`${formatNumber(index+1,report.locale,0)} / ${formatNumber(pages.length,report.locale,0)}`;
  current.drawLine({start:{x:margin,y:38},end:{x:width-margin,y:38},thickness:.5,color:rgb(.78,.83,.79)});
  current.drawText(footer,{x:width-margin-font.widthOfTextAtSize(footer,8),y:24,size:8,font,color:muted});
 }
 return doc.save();
}
