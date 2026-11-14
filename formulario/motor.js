/* Motor dos formulários em chat de eduardoandreolla.com.br (ficha do Google, tráfego pago, social media).
   Cada página carrega este arquivo e depois chama iniciar({...}) com as suas perguntas.
   Respostas: Apps Script (planilha, Drive e e-mail); se falhar, WhatsApp com tudo pronto. */

const CONFIG = {
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbzdbCXeRlmy0E4LaHA9fECWuLFLb8Za63nxmUbL0aNzORgmBMaIXt_rzVagfoSzaQ1bHg/exec',
  WHATSAPP: '5554999912682'
};

/* ============ UTILIDADES ============ */
const $chat = document.getElementById('chat');
const $comp = document.getElementById('composer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
const digits = s => String(s || '').replace(/\D/g, '');
const firstName = n => (n || '').trim().split(/\s+/)[0] || '';
const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s\-\/(])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(De|Da|Do|Das|Dos|E|Em)\b/g, w => w.toLowerCase()).replace(/\b(Sa|Ltda|Me|Epp|Eireli|Ii|Iii|Iv)\b/g, w => w.toUpperCase()).replace(/^./, c => c.toUpperCase());
const fmtDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const SIM_NAO = ['Sim', 'Não'];

const mask = {
  cpf: v => { const d = digits(v).slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); },
  cnpj: v => { const c = String(v).toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14), parts = [2, 3, 3, 4, 2], sep = ['.', '.', '/', '-'];
    let out = '', i = 0; for (let k = 0; k < parts.length && i < c.length; k++) { if (k) out += sep[k - 1]; out += c.slice(i, i + parts[k]); i += parts[k]; } return out; },
  phone: v => { const d = digits(v).replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : d;
    if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`; },
  cep: v => { const d = digits(v).slice(0, 8); return d.length > 5 ? d.slice(0,5) + '-' + d.slice(5) : d; }
};
function cpfValido(c) {
  c = digits(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (let t = 9; t < 11; t++) { let s = 0; for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i); if (+c[t] !== ((10 * s) % 11) % 10) return false; }
  return true;
}
function cnpjValido(c) { // aceita o CNPJ alfanumérico (Receita, a partir de 2026)
  c = String(c).toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1+$/.test(c)) return false;
  const dv = b => { let w = 2, s = 0; for (let i = b.length - 1; i >= 0; i--) { s += (b.charCodeAt(i) - 48) * w; w = w === 9 ? 2 : w + 1; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(c.slice(0, 12)), d2 = dv(c.slice(0, 12) + d1);
  return c.slice(12) === `${d1}${d2}`;
}
async function getJSON(url, ms = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) return null; return await r.json(); }
  catch (e) { return null; } finally { clearTimeout(t); }
}
/** Dados da Receita: BrasilAPI e, se falhar, CNPJ.ws (pública, até 3 consultas por minuto). */
async function consultarCNPJ(num) {
  let c = null;
  const d = await getJSON('https://brasilapi.com.br/api/cnpj/v1/' + num);
  if (d && d.razao_social) c = {
    razao: d.razao_social, fantasia: d.nome_fantasia, abertura: d.data_inicio_atividade, situacao: d.descricao_situacao_cadastral,
    atividade: d.cnae_fiscal_descricao, rua: [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' '),
    numero: d.numero, complemento: d.complemento, bairro: d.bairro, cidade: d.municipio, uf: d.uf, cep: d.cep };
  if (!c) {
    const w = await getJSON('https://publica.cnpj.ws/cnpj/' + num);
    const e = w && w.estabelecimento;
    if (w && w.razao_social && e) c = {
      razao: w.razao_social, fantasia: e.nome_fantasia, abertura: e.data_inicio_atividade, situacao: e.situacao_cadastral,
      atividade: (e.atividade_principal || {}).descricao, rua: [e.tipo_logradouro, e.logradouro].filter(Boolean).join(' '),
      numero: e.numero, complemento: e.complemento, bairro: e.bairro, cidade: (e.cidade || {}).nome, uf: (e.estado || {}).sigla, cep: e.cep };
  }
  if (!c) return null;
  return {
    razao: titleCase(c.razao), fantasia: c.fantasia ? titleCase(c.fantasia) : '',
    abertura: c.abertura || '', situacao: c.situacao || '', atividade: c.atividade || '',
    rua: titleCase(c.rua || ''), numero: c.numero || '', complemento: titleCase(String(c.complemento || '').replace(/\s{2,}/g, ' ')),
    bairro: titleCase(c.bairro || ''), cidade: titleCase(c.cidade || ''), uf: c.uf || '', cep: c.cep ? mask.cep(c.cep) : ''
  };
}
const UFS = {AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};

/* ============ ESTADO ============ */
let F = null;        // formulário em uso (iniciar)
let STEPS = [];
let A = {};          // respostas
const ARQ = {};      // arquivos escolhidos (ficam só na memória)
let cur = -1;        // passo atual
let editing = false; // voltando da revisão
function save() {
  try { const r = Object.fromEntries(Object.entries(A).filter(([k]) => !ARQ[k])); localStorage.setItem(F.storage, JSON.stringify({ A: r, cur, t: Date.now() })); } catch (e) {}
}
function load() { try { return JSON.parse(localStorage.getItem(F.storage) || 'null'); } catch (e) { return null; } }
function wipe() { try { localStorage.removeItem(F.storage); } catch (e) {} }

/* ============ CHAT ============ */
let lastSide = null;
function scroll() { requestAnimationFrame(() => { $chat.scrollTop = $chat.scrollHeight; }); }
function addRow(side, html, cls = '') {
  const row = document.createElement('div');
  row.className = `row ${side}` + (lastSide !== side ? ' first' : '');
  row.innerHTML = (side === 'bot' ? '<div class="mini" aria-hidden="true">EA</div>' : '') + `<div class="bubble ${cls}">${html}</div>`;
  $chat.appendChild(row); lastSide = side; scroll(); return row;
}
async function say(line) {
  if (line == null || line === '') return;
  const isHint = typeof line === 'object' && line.hint;
  const isCard = typeof line === 'object' && line.card;
  const text = isHint ? line.hint : isCard ? '' : line;
  if (!isHint && !reduce) {
    const t = addRow('bot', '<span class="typing"><span></span><span></span><span></span></span>');
    t.querySelector('.bubble').style.padding = '0';
    await sleep(Math.min(250 + String(text).length * 11, 1100));
    t.remove(); const last = $chat.lastElementChild; lastSide = last && last.classList.contains('bot') ? 'bot' : null;
  }
  if (isCard) addRow('bot', line.card, 'card');
  else addRow('bot', rich(text), isHint ? 'hint' : '');
}
function me(text) { addRow('me', rich(text)); }
function block(el) { $chat.appendChild(el); lastSide = 'block'; scroll(); return el; }

/* ============ PERGUNTAS QUE SE REPETEM ============ */
const resetCNPJ = a => { (a._pre || []).forEach(k => delete a[k]); delete a._pre; delete a._cnpj; delete a.cnpj_ok; delete a.end_cnpj_ok; };
const P = {
  contato: (stage, { cpfMotivo = 'Uso só para o contrato.', email = false } = {}) => [
    { id: 'nome', stage, label: 'Nome completo',
      say: () => ['Qual é o seu **nome completo**?'],
      input: { type: 'text', placeholder: 'Digite seu nome completo', autocomplete: 'name',
        validate: v => v.trim().split(/\s+/).length >= 2 || 'Digite nome e sobrenome.' } },
    { id: 'cpf', stage, label: 'CPF',
      say: a => [`Prazer, ${firstName(a.nome)}! 😊 Qual é o número do seu **CPF**?`, { hint: cpfMotivo }],
      input: { type: 'cpf' } },
    { id: 'whats', stage, label: 'WhatsApp pessoal',
      say: () => ['Qual é o seu **WhatsApp**?', { hint: 'Com DDD. Exemplo: (54) 99999-9999' }],
      input: { type: 'phone' } },
    ...(email ? [{ id: 'email', stage, label: 'E-mail',
      say: () => ['Qual é o seu **e-mail**?'], input: { type: 'email', placeholder: 'seuemail@exemplo.com' } }] : [])
  ],
  cnpj: stage => [
    { id: 'tem_cnpj', stage, label: 'Tem CNPJ',
      say: () => ['A sua empresa possui **CNPJ**?'], input: { type: 'choice', options: SIM_NAO }, reset: resetCNPJ },
    { id: 'cnpj', stage, label: 'CNPJ', when: a => a.tem_cnpj === 'Sim',
      say: () => ['Qual é o número do **CNPJ**?', { hint: 'Com ele eu já busco os dados na Receita para você digitar menos.' }],
      input: { type: 'cnpj' }, reset: resetCNPJ,
      after: async (v, a) => {
        const c = await consultarCNPJ(v.replace(/[^0-9A-Z]/gi, ''));
        if (!c) { await say({ hint: 'Não consegui consultar a Receita agora. Sem problema, sigo com as perguntas.' }); return; }
        a._cnpj = c;
      } },
    { id: 'cnpj_ok', stage, label: 'Dados da Receita conferem', when: a => a.tem_cnpj === 'Sim' && a._cnpj,
      say: a => { const c = a._cnpj; return ['Encontrei sua empresa na Receita Federal: 🔎', { card:
        `<dl><dt>Empresa</dt><dd>${esc(c.fantasia || c.razao)}</dd>` + (c.fantasia ? `<dt>Razão social</dt><dd>${esc(c.razao)}</dd>` : '') +
        (c.abertura ? `<dt>Abertura</dt><dd>${fmtDate(c.abertura)}</dd>` : '') + (c.situacao ? `<dt>Situação</dt><dd>${esc(titleCase(c.situacao))}</dd>` : '') + '</dl>' },
        'É essa a sua empresa?']; },
      input: { type: 'choice', options: ['Sim, é essa', 'Não é essa'] },
      after: async (v, a) => {
        if (v === 'Sim, é essa') { if (a._cnpj.abertura && !a.data_abertura) { a.data_abertura = a._cnpj.abertura; a._pre = (a._pre || []).concat('data_abertura'); } }
        else { delete a._cnpj; await say('Tudo bem! Vou seguir perguntando, e você confere o número do CNPJ na revisão.'); }
      } }
  ],
  nomeEmpresa: (stage, extra) => ({ id: 'nome_empresa', stage, label: 'Nome da empresa',
    say: () => ['Qual é o **nome da empresa** como os clientes conhecem?'].concat(extra ? [{ hint: extra }] : []),
    input: { type: 'text', placeholder: 'Nome da empresa',
      chips: a => a._cnpj ? [a._cnpj.fantasia, a._cnpj.razao].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).map(x => ({ label: x, value: x })) : [] } }),
  arquivos: (stage, { logo = true, fotosTexto } = {}) => [
    ...(logo ? [{ id: 'logo', stage, label: 'Logotipo', arquivo: true,
      say: () => ['Agora, se tiver, me envie o **logotipo** da empresa. 🎨', { hint: 'De preferência em boa qualidade (PNG com fundo transparente é o ideal). Pode pular se não tiver.' }],
      input: { type: 'files', max: 3, logo: true, botao: 'Escolher o logotipo', pular: 'Não tenho logotipo' } }] : []),
    { id: 'fotos', stage, label: 'Fotos e vídeos', arquivo: true,
      say: () => [fotosTexto || 'E as **fotos** da empresa: fachada, ambiente por dentro, equipe, produtos ou serviços. 📸', { hint: 'Pode escolher várias de uma vez, até 15. Se preferir, pule e me mande pelo WhatsApp depois.' }],
      input: { type: 'files', max: 15, botao: 'Escolher fotos', pular: 'Mando depois pelo WhatsApp' } }
  ],
  contrato: stage => [
    { id: 'pag_contrato', stage, label: 'Pagamento do contrato',
      say: () => ['Por último, o **pagamento do nosso contrato** 📝', 'Como você prefere **pagar**?'], input: { type: 'choice', options: ['À vista', 'Parcelado'] } },
    { id: 'parcelas', stage, label: 'Parcelas', when: a => a.pag_contrato === 'Parcelado',
      say: () => ['Em **quantas parcelas**?'], input: { type: 'choice', options: ['2x', '3x', '4x', '5x', '6x'] } },
    { id: 'vencimento', stage, label: 'Vencimento',
      say: a => [a.pag_contrato === 'Parcelado' ? 'Qual é a **data da 1ª parcela**?' : 'Qual é a **data do pagamento**?'],
      input: { type: 'date', min: today }, show: fmtDate }
  ],
  revisao: stage => ({ id: 'revisao', stage, review: true })
};

/* ============ MOTOR ============ */
const etapas = () => F.stages.length - 1; // a última é a revisão
function setStage(n) {
  const total = etapas();
  document.querySelectorAll('.bars i').forEach((b, i) => b.classList.toggle('on', i < Math.min(n + 1, total)));
  document.getElementById('stage').textContent = n >= total ? 'Revisão' : `Etapa ${n + 1} de ${total} · ${F.stages[n]}`;
}
const visible = s => !s.when || s.when(A);
function showVal(s, v) {
  if (v == null) return '';
  if (s.show) return s.show(v);
  if (s.input && s.input.type === 'hours') return v.texto;
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}
async function go(from) {
  for (let i = from + 1; i < STEPS.length; i++) {
    const s = STEPS[i];
    if (!visible(s)) continue;
    if (s.key && A[s.key] !== undefined) continue;
    if (editing && (s.msg || s.nokey)) continue;
    cur = i; save(); return run(s);
  }
}
async function run(s) {
  setStage(s.stage);
  $comp.innerHTML = '';
  if (s.review) { editing = false; return review(); }
  for (const l of s.say(A)) await say(l);
  if (s.msg) return go(STEPS.indexOf(s));
  renderInput(s);
}
async function answer(s, value, shown) {
  $comp.innerHTML = '';
  me(shown != null ? shown : showVal(s, value));
  if (s.key) {
    const old = A[s.key];
    if (old !== undefined && JSON.stringify(old) !== JSON.stringify(value) && s.reset) s.reset(A);
    A[s.key] = value;
  }
  if (s.after) await s.after(value, A);
  save();
  go(STEPS.indexOf(s));
}

/* ============ ENTRADAS ============ */
const SEND = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg>';
function renderInput(s) {
  const inp = s.input, t = inp.type;
  if (t === 'choice') return renderChoice(s);
  if (t === 'multi') return renderMulti(s);
  if (t === 'hours') return renderHours(s);
  if (t === 'files') return renderFiles(s);

  const chips = (inp.chips ? inp.chips(A) : []).concat(inp.optional ? [{ label: inp.optional, value: inp.optional }] : []);
  let html = '';
  if (chips.length) html += '<div class="chips">' + chips.map((c, i) => `<button type="button" class="chip" data-i="${i}">${esc(c.label)}</button>`).join('') + '</div>';
  html += '<form class="compose" novalidate>';
  const ph = esc(inp.placeholder || ({ cpf: '000.000.000-00', cnpj: '00.000.000/0000-00', phone: '(54) 99999-9999', email: 'seuemail@gmail.com', cep: '00000-000' }[t] || 'Digite sua resposta...'));
  if (t === 'textarea') html += `<textarea rows="2" placeholder="${ph}" aria-label="Sua resposta"></textarea>`;
  else if (t === 'select') html += '<select aria-label="Escolha">' + inp.options.map(o => `<option value="${o.value}"${o.value === (A[s.key] || inp.def) ? ' selected' : ''}>${esc(o.label)}</option>`).join('') + '</select>';
  else {
    const typ = t === 'email' ? 'email' : t === 'date' ? 'date' : t === 'phone' ? 'tel' : 'text';
    const im = { cpf: 'numeric', phone: 'tel', cep: 'numeric', email: 'email', site: 'url', money: 'decimal' }[t] || inp.inputmode || 'text';
    const ac = { phone: 'tel', email: 'email', cep: 'postal-code' }[t] || inp.autocomplete || 'off';
    const lim = t === 'date' ? ` ${inp.min ? `min="${inp.min()}"` : ''} ${inp.max ? `max="${inp.max()}"` : ''}` : '';
    html += `<input type="${typ}" inputmode="${im}" autocomplete="${ac}" placeholder="${ph}" aria-label="Sua resposta"${inp.list ? ' list="dl"' : ''}${lim}>`;
    if (inp.list) html += '<datalist id="dl">' + inp.list.map(x => `<option value="${esc(x)}">`).join('') + '</datalist>';
  }
  html += `<button class="send" aria-label="Enviar">${SEND}</button></form><div class="err" role="alert"></div>`;
  if (inp.counter) html += '<div class="count"></div>';
  $comp.innerHTML = html;

  const f = $comp.querySelector('input,textarea,select'), err = $comp.querySelector('.err'), cnt = $comp.querySelector('.count');
  const opt = inp.optional, chipVals = chips.map(c => c.value);
  if (A[s.key] !== undefined && t !== 'select' && !chipVals.includes(A[s.key])) f.value = Array.isArray(A[s.key]) ? A[s.key].join('\n') : A[s.key];
  if (mask[t]) f.addEventListener('input', () => { f.value = mask[t](f.value); });
  if (t === 'textarea') {
    const grow = () => { f.style.height = 'auto'; f.style.height = Math.min(f.scrollHeight, 180) + 'px'; if (cnt) cnt.textContent = f.value.trim().length + ' caracteres'; };
    f.addEventListener('input', grow); grow();
  }
  f.addEventListener('input', () => { err.textContent = ''; });
  $comp.querySelectorAll('.chip').forEach(b => b.onclick = () => answer(s, chips[+b.dataset.i].value));
  $comp.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const r = check(t, f.value, inp);
    if (r.error) { err.textContent = r.error; f.focus(); return; }
    answer(s, r.value);
  };
  setTimeout(() => { if (matchMedia('(pointer:fine)').matches || A[s.key] !== undefined) f.focus(); }, 50);
}
function check(t, raw, inp) {
  const v = String(raw).trim();
  if (!v) return { error: inp.optional ? `Digite ou toque em "${inp.optional}".` : 'Digite sua resposta.' };
  switch (t) {
    case 'cpf': return cpfValido(v) ? { value: mask.cpf(v) } : { error: 'Esse CPF não parece certo. Confira os números.' };
    case 'cnpj': return cnpjValido(v) ? { value: mask.cnpj(v) } : { error: 'Esse CNPJ não parece certo. Confira os números.' };
    case 'phone': { const d = digits(v).replace(/^55(?=\d{10,11}$)/, '');
      return (d.length === 10 || d.length === 11) && +d.slice(0, 2) >= 11 ? { value: mask.phone(d) } : { error: 'Digite o número com DDD. Exemplo: (54) 99999-9999' }; }
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? { value: v.toLowerCase() } : { error: 'Esse e-mail não parece certo.' };
    case 'cep': return digits(v).length === 8 ? { value: mask.cep(v) } : { error: 'O CEP tem 8 números. Se não souber, toque em "Não sei o CEP".' };
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(v) ? { value: v } : { error: 'Escolha uma data.' };
    case 'instagram': { const m = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i); const u = (m ? m[1] : v).replace(/^@+/, '').replace(/\s/g, '');
      return /^[A-Za-z0-9._]{1,30}$/.test(u) ? { value: '@' + u } : { error: 'Digite só o usuário, por exemplo @suaempresa.' }; }
    case 'site': { if (/\s/.test(v) || !/\./.test(v)) return { error: 'Digite o endereço do site, por exemplo www.suaempresa.com.br' };
      return { value: /^https?:\/\//i.test(v) ? v : 'https://' + v.replace(/^\/+/, '') }; }
    case 'money': { const n = v.replace(/[^\d,.]/g, ''); if (!/\d/.test(n)) return { error: 'Digite um valor, por exemplo 1.500' };
      return { value: v.trim().startsWith('R$') ? v.trim() : 'R$ ' + v.trim() }; }
    case 'textarea': if (inp.min && v.length < inp.min) return { error: 'Escreva um pouco mais, por favor.' }; return { value: v };
    case 'select': return { value: v };
    default: if (inp.validate) { const r = inp.validate(v); if (r !== true) return { error: r }; } return { value: v };
  }
}
function renderChoice(s) {
  const box = document.createElement('div'); box.className = 'choices';
  s.input.options.forEach(o => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = o;
    b.onclick = () => { box.querySelectorAll('button').forEach(x => x.disabled = true); box.remove(); answer(s, o); };
    box.appendChild(b);
  });
  block(box);
}
function renderMulti(s) {
  const inp = s.input, sel = new Set(Array.isArray(A[s.key]) ? A[s.key] : []);
  const box = document.createElement('div'); box.className = 'choices multi';
  const opts = inp.options.concat(inp.none ? [inp.none] : []);
  const btns = opts.map(o => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = o; b.setAttribute('aria-pressed', sel.has(o));
    if (sel.has(o)) b.classList.add('sel');
    b.onclick = () => {
      if (sel.has(o)) sel.delete(o); else { sel.add(o); if (o === inp.none) [...sel].forEach(x => x !== o && sel.delete(x)); else sel.delete(inp.none); }
      btns.forEach(x => { x.classList.toggle('sel', sel.has(x.textContent)); x.setAttribute('aria-pressed', sel.has(x.textContent)); });
      ok.disabled = !sel.size;
    };
    box.appendChild(b); return b;
  });
  const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'go'; ok.textContent = 'Enviar ✓'; ok.disabled = !sel.size;
  ok.onclick = () => { box.remove(); answer(s, opts.filter(o => sel.has(o))); };
  box.appendChild(ok);
  block(box);
}

/* ---- horários ---- */
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const PRESETS = {
  'Seg a sex, comercial': () => DIAS.map((d, i) => ({ open: i < 5, p: [['08:00', '12:00'], ['13:30', '18:00']] })),
  'Seg a sáb, comercial': () => DIAS.map((d, i) => ({ open: i < 6, p: i === 5 ? [['08:00', '12:00']] : [['08:00', '12:00'], ['13:30', '18:00']] })),
  'Aberto 24 horas': () => DIAS.map(() => ({ open: true, p: [['00:00', '24:00']] }))
};
function hoursText(H) {
  const h = x => x.replace(/^0(\d)/, '$1').replace(':00', 'h').replace(':', 'h');
  const fmt = d => !d.open ? 'fechado' : (d.p[0][0] === '00:00' && d.p[0][1] === '24:00') ? '24 horas' : d.p.map(p => `das ${h(p[0])} às ${h(p[1])}`).join(' e ');
  const out = []; let i = 0;
  while (i < 7) { let j = i; while (j + 1 < 7 && fmt(H[j + 1]) === fmt(H[i])) j++;
    const nome = i === j ? DIAS[i] : j === i + 1 ? `${DIAS[i]} e ${DIAS[j].toLowerCase()}` : `${DIAS[i]} a ${DIAS[j].toLowerCase()}`;
    out.push(`${nome}: ${fmt(H[i])}`); i = j + 1; }
  return out.join('\n');
}
function renderHours(s) {
  let H = A[s.key] && A[s.key].dias ? JSON.parse(JSON.stringify(A[s.key].dias)) : PRESETS['Seg a sex, comercial']();
  const card = document.createElement('div'); card.className = 'hours';
  const draw = () => {
    card.innerHTML = '<div class="presets">' + Object.keys(PRESETS).map(k => `<button type="button" class="chip" data-p="${k}">${k}</button>`).join('') + '</div>' +
      H.map((d, i) => `<div class="day"><label class="tog"><input type="checkbox" data-d="${i}" ${d.open ? 'checked' : ''}>${DIAS[i].slice(0, 3)}</label>` +
        (d.open ? '<div class="periods">' + d.p.map((p, j) => `<div class="per"><input type="time" data-d="${i}" data-p="${j}" data-k="0" value="${p[0] === '24:00' ? '23:59' : p[0]}" aria-label="${DIAS[i]} abre"> às <input type="time" data-d="${i}" data-p="${j}" data-k="1" value="${p[1] === '24:00' ? '23:59' : p[1]}" aria-label="${DIAS[i]} fecha">${j ? `<button type="button" class="x" data-rm="${i}">remover</button>` : ''}</div>`).join('') +
          (d.p.length < 2 ? `<button type="button" class="addp" data-add="${i}">+ intervalo (ex.: almoço)</button>` : '') + '</div>'
          : '<div class="closed">Fechado</div>') + '</div>').join('') +
      `<div class="foot"><button type="button" class="btn ghost" data-copy>Copiar segunda para os dias abertos</button><button type="button" class="btn" data-ok>Confirmar horários</button></div><div class="err" role="alert"></div>` +
      '<button type="button" class="btn ghost" data-var style="padding-left:0">Meus horários variam, prefiro escrever</button>';
  };
  draw();
  card.addEventListener('change', e => {
    const t = e.target, d = +t.dataset.d;
    if (t.type === 'checkbox') { H[d].open = t.checked; if (t.checked && !H[d].p.length) H[d].p = [['08:00', '18:00']]; draw(); }
    if (t.type === 'time') { H[d].p[+t.dataset.p][+t.dataset.k] = t.value === '23:59' ? '24:00' : t.value; }
  });
  card.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.p !== undefined && PRESETS[t.dataset.p]) { H = PRESETS[t.dataset.p](); draw(); }
    else if (t.dataset.add !== undefined) { const d = H[+t.dataset.add]; d.p.push([d.p[0][1] < '13:30' ? '13:30' : d.p[0][1], '18:00']); if (d.p[0][1] > '12:00' && d.p[0][1] < '24:00') d.p[0][1] = '12:00'; draw(); }
    else if (t.dataset.rm !== undefined) { H[+t.dataset.rm].p.splice(1); draw(); }
    else if (t.hasAttribute('data-copy')) { if (!H[0].open) return; H.forEach((d, i) => { if (i && d.open) d.p = JSON.parse(JSON.stringify(H[0].p)); }); draw(); }
    else if (t.hasAttribute('data-var')) { card.remove(); renderInput(Object.assign({}, s, { input: { type: 'textarea', placeholder: 'Ex.: Segunda a sexta, das 8h às 12h e das 13h30 às 18h; sábado das 9h às 11h' }, after: null })); patchVar(s); }
    else if (t.hasAttribute('data-ok')) {
      const err = card.querySelector('.err');
      if (!H.some(d => d.open)) { err.textContent = 'Marque pelo menos um dia aberto.'; return; }
      for (let i = 0; i < 7; i++) { const d = H[i]; if (!d.open) continue;
        for (const p of d.p) if (!p[0] || !p[1] || p[0] >= p[1]) { err.textContent = `Confira o horário de ${DIAS[i].toLowerCase()}: o fechamento tem que ser depois da abertura.`; return; }
        if (d.p[1] && d.p[1][0] < d.p[0][1]) { err.textContent = `Em ${DIAS[i].toLowerCase()}, o segundo horário começa antes do primeiro terminar.`; return; } }
      card.remove(); const texto = hoursText(H); answer(s, { texto, dias: H }, texto);
    }
  });
  block(card);
}
function patchVar(s) { // horário escrito à mão
  const form = $comp.querySelector('form'), f = $comp.querySelector('textarea'), err = $comp.querySelector('.err');
  form.onsubmit = e => { e.preventDefault(); const v = f.value.trim(); if (v.length < 5) { err.textContent = 'Escreva os dias e horários.'; return; } answer(s, { texto: v, dias: null }, v); };
}

/* ---- arquivos (logo e fotos) ---- */
function lerImagem(file, maxLado, png) {
  return new Promise(resolve => {
    const bruto = () => { // sem conversão (SVG, PDF, vídeo curto ou formato que o navegador não abre)
      if (file.size > 8 * 1024 * 1024) return resolve(null);
      const r = new FileReader(); r.onload = () => resolve({ nome: file.name, mime: file.type || 'application/octet-stream', dados: r.result }); r.onerror = () => resolve(null); r.readAsDataURL(file);
    };
    if (!/^image\/(jpeg|png|webp|heic|heif)/i.test(file.type)) return bruto();
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d'); if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const mime = png ? 'image/png' : 'image/jpeg';
      resolve({ nome: file.name.replace(/\.[^.]+$/, '') + (png ? '.png' : '.jpg'), mime, dados: c.toDataURL(mime, 0.85) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); bruto(); };
    img.src = url;
  });
}
function renderFiles(s) {
  const inp = s.input, lista = (ARQ[s.key] || []).slice();
  const card = document.createElement('div'); card.className = 'files';
  const draw = () => {
    card.innerHTML = `<label class="pick">＋ ${esc(inp.botao)}<input type="file" ${inp.logo ? 'accept="image/*,.svg,.pdf,.ai,.eps"' : 'accept="image/*" multiple'}></label>` +
      (lista.length ? '<div class="thumbs">' + lista.map((f, i) => `<div class="thumb${inp.logo ? ' logo' : ''}">${/^image\//.test(f.mime) ? `<img src="${f.dados}" alt="">` : `<span style="display:grid;place-items:center;height:100%;font-size:12px;padding:4px;text-align:center">${esc(f.nome)}</span>`}<button type="button" data-rm="${i}" aria-label="Remover">×</button></div>`).join('') + '</div>' : '') +
      `<div class="foot"><span class="info">${lista.length ? lista.length + ' de ' + inp.max : 'Nenhum arquivo escolhido'}</span>` +
      `<span><button type="button" class="btn ghost" data-skip>${esc(inp.pular)}</button> <button type="button" class="btn" data-ok ${lista.length ? '' : 'disabled'}>Enviar ✓</button></span></div><div class="err" role="alert"></div>`;
  };
  draw();
  card.addEventListener('change', async e => {
    if (e.target.type !== 'file') return;
    const files = [...e.target.files].slice(0, inp.max - lista.length);
    card.querySelector('.info').textContent = 'Preparando...';
    for (const f of files) {
      const r = await lerImagem(f, inp.logo ? 2000 : 1600, inp.logo && /png|webp/i.test(f.type));
      if (r) lista.push(r);
    }
    draw();
    if (files.length < e.target.files.length || lista.length >= inp.max) card.querySelector('.err').textContent = `Cabem até ${inp.max} arquivos aqui.`;
  });
  card.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rm !== undefined) { lista.splice(+b.dataset.rm, 1); draw(); }
    else if (b.hasAttribute('data-skip')) { card.remove(); delete ARQ[s.key]; answer(s, inp.pular); }
    else if (b.hasAttribute('data-ok') && lista.length) {
      card.remove(); ARQ[s.key] = lista;
      const txt = lista.length === 1 ? '1 arquivo enviado' : lista.length + ' arquivos enviados';
      answer(s, txt, txt + ' 📎');
    }
  });
  block(card);
}

