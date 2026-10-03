"use client";

import { useState } from "react";
import { Modal } from "antd";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

export type GroupingGroup = { id: string; name: string };
export type GroupingStudent = { id: string; name: string; groupId?: string };

const UNGROUPED_ID = "__ungrouped__";

function StudentTile({ student }: { student: GroupingStudent }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: student.id });
  return (
    <div ref={setNodeRef} className={`grouping-student ${isDragging ? "dragging" : ""}`} {...listeners} {...attributes}>
      {student.name}
    </div>
  );
}

function GroupBlock({
  id,
  name,
  students,
  className = "",
}: {
  id: string;
  name: string;
  students: GroupingStudent[];
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`grouping-block ${className} ${isOver ? "over" : ""}`}>
      <div className="grouping-block-title">
        {name} <span className="muted">· {students.length} 人</span>
      </div>
      <div className="grouping-students">
        {students.map(student => (
          <StudentTile key={student.id} student={student} />
        ))}
        {!students.length && <span className="grouping-empty">拖动学生到此处</span>}
      </div>
    </div>
  );
}

export function GroupingDialog({
  open,
  groups,
  students,
  onClose,
  onMove,
}: {
  open: boolean;
  groups: GroupingGroup[];
  students: GroupingStudent[];
  onClose: () => void;
  onMove: (studentId: string, groupId: string | null) => void;
}) {
  const [activeId, setActiveId] = useState<string>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const activeStudent = activeId ? students.find(student => student.id === activeId) : undefined;
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(undefined);
    const overId = event.over?.id;
    if (overId === undefined || overId === null) return;
    const target = String(overId);
    onMove(String(event.active.id), target === UNGROUPED_ID ? null : target);
  };
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={960}
      title="调整分组"
      styles={{ body: { maxHeight: "62vh", overflowY: "auto" } }}
    >
      <p className="grouping-hint">拖动学生到目标小组，变更将立即保存；拖回「未分组学生」区域可取消分组。</p>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={event => setActiveId(String(event.active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(undefined)}
      >
        <div className="grouping-grid">
          {groups.map(group => (
            <GroupBlock
              key={group.id}
              id={group.id}
              name={group.name}
              students={students.filter(student => student.groupId === group.id)}
            />
          ))}
          <GroupBlock
            id={UNGROUPED_ID}
            name="未分组学生"
            students={students.filter(student => !groups.some(group => group.id === student.groupId))}
            className="ungrouped"
          />
        </div>
        <DragOverlay dropAnimation={null}>
          {activeStudent ? <div className="grouping-student overlay">{activeStudent.name}</div> : null}
        </DragOverlay>
      </DndContext>
    </Modal>
  );
}
