# 紅外線燈管控制模組儀表板

產線四支紅外線燈管（FOTEK NT-48L-RS 溫控器）的單頁監控儀表板。
瀏覽器透過 Web Serial API 與 Arduino 溝通，Arduino 再以 RS-485 (Modbus RTU) 對四台溫控器輪詢與下指令。

## 功能

- 四支燈管即時狀態：目前溫度 PV、設定溫度 SV、輸出百分比 UN、ON/OFF、AT 調諧、STATUS/ALARM 警報 Bit Mask
- 每支燈管獨立的資料新鮮度：5 秒未回報標為「資料已過期」，15 秒標為「失聯」，值會保留但轉灰
- 控制：Run/Stop（`SET_MAIN`）、感測器/警報/PID 設定（`SET_SET`）、通訊與手動輸出設定（`SET_ADVANCED`）
- 指令結果以裝置回報值驗證，送出不等於成功（見下方「指令驗證」）
- 模擬模式：無硬體時可預覽介面與完整操作流程

## 畫面版面規劃

三個畫面共用左側導覽列（主畫面 / 設定 / 進階設定），上方是溫控器 1~4 分頁籤，對應 4 支紅外線燈管。

### 主畫面

- 左側：導覽列；上方：溫控器 1~4 分頁籤；中央：目前選取溫控器的即時狀態顯示區；右側：**燈管位置示意圖**——同時列出 4 支燈管各自的「現在溫度」「現在輸出量」小卡
- 每個溫控器分頁籤旁邊有一個 **ON/OFF 按鈕**（開關該支燈管的溫控器）
- 中央狀態顯示區欄位：

  | 欄位 | 範圍 | 型態 |
  |------|------|------|
  | 現在溫度 | -999 ～ 9999 | 顯示方塊 |
  | 現在輸出量 | 0 ～ 100 (%) | 顯示方塊 |
  | 現在電流值 | 0 ～ 99.99 | 顯示方塊 |
  | 輸出與警報監控 | OUT1、OUT2、AL1、AL2 | 顯示方塊（4 個，各自用顏色表示 ON/OFF；ON = 綠色，OFF = 紅色） |
  | 警報狀態 | FFF、---、HtEr、OhEr | 顯示方塊 |

### 設定畫面

上方同樣是溫控器 1~4 分頁籤，內容分兩區塊：

**感測器設定**

| 欄位 | 選項/範圍 | 型態 |
|------|-----------|------|
| 感測器類型 | Pt、K、J、R、S、T、B、E、N、L | 下拉式選單 |
| 設定溫度 | 0 ～ 100 | 輸入方塊 |
| 溫度單位 | ℃、℉ | 下拉式選單 |
| 小數點 | 無小數、一位小數 | 下拉式選單 |

**PID 設定**

| 欄位 | 範圍 | 型態 |
|------|------|------|
| 自動調諧 | Control、Auto-Tuning | 下拉式選單 |
| 偏移量參數 | 0 ～ 999 | 輸入方塊 |
| P | 0 ～ 999 | 輸入方塊 |
| I | 0 ～ 3999 | 輸入方塊 |
| D | 0 ～ 3999 | 輸入方塊 |
| GAin | 0.0 ～ 9.9 | 輸入方塊 |

### 進階設定畫面

需要管理員密碼才能進入——防呆用（避免操作員誤觸、誤改站號/通訊參數等），不是防未授權存取的安全機制，密碼驗證純粹在前端做。輸入正確一次後永久記在 localStorage，reload、關瀏覽器都不會失效。

**溫控器設定**

| 欄位 | 範圍/選項 | 型態 |
|------|-----------|------|
| 設定站號 | 1 ～ 255 | 輸入方塊 |
| 通訊模式 | RTU、ASCII | 下拉式選單 |
| 通訊速度 | 9600、19200、38400 bps | 下拉式選單 |
| 通訊格式 | 7E1、8N1、8O1、8E1、8N2 | 下拉式選單 |
| 控制模式選擇 | 自動、手動 | 下拉式選單（選「手動」時多顯示 `nUn` 欄位，範圍 0～100） |

`nUn` 規則：手動模式下使用者可輸入（0～100）；自動模式下不開放輸入，固定送 `-1`（輸出值由 PID 自己算，非人為設定）。

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
| SET_SET 寫入 SV | 以新目標溫度自動控溫（並回到自動模式） |
| SET_SET 寫入 AT:1 | 繼電器式振盪調諧約 20 秒，完成後產生一組新 PID |
| SET_ADVANCED 手動模式 + NUN | 切為手動輸出固定 %（過熱時 STATUS/ALARM 會反映 AL1/HtEr） |

## 通訊協定

PC 與 Arduino 之間的串列協定定義見 [PROTOCOL.md](./docs/PROTOCOL.md)（依韌體工程師提供的
README.txt / xlsx 重寫，已用實機資料核對過，變更歷史見 [CHANGELOG.md](./docs/CHANGELOG.md)）。

解析層是可插拔的（`src/features/serial/protocol/`），目前只有一種已確認格式：整行用括號包住
的 23 欄位 `(NUN:0,AL1:50,...,ID:1,...,ALARM:0)`（`parenField23Adapter`）。若解不出來，用
`?debug=1` 看原始資料。

FOTEK 手冊與韌體端待確認事項見 [DEVICE-CHECKLIST.md](./docs/DEVICE-CHECKLIST.md)。

## 指令驗證

協定沒有 ACK，唯一的判斷依據是「下一輪回報的值有沒有變成要求值」：

| 指令 | 驗證方式 |
|------|----------|
| Run/Stop（`SET_MAIN`） | 比對回報的 `ON_OFF`（0=ON/1=OFF） |
| `SET_SET` | AL1/AL2/AT/TU/P/I/D/GAIN/INT/UNT/DP/SV 十二個欄位全部相符才算 |
| `SET_ADVANCED` | RS/BPS/BIT/M_A/NUN 全部相符才算；新站號（`newID`）不比對 |

5 秒內未相符會標為「裝置未確認，結果未知」—— 不等於裝置沒執行，因此不會自動重送。
韌體會拒絕執行期間變更 `newID`/`RS`/`BPS`/`BIT`（回 `SET_ERROR`），所以真的嘗試改這幾項時，
畫面會一直停在「未確認」，這是預期行為，見 `PROTOCOL.md`「安全設計」說明。

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
│   ├── App.vue                 # 三個畫面（主頁/設定/進階設定）切換
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
│   ├── settings/                 # 設定畫面（SET_SET）
│   │   └── SettingsPage.vue
│   └── advanced-settings/        # 進階設定畫面（SET_ADVANCED）
│       ├── AdvancedSettingsPage.vue
│       └── advancedAccess.ts     # 進階設定的前端密碼鎖
└── shared/                       # 跨 feature 共用
    ├── components/               # TopBar.vue、LampTabs.vue、SaveBar.vue、DebugPanel.vue（?debug=1，掛在 App.vue 殼層，三個畫面共用）
    ├── utils/
    ├── styles/
    └── settingsShared.ts         # 設定/進階設定共用的 read-back 提示文字
```