/* ============ REVISÃO ============ */
async function review() {
  await say(`Pronto, ${firstName(A.nome)}! 🙌 Confira suas respostas. Se algo estiver errado, toque em **corrigir**.`);
  const box = document.createElement('div'); box.className = 'review';
  let html = '', st = -1;
  STEPS.forEach((s, i) => {
    if (!s.key || s.nolabel || !visible(s) || A[s.key] === undefined) return;
    if (s.stage !== st) { st = s.stage; html += `<h3>${F.stages[st]}</h3>`; }
    html += `<div class="ri"><span>${esc(s.label)}</span><p>${esc(showVal(s, A[s.key]))}</p><button type="button" data-i="${i}">corrigir</button></div>`;
  });
  box.innerHTML = html;
  const fin = document.createElement('div'); fin.className = 'final';
  box.onclick = async e => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const s = STEPS[+b.dataset.i];
    box.remove(); $comp.innerHTML = ''; fin.remove();
    editing = true; me(`Corrigir: ${s.label}`);
    cur = +b.dataset.i; save(); run(s);
  };
  block(box);
  fin.innerHTML = `<button type="button" class="btn">✅ Está tudo certo, enviar</button><p class="small">${esc(F.privacidade)}</p>`;
  fin.querySelector('button').onclick = () => { fin.remove(); box.querySelectorAll('button').forEach(x => x.disabled = true); submit(); };
  block(fin);
}

