// Search/filter/sort helpers: ordering per type, conditions typed by people, value lists.
import test from 'node:test'
import assert from 'node:assert/strict'
import { PDate, PDec, PTime, formatDate } from '../../src/core/index.js'
import { daysFromCivil, distinctValues, keyLabel, keyOf, makeCondition, sortIndices } from '../../src/query/engine.js'

const idx = n => Uint32Array.from({ length: n }, (_, i) => i)
const INT = { kind: 'leaf', cat: 'int', label: 'int32' }
const STR = { kind: 'leaf', cat: 'string', label: 'string' }
const DEC = { kind: 'leaf', cat: 'decimal', scale: 2, label: 'decimal(10,2)' }
const TS = { kind: 'leaf', cat: 'timestamp', unit: 'us', utc: true, label: 'timestamp' }
const DATE = { kind: 'leaf', cat: 'date', label: 'date' }
const BIG = { kind: 'leaf', cat: 'bigint', label: 'int64' }
const run = (cond, d, vals) => {
  const c = makeCondition(cond, d)
  return c.error ?? vals.map(x => c.test(x))
}

test('números: crescente com NaN depois, null por último, empates na ordem do arquivo', () => {
  const v = [5, null, -3, 5, 10, NaN]
  assert.deepEqual([...sortIndices(idx(6), v, INT, 1)], [2, 0, 3, 4, 5, 1])
  assert.deepEqual([...sortIndices(idx(6), v, INT, -1)], [5, 4, 0, 3, 2, 1])
})

test('texto A→Z ignora acentos e maiúsculas', () => {
  const v = ['banana', 'Água', 'abacaxi', null, 'água', 'Zebra']
  assert.deepEqual([...sortIndices(idx(6), v, STR, 1)], [2, 1, 4, 0, 5, 3])
})

test('decimais e int64 acima de 2^53 em ordem exata', () => {
  assert.deepEqual([...sortIndices(idx(4), [new PDec('10.50'), new PDec('-2.00'), new PDec('9.99'), null], DEC, 1)], [1, 2, 0, 3])
  assert.deepEqual([...sortIndices(idx(3), [9007199254740993n, 9007199254740992n, -1n], BIG, 1)], [2, 1, 0])
})

test('datas e horários digitados (ISO e brasileiro) viram intervalos', () => {
  const day = daysFromCivil(2026, 8, 1)
  assert.equal(formatDate(day), '2026-08-01')
  const t = s => new PTime(BigInt(day) * 86400000000000n + BigInt(s) * 1000000000n, 'us')
  const v = [t(0), t(10 * 3600 + 1800), t(86400 + 5), null]
  assert.deepEqual(run({ op: 'eq', a: '01/08/2026' }, TS, v), [true, true, false, false])
  assert.deepEqual(run({ op: 'gt', a: '2026-08-01' }, TS, v), [false, false, true, false])
  assert.deepEqual(run({ op: 'lt', a: '2026-08-01 10:30' }, TS, v), [true, false, false, false])
  assert.deepEqual(run({ op: 'between', a: '2026-08-01 10:00', b: '01/08/2026 11:00' }, TS, v), [false, true, false, false])
  assert.deepEqual(run({ op: 'ne', a: '2026-08-01' }, TS, v), [false, false, true, true])
  assert.match(run({ op: 'eq', a: '31/02/2026' }, DATE, [new PDate(day)]), /Digite uma data/)
})

test('números digitados: 1.234,5, intervalos invertidos, int64 exato', () => {
  assert.deepEqual(run({ op: 'ge', a: '1.234,5' }, INT, [1234, 1235, null]), [false, true, false])
  assert.deepEqual(run({ op: 'between', a: '10', b: '5' }, DEC, [new PDec('7.00'), new PDec('10.00'), new PDec('10.01')]), [true, true, false])
  assert.deepEqual(run({ op: 'eq', a: '9007199254740993' }, BIG, [9007199254740993n, 9007199254740992n]), [true, false])
  assert.match(run({ op: 'gt', a: 'abc' }, INT, [1]), /Digite um número/)
})

test('texto: contém ignora acentos; "não contém" inclui vazias', () => {
  assert.deepEqual(run({ op: 'contains', a: 'sao' }, STR, ['SAO PAULO', 'São José', 'Osasco', null]), [true, true, false, false])
  assert.deepEqual(run({ op: 'ncontains', a: 'sao' }, STR, ['SAO PAULO', 'Rio', null]), [false, true, true])
})

test('lista de valores: ordem da coluna, contagens, vazias e "fora da lista" no fim', () => {
  const vals = ['b', 'a', null, 'b', undefined, 'a', 'a']
  const keys = vals.map(x => keyOf(x, STR))
  const got = distinctValues(idx(7), keys, vals, STR).map(e => [keyLabel(e.key), e.count])
  assert.deepEqual(got, [['a', 3], ['b', 2], ['(Vazias)', 1], ['(fora da lista)', 1]])
})
