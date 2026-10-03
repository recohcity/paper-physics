// 模型组配置：1键隐藏/显示
export const GROUPS = {
  scene: {
    name: '场景组',
    objects: ['table', 'paper', 'pencil', 'eraser'],
  },
  trebuchet: {
    name: '投石机组',
    objects: ['trebuchetGroup', 'ballStand', 'ropeMesh', 'blockMeshes', 'ballMesh', 'blocksGroup', 'annotations'],
    visible: false, // 当前隐藏
  },
  cradle: {
    name: '牛顿摆组',
    objects: ['cradleGroup', 'cradleCutout'],
    visible: false, // sketch only
  },
};

// tour 步骤映射
export const TOUR_STEPS = ['SKETCH', 'LIFT', 'MODEL', 'MATERIAL', 'PARTS', 'PLAY', 'REPLAY', 'BUILD'];
