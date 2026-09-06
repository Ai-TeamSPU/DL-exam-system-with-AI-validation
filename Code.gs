// SPU DL Test — Google Apps Script Web App
// ใช้เก็บเฉพาะเอกสารส่วนที่ 2 และไฟล์รายงานผลตรวจเอกสาร
// คะแนนและผลตรวจทั้ง 3 ส่วนเก็บใน Supabase ไม่ผ่านสคริปต์นี้
// Deploy: Deploy > New deployment > Web app > Execute as: Me · Who has access: Anyone
// ต้องเปิด Services > Drive API ด้วย (ใช้ตอนแปลงไฟล์เพื่อตรวจ)

const ROOT = 'DL_2569';            // โฟลเดอร์แม่ใน My Drive
const HR_EMAIL = 'hr@spu.ac.th';
// ต้องตั้งค่าเดียวกับช่อง "Secret key" ในหน้าตั้งค่าของเว็บ — ไม่ตั้งแล้ว = ใครก็ยิง API นี้ได้
const SHARED_SECRET = 'เปลี่ยนรหัสนี้ก่อน deploy จริง';

// หมายเหตุ: อย่ากดปุ่ม Run บน doPost ในหน้า Editor — จะไม่มี event object
// ทดสอบด้วย testPing() ด้านล่าง หรือเปิด URL ของ Web App ในเบราว์เซอร์
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return jsonOut({ error: 'no_post_data', hint: 'เรียกผ่าน HTTP POST จากระบบ ไม่ใช่ปุ่ม Run ใน Editor — ใช้ testPing() แทน' });
  }
  var p;
  try { p = JSON.parse(e.postData.contents); }
  catch (err) { return jsonOut({ error: 'bad_json', detail: String(err) }); }
  if (p.action !== 'ping' && p.secret !== SHARED_SECRET) {
    return jsonOut({ error: 'unauthorized', hint: 'secret ไม่ตรงกับ SHARED_SECRET ที่ตั้งไว้ใน Code.gs' });
  }
  const out = ({ ping, createFolder, upload, inspect, report })[p.action];
  if (!out) return jsonOut({ error: 'unknown action', action: p.action || null });
  try { return jsonOut(out(p)); }
  catch (err) { return jsonOut({ error: 'action_failed', action: p.action, detail: String(err) }); }
}

