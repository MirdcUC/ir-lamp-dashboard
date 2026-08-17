# CHANGELOG

專案沒有使用 git，這份文件手動記錄對通訊協定／核心邏輯有影響的重大變更，方便回溯「為什麼」。

## 2026-08-14（定案）— NUN 確認是韌體端問題，不管送什麼值都被拒絕

修掉 read-back 誤判的 bug（見下一則紀錄）之後，用可信的判斷邏輯重新實測：`NUN` 送 `-1`、送
實際數字，**全部收到 `SET_ERROR(PARAM:NUN,CODE:2)`**，沒有一次成功過。之前偶爾看到的
「已回報」都是前端 bug 造成的假象（見下一則），排除掉那個因素後，現在的結果是一致、可重現的。

**結論：這是韌體端的問題，不是前端可以再查的範圍。** 指令格式本身正確（7 參數、跟 README.txt
一致），其他欄位（`RS`/`BPS`/`BIT`/`controlMode`）都能正常送出且被接受，只有 `NUN` 這個欄位
的驗證邏輯有問題。需要韌體工程師從他們那邊確認 `CODE:2` 判斷 `NUN` 合法性的條件是什麼——連文件
建議的 `-1` 都不接受，懷疑是韌體那邊這段驗證邏輯本身寫錯或還沒做完。

在韌體修好之前，`NUN`（手動輸出量）功能視為已知限制、目前不可用；`store.ts`/
`AdvancedSettingsPage.vue` 暫時維持現狀（送出但預期會被拒絕），不特別做額外處理。

## 2026-08-14（找到真正原因，修掉了）— SET_ADVANCED 的「已回報」是假的，read-back 比對本身有 bug

### 背景

上一則紀錄留下一個謎：同樣送 `NUN:-1`，時而 `SET_OK`、時而 `SET_ERROR`。使用者接著回報一個
關鍵現象：**自動模式（NUN:-1）畫面顯示「裝置已回報 SET_ADVANCED」（confirmed），但手動模式
送實際數字時正確顯示「被裝置拒絕」**。這個不一致本身就是線索。

### 根因

`commandTracker.ts` 對 `setAdvanced` 的 read-back 驗證，比對的是「回報的 `M_A` 有沒有變成
要求值」。但 `SET_ADVANCED` 現在的設計是：`newStation`/`RS`/`BPS`/`BIT` 一律原樣送回去（不要求
變更），送自動模式時 `controlMode` 往往也跟裝置目前狀態一樣（沒有要求變更）——也就是說，**這道
指令本質上常常是「沒有要求任何欄位真的變更」**。這種情況下，下一行狀態回報的 `M_A` 必然「符合」
要求值，跟這道指令有沒有被韌體接受完全無關。所以「自動模式（-1）」那次顯示「已回報」，其實不是
`NUN` 真的成功了，是 read-back 比對被騙了——**背地裡很可能還是 `SET_ERROR`，只是畫面沒讓你看到**。

換句話說：目前為止看到的每一次 `SET_ADVANCED`（不管 NUN 送什麼），實際上可能都被拒絕了，
只是自動模式那幾次被這個 read-back bug 誤判成功。`NUN` 不是「有時候可以有時候不行」，比較可能
是「一直都不行」，只是我們自己的驗證邏輯騙了自己。

### 修正

- `commandTracker.ts` 的 `reportedValues('setAdvanced', ...)` 改成回傳 `null`，`setAdvanced`
  類型完全不做 read-back 比對，只信任 `SET_OK`/`SET_ERROR` 的實際回覆內容
  （`applyResult`）——沒收到明確回覆就一直停在「等待裝置回報」，逾時變成「未確認」，不會再
  被「剛好沒變」的回報行騙成「已確認」。
- `commandTracker.test.ts` 的對應測試改成驗證「即使回報值剛好符合，也不會被判定成功」。

### 現在的結論

