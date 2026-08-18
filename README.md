# 紅外線燈管控制模組儀表板

產線四支紅外線燈管（FOTEK NT-48L-RS 溫控器）的單頁監控儀表板。
瀏覽器透過 Web Serial API 與 Arduino 溝通，Arduino 再以 RS-485 (Modbus RTU) 對四台溫控器輪詢與下指令。

## 功能

- 四支燈管即時狀態：目前溫度 PV、設定溫度 SV、輸出百分比 UN、ON/OFF、AT 調諧、STATUS/ALARM 警報 Bit Mask
- 每支燈管獨立的資料新鮮度：5 秒未回報標為「資料已過期」，15 秒標為「失聯」，值會保留但轉灰
- 控制：Run/Stop・設定溫度・控制模式/手動輸出量（`SET_MAIN`）、感測器/警報/PID/輸入修正設定（`SET_PARAMETER`）、通訊設定（`SET_ADVANCED`）——v4 草案格式，🚧 未經實機驗證，見 [PROTOCOL.md](./docs/PROTOCOL.md)
- 指令結果以裝置回報值驗證，送出不等於成功（見下方「指令驗證」）
- 模擬模式：無硬體時可預覽介面與完整操作流程

## 畫面版面規劃

三個畫面共用左側導覽列（主畫面 / 參數設定 / 通訊設定——依 pptx 左側導覽欄文字命名，見 `docs/DEVICE-CHECKLIST.md` H7），上方是溫控器 1~4 分頁籤，對應 4 支紅外線燈管。

### 主畫面

- 左側：導覽列；上方：溫控器 1~4 分頁籤；中央：目前選取溫控器的即時狀態顯示區；右側：**燈管位置示意圖**——同時列出 4 支燈管各自的「現在溫度」「實際輸出量」小卡
- 每個溫控器分頁籤旁邊有一個 **ON/OFF 按鈕**（開關該支燈管的溫控器）
- 控制設定欄位（送出時走 `SET_MAIN`，見下方「指令驗證」）：

  | 欄位 | 範圍 | 型態 |
  |------|------|------|
  | 設定溫度 | 0 ～ 150 | 輸入方塊 |
  | 控制模式選擇 | 自動、手動 | 下拉式選單（選「手動」時多顯示「手動輸出量」欄位，範圍 0～100） |

  手動輸出量規則：手動模式下使用者可輸入（0～100）；自動模式下不開放輸入，固定送 `0`（輸出值
  由 PID 自己算，非人為設定；原本沿用畫面.md 舊版規則送 `-1`，2026-08-17 改送 `0` 試驗，見
  `docs/DEVICE-CHECKLIST.md` G7/H1）。

- 中央狀態顯示區欄位：

  | 欄位 | 範圍 | 型態 |
  |------|------|------|
  | 現在溫度 | -999 ～ 9999 | 顯示方塊 |
  | 實際輸出量 | 0 ～ 100 (%) | 顯示方塊 |
  | 現在電流值 | 0 ～ 99.99 | 顯示方塊 |
  | 輸出與警報監控 | OUT1、AL1、AL2 | 顯示方塊（3 個，各自用顏色表示 ON/OFF；ON = 綠色，OFF = 紅色；`OUT2` 已確認拿掉） |
  | 警報狀態 | FFF、---、HtEr、OhEr | 顯示方塊 |

### 參數設定畫面

上方同樣是溫控器 1~4 分頁籤，內容分兩區塊：

**感測器設定**

| 欄位 | 選項/範圍 | 型態 |
|------|-----------|------|
| 感測器類型 | Pt、K、J、R、S、T、B、E、N、L | 下拉式選單 |
| 設定溫度 | 0 ～ 150（送出時走 `SET_MAIN`，見下方「指令驗證」） | 輸入方塊 |
| 溫度單位 | ℃、℉ | 下拉式選單 |
| 小數點 | 無小數、一位小數 | 下拉式選單 |
| 輸入修正（SHT） | -999 ～ 9999 | 輸入方塊（🚧 v4 新欄位，未經實機驗證） |

**PID 設定**

| 欄位 | 範圍 | 型態 |
|------|------|------|
| 自動調諧 | Control、Auto-Tuning | 下拉式選單 |
| 偏移量參數 | 0 ～ 999 | 輸入方塊 |
| P | 0 ～ 999 | 輸入方塊 |
| I | 0 ～ 3999 | 輸入方塊 |
| D | 0 ～ 3999 | 輸入方塊 |
| GAin | 0.0 ～ 9.9 | 輸入方塊 |

