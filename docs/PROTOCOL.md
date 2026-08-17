# USB 串列通訊協定（PC ⇄ Arduino）

儀表板（瀏覽器 Web Serial API）與 Arduino 之間的通訊協定。
Arduino 負責透過 RS-485（Modbus RTU）與四台 FOTEK NT-48L-RS 溫控器溝通，
並把狀態轉成下列文字協定回報給 PC。

> **版本狀態：本文件目前記錄的是 v4 草案，🚧 尚未用實機資料核對過。** 依韌體工程師 2026-08-17
> 提供的 `紅外線控制模組_畫面.pptx` 重寫，這是設計稿等級的文件，跟先前拿到 `README.txt`/xlsx
> 那次一樣不保證等於韌體實際會接受的格式——差異清單見 `docs/DEVICE-CHECKLIST.md` H 節、追蹤
> issue [#1](https://github.com/MirdcUC/ir-lamp-dashboard/issues/1)。目前只有
> `feature/protocol-v4-migration` 分支的程式碼實作了這份草案；`main` 分支仍是 v3（2026-08-14
> 已用實機資料逐欄位核對過，依 `README.txt` / `NT48L_RS_23項通訊欄位規格表.xlsx` 重寫）。取得
> 新版韌體實機資料、逐欄位核對過後，才會把這個分支合併回 `main`。修訂紀錄見文件最後一節與
> `docs/CHANGELOG.md`。
>
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

Arduino 每台 NT-48L-RS 每次回報一行，用括號包住、逗號分隔的固定欄位。v3 是 23 項；v4 草案
新增 `SHT`（輸入修正）變成 24 項：

```text
(NUN:0,AL1:50,AL2:50,AT:0,TU:0,P:6,I:120,D:30,GAIN:1.0,INT:1,UNT:0,DP:0,SHT:0,ID:1,RS:0,BPS:9600,BIT:2,ON_OFF:0,M_A:0,SV:0,PV:29,UN:0,STATUS:0,ALARM:0)
```

> `SHT:0` 是本文件依 v4 草案手動插入示範用，**不是實機收到的真實範例**——2026-08-14 收到的
> 那行實機資料是 v3（23 項，沒有 `SHT`）。上面這行只是示意 `SHT` 加進去之後長什麼樣子。

四台輪流各發一行，每支燈管的資料持續、高頻回報，**不需要另外的讀取指令**——設定畫面/進階設定
畫面要顯示目前設定值時，直接讀該燈管最新收到的這一行即可。

固定順序（v4 草案，依 pptx 的中英對照表順序；v3 順序見「修訂紀錄」表格）：

```text
ON_OFF,SV,M_A,NUN,PV,UN,STATUS,ALARM,
INT,UNT,DP,SHT,AT,TU,P,I,D,GAIN,AL1,AL2,
ID,RS,BPS,BIT
```

因為是 `key:value` 格式，順序不影響解析（`src/features/serial/protocol/adapters.ts` 的
`parenField23Adapter`），這個 adapter 同時吃 v3（沒有 `SHT`）跟 v4（有 `SHT`）的行，不用另外
開一個 adapter，這裡依 pptx 記錄的順序記錄方便對照。

### Value 是什麼？

`Value` 是 Master 已經依專案規則轉換後，提供給電腦端使用的工程值／狀態值，不一定等於
NT-48L-RS 暫存器內的 RAW 值。例如：

```text
GAIN RAW=10  -> GAIN:1.0
BPS  RAW=0   -> BPS:9600
```

因此電腦端應以下面定義的 `Value` 規則解析，不要把它全部當作原始 Modbus RAW。

## 24 項參數說明（v4 草案；v3 是 23 項，沒有 `SHT`，`AL1`/`AL2` 範圍是 `-99~999`）

| # | 欄位 | 英文名稱 | 讀寫 | Value／範圍 | 說明 |
|---|------|---------|------|------------|------|
| 1 | `NUN` | Manual output volume | R/W | 0~100 % | 手動輸出量。M_A=1（手動）時才是主要輸出設定值。v4 草案把 `NUN` 的寫入移到 `SET_MAIN`（見下方），不再屬於 `SET_ADVANCED`——v3 時代「自動模式送 `-1` 會被拒絕」那個問題（`docs/DEVICE-CHECKLIST.md` G7）可能因此改變，需實機重新驗證 |
| 2 | `AL1` | #1 alarm | R/W | **-999~9999**（v3 是 `-99~999`），依 UNT/DP | 第一組警報門檻，實際上限/下限/偏差語意依控制器 ALT 模式決定 |
| 3 | `AL2` | #2 alarm | R/W | **-999~9999**（v3 是 `-99~999`），依 UNT/DP | 第二組警報門檻，語意同上 |
| 4 | `AT` | Auto-tuning setting | R/W | 0=Controlling, 1=Auto-tuning | PID 自動演算 |
| 5 | `TU` | Auto-tuning bias | R/W | 0~999 | 自動演算偏差 |
| 6 | `P` | Proportion band | R/W | 0~999 | PID 比例帶 |
| 7 | `I` | Integral time | R/W | 0~3999 秒 | PID 積分時間 |
| 8 | `D` | Derivative time | R/W | 0~3999 秒 | PID 微分時間 |
| 9 | `GAIN` | Gain | R/W | 0.0~9.9 | 輸出控制增益（RAW×0.1） |
| 10 | `INT` | Input type | R/W | 0=Pt,1=K,2=J,3=R,4=S,5=T,6=B,7=E,8=N,9=L | 感測器輸入類型（本專案實機為 K 型，`INT:1`） |
| 11 | `UNT` | Unit selecting | R/W | 0=°C, 1=°F | 溫度單位，影響 SV/PV/AL1/AL2 的解讀 |
| 12 | `DP` | Decimal point setting | R/W | 0=無小數, 1=一位小數 | 小數點設定 |
| 13 | `SHT` | Input correction | R/W | -999~9999 | **v4 新欄位**（🚧 未經實機驗證）：輸入修正，推測是感測器校正偏移量；暫存器位址、精度、寫入行為都待跟韌體工程師確認，見 `docs/DEVICE-CHECKLIST.md` H2 |
| 14 | `ID` | Station No. | R/W | 1~255 | Modbus 站號；本專案四台用 1~4 |
| 15 | `RS` | Communication mode | R/W | 0=RTU, 1=ASCII | 本專案固定 RTU |
| 16 | `BPS` | Baud rate | R/W | 9600/19200/38400 | NT-48L-RS 的 RS-485 通訊速度（實際 bps，不是 Master↔PC 的 Serial 速度） |
| 17 | `BIT` | Data configuration | R/W | 0=7O1,1=7E1,2=8N1,3=8O1,4=8E1,5=8N2 | RS-485 資料格式 |
| 18 | `ON_OFF` | Controller ON/OFF | R/W | 0=ON, 1=OFF | 控制器啟停（不是切斷供電） |
| 19 | `M_A` | Auto/Manual selecting | R/W | 0=AUTO, 1=MANUAL | 自動／手動模式 |
| 20 | `SV` | Setting value | R/W | -999~9999，依 UNT/DP | 設定溫度 |
| 21 | `PV` | Process value | Read Only | -999~9999，依 UNT/DP | 目前製程值（溫度） |
| 22 | `UN` | Output volume | Read Only | 0~100 % | 目前實際輸出量 |
| 23 | `STATUS` | Status of Out1/AL1/AL2 | Read Only | Bit Mask：文件寫 0x1=OUT1,0x2=OUT2,0x4=AL1,0x8=AL2，**但 2026-08-14 實機核對發現 AL1/AL2 實際位置是 0x100（256）/0x1000（4096）**，見下方說明與 `CHANGELOG.md`。**`OUT2` 已由使用者確認拿掉**（見 `docs/DEVICE-CHECKLIST.md` H6，產品面決定，非實機驗證），只剩 `OUT1` 一路輸出；`OUT1` 的 bit 位置本身（文件寫 0x1）仍待實機資料驗證 | 可同時多個成立，要用 `value & 位元` 逐位元判斷 |
| 24 | `ALARM` | Status of Alarm | Read Only | Bit Mask：0x1=FFF,0x2=---,0x4=HtEr,0x8=OhEr | 控制器異常旗標，判斷方式同上 |

`STATUS`/`ALARM` 的位元判斷邏輯集中在 `src/features/serial/alarmStatus.ts`（`hasBit`/`activeAlarmCodes`）。

> **`STATUS` 的 `AL1`/`AL2` 位元位置跟文件不一樣（2026-08-14 實機核對）**：韌體工程師發現「AL1
> 設定溫度已超過但沒亮燈」，實測後確認 `STATUS` 只亮 AL1 時回報 `256`（`0x100`，bit 8），
> 只亮 AL2 時回報 `4096`（`0x1000`，bit 12），兩個都亮是 `4352`（=256+4096）——還是單純的位元
> 相加，只是位置跟 xlsx 文件寫的 `0x04`/`0x08`（bit 2/3）不一樣，中間差一個 nibble。已在
> `alarmStatus.ts` 的 `STATUS_BITS` 改成實測值。`OUT1`（文件寫 0x01）還沒有實機資料驗證過，
> 暫時維持原樣，如果之後對不上要一併修正——`OUT2` 已由使用者確認拿掉，不在 `STATUS_BITS` 裡了，
> 見 `docs/DEVICE-CHECKLIST.md` H6。`ALARM` 欄位（FFF/---/HtEr/OhEr）目前也還沒有實機資料驗證，
> 可能有同樣的位元錯位問題，待確認。

## 電腦 → Master：SET 指令（v4 草案，🚧 未經實機驗證）

指令格式：`指令名稱(參數1,參數2,...)`，一行一個指令。三個指令的第一個參數都是**目前**設定站號
（1~255），靠站號分辨是哪一支燈管；`src/features/serial/lampState.ts` 的站號表負責把本地 id
轉成目前站號再送出。

> v4 草案把 `SV`/`M_A`/`NUN` 都收進 `SET_MAIN`（原本分散在 v3 的 `SET_SET`/`SET_ADVANCED`），
> `SET_SET` 改名 `SET_PARAMETER` 且拿掉 `M_A`/`SV`、新增 `SHT`，`SET_ADVANCED` 瘦身成只剩通訊
> 參數。畫面上「設定溫度」（`SettingsPage.vue`）、「控制模式選擇」/`NUN`
> （`AdvancedSettingsPage.vue`）這幾個欄位的輸入框位置沒有跟著搬，實際上是 `store.ts` 把它們
> 拆送成對應的 `SET_MAIN` 呼叫，見 `store.ts` 的 `dispatchMain`/`writeParameter`/`writeAdvanced`。

### SET_MAIN — 開關溫控器 + 設定溫度 + 控制模式/手動輸出量

```text
SET_MAIN(currentID,ON_OFF,SV,M_A,NUN)
```

例：`SET_MAIN(1,0,150,0,0)` — 站號 1 的控制器啟動，設定溫度 150，自動模式。

位置定義：

```text
0=currentID 1=ON_OFF 2=SV 3=M_A 4=NUN
```

每次呼叫只有其中一兩項是使用者真的要改的（例如按 Run/Stop 只改 `ON_OFF`），其餘欄位由
`commands.ts` 的 `currentMainFields()` 從這支燈管目前回報的值算出「維持不變」再一起送出。

### SET_PARAMETER — 對應「設定畫面」的感測器/PID/警報/輸入修正（v3 稱 `SET_SET`）

```text
SET_PARAMETER(currentID,INT,UNT,DP,SHT,AT,TU,P,I,D,GAIN,AL1,AL2)
```

例：`SET_PARAMETER(1,1,0,0,0,0,0,6,120,30,1.0,50,50)`

位置定義：

```text
0=currentID 1=INT 2=UNT 3=DP 4=SHT 5=AT 6=TU 7=P 8=I 9=D 10=GAIN 11=AL1 12=AL2
```

`M_A`/`SV` 不在這個指令裡了（見上方 SET_MAIN）。`SHT` 是 v4 新欄位，範圍與寫入行為都待確認。

### SET_ADVANCED — 對應「進階設定畫面」的通訊參數

```text
SET_ADVANCED(currentID,newID,RS,BPS,BIT)
```

例：`SET_ADVANCED(1,1,0,9600,2)`

位置定義：

```text
0=currentID 1=newID 2=RS 3=BPS 4=BIT
```

`M_A`/`NUN` 不在這個指令裡了（見上方 SET_MAIN）。`newID`/`RS`/`BPS`/`BIT` 沿用 v3 的假設——
韌體工程師口頭表示執行期間無法變更，前端一律照這支燈管目前回報的值原樣送回去（不要求變更），
`AdvancedSettingsPage.vue` 把對應欄位鎖成唯讀（`commands.ts` 的 `lockedAdvancedFields`），也
不做 read-back 比對（見 `commandTracker.ts` 的 `reportedValues`）。

> **v3 的歷史教訓，v4 還沒重新驗證過，但邏輯仍然適用**：
> - `SET_SET`／`SET_ADVANCED` 都曾經因為「文件寫的參數數量」跟「韌體實際期待的參數數量」不一致
>   而被拒絕（`SET_ERROR(SET,FORMAT)` / `SET_ERROR(ADVANCED,FORMAT)`，不帶 `PARAM`/`CODE` 細節
>   的通用格式錯誤 = 參數數量錯了）。
> - `NUN`（手動輸出量）在 v3 的 `SET_ADVANCED` 裡不管送什麼值都被拒絕
>   （`SET_ERROR(PARAM:NUN,CODE:2)`，帶 `PARAM`/`CODE` 細節 = 數值本身不合法，不是格式問題），
>   是 `docs/DEVICE-CHECKLIST.md` G7 記錄的未解問題。v4 把 `NUN` 移到 `SET_MAIN`，**這有可能就是
>   解法，但也可能只是換個位置一樣被拒絕**，需要實機重新測過才知道，見 H1。
> - 教訓本身：韌體工程師口頭描述的規則，要用「錯誤訊息帶不帶 `PARAM`/`CODE`」判斷是格式問題還
>   是數值問題，不能直接照字面意思改指令結構；完整案發過程見 `docs/CHANGELOG.md`。

### 回覆格式

```text
成功：SET_OK(MAIN,ID:1) / SET_OK(SET,ID:1) / SET_OK(PARAMETER,ID:1) / SET_OK(ADVANCED,ID:1)
錯誤：SET_ERROR(...) 或 SET_ERROR(PARAM:SV,CODE:14,MIN:...,MAX:...)
```

`protocol/setResult.ts` 的 `parseSetResult` 會解析這兩種回覆行（跟狀態行是完全不同的格式，
`store.ts` 的 `handleLine` 會先試這個）。`SET_OK` 直接把對應指令標記為 `confirmed`，不用等
read-back；`SET_ERROR` 沒有帶站號/指令種類，用送出順序的佇列近似對應到最舊一筆還在 `pending`
的指令，標記為 `rejected` 並附上錯誤說明（`commandTracker.ts` 的 `applyResult`）。

> `SET_SET` 改名 `SET_PARAMETER` 後，回覆行的指令標籤會是 `SET_OK(SET,...)` 還是
> `SET_OK(PARAMETER,...)`，pptx 沒有給範例，兩種先都接受（`protocol/setResult.ts` 的
> `SetResultCommand`），等實機資料核對後再拿掉不用的那個。

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
| v3 | 2026-08-14 | README.txt / NT48L_RS_23項通訊欄位規格表.xlsx，**實機資料核對過** | 23 欄整行括號包住；`STATUS`/`ALARM` 改為 Bit Mask；新增 `AL1`/`AL2`；移除電流欄位；`SET_SET`/`SET_ADVANCED` 參數列與 v2 不同；指令格式改回括號 |
| v4（本文件目前記錄的版本，🚧 草案） | 2026-08-17 | `紅外線控制模組_畫面.pptx`，**尚未實機核對** | 新增 `SHT`（24 欄）；`AL1`/`AL2` 範圍放寬為 `-999~9999`；`SV`/`M_A`/`NUN` 收進 `SET_MAIN`；`SET_SET` 改名 `SET_PARAMETER` 並拿掉 `M_A`/`SV`；`SET_ADVANCED` 拿掉 `M_A`/`NUN`。差異清單見 `docs/DEVICE-CHECKLIST.md` H 節、[issue #1](https://github.com/MirdcUC/ir-lamp-dashboard/issues/1) |

v2 → v3 的完整比對與程式改動細節見 `docs/CHANGELOG.md`。v3 → v4 的差異清單見 `docs/DEVICE-CHECKLIST.md`
H 節，實機核對後的改動細節會補進 `docs/CHANGELOG.md`。