function doGet() {
  return jsonOut(ping());
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// รันอันนี้ใน Editor เพื่อเช็คว่า Script + Drive สิทธิ์พร้อม
function testPing() {
  Logger.log(JSON.stringify(ping()) + ' · executing as ' + Session.getEffectiveUser().getEmail());
}

function ping() {
  return { ok: true, root: ROOT }; // ไม่ส่งอีเมลผู้ใช้งานออกไปทาง network เพื่อกันข้อมูลหลุด
}

// ทุก path ที่รับจากไคลเอนต์ถูกบังคับให้อยู่ใต้โฟลเดอร์ ROOT เท่านั้น เข้าที่อื่นใน Drive ไม่ได้
function rootFolder() {
  const it = DriveApp.getRootFolder().getFoldersByName(ROOT);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(ROOT);
}

function folderByPath(path) {
  let parts = String(path).split('/').filter(String);
  if (parts[0] === ROOT) parts = parts.slice(1);
  let cur = rootFolder();
  parts.forEach(function (n) {
    if (n === '.' || n === '..') return;
    const it = cur.getFoldersByName(n);
    cur = it.hasNext() ? it.next() : cur.createFolder(n);
  });
  return cur;
}

function createFolder(p) {
  const f = folderByPath(p.name);
  f.addEditor(HR_EMAIL);
  return { url: f.getUrl(), id: f.getId() };
}

function upload(p) {
  const bytes = Utilities.base64Decode(p.data);
  if (bytes.length > 15 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 15MB');
  const f = folderByPath(p.folder);
  const blob = Utilities.newBlob(bytes, p.mime || MimeType.PLAIN_TEXT, p.name);
  const file = f.createFile(blob);
  return { id: file.getId(), url: file.getUrl() };
}

// ============================================================================
// ตรวจข้อสอบส่วนที่ 2 ตาม AI Grader Prompt v1 — Word 15 (W1-W6) · Excel 25 (E1-E7)
// หลักการ: ให้คะแนนจากหลักฐานในไฟล์เท่านั้น · ไฟล์ต้นฉบับห้ามเขียนทับ (ตรวจจากสำเนาที่แปลง)
// ============================================================================
function crit(id, max, expected) {
  return { id: id, score: 0, max: max, status: 'FAIL', expected: expected || '', actual: '', evidence: [], confidence: 'HIGH', reason: '' };
}
function setCrit(c, score, status, actual, evidence, reason, confidence) {
  c.score = Math.round(score * 100) / 100;
  c.status = status;
  c.actual = actual || '';
  c.evidence = evidence || [];
  c.reason = reason || '';
  if (confidence) c.confidence = confidence;
  return c;
}
function flatten(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }
function numOf(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v == null ? '' : v).replace(/[,\s฿]/g, ''));
  return isNaN(n) ? null : n;
}
function colLetter(i) {
  var s = '', n = i + 1;
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function inspect(p) {
  const f = folderByPath(p.folder);
  const code = String(p.code || '');
  const out = {
    criteria: {}, warnings: [], files: {}, manualReview: [],
    rubricVersion: p.rubricVersion || 'DL_PART2_RUBRIC_V1',
    promptVersion: p.promptVersion || 'DL_AI_GRADER_V1',
    gradedAt: new Date().toISOString()
  };
  var docxFile = null, xlsxFile = null;
  const it = f.getFiles();
  while (it.hasNext()) {
    const file = it.next(), n = file.getName();
    if (/^~/.test(n)) continue;
    if (/\.docx$/i.test(n) && /รายงานผลตรวจ/.test(n) === false) docxFile = docxFile || file;
    if (/\.xlsx$/i.test(n)) xlsxFile = xlsxFile || file;
  }
  try { gradeWord(docxFile, p, out, code); }
  catch (err) { out.warnings.push('ตรวจ Word ไม่สำเร็จ: ' + err); }
  try { gradeExcel(xlsxFile, p, out, code); }
  catch (err) { out.warnings.push('ตรวจ Excel ไม่สำเร็จ: ' + err); }

  // สรุปคะแนนและรายการที่ต้องให้คนตรวจซ้ำ
  var word = 0, excel = 0;
  Object.keys(out.criteria).forEach(function (k) {
    const c = out.criteria[k];
    if (k.charAt(0) === 'W') word += c.score; else excel += c.score;
    if (c.status === 'MANUAL_REVIEW') out.manualReview.push(k);
  });
  out.wordScore = Math.round(word * 10) / 10;
  out.excelScore = Math.round(excel * 10) / 10;
  out.provisionalScore = Math.round((word + excel) * 10) / 10;
  out.gradingStatus = out.manualReview.length ? 'MANUAL_REVIEW_REQUIRED' : 'COMPLETED';
  out.folderShared = f.getEditors().some(function (u) { return u.getEmail() === HR_EMAIL; });
  return out;
}

function gradeWord(file, p, out, code) {
  const kf = p.keyFacts || {};
  const C = out.criteria;
  C.W1 = crit('W1', 4, 'ข้อมูลครบ 10 รายการตามต้นฉบับ');
  C.W2 = crit('W2', 3, 'ชื่อการประชุมถูกต้อง · 18 pt · ตัวหนา · จัดกึ่งกลาง');
  C.W3 = crit('W3', 2, 'เนื้อหา TH Sarabun New ขนาด 16 pt อย่างน้อย 90%');
  C.W4 = crit('W4', 2, 'วาระ 4 รายการเป็น Numbering อัตโนมัติ');
  C.W5 = crit('W5', 2, 'วันที่ · เวลา · สถานที่ เป็นตัวหนา');
  C.W6 = crit('W6', 2, 'ไม่เกิน 1 หน้า และชื่อไฟล์ผูกกับรหัสผู้เข้าสอบ');
  if (!file) {
    ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'].forEach(function (k) {
      setCrit(C[k], 0, 'FAIL', 'ไม่พบไฟล์ .docx ในโฟลเดอร์', [], 'ผู้สมัครไม่ได้ส่งไฟล์ Word');
    });
    return;
  }
  const name = file.getName();
  out.files.docx = { name: name, id: file.getId() };
  const gd = Drive.Files.copy({ title: name + '_grading', mimeType: MimeType.GOOGLE_DOCS }, file.getId());
  try {
    const doc = DocumentApp.openById(gd.id);
    const body = doc.getBody();
    const text = body.getText();
    const flat = flatten(text);
    const paras = body.getParagraphs().filter(function (q) { return String(q.getText() || '').trim().length > 0; });

    // ---- W1 ความครบถ้วนของข้อมูล 10 รายการ ----
    const items = [
      ['ชื่อการประชุม', kf.meeting], ['วันที่', kf.date], ['เวลา', kf.time],
      ['สถานที่', kf.place], ['ผู้เข้าร่วม', kf.attendees], ['ผู้ประสานงาน', kf.contact]
    ].concat((kf.agenda || []).map(function (a, i) { return ['วาระที่ ' + (i + 1), a]; }));
    var found = 0; const missing = [];
    items.forEach(function (x) {
      if (x[1] && flat.indexOf(flatten(x[1])) >= 0) found++; else missing.push(x[0]);
    });
    const w1 = found >= 10 ? 4 : found >= 8 ? 3 : found >= 6 ? 2 : found >= 4 ? 1 : 0;
    setCrit(C.W1, w1, w1 === 4 ? 'PASS' : w1 > 0 ? 'PARTIAL' : 'FAIL',
      'พบข้อมูล ' + found + '/' + items.length + ' รายการ',
      missing.length ? ['ไม่พบ: ' + missing.join(', ')] : ['ครบทุกรายการ'],
      w1 === 4 ? 'ข้อมูลสำคัญครบตามต้นฉบับ' : 'ข้อมูลสำคัญขาด ' + missing.length + ' รายการ');

    // ---- W2 รูปแบบชื่อการประชุม ----
    var titlePara = null;
    const titleFlat = flatten(kf.meeting || '');
    paras.forEach(function (q) {
      if (!titlePara && titleFlat && flatten(q.getText()).indexOf(titleFlat) >= 0) titlePara = q;
    });
    if (titlePara) {
      const a = titlePara.getAttributes();
      const size = a[DocumentApp.Attribute.FONT_SIZE];
      const bold = a[DocumentApp.Attribute.BOLD] === true || paraHasBold(titlePara);
      const center = String(a[DocumentApp.Attribute.HORIZONTAL_ALIGNMENT] || '').indexOf('CENTER') >= 0;
      var w2 = 1 + (size == 18 ? 0.5 : 0) + (bold ? 0.5 : 0) + (center ? 1 : 0);
      setCrit(C.W2, w2, w2 === 3 ? 'PASS' : 'PARTIAL',
        'size=' + size + ' · bold=' + bold + ' · center=' + center,
        ['paragraph: ' + titlePara.getText().slice(0, 80)],
        w2 === 3 ? 'ครบทั้งข้อความ ขนาด ตัวหนา และจัดกึ่งกลาง' : 'องค์ประกอบบางส่วนไม่ตรงคำสั่ง');
    } else {
      setCrit(C.W2, 0, 'FAIL', 'ไม่พบย่อหน้าที่เป็นชื่อการประชุม', [], 'ไม่พบชื่อการประชุมตามที่กำหนด');
    }

    // ---- W3 ฟอนต์และขนาดเนื้อหา ----
    var famOk = 0, sizeOk = 0, all = 0;
    const famSeen = {}, sizeSeen = {};
    paras.forEach(function (q) {
      if (titlePara && q === titlePara) return;
      const a = q.getAttributes();
      const fam = String(a[DocumentApp.Attribute.FONT_FAMILY] || '');
      const size = a[DocumentApp.Attribute.FONT_SIZE];
      if (size == null && !fam) return;
      all++;
      if (fam) famSeen[fam] = 1;
      if (size != null) sizeSeen[size] = 1;
      if (fam.indexOf('Sarabun') >= 0) famOk++;
      if (size == 16) sizeOk++;
    });
    const famR = all ? famOk / all : 0, sizeR = all ? sizeOk / all : 0;
    const part = function (r) { return r >= 0.9 ? 1 : r >= 0.6 ? 0.5 : 0; };
    const w3 = part(famR) + part(sizeR);
    setCrit(C.W3, w3, w3 === 2 ? 'PASS' : w3 > 0 ? 'PARTIAL' : 'FAIL',
      'ฟอนต์ตรงเกณฑ์ ' + Math.round(famR * 100) + '% · ขนาด 16 pt ' + Math.round(sizeR * 100) + '%',
      ['fonts=' + Object.keys(famSeen).join('|'), 'sizes=' + Object.keys(sizeSeen).join('|')],
      w3 === 2 ? 'เนื้อหาใช้ TH Sarabun New 16 pt ตามคำสั่ง' : 'บางส่วนใช้ฟอนต์หรือขนาดไม่ตรงคำสั่ง',
      famR < 0.6 && famOk > 0 ? 'MEDIUM' : 'HIGH');

    // ---- W4 Numbering อัตโนมัติ ----
    const listItems = body.getListItems();
    var numbered = 0;
    listItems.forEach(function (li) {
      const g = String(li.getGlyphType());
      if (g.indexOf('NUMBER') >= 0 || g.indexOf('LATIN') >= 0 || g.indexOf('ROMAN') >= 0) numbered++;
    });
    const manualNum = /(^|\n)\s*[1-4][.)]\s/.test(text);
    const w4 = numbered >= 4 ? 2 : numbered >= 1 ? 1 : 0;
    setCrit(C.W4, w4, w4 === 2 ? 'PASS' : w4 > 0 ? 'PARTIAL' : 'FAIL',
      'auto numbering ' + numbered + ' รายการ' + (w4 === 0 && manualNum ? ' · พบเลขพิมพ์เอง' : ''),
      ['listItems=' + listItems.length, 'numberedGlyphs=' + numbered],
      w4 === 2 ? 'วาระทั้ง 4 อยู่ในโครงสร้าง Numbered List' : (manualNum ? 'พิมพ์ตัวเลขเองแทน Auto Numbering' : 'ไม่พบโครงสร้าง Numbering'),
      numbered === 0 && manualNum ? 'MEDIUM' : 'HIGH');

    // ---- W5 ตัวหนาที่วันที่ / เวลา / สถานที่ ----
    const metas = [['วันที่', kf.date], ['เวลา', kf.time], ['สถานที่', kf.place]];
    var boldCount = 0; const boldEv = [];
    metas.forEach(function (m) {
      const ok = valueIsBold(paras, m[1]);
      if (ok) boldCount++;
      boldEv.push(m[0] + '=' + (ok ? 'bold' : 'not-bold'));
    });
    const w5 = boldCount >= 3 ? 2 : boldCount === 2 ? 1.5 : boldCount === 1 ? 0.5 : 0;
    setCrit(C.W5, w5, w5 === 2 ? 'PASS' : w5 > 0 ? 'PARTIAL' : 'FAIL',
      'ตัวหนาครบ ' + boldCount + '/3', boldEv,
      w5 === 2 ? 'เน้นวัน เวลา และสถานที่ครบตามคำสั่ง' : 'ยังไม่ได้เน้นตัวหนาครบทั้ง 3 จุด');

    // ---- W6 จำนวนหน้า + ชื่อไฟล์ ----
    var pageScore = 0, pageActual = '', pageConf = 'HIGH', pageStatus = 'PASS';
    try {
      const pdf = DriveApp.getFileById(gd.id).getAs('application/pdf').getDataAsString('ISO-8859-1');
      const m = pdf.match(/\/Type\s*\/Page[^s]/g);
      const pages = m ? m.length : 0;
      if (pages > 0) {
        pageScore = pages <= 1 ? 1 : 0;
        pageActual = 'จำนวนหน้า = ' + pages;
        if (pages > 1) pageStatus = 'PARTIAL';
      } else {
        pageScore = 1; pageActual = 'นับจำนวนหน้าไม่ได้ — ไม่หักคะแนนอัตโนมัติ';
        pageConf = 'LOW'; pageStatus = 'MANUAL_REVIEW';
      }
    } catch (err) {
      pageScore = 1; pageActual = 'export PDF ไม่สำเร็จ: ' + err; pageConf = 'LOW'; pageStatus = 'MANUAL_REVIEW';
    }
    const nameOk = code && name.indexOf(code) >= 0 && /^เชิญประชุม/.test(name);
    const w6 = pageScore + (nameOk ? 1 : 0);
    setCrit(C.W6, w6, pageStatus === 'MANUAL_REVIEW' ? 'MANUAL_REVIEW' : (w6 === 2 ? 'PASS' : w6 > 0 ? 'PARTIAL' : 'FAIL'),
      pageActual + ' · filename=' + name,
      ['expected filename: เชิญประชุม_' + code + '.docx'],
      nameOk ? 'ชื่อไฟล์ถูกต้องตามรหัสผู้เข้าสอบ' : 'ชื่อไฟล์ไม่ตรงรูปแบบที่กำหนด', pageConf);
  } finally {
    try { DriveApp.getFileById(gd.id).setTrashed(true); } catch (e2) {}
  }
}

