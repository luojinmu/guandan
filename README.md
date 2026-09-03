# 掼蛋游戏

手机优先的本地同屏掼蛋游戏（TypeScript + Vite + 纯 TS 规则引擎），计划扩展 Capacitor Android APK 与在线联机（Vercel + Supabase）。

- 需求分析：[掼蛋游戏需求分析.md](./掼蛋游戏需求分析.md)

## 快速开始

```bash
pnpm install
pnpm dev          # 本地开发（http://localhost:5173）
pnpm test         # Vitest 单元测试（当前 100+ 用例）
pnpm typecheck    # TypeScript 类型检查
pnpm build        # 产物输出到 dist/
```

## 代码结构

```
src/
├── rules/        # 规则引擎（纯函数，Web/服务端/App 三端复用）
│   ├── cards.ts      # 牌模型 / 108 张牌组 / 解析 / 排序
│   ├── config.ts     # 规则配置（3.7 配置项：万能牌方案、顺子、连对/钢板限制…）
│   ├── power.ts      # 点数大小（大王>小王>级牌>A>…>2）
│   ├── classify.ts   # 牌型识别（含万能级牌组牌）
│   ├── compare.ts    # 压牌判断（炸弹体系 / 同花顺位置）
│   └── legal.ts      # 合法出牌枚举与提示
├── game/         # 对局状态机（纯逻辑）
│   ├── match.ts      # 整场/单副状态：发牌、级牌、进贡计划
│   ├── tribute.ts    # 进贡 / 还贡 / 抗贡
│   ├── play.ts       # 出牌 / 过 / 接风 / 名次 / 双下早结束
│   ├── settle.ts     # 1.2.3 升级法 / 过 A / 整场胜负
│   └── ai.ts         # 三档 AI（简单/中等/困难）
└── ui/           # 移动优先界面（无框架，同屏多人轮转）
```

## 里程碑

- [x] M1 规则引擎（牌型识别 / 大小比较 / 配置）+ 单元测试
- [x] M2a 对局状态机（发牌 / 出牌 / 贡牌 / 结算 / 过 A）+ 单元测试
- [x] M2b 移动优先可玩界面（同屏 + 可选 AI，本地跑通）
- [ ] M3 体验完善（记牌器 / 动画音效 / 托管细化 / 战绩持久化）
- [ ] M4 手机 APP：Capacitor 打包 Android APK
- [ ] M5 在线联机（Vercel + Supabase）
