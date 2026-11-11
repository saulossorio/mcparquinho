"""Generates the Parquet files used by the tests (testdata/, not committed).

    python3 scripts/gen_testdata.py          small files (seconds)
    python3 scripts/gen_testdata.py --big    also the 3-million-row files (about 1 minute, 230 MB)

Every small file gets <name>.expected.json: canonical values read back with pyarrow,
which tests/unit/core.test.mjs compares with what the viewer reads.
"""
import datetime as dt
import decimal
import json
import os
import random
import struct
import sys
import uuid

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'testdata')
os.makedirs(OUT, exist_ok=True)
rng = random.Random(42)
D = decimal.Decimal
decimal.getcontext().prec = 100


def nul(vals, every=7, offset=0):
    return [None if (i + offset) % every == 0 else v for i, v in enumerate(vals)]


# ---------------------------------------------------------------- types table
def types_table(N=300):
    c = {}
    c['i8'] = pa.array(nul([(i * 37 % 256) - 128 for i in range(N)]), pa.int8())
    c['i16'] = pa.array(nul([(i * 1237 % 65536) - 32768 for i in range(N)], offset=1), pa.int16())
    c['i32'] = pa.array(nul([(i * 7919 * 1000003 % 2**32) - 2**31 for i in range(N)], offset=2), pa.int32())
    i64 = [(i * 104729 * 1000000007 % 2**64) - 2**63 for i in range(N)]
    i64[1], i64[2], i64[3], i64[4] = 2**63 - 1, -2**63, 0, 9007199254740993
    c['i64'] = pa.array(nul(i64, offset=3), pa.int64())
    c['u8'] = pa.array(nul([i % 256 for i in range(N)], offset=4), pa.uint8())
    c['u16'] = pa.array(nul([(i * 977) % 65536 for i in range(N)], offset=5), pa.uint16())
    u32 = [(i * 2654435761) % 2**32 for i in range(N)]
    u32[1] = 2**32 - 1
    c['u32'] = pa.array(nul(u32, offset=6), pa.uint32())
    u64 = [(i * 11400714819323198485) % 2**64 for i in range(N)]
    u64[1] = 2**64 - 1
    c['u64'] = pa.array(nul(u64), pa.uint64())
    f16 = np.array([((i * 0.37) % 50) - 25 for i in range(N)], dtype=np.float16)
    f16[1], f16[2], f16[3] = np.float16('inf'), np.float16('nan'), np.float16(65504)
    mask = np.array([(i + 1) % 7 == 0 for i in range(N)])
    c['f16'] = pa.array(f16, mask=mask, type=pa.float16())
    f32 = [((i * 1.7) % 1000) - 500 + 0.125 for i in range(N)]
    f32[1:7] = [float('nan'), float('inf'), float('-inf'), -0.0, 3.4e38, 1e-45]
    c['f32'] = pa.array(nul(f32, offset=2), pa.float32())
    f64 = [((i * 3.14159) % 1000) - 500 for i in range(N)]
    f64[1:9] = [float('nan'), float('inf'), float('-inf'), -0.0, 1e300, 5e-324, 0.1, 1 / 3]
    c['f64'] = pa.array(nul(f64, offset=3), pa.float64())
    c['b'] = pa.array(nul([i % 3 == 0 for i in range(N)], offset=4), pa.bool_())
    words = ['ação', 'São Paulo', 'emoji 😀🚀', '中文字符', 'עברית', 'linha\nquebrada', 'tab\tseparado',
             'aspas "duplas" e \'simples\'', '<b>html</b> & entidades', '', ' espaço ', 'x' * 300]
    c['s'] = pa.array(nul([words[i % len(words)] + f' #{i}' for i in range(N)], offset=5), pa.string())
    c['long_s'] = pa.array(nul([('lorem ipsum ' * (i % 500 + 1))[:5000] for i in range(N)], every=11), pa.string())
    bins = []
    for i in range(N):
        if i % 3 == 0:
            bins.append(f'texto-utf8-{i}'.encode())
        else:
            bins.append(bytes(rng.getrandbits(8) for _ in range(rng.randint(0, 40))) + b'\xff\xfe')
    c['bin'] = pa.array(nul(bins, offset=6), pa.binary())
    c['fsb'] = pa.array(nul([bytes(rng.getrandbits(8) for _ in range(16)) for _ in range(N)]), pa.binary(16))
    storage = pa.array([uuid.UUID(int=rng.getrandbits(128)).bytes for _ in range(N)], pa.binary(16))
    c['uuid'] = pa.ExtensionArray.from_storage(pa.uuid(), storage)
    dec9 = [D(rng.randint(-99999999, 99999999)) / 100 for _ in range(N)]
    dec9[1], dec9[2], dec9[3] = D('9999999.99'), D('-9999999.99'), D('0.00')
    c['dec9_2'] = pa.array(nul([d.quantize(D('0.01')) for d in dec9], offset=1), pa.decimal128(9, 2))
    dec18 = [(D(rng.randint(-10**17, 10**17)) / 10**4).quantize(D('0.0001')) for _ in range(N)]
    dec18[1] = D('99999999999999.9999')
    c['dec18_4'] = pa.array(nul(dec18, offset=2), pa.decimal128(18, 4))
    dec38 = [(D(rng.randint(-10**37, 10**37)) / 10**10).quantize(D('1E-10')) for _ in range(N)]
    dec38[1] = D('1234567890123456789012345678.1234567890')
    dec38[2] = D('-0.0000000001')
    c['dec38_10'] = pa.array(nul(dec38, offset=3), pa.decimal128(38, 10))
    dec50 = [(D(rng.randint(-10**49, 10**49)) / 10**5).quantize(D('1E-5')) for _ in range(N)]
    c['dec50_5'] = pa.array(nul(dec50, offset=4), pa.decimal256(50, 5))
    epoch = dt.date(1970, 1, 1)
    dates = [epoch + dt.timedelta(days=(i * 97) % 40000 - 10000) for i in range(N)]
    dates[1:7] = [dt.date(1900, 1, 1), dt.date(1969, 12, 31), dt.date(1970, 1, 1), dt.date(2024, 2, 29),
                  dt.date(9999, 12, 31), dt.date(1, 1, 1)]
    c['d32'] = pa.array(nul(dates, offset=5), pa.date32())
    c['d64'] = pa.array(nul(dates, offset=6), pa.date64())
    base = 1_700_000_000
    c['ts_s'] = pa.array(nul([base + i * 3601 for i in range(N)]), pa.timestamp('s'))
    c['ts_ms'] = pa.array(nul([(base + i * 3601) * 1000 + i for i in range(N)], offset=1), pa.timestamp('ms'))
    tus = [(base + i * 3601) * 10**6 + i * 1001 for i in range(N)]
    tus[1] = -62135596800 * 10**6                       # 0001-01-01
    tus[2] = -1                                         # 1969-12-31 23:59:59.999999
    tus[3] = 253402300799 * 10**6 + 999999              # 9999-12-31 23:59:59.999999
    c['ts_us'] = pa.array(nul(tus, offset=2), pa.timestamp('us'))
    tns = [(base + i * 3601) * 10**9 + i * 123457 for i in range(N)]
    tns[1], tns[2], tns[3] = -2**63 + 1, 2**63 - 1, 123456789
    c['ts_ns'] = pa.array(nul(tns, offset=3), pa.timestamp('ns'))
    c['ts_us_utc'] = pa.array(nul(tus, offset=4), pa.timestamp('us', tz='UTC'))
    c['ts_ms_sp'] = pa.array(nul([(base + i * 3601) * 1000 for i in range(N)], offset=5),
                             pa.timestamp('ms', tz='America/Sao_Paulo'))
    c['t32ms'] = pa.array(nul([(i * 1234567) % 86400000 for i in range(N)], offset=6), pa.time32('ms'))
    c['t64us'] = pa.array(nul([(i * 1234567891) % 86400000000 for i in range(N)]), pa.time64('us'))
    c['t64ns'] = pa.array(nul([(i * 1234567891234) % 86400000000000 for i in range(N)], offset=1), pa.time64('ns'))
    c['dur'] = pa.array(nul([i * 1000003 - 5000 for i in range(N)], offset=2), pa.duration('us'))

    def lst(i):
        if i % 9 == 0:
            return None
        if i % 9 == 1:
            return []
        return [None if (i + k) % 5 == 0 else (i * k) % 1000 - 500 for k in range(i % 6)]
    c['l_i32'] = pa.array([lst(i) for i in range(N)], pa.list_(pa.int32()))
    c['l_s'] = pa.array([None if i % 8 == 0 else [f'tag{k}' if k % 4 else None for k in range(i % 4)]
                         for i in range(N)], pa.list_(pa.string()))
    c['ll_i64'] = pa.array([None if i % 10 == 0 else [[i * k + j for j in range(k % 3)] if (k + i) % 4 else None
                                                      for k in range(i % 4)] for i in range(N)],
                           pa.list_(pa.list_(pa.int64())))
    c['lg_f64'] = pa.array([None if i % 11 == 0 else [i / 7, -i / 3][: i % 3] for i in range(N)],
                           pa.large_list(pa.float64()))
    st_type = pa.struct([('a', pa.int32()), ('b', pa.string()), ('c', pa.list_(pa.int32()))])
    c['st'] = pa.array([None if i % 6 == 0 else {'a': None if i % 4 == 0 else i, 'b': f'b{i}' if i % 5 else None,
                                                  'c': [i, i + 1] if i % 3 else None} for i in range(N)], st_type)
    c['mp_s_i'] = pa.array([None if i % 7 == 0 else [(f'k{k}', None if k == 2 else i * k) for k in range(i % 4)]
                            for i in range(N)], pa.map_(pa.string(), pa.int32()))
    c['mp_i_st'] = pa.array([None if i % 5 == 0 else [(k * 10 + 1, {'x': i / (k + 1)}) for k in range(i % 3)]
                             for i in range(N)], pa.map_(pa.int32(), pa.struct([('x', pa.float64())])))
    c['dict_s'] = pa.array(nul([['norte', 'sul', 'leste', 'oeste'][i % 4] for i in range(N)], offset=3)).dictionary_encode()
    c['null_col'] = pa.nulls(N)
    jstore = pa.array(nul([json.dumps({'id': i, 'ok': i % 2 == 0, 'v': [i, 'x']}) for i in range(N)], offset=4), pa.string())
    c['json'] = pa.ExtensionArray.from_storage(pa.json_(), jstore)
    c['all_null_s'] = pa.array([None] * N, pa.string())
    return pa.table(c)