`NUN` 目前應該視為**送什麼都會被拒絕**，不是設備隨機時好時壞。如果之後想再驗證，記得看的是
連線診斷面板裡當下那一行的 `SET_OK`/`SET_ERROR`，不要看畫面上的「已回報」/「被拒絕」提示——
自動模式那個提示在這次修正前是不可信的。

## 2026-08-14（推翻上一輪）— NUN:-1 也不保證成功，UI 改回可編輯、拿掉「已確認」的結論

### 背景

上一輪把 NUN 鎖成唯讀、固定送 `-1`，理由是「-1 得到 SET_OK、其他數字都被拒絕」。這次現場再測
一次一模一樣的指令：

```
→ SET_ADVANCED(1,1,0,9600,2,0,-1)
← SET_ERROR(PARAM:NUN,CODE:2)
```

**同一個站號、同樣的 `NUN:-1`，這次被拒絕了。** 跟上一輪「-1 = SET_OK」的結論直接矛盾，代表
上一輪下的「NUN 只接受 -1」這個結論下得太早——當時只有一次成功案例就直接定案，沒有重複驗證。

### 目前的理解

`NUN` 該送什麼值才會通過，還沒找到能重現的規律，可能跟以下因素有關（都還沒排除）：
- 韌體本身這個欄位的驗證邏輯就不穩定/有時序依賴
- 前端 `commandTracker.ts` 的 `SET_OK` 對應是用送出順序的佇列近似猜的（見 `applyResult`
  的說明），如果同時間有其他指令在跑，可能誤把別道指令的 `SET_OK` 算成這道的結果——上一輪
  那次「成功」搞不好根本不是真的

### 修正（撤銷上一輪的鎖定）

- `AdvancedSettingsPage.vue`：NUN 輸入框改回原本的樣子——只有手動模式才顯示、可以輸入
  0~100；不再鎖成唯讀固定 -1。警告文字改成「送出結果不穩定，請對照連線診斷確認實際結果」，
  拿掉「已確認只接受 -1」這個站不住腳的結論。
- `store.ts` 的 `writeAdvanced`：改回接受 `nUn` 參數，自動模式送 `-1`、手動模式送表單值——
  這只是回到最早的假設，不是新答案，兩種都不保證會成功。
- `simulator.ts` 的驗證條件改回「只有自動模式擋非 -1 的值」，跟模擬器最早的行為一致——真實
  韌體這條規則忽好忽壞，模擬器沒辦法重現，只能維持一個簡化過的假設方便練 UI。
- `PROTOCOL.md` 拿掉「已確認」字樣，改成如實記錄「同樣的值一次成功一次失敗，規律未知」。

### 教訓

只靠一次現場測試结果就把結論寫成「已確認」太快了，尤其這種沒有書面文件、全靠現場口頭/單次
實測的規則，至少要重複驗證個兩三次、排除掉時序/佇列誤判的可能性，才能真的定案。之後這種
「單次實測」的發現，措辭上要留一點餘地，不要直接寫「已確認」。

## 2026-08-14（已推翻，見上方）— NUN 不管什麼模式，目前只接受 -1

### 背景

上一輪把 `SET_ADVANCED` 改回 7 參數格式後，現場繼續測 `NUN` 到底該送什麼值。結果：

- `NUN:-1` → 韌體回 `SET_OK`
- `NUN` 送任何其他數字（包含手動模式下想設定的實際輸出值，例如 10）→ 一律
  `SET_ERROR(PARAM:NUN,CODE:2)`

### 結論

目前這個韌體版本**根本不支援透過 `SET_ADVANCED` 設定手動輸出量**——不是「自動模式要送 -1，
手動模式可以送實際值」這種依模式而定的規則，是不管什麼模式都只接受 `-1`。之前 `store.ts` 的
`writeAdvanced` 還留著「手動模式送表單值、自動模式送 -1」的邏輯，這次確認整個沒必要，`NUN`
已知只有一個合法值。

### 修正

