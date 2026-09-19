// 從官方「校園樹木資訊平臺」抓某所學校的樹點,存成 data/nkhs-trees.json 快照。
// 用法: node scripts/fetch-official-trees.mjs
// 官方 API 沒有開放 CORS,網站不能即時呼叫,所以在電腦上執行一次、把結果放進 repo。
import { mkdir, writeFile } from 'node:fs/promises';
import { normalizeTrees } from '../src/treeData.js';

const API = 'https://edutreemap.moe.edu.tw/trees_API/api/';
const CITY_ID = '1'; // 臺北市
const SCHOOL_ID = '393401'; // 市立南港高工
const OUT = new URL('../data/nkhs-trees.json', import.meta.url);

async function getJson(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path} 回應 ${res.status}`);
  const body = await res.json();
  if (!body.isSuccess) throw new Error(`${path} 失敗: ${body.message}`);
  return body.data;
}

const search = await getJson(`Map/GetMapSearch?city=${CITY_ID}&town=&school=${SCHOOL_ID}`);
const expected = search.treeCount;
const { xmin, xmax, ymin, ymax } = search.treeBound;

// treeBound 只是校園中心的小框,往外擴一圈確保整個校園都在範圍內;其他學校的點靠 s 欄位過濾掉。
const PAD = 0.005;
const box = await getJson(
  `Map/GetPointGroup?n=${ymax + PAD}&w=${xmin - PAD}&s=${ymin - PAD}&e=${xmax + PAD}`,
);
const book = await getJson('Book/GetBookIndex');

const trees = normalizeTrees({ points: box.treeList, speciesBook: book.treeList, schoolId: SCHOOL_ID });

if (trees.length !== expected) {
  throw new Error(`官方統計 ${expected} 棵,但只取得 ${trees.length} 棵,請加大 PAD 後重試`);
}

const snapshot = {
  meta: {
    school: search.searchPara.school,
    schoolId: SCHOOL_ID,
    source: 'https://edutreemap.moe.edu.tw/trees/#/Map',
    fetchedAt: new Date().toISOString(),
    count: trees.length,
  },
  trees,
};

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(snapshot));
console.log(`已寫入 ${trees.length} 棵 → data/nkhs-trees.json`);