/* ============ ENVIO ============ */
const respondidas = () => STEPS.filter(s => s.key && !s.nolabel && visible(s) && A[s.key] !== undefined);
const linhas = () => respondidas().map(s => [s.label, showVal(s, A[s.key])]);
function textoWhats() {
  let t = `*${F.documento} — ${A.nome_empresa || A.nome || ''}*\n`, st = -1;
  respondidas().forEach(s => {
    if (s.stage !== st) { st = s.stage; t += `\n*${F.stages[st].toUpperCase()}*\n`; }
    t += `${s.label}: ${showVal(s, A[s.key])}\n`;
  });
  return t;
}
function markdownPadrao() {
  const cell = v => String(v == null || v === '' ? '-' : v).replace(/\|/g, '/').replace(/\n/g, '<br>');
  let md = '', st = -1, primeira = true;
  respondidas().forEach(s => {
    if (s.stage !== st) { st = s.stage; md += `\n#### ${F.stages[st]}\n\n`; primeira = true; }
    md += `| ${s.label} | ${cell(showVal(s, A[s.key]))} |\n` + (primeira ? '| ---| --- |\n' : '');
    primeira = false;
  });
  return md.trim() + '\n';
}
async function submit() {
  me('Está tudo certo, enviar ✅');
  const arquivos = [];
  Object.entries(ARQ).forEach(([k, l]) => l.forEach((f, i) => arquivos.push({ grupo: k, nome: `${k}-${String(i + 1).padStart(2, '0')}-${f.nome}`, mime: f.mime, dados: f.dados.split(',')[1] })));
  const payload = { tipo: F.tipo, documento: F.documento, enviadoEm: new Date().toISOString(), empresa: A.nome_empresa || A.nome, nome: A.nome, cidade: A.cidade, whatsapp: A.whats,
    respostas: Object.fromEntries(Object.entries(A).filter(([k]) => !k.startsWith('_') || k === '_cnpj')), linhas: linhas(),
    markdown: F.markdown ? F.markdown() : markdownPadrao(), arquivos };
  let ok = false;
  if (CONFIG.ENDPOINT) {
    await say({ hint: arquivos.length ? `Enviando suas respostas e ${arquivos.length} arquivo(s)... pode levar alguns segundos.` : 'Enviando suas respostas...' });
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), arquivos.length ? 120000 : 25000);
    try {
      const r = await fetch(CONFIG.ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), signal: ctl.signal });
      const j = await r.json(); ok = !!(j && j.ok);
    } catch (e) { ok = false; } finally { clearTimeout(t); }
  }
  setStage(etapas());
  document.getElementById('stage').textContent = 'Concluído';
  const fin = document.createElement('div'); fin.className = 'final';
  const wa = t => `https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent(t)}`;
  const emp = A.nome_empresa || 'minha empresa';
  if (ok) {
    wipe();
    await say(`Obrigado por preencher, ${firstName(A.nome)}! 🎉`);
    for (const l of F.fim(A)) await say(l);
    const faltamFotos = !ARQ.fotos;
    if (faltamFotos) await say('Quando puder, me mande no WhatsApp as **fotos** (e o logotipo, se não enviou aqui). 📸');
    fin.innerHTML = `<a class="btn wa" target="_blank" rel="noopener" href="${wa(`Oi, Eduardo! Acabei de preencher o formulário (${F.documento}) da ${emp}.` + (faltamFotos ? ' Vou te mandar as fotos aqui.' : ''))}">${faltamFotos ? 'Mandar fotos no WhatsApp' : 'Falar com o Eduardo no WhatsApp'}</a>`;
  } else {
    await say(`Obrigado, ${firstName(A.nome)}! 🎉 Falta só um toque:`);
    await say('Toque no botão abaixo para me enviar as respostas pelo **WhatsApp**. A mensagem já vai pronta, é só enviar. 👇');
    fin.innerHTML = `<a class="btn wa" target="_blank" rel="noopener" href="${wa(textoWhats())}">Enviar respostas no WhatsApp</a><p class="small">As fotos e o logotipo não vão junto: me mande por lá também. 📸</p>`;
    fin.querySelector('a').addEventListener('click', () => setTimeout(wipe, 500));
  }
  block(fin);
}

