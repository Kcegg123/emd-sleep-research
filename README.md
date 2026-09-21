# 一夜之旅 — EMD 與睡眠腦波研究

黃鍔院士 (Norden E. Huang) 的經驗模態分解 (Empirical Mode Decomposition, EMD) 在睡眠 EEG 研究中的應用，做成一個沉浸式互動網站。

## 兩個版本

| 頁面 | 說明 |
|---|---|
| `index.html` | **一夜之旅**：捲動穿越一整夜睡眠的沉浸式版本（Canvas 動畫 + Three.js + Web Audio） |
| `classic.html` | **經典版**：傳統分節式教學網頁（Chart.js） |

## 一夜之旅的內容

1. **Hero** — 自繪的多層腦波動畫
2. **一夜** — 捲動即時間：23:00 → 07:00，EEG 隨 Wake → N1 → N2 → N3 → REM 連續變形，底下同步顯示 δ/θ/α-σ/β 四個頻帶成分與睡眠圖 (hypnogram)
3. **傅立葉的盲點** — 同一段 chirp 訊號，FFT 功率譜 vs. HHT 瞬時頻率的即時對照
4. **篩選** — EMD sifting 的電影式動畫：極值 → 上下包絡 → 均值 → 相減，反覆直到滿足 IMF 條件，可連續提取多個 IMF
5. **分解實驗室** — 調配自己的睡眠腦波並即時分解成 IMF；**聲音化**：每個 IMF 映射為一個音高（×40 進入可聽範圍），振幅包絡取自 Hilbert 轉換；可對單一 IMF 靜音
6. **Hilbert 譜 3D** — 時間 × 頻率 × 能量的 3D 曲面（Three.js，可拖曳旋轉）
7. **IMF ↔ 腦節律對應**、**文獻時間線**

## 技術

純靜態網站，無建置步驟。

- `dsp.js` — 自寫 radix-2 FFT、Hilbert 解析信號、瞬時頻率、睡眠階段訊號合成
- `emd.js` — EMD 演算法（極值偵測、三次樣條包絡、sifting）
- `cyber.js` / `cyber.css` — 一夜之旅的全部互動與樣式
- `hht3d.js` — Three.js 3D Hilbert 譜
- CDN：GSAP（緩動）、Three.js 0.160

## 部署

### Zeabur
連接此 GitHub 倉庫，選擇 Static 類型即可（`zeabur.json` 已設定輸出目錄為根目錄）。

### GitHub Pages
Settings → Pages → 選擇 `main` branch。

## 主要參考文獻

- Huang, N. E. et al. (1998). *Proc. R. Soc. Lond. A*, 454, 903–995 — EMD/HHT 奠基論文
- Causa, L. et al. (2006). Detection of spindles in sleep EEGs using HHT
- Wu, Z. & Huang, N. E. (2009). Ensemble EMD
- Li, Y. et al. (2009). Sleep stage classification based on EEG HHT
- Lajnef, T. et al. (2015). EMD analysis of sleep EEG microstructure
- Lo, C.-C., Bartsch, R. P. & Ivanov, P. Ch. (2018). *Front. Neurosci.*, 12, 809
- Kumar, G. et al. (2024). Automated spindle detection with TEO + EMD

K Lab · 陽明交通大學 · 2026