# ------------------------------------------------------------- canonicalizer
def fbits(v):
    if v != v:
        return 'NaN'
    return str(struct.unpack('<Q', struct.pack('<d', float(v)))[0])


def canon_value(v, t):
    if v is None:
        return None
    if pa.types.is_dictionary(t):
        return canon_value(v, t.value_type)
    if isinstance(t, pa.BaseExtensionType):
        if str(t.extension_name) == 'arrow.uuid':
            return 'hex:' + (v.bytes.hex() if isinstance(v, uuid.UUID) else v.hex())
        return canon_value(v, t.storage_type)
    if pa.types.is_boolean(t):
        return bool(v)
    if pa.types.is_integer(t):
        return str(int(v))
    if pa.types.is_floating(t):
        return fbits(v)
    if pa.types.is_string(t) or pa.types.is_large_string(t):
        return v
    if pa.types.is_binary(t) or pa.types.is_large_binary(t) or pa.types.is_fixed_size_binary(t):
        return 'hex:' + v.hex()
    if pa.types.is_decimal(t):
        return format(v, 'f')
    if pa.types.is_map(t):
        pairs = [[canon_value(k, t.key_type), canon_value(x, t.item_type)] for k, x in v]
        return sorted(pairs, key=lambda p: json.dumps(p[0]))
    if pa.types.is_list(t) or pa.types.is_large_list(t):
        return [canon_value(x, t.value_type) for x in v]
    if pa.types.is_struct(t):
        return {f.name: canon_value(v.get(f.name), f.type) for f in t}
    raise TypeError(f'no canon for {t}')


