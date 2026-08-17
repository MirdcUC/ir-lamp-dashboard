# USB 串列通訊協定（PC ⇄ Arduino）

儀表板（瀏覽器 Web Serial API）與 Arduino 之間的通訊協定。
Arduino 負責透過 RS-485（Modbus RTU）與四台 FOTEK NT-48L-RS 溫控器溝通，
並把狀態轉成下列文字協定回報給 PC。

> **版本狀態**：本文件依 `README.txt` / `NT48L_RS_23項通訊欄位規格表.xlsx`（韌體工程師提供）重寫，
> 已用 2026-08-14 收到的實機資料逐欄位核對過。修訂紀錄見文件最後一節與專案根目錄的 `CHANGELOG.md`。
> 先前依 `紅外線控制模組_畫面.md`（韌體工程師提供的 v2 版規格）實作的格式（27 欄、不含括號、
> 含電流欄位）已停用；該文件已整併：畫面版面規劃併入 `README.md`，未解問題併入
> `DEVICE-CHECKLIST.md`，原檔已移除。

## 序列埠參數

| 項目 | 值 |
|------|-----|
| Baud rate | 9600 |
| Data bits / Parity / Stop | 8 / N / 1 |
| 行結尾 | `\n`（PC 端也接受 `\r\n`） |
| 編碼 | ASCII |

> 前端的 baud rate 定義在 `src/features/serial/constants.ts` 的 `BAUD_RATE`，改動時兩邊要一起改。

## 燈管編號

- `id`（本地燈管 id）= 1 ~ 4，對應四支紅外線燈管，固定給 UI 分頁使用。
- `ID`（協定欄位，設定站號）= 1 ~ 255，是 Modbus 站號，**不一定等於本地 id**——進階設定的
  `SET_ADVANCED` 可以把某支燈管的站號改成別的值。兩者的對照表在
  `src/features/serial/lampState.ts`，預設「站號 = id」。

## Arduino → PC（狀態回報）

Arduino 每台 NT-48L-RS 每次回報一行，用括號包住、逗號分隔的 23 項固定欄位：

```text
(NUN:0,AL1:50,AL2:50,AT:0,TU:0,P:6,I:120,D:30,GAIN:1.0,INT:1,UNT:0,DP:0,ID:1,RS:0,BPS:9600,BIT:2,ON_OFF:0,M_A:0,SV:0,PV:29,UN:0,STATUS:0,ALARM:0)
```

這是 2026-08-14 從主系統實際收到的一行（時間戳是終端機自己加的，不是協定內容）。四台輪流各發一行，
每支燈管的資料持續、高頻回報，**不需要另外的讀取指令**——設定畫面/進階設定畫面要顯示目前設定值時，
直接讀該燈管最新收到的這一行即可。

固定順序：

```text
NUN,AL1,AL2,AT,TU,P,I,D,GAIN,INT,UNT,DP,
ID,RS,BPS,BIT,ON_OFF,M_A,SV,PV,UN,STATUS,ALARM
```

因為是 `key:value` 格式，順序不影響解析（`src/features/serial/protocol/adapters.ts` 的
`parenField23Adapter`），這裡依實際順序記錄方便對照。

### Value 是什麼？

`Value` 是 Master 已經依專案規則轉換後，提供給電腦端使用的工程值／狀態值，不一定等於
NT-48L-RS 暫存器內的 RAW 值。例如：

```text
GAIN RAW=10  -> GAIN:1.0
BPS  RAW=0   -> BPS:9600
```

因此電腦端應以下面定義的 `Value` 規則解析，不要把它全部當作原始 Modbus RAW。

## 23 項參數說明