**警報設定**

| 欄位 | 範圍 | 型態 |
|------|------|------|
| AL1（第一組警報值） | -999 ～ 9999（🚧 v4 草案放寬，v3 是 -99～999） | 輸入方塊 |
| AL2（第二組警報值） | -999 ～ 9999（🚧 v4 草案放寬，v3 是 -99～999） | 輸入方塊 |

### 通訊設定畫面

需要管理員密碼才能進入——防呆用（避免操作員誤觸、誤改站號/通訊參數等），不是防未授權存取的安全機制，密碼驗證純粹在前端做。輸入正確一次後永久記在 localStorage，reload、關瀏覽器都不會失效。

**溫控器設定**

| 欄位 | 範圍/選項 | 型態 |
|------|-----------|------|
| 設定站號 | 1 ～ 255 | 輸入方塊 |
| 通訊模式 | RTU、ASCII | 下拉式選單 |
| 通訊速度 | 9600、19200、38400 bps | 下拉式選單 |
| 通訊格式 | 7E1、8N1、8O1、8E1、8N2 | 下拉式選單 |

控制模式選擇／手動輸出量已搬到主畫面（見上方「主畫面」章節），不在這一頁。

## 網址參數

| 參數 | 用途 |
|------|------|
| `?mock=1` | 直接啟動模擬，四支燈管自動運轉，全部畫面都會有資料 |
| `?debug=1` | 顯示連線診斷面板：判定到的格式、收到／解析行數、最近 50 行原始資料 |

## 模擬模式（Mock）

無硬體時有兩種方式跑假數據：

- 按右上角「啟動模擬」，再逐支打開 Run/Stop 開關
- 網址加參數直接展示：`http://localhost:5173/?mock=1`

模擬器產生的是**與實機相同格式的文字行**，走完整的解析路徑，因此協定解析與指令驗證在模擬模式下都是真的在跑。

| 操作 | 模擬行為 |
|------|----------|
| Run/Stop | 開始加熱往 SV 趨近 / 停止並降回室溫 |
| 設定溫度（送出時走 `SET_MAIN`） | 以新目標溫度控溫，控制模式維持原狀不變 |
| SET_PARAMETER 寫入 AT:1 | 繼電器式振盪調諧約 20 秒，完成後產生一組新 PID |
| 主畫面切手動模式 + 手動輸出量（送出時走 `SET_MAIN`） | 切為手動輸出固定 %（過熱時 STATUS/ALARM 會反映 AL1/HtEr） |

## 通訊協定

PC 與 Arduino 之間的串列協定定義見 [PROTOCOL.md](./docs/PROTOCOL.md)。🚧 該文件目前記錄的是 v4
草案（依韌體工程師 2026-08-17 提供的 pptx 重寫，尚未用實機資料核對過），本分支
（`feature/protocol-v4-migration`）的程式碼是照這份草案實作的；上一個已用實機資料核對過的
版本是 v3（依 README.txt / xlsx 重寫），變更歷史見 [CHANGELOG.md](./docs/CHANGELOG.md)。

解析層是可插拔的（`src/features/serial/protocol/`），格式是整行用括號包住的欄位
`(NUN:0,AL1:50,...,ID:1,...,ALARM:0)`（`parenField23Adapter`）。v3 是 23 欄，v4 草案（🚧 未經
實機驗證）多一個 `SHT` 變 24 欄，同一個 adapter 兩種都吃。若解不出來，用 `?debug=1` 看原始資料。

FOTEK 手冊與韌體端待確認事項見 [DEVICE-CHECKLIST.md](./docs/DEVICE-CHECKLIST.md)。

## 指令驗證

協定沒有 ACK，主要判斷依據是「下一輪回報的值有沒有變成要求值」，`SET_OK`/`SET_ERROR` 回覆行
到的話可以更快確認（見 `docs/PROTOCOL.md`「回覆格式」一節）：

> 🚧 下表是 v4 草案（未經實機驗證）的指令對應，詳見 `docs/PROTOCOL.md`。`SV`/`M_A`/`NUN`
> 收進了 `SET_MAIN`，Run/Stop 按鈕、設定溫度、控制模式/手動輸出量都畫在主畫面（見上方
> pptx slide 1 的版面），三者最後都送 `SET_MAIN`，共用同一組 read-back 驗證狀態。

