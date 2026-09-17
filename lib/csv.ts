// RFC 4180 quoting, including embedded delimiters and newlines.
export function parseCSV(text:string,delimiter=','):string[][] {
 if(text.length>2_000_000)throw Error('File is too large.');
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c==='"'&&!field&&!closed){quoted=true;continue;}
  if(c===delimiter){row.push(field);field='';closed=false;continue;}
  if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';closed=false;continue;}
  if(closed)throw Error('Invalid CSV quoting.');field+=c;
 }
 if(quoted)throw Error('Invalid CSV quoting.');
 row.push(field);if(row.some(v=>v.trim()))rows.push(row);
 if(rows.length>501)throw Error('Import limit exceeded. Split this file into smaller files.');
 if(rows.some(r=>r.length!==rows[0].length))throw Error('CSV rows must have the same number of columns.');
 return rows;
}
export type ImportRow={name:string;date:string;amount:number;notes:string};
export type ColumnMapping={name:number;date:number;amount:number;notes:number;dateFormat:'iso'|'dmy'|'mdy';decimal:'.'|','};
export function mapCSV(rows:string[][],mapping:ColumnMapping):ImportRow[]{
 return rows.slice(1).map(row=>{
  let date=row[mapping.date]?.trim()??'';
  if(mapping.dateFormat!=='iso'){
   const parts=date.split(/[/.\-]/);if(parts.length!==3)throw Error('Check the date format.');
   const [a,b,year]=parts;date=year+'-'+(mapping.dateFormat==='dmy'?b:a).padStart(2,'0')+'-'+(mapping.dateFormat==='dmy'?a:b).padStart(2,'0');
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Check the date format.');
  let value=(row[mapping.amount]??'').trim().replace(/[\u00a0\u202f ]/g,'');
  const pattern=mapping.decimal==='.'?/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/:/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/;
  if(!pattern.test(value))throw Error('Check the amount format.');
  value=mapping.decimal==='.'?value.replace(/,/g,''):value.replace(/\./g,'').replace(',','.');
  const amount=Number(value),name=row[mapping.name]?.trim();
  if(!name||name.length>120||!Number.isFinite(amount)||amount===0||Math.abs(amount)>1e15)throw Error('Check the import fields.');
  const notes=mapping.notes<0?'':row[mapping.notes]??'';if(notes.length>2000)throw Error('Check the import fields.');
  return {date,name,amount,notes};
 });
}
export function csvCell(value:unknown){let text=String(value??'');if(/^[\s]*[=+@-]/.test(text)&&typeof value!=='number')text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
export function exportCSV(rows:Record<string,unknown>[],columns:string[]){return [columns.map(csvCell).join(','),...rows.map(row=>columns.map(c=>csvCell(row[c])).join(','))].join('\r\n');}
