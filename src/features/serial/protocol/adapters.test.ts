import { describe, expect, it } from 'vitest';
import { createProtocolDecoder, parenField23Adapter } from './index';

describe('parenField23Adapter', () => {
  // 2026-08-14 收到的實機資料（見 CHANGELOG.md），逐欄位核對過
  const REAL_LINE =
    '(NUN:0,AL1:50,AL2:50,AT:0,TU:0,P:6,I:120,D:30,GAIN:1.0,INT:1,UNT:0,DP:0,ID:1,RS:0,BPS:9600,BIT:2,' +
    'ON_OFF:0,M_A:0,SV:0,PV:29,UN:0,STATUS:0,ALARM:0)';

  it('解析實機一行完整資料', () => {
    expect(parenField23Adapter.parse(REAL_LINE)).toEqual([
      {
        id: 1,
        fields: {
          NUN: '0', AL1: '50', AL2: '50', AT: '0', TU: '0', P: '6', I: '120', D: '30', GAIN: '1.0',
          INT: '1', UNT: '0', DP: '0', ID: '1', RS: '0', BPS: '9600', BIT: '2',
          ON_OFF: '0', M_A: '0', SV: '0', PV: '29', UN: '0', STATUS: '0', ALARM: '0',
        },
      },
    ]);
  });

  it('允許只回報部分欄位', () => {
    expect(parenField23Adapter.parse('(ID:2,PV:75.2)')).toEqual([{ id: 2, fields: { ID: '2', PV: '75.2' } }]);
  });

  it('忽略協定沒定義的欄位', () => {
    expect(parenField23Adapter.parse('(ID:2,PV:70,foo:bar)')).toEqual([{ id: 2, fields: { ID: '2', PV: '70' } }]);
  });

  it('容忍括號內外的空白', () => {
    expect(parenField23Adapter.parse(' ( ID : 4 , PV : 66.5 ) ')).toEqual([{ id: 4, fields: { ID: '4', PV: '66.5' } }]);
  });

  it('站號不限於 LAMP_IDS（1~4），改過站號的燈管也能解析——站號與卡片的對照交給 lampState 處理', () => {
    expect(parenField23Adapter.parse('(ID:5,PV:70)')).toEqual([{ id: 5, fields: { ID: '5', PV: '70' } }]);
  });

  it('丟棄非法站號（0、廣播、非整數）', () => {
    expect(parenField23Adapter.parse('(ID:0,PV:70)')).toEqual([]);
    expect(parenField23Adapter.parse('(ID:abc,PV:70)')).toEqual([]);
  });

  it('沒有括號包住的行不 match', () => {
    expect(parenField23Adapter.match('ID:1,PV:75.2')).toBe(false);
    expect(parenField23Adapter.match('(ID:1,PV:75.2')).toBe(false);
  });

  it('只有括號沒有任何已知欄位時不產生資料', () => {
    expect(parenField23Adapter.parse('(FOO:1)')).toEqual([]);
  });

  it('v4 草案多帶 SHT 欄位時也能解析，不影響 v3 沒有 SHT 的行（見 docs/DEVICE-CHECKLIST.md H2）', () => {
    expect(parenField23Adapter.parse('(ID:1,PV:70,SHT:123)')).toEqual([{ id: 1, fields: { ID: '1', PV: '70', SHT: '123' } }]);
    // v3 沒有 SHT 的行維持原樣，fields 裡不會多出 SHT 的空值
    expect(parenField23Adapter.parse('(ID:1,PV:70)')).toEqual([{ id: 1, fields: { ID: '1', PV: '70' } }]);
  });
});

describe('createProtocolDecoder', () => {
  it('解得出資料時回報 adapter 名稱', () => {
    const decoder = createProtocolDecoder();
    expect(decoder.activeAdapter).toBeNull();

    expect(decoder.decode('(ID:1,PV:75.2)').adapter).toBe('paren-field23');
    expect(decoder.activeAdapter).toBe('paren-field23');
  });

  it('無法解析的行回報 adapter 為 null，不丟出例外', () => {
    const decoder = createProtocolDecoder();
    const result = decoder.decode('連線中，請稍候');
    expect(result.frames).toEqual([]);
    expect(result.adapter).toBeNull();
    expect(decoder.activeAdapter).toBeNull();
  });

  it('無效行不會影響下一行的判定', () => {
    const decoder = createProtocolDecoder();
    decoder.decode('(ID:abc,PV:70)'); // 非法站號，解不出資料
    expect(decoder.activeAdapter).toBeNull();

    expect(decoder.decode('(ID:1,PV:70)').adapter).toBe('paren-field23');
  });

  it('reset 清掉診斷用的 activeAdapter', () => {
    const decoder = createProtocolDecoder();
    decoder.decode('(ID:1,PV:70)');
    expect(decoder.activeAdapter).toBe('paren-field23');

    decoder.reset();
    expect(decoder.activeAdapter).toBeNull();
  });
});
