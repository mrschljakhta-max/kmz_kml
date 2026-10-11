/* GEO CONVERTER — entirely local processing, no external services. */
"use strict";
const $=id=>document.getElementById(id);
let headers=[], rows=[], filename="geodata";
const selects=["lat","lon","name"];
const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const clean=s=>String(s??"").trim();
const bytes=s=>new TextEncoder().encode(s);
function download(data,name,type){const blob=data instanceof Blob?data:new Blob([data],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);}
function parseCSV(input,delimiter){
  const data=[];let row=[],field="",quoted=false;
  for(let i=0;i<input.length;i++){const c=input[i];
    if(quoted){if(c==='"'&&input[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}
    else if(c==='"'&&field==="")quoted=true;
    else if(c===delimiter){row.push(field);field="";}
    else if(c==="\n"||c==="\r"){if(c==="\r"&&input[i+1]==="\n")i++;row.push(field);if(row.some(v=>v!==""))data.push(row);row=[];field="";}
    else field+=c;
  }
  if(quoted)throw new Error("Незакриті лапки в CSV.");
  row.push(field);if(row.some(v=>v!==""))data.push(row);
  return data;
}
function detectDelimiter(text){
  // Use the entire first logical CSV record. Cutting input at arbitrary
  // character positions can end inside a quoted value.
  let quoted=false, end=text.length;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){i++;continue;}
      quoted=!quoted;
    }else if(!quoted&&(c==="\n"||c==="\r")){
      end=i;break;
    }
  }
  const header=text.slice(0,end);
  const candidates=[",",";","\t"];
  let best=",",maxFields=0;
  for(const delimiter of candidates){
    try{
      const parsed=parseCSV(header,delimiter);
      const count=parsed[0]?.length||0;
      if(count>maxFields){maxFields=count;best=delimiter;}
    }catch{}
  }
  return best;
}
function fillSelect(id){
  const el=$(id);el.replaceChildren();
  const empty=document.createElement("option");empty.value="";empty.textContent="— Не обрано —";el.append(empty);
  headers.forEach((h,i)=>{const o=document.createElement("option");o.value=String(i);o.textContent=h;el.append(o);});
  const patterns=id==="lat"?[/^(lat|latitude|широта|y)$/i,/широт|latitude/i]:
                 id==="lon"?[/^(lon|lng|longitude|довгота|x)$/i,/довгот|longitude/i]:
                 [/^(name|назва|title|об'єкт)$/i,/назв|name|title/i];
  let match=-1;for(const re of patterns){match=headers.findIndex(h=>re.test(h));if(match>=0)break;}
  if(match>=0)el.value=String(match);
}
function safeNumber(raw){const s=clean(raw).replace(/\s/g,"");if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return NaN;return Number(s);}
function validation(){
  const latCol=$("lat").value,lonCol=$("lon").value;let valid=[],invalid=[];
  if(latCol===""||lonCol===""||latCol===lonCol)return {valid,invalid,message:"Оберіть різні колонки широти та довготи."};
  for(let i=0;i<rows.length;i++){
    const row=rows[i],lat=safeNumber(row[+latCol]),lon=safeNumber(row[+lonCol]);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -90||lat>90||lon< -180||lon>180)invalid.push(i+2);
    else valid.push({row,lat,lon,index:i});
  }
  return {valid,invalid,message:""};
}

function kmlDocument(){
  const {valid,message}=validation();if(message||!valid.length)throw new Error(message||"Немає коректних точок.");
  const nameColumn=$("name").value;const parts=['<?xml version="1.0" encoding="UTF-8"?>','<kml xmlns="http://www.opengis.net/kml/2.2"><Document>','<name>'+esc($("outname").value||"geodata")+'</name>'];
  for(const item of valid){
    const objName=nameColumn===""?"Об’єкт "+(item.index+1):clean(item.row[+nameColumn])||"Об’єкт "+(item.index+1);
    parts.push("<Placemark><name>"+esc(objName)+"</name><ExtendedData>");
    headers.forEach((h,i)=>parts.push('<Data name="'+esc(h)+'"><value>'+esc(item.row[i])+'</value></Data>'));
    parts.push("</ExtendedData><Point><coordinates>"+item.lon+","+item.lat+",0</coordinates></Point></Placemark>");
  }
  parts.push("</Document></kml>");return parts.join("");
}
/* Minimal standards-compliant ZIP writer (STORE method), suitable for KMZ. */
const crcTable=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(data){let crc=0xffffffff;for(const b of data)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function zipSingle(filename,content){
  const name=bytes(filename),data=bytes(content),crc=crc32(data);
  const localSize=30+name.length+data.length,centralSize=46+name.length;
  const output=new Uint8Array(localSize+centralSize+22);const view=new DataView(output.buffer);
  const w16=(o,n)=>view.setUint16(o,n,true),w32=(o,n)=>view.setUint32(o,n,true);
  w32(0,0x04034b50);w16(4,20);w16(6,0x0800);w16(8,0);w32(14,crc);w32(18,data.length);w32(22,data.length);w16(26,name.length);
  output.set(name,30);output.set(data,30+name.length);
  const o=localSize;w32(o,0x02014b50);w16(o+4,20);w16(o+6,20);w16(o+8,0x0800);w16(o+10,0);w32(o+16,crc);w32(o+20,data.length);w32(o+24,data.length);w16(o+28,name.length);w32(o+42,0);output.set(name,o+46);
  const e=o+centralSize;w32(e,0x06054b50);w16(e+8,1);w16(e+10,1);w32(e+12,centralSize);w32(e+16,o);
  return new Blob([output],{type:"application/vnd.google-earth.kmz"});
}

async function load(file){
  if(!file)return;
  if(file.size>20*1024*1024){alert("Максимальний розмір CSV — 20 МБ.");return;}
  try{
    const text=(await file.text()).replace(/^\uFEFF/,"");const delimiter=detectDelimiter(text),all=parseCSV(text,delimiter);
    if(all.length<2||all[0].length<2)throw new Error("Не знайдено таблицю з заголовками та даними. Виявлено "+all.length+" рядків і "+(all[0]?.length||0)+" колонок. Перевір формат CSV і роздільник.");
    const width=all[0].length;const mismatches=all.slice(1).reduce((a,r)=>a+(r.length!==width),0);
    if(mismatches)throw new Error("У "+mismatches+" рядках інша кількість колонок. Перевір лапки та роздільники.");
    headers=all[0].map((h,i)=>clean(h)||"Колонка "+(i+1));rows=all.slice(1);filename=file.name.replace(/\.[^.]+$/,"");
    $("outname").value=filename.replace(/[^\w\u0400-\u04FF-]/g,"_").slice(0,80)||"geodata";
    $("fileinfo").textContent=file.name+" · "+rows.length.toLocaleString("uk-UA")+" рядків · "+headers.length+" колонок · роздільник "+(delimiter==="\t"?"TAB":delimiter);
    selects.forEach(fillSelect);
    const result=validation();
    if(result.message)throw new Error("Потрібні окремі колонки широти та довготи WGS84. MGRS або інші формати цим режимом не перетворюються.");
    if(result.invalid.length)throw new Error("Некоректні координати в "+result.invalid.length+" рядках (перші: "+result.invalid.slice(0,8).join(", ")+"). Експорт скасовано, щоб не втратити записи.");
    const kml=kmlDocument();
    const out=($("outname").value||"geodata")+".kmz";
    download(zipSingle("doc.kml",kml),out,"application/vnd.google-earth.kmz");
    $("status").textContent="Готово: "+result.valid.length.toLocaleString("uk-UA")+" точок · "+out+" автоматично завантажено.";
  }catch(err){$("status").textContent="Не вдалося конвертувати: "+err.message;}
}
$("file").addEventListener("change",e=>load(e.target.files[0]));
$("demo").addEventListener("click",()=>download("\uFEFFНазва;Широта;Довгота;Категорія;Опис\nМузей;48.2924;25.9343;Культура;Демонстраційний об’єкт\nПарк;48.2870;25.9518;Відпочинок;Навчальний приклад\n","geodata-demo.csv","text/csv;charset=utf-8"));
const drop=$("drop");for(const evt of ["dragenter","dragover"]){drop.addEventListener(evt,e=>{e.preventDefault();drop.classList.add("drag");});}
for(const evt of ["dragleave","drop"]){drop.addEventListener(evt,e=>{e.preventDefault();drop.classList.remove("drag");});}
drop.addEventListener("drop",e=>load(e.dataTransfer.files[0]));
