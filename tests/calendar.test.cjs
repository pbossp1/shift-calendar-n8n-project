const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.style = {};
    this.value = ''; this.checked = false; this.textContent = ''; this.disabled = false;
    this.classes = new Set();
    this.classList = {
      add: c => this.classes.add(c), remove: c => this.classes.delete(c),
      toggle: (c, on) => on ? this.classes.add(c) : this.classes.delete(c)
    };
  }
  set innerHTML(value) { this.children = []; this.html = value; }
  get innerHTML() { return this.html || ''; }
  appendChild(c) { this.children.push(c); }
  append(...items) { this.children.push(...items); }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  emit(type = 'click', target = this) { return this.listeners[type]?.({ target }); }
  querySelectorAll(selector) {
    const descendants = this.children.flatMap(c => [c, ...c.querySelectorAll('*')]);
    return selector === '*' ? descendants : descendants.filter(c => c.tag === selector);
  }
}

function calendar(events = []) {
  const items = [];
  const result = {
    view: { currentStart: new Date(2026, 9, 1), title: 'October 2026' },
    addEvent(ev) {
      const item = { ...ev, startStr: ev.startStr || ev.start, extendedProps: ev.extendedProps || {} };
      item.remove = () => items.splice(items.indexOf(item), 1);
      items.push(item); return item;
    },
    getEvents: () => items
  };
  events.forEach(ev => result.addEvent(ev));
  return result;
}

function harness({ saved = {}, fetch, auth = 'success', lifetime = 3600 } = {}) {
  const nodes = new Map(), alerts = [], storage = new Map(Object.entries(saved));
  const el = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  let authOptions, requests = 0;
  const context = vm.createContext({
    console, Date, JSON, Promise, setTimeout, clearTimeout, structuredClone,
    URLSearchParams, AbortController, crypto: webcrypto,
    document: { getElementById: el, createElement: tag => new Element(tag), addEventListener() {} },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    alert: message => alerts.push(message), confirm: () => true,
    fetch: fetch || (() => { throw new Error('Unexpected network request'); }),
    google: { accounts: { oauth2: {
      hasGrantedAllScopes: () => auth !== 'no_scope',
      initTokenClient(options) {
        authOptions = options;
        return { requestAccessToken() {
          requests++;
          if (auth === 'pending') return;
          if (auth.startsWith('popup_')) return options.error_callback({ type: auth });
          options.callback({ access_token: `token-${requests}`, expires_in: lifetime });
        } };
      }
    } } }
  });
  context.window = context;
  vm.runInContext(source, context);
  return { el, alerts, storage, context, run: code => vm.runInContext(code, context),
    get requests() { return requests; }, get authOptions() { return authOptions; } };
}
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const legacy = (date, title = '7-14 Vic N') => ({ summary: title, start: { dateTime: `${date}T07:00:00+07:00` } });
const local = date => ({ title: '7N', start: date, allDay: true });

// These tests run entirely offline. No Google account or live events are used.
test('morning presets, edited times, overnight month-end and leave use actual times', () => {
  const h = harness();
  const body = h.run("buildEventBody({date:'2026-10-05',code:'7N'})");
  assert.equal(body.summary, '07:00-15:00 Vic N');
  assert.equal(body.start.timeZone, 'Asia/Bangkok');
  assert.equal(body.end.timeZone, 'Asia/Bangkok');
  assert.equal(body.end.dateTime, '2026-10-05T15:00:00+07:00');
  const night = h.run("buildEventBody({date:'2026-10-31',code:'24N'})");
  assert.equal(night.end.dateTime, '2026-11-01T07:00:00+07:00');
  assert.equal(night.start.timeZone, 'Asia/Bangkok');
  assert.equal(night.end.timeZone, 'Asia/Bangkok');
  assert.equal(h.run("buildEventBody({date:'2026-12-31',code:'PL'}).end.date"), '2027-01-01');
  assert.equal(h.run("buildSummary({type:'work',start:'08:30',end:'16:00',label:'คลินิก A'})"), '08:30-16:00 คลินิก A');
});