- `store.ts` 的 `writeAdvanced`：`nUn` 固定送 `-1`，不再依 `controlMode` 判斷；`params` 型別
  從 `Pick<SetAdvancedParams, 'controlMode' | 'nUn'>` 簡化成只剩 `'controlMode'`——`nUn` 已經
  不是外部能指定的值，型別上不再開放這個欄位，比留著沒用的參數讓人誤會清楚。
- `simulator.ts` 的 `setAdvanced`：驗證條件從「只在自動模式擋 NUN」改成「不管模式，NUN 不是
  -1 就擋」，跟實機行為對齊。
- `AdvancedSettingsPage.vue`：「NUN（手動輸出量）」欄位鎖成唯讀、固定顯示 `-1`，不再依控制
  模式顯示/隱藏可編輯輸入框；表單的 `nUn` 欄位整個拿掉。警告文字加上這個結論。
- `PROTOCOL.md` 的 `SET_ADVANCED` 一節更新，標記為「已確認」而不是「還沒確認」。

### 影響

手動輸出量（NUN）這個功能目前在韌體端還沒做，前端這裡先誠實鎖住、不假裝能用。之後韌體支援了
再回頭把這個欄位改回可編輯。

## 2026-08-14（推翻上一輪，已改回 7 參數）— SET_ADVANCED 的 3 參數版本被證實是錯的

### 背景

下一輪實測結果：3 參數 `SET_ADVANCED(currentID,M_A,NUN)` 送出後（例如 `SET_ADVANCED(1,1,10)`），
韌體回：

```
SET_ERROR(ADVANCED,FORMAT)
```

`FORMAT` 是沒有 `PARAM`/`CODE` 細節的通用格式錯誤——跟 `SET_SET` 那次踩過的坑一樣，代表
**參數數量不對**。這證實上一輪「改成 3 參數」的判斷是錯的。

### 重新梳理兩次實測結果

- 7 參數版本（`newID`/`RS`/`BPS`/`BIT` 照現況原樣送回去，只改 `M_A`/`NUN`）：被拒絕，但錯誤
  是 `SET_ERROR(PARAM:NUN,CODE:2)`——**帶 PARAM/CODE 細節**，代表指令格式本身有被正確解析，
  只是 `NUN` 這個值被判定不合法。
- 3 參數版本：被拒絕，錯誤是 `SET_ERROR(ADVANCED,FORMAT)`——**沒有細節的通用格式錯誤**，
  代表參數數量錯了。

兩相對照，**7 參數才是韌體實際期待的格式**（也剛好跟 README.txt 文件一致）。上一輪看到 7 參數
版本被拒絕，就直接假設「一定又是參數數量問題」跳去猜 3 參數，這一步跳太快、判斷錯了——沒有先
確認錯誤訊息的形狀（有沒有 PARAM/CODE）就選了錯的修法方向。真正的問題出在 `NUN` 這個值本身，
不是參數數量，目前這個問題還沒解決。

### 修正（改回 7 參數，撤銷上一輪的簡化）

- `commands.ts`：`commandText.setAdvanced` 改回組 7 個參數；`COMMAND_FIELD_NAMES.SET_ADVANCED`
  改回 7 個欄位名稱；`SetAdvancedParams`／`lockedAdvancedFields` 的說明更新，把「兩次實測的
  錯誤訊息形狀不同」這個判斷依據寫進去，避免以後又忘記為什麼是 7 個。
- `store.ts` 的 `writeAdvanced`：改回組完整的 7 欄位 `outgoing`（`newStation`/`commMode`/
  `baudRate`/`format` 繼續用 `lockedAdvancedFields` 算「維持不變」的值，`controlMode`/`nUn`
  才是表單來的）。
- `AdvancedSettingsPage.vue` 的警告文字改回「這四項會被拒絕，所以原樣送回去、不要求變更」，
  拿掉「這四項根本不會出現在指令裡」這句已經證實錯誤的說法。
- `PROTOCOL.md`／`commands.test.ts` 同步改回 7 參數版本的內容，並記錄這次判斷錯誤的過程，
  提醒之後看到 `SET_ERROR` 要先看有沒有 `PARAM`/`CODE`，再決定往「數量」還是「數值」的方向查。

