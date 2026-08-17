import { describe, expect, it } from 'vitest';
import { commandText, describeCommand, lockedAdvancedFields } from './commands';
import { initLampStatus } from './constants';
import type { LampStatus } from './types';

describe('commandText.setAdvanced', () => {
  const BASE = { newStation: 1, commMode: 0, format: 2, controlMode: 0, nUn: 0 };

  it('BPS 送的是實際 bps，不是下拉選單索引——README.txt 範例 SET_ADVANCED(1,1,0,9600,2,0,0) 的第 4 個參數是 9600', () => {
    expect(commandText.setAdvanced(1, { ...BASE, baudRate: 0 })).toBe('SET_ADVANCED(1,1,0,9600,2,0,0)');
  });

  it('索引 1/2 分別轉成 19200/38400', () => {
    expect(commandText.setAdvanced(1, { ...BASE, baudRate: 1 })).toBe('SET_ADVANCED(1,1,0,19200,2,0,0)');
    expect(commandText.setAdvanced(1, { ...BASE, baudRate: 2 })).toBe('SET_ADVANCED(1,1,0,38400,2,0,0)');
  });
});

describe('describeCommand', () => {
  it('SET_SET 標註成 14 個具名欄位（含 M_A，見 SetSetParams 的說明）', () => {
    expect(describeCommand('SET_SET(1,50,50,0,0,6,120,30,1.0,1,0,0,0,100)')).toBe(
      'currentID=1, AL1=50, AL2=50, AT=0, TU=0, P=6, I=120, D=30, GAIN=1.0, INT=1, UNT=0, DP=0, M_A=0, SV=100',
    );
  });

  it('SET_MAIN 標註成 2 個具名欄位', () => {
    expect(describeCommand('SET_MAIN(1,0)')).toBe('currentID=1, ON_OFF=0');
  });

  it('SET_ADVANCED 標註成 7 個具名欄位', () => {
    expect(describeCommand('SET_ADVANCED(1,1,0,9600,2,0,0)')).toBe(
      'currentID=1, newID=1, RS=0, BPS=9600, BIT=2, M_A=0, NUN=0',
    );
  });

  it('認不出的指令名稱回傳 null', () => {
    expect(describeCommand('SET_OK(MAIN,ID:1)')).toBeNull();
    expect(describeCommand('(NUN:0,ID:1)')).toBeNull();
  });

  it('參數數量對不上時回傳 null，不硬湊', () => {
    expect(describeCommand('SET_MAIN(1,0,99)')).toBeNull();
  });
});

describe('lockedAdvancedFields', () => {
  it('從燈管目前回報值算出四項維持不變要送的值', () => {
    const lamp: LampStatus = { ...initLampStatus, ID: 3, RS: 0, BPS: 19200, BIT: 4 };
    expect(lockedAdvancedFields(lamp, 1)).toEqual({ newStation: 3, commMode: 0, baudRate: 1, format: 4 });
  });

  it('沒有燈管資料時，站號退回 fallbackId、其餘退回索引 0', () => {
    expect(lockedAdvancedFields(undefined, 2)).toEqual({ newStation: 2, commMode: 0, baudRate: 0, format: 0 });
  });

  it('BPS 是不在 BAUD_RATE_VALUES 表裡的怪值時，索引退回 0，不會是 -1', () => {
    const lamp: LampStatus = { ...initLampStatus, ID: 1, BPS: 4800 };
    expect(lockedAdvancedFields(lamp, 1).baudRate).toBe(0);
  });
});
