// tests/appShell.test.js
import { describe, it, expect } from 'vitest';
import { STUDENT_TABS, TEACHER_TABS, tabsFor, parseHash, frameSrc, buildHash } from '../src/appShell.js';

describe('tabsFor', () => {
  it('老師五個分頁:名單/地圖/QR 標籤/核可/管理', () => {
    expect(TEACHER_TABS.map((t) => t.id)).toEqual(['roster', 'map', 'labels', 'approve', 'admin']);
    expect(TEACHER_TABS.find((t) => t.id === 'approve')).toEqual({ id: 'approve', label: '核可', page: 'approve.html' });
    expect(tabsFor('teacher')).toBe(TEACHER_TABS);
  });
  it('學生三個分頁:樹木/掃描/量測', () => {
    expect(STUDENT_TABS.map((t) => t.id)).toEqual(['trees', 'scan', 'measure']);
    expect(tabsFor('student')).toBe(STUDENT_TABS);
  });
  it('未知身分回空陣列', () => {
    expect(tabsFor('x')).toEqual([]);
    expect(tabsFor(null)).toEqual([]);
  });
});

describe('parseHash', () => {
  it('空字串或首頁 → 沒有身分', () => {
    expect(parseHash('')).toEqual({ role: null, tab: null, treeId: '' });
    expect(parseHash('#/')).toEqual({ role: null, tab: null, treeId: '' });
  });
  it('#/teacher/map', () => {
    expect(parseHash('#/teacher/map')).toEqual({ role: 'teacher', tab: 'map', treeId: '' });
  });
  it('只有身分 → 取該身分第一個分頁', () => {
    expect(parseHash('#/teacher')).toEqual({ role: 'teacher', tab: 'roster', treeId: '' });
    expect(parseHash('#/student')).toEqual({ role: 'student', tab: 'trees', treeId: '' });
  });
  it('學生量測帶樹號(含需解碼的字元)', () => {
    expect(parseHash('#/student/measure?treeId=A%2D023').treeId).toBe('A-023');
  });
  it('不認得的身分或分頁 → 視為首頁,不丟例外', () => {
    expect(parseHash('#/hacker/x')).toEqual({ role: null, tab: null, treeId: '' });
    expect(parseHash('#/teacher/nope').tab).toBe('roster');
  });
});

describe('frameSrc / buildHash', () => {
  it('學生樹木分頁對應 trees.html', () => {
    expect(frameSrc('student', 'trees')).toBe('./trees.html?embed=1');
  });
  it('學生掃描分頁對應 scan.html', () => {
    expect(frameSrc('student', 'scan')).toBe('./scan.html?embed=1');
  });
  it('老師分頁對應既有頁面並加 embed=1', () => {
    expect(frameSrc('teacher', 'roster')).toBe('./roster.html?embed=1');
    expect(frameSrc('teacher', 'map')).toBe('./map.html?embed=1');
    expect(frameSrc('teacher', 'labels')).toBe('./qrcodes.html?embed=1');
    expect(frameSrc('teacher', 'admin')).toBe('./admin.html?embed=1');
  });
  it('學生量測需要樹號,樹號要編碼', () => {
    expect(frameSrc('student', 'measure', {})).toBeNull();
    expect(frameSrc('student', 'measure', { treeId: 'A 023' })).toBe('./tree.html?embed=1&treeId=A%20023');
  });
  it('不存在的分頁回 null', () => {
    expect(frameSrc('teacher', 'nope')).toBeNull();
  });
  it('buildHash 與 parseHash 互逆', () => {
    expect(buildHash('teacher', 'map')).toBe('#/teacher/map');
    expect(parseHash(buildHash('student', 'measure', { treeId: '43667' }))).toEqual({ role: 'student', tab: 'measure', treeId: '43667' });
  });
});
