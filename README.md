# 觅梦 · Dream Atlas

每一个梦,都值得一幅铜版画。说出昨夜的梦,收下今晨为你镌刻的一页。

**DoubleMi 出品 · Product 002**(品牌无中文名,中文 slogan「另一个你」)。母站在 `~/Documents/kmRyo/doublemi/`,部署到 doublemi.ai;本产品部署到 **dream.doublemi.ai**。全家产品共用同一个 Supabase 项目(一次注册,产品通用;waitlist 表用 `source` 字段区分来源)。

商业化蓝图: `~/Documents/kmRyo/觅梦-商业化蓝图-2026-07.md`(定价、时间线、止损线都在那里)。

## 结构

```
index.html            落地页(双语营销 + 等待名单)
app.html              制版台(镌刻、档案、图案志、保存卡片)
assets/css/atlas.css  设计系统(与 觅 Atelier 同源:墨黑/米白/印章红)
assets/js/
  config.js           ← 唯一需要编辑的文件:Supabase 密钥 + 开关 + 限额
  i18n.js             中英文案
  engraver.js         镌刻引擎:文字 → 确定性参数 → SVG 版画;PNG 导出
  store.js            数据层:云端(Supabase)/ 本地(localStorage)双模式
  entitlements.js     权益层:免费/订阅/创始馆员 的全部限额判断
  analytics.js        漏斗埋点(page_view → engrave_first → card_saved…)
supabase/schema.sql   数据库建表 + 行级安全(在 Supabase SQL Editor 跑一次)
```

**架构约定**(改代码前读这三行):
1. 梦的画面永远由 `art_params` 确定性重现——档案里存参数,不存像素。将来的 AI 生成器只需实现同样的 `artParams / renderArt` 契约。
2. 所有"谁能做什么"的判断只写在 `entitlements.js`;开闸收费那天只改配置和服务端,不改页面代码。
3. 未连接 Supabase 时全站自动本地模式,功能完整,数据在浏览器;登录后本地的版自动迁入账号。

## 本地预览

```bash
open index.html
```

## 连接云端(约 15 分钟)

1. [supabase.com](https://supabase.com) 建免费项目(区域选 Zurich / Frankfurt)
2. Dashboard → SQL Editor → 粘贴 `supabase/schema.sql` → Run
3. Dashboard → Authentication → Sign In / Up:确认 Email 开启(默认开)
4. Dashboard → Authentication → URL Configuration:Site URL 填正式域名
5. Project Settings → API:把 **Project URL** 和 **anon public key** 填进 `assets/js/config.js`
6. 重新部署。完成——注册、云端档案、等待名单、埋点全部生效

## 部署(与主站同法)

1. <https://app.netlify.com/drop> — 把 `dream-atlas` 文件夹拖上去(母站 `doublemi` 文件夹另拖一个站)
2. Domain settings → 本站绑 `dream.doublemi.ai`,母站绑 `doublemi.ai`(**不要**放在 kmryo.com 下)
3. HTTPS 自动

域名注册:`doublemi.ai`(Porkbun/Namecheap,约 $70–90/年)+ `doublemi.ch`(Infomaniak/Hostpoint,约 CHF 10/年,将来 DoubleMi GmbH 主场)。DNS 里 `dream` 子域加 CNAME 指向 Netlify。

## 上线清单(对照蓝图 §5 时间线)

- [ ] Supabase 连接 + 试注册一个账号走通全流程
- [ ] 买域名,部署,绑定;`config.js` 的 `SITE_URL` 改成正式域名
- [ ] 自己连用 7 天(每晨一梦)——第一个用户是你
- [ ] 小红书 / Instagram 发第一张卡片,开始攒名单
- [ ] ⛔ `PAYMENTS_ENABLED` 保持 `false`,直到:Hirslanden 书面批准 + GmbH 设立(蓝图 §5)

## 埋点速查

Supabase → Table Editor → `events`。漏斗:`page_view → waitlist_join / signed_in → engrave_first → engrave(第7夜留存) → card_saved(分享意愿)`。
等待名单在 `waitlist` 表(只有服务端密钥可读)。