function paraHasBold(q) {
  const n = q.getNumChildren();
  for (var k = 0; k < n; k++) {
    const ch = q.getChild(k);
    if (ch.getType() === DocumentApp.ElementType.TEXT) {
      const el = ch.asText(), len = el.getText().length;
      for (var i = 0; i < len; i++) if (el.isBold(i)) return true;
    }
  }
  return false;
}

// ตรวจว่าข้อความค่าหนึ่ง (วันที่/เวลา/สถานที่) ถูกทำตัวหนาหรือไม่
function valueIsBold(paras, value) {
  const target = flatten(value);
  if (!target) return false;
  for (var i = 0; i < paras.length; i++) {
    const q = paras[i];
    if (flatten(q.getText()).indexOf(target) < 0) continue;
    const attrs = q.getAttributes();
    if (attrs[DocumentApp.Attribute.BOLD] === true) return true;
    const n = q.getNumChildren();
    for (var k = 0; k < n; k++) {
      const ch = q.getChild(k);
      if (ch.getType() !== DocumentApp.ElementType.TEXT) continue;
      const el = ch.asText(), raw = el.getText();
      const idx = flatten(raw).indexOf(target);
      if (idx < 0) continue;
      // แปลงตำแหน่งจากข้อความที่ตัดช่องว่างกลับเป็นตำแหน่งจริง
      var seen = 0, from = -1, to = -1;
      for (var c = 0; c < raw.length; c++) {
        if (/\s/.test(raw.charAt(c))) continue;
        if (seen === idx) from = c;
        if (seen === idx + target.length - 1) { to = c; break; }
        seen++;
      }
      if (from < 0) continue;
      if (to < 0) to = raw.length - 1;
      for (var b = from; b <= to; b++) if (el.isBold(b)) return true;
    }
  }
  return false;
}