### 尚未解決的事（下一步要查的）

`NUN` 在 `M_A:0`（自動）送 `0` 或 `-1` 都被 `CODE:2` 拒絕，`M_A:1`（手動）送實際輸出值是否會
被接受還沒測過。這是接下來要優先查的問題，跟參數數量已經沒有關係。

## 2026-08-14（已推翻，見上方）— SET_ADVANCED 改成只送 3 參數（currentID/M_A/NUN）

### 背景

韌體工程師到現場當面說明：`SET_ADVANCED` 只有「控制模式選擇」（M_A）跟「NUN」可以設定，
其他參數不能帶，不然會被擋住。一開始的理解是「這幾項不能要求變更，但位置還是要在」，於是把
`newID`/`RS`/`BPS`/`BIT` 改成一律照這支燈管**目前**回報的值原樣送回去（見前一輪「鎖定唯讀
欄位」的改動）——實測送出：

```
SET_ADVANCED(1,1,0,9600,2,1,100)
currentID=1, newID=1, RS=0, BPS=9600, BIT=2, M_A=1, NUN=100
```

`newID`/`RS`/`BPS`/`BIT` 都跟目前值相同，理論上沒有要求變更，但**還是被裝置擋下來**。

### 根因（現場口頭確認，非書面文件）

證實「其他參數不能帶」不是「這幾項不能變」，是**這幾個位置根本不該出現在指令裡**。這跟
`SET_SET` 那次踩過的坑同一個模式：文件寫的格式（README.txt 的 7 參數版本）跟韌體實際吃的
格式不一樣。改成只送 `SET_ADVANCED(currentID,M_A,NUN)` 3 參數。

### 修正

- `commands.ts`：`commandText.setAdvanced` 改成只組 3 個參數；`SetAdvancedParams` 裡的
  `newStation`/`commMode`/`baudRate`/`format` 改為純顯示用途，不再出現在送出的指令字串裡；
  `COMMAND_FIELD_NAMES.SET_ADVANCED`（給 `describeCommand` 用）同步改成 3 個欄位名稱。
- `store.ts` 的 `writeAdvanced`：不再組 7 參數的 `outgoing`，直接送 `{controlMode, nUn}`；
  read-back 的 `expected` 陣列從 5 個欄位（RS/BPS/BIT/M_A/NUN）簡化成 1~2 個（M_A、NUN）。
- `commandTracker.ts` 的 `reportedValues('setAdvanced', ...)` 同步從 `[RS,BPS,BIT,M_A,NUN]`
  改成 `[M_A,NUN]`——這是必須跟著改的地方，順序對不上 `expected` 會比錯位置，之前這裡沒改
  差點變成一個隱藏的迴歸。
- `AdvancedSettingsPage.vue` 的警告文字更新，講清楚「這四項連原樣送回去都會被拒絕」而不是
  「這四項不能要求變更」。
- `PROTOCOL.md` 的 `SET_ADVANCED` 一節、`commands.test.ts`／`commandTracker.test.ts`／
  `pipeline.test.ts` 同步更新。

### 尚未確定的事

這是韌體工程師現場口頭講的，不是書面文件，也還沒有完整測過各種組合（例如手動模式下改 NUN
是否真的能成功、`SET_OK`/`SET_ERROR` 這次會不會正常對應）。等使用者用真實硬體測過再回頭確認。

## 2026-08-14（已確認）— STATUS 的 AL1/AL2 位元位置跟文件不一樣

### 背景

韌體工程師回報：AL1 設定 30 度、現在溫度 31 度，照理應該觸發警報，但沒亮燈。一開始懷疑是控制器
`ALT`（警報模式）設定的問題（`ALT` 本來就不在 23 欄位協定裡，見下面「AL1」條目的既有說明）；但
使用者接著回報實測到的 `STATUS` 數值：只有 AL1 亮燈是 `256`，只有 AL2 亮燈是 `4096`，兩個都亮是
`4352`。

### 根因

