"use client";

import { PetCard } from "@/components/PetCard";
import { StudentChip, type ChipEffect } from "@/components/StudentChip";
import type { Student } from "@/lib/types";

export function StudentChips({
  students,
  selected,
  chipEffects,
  onToggle,
  petMode = false,
  onOpenPet,
  petAnimations = true,
  evolvingPets,
}: {
  students: Student[];
  selected: string[];
  chipEffects: Record<string, ChipEffect>;
  onToggle: (id: string) => void;
  petMode?: boolean;
  onOpenPet?: (id: string) => void;
  petAnimations?: boolean;
  evolvingPets?: Record<string, boolean>;
}) {
  if (petMode)
    return (
      <div className="pet-chips">
        {students.map(student => (
          <PetCard
            key={student.id}
            student={student}
            animate={petAnimations}
            evolving={Boolean(evolvingPets?.[student.id])}
            onClick={() => onOpenPet?.(student.id)}
          />
        ))}
      </div>
    );
  return (
    <div className="student-chips">
      {students.map(student => (
        <StudentChip
          key={student.id}
          studentId={student.id}
          name={student.name}
          balance={student.balance}
          selected={selected.includes(student.id)}
          effect={chipEffects[student.id]}
          onClick={() => onToggle(student.id)}
        />
      ))}
    </div>
  );
}