test('migrates untouched legacy presets and snapshots without changing custom times', () => {
  const old = { '7N': { type:'work',hours:7,start:'07:00',end:'14:00',building:'N',overnight:false },
    '7C': { type:'work',hours:7,start:'08:00',end:'15:00',building:'C',overnight:false } };
  const h = harness({ saved: { 'shift-calendar-shifts': JSON.stringify(old),
    'shift-calendar-events': JSON.stringify([local('2026-10-05')]) } });
  const cal = calendar(); h.context.cal = cal; h.run('loadEvents(cal)');
  assert.equal(h.run("SHIFT_MAP['7N'].end"), '15:00');
  assert.equal(h.run("SHIFT_MAP['7C'].start"), '08:00');
  assert.equal(cal.getEvents()[0].extendedProps.preset.hours, 8);
  h.run("delete SHIFT_MAP['7N']; SHIFT_MAP['7N']=structuredClone(DEFAULT_SHIFT_MAP['7N']); SHIFT_MAP['7N'].end='18:00'");
  assert.equal(cal.getEvents()[0].extendedProps.preset.end, '15:00');
  assert.equal(JSON.parse(h.storage.get('shift-calendar-events'))[0].extendedProps.preset.end, '15:00');
});

test('building/time picker restores N/C and 8/12/24 buttons with compact titles', () => {
  const h = harness(), cal = calendar(); h.context.cal = cal;
  h.run("const picker = createShiftPicker(cal); picker.open('2026-10-05')");
  assert.deepEqual(h.el('buildingBtns').children.map(b=>b.textContent), ['N','C']);
  assert.deepEqual(h.el('shiftBtns').children.map(b=>b.textContent), ['8','12','24','Cath','PL','VL']);
  h.el('buildingBtns').children.find(b=>b.textContent==='N').emit();
  h.el('shiftBtns').children.find(b=>b.textContent==='8').emit();h.el('confirmBtn').emit();
  assert.equal(cal.getEvents()[0].title, '8N');
  assert.equal(cal.getEvents()[0].backgroundColor,'#33B679');
  h.run("picker.open('2026-10-06')");
  h.el('shiftBtns').children.find(b=>b.textContent==='12').emit();
  h.el('buildingBtns').children.find(b=>b.textContent==='C').emit();h.el('confirmBtn').emit();
  assert.equal(cal.getEvents()[1].title,'12C');
  assert.equal(cal.getEvents()[1].backgroundColor,'#D50000');
  h.run("picker.open('2026-10-07')");h.el('shiftBtns').children.find(b=>b.textContent==='PL').emit();h.el('confirmBtn').emit();
  assert.equal(cal.getEvents()[2].title,'PL');
});

test('add building once, add on-call time once, then combine them without creating presets per building', () => {
  const h=harness();h.run('createShiftSettings()');h.el('addBuildingBtn').emit();
  h.el('optionCode').value='PT';h.el('optionName').value='คลินิก A';h.el('shiftFormSave').emit();
  h.el('addPeriodBtn').emit();h.el('optionCode').value='OC';h.el('optionName').value='On-call';
  h.el('shiftFormStart').value='22:00';h.el('shiftFormEnd').value='06:30';h.el('shiftFormSave').emit();
  assert.equal(h.run("OPTIONS.periods.some(p=>p.code==='OC')"),false);assert.match(h.alerts.at(-1),/เวลาเลิก/);
  h.el('shiftFormOvernight').checked=true;h.el('shiftFormSave').emit();
  assert.equal(h.run("OPTIONS.periods.find(p=>p.code==='OC').hours"),8.5);
  const cal=calendar();h.context.cal=cal;h.run("createShiftPicker(cal).open('2026-10-05')");
  h.el('buildingBtns').children.find(b=>b.textContent==='PT').emit();
  h.el('shiftBtns').children.find(b=>b.textContent==='OC').emit();h.el('confirmBtn').emit();
  const ev=cal.getEvents()[0];assert.equal(ev.title,'OCPT');assert.equal(ev.extendedProps.preset.place,'คลินิก A');
  h.context.preset=ev.extendedProps.preset;
  assert.equal(h.run("buildEventBody({date:'2026-10-05',preset}).end.dateTime"),'2026-10-06T06:30:00+07:00');
  h.el('confirmBtn').emit();assert.equal(cal.getEvents().length,1);
  const next=harness({saved:Object.fromEntries(h.storage)});
  assert.equal(next.run("OPTIONS.buildings.some(b=>b.code==='PT')"),true);
  assert.equal(next.run("OPTIONS.periods.some(p=>p.code==='OC')"),true);
});