def canon_column(arr):
    t = arr.type
    if pa.types.is_timestamp(t):
        mult = {'s': 10**9, 'ms': 10**6, 'us': 10**3, 'ns': 1}[t.unit]
        ints = arr.cast(pa.int64()).to_pylist()
        return [None if x is None else str(x * mult) for x in ints]
    if pa.types.is_date(t):
        ints = arr.cast(pa.date32()).cast(pa.int32()).to_pylist()
        return ints
    if pa.types.is_time(t):
        mult = {'s': 10**9, 'ms': 10**6, 'us': 10**3, 'ns': 1}[t.unit]
        width = pa.int32() if pa.types.is_time32(t) else pa.int64()
        ints = arr.cast(width).to_pylist()
        return [None if x is None else str(x * mult) for x in ints]
    if pa.types.is_duration(t):
        return [None if x is None else str(x) for x in arr.cast(pa.int64()).to_pylist()]
    if pa.types.is_null(t):
        return [None] * len(arr)
    return [canon_value(x, t) for x in arr.to_pylist()]


def expected(path, rows=None):
    tbl = pq.read_table(path)
    if rows:
        start, end = rows
        tbl = tbl.slice(start, end - start)
    out = {}
    for name in tbl.column_names:
        out[name] = canon_column(tbl.column(name).combine_chunks())
    return {'num_rows': tbl.num_rows, 'columns': out, 'types': {n: str(tbl.schema.field(n).type) for n in tbl.column_names}}


