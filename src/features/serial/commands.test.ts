import { describe, expect, it } from 'vitest';
import { commandText, describeCommand, lockedAdvancedFields } from './commands';
import { initLampStatus } from './constants';
import type { LampStatus } from './types';

describe('commandText.setMain', () => {
  it('組出 5 參數：currentID,ON_OFF,SV,M_A,NUN（v4 草案，見 SetMainParams 的說明）', () => {
    expect(commandText.setMain(1, { on: true, sv: 150, controlMode: 0, nUn: 0 })).toBe('SET_MAIN(1,0,150,0,0)');
    expect(commandText.setMain(1, { on: false, sv: 100, controlMode: 1, nUn: 50 })).toBe('SET_MAIN(1,1,100,1,50)');
  });
});

describe('commandText.setParameter', () => {
  it('組出 13 參數：currentID,INT,UNT,DP,SHT,AT,TU,P,I,D,GAIN,AL1,AL2（v4 草案，原 SET_SET）', () => {
    const params = {
      sensorType: 1, unit: 0, decimal: 0, sht: 0,
      autoTune: 0, offset: 0, p: 6, i: 120, d: 30, gain: 1.0,
      al1: 50, al2: 50,
    };
    expect(commandText.setParameter(1, params)).toBe('SET_PARAMETER(1,1,0,0,0,0,0,6,120,30,1,50,50)');
  });
});

describe('commandText.setAdvanced', () => {
  const BASE = { newStation: 1, commMode: 0, format: 2 };

  it('組出 5 參數（v4 草案拿掉 M_A/NUN，見 SetAdvancedParams 的說明）；BPS 送的是實際 bps，不是下拉選單索引', () => {
    expect(commandText.setAdvanced(1, { ...BASE, baudRate: 0 })).toBe('SET_ADVANCED(1,1,0,9600,2)');
  });

  it('索引 1/2 分別轉成 19200/38400', () => {
    expect(commandText.setAdvanced(1, { ...BASE, baudRate: 1 })).toBe('SET_ADVANCED(1,1,0,19200,2)');
    expect(commandText.setAdvanced(1, { ...BASE, baudRate: 2 })).toBe('SET_ADVANCED(1,1,0,38400,2)');
  });
});

describe('describeCommand', () => {
  it('SET_PARAMETER 標註成 13 個具名欄位（原 SET_SET，見 SetParameterParams 的說明）', () => {
    expect(describeCommand('SET_PARAMETER(1,1,0,0,0,0,0,6,120,30,1.0,50,50)')).toBe(
      'currentID=1, INT=1, UNT=0, DP=0, SHT=0, AT=0, TU=0, P=6, I=120, D=30, GAIN=1.0, AL1=50, AL2=50',
    );
  });

  it('SET_MAIN 標註成 5 個具名欄位', () => {
    expect(describeCommand('SET_MAIN(1,0,150,0,0)')).toBe('currentID=1, ON_OFF=0, SV=150, M_A=0, NUN=0');
  });

  it('SET_ADVANCED 標註成 5 個具名欄位', () => {
    expect(describeCommand('SET_ADVANCED(1,1,0,9600,2)')).toBe(
      'currentID=1, newID=1, RS=0, BPS=9600, BIT=2',
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