test('time validation catches zero length and >24h but calculates partial hours', () => {
  const h = harness();
  for (const code of ["{start:'07:00',end:'07:00',overnight:false}", "{start:'07:00',end:'15:00',overnight:true}"]) {
    assert.throws(() => h.run(`validatePreset({type:'work',building:'N',...${code}})`), /24/);
  }
  assert.equal(h.run("let c={type:'work',building:'N',start:'08:30',end:'12:00'};validatePreset(c);c.hours"), 3.5);
});

test('OAuth refreshes expired token and reuses valid token', async () => {
  const expired = harness({ lifetime: 0 });
  await expired.run('googleAuth.getToken()'); await expired.run('googleAuth.getToken()');
  assert.equal(expired.requests, 2);
  const valid = harness(); await valid.run('googleAuth.getToken()'); await valid.run('googleAuth.getToken()');
  assert.equal(valid.requests, 1);
});

test('OAuth popup close, blocked popup and missing scope reject cleanly', async () => {
  for (const auth of ['popup_closed', 'popup_failed_to_open', 'no_scope']) {
    const h = harness({ auth });
    await assert.rejects(h.run('googleAuth.getToken()'));
    await assert.rejects(h.run('googleAuth.getToken()'));
    assert.equal(h.requests, 2);
  }
});

test('concurrent OAuth calls share one popup', async () => {
  const h = harness({ auth:'pending' });
  const one = h.run('googleAuth.getToken()'), two = h.run('googleAuth.getToken()');
  assert.equal(one, two); assert.equal(h.requests, 1);
  h.authOptions.callback({ access_token: 'ok', expires_in:3600 });
  assert.equal(await one, 'ok');
});

test('pagination checks all pages and Bangkok dates, ignores unrelated appointments', async () => {
  const urls = [];
  const h = harness({ fetch: async url => { urls.push(url); return response(200, urls.length === 1
    ? { items: [legacy('2026-10-05')], nextPageToken:'next' }
    : { items: [{ summary:'PL', start:{date:'2026-10-06'} }] }); } });
  const items = await h.run("listCalendarEvents('token','2026-10-01','2026-11-01')");
  assert.equal(items.length, 2); assert.match(urls[1], /pageToken=next/);
  assert.equal(new URL(urls[0]).searchParams.get('timeMin'), '2026-10-01T00:00:00+07:00');
  assert.equal(h.run("googleEventDate({start:{dateTime:'2026-10-04T18:00:00Z'}})"), '2026-10-05');
  assert.equal(h.run("isShiftEvent({summary:'Dentist',start:{date:'2026-10-05'}})"), false);
  assert.equal(h.run("isShiftEvent({summary:'7-7 Vic N',status:'cancelled'})"), false);
});

test('send skips legacy/leave shifts and duplicate local days; second send inserts nothing', async () => {
  const remote = [legacy('2026-10-05'), {summary:'PL',start:{date:'2026-10-06'}}, {summary:'Dentist',start:{date:'2026-10-07'}}];
  let posts = 0;
  const h = harness({ fetch: async (url, options) => {
    if (options.method === 'POST') { posts++; const body=JSON.parse(options.body);remote.push(body);return response(200,body); }
    return response(200, {items:remote});
  } });
  h.context.cal = calendar(['2026-10-05','2026-10-06','2026-10-07','2026-10-07'].map(local));
  h.run('setupSendToGoogle(cal)'); await h.el('sendToGoogleBtn').emit();
  assert.equal(posts, 1); assert.match(h.el('sendStatus').textContent, /เพิ่ม 1 เวร/);
  await h.el('sendToGoogleBtn').emit(); assert.equal(posts, 1);
  assert.match(h.el('sendStatus').textContent, /เพิ่ม 0 เวร/);
  assert.equal(h.el('sendToGoogleBtn').disabled, false);
});

