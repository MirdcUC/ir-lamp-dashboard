import { describe, expect, it } from 'vitest';
import { describeSetError, parseSetResult } from './setResult';

describe('parseSetResult', () => {
  it('解析 SET_OK', () => {
    expect(parseSetResult('SET_OK(MAIN,ID:1)')).toEqual({ kind: 'ok', command: 'MAIN', id: 1 });
    expect(parseSetResult('SET_OK(SET,ID:2)')).toEqual({ kind: 'ok', command: 'SET', id: 2 });
    expect(parseSetResult('SET_OK(ADVANCED,ID:3)')).toEqual({ kind: 'ok', command: 'ADVANCED', id: 3 });
  });

  it('解析帶 PARAM/CODE 的 SET_ERROR', () => {
    expect(parseSetResult('SET_ERROR(PARAM:NUN,CODE:2)')).toEqual({
      kind: 'error', param: 'NUN', code: 2, min: null, max: null, raw: 'PARAM:NUN,CODE:2',
    });
  });

  it('解析帶 MIN/MAX 的 SET_ERROR', () => {
    expect(parseSetResult('SET_ERROR(PARAM:SV,CODE:14,MIN:-999,MAX:9999)')).toEqual({
      kind: 'error', param: 'SV', code: 14, min: -999, max: 9999, raw: 'PARAM:SV,CODE:14,MIN:-999,MAX:9999',
    });
  });

  it('解析不帶參數細節的 SET_ERROR，抓不出結構就整段當 raw', () => {
    expect(parseSetResult('SET_ERROR(BUSY)')).toEqual({
      kind: 'error', param: null, code: null, min: null, max: null, raw: 'BUSY',
    });
  });

  it('容忍前後空白', () => {
    expect(parseSetResult('  SET_OK(MAIN,ID:1)  ')).toEqual({ kind: 'ok', command: 'MAIN', id: 1 });
  });

  it('不是這兩種格式回傳 null，交給狀態行的 decoder 處理', () => {
    expect(parseSetResult('(NUN:0,ID:1,PV:29)')).toBeNull();
    expect(parseSetResult('連線中，請稍候')).toBeNull();
    expect(parseSetResult('')).toBeNull();
  });
});

describe('describeSetError', () => {
  it('有 PARAM/CODE 時組成人看得懂的訊息', () => {
    expect(describeSetError({ kind: 'error', param: 'NUN', code: 2, min: null, max: null, raw: '' }))
      .toBe('韌體拒絕：NUN 不合法（CODE:2）');
  });

  it('有 MIN/MAX 時附上範圍', () => {
    expect(describeSetError({ kind: 'error', param: 'SV', code: 14, min: -999, max: 9999, raw: '' }))
      .toBe('韌體拒絕：SV 不合法，範圍 -999~9999（CODE:14）');
  });

  it('沒有結構化資訊時退回 raw', () => {
    expect(describeSetError({ kind: 'error', param: null, code: null, min: null, max: null, raw: 'BUSY' }))
      .toBe('韌體拒絕：BUSY');
  });
});