```
256  = 0x100  = bit 8   ← AL1
4096 = 0x1000 = bit 12  ← AL2
4352 = 256 + 4096 = 0x1100
```

三個數字對得剛剛好，證實還是單純的位元相加（bitmask）邏輯沒有變，**只是 AL1/AL2 實際用的位元
位置，跟 xlsx / README.txt 文件寫的 `0x04`（bit 2）/`0x08`（bit 3）完全不同**，實際是 bit 8 跟
bit 12，中間差一個 nibble。也就是說，上一輪「AL1 沒亮燈」的現象根本不是韌體 `ALT` 設定的問題，
是我們的程式碼照文件的位元定義去檢查，兩邊對不上號。

### 修正

`alarmStatus.ts` 的 `STATUS_BITS.AL1`/`AL2` 從 `0x0004`/`0x0008` 改成 `0x0100`/`0x1000`。
`LampCard.vue`／`LampDetailPanel.vue` 的警報燈都是讀這個常數判斷，不用另外改。

`OUT1`/`OUT2`（文件寫 0x01/0x02）跟 `ALARM` 欄位（FFF/---/HtEr/OhEr）目前都還沒有實機資料能
驗證，可能有同樣的位元錯位問題，先維持文件原樣，待之後有資料再確認。

## 2026-08-14（已確認可行）— SET_SET 加回 M_A，因為韌體回了 `SET_ERROR(SET,FORMAT)`

### 背景

上面「加了 SET_OK/SET_ERROR adapter」之後，改測 `SET_SET`（設定畫面，跟 NUN 完全無關），韌體回：

```
SET_ERROR(SET,FORMAT)
```

這不是 `SET_ERROR(PARAM:...,CODE:...)` 那種帶細節的格式，是 README.txt 說的另一種
「不帶參數細節」的通用錯誤，內容是 `SET,FORMAT`——研判是「SET 指令、格式（參數數量）不對」。

### 發現：README.txt 裡 SET_SET 自己就有兩種矛盾的參數列

- 開頭「架構總覽」段落（給人看整體流程用）：
  `SET_SET(currentID,AL1,AL2,AT,TU,P,I,D,GAIN,INT,UNT,DP,M_A,SV)` —— **14 參數，含 M_A**
- 後面「已確認」的詳細規格（文件裡特別寫「M_A 已移除」）：
  `SET_SET(currentID,AL1,AL2,AT,TU,P,I,D,GAIN,INT,UNT,DP,SV)` —— **13 參數，不含 M_A**

先前的重寫是照後面那份「已確認」版本做的（13 參數）。這次的 `FORMAT` 錯誤，加上「參數數量對不上」
最直接的解讀，指向**目前實際跑的韌體可能還是吃舊的 14 參數格式**，文件裡「已移除」那句話還沒真的
同步到韌體端。

### 已改的地方（實驗性，等使用者用真實硬體測過才能定案）

- `commands.ts`：`commandText.setSet` 加回第三個參數 `controlMode`（M_A），組出 14 參數的指令，
  位置在 `DP` 跟 `SV` 中間（照舊格式順序）。`SetSetParams` 本身不變（設定畫面不需要自己管這個
  欄位）。
- `store.ts` 的 `writeSet`：`controlMode` 直接讀這支燈管目前回報的 `M_A`，原樣送回去，不改變
  自動/手動模式，也不需要改設定畫面的表單。
- `commandTracker.ts` 的 `setSet` read-back 比對，比對欄位從 12 個補成 13 個（含 `M_A`）。
- `fakeWebSerial.ts`／測試檔案同步更新解析索引。

### 結果

使用者實測確認：加回 `M_A` 之後 `SET_SET` 成功了（韌體回 `SET_OK(SET,ID:N)`）。判斷正確，
14 參數才是目前韌體實際吃的格式；`PROTOCOL.md`／`commands.ts` 的說明可以拿掉「待確認」字樣了。

## 2026-08-14（再追加）— 自動模式下 NUN 一定要送 -1，否則整道 SET_ADVANCED 被韌體拒絕

