// Bound to the Google Form response spreadsheet. No Web App deployment needed.
const CLEANING_HEADERS = [
  "Timestamp",
  "Tanggal Pencucian",
  "Area Kerja",
  "Nama Alat",
  "Produk/Bahan/Sampel Terakhir Diproses Menggunakan Alat",
  "Nama Petugas",
  "Waktu Mulai Pencucian",
  "Waktu Selesai Pencucian",
  "Jenis Potensi Najis",
  "Metode Pencucian (Sesuai SOP)",
  "Bahan Pembersih Yang Digunakan",
  "Apakah Pembilasan Telah Dilakukan Sesuai Prosedur?",
  "Apakah Terdapat Residu Produk Atau Bahan Setelah Pencucian?",
  "Kondisi Alat Setelah Pencucian",
  "Apakah Alat Sudah Dikeringkan Atau Ditangani Sesuai Prosedur Penyimpanan?",
  "Hasil Akhir Kegiatan Pencucian",
  "Jika Ditemukan Ketidaksesuaian, Tindakan Apa Yang Dilakukan?",
  "Nama Pemeriksa/Penanggung Jawab Verifikasi",
  "Apakah Alat Sudah Dinyatakan Siap Digunakan Kembali?",
  "Nomor Batch",
  "Notes"
];
const OUTBOX = '_ERP_Cleaning_Outbox';
// Script properties: ERP_URL (full HTTPS endpoint), ERP_SECRET (>=32 characters), RESPONSE_SHEET_ID.
function installEquipmentSync() {
  const props = PropertiesService.getScriptProperties();
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (book.getSpreadsheetTimeZone() !== 'Asia/Jakarta') throw Error('Set spreadsheet timezone to Asia/Jakarta first.');
  if (!/^https:\/\//.test(props.getProperty('ERP_URL') || '') || (props.getProperty('ERP_SECRET') || '').length < 32) throw Error('Configure ERP_URL and ERP_SECRET in Script properties.');
  const sheet = book.getSheets().find(s => String(s.getSheetId()) === props.getProperty('RESPONSE_SHEET_ID'));
  if (!sheet) throw Error('Configure RESPONSE_SHEET_ID from the response sheet gid.');
  props.setProperty('SPREADSHEET_ID', book.getId());
  checkHeaders_(sheet);
  if (!book.getSheetByName(OUTBOX)) book.insertSheet(OUTBOX).appendRow(['Event ID','Source row','Payload','Status','Attempts','Last attempt','Result']);
  ScriptApp.getProjectTriggers().filter(t => ['onCleaningFormSubmit','retryEquipmentSync'].includes(t.getHandlerFunction())).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onCleaningFormSubmit').forSpreadsheet(book).onFormSubmit().create();
  ScriptApp.newTrigger('retryEquipmentSync').timeBased().everyMinutes(5).create();
}
function checkHeaders_(sheet) {
  const all = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(v=>v.trim());
  CLEANING_HEADERS.forEach(h=>{if(all.filter(v=>v===h).length!==1)throw Error('Missing or duplicated column: '+h);});
  return all;
}
function onCleaningFormSubmit(e) {
  if (!e || !e.range) throw Error('Use an installable spreadsheet Form submit trigger, not Run.');
  const props=PropertiesService.getScriptProperties();
  if(String(e.range.getSheet().getSheetId())!==props.getProperty('RESPONSE_SHEET_ID'))return;
  queueCleaningRow_(e.range.getSheet(),e.range.getRow());
  retryEquipmentSync();
}
// Explicitly queue the selected response row; useful for historical rows or corrected failures.
// Never use this for blind bulk backfill: older records may conflict with current equipment use.
function queueSelectedCleaningRow() {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if(String(sheet.getSheetId())!==PropertiesService.getScriptProperties().getProperty('RESPONSE_SHEET_ID'))throw Error('Select a row in the response sheet.');
  queueCleaningRow_(sheet,sheet.getActiveRange().getRow());
  retryEquipmentSync();
}
function queueCleaningRow_(sheet,row) {
  if(row<2)throw Error('Select a response row.');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    const headers=checkHeaders_(sheet), values=sheet.getRange(row,1,1,headers.length).getDisplayValues()[0];
    const raw=sheet.getRange(row,1,1,headers.length).getValues()[0];
    const fields={};CLEANING_HEADERS.forEach(h=>fields[h]=String(values[headers.indexOf(h)]||''));
    const date=raw[headers.indexOf('Tanggal Pencucian')];
    if(!(date instanceof Date)||isNaN(date.getTime()))throw Error('Tanggal Pencucian must be a spreadsheet Date cell.');
    const day=Utilities.formatDate(date,'Asia/Jakarta','yyyy-MM-dd');
    function time(h){const v=raw[headers.indexOf(h)];if(v instanceof Date)return Utilities.formatDate(v,'Asia/Jakarta','HH:mm:ss');const t=String(v).trim().replace('.',':');if(!/^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(t))throw Error('Invalid time: '+h);return t.split(':').map(x=>x.padStart(2,'0')).join(':')+(t.split(':').length===2?':00':'');}
    const started=day+'T'+time('Waktu Mulai Pencucian')+'+07:00', finished=day+'T'+time('Waktu Selesai Pencucian')+'+07:00';
    if(Date.parse(finished)<Date.parse(started))throw Error('End precedes start. Overnight cleaning requires manual review in ERP.');
    const payload={event_id:Utilities.getUuid(),source_id:sheet.getParent().getId()+':'+sheet.getSheetId(),started_at:started,finished_at:finished,fields:fields};
    const outbox=sheet.getParent().getSheetByName(OUTBOX);if(!outbox)throw Error('Run installEquipmentSync first.');
    // Deduplicate by the original response timestamp, contents and source sheet, not row position.
    const fingerprint=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([payload.source_id,fields]),Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
    const marker=payload.source_id+':'+fingerprint;
    if(outbox.getLastRow()>1 && outbox.getRange(2,2,outbox.getLastRow()-1,1).getValues().some(v=>v[0]===marker))return;
    outbox.appendRow([payload.event_id,marker,JSON.stringify(payload),'PENDING',0,'','']);
  }finally{lock.releaseLock();}
}
function retryEquipmentSync() {
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try {
    const props=PropertiesService.getScriptProperties();
    const url=props.getProperty('ERP_URL'),secret=props.getProperty('ERP_SECRET');
    if(!/^https:\/\//.test(url||'')||(secret||'').length<32)throw Error('Invalid integration configuration.');
    const sheet=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')).getSheetByName(OUTBOX);
    if(!sheet||sheet.getLastRow()<2)return;
    const rows=sheet.getRange(2,1,sheet.getLastRow()-1,7).getValues();let sent=0;
    for(let i=0;i<rows.length&&sent<20;i++){
      const r=rows[i];if(!['PENDING','RETRY'].includes(r[3]))continue;sent++;
      const body=String(r[2]),stamp=String(Date.now());
      const signature=Utilities.computeHmacSha256Signature(stamp+'.'+body,secret,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
      let status='RETRY',message='';const attempts=Number(r[4]||0)+1;
      try {
        const response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:body,headers:{'x-inb-timestamp':stamp,'x-inb-signature':signature},muteHttpExceptions:true,followRedirects:false});
        const code=response.getResponseCode();message=response.getContentText().slice(0,1000);
        status=code>=200&&code<300?'SENT':([400,409,413,422].includes(code)?'REVIEW':'RETRY');
      }catch(_){message='Network failure; queued for retry.';}
      if(status==='RETRY'&&attempts>=10)status='REVIEW';
      sheet.getRange(i+2,4,1,4).setValues([[status,attempts,new Date(),message]]);
    }
  }finally{lock.releaseLock();}
}
// After fixing a network/configuration issue, select its outbox row and run this.
// Payload remains unchanged, preserving the ERP idempotency key.
function retrySelectedOutboxRow() {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getActiveSheet(),row=sheet.getActiveRange().getRow();
  if(sheet.getName()!==OUTBOX||row<2)throw Error('Select an outbox row.');
  if(sheet.getRange(row,4).getValue()==='SENT')return;
  sheet.getRange(row,4,1,2).setValues([['RETRY',0]]);retryEquipmentSync();
}
