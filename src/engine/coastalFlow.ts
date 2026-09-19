import type { FlowDef } from './types';

/**
 * 「海岸生态展」内置验收流程。
 *
 * 自动播放与人工讲解在中途交错：
 *   0 入口安全提示（强制 required）        auto
 *   1 海岸全景                            auto
 *   2 潮间带讲解（人工）                  manual
 *   3 潮池生物特写                        auto
 *   4 互动触摸池规则（强制 required）     manual
 *   5 触摸池喂食演示（人工）              manual
 *   6 海鸟迁徙地图                        auto
 *   7 结尾 · 保护海岸承诺（普通提示）     auto
 *
 * 前置条件把人工讲解与安全确认串成必经路径：
 *  - 进入「潮间带讲解」前必须看完海岸全景
 *  - 进入「触摸池喂食演示」前必须确认触摸池规则
 * 冷启动 safetyFacts 强制重验：安全确认与规则确认。
 */
export const coastalFlow: FlowDef = {
  id: 'coastal-ecology',
  name: '海岸生态展',
  safetyFacts: ['ack:safety-entry', 'ack:touchpool-rules'],
  screens: [
    {
      id: 'entry-safety',
      index: 0,
      title: '入口 · 安全提示',
      content:
        '欢迎来到海岸生态展。地面湿滑请慢行，互动屏为触摸模式，请勿用力拍打。请先确认安全提示后开始参观。',
      mode: 'auto',
      durationMs: 6_000,
      requires: [],
      prompt: {
        factId: 'ack:safety-entry',
        title: '观展安全须知',
        body: '展区地面可能湿滑；请照看好随行儿童；紧急情况请听从工作人员指引。触摸屏幕继续即表示您已知悉。',
        acknowledgeText: '我已知悉，开始参观',
        required: true,
      },
    },
    {
      id: 'coast-panorama',
      index: 1,
      title: '海岸全景',
      content: '自动播放：从礁石到沙滩的 270° 海岸全景影像，标注潮汐线与防风林带。',
      mode: 'auto',
      durationMs: 8_000,
      requires: ['ack:safety-entry'],
      prompt: null,
    },
    {
      id: 'intertidal-talk',
      index: 2,
      title: '潮间带讲解',
      content: '人工讲解位：讲解员介绍高潮带、中潮带、低潮带的生物分层与适应策略。',
      mode: 'manual',
      durationMs: 15_000,
      requires: ['screen-done:coast-panorama'],
      prompt: null,
    },
    {
      id: 'tidepool-life',
      index: 3,
      title: '潮池生物特写',
      content: '自动播放：藤壶、石鳖、小蟹在退潮后的潮池中活动的微距影像循环。',
      mode: 'auto',
      durationMs: 8_000,
      requires: ['ack:safety-entry', 'screen-done:intertidal-talk'],
      prompt: null,
    },
    {
      id: 'touchpool-rules',
      index: 4,
      title: '互动触摸池 · 规则',
      content: '人工讲解位：讲解员示范「轻触、不抓离水面、先洗手」三条触摸池规则。',
      mode: 'manual',
      durationMs: 12_000,
      requires: ['screen-done:tidepool-life'],
      prompt: {
        factId: 'ack:touchpool-rules',
        title: '触摸池互动规则',
        body: '一、两指轻触，不按压；二、不将生物抓离水面；三、互动前后使用免洗洗手露。确认后方可进入喂食演示。',
        acknowledgeText: '我已理解触摸规则',
        required: true,
      },
    },
    {
      id: 'touchpool-feeding',
      index: 5,
      title: '触摸池喂食演示',
      content: '人工讲解位：讲解员带领观众分批喂食海星与寄居蟹，全程约 90 秒。',
      mode: 'manual',
      durationMs: 15_000,
      requires: ['ack:touchpool-rules'],
      prompt: null,
    },
    {
      id: 'seabird-migration',
      index: 6,
      title: '海鸟迁徙地图',
      content: '自动播放：迁徙季海鸟沿海岸线移动的动态轨迹地图与种群数量变化。',
      mode: 'auto',
      durationMs: 8_000,
      requires: ['screen-done:touchpool-feeding'],
      prompt: null,
    },
    {
      id: 'closing-pledge',
      index: 7,
      title: '结尾 · 保护海岸承诺',
      content: '自动播放：感谢参观，邀请观众留下一句保护海岸的承诺，屏幕循环播放闭幕影像。',
      mode: 'auto',
      durationMs: 6_000,
      requires: ['screen-done:seabird-migration'],
      prompt: {
        factId: 'ack:coast-pledge',
        title: '一起保护海岸',
        body: '带走垃圾、不带走潮间带的一草一贝。留下你的承诺，完成本次参观。',
        acknowledgeText: '留下承诺，完成参观',
        required: false,
      },
    },
  ],
};