### 症狀

修完 BPS 索引那個 bug 之後，SET_ADVANCED 還是一直卡在「裝置未確認」。使用者這次貼出實機的原始收
發紀錄，裡面直接看到韌體回了一行：

```
16:01:54  SET_ERROR(PARAM:NUN,CODE:2)
```

前後對照時間戳，這行剛好接在使用者送出 SET_ADVANCED 之後——不是「送了但沒被確認」，是韌體**直接
拒絕**這道指令，read-back 當然永遠比對不到，因為根本沒被接受。

### 根因

畫面.md（v2 版規格）原本就有一條規則：自動模式下 `nUn` 要固定送 `-1`（代表「不適用」）。上一輪重寫
時，因為 2026-08-14 收到的實機**回報**行在自動模式下顯示的是 `NUN:0` 不是 `-1`，我判斷 v3 版
（README.txt/xlsx）已經取消這條規則，把 `AdvancedSettingsPage.vue` 裡強制清成 -1 的邏輯整個拿掉了。

這個判斷只對了一半：`NUN:0` 是**回報**時觀察到的顯示值，不代表**寫入**規則也跟著變了。這次的
`SET_ERROR(PARAM:NUN,CODE:2)` 證實：寫入 `SET_ADVANCED` 時，自動模式（`M_A:0`）如果照回報值原樣
送 `NUN:0`，韌體視為不合法值直接拒絕——v2 的「自動模式必須送 -1」這條寫入規則，在 v3 底下依然成立，
只是回報行的顯示語意不同（回報永遠是 0，不因為你曾經送過 -1 而變成 -1）。這是兩件不同的事，上次
重寫沒有分清楚。

### 修正

- `store.ts` 的 `writeAdvanced` 新增覆寫邏輯：`controlMode !== 1`（自動）時，不管表單上的 `nUn`
  是什麼，一律送 `-1`；只有手動模式才照使用者輸入的 0~100 送出。
- read-back 的 `expected` 陣列同步處理：自動模式下**不比對** `NUN`（陣列直接少一個元素，
  `commandTracker.ts` 的比對邏輯本來就是比到 `expected` 給的長度為止，不用另外改程式）——因為
  目前沒有實機資料能證實「送 -1 成功後，回報行的 NUN 會不會變成 -1」，貿然假設比對反而可能製造新的
  假性「未確認」。
- `AdvancedSettingsPage.vue`／`commands.ts`／`PROTOCOL.md` 的相關註解一併更新，把「回報顯示值」跟
  「寫入必須送的值」分開講清楚，避免以後又混在一起判斷。

### 覆蓋範圍與限制

這次沒有新增自動化測試——覆寫邏輯放在 `store.ts`（Pinia store，依賴 `ElMessage` 等外部服務），
跟專案現有的測試範圍（`protocol/adapters`、`lampState`、`commandTracker`、`simulator` 等純邏輯）
不同層級，性質上更接近少數 UI 整合邏輯，目前用型別檢查 + 手動核對 README.txt 範例把關。

`SET_ERROR` 目前仍未被 decoder 解析（見上一輪紀錄「尚未實作」），這次是使用者直接讀原始資料流才
看到錯誤訊息；之後若要在 UI 上即時顯示「被韌體拒絕」而不是永遠停在「未確認」，需要另外實作
`SET_ERROR`/`SET_OK` 的 adapter。

## 2026-08-14（追加）— 修正 SET_ADVANCED 的 BPS 送成下拉選單索引，導致 read-back 永遠比對不到

### 症狀

進階設定畫面按「儲存」後，指令提示一直停在「裝置未確認 SET_ADVANCED，結果未知」，即使沒有改任何欄位、
連線/模擬都正常。

### 根因

