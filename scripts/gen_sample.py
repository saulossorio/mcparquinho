"""Builds data/exemplo-vendas.parquet, the example file embedded in the page (fictitious orders).

Run `npm run build` afterwards: the build inlines this file into index.html.
"""
import datetime as dt
import decimal
import os
import random

import pyarrow as pa
import pyarrow.parquet as pq

D = decimal.Decimal
rng = random.Random(2026)
N = 480

nomes = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João',
         'Larissa', 'Marcos', 'Natália', 'Otávio', 'Patrícia', 'Rafael', 'Sabrina', 'Tiago', 'Vanessa', 'Wesley']
sobrenomes = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Lima', 'Carvalho', 'Ferreira', 'Rodrigues',
              'Almeida', 'Costa', 'Gomes', 'Ribeiro', 'Martins', 'Rocha']
cidades = {'SP': ['São Paulo', 'Campinas', 'Santos', 'Ribeirão Preto'], 'RJ': ['Rio de Janeiro', 'Niterói'],
           'MG': ['Belo Horizonte', 'Uberlândia', 'Juiz de Fora'], 'RS': ['Porto Alegre', 'Caxias do Sul'],
           'PR': ['Curitiba', 'Londrina'], 'BA': ['Salvador', 'Feira de Santana'], 'PE': ['Recife', 'Olinda'],
           'SC': ['Florianópolis', 'Joinville'], 'GO': ['Goiânia'], 'DF': ['Brasília']}
pesos_uf = [30, 14, 12, 8, 7, 7, 5, 6, 5, 6]
canais = ['loja', 'site', 'app', 'marketplace']
produtos = [('CAF-500', 'Café torrado 500 g', D('24.90')), ('ARR-5K', 'Arroz tipo 1 5 kg', D('27.49')),
            ('FEI-1K', 'Feijão carioca 1 kg', D('8.99')), ('AZE-500', 'Azeite extravirgem 500 ml', D('42.90')),
            ('LEI-1L', 'Leite integral 1 L', D('5.79')), ('DET-500', 'Detergente 500 ml', D('2.99')),
            ('SAB-90', 'Sabonete 90 g', D('3.49')), ('FON-BT', 'Fone Bluetooth', D('189.00')),
            ('CAR-USB', 'Carregador USB-C 20 W', D('79.90')), ('CAM-M', 'Camiseta algodão M', D('59.90')),
            ('CAD-10', 'Caderno 10 matérias', D('34.50')), ('RAC-3K', 'Ração cães 3 kg', D('64.90'))]
transportadoras = ['Correios', 'Jadlog', 'Loggi', 'Total Express']
tags_possiveis = ['frete grátis', 'primeira compra', 'cupom', 'presente', 'retirada na loja', 'assinatura']

rows = {k: [] for k in ['pedido_id', 'data_pedido', 'criado_em', 'cliente', 'uf', 'cidade', 'canal', 'itens',
                        'valor_total', 'desconto_pct', 'pago', 'tags', 'entrega']}
inicio = dt.datetime(2026, 8, 1, 8, 0, tzinfo=dt.timezone.utc)
t = inicio
for i in range(N):
    t += dt.timedelta(seconds=rng.randint(60, 9000), microseconds=rng.randint(0, 999999))
    uf = rng.choices(list(cidades), weights=pesos_uf)[0]
    canal = rng.choices(canais, weights=[25, 35, 28, 12])[0]
    itens = []
    for p in rng.sample(produtos, rng.randint(1, 4)):
        itens.append({'sku': p[0], 'descricao': p[1], 'qtd': rng.randint(1, 6), 'preco_unit': p[2]})
    bruto = sum(it['preco_unit'] * it['qtd'] for it in itens)
    desconto = rng.choice([None, None, None, 5.0, 10.0, 12.5, 15.0])
    total = (bruto * (1 - D(str(desconto or 0)) / 100)).quantize(D('0.01'), rounding=decimal.ROUND_HALF_EVEN)
    tags = None if rng.random() < 0.35 else rng.sample(tags_possiveis, rng.randint(1, 3))
    retirada = tags is not None and 'retirada na loja' in tags
    entrega = None if (canal == 'loja' or retirada) else {
        'transportadora': rng.choice(transportadoras), 'prazo_dias': rng.randint(1, 12),
        'cep': f'{rng.randint(1000, 99999):05d}-{rng.randint(0, 999):03d}'}
    rows['pedido_id'].append(2026080000 + i * 7 + rng.randint(0, 6))
    rows['data_pedido'].append(t.date())
    rows['criado_em'].append(t)
    rows['cliente'].append(f'{rng.choice(nomes)} {rng.choice(sobrenomes)}')
    rows['uf'].append(uf)
    rows['cidade'].append(rng.choice(cidades[uf]))
    rows['canal'].append(canal)
    rows['itens'].append(itens)
    rows['valor_total'].append(total)
    rows['desconto_pct'].append(desconto)
    rows['pago'].append(rng.random() > 0.08)
    rows['tags'].append(tags)
    rows['entrega'].append(entrega)

item_t = pa.struct([('sku', pa.string()), ('descricao', pa.string()), ('qtd', pa.int32()),
                    ('preco_unit', pa.decimal128(10, 2))])
schema = pa.schema([
    ('pedido_id', pa.int64()), ('data_pedido', pa.date32()), ('criado_em', pa.timestamp('us', tz='UTC')),
    ('cliente', pa.string()), ('uf', pa.dictionary(pa.int8(), pa.string())), ('cidade', pa.string()),
    ('canal', pa.dictionary(pa.int8(), pa.string())), ('itens', pa.list_(item_t)),
    ('valor_total', pa.decimal128(12, 2)), ('desconto_pct', pa.float64()), ('pago', pa.bool_()),
    ('tags', pa.list_(pa.string())),
    ('entrega', pa.struct([('transportadora', pa.string()), ('prazo_dias', pa.int32()), ('cep', pa.string())])),
], metadata={'origem': 'Dados fictícios gerados para demonstrar o visualizador',
             'gerado_em': '2026-11-10'})
arrays = []
for f in schema:
    vals = rows[f.name]
    if pa.types.is_dictionary(f.type):
        arrays.append(pa.array(vals, pa.string()).dictionary_encode().cast(f.type))
    else:
        arrays.append(pa.array(vals, f.type))
table = pa.Table.from_arrays(arrays, schema=schema)
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'exemplo-vendas.parquet')
pq.write_table(table, out, row_group_size=160, compression='snappy')
pf = pq.ParquetFile(out)
print(os.path.getsize(out), 'bytes', pf.num_row_groups, 'row groups', pf.metadata.created_by)
print(table.slice(0, 3).to_pylist())
