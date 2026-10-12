const ROMAN = ["I", "II", "III"];

// Stage badge shared by the classroom and the admin console. The classroom shows
// roman numerals, the admin console the "阶段 N" wording; both color-code the
// background by stage (1 green, 2 blue, 3 purple).
export function PetStageTag({
  stage,
  roman = false,
  className,
}: {
  stage: number;
  roman?: boolean;
  className?: string;
}) {
  return (
    <span className={`pet-stage-tag stage-${stage}${className ? ` ${className}` : ""}`}>
      {roman ? (ROMAN[stage - 1] ?? stage) : `阶段 ${stage}`}
    </span>
  );
}