test('failed read never writes; failed popup restores send button', async () => {
  let posts = 0;
  const h = harness({ fetch: async (_, options) => { if(options.method === 'POST')posts++;return response(403,{error:{message:'Forbidden'}}); } });
  h.context.cal=calendar([local('2026-10-05')]);h.run('setupSendToGoogle(cal)');await h.el('sendToGoogleBtn').emit();
  assert.equal(posts,0);assert.equal(h.el('sendToGoogleBtn').disabled,false);assert.match(h.el('sendStatus').textContent,/ยังไม่ได้ส่ง/);
  const blocked=harness({auth:'popup_closed'});blocked.context.cal=calendar([local('2026-10-05')]);blocked.run('setupSendToGoogle(cal)');
  await blocked.el('sendToGoogleBtn').emit();assert.equal(blocked.el('sendToGoogleBtn').disabled,false);
});

test('partial failure retries only missing dates on the next click', async () => {
  const remote=[];let fail=true;const created=[];
  const h=harness({fetch:async(_,options)=>{
    if(options.method!=='POST')return response(200,{items:remote});
    const body=JSON.parse(options.body);
    if(body.extendedProperties.private.shiftDate==='2026-10-06' && fail)return response(400,{error:{message:'Temporary invalid event'}});
    created.push(body.id);remote.push(body);return response(200,body);
  }});
  h.context.cal=calendar(['2026-10-05','2026-10-06'].map(local));h.run('setupSendToGoogle(cal)');
  await h.el('sendToGoogleBtn').emit();assert.equal(created.length,1);fail=false;
  await h.el('sendToGoogleBtn').emit();assert.equal(created.length,2);assert.equal(new Set(created).size,2);
});

test('401 clears token and next user click requests new authorization', async () => {
  let rejected=false;
  const h=harness({fetch:async()=>{if(!rejected){rejected=true;return response(401,{error:{message:'Expired'}})}return response(200,{items:[legacy('2026-10-05')]})}});
  h.context.cal=calendar([local('2026-10-05')]);h.run('setupSendToGoogle(cal)');
  await h.el('sendToGoogleBtn').emit();await h.el('sendToGoogleBtn').emit();assert.equal(h.requests,2);
});

test('concurrent create conflict counts as skipped, deleted ID advances deterministically', async () => {
  const active = { ...legacy('2026-10-05'), status:'confirmed', extendedProperties:{private:{source:'shift-calendar'}} };
  const h=harness({fetch:async(_,options)=>response(options.method==='POST'?409:200,options.method==='POST'?{error:{message:'Conflict'}}:active)});
  assert.equal((await h.run("createCalendarEvent('token',{date:'2026-10-05',code:'7N'})")).created,false);
  const ids=[];
  const deleted=harness({fetch:async(_,options)=>{
    if(options.method!=='POST')return response(200,{status:'cancelled'});
    const body=JSON.parse(options.body);ids.push(body.id);return response(ids.length===1?409:200,body);
  }});
  assert.equal((await deleted.run("createCalendarEvent('token',{date:'2026-10-05',code:'7N'})")).created,true);
  assert.deepEqual(ids,['shift20261005','shift20261005r1']);
  assert(ids.every(id=>/^[0-9a-v]{5,1024}$/.test(id)));
});

test('malformed or incomplete Google listing never permits an insert', async () => {
  for (const body of [{}, {items:'invalid'}]) {
    let writes=0;
    const h=harness({fetch:async(_,options)=>{if(options.method==='POST')writes++;return response(200,body)}});
    h.context.cal=calendar([local('2026-10-05')]);h.run('setupSendToGoogle(cal)');await h.el('sendToGoogleBtn').emit();
    assert.equal(writes,0);assert.match(h.el('sendStatus').textContent,/ยังไม่ได้ส่ง/);
  }
});