| 指令 | 驗證方式 |
|------|----------|
| `SET_MAIN`（主畫面的 Run/Stop、設定溫度、控制模式/手動輸出量共用） | 比對回報的 `ON_OFF`/`SV`/`M_A`/`NUN` 四個欄位全部相符才算 |
| `SET_PARAMETER`（原 `SET_SET`） | `INT`/`UNT`/`DP`/`SHT`/`AT`/`TU`/`P`/`I`/`D`/`GAIN`/`AL1`/`AL2` 十二個欄位全部相符才算 |
| `SET_ADVANCED` | 不做 read-back 比對（`newStation`/`RS`/`BPS`/`BIT` 常常沒有要求變更，比對沒有意義），只信任韌體回的 `SET_OK`/`SET_ERROR` |

5 秒內未相符（且沒收到 `SET_OK`/`SET_ERROR`）會標為「裝置未確認，結果未知」——不等於裝置沒
執行，因此不會自動重送。韌體會拒絕執行期間變更 `newID`/`RS`/`BPS`/`BIT`（回 `SET_ERROR`），
所以真的嘗試改這幾項時，畫面會顯示韌體拒絕的說明文字，這是預期行為。

## 技術棧

- Vue 3.5 + Vite 7 + TypeScript（沿用 hrdo_test_platform 前端架構）
- Element Plus / Pinia / UnoCSS
- Vitest（只測協定解析、新鮮度判定、指令比對三塊純函式）
- Web Serial API（需 Chrome / Edge，且為 `localhost` 或 HTTPS）

> 以 Docker 部署時，容器只負責供應靜態檔，串列通訊發生在瀏覽器端，容器不需要存取 USB。
> 但**必須從該台機器開 `localhost`** —— 改用 IP 連入會失去安全來源，Web Serial 直接無法使用。

## 開發

```bash
npm install
npm run dev     # http://localhost:5173
npm run test    # 單元測試
npm run build   # 型別檢查 + 產出 dist/
```

## 專案結構

依業務功能分資料夾（feature-based），跨 feature 共用的東西放 `shared/`：

```
src/
├── app/                        # 應用殼層
│   ├── App.vue                 # 三個畫面（主頁/參數設定/通訊設定）切換
│   ├── router.ts                # 路由設定
│   └── theme.ts                # 深色/淺色主題
├── features/
│   ├── serial/                 # 核心通訊引擎：協定、模擬器、連線、狀態全部同一個 feature
│   │   ├── protocol/           # 格式 adapter 與自動偵測
│   │   ├── connection.ts       # Web Serial 收發，不認識協定內容
│   │   ├── lampState.ts        # 四台狀態、PID、資料新鮮度、站號路由表
│   │   ├── commandTracker.ts   # 指令狀態與 read-back 驗證
│   │   ├── commands.ts         # 指令字串組裝
│   │   ├── simulator.ts        # 模擬器（產生與實機同格式的文字行）
│   │   ├── fakeWebSerial.ts    # ?fakeserial=1 開發用假 navigator.serial
│   │   ├── diagnostics.ts      # 原始資料與解析統計
│   │   ├── constants.ts        # 燈管編號、門檻值、控制範圍
│   │   ├── activeLamp.ts       # 目前選取的燈管（三畫面共用）
│   │   ├── alarmStatus.ts      # STATUS/ALARM 位元遮罩判讀
│   │   ├── types.ts            # LampStatus / LampPid / LampConnection / LampProtocolStatus
│   │   └── store.ts            # Pinia store，把上面組起來
│   ├── dashboard/               # 儀表板主頁
│   │   ├── DashboardPage.vue
│   │   ├── LampCard.vue         # 單支燈管卡片
│   │   └── LampDetailPanel.vue
│   ├── settings/                 # 參數設定畫面（SET_PARAMETER）
│   │   └── SettingsPage.vue
│   └── advanced-settings/        # 通訊設定畫面（SET_ADVANCED）
│       ├── AdvancedSettingsPage.vue
│       └── advancedAccess.ts     # 通訊設定的前端密碼鎖
└── shared/                       # 跨 feature 共用
    ├── components/               # TopBar.vue、LampTabs.vue、SaveBar.vue、DebugPanel.vue（?debug=1，掛在 App.vue 殼層，三個畫面共用）
    ├── utils/
    ├── styles/
    └── settingsShared.ts         # 參數設定/通訊設定共用的 read-back 提示文字
```