function gradeExcel(file, p, out, code) {
  const C = out.criteria;
  const ex = (p.expected || {});
  C.E1 = crit('E1', 2, 'ข้อมูลต้นฉบับ A–F ครบและไม่ถูกแก้');
  C.E2 = crit('E2', 6, 'ยอดคำนวณใช้ Formula จำนวน × ราคาต่อหน่วย ทั้ง 6 รายการ');
  C.E3 = crit('E3', 6, 'สถานะตรวจสอบใช้ Formula เทียบยอดขอเบิกกับยอดคำนวณ');
  C.E4 = crit('E4', 3, 'SUM ยอดคำนวณ = ' + (ex.total || 28425));
  C.E5 = crit('E5', 4, 'Conditional Formatting > ' + (ex.cfThreshold || 5000) + ' บนคอลัมน์ยอดคำนวณ');
  C.E6 = crit('E6', 2, 'ไม่มี Formula Error');
  C.E7 = crit('E7', 2, 'ชื่อไฟล์ถูกต้อง เปิดไฟล์ได้ โครงสร้างครบ');
  if (!file) {
    ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7'].forEach(function (k) {
      setCrit(C[k], 0, 'FAIL', 'ไม่พบไฟล์ .xlsx ในโฟลเดอร์', [], 'ผู้สมัครไม่ได้ส่งไฟล์ Excel');
    });
    return;
  }
  const name = file.getName();
  out.files.xlsx = { name: name, id: file.getId() };
  const gs = Drive.Files.copy({ title: name + '_grading', mimeType: MimeType.GOOGLE_SHEETS }, file.getId());
  try {
    const ss = SpreadsheetApp.openById(gs.id);
    const sh = ss.getSheets()[0];
    const rng = sh.getDataRange();
    const values = rng.getValues(), formulas = rng.getFormulas(), disp = rng.getDisplayValues();

    // หาแถวหัวตารางและคอลัมน์จาก Header ไม่ยึดตำแหน่งตายตัว
    var hr = -1;
    for (var r = 0; r < values.length && hr < 0; r++) {
      const row = values[r].map(function (v) { return String(v); });
      if (row.some(function (c) { return c.indexOf('รายการ') >= 0; }) &&
          row.some(function (c) { return c.indexOf('จำนวน') >= 0; })) hr = r;
    }
    const head = hr >= 0 ? values[hr].map(function (v) { return String(v); }) : [];
    const col = function (kw, alt) {
      for (var i = 0; i < head.length; i++) {
        if (head[i].indexOf(kw) >= 0) return i;
        if (alt && head[i].indexOf(alt) >= 0) return i;
      }
      return -1;
    };
    const cQty = col('จำนวน'), cPrice = col('ราคา'), cClaim = col('ขอเบิก');
    const cCalc = col('ยอดคำนวณ', 'คำนวณ'), cStat = col('สถานะ');
    const first = hr + 1, rows = 6;

    // ---- E1 ข้อมูลต้นฉบับ ----
    var bad = 0; const badEv = [];
    for (var i = 0; i < rows; i++) {
      const r2 = first + i;
      const q = numOf(values[r2] ? values[r2][cQty] : null);
      const pr = numOf(values[r2] ? values[r2][cPrice] : null);
      const cl = numOf(values[r2] ? values[r2][cClaim] : null);
      if ((ex.qty || [])[i] != null && q !== ex.qty[i]) { bad++; badEv.push('แถว ' + (r2 + 1) + ' จำนวน=' + q); }
      if ((ex.price || [])[i] != null && pr !== ex.price[i]) { bad++; badEv.push('แถว ' + (r2 + 1) + ' ราคา=' + pr); }
      if ((ex.claim || [])[i] != null && cl !== ex.claim[i]) { bad++; badEv.push('แถว ' + (r2 + 1) + ' ยอดขอเบิก=' + cl); }
    }
    const e1 = bad === 0 ? 2 : bad === 1 ? 1 : 0;
    setCrit(C.E1, e1, e1 === 2 ? 'PASS' : e1 > 0 ? 'PARTIAL' : 'FAIL',
      bad === 0 ? 'ข้อมูล A–F ตรงต้นฉบับทั้ง 6 รายการ' : 'พบข้อมูลไม่ตรง ' + bad + ' จุด',
      badEv.length ? badEv : ['A' + (first + 1) + ':F' + (first + rows)],
      bad === 0 ? 'ไม่มีการแก้ไขข้อมูลต้นฉบับ' : 'ข้อมูลต้นฉบับถูกเปลี่ยน');

    // ---- E2 ยอดคำนวณ ----
    var e2 = 0; const e2ev = [];
    for (var i2 = 0; i2 < rows; i2++) {
      const r3 = first + i2, cell = colLetter(cCalc) + (r3 + 1);
      const fx = cCalc >= 0 && formulas[r3] ? String(formulas[r3][cCalc] || '') : '';
      const val = cCalc >= 0 && values[r3] ? numOf(values[r3][cCalc]) : null;
      const want = (ex.calc || [])[i2];
      const resOk = want != null && val != null && Math.abs(val - want) < 0.01;
      const hasF = fx.charAt(0) === '=';
      const refOk = hasF && fx.toUpperCase().indexOf(colLetter(cQty) + (r3 + 1)) >= 0 &&
        fx.toUpperCase().indexOf(colLetter(cPrice) + (r3 + 1)) >= 0;
      var sc = 0;
      if (hasF && refOk && resOk) sc = 1;
      else if (hasF && resOk) sc = 0.75;
      else if (hasF) sc = 0.5;
      else if (resOk) sc = 0.25;
      e2 += sc;
      e2ev.push(cell + ' ' + (fx || val) + ' → ' + sc);
    }
    setCrit(C.E2, e2, e2 >= 6 ? 'PASS' : e2 > 0 ? 'PARTIAL' : 'FAIL',
      'ได้ ' + (Math.round(e2 * 100) / 100) + '/6 จาก 6 รายการ', e2ev,
      e2 >= 6 ? 'ทุกรายการใช้ Formula คูณและผลลัพธ์ถูกต้อง' : 'บางรายการไม่มี Formula หรือผลลัพธ์ไม่ถูกต้อง');

    // ---- E3 สถานะตรวจสอบ ----
    var e3 = 0; const e3ev = [];
    for (var i3 = 0; i3 < rows; i3++) {
      const r4 = first + i3, cell3 = colLetter(cStat) + (r4 + 1);
      const fx3 = cStat >= 0 && formulas[r4] ? String(formulas[r4][cStat] || '') : '';
      const txt = cStat >= 0 && values[r4] ? String(values[r4][cStat] == null ? '' : values[r4][cStat]).trim() : '';
      const want3 = (ex.status || [])[i3];
      const textOk = want3 != null && txt === want3;
      const hasIf = /IF\s*\(/i.test(fx3);
      var sc3 = 0;
      if (hasIf && textOk) sc3 = 1;
      else if (hasIf) sc3 = 0.5;
      else if (textOk) sc3 = 0.25;
      e3 += sc3;
      e3ev.push(cell3 + ' ' + (fx3 || txt) + ' → ' + sc3);
    }
    setCrit(C.E3, e3, e3 >= 6 ? 'PASS' : e3 > 0 ? 'PARTIAL' : 'FAIL',
      'ได้ ' + (Math.round(e3 * 100) / 100) + '/6 จาก 6 รายการ', e3ev,
      e3 >= 6 ? 'ใช้ Formula เทียบยอดและผลลัพธ์ถูกต้องทุกรายการ' : 'บางรายการไม่ได้ใช้ Formula หรือผลลัพธ์ไม่ตรงเกณฑ์');

    // ---- E4 SUM ----
    var e4 = 0, e4actual = 'ไม่พบยอดรวม', e4ev = [];
    const wantTotal = ex.total != null ? ex.total : 28425;
    for (var r5 = first + rows; r5 < Math.min(values.length, first + rows + 6); r5++) {
      if (cCalc < 0 || !values[r5]) continue;
      const v5 = numOf(values[r5][cCalc]), f5 = String((formulas[r5] || [])[cCalc] || '');
      if (v5 == null && !f5) continue;
      const resOk5 = v5 != null && Math.abs(v5 - wantTotal) < 0.5;
      const isSum = /SUM\s*\(/i.test(f5);
      const hasF5 = f5.charAt(0) === '=';
      if (isSum && resOk5) { e4 = 3; e4actual = 'SUM ถูกต้อง = ' + v5; }
      else if (hasF5 && resOk5) { e4 = ex.strictSum === false ? 3 : 2; e4actual = 'ใช้ Formula รวมแบบอื่น = ' + v5; }
      else if (!hasF5 && resOk5) { e4 = 0.5; e4actual = 'พิมพ์ผลลัพธ์เอง = ' + v5; }
      else if (isSum || hasF5) { e4 = Math.max(e4, 1.5); e4actual = 'มี Formula แต่ผลลัพธ์ = ' + v5; }
      e4ev.push(colLetter(cCalc) + (r5 + 1) + ' ' + (f5 || v5));
      if (e4 > 0) break;
    }
    setCrit(C.E4, e4, e4 >= 3 ? 'PASS' : e4 > 0 ? 'PARTIAL' : 'FAIL', e4actual, e4ev,
      e4 >= 3 ? 'ใช้ SUM ครอบคลุมยอดคำนวณและผลลัพธ์ถูกต้อง' : 'ยอดรวมไม่ตรงเกณฑ์หรือไม่ได้ใช้ SUM ตามคำสั่ง');

    // ---- E5 Conditional Formatting ----
    var e5 = 0, e5actual = 'ไม่พบกฎ Conditional Formatting', e5ev = [], e5conf = 'HIGH';
    const rules = sh.getConditionalFormatRules();
    const wantTh = ex.cfThreshold != null ? ex.cfThreshold : 5000;
    rules.forEach(function (rule) {
      const bc = rule.getBooleanCondition();
      if (!bc) return;
      const type = String(bc.getCriteriaType());
      const vals = bc.getCriteriaValues() || [];
      const th = numOf(vals[0]);
      const ranges = rule.getRanges().map(function (rr) { return rr.getA1Notation(); });
      e5ev.push(type + ' ' + vals.join(',') + ' @ ' + ranges.join(','));
      const onCalc = cCalc >= 0 && ranges.some(function (a1) { return a1.indexOf(colLetter(cCalc)) >= 0; });
      const covers = rules.length && onCalc;
      if (type.indexOf('GREATER_THAN') >= 0 && th === wantTh) {
        const sc5 = covers ? 4 : 3;
        if (sc5 > e5) { e5 = sc5; e5actual = 'threshold > ' + th + ' @ ' + ranges.join(','); }
      } else if (e5 < 1) {
        e5 = 1; e5actual = 'มีกฎแต่เงื่อนไข ' + type + ' ' + vals.join(',');
      }
    });
    if (!rules.length && cCalc >= 0) {
      const bgs = sh.getRange(first + 1, cCalc + 1, rows, 1).getBackgrounds();
      const manual = bgs.some(function (b) { return b[0] && b[0] !== '#ffffff' && b[0] !== '#fff'; });
      if (manual) { e5 = 0.5; e5actual = 'ใช้สีเติมด้วยมือ ไม่มีกฎ Conditional Formatting'; e5conf = 'MEDIUM'; }
    }
    setCrit(C.E5, e5, e5 >= 4 ? 'PASS' : e5 > 0 ? 'PARTIAL' : 'FAIL', e5actual, e5ev,
      e5 >= 4 ? 'กฎและช่วงข้อมูลตรงตามโจทย์' : 'กฎ Conditional Formatting ไม่ตรงเกณฑ์มากกว่า ' + wantTh, e5conf);

    // ---- E6 Formula Error ----
    const errs = [];
    disp.forEach(function (row, ri) {
      row.forEach(function (v, ci) {
        if (/#(VALUE|REF|DIV\/0|NAME|N\/A|NUM)/i.test(String(v))) errs.push(colLetter(ci) + (ri + 1) + '=' + v);
      });
    });
    const e6 = errs.length === 0 ? 2 : errs.length === 1 ? 1 : 0;
    setCrit(C.E6, e6, e6 === 2 ? 'PASS' : e6 > 0 ? 'PARTIAL' : 'FAIL',
      errs.length ? 'พบ Error ' + errs.length + ' จุด' : 'ไม่พบ Formula Error', errs,
      e6 === 2 ? 'ไฟล์ไม่มี Formula Error' : 'พบ Formula Error ในไฟล์');

    // ---- E7 ชื่อไฟล์ / โครงสร้าง ----
    const nameOk7 = code && name.indexOf(code) >= 0 && /^ค่าใช้จ่าย/.test(name);
    const structOk = hr >= 0 && cQty >= 0 && cPrice >= 0 && cClaim >= 0 && values.length >= first + rows;
    const e7 = (nameOk7 ? 1 : 0) + (structOk ? 1 : 0);
    setCrit(C.E7, e7, e7 === 2 ? 'PASS' : e7 > 0 ? 'PARTIAL' : 'FAIL',
      'filename=' + name + ' · header row=' + (hr + 1) + ' · calc col=' + (cCalc >= 0 ? colLetter(cCalc) : '-'),
      ['expected filename: ค่าใช้จ่าย_' + code + '.xlsx'],
      e7 === 2 ? 'ชื่อไฟล์และโครงสร้างข้อมูลถูกต้อง' : 'ชื่อไฟล์หรือโครงสร้างข้อมูลไม่ครบ');
  } finally {
    try { DriveApp.getFileById(gs.id).setTrashed(true); } catch (e9) {}
  }
}

function makeDoc(folder, filename, title, lines) {
  const doc = DocumentApp.create(filename.replace(/\.docx$/, ''));
  const b = doc.getBody();
  b.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  lines.forEach(function (l) { b.appendParagraph(l); });
  doc.saveAndClose();
  const file = DriveApp.getFileById(doc.getId());
  folderByPath(folder).addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  return { url: file.getUrl(), id: file.getId() };
}

function report(p) {
  const lines = [];
  lines.push('รหัสผู้เข้าสอบ: ' + (p.code || '-') + ' · ตรวจเมื่อ ' + new Date().toLocaleString('th-TH'));
  lines.push('คะแนนส่วนที่ 2 (เบื้องต้น): ' + p.total + '/' + p.max +
    ' · Word ' + (p.wordScore != null ? p.wordScore : '-') + '/15 · Excel ' + (p.excelScore != null ? p.excelScore : '-') + '/25');
  lines.push('สถานะการตรวจ: ' + (p.gradingStatus || 'COMPLETED') + ' · Rubric ' + (p.rubricVersion || '-') + ' · Prompt ' + (p.promptVersion || '-'));
  lines.push('');
  var section = '';
  (p.rows || []).forEach(function (r) {
    const sec = r.section === 'word' ? 'งานที่ 1 — Microsoft Word (15 คะแนน)' : 'งานที่ 2 — Microsoft Excel (25 คะแนน)';
    if (sec !== section) { section = sec; lines.push(''); lines.push(section); }
    lines.push('[' + (r.status || '-') + '] ' + r.id + ' ' + r.desc + ' — ' + r.got + '/' + r.pts);
    if (r.expected) lines.push('    Expected: ' + r.expected);
    if (r.actual) lines.push('    Actual: ' + r.actual);
    if (r.evidence) lines.push('    Evidence: ' + (Array.isArray(r.evidence) ? r.evidence.join(' · ') : r.evidence));
    if (r.reason) lines.push('    Reason: ' + r.reason);
    if (r.confidence) lines.push('    Confidence: ' + r.confidence);
  });
  if (p.manualReview && p.manualReview.length) {
    lines.push('');
    lines.push('ต้องให้เจ้าหน้าที่ตรวจซ้ำ (MANUAL_REVIEW): ' + p.manualReview.join(', '));
  }
  if (p.warnings && p.warnings.length) {
    lines.push('');
    lines.push('ข้อสังเกตจากการแปลงไฟล์: ' + p.warnings.join(' · '));
  }
  lines.push('');
  lines.push('เอกสารนี้เป็นหลักฐานการตรวจสำหรับแอดมิน คะแนนสุดท้ายยืนยันโดยเจ้าหน้าที่สำนักงานบุคคล');
  return makeDoc(p.folder, p.filename, p.title, lines);
}