| # | 欄位 | 英文名稱 | 讀寫 | Value／範圍 | 說明 |
|---|------|---------|------|------------|------|
| 1 | `NUN` | Manual output volume | R/W | 0~100 % | 手動輸出量。M_A=1（手動）時才是主要輸出設定值；**回報**的自動模式下目前觀察到的都是 `NUN:0`。但**寫入**（`SET_ADVANCED`）時自動模式一定要送 `-1`，送 0~100 會被韌體拒絕，見下方「SET_ADVANCED」一節與 `CHANGELOG.md` |
| 2 | `AL1` | #1 alarm | R/W | -99~999，依 UNT/DP | 第一組警報門檻，實際上限/下限/偏差語意依控制器 ALT 模式決定 |
| 3 | `AL2` | #2 alarm | R/W | -99~999，依 UNT/DP | 第二組警報門檻，語意同上 |
| 4 | `AT` | Auto-tuning setting | R/W | 0=Controlling, 1=Auto-tuning | PID 自動演算 |
| 5 | `TU` | Auto-tuning bias | R/W | 0~999 | 自動演算偏差 |
| 6 | `P` | Proportion band | R/W | 0~999 | PID 比例帶 |
| 7 | `I` | Integral time | R/W | 0~3999 秒 | PID 積分時間 |
| 8 | `D` | Derivative time | R/W | 0~3999 秒 | PID 微分時間 |
| 9 | `GAIN` | Gain | R/W | 0.0~9.9 | 輸出控制增益（RAW×0.1） |
| 10 | `INT` | Input type | R/W | 0=Pt,1=K,2=J,3=R,4=S,5=T,6=B,7=E,8=N,9=L | 感測器輸入類型（本專案實機為 K 型，`INT:1`） |
| 11 | `UNT` | Unit selecting | R/W | 0=°C, 1=°F | 溫度單位，影響 SV/PV/AL1/AL2 的解讀 |
| 12 | `DP` | Decimal point setting | R/W | 0=無小數, 1=一位小數 | 小數點設定 |
| 13 | `ID` | Station No. | R/W | 1~255 | Modbus 站號；本專案四台用 1~4 |
| 14 | `RS` | Communication mode | R/W | 0=RTU, 1=ASCII | 本專案固定 RTU |
| 15 | `BPS` | Baud rate | R/W | 9600/19200/38400 | NT-48L-RS 的 RS-485 通訊速度（實際 bps，不是 Master↔PC 的 Serial 速度） |
| 16 | `BIT` | Data configuration | R/W | 0=7O1,1=7E1,2=8N1,3=8O1,4=8E1,5=8N2 | RS-485 資料格式 |
| 17 | `ON_OFF` | Controller ON/OFF | R/W | 0=ON, 1=OFF | 控制器啟停（不是切斷供電） |
| 18 | `M_A` | Auto/Manual selecting | R/W | 0=AUTO, 1=MANUAL | 自動／手動模式 |
| 19 | `SV` | Setting value | R/W | -999~9999，依 UNT/DP | 設定溫度 |
| 20 | `PV` | Process value | Read Only | -999~9999，依 UNT/DP | 目前製程值（溫度） |
| 21 | `UN` | Output volume | Read Only | 0~100 % | 目前實際輸出量 |
| 22 | `STATUS` | Status of Out1/Out2/AL1/AL2 | Read Only | Bit Mask：文件寫 0x1=OUT1,0x2=OUT2,0x4=AL1,0x8=AL2，**但 2026-08-14 實機核對發現 AL1/AL2 實際位置是 0x100（256）/0x1000（4096）**，OUT1/OUT2 尚未實測，見下方說明與 `CHANGELOG.md` | 可同時多個成立，要用 `value & 位元` 逐位元判斷 |
| 23 | `ALARM` | Status of Alarm | Read Only | Bit Mask：0x1=FFF,0x2=---,0x4=HtEr,0x8=OhEr | 控制器異常旗標，判斷方式同上 |

`STATUS`/`ALARM` 的位元判斷邏輯集中在 `src/features/serial/alarmStatus.ts`（`hasBit`/`activeAlarmCodes`）。

