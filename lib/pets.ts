// Pet catalog and display constants shared by the classroom and admin UIs.
// Frame files are pre-generated into /public/pets/<species>/s<stage>-f<frame>.png.

export const PET_SPECIES = [
  { id: "cat", name: "猫咪" },
  { id: "fox", name: "狐狸" },
  { id: "rabbit", name: "兔子" },
  { id: "penguin", name: "企鹅" },
  { id: "panda", name: "熊猫" },
  { id: "corgi", name: "柯基犬" },
  { id: "hamster", name: "仓鼠" },
  { id: "parrot", name: "鹦鹉" },
  { id: "hedgehog", name: "刺猬" },
  { id: "deer", name: "鹿" },
  { id: "lion", name: "狮子" },
  { id: "pig", name: "小猪" },
  { id: "owl", name: "猫头鹰" },
  { id: "dragon", name: "小龙" },
  { id: "unicorn", name: "独角兽" },
] as const;

export const PET_STAGE_COUNT = 3;
export const PET_FRAME_COUNT = 3;
export const PET_FPS = 4;
export const DEFAULT_PET_STAGE2_AT = 20;
export const DEFAULT_PET_STAGE3_AT = 40;

export type PetSpeciesId = (typeof PET_SPECIES)[number]["id"];

export function isPetSpecies(input: string): input is PetSpeciesId {
  return PET_SPECIES.some(species => species.id === input);
}

export function petSpeciesName(species: string) {
  return PET_SPECIES.find(item => item.id === species)?.name ?? species;
}

export function petFramePath(species: string, stage: number, frame: number) {
  return `/pets/${species}/s${stage}-f${frame}.png`;
}

export function derivePetStage(growth: number, stage2At: number, stage3At: number) {
  return growth >= stage3At ? 3 : growth >= stage2At ? 2 : 1;
}

export function petStageThreshold(stage: number, stage2At: number, stage3At: number) {
  if (stage <= 1) return 0;
  return stage === 2 ? stage2At : stage3At;
}

// Server-local midnight, used for the once-per-day pet change rule.
export function petDayStart(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
