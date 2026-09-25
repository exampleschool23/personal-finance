import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleAssetDetailsRow } from '../lib/asset-details.ts';

class Card {
 constructor(top, open = false) {
  this.offsetTop = top;
  this.panel = { open, closest: () => this };
  this.classList = { contains: name => name === 'asset-card' };
 }
 querySelector() { return this.panel; }
}

test('asset details open and close the current row without affecting other rows', () => {
 const previous = globalThis.HTMLElement;
 globalThis.HTMLElement = Card;
 try {
  const cards = [new Card(0), new Card(0), new Card(0), new Card(400), new Card(400)];
  const grid = { children: cards, classList: { contains: name => name === 'asset-card-grid' } };
  cards.forEach(card => { card.parentElement = grid; });
  let prevented = 0;
  const tap = index => toggleAssetDetailsRow({ currentTarget: { closest: () => cards[index].panel }, preventDefault() { prevented++; } });
  tap(1);
  assert.deepEqual(cards.map(card => card.panel.open), [true, true, true, false, false]);
  tap(3);
  tap(2);
  assert.deepEqual(cards.map(card => card.panel.open), [false, false, false, true, true]);
  // Resizing/filtering changes row membership; the next activation uses the new layout.
  cards.forEach((card, index) => { card.offsetTop = index * 400; });
  tap(0);
  assert.deepEqual(cards.map(card => card.panel.open), [true, false, false, true, true]);
  // Partial rows and mixed open states collapse together from an open card.
  cards[4].offsetTop = cards[3].offsetTop;
  cards[4].panel.open = false;
  tap(3);
  assert.deepEqual(cards.map(card => card.panel.open), [true, false, false, false, false]);
  assert.equal(prevented, 5);
 } finally {
  if (previous === undefined) delete globalThis.HTMLElement;
  else globalThis.HTMLElement = previous;
 }
});

test('a summary outside an asset grid retains its native behavior', () => {
 let prevented = false;
 toggleAssetDetailsRow({ currentTarget: { closest: () => null }, preventDefault() { prevented = true; } });
 assert.equal(prevented, false);
});
