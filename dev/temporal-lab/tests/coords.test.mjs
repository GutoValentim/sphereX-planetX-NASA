import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseRa, parseDec, formatRaHms, formatDecDms } = require('../public/coords.js');

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test('RA aceita graus decimais e horas sexagesimais', () => {
  close(parseRa('133.795129167').degrees, 133.795129167);
  close(parseRa('133,795').degrees, 133.795);
  close(parseRa('08h55m10.831s').degrees, 133.795129167);
  close(parseRa('08 55 10.831').degrees, 133.795129167);
  close(parseRa('08:55:10.831').degrees, 133.795129167);
  close(parseRa('5h35m17.3s').degrees, 83.82208333);
  close(parseRa('8.919h').degrees, 133.785);
  close(parseRa('133d47m42.5s').degrees, 133.795138889);
  assert.equal(parseRa('08 55 10.8').format, 'horas');
});

test('Dec aceita graus decimais e sexagesimal com sinais variados', () => {
  close(parseDec('-7.245147222').degrees, -7.245147222);
  close(parseDec('−07°14′42.53″').degrees, -7.245147222);
  close(parseDec('-07 14 42.53').degrees, -7.245147222);
  close(parseDec('-07:14:42.53').degrees, -7.245147222);
  close(parseDec('+41d16m09s').degrees, 41.269166667);
  close(parseDec("-05°23'28\"").degrees, -5.391111111);
  close(parseDec('-0 30 00').degrees, -0.5);
});

test('rejeita valores fora do intervalo ou malformados', () => {
  assert.throws(() => parseRa('24h00m00s'));
  assert.throws(() => parseRa('360'));
  assert.throws(() => parseRa('-10'));
  assert.throws(() => parseRa('08h75m00s'));
  assert.throws(() => parseRa('abc'));
  assert.throws(() => parseDec('91'));
  assert.throws(() => parseDec('-90 30 00'));
  assert.throws(() => parseDec(''));
});

test('formata RA em horas e Dec em graus', () => {
  assert.equal(formatRaHms(133.795129167), '08h55m10.83s');
  assert.equal(formatDecDms(-7.245147222), '−07°14′42.5″');
  assert.equal(formatDecDms(41.269166667), '+41°16′09.0″');
  assert.equal(formatRaHms(359.9999999), '00h00m00.00s');
});