> **`STATUS` 的 `AL1`/`AL2` 位元位置跟文件不一樣（2026-08-14 實機核對）**：韌體工程師發現「AL1
> 設定溫度已超過但沒亮燈」，實測後確認 `STATUS` 只亮 AL1 時回報 `256`（`0x100`，bit 8），
> 只亮 AL2 時回報 `4096`（`0x1000`，bit 12），兩個都亮是 `4352`（=256+4096）——還是單純的位元
> 相加，只是位置跟 xlsx 文件寫的 `0x04`/`0x08`（bit 2/3）不一樣，中間差一個 nibble。已在
> `alarmStatus.ts` 的 `STATUS_BITS` 改成實測值。`OUT1`/`OUT2`（文件寫 0x01/0x02）還沒有實機
> 資料驗證過，暫時維持原樣，如果之後也對不上要一併修正。`ALARM` 欄位（FFF/---/HtEr/OhEr）
> 目前也還沒有實機資料驗證，可能有同樣的位元錯位問題，待確認。

## 電腦 → Master：SET 指令

指令格式：`指令名稱(參數1,參數2,...)`，一行一個指令。三個指令的第一個參數都是**目前**設定站號
（1~255），靠站號分辨是哪一支燈管；`src/features/serial/lampState.ts` 的站號表負責把本地 id
轉成目前站號再送出。

### SET_MAIN — 開關溫控器

```text
SET_MAIN(currentID,ON_OFF)
```

例：`SET_MAIN(1,0)` — 站號 1 的控制器啟動。

### SET_SET — 對應「設定畫面」

> **2026-08-14 實測中，尚未定案**：README.txt 這裡其實有兩種矛盾的參數列，開頭「架構總覽」段落
> 是 14 參數（含 `M_A`），後面「已確認」的詳細規格改成 13 參數（`M_A` 已移除）。程式先前照 13
> 參數版本送出，韌體回了通用格式錯誤 `SET_ERROR(SET,FORMAT)`（不是帶 PARAM/CODE 細節的那種），
> 研判是參數數量對不上、目前韌體還是吃舊的 14 參數格式。已把 `M_A` 加回來（見下方），但這只是
> 根據一個字串線索做的推測，還沒被韌體工程師確認，見 `CHANGELOG.md`。

```text
SET_SET(currentID,AL1,AL2,AT,TU,P,I,D,GAIN,INT,UNT,DP,M_A,SV)
```

例：`SET_SET(1,50,50,0,0,6,120,30,1.0,1,0,0,0,100)`

位置定義：

```text
0=currentID 1=AL1 2=AL2 3=AT 4=TU 5=P 6=I 7=D 8=GAIN 9=INT 10=UNT 11=DP 12=M_A 13=SV
```

`M_A` 不是「設定畫面」表單自己管的欄位，`store.ts` 的 `writeSet` 會直接照這支燈管目前回報的
`M_A` 原樣送回去，不會因為送這個指令而改變自動/手動模式。

### SET_ADVANCED — 對應「進階設定畫面」

```text
SET_ADVANCED(currentID,newID,RS,BPS,BIT,M_A,NUN)
```

例：`SET_ADVANCED(1,1,0,9600,2,0,0)`

位置定義：

```text
0=currentID 1=newID 2=RS 3=BPS 4=BIT 5=M_A 6=NUN
```

> **2026-08-14 曾經試過 3 參數版本 `SET_ADVANCED(currentID,M_A,NUN)`，已證實錯誤**：韌體
> 工程師口頭表示「其他參數不能帶」，一度以為是指令位置本身要拿掉，但送 3 參數版本被韌體回
> `SET_ERROR(ADVANCED,FORMAT)`——沒有 PARAM/CODE 細節的通用格式錯誤，代表參數數量不對。
> 已改回 7 參數（跟本節一致）。教訓：韌體工程師口頭描述的規則，要用「錯誤訊息帶不帶
> PARAM/CODE」來判斷是格式問題還是數值問題，不能直接照字面意思去改指令結構，見 `CHANGELOG.md`。

`newID`/`RS`/`BPS`/`BIT` 這四項韌體工程師口頭表示執行期間無法變更；前端一律照這支燈管目前
回報的值原樣送回去（不要求變更），`AdvancedSettingsPage.vue` 把對應欄位鎖成唯讀（`commands.ts`
的 `lockedAdvancedFields`）。

