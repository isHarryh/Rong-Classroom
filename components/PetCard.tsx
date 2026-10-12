"use client";

import { PawPrint } from "lucide-react";
import { PetSprite } from "@/components/PetSprite";
import { PetStageTag } from "@/components/PetStageTag";
import { petSpeciesName } from "@/lib/pets";
import type { Student } from "@/lib/types";

// Pet-mode replacement for StudentChip: shows the pet instead of the balance and
// opens the pet drawer on click. Selection does not exist in pet mode. The
// data-tile-id attribute lets the mode switch morph chips into cards via FLIP.
export function PetCard({
  student,
  animate,
  evolving,
  onClick,
}: {
  student: Student;
  animate: boolean;
  evolving?: boolean;
  onClick: () => void;
}) {
  const pet = student.pet;
  return (
    <button
      type="button"
      data-tile-id={student.id}
      className={`pet-card ${evolving ? "pet-evolve" : ""}`}
      onClick={onClick}
      title={`${student.name} · ${pet ? `${petSpeciesName(pet.species)} · 阶段 ${pet.stage}` : "待选择宠物"}`}
    >
      {pet && <PetStageTag stage={pet.stage} roman className="pet-card-stage" />}
      {pet ? (
        <PetSprite species={pet.species} stage={pet.stage} size={72} animate={animate} />
      ) : (
        <span className="pet-card-empty">
          <PawPrint size={30} />
        </span>
      )}
      <span className="pet-card-name">{student.name}</span>
      <span className="pet-card-species">{pet ? petSpeciesName(pet.species) : "待选择"}</span>
    </button>
  );
}