/* ============ INÍCIO ============ */
function iniciar(form) {
  F = form;
  STEPS = form.steps;
  STEPS.forEach(s => { s.key = (s.msg || s.nokey || s.review) ? null : s.id; });
  document.querySelector('.bars').innerHTML = '<i></i>'.repeat(etapas());
  document.querySelector('.bars').style.gridTemplateColumns = `repeat(${etapas()},1fr)`;
  const help = document.getElementById('ajuda');
  if (help) help.href = `https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent(`Oi, Eduardo! Estou preenchendo o formulário (${form.documento}) e fiquei com uma dúvida.`)}`;
  (async () => {
    const saved = load();
    if (saved && saved.A && saved.cur > 0 && saved.A.nome && STEPS[saved.cur]) {
      A = saved.A;
      setStage(STEPS[saved.cur].stage);
      await say(`Que bom te ver de novo, ${firstName(A.nome)}! 👋 Você já tinha começado a preencher.`);
      const box = document.createElement('div'); box.className = 'choices';
      ['Continuar de onde parei', 'Começar do zero'].forEach(o => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = o;
        b.onclick = () => { box.remove(); me(o);
          if (o === 'Começar do zero') { A = {}; wipe(); $chat.innerHTML = ''; lastSide = null; return go(-1); }
          cur = saved.cur; const s = STEPS[cur]; if (s.key && A[s.key] !== undefined && !s.review) go(cur); else run(s); };
        box.appendChild(b);
      });
      block(box); return;
    }
    go(-1);
  })();
}