**`NUN` 目前已確認：不管送什麼值都會被拒絕，是韌體端的限制，不是前端的問題（2026-08-14 定案）**。

背景：`commandTracker.ts` 原本用 read-back（比對回報的 `M_A` 有沒有變成要求值）判斷
`SET_ADVANCED` 是否成功，但這個指令常常是「沒有要求任何欄位真的變更」（`newStation`/`RS`/
`BPS`/`BIT` 原樣送回去、自動模式的 `controlMode` 也常常沒變），這種情況下回報的 `M_A` 必然
「符合」，會把「被 `SET_ERROR` 拒絕」誤判成「已回報成功」——這個 bug 已修正，`setAdvanced`
完全不做 read-back 比對，只信任 `SET_OK`/`SET_ERROR` 的實際回覆內容（見下方「回覆格式」一節）。

修好之後重新實測：`NUN` 送 `-1`、送實際數字，**全部收到 `SET_ERROR(PARAM:NUN,CODE:2)`**。
指令格式本身沒問題（7 參數、其他欄位都能正常送），問題確定在韌體端對 `NUN` 的驗證邏輯，需要
韌體工程師從他們那邊查 `CODE:2` 判斷的條件是什麼。在韌體修好之前，`NUN`（手動輸出量）這個
功能視為**目前不可用**，`store.ts` 的 `writeAdvanced` 暫時維持送出但預期一定會被拒絕。

### 回覆格式

```text
成功：SET_OK(MAIN,ID:1) / SET_OK(SET,ID:1) / SET_OK(ADVANCED,ID:1)
錯誤：SET_ERROR(...) 或 SET_ERROR(PARAM:SV,CODE:14,MIN:...,MAX:...)
```

`protocol/setResult.ts` 的 `parseSetResult` 會解析這兩種回覆行（跟 23 欄狀態行是完全不同的
格式，`store.ts` 的 `handleLine` 會先試這個）。`SET_OK` 直接把對應指令標記為 `confirmed`，
不用等 read-back；`SET_ERROR` 沒有帶站號/指令種類，用送出順序的佇列近似對應到最舊一筆還在
`pending` 的指令，標記為 `rejected` 並附上錯誤說明（`commandTracker.ts` 的 `applyResult`）。

## Arduino 端注意事項

- NT-48L-RS 的 Modbus 暫存器位址（PV/SV/OUT/RUN/AT/PID 等）**需依 FOTEK 原廠手冊確認**，
  本文件不假設位址；站號、鮑率也要與溫控器面板設定一致。
- 建議輪詢週期 1 秒（4 台 × 每台數個暫存器）。
- RS-485 匯流排上一次只能有一問一答，輪詢與寫入指令需排隊處理。

## 修訂紀錄

| 版本 | 日期 | 依據 | 摘要 |
|---|---|---|---|
| v1 | — | 早期草案 | `id:1,pv:75.2,sv:80.0,out:45,run:1,at:0,alm1:0,alm2:0` 逐台一行的簡化格式，`SV`/`OUT`/`AT`/`PID`/`GETPID` 個別指令 |
| v2 | 2026-08-11 | 產線/紅外線控制模組_畫面.md | 改成 27 欄不分頁單行合併回報（`ON_OFF:0,PV:9999,...`），`SET_MAIN`/`SET_SET`/`SET_ADVANCED` 逗號分隔不加括號，含電流（Ctu/HB/CtL/Cth）欄位 |
| v3（目前版本） | 2026-08-14 | README.txt / NT48L_RS_23項通訊欄位規格表.xlsx，實機資料核對 | 23 欄整行括號包住；`STATUS`/`ALARM` 改為 Bit Mask；新增 `AL1`/`AL2`；移除電流欄位；`SET_SET`/`SET_ADVANCED` 參數列與 v2 不同；指令格式改回括號 |

v2 → v3 的完整比對與程式改動細節見專案根目錄 `CHANGELOG.md`。
