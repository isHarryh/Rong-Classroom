"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Spin } from "antd";
import { Delete } from "lucide-react";

type UnlockStatus = "idle" | "loading" | "success" | "error";

export function UnlockPanel({
  onSubmit,
  onSuccess,
}: {
  onSubmit: (secret: string) => Promise<string | undefined>;
  onSuccess: () => void;
}) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<UnlockStatus>("idle");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  // Intentionally not cleared on unmount: the popover can close within the success
  // delay, and the parent's handlers must still run or the unlock state is lost.
  const successTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const submit = async (secret: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setStatus("loading");
    try {
      const errorText = await onSubmit(secret);
      if (errorText) {
        setStatus("error");
        setError(errorText);
        setValue("");
        inputRef.current?.focus();
        return;
      }
      setStatus("success");
      successTimer.current = window.setTimeout(onSuccess, 600);
    } finally {
      submittingRef.current = false;
    }
  };
  const press = (digit: string) => {
    if (submittingRef.current || status === "success") return;
    setStatus("idle");
    if (value.length >= 6) return;
    const next = `${value}${digit}`;
    setValue(next);
    if (next.length === 6) void submit(next);
  };
  const clear = () => {
    if (submittingRef.current || status === "success") return;
    setStatus("idle");
    setValue("");
  };
  const backspace = () => {
    if (submittingRef.current || status === "success") return;
    setStatus("idle");
    setValue(current => current.slice(0, -1));
  };
  return (
    <div style={{ width: 280 }}>
      <div className={`unlock-otp ${status}`}>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className={`otp-cell ${focused && index === value.length ? "active" : ""}`}>
            {value[index] ? "•" : ""}
          </div>
        ))}
        <input
          ref={inputRef}
          className="otp-hidden-input"
          value={value}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={event => {
            if (submittingRef.current || status === "success") return;
            setStatus("idle");
            const next = event.target.value.replace(/\D/g, "").slice(0, 6);
            setValue(next);
            if (next.length === 6) void submit(next);
          }}
        />
      </div>
      <div className={`unlock-status ${status}`}>
        {status === "loading" && (
          <>
            <Spin size="small" />
            <span>正在验证…</span>
          </>
        )}
        {status === "error" && <span>{error}</span>}
        {status === "success" && <span>验证成功</span>}
      </div>
      <div className="numpad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit => (
          <Button key={digit} disabled={status === "loading"} onClick={() => press(digit)}>
            {digit}
          </Button>
        ))}
        <Button disabled={status === "loading"} onClick={clear}>
          清空
        </Button>
        <Button disabled={status === "loading"} onClick={() => press("0")}>
          0
        </Button>
        <Button disabled={status === "loading"} icon={<Delete size={15} />} onClick={backspace} />
      </div>
    </div>
  );
}
