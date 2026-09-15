/** The only organism this project is allowed to call official. */
export const CANON = Object.freeze({
  species: "Drosophila melanogaster",
  stage: "adult male",
  dataset: "male-cns:v1.0",
  publisher: "Janelia FlyEM / Cambridge Drosophila Connectomics",
  license: "CC BY",
  source: "https://male-cns.janelia.org/download/",
  officialNeurons: 166700,
  annotatedNeurons: 161839,
  idScheme: "MaleCNS body ID",
  liveSubset: "circuit",
  fullSubset: "full",
  engine: "iff-runtime/1",
  encoder: "sensory-groups/1",
  decoder: "motor-balance/1",
});

export const NOT_CANON = Object.freeze([
  {
    id: "larva-cns:2023",
    why: "Winding 2023 幼虫全脑约 3016 个神经元，科学上完整，但是另一发育阶段。行为是蠕动与翻滚，不是成体趋光/逃逸/飞行。编号与 MaleCNS 不能混用。",
  },
  {
    id: "flywire-fafb",
    why: "成体雌蝇脑，不含腹神经索。本项目要读下行与运动，需要 MaleCNS 的 CNS。",
  },
  {
    id: "iff-neural-16-v1",
    why: "祭坛身份原型。行为启发，不是测量连接组。",
  },
  {
    id: "iff-swarm-lif-v1",
    why: "交易场的占位反射。24 个整数节点，不能写成 MaleCNS。",
  },
]);
