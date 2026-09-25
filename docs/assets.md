# 美术素材记录

## 当前官方品牌果蝇（2026-09-20 确认）

**以 `/colony.html` 的 NFT 卡片果蝇形象为官方品牌风格。** 按用户最新纠正，采用可爱精致的游戏收藏角色：圆润大头、宝石复眼、圆头短触角、糖果珐琅光泽、六足和一对珠光透明翅，避免写实哑光、绒毛和尖刺。后续 X 配图、宣传海报、广告或横幅沿用当前角色。完整规则见 [BRAND.en.md](BRAND.en.md)，已接入根目录 `AGENTS.md`，无需每次重新说明。

- 身体参考：`public/assets/colony-body-v4.png`；该素材刻意无翅，完整形象的翅由 `src/life/colony-portrait.mjs` 绘制。
- 制作时先看当前卡片，将真实素材作为图像参考，不只输入「金色果蝇」。实现与性状规则见 [COLONY-ART.en.md](COLONY-ART.en.md)。
- 旧写实标本、金属赛博果蝇、旧 mascot 和旧宣传图均不能覆盖这项品牌约定。既有素材保留溯源，不因本次宣传任务自动替换站点图标或运行时渲染。

## 旧版生产标本（历史素材）

- 文件：`public/assets/fly-specimen.png`，1536 × 1024。
- 生成方式：内置 `image_gen`，text-to-image，一张全新图像；无上传参考图。
- 历史用途：首页标本、训练舱、早期 NFT 视觉样本；CSS 负责合成、颜色变体与动效。2026-09-20 起，新的宣传果蝇以 Colony 卡片角色为准，不以这张旧图为风格参考。
- 原图未经裁切或像素编辑；卡片只在 CSS 中设置显示范围。
- 没有官方 BNB / Binance 标识，也不表达合作背书。

### 生成提示词

```text
Use case: stylized-concept.
Asset type: production hero creature asset for the IMMORTAL FRUIT FLIES interactive cyberpunk website.
Create a spectacular and anatomically recognizable Drosophila fruit fly floating in a dark void, full body and all wings and legs completely inside the image. Pure BLACK seamless background, no floor, no text, no UI, no border, no frame, no container. Landscape 3:2 composition, fly fills 80% of frame with safe margin, body positioned diagonal from lower-left abdomen to upper-right head, wings spreading broadly upward and sideways. It should be a beautiful rare cybernetic biological specimen viewed through a macro cinema lens. Two large ruby-red compound eyes, small antennae, SIX fine jointed legs, ONE PAIR of transparent iridescent wings with intricate realistic veining. Not a beetle, wasp, mosquito, or dragonfly. Semi-transparent obsidian and amber exoskeleton showing delicate ELECTRIC CYAN neural circuitry glowing inside the thorax and abdomen. Tiny amber-gold biomechanical fastenings on the thorax and a very subtle digital amber patch on abdomen. The insect's natural body silhouette remains unmistakable. Warm amber razor rim light from left, icy cyan edge from right, refined gold hairs and minute organic textures, highly detailed translucent wings. Creature looks alive, poised, intelligent, elegant, strange. Luxury science-fiction museum specimen, crisp high-detail 3D render blended with scientific macro photography, deep blacks with luminous restrained highlights. No colored environment, no sparks outside silhouette, no nebula, no random line graphics behind subject. Background must remain plain pure black to enable screen-blend compositing. Preserve appendages within safe margin. High visual impact, highest polish.
```

## 概念参考

`public/assets/card-direction.png` 是此前生成的三状态卡片视觉方向，仅供设计迭代参考，未用作发行资产。

## 品牌标与社交卡片

- `public/mark/ifs.png`：站点 favicon。
- `public/mark/app.png`：金底 app 图标（含透明通道）。Apple touch / 启动图。
- `public/mark/og.jpg`：不透明 1200×1200 JPEG，给 X / Open Graph。RGBA PNG 会被 X 丢掉。由 `scripts/render-og-card.py` 从 `app.png` 铺金底导出。
- `public/mark/lockup.png`：横版 fly + wordmark。

预览页：`public/mark/preview.html`。

## 字体

Barlow Condensed 500/600、IBM Plex Mono 400/500，从 Google Fonts 的公开字体分发服务取得。字体与对应 OFL 许可证保存在 `public/fonts/`。运行时无需访问外部字体服务。