v3 重寫時把 `SET_ADVANCED` 的 `BPS`（通訊速度）誤當成跟 `RS`/`BIT`/`M_A` 一樣的「下拉選單索引」
（0/1/2 代表 9600/19200/38400）。但 README.txt 的指令範例 `SET_ADVANCED(1,1,0,9600,2,0,0)`
第 4 個參數直接是 `9600`，不是索引 `0`；回報行的 `BPS:9600` 也是實際 bps，不是索引。也就是說
`BPS` 這個欄位不論送出還是回報都是「實際 bps」，跟其餘幾個索引編碼的欄位不一樣。

`commands.ts` 組指令字串時把 UI 的下拉索引（例如 `0`）直接塞進 `SET_ADVANCED` 的 BPS 位置，
韌體／模擬器收到的其實是 `SET_ADVANCED(1,1,0,0,2,0,0)`（BPS=0，不是 9600），跟廣播行回報的
`BPS:9600` 永遠對不上；`commandTracker.ts` 比對用的期望值也同樣是索引 `0`，同一個 bug 在
read-back 驗證那邊又中了一次，兩邊都錯導致「怎麼等都不會 confirmed」。

### 修正

- 新增 `constants.ts` 的 `BAUD_RATE_VALUES = [9600, 19200, 38400]` 作為索引 ↔ 實際 bps 的唯一對照表。
- `commands.ts` 的 `commandText.setAdvanced` 送出前把 `params.baudRate`（索引）轉成實際 bps 再組字串。
- `store.ts` 的 `writeAdvanced` 用來跟 read-back 比對的 `expected` 陣列，同樣改成用實際 bps。
- `simulator.ts`／`AdvancedSettingsPage.vue` 原本各自寫一份 9600/19200/38400 的對照表，改成都讀
  `BAUD_RATE_VALUES`，避免以後又有地方漏改、三份表各轉一次、又轉出不一致的結果。
- 新增 `commands.test.ts` 直接鎖住 `SET_ADVANCED` 組出來的指令字串（對照 README.txt 範例），以及
  `pipeline.test.ts` 一個端對端案例（送索引 1，回報行要看到 `BPS:19200`），防止這個方向的迴歸。

### 影響範圍

只有 `SET_ADVANCED` 的通訊速度欄位。`RS`（通訊模式）、`BIT`（資料格式）、`M_A`（自動/手動）本來
就是索引編碼、送出與回報一致，沒有這個問題；`SET_SET`、`SET_MAIN` 也不受影響。

## 2026-08-14 — 通訊協定改依 README.txt / xlsx 重寫（v2 → v3）

### 觸發原因

韌體工程師提供了兩份新資料：`README.txt`、`NT48L_RS_23項通訊欄位規格表.xlsx`。內容跟當時
程式碼依據的 `產線/紅外線控制模組_畫面.md`（27 欄、不加括號、含電流欄位）不一致。

比對後決定以哪份為準，關鍵證據是使用者在主系統上實際收到的一行資料：

```
14:36:03(NUN:0,AL1:50,AL2:50,AT:0,TU:0,P:6,I:120,D:30,GAIN:1.0,INT:1,UNT:0,DP:0,ID:1,RS:0,BPS:9600,BIT:2,ON_OFF:0,M_A:0,SV:0,PV:29,UN:0,STATUS:0,ALARM:0)
```

（`14:36:03` 是終端機自己加的時間戳，不是協定內容）逐欄位核對後確認：這行資料是 23 欄、括號
包住、`ID` 全大寫，跟 README.txt / xlsx 的定義完全吻合，跟畫面.md 的 27 欄格式完全對不上——舊的
兩個 adapter（`idPrefixedAdapter`／`mergedLineAdapter`）連 `match()` 都過不了，等於接上真實硬體
會整排空白。因此決定整套改依 README.txt / xlsx 重寫，畫面.md 的通訊協定部分（第 4、5 節）標記
為過期。

### 主要差異（v2 → v3）

- 回報格式：27 欄逗號分隔 → 23 欄整行括號包住 `(...)`。
- `STATUS`/`ALARM`：從 4 個獨立 0/1 欄位 + 一個未確認索引對應的 `Status_of_Alarm`，改成兩個
  明確定義的 Bit Mask（`STATUS` 0x1/0x2/0x4/0x8=OUT1/OUT2/AL1/AL2，`ALARM`
  0x1/0x2/0x4/0x8=FFF/---/HtEr/OhEr）。
