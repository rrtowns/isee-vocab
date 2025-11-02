import type { FlashcardContent } from "@/services/openai";
import JSZip from "jszip";

const DEBUG_ANKI: boolean = (import.meta.env.VITE_DEBUG_ANKI as any) !== 'false';
function ankiLog(...args: any[]) { if (DEBUG_ANKI) console.log('[anki]', ...args); }

// Replace tabs/newlines so TSV stays well‑formed and Anki renders HTML
function sanitize(text: string): string {
  return (text || "").replace(/\t/g, " ").replace(/\r?\n/g, "<br/>");
}

/**
 * Build a simple TSV suitable for Anki import.
 * Column 1: Front (word)
 * Column 2: Back (HTML with definition, examples, synonyms, optional image)
 */
export function buildAnkiTSV(cards: FlashcardContent[]): string {
  return cards
    .map((card) => {
      const front = sanitize(card.word);

      const parts: string[] = [];
      if (card.definition) {
        parts.push(`<p><b>Definition:</b> ${sanitize(card.definition)}</p>`);
      }
      if (card.examples && card.examples.length) {
        parts.push(
          `<div><b>Examples:</b><ul>` +
            card.examples.map((e) => `<li>${sanitize(e)}</li>`).join("") +
          `</ul></div>`
        );
      }
      if (card.synonyms && card.synonyms.length) {
        parts.push(`<p><b>Synonyms:</b> ${sanitize(card.synonyms.join(", "))}</p>`);
      }
      if (card.difficulty) {
        parts.push(`<p><b>Difficulty:</b> ${sanitize(card.difficulty)}</p>`);
      }
      if (card.imageUrl) {
        parts.push(`<div><img src="${card.imageUrl}" alt="${sanitize(card.word)} illustration"/></div>`);
      }

      const back = parts.join("");
      return `${front}\t${back}`;
    })
    .join("\n");
}

/**
 * Trigger a download of the provided text as a file in the browser.
 */
export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// --- Zip-based export with media ---

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "item";
}

function dataUrlToBlob(url: string): { blob: Blob; ext: string } | null {
  try {
    const m = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/i);
    if (!m) return null;
    const mime = m[1] || 'application/octet-stream';
    const isB64 = !!m[2];
    const data = m[3];
    const byteString = isB64 ? atob(data) : decodeURIComponent(data);
    const ia = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ia], { type: mime });
    let ext = 'bin';
    if (mime.includes('png')) ext = 'png';
    else if (mime.includes('jpeg')) ext = 'jpg';
    else if (mime.includes('jpg')) ext = 'jpg';
    else if (mime.includes('webp')) ext = 'webp';
    else if (mime.includes('gif')) ext = 'gif';
    else if (mime.includes('mp3') || mime.includes('mpeg')) ext = 'mp3';
    else if (mime.includes('wav')) ext = 'wav';
    else if (mime.includes('ogg')) ext = 'ogg';
    return { blob, ext };
  } catch {
    return null;
  }
}