test('editing and deleting buildings/time slots preserves scheduled snapshots and compact labels', () => {
  const h=harness();h.run('createShiftSettings()');h.el('settingsBtn').emit();
  const cal=calendar();h.context.cal=cal;h.run("createShiftPicker(cal).open('2026-10-05')");
  h.el('buildingBtns').children.find(b=>b.textContent==='N').emit();
  h.el('shiftBtns').children.find(b=>b.textContent==='8').emit();h.el('confirmBtn').emit();
  const row=(id,code)=>h.el(id).children.find(li=>li.children[0].children[0].textContent===code);
  row('periodList','8').children[1].children[0].emit();
  h.el('optionCode').value='9';h.el('shiftFormStart').value='09:00';h.el('shiftFormEnd').value='18:00';h.el('shiftFormSave').emit();
  assert.equal(h.run("OPTIONS.periods.find(p=>p.code==='9').start"),'09:00');
  row('buildingList','N').children[1].children[0].emit();h.el('optionCode').value='PT';h.el('shiftFormSave').emit();
  row('periodList','9').children[1].children[1].emit();row('buildingList','PT').children[1].children[1].emit();
  assert.equal(h.run("OPTIONS.buildings.some(b=>b.code==='PT')"),false);
  assert.equal(cal.getEvents()[0].title,'8N');
  h.context.saved=cal.getEvents()[0];
  assert.equal(h.run("buildEventBody({date:saved.startStr,preset:saved.extendedProps.preset}).end.dateTime"),'2026-10-05T15:00:00+07:00');
  const restored=calendar();h.context.restored=restored;h.run('loadEvents(restored)');
  assert.equal(restored.getEvents()[0].title,'8N');
  assert.equal(restored.getEvents()[0].extendedProps.preset.start,'07:00');
});

test('existing events from both old UIs get compact labels without losing data', () => {
  const h=harness({saved:{'shift-calendar-events':JSON.stringify([
    local('2026-10-05'),
    {title:'07:00-19:00 Vic C',start:'2026-10-06',allDay:true,extendedProps:{code:'12C',preset:{type:'work',hours:12,start:'07:00',end:'19:00',overnight:false,building:'C',colorId:'11'}}}
  ])}});
  const cal=calendar();h.context.cal=cal;h.run('loadEvents(cal)');
  assert.deepEqual(cal.getEvents().map(ev=>ev.title),['8N','12C']);
  assert.equal(cal.getEvents()[1].extendedProps.preset.end,'19:00');
});

