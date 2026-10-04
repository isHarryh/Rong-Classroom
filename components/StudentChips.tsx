"use client";

import { StudentChip, type ChipEffect } from "@/components/StudentChip";
import type { Student } from "@/lib/types";

export function StudentChips({
  students,
  selected,
  chipEffects,
  onToggle,
}: {
  students: Student[];
  selected: string[];
  chipEffects: Record<string, ChipEffect>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="student-chips">
      {students.map(student => (
        <StudentChip
          key={student.id}
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