async function fetchBlob(url: string): Promise<{ blob: Blob; ext: string }> {
  // Handle data URLs directly to avoid fetch quirks
  if (url.startsWith('data:')) {
    const r = dataUrlToBlob(url);
    if (!r) throw new Error('bad data url');
    return r;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status}`);
  const blob = await res.blob();
  // Guess extension from content-type or url
  let ext = "bin";
  const t = (blob.type || "").toLowerCase();
  if (t.includes("png")) ext = "png";
  else if (t.includes("jpeg")) ext = "jpg";
  else if (t.includes("jpg")) ext = "jpg";
  else if (t.includes("webp")) ext = "webp";
  else if (t.includes("gif")) ext = "gif";
  else if (t.includes("mp3")) ext = "mp3";
  else if (t.includes("mpeg")) ext = "mp3";
  else if (t.includes("wav")) ext = "wav";
  else if (t.includes("ogg")) ext = "ogg";
  else {
    const m = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
    if (m) ext = m[1].toLowerCase();
  }
  return { blob, ext };
}

/**
 * Build TSV rows and collect media blobs for zipping.
 */
type CardDetail = {
  front: string;
  back: string;
  imgName?: string;
  audioName?: string;
};

async function buildRowsAndMedia(cards: FlashcardContent[]) {
  const rows: string[] = [];
  const media: { name: string; blob: Blob }[] = [];
  const details: CardDetail[] = [];
  let idx = 1;
  for (const c of cards) {
    const base = slugify(c.word);
    let imgName = "";
    let audioName = "";

    if (c.imageUrl) {
      try {
        const { blob, ext } = await fetchBlob(c.imageUrl);
        imgName = `${base}.${ext}`;
        media.push({ name: imgName, blob });
      } catch {
        // ignore; leave imgName empty
      }
    }

    if (c.audioUrl) {
      try {
        const { blob, ext } = await fetchBlob(c.audioUrl);
        audioName = `${slugify(c.word)}.${ext}`;
        media.push({ name: audioName, blob });
      } catch {
        // ignore
      }
    }

    const wordRaw = (c.word || "").replace(/\t|\r?\n/g, " ");
    const word = wordRaw.charAt(0).toUpperCase() + wordRaw.slice(1);
    const front = audioName ? `${word} [sound:${audioName}]` : word;
    const parts: string[] = [];
    if (imgName) parts.push(`<div><img src="${imgName}" /></div>`);
    if (c.definition) parts.push(`<p>${sanitize(c.definition)}</p>`);
    if (c.examples?.length) {
      parts.push(
        `<div><b>Examples:</b><ul>` +
          c.examples.map((e) => `<li>${sanitize(e)}</li>`).join("") +
        `</ul></div>`
      );
    }
    if (c.synonyms?.length) parts.push(`<p><b>Synonyms:</b> ${sanitize(c.synonyms.join(", "))}</p>`);
    const back = parts.join("").replace(/\t/g, " ").replace(/\r?\n/g, "<br/>");
    rows.push(`${front}\t${back}`);
    details.push({ front, back, imgName: imgName || undefined, audioName: audioName || undefined });
    idx++;
  }
  return { rows, media, details };
}

/**
 * Export a single .zip containing deck.tsv and all media files.
 * In Anki Desktop: extract zip, then File → Import → select deck.tsv.
 */
export async function exportAnkiZip(cards: FlashcardContent[], opts?: { deckName?: string }) {
  ankiLog('exportAnkiZip start', { cards: cards.length });
  const { rows, media } = await buildRowsAndMedia(cards);
  const zip = new JSZip();
  zip.file("deck.tsv", rows.join("\n"));
  for (const f of media) zip.file(f.name, f.blob);
  ankiLog('packaging zip', { rows: rows.length, media: media.length });
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `${opts?.deckName || "isee-vocab"}-${stamp}.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, 0);
}

type JSZipInstance = InstanceType<typeof JSZip>;

let sqlInstance: Promise<any> | null = null;
let sqlScriptPromise: Promise<void> | null = null;

async function ensureSqlScript() {
  if ((globalThis as any).initSqlJs) {
    ankiLog('sql.js global already available');
    return;
  }
  if (!sqlScriptPromise) {
    sqlScriptPromise = (async () => {
      ankiLog('injecting sql.js script from raw source');
      const mod: any = await import('sql.js/dist/sql-wasm.js?raw');
      const source = mod?.default ?? mod;
      if (typeof source !== 'string') {
        throw new Error('Failed to load sql.js source as string');
      }
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.text = source;
      document.head.appendChild(script);
      ankiLog('sql.js script injected');
    })();
  }
  await sqlScriptPromise;
}

async function loadSql() {
  if (!sqlInstance) {
    ankiLog('loading sql.js');
    sqlInstance = (async () => {
      try {
        const mod: any = await import('sql.js/dist/sql-wasm.js?module');
        ankiLog('sql.js module loaded', { keys: Object.keys(mod || {}), defaultType: typeof mod?.default });
        const initSqlJs = mod?.default;
        if (typeof initSqlJs !== 'function') {
          throw new Error(`sql.js/dist/sql-wasm.js?module did not export init function. keys=${Object.keys(mod || {})}`);
        }
        const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
        ankiLog('sql.js ready (module import)', { hasDB: typeof SQL?.Database === 'function' });
        return SQL;
      } catch (err) {
        console.warn('[anki] sql.js module import failed, falling back to injected script', err);
        await ensureSqlScript();
        const initSqlJs = (globalThis as any).initSqlJs;
        if (typeof initSqlJs !== 'function') {
          throw new Error('window.initSqlJs not available after script injection');
        }
        const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
        ankiLog('sql.js ready (script fallback)', { hasDB: typeof SQL?.Database === 'function' });
        return SQL;
      }
    })();
  }
  return sqlInstance;
}