- 新增 `AL1`/`AL2`（警報門檻設定值），畫面.md 版本沒有這兩個欄位。
- 移除電流相關欄位（`Ctu`/`HB`/`CtL`/`Cth`）與 UI 上的「電流設定」卡片——新協定完全沒有電流。
- `SET_SET` 參數列：13 個位置參數，含 AL1/AL2，不含電流；跟舊版（11 個，不含 AL1/AL2）不同。
- `SET_ADVANCED` 參數列：7 個位置參數（含 `newID`，可指定新站號），不含電流；跟舊版（9 個，
  含電流三欄，且只有一個站號參數）不同。
- 指令格式：逗號改回括號，`SET_MAIN(1,0)` 而非 `SET_MAIN,1,0`。
- `BIT`（RS-485 資料格式）下拉選單新增 `7O1`（索引 0），修正原本畫面.md 版本漏掉這個選項、
  造成索引整組錯位一格的問題。
- `NUN`（手動輸出量）：拿掉「自動模式固定 -1」的規則。理由：上面那行實機資料裡
  `M_A:0`（自動模式）同時 `NUN:0`，不是 -1，證明 README.txt 定義的「NUN 就是 0~100，沒有 -1
  例外」才是實際行為。
- `run` 指令的 read-back 比對：`ON_OFF` 是 0=ON/1=OFF，跟舊的 `run`（1=運轉）方向相反；
  `store.ts` 的 `setRun` 原本沿用 `run` 的方向送期望值，這次一併修正，否則 Run/Stop 的
  指令狀態會永遠顯示「未確認」。
- Baud rate：`constants.ts` 的 `BAUD_RATE` 已改成 9600（README.txt 明確標示 PC↔Master 是
  `Serial 9600`）。

### 已知的協定行為，程式尚未跟進

- README.txt 定義了 `SET_OK`/`SET_ERROR` 回覆行，但目前的 decoder 沒有對應的 adapter 去解析，
  這兩種回覆會被當成無法辨識的雜訊。指令是否被韌體拒絕，目前仍只能靠「read-back 一直不確認」
  間接推斷。見 `PROTOCOL.md`「回覆格式（尚未實作解析）」一節。
- README.txt 的「安全設計」段落說明：執行期間若透過 `SET_ADVANCED` 要求變更
  `newID`/`RS`/`BPS`/`BIT`，韌體會回 `SET_ERROR` 拒絕，不會真的改掉。`AdvancedSettingsPage.vue`
  的欄位仍開放編輯（UI 沒有鎖住），只加了提示文字；沒有解析 `SET_ERROR` 前，UI 端無法主動擋下
  這類必然失敗的操作。

### 改動範圍

`types.ts`／`constants.ts`／`protocol/adapters.ts`／`protocol/index.ts`／`lampState.ts`／
`commands.ts`／`alarmStatus.ts`／`commandTracker.ts`／`simulator.ts`／`store.ts`／
`fakeWebSerial.ts`，以及對應的測試檔案（`protocol/adapters.test.ts`／`lampState.test.ts`／
`commandTracker.test.ts`／`pipeline.test.ts`）與 UI（`LampCard.vue`／`LampDetailPanel.vue`／
`SettingsPage.vue`／`AdvancedSettingsPage.vue`）。同時移除了只對應舊格式、且沒有任何畫面在呼叫
的死碼（`setSv`/`setOut`/`setAt`/`setPid`/`getPid` 等個別指令、`LampPid`/舊版 `LampStatus` 型別）。

`PROTOCOL.md` 已整份改寫並附修訂紀錄表；`產線/紅外線控制模組_畫面.md` 在文件開頭加註「通訊協定
部分已過期」，畫面版面規劃（第 1~3 節）仍視為有效參考；`DEVICE-CHECKLIST.md` 的欄位對照與 G 節
一併更新。
