import { PEN_COLORS, type Background, type Panel, type Tool } from "./model";

const BACKGROUND_OPTIONS: { value: Background; label: string }[] = [
  { value: "black", label: "纯黑" },
  { value: "white", label: "纯白" },
  { value: "blackGrid", label: "黑带灰网格" },
  { value: "whiteGrid", label: "白带灰网格" },
];

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueLabel?: string;
  onChange: (value: number) => void;
  onCommit?: () => void;
}

function RangeSlider({ label, min, max, step, value, valueLabel, onChange, onCommit }: RangeSliderProps) {
  return (
    <label className="blackboard-slider">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
      {valueLabel !== undefined && <span className="blackboard-value">{valueLabel}</span>}
    </label>
  );
}

interface BlackboardToolbarProps {
  panel: Panel;
  tool: Tool;
  color: string;
  strokeWidth: number;
  background: Background;
  transparency: number;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (tool: Tool) => void;
  onSelectPanel: (panel: Panel) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onBackgroundChange: (background: Background) => void;
  onTransparencyPreview: (value: number) => void;
  onTransparencyCommit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onNew: () => void;
  onSave: () => void;
  onOpen: () => void;
  onExport: () => void;
}

export function BlackboardToolbar(props: BlackboardToolbarProps) {
  let secondary = null;
  if (props.panel === "pen") {
    secondary = (
      <div className="blackboard-toolbar">
        <div className="blackboard-colors">
          {PEN_COLORS.map(value => (
            <button
              key={value}
              type="button"
              className={value === props.color ? "color-swatch active" : "color-swatch"}
              style={{ backgroundColor: value }}
              aria-label={`颜色 ${value}`}
              onClick={() => props.onColorChange(value)}
            />
          ))}
        </div>
        <span className="blackboard-separator" />
        <RangeSlider label="粗细" min={1} max={20} step={1} value={props.strokeWidth} onChange={props.onWidthChange} />
      </div>
    );
  } else if (props.panel === "eraser" || props.panel === "line") {
    secondary = (
      <div className="blackboard-toolbar">
        <RangeSlider label="粗细" min={1} max={20} step={1} value={props.strokeWidth} onChange={props.onWidthChange} />
      </div>
    );
  } else if (props.panel === "background") {
    secondary = (
      <div className="blackboard-toolbar">
        {BACKGROUND_OPTIONS.map(option => (
          <button
            key={option.value}
            type="button"
            className={props.background === option.value ? "active" : ""}
            onClick={() => props.onBackgroundChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  } else if (props.panel === "transparency") {
    secondary = (
      <div className="blackboard-toolbar">
        <RangeSlider
          label="透明度"
          min={0}
          max={90}
          step={5}
          value={props.transparency}
          valueLabel={`${props.transparency}%`}
          onChange={props.onTransparencyPreview}
          onCommit={props.onTransparencyCommit}
        />
      </div>
    );
  }

  return (
    <>
      {secondary}
      <div className="blackboard-toolbar">
        <button
          type="button"
          className={props.tool === "pen" ? "active" : ""}
          onClick={() => props.onSelectTool("pen")}
        >
          画笔
        </button>
        <button
          type="button"
          className={props.tool === "eraser" ? "active" : ""}
          onClick={() => props.onSelectTool("eraser")}
        >
          橡皮
        </button>
        <button
          type="button"
          className={props.tool === "line" ? "active" : ""}
          onClick={() => props.onSelectTool("line")}
        >
          直线
        </button>
        <span className="blackboard-separator" />
        <button
          type="button"
          className={props.panel === "background" ? "active" : ""}
          onClick={() => props.onSelectPanel("background")}
        >
          背景
        </button>
        <button
          type="button"
          className={props.panel === "transparency" ? "active" : ""}
          onClick={() => props.onSelectPanel("transparency")}
        >
          透明度
        </button>
        <span className="blackboard-separator" />
        <button type="button" disabled={!props.canUndo} onClick={props.onUndo}>
          撤销
        </button>
        <button type="button" disabled={!props.canRedo} onClick={props.onRedo}>
          重做
        </button>
        <span className="blackboard-separator" />
        <button type="button" onClick={props.onNew}>
          新建
        </button>
        <button type="button" onClick={props.onSave}>
          保存
        </button>
        <button type="button" onClick={props.onOpen}>
          打开
        </button>
        <button type="button" onClick={props.onExport}>
          导出
        </button>
      </div>
    </>
  );
}