def write(name, table, expect=True, **kw):
    path = os.path.join(OUT, name)
    pq.write_table(table, path, **kw)
    if expect:
        with open(path + '.expected.json', 'w') as f:
            json.dump(expected(path), f)
    print(f'{name:28s} {os.path.getsize(path):>12,d} bytes  rg={pq.ParquetFile(path).num_row_groups}')
    return path


def small_files():
    t = types_table()
    write('types.parquet', t, row_group_size=100, compression='snappy')
    write('types_v2_zstd.parquet', t, row_group_size=128, compression='zstd', data_page_version='2.0')
    for codec in ['none', 'gzip', 'brotli', 'lz4']:
        write(f'comp_{codec}.parquet', t, row_group_size=150, compression=codec)
    simple = t.select(['i32', 'i64', 'f32', 'f64', 's', 'd32', 'ts_us', 'bin', 'b'])
    write('enc_delta.parquet', simple, use_dictionary=False, data_page_size=512, data_page_version='2.0',
          column_encoding={'i32': 'DELTA_BINARY_PACKED', 'i64': 'DELTA_BINARY_PACKED', 's': 'DELTA_BYTE_ARRAY',
                           'bin': 'DELTA_LENGTH_BYTE_ARRAY', 'f32': 'BYTE_STREAM_SPLIT', 'f64': 'BYTE_STREAM_SPLIT',
                           'd32': 'DELTA_BINARY_PACKED', 'ts_us': 'DELTA_BINARY_PACKED'})
    write('enc_plain_v1_pages.parquet', simple, use_dictionary=False, data_page_size=256, write_page_index=True,
          row_group_size=120)
    write('int96.parquet', t.select(['i32', 'ts_ms', 'ts_us', 'ts_us_utc']), use_deprecated_int96_timestamps=True)
    write('decint.parquet', t.select(['dec9_2', 'dec18_4', 'dec38_10']), store_decimal_as_integer=True)
    write('empty.parquet', t.slice(0, 0))
    # many row groups
    n = 20000
    mg = pa.table({'id': pa.array(range(n), pa.int64()), 'g': pa.array([i // 100 for i in range(n)], pa.int32()),
                   'txt': pa.array([f'linha {i}' for i in range(n)])})
    write('manyrg.parquet', mg, row_group_size=100)
    # wide
    cols = {}
    for k in range(1200):
        cols[f'c{k:04d}'] = pa.array([i * k for i in range(200)], pa.int32()) if k % 2 else \
            pa.array([f'v{i}_{k}' for i in range(200)])
    write('wide.parquet', pa.table(cols), expect=False)
    # not parquet / truncated / encrypted footer magic
    with open(os.path.join(OUT, 'nao_parquet.bin'), 'wb') as f:
        f.write(os.urandom(5000))
    data = open(os.path.join(OUT, 'types.parquet'), 'rb').read()
    with open(os.path.join(OUT, 'truncado.parquet'), 'wb') as f:
        f.write(data[: len(data) // 2])
    with open(os.path.join(OUT, 'cripto.parquet'), 'wb') as f:
        f.write(b'PARE' + os.urandom(3000) + struct.pack('<i', 100) + b'PARE')


def big_files():
    n = 3_000_000
    r = np.random.default_rng(7)
    cats = np.array(['alimentos', 'bebidas', 'limpeza', 'higiene', 'eletrônicos', 'vestuário', 'papelaria', 'pet'])
    words = np.array('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor'.split())
    txt_idx = r.integers(0, len(words), size=(n, 5))
    txt = pa.array([' '.join(row) for row in words[txt_idx]])
    tbl = pa.table({
        'id': pa.array(np.arange(n, dtype=np.int64)),
        'ts': pa.array((1_700_000_000_000_000 + np.arange(n, dtype=np.int64) * 1_000_003), pa.timestamp('us', tz='UTC')),
        'cat': pa.array(cats[r.integers(0, len(cats), n)]).dictionary_encode(),
        'txt': txt,
        'val': pa.array(r.normal(100, 30, n)),
        'qty': pa.array(r.integers(1, 50, n, dtype=np.int32)),
        'ok': pa.array(r.random(n) > 0.3),
        'price': pa.array([D(int(x)) / 100 for x in r.integers(100, 10_000_00, n)], pa.decimal128(12, 2)),
    })
    write('big_idx.parquet', tbl, expect=False, row_group_size=500_000, write_page_index=True)
    write('big_noidx.parquet', tbl, expect=False, row_group_size=1_000_000, write_page_index=False)
    for name, rows in [('big_idx.parquet', (0, 50)), ('big_idx.parquet', (1_499_990, 1_500_010)),
                       ('big_noidx.parquet', (2_999_950, 3_000_000)), ('big_noidx.parquet', (999_990, 1_000_010))]:
        path = os.path.join(OUT, name)
        with open(f'{path}.{rows[0]}-{rows[1]}.expected.json', 'w') as f:
            json.dump(expected(path, rows), f)


def extra_files():
    t = types_table()
    write('types_pageidx.parquet', t, row_group_size=200, data_page_size=600, write_page_index=True,
          compression='snappy')
    # XML escaping in the .xlsx writer
    write('escape.parquet', pa.table({'s': ['ctrl \x01\x02 fim', 'lit _x0041_ e _x005F_', 'xml & < > " \' ok',
                                             'tab\there\nnova linha', None]}), expect=False)
    # município codes: numbers (with codes outside the list) and zero-padded text
    tsv = os.path.join(ROOT, 'data', 'municipios-mt.tsv')
    codes = [int(line.split('\t')[0]) for line in open(tsv, encoding='utf-8') if line.strip() and not line.startswith('#')]
    r = random.Random(5)
    n = 1000
    cod = [None if i % 50 == 7 else 77777 if i % 97 == 3 else r.choice(codes) for i in range(n)]
    write('vendas_mt.parquet', pa.table({
        'id': pa.array(range(n), pa.int64()), 'ano': pa.array([2024] * n, pa.int32()),
        'cod_municipio': pa.array(cod, pa.int32()), 'valor': pa.array([r.random() * 1000 for _ in range(n)])}),
        expect=False, row_group_size=500)
    write('cadastro_mt.parquet', pa.table({
        'nome': pa.array([f'empresa {i}' for i in range(300)]),
        'codigo': pa.array([str(r.choice(codes)).zfill(5) for _ in range(300)])}), expect=False)


if __name__ == '__main__':
    small_files()
    extra_files()
    if '--big' in sys.argv:
        big_files()