function sha1Hex(message: string): string {
  const encoder = new TextEncoder();
  const msg = encoder.encode(message);
  const msgLength = msg.length;
  const words: number[] = [];
  for (let i = 0; i < msgLength; i++) {
    const wordIndex = (i >>> 2);
    words[wordIndex] = (words[wordIndex] || 0) | (msg[i] << (24 - (i % 4) * 8));
  }
  const wordIndex = (msgLength >>> 2);
  words[wordIndex] = (words[wordIndex] || 0) | (0x80 << (24 - (msgLength % 4) * 8));
  words[((msgLength + 8) >>> 6 << 4) + 15] = msgLength * 8;

  let h0 = 0x67452301;
  let h1 = 0xEFCDAB89;
  let h2 = 0x98BADCFE;
  let h3 = 0x10325476;
  let h4 = 0xC3D2E1F0;

  const w = new Array<number>(80);

  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[i + t] | 0;
    for (let t = 16; t < 80; t++) {
      const val = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w[t] = ((val << 1) | (val >>> 31)) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let t = 0; t < 80; t++) {
      let f: number;
      let k: number;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5A827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ED9EBA1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8F1BBCDC;
      } else {
        f = b ^ c ^ d;
        k = 0xCA62C1D6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const hex = [h0, h1, h2, h3, h4]
    .map((n) => ('00000000' + n.toString(16)).slice(-8))
    .join('');
  return hex;
}

function checksum(str: string): number {
  return parseInt(sha1Hex(str).substring(0, 8), 16);
}

function getLastItem<T extends Record<string, any>>(obj: T): any {
  const keys = Object.keys(obj);
  const lastKey = keys[keys.length - 1];
  const item = obj[lastKey];
  delete obj[lastKey];
  return item;
}

function createTemplate(options?: { questionFormat?: string; answerFormat?: string; css?: string }): string {
  const {
    questionFormat = '{{Front}}',
    answerFormat = '{{FrontSide}}\n\n<hr id="answer">\n\n{{Back}}',
    css = '.card {\n font-family: arial;\n font-size: 20px;\n text-align: center;\n color: black;\nbackground-color: white;\n}\n',
  } = options || {};

  const conf = {
    nextPos: 1,
    estTimes: true,
    activeDecks: [1],
    sortType: 'noteFld',
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    curDeck: 1,
    newBury: true,
    newSpread: 0,
    dueCounts: true,
    curModel: '1435645724216',
    collapseTime: 1200,
  };

  const models: any = {
    1388596687391: {
      veArs: [],
      name: 'Basic-f15d2',
      tags: ['Tag'],
      did: 1435588830424,
      usn: -1,
      req: [[0, 'all', [0]]],
      flds: [
        { name: 'Front', media: [], sticky: false, rtl: false, ord: 0, font: 'Arial', size: 20 },
        { name: 'Back', media: [], sticky: false, rtl: false, ord: 1, font: 'Arial', size: 20 },
      ],
      sortf: 0,
      latexPre:
        '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
      tmpls: [
        {
          name: 'Card 1',
          qfmt: questionFormat,
          did: null,
          bafmt: '',
          afmt: answerFormat,
          ord: 0,
          bqfmt: '',
        },
      ],
      latexPost: '\\end{document}',
      type: 0,
      id: 1388596687391,
      css,
      mod: 1435645658,
    },
  };

  const decks: any = {
    1: {
      desc: '',
      name: 'Default',
      extendRev: 50,
      usn: 0,
      collapsed: false,
      newToday: [0, 0],
      timeToday: [0, 0],
      dyn: 0,
      extendNew: 10,
      conf: 1,
      revToday: [0, 0],
      lrnToday: [0, 0],
      id: 1,
      mod: 1435645724,
    },
    1435588830424: {
      desc: '',
      name: 'Template',
      extendRev: 50,
      usn: -1,
      collapsed: false,
      newToday: [545, 0],
      timeToday: [545, 0],
      dyn: 0,
      extendNew: 10,
      conf: 1,
      revToday: [545, 0],
      lrnToday: [545, 0],
      id: 1435588830424,
      mod: 1435588830,
    },
  };

  const dconf = {
    1: {
      name: 'Default',
      replayq: true,
      lapse: { leechFails: 8, minInt: 1, delays: [10], leechAction: 0, mult: 0 },
      rev: { perDay: 100, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, ease4: 1.3, bury: true, minSpace: 1 },
      timer: 0,
      maxTaken: 60,
      usn: 0,
      new: { perDay: 20, delays: [1, 10], separate: true, ints: [1, 4, 7], initialFactor: 2500, bury: true, order: 1 },
      mod: 0,
      id: 1,
      autoplay: true,
    },
  };

  return `
    PRAGMA foreign_keys=OFF;
    BEGIN TRANSACTION;
    CREATE TABLE col (
        id              integer primary key,
        crt             integer not null,
        mod             integer not null,
        scm             integer not null,
        ver             integer not null,
        dty             integer not null,
        usn             integer not null,
        ls              integer not null,
        conf            text not null,
        models          text not null,
        decks           text not null,
        dconf           text not null,
        tags            text not null
    );
    INSERT INTO "col" VALUES(
      1,
      1388548800,
      1435645724219,
      1435645724215,
      11,
      0,
      0,
      0,
      '${JSON.stringify(conf)}',
      '${JSON.stringify(models)}',
      '${JSON.stringify(decks)}',
      '${JSON.stringify(dconf)}',
      '{}'
    );
    CREATE TABLE notes (
        id              integer primary key,
        guid            text not null,
        mid             integer not null,
        mod             integer not null,
        usn             integer not null,
        tags            text not null,
        flds            text not null,
        sfld            integer not null,
        csum            integer not null,
        flags           integer not null,
        data            text not null
    );
    CREATE TABLE cards (
        id              integer primary key,
        nid             integer not null,
        did             integer not null,
        ord             integer not null,
        mod             integer not null,
        usn             integer not null,
        type            integer not null,
        queue           integer not null,
        due             integer not null,
        ivl             integer not null,
        factor          integer not null,
        reps            integer not null,
        lapses          integer not null,
        left            integer not null,
        odue            integer not null,
        odid            integer not null,
        flags           integer not null,
        data            text not null
    );
    CREATE TABLE revlog (
        id              integer primary key,
        cid             integer not null,
        usn             integer not null,
        ease            integer not null,
        ivl             integer not null,
        lastIvl         integer not null,
        factor          integer not null,
        time            integer not null,
        type            integer not null
    );
    CREATE TABLE graves (
        usn             integer not null,
        oid             integer not null,
        type            integer not null
    );
    ANALYZE sqlite_master;
    INSERT INTO "sqlite_stat1" VALUES('col',NULL,'1');
    CREATE INDEX ix_notes_usn on notes (usn);
    CREATE INDEX ix_cards_usn on cards (usn);
    CREATE INDEX ix_revlog_usn on revlog (usn);
    CREATE INDEX ix_cards_nid on cards (nid);
    CREATE INDEX ix_cards_sched on cards (did, queue, due);
    CREATE INDEX ix_revlog_cid on revlog (cid);
    CREATE INDEX ix_notes_csum on notes (csum);
    COMMIT;
  `;
}

class BrowserApkgExporter {
  private db: any;
  private zip: JSZipInstance;
  private media: { filename: string; data: Uint8Array }[] = [];
  private topDeckId: number;
  private topModelId: number;
  private separator = '\u001F';
  private deckName: string;

  constructor(deckName: string, options: { template: string; sql: any }) {
    this.deckName = deckName;
    this.db = new options.sql.Database();
    this.db.run(options.template);

    const now = Date.now();
    this.topDeckId = this._getId('cards', 'did', now);
    this.topModelId = this._getId('notes', 'mid', now);
    this.zip = new JSZip();

    const decks = this._getInitialRowValue('col', 'decks');
    const deck = getLastItem(decks);
    deck.name = this.deckName;
    deck.id = this.topDeckId;
    decks[this.topDeckId + ''] = deck;
    this._update('update col set decks=:decks where id=1', { ':decks': JSON.stringify(decks) });

    const models = this._getInitialRowValue('col', 'models');
    const model = getLastItem(models);
    model.name = this.deckName;
    model.did = this.topDeckId;
    model.id = this.topModelId;
    models[`${this.topModelId}`] = model;
    this._update('update col set models=:models where id=1', { ':models': JSON.stringify(models) });
  }

  addMedia(filename: string, data: Uint8Array) {
    this.media.push({ filename, data });
  }

  addCard(front: string, back: string, tags?: string | string[]) {
    const now = Date.now();
    const noteGuid = this._getNoteGuid(this.topDeckId, front, back);
    const noteId = this._getNoteId(noteGuid, now);

    let strTags = '';
    if (typeof tags === 'string') strTags = tags;
    else if (Array.isArray(tags)) strTags = this._tagsToStr(tags);

    this._update('insert or replace into notes values(:id,:guid,:mid,:mod,:usn,:tags,:flds,:sfld,:csum,:flags,:data)', {
      ':id': noteId,
      ':guid': noteGuid,
      ':mid': this.topModelId,
      ':mod': this._getId('notes', 'mod', now),
      ':usn': -1,
      ':tags': strTags,
      ':flds': front + this.separator + back,
      ':sfld': front,
      ':csum': checksum(front + this.separator + back),
      ':flags': 0,
      ':data': '',
    });

    this._update(
      'insert or replace into cards values(:id,:nid,:did,:ord,:mod,:usn,:type,:queue,:due,:ivl,:factor,:reps,:lapses,:left,:odue,:odid,:flags,:data)',
      {
        ':id': this._getCardId(noteId, now),
        ':nid': noteId,
        ':did': this.topDeckId,
        ':ord': 0,
        ':mod': this._getId('cards', 'mod', now),
        ':usn': -1,
        ':type': 0,
        ':queue': 0,
        ':due': 179,
        ':ivl': 0,
        ':factor': 0,
        ':reps': 0,
        ':lapses': 0,
        ':left': 0,
        ':odue': 0,
        ':odid': 0,
        ':flags': 0,
        ':data': '',
      },
    );
  }

  async save(): Promise<Blob> {
    const binaryArray: Uint8Array = this.db.export();
    const mediaObj = this.media.reduce<Record<number, string>>((prev, curr, idx) => {
      prev[idx] = curr.filename;
      return prev;
    }, {});

    this.zip.file('collection.anki2', binaryArray);
    this.zip.file('media', JSON.stringify(mediaObj));
    this.media.forEach((item, i) => this.zip.file(String(i), item.data));
    return this.zip.generateAsync({ type: 'blob' });
  }

  private _update(query: string, obj: Record<string, any>) {
    this.db.prepare(query).getAsObject(obj);
  }

  private _getInitialRowValue(table: string, column = 'id') {
    const query = `select ${column} from ${table}`;
    return JSON.parse(this.db.exec(query)[0].values[0]);
  }

  private _tagsToStr(tags: string[] = []) {
    return ' ' + tags.map((tag) => tag.replace(/ /g, '_')).join(' ') + ' ';
  }

  private _getId(table: string, col: string, ts: number) {
    const query = `SELECT ${col} from ${table} WHERE ${col} >= :ts ORDER BY ${col} DESC LIMIT 1`;
    const rowObj = this.db.prepare(query).getAsObject({ ':ts': ts });
    return rowObj[col] ? +rowObj[col] + 1 : ts;
  }

  private _getNoteId(guid: string, ts: number) {
    const query = `SELECT id from notes WHERE guid = :guid ORDER BY id DESC LIMIT 1`;
    const rowObj = this.db.prepare(query).getAsObject({ ':guid': guid });
    return rowObj.id || this._getId('notes', 'id', ts);
  }

  private _getCardId(noteId: number, ts: number) {
    const query = `SELECT id from cards WHERE nid = :note_id ORDER BY id DESC LIMIT 1`;
    const rowObj = this.db.prepare(query).getAsObject({ ':note_id': noteId });
    return rowObj.id || this._getId('cards', 'id', ts);
  }

  private _getNoteGuid(topDeckId: number, front: string, back: string) {
    return sha1Hex(`${topDeckId}${front}${back}`);
  }
}

export async function exportAnkiApkg(cards: FlashcardContent[], opts?: { deckName?: string }) {
  try {
    ankiLog('exportAnkiApkg start', { cards: cards.length });
    const { details, media } = await buildRowsAndMedia(cards);
    const SQL = await loadSql();
    const exporter = new BrowserApkgExporter(opts?.deckName || 'isee-vocab', {
      template: createTemplate(),
      sql: SQL,
    });

    details.forEach((detail) => exporter.addCard(detail.front, detail.back));
    for (const item of media) {
      const buffer = new Uint8Array(await item.blob.arrayBuffer());
      exporter.addMedia(item.name, buffer);
    }

    ankiLog('saving apkg');
    const blob = await exporter.save();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(opts?.deckName || 'isee-vocab')}.apkg`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, 0);
  } catch (e) {
    console.warn('[anki] .apkg export failed, falling back to TSV zip', e);
    await exportAnkiZip(cards, opts);
  }
}
