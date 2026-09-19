import type { FlowDefinition } from './types';

/**
 * 内置流程：海岸生态展
 *
 * 三块互动屏：A（迎宾）、B（生态长廊）、C（互动探索）。
 * 自动播放与人工讲解在中途交错：
 *   欢迎(自动) → 安全提示(必看·不可中断) → 潮间带(自动)
 *   → 珊瑚讲解(人工) → 触摸池(互动) → 保护讲解(人工) → 谢幕循环(自动)
 *
 * 「必看安全提示」是必经步骤：不可跳过、不可中断，
 * 任何跳转/恢复路径都会被守卫重定向回这里。
 */
export const coastalFlow: FlowDefinition = {
  id: 'coastal-ecology',
  title: '海岸生态展',
  factLabels: {
    welcomed: '已迎宾',
    'safety-viewed': '已看安全提示',
    'tide-introduced': '已看潮间带介绍',
    'coral-narrated': '已听珊瑚讲解',
    'touchpool-done': '已完成触摸池互动',
    'conservation-narrated': '已听保护讲解',
    'loop-ready': '已就绪循环',
  },
  steps: [
    {
      id: 'welcome',
      title: '欢迎页 · 海岸生态展',
      screen: 'A',
      kind: 'autoplay',
      dwellMs: 6000,
      requires: [],
      grants: ['welcomed'],
      mandatory: false,
      interruptible: true,
      skippable: true,
      body: '潮起潮落之间，生命自成秩序。欢迎走进海岸生态展，请随潮水的方向前行。',
    },
    {
      id: 'safety',
      title: '必看安全提示',
      screen: 'A',
      kind: 'autoplay',
      dwellMs: 8000,
      requires: ['welcomed'],
      grants: ['safety-viewed'],
      mandatory: true,
      interruptible: false,
      skippable: false,
      body: '安全提示：紧急出口位于展厅两侧；请勿触摸活体展品；拍照请关闭闪光灯；儿童需成人陪同。本提示为必看内容，不可跳过、不可中断。',
    },
    {
      id: 'tide-pools',
      title: '自动播放 · 潮间带生态',
      screen: 'B',
      kind: 'autoplay',
      dwellMs: 10000,
      requires: ['safety-viewed'],
      grants: ['tide-introduced'],
      mandatory: false,
      interruptible: true,
      skippable: true,
      body: '自动播放：潮池里的海葵、藤壶与寄居蟹——退潮后依然繁盛的小小世界。',
    },
    {
      id: 'coral-narration',
      title: '人工讲解 · 珊瑚与鱼群',
      screen: 'B',
      kind: 'narration',
      dwellMs: 0,
      requires: ['tide-introduced'],
      grants: ['coral-narrated'],
      mandatory: false,
      interruptible: true,
      skippable: true,
      body: '讲解员接管：珊瑚虫与虫黄藻的共生故事。讲完请触摸屏幕或按「下一步」继续。',
    },
    {
      id: 'touchpool',
      title: '互动 · 触摸池探索',
      screen: 'C',
      kind: 'interactive',
      dwellMs: 0,
      requires: ['coral-narrated'],
      grants: ['touchpool-done'],
      mandatory: false,
      interruptible: true,
      skippable: true,
      body: '互动环节：触摸屏幕，点亮你感兴趣的海岸生物，观察它们的应激反应。',
    },
    {
      id: 'conservation',
      title: '人工讲解 · 保护行动',
      screen: 'C',
      kind: 'narration',
      dwellMs: 0,
      requires: ['touchpool-done'],
      grants: ['conservation-narrated'],
      mandatory: false,
      interruptible: true,
      skippable: true,
      body: '讲解员：从拒用一次性塑料到参与净滩，每个人都能成为海岸的守护者。',
    },
    {
      id: 'finale',
      title: '谢幕 · 循环短片',
      screen: 'A',
      kind: 'autoplay',
      dwellMs: 8000,
      requires: ['conservation-narrated'],
      grants: ['loop-ready'],
      mandatory: false,
      interruptible: true,
      skippable: true,
      body: '感谢参观。短片循环播放中，下一场讲解即将开始。',
    },
  ],
};