test('markup contains every static JS element id exactly once', () => {
  const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(const [,id] of source.matchAll(/getElementById\("([^"]+)"\)/g))assert(ids.includes(id),`missing ${id}`);
});

test('Cath is a building-free standby and exports as a true all-day event', () => {
  const h=harness(),cal=calendar();h.context.cal=cal;
  h.run("createShiftPicker(cal).open('2026-12-31')");
  h.el('buildingBtns').children.find(b=>b.textContent==='N').emit();
  h.el('shiftBtns').children.find(b=>b.textContent==='Cath').emit();
  assert(h.el('buildingBtns').children.every(b=>!b.classes.has('selected')));
  h.el('confirmBtn').emit();
  const event=cal.getEvents()[0];assert.equal(event.title,'Cath');assert.equal(event.extendedProps.preset.type,'standby');
  assert.equal(event.extendedProps.preset.building,undefined);
  h.context.preset=event.extendedProps.preset;
  const body=h.run("buildEventBody({date:'2026-12-31',preset})");
  assert.equal(body.summary,'Cath');assert.equal(body.start.date,'2026-12-31');assert.equal(body.end.date,'2027-01-01');
  assert.equal(body.start.dateTime,undefined);assert.equal(body.end.dateTime,undefined);assert.match(body.description,/สแตนบาย/);
});

test('Cath upgrade preserves saved options and runs only once, including after user deletion', () => {
  const fresh=harness();
  const old=JSON.parse(fresh.storage.get('shift-calendar-options-v1'));
  delete old.cathStandbyAdded;old.periods=old.periods.filter(p=>p.code!=='Cath');
  old.buildings.push({id:'custom-building',code:'PT',name:'คลินิก A'});
  const h=harness({saved:{'shift-calendar-options-v1':JSON.stringify(old)}});
  assert.equal(h.run("OPTIONS.periods.filter(p=>p.code==='Cath').length"),1);
  assert.equal(h.run("OPTIONS.buildings.find(b=>b.id==='custom-building').name"),'คลินิก A');
  h.run("OPTIONS.periods=OPTIONS.periods.filter(p=>p.code!=='Cath');saveOptions()");
  const reloaded=harness({saved:Object.fromEntries(h.storage)});
  assert.equal(reloaded.run("OPTIONS.periods.some(p=>p.code==='Cath')"),false);
});

test('all-day standby can be edited without a time or building and Google Cath is skipped', async () => {
  let posts=0;
  const h=harness({fetch:async(_,options)=>{if(options.method==='POST')posts++;return response(200,{items:[{summary:'Cath',start:{date:'2026-10-05'},end:{date:'2026-10-06'}}]})}});
  h.run('createShiftSettings()');h.el('settingsBtn').emit();
  const row=h.el('periodList').children.find(li=>li.children[0].children[0].textContent==='Cath');
  row.children[1].children[0].emit();assert.equal(h.el('shiftFormAllDay').checked,true);assert.equal(h.el('timeFields').style.display,'none');
  h.el('shiftFormStart').value='';h.el('shiftFormEnd').value='';h.el('shiftFormSave').emit();assert.deepEqual(h.alerts,[]);
  const cal=calendar();h.context.cal=cal;h.run("createShiftPicker(cal).open('2026-10-05')");
  h.el('shiftBtns').children.find(b=>b.textContent==='Cath').emit();h.el('confirmBtn').emit();
  h.run('setupSendToGoogle(cal)');await h.el('sendToGoogleBtn').emit();
  assert.equal(posts,0);assert.match(h.el('sendStatus').textContent,/ข้ามรายการที่มีแล้ว 1/);
});

test('8C and Cath coexist in either order; duplicate Cath and a second regular shift are blocked', () => {
  for (const order of [['8','Cath'],['Cath','8']]) {
    const h=harness(),cal=calendar();h.context.cal=cal;
    h.run('const pairPicker=createShiftPicker(cal)');
    const add=code=>{
      h.run("pairPicker.open('2026-10-05')");
      if(code!=='Cath')h.el('buildingBtns').children.find(b=>b.textContent==='C').emit();
      h.el('shiftBtns').children.find(b=>b.textContent===code).emit();h.el('confirmBtn').emit();
    };
    order.forEach(add);assert.deepEqual(cal.getEvents().map(ev=>ev.title).sort(),['8C','Cath']);
    add('Cath');add('12');assert.equal(cal.getEvents().length,2);assert.equal(h.alerts.length,2);
    const reloaded=calendar();h.context.reloaded=reloaded;h.run('loadEvents(reloaded)');
    assert.deepEqual(reloaded.getEvents().map(ev=>ev.title).sort(),['8C','Cath']);
  }
});

test('Google independently fills the missing regular/Cath slot and repeating send adds neither again', async () => {
  for (const initial of [[],['regular'],['cath'],['regular','cath']]) {
    const remote=initial.map(kind=>kind==='regular'?legacy('2026-10-05'):{summary:'CATH',start:{date:'2026-10-05'},end:{date:'2026-10-06'}});
    const posts=[];
    const h=harness({fetch:async(_,options)=>{
      if(options.method!=='POST')return response(200,{items:remote});
      const body=JSON.parse(options.body);posts.push(body);remote.push(body);return response(200,body);
    }});
    const cath={title:'Cath',start:'2026-10-05',allDay:true,extendedProps:{code:'Cath',preset:{type:'standby',label:'Cath',displayCode:'Cath',colorId:'3'}}};
    h.context.cal=calendar([local('2026-10-05'),cath]);h.run('setupSendToGoogle(cal)');
    await h.el('sendToGoogleBtn').emit();assert.equal(posts.length,2-initial.length);
    assert.equal(new Set(posts.map(p=>p.id)).size,posts.length);
    for(const body of posts){assert.equal(body.extendedProperties.private.shiftKind,body.summary==='Cath'?'standby':'work');}
    await h.el('sendToGoogleBtn').emit();assert.equal(posts.length,2-initial.length);
  }
});

test('old Cath using a shared daily ID is preserved while regular shift uses the next ID', async () => {
  const oldCath={id:'shift20261005',summary:'Cath',start:{date:'2026-10-05'},description:'สแตนบายทั้งวัน 1 วัน',extendedProperties:{private:{source:'shift-calendar'}}};
  const ids=[];
  const h=harness({fetch:async(url,options)=>{
    if(options.method!=='POST')return response(200,oldCath);
    const body=JSON.parse(options.body);ids.push(body.id);
    return response(body.id===oldCath.id?409:200,body);
  }});
  const result=await h.run("createCalendarEvent('token',{date:'2026-10-05',code:'7C'})");
  assert.equal(result.created,true);assert.deepEqual(ids,['shift20261005','shift20261005r1']);
  assert.equal(result.event.extendedProperties.private.shiftKind,'work');
});
