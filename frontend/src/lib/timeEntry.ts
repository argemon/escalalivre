import type { InputHTMLAttributes, FormEvent, FocusEvent, KeyboardEvent, ChangeEvent } from "react";
import { formatDuration } from "./duration";

type Options = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">;

export function maskedTimeHandlers(value: string, onChange: (value: string) => void, duration: boolean, props: Options, showSeconds = false) {
  const display = duration ? (showSeconds ? value : formatDuration(value)) || "00:00" : value.slice(0,5) || "00:00";
  const commit = (input: HTMLInputElement, text: string, caret: number) => {
    input.value = text;
    onChange(text.split(":").length === 2 ? text+":00" : text);
    input.setSelectionRange(caret,caret);
    requestAnimationFrame(() => { if (document.activeElement === input) input.setSelectionRange(caret,caret); });
  };
  const insert = (input: HTMLInputElement, digit: string) => {
    let text = display;
    let start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    if (end > start) {
      text = text.split("").map((c,i) => i >= start && i < end && c !== ":" ? "0" : c).join("");
    }
    const colon = text.indexOf(":");
    // At the separator, a duration can gain a third hour digit explicitly.
    if (duration && start === colon && colon < 3) {
      commit(input,text.slice(0,start)+digit+text.slice(start),start+2);
      return;
    }
    if (start === colon) start++;
    if (start >= text.length) return;
    if (start === 0) {
      const hours = colon === 3 ? digit+"00" : digit.padStart(colon,"0");
      commit(input,hours+text.slice(colon),1);
      return;
    }
    if (start === 1 && colon === 2) {
      const hours = Number(text[1]+digit);
      if (!duration && hours > 23) {
        // A single hour digit is complete: 7,3 becomes 07:30.
        if (Number(digit) <= 5) commit(input,text.slice(0,3)+digit+text.slice(4),4);
        return;
      }
      commit(input,text[1]+digit+text.slice(2),3);
      return;
    }
    const segmentStart = text.lastIndexOf(":",start-1)+1;
    if (segmentStart > 0 && start === segmentStart && Number(digit) > 5) {
      commit(input,text.slice(0,start)+"0"+digit+text.slice(start+2),start+2);
      return;
    }
    text = text.slice(0,start)+digit+text.slice(start+1);
    const next = text[start+1] === ":" ? start+2 : start+1;
    commit(input,text,next);
  };
  return {
    value: display,
    onFocus: (event: FocusEvent<HTMLInputElement>) => {
      event.currentTarget.select();
      props.onFocus?.(event);
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      props.onKeyDown?.(event);
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const input = event.currentTarget;
      if (/^\d$/.test(event.key)) {
        event.preventDefault(); insert(input,event.key);
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        let start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? start;
        if (start === end && event.key === "Backspace") { start--; if (display[start] === ":") start--; }
        const text = display.split("").map((c,i) => i >= start && i < (end > start ? end : start+1) && c !== ":" ? "0" : c).join("");
        commit(input,text,Math.max(0,start));
      } else if (event.key === ":") {
        event.preventDefault();
        const next = display.indexOf(":",input.selectionStart ?? 0)+1;
        if (next) input.setSelectionRange(next,next);
      }
    },
    onBeforeInput: (event: FormEvent<HTMLInputElement>) => {
      const data = (event as unknown as {data?: string}).data ?? (event.nativeEvent as InputEvent).data;
      if (data && /^\d$/.test(data)) { event.preventDefault(); insert(event.currentTarget,data); }
    },
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      // Paste, autofill and browser fallbacks must also produce a complete mask.
      const raw = event.currentTarget.value;
      const digits = raw.replace(/\D/g, "");
      const compact = /^\d{4,5}$/.test(raw) ? digits.slice(0,-2)+":"+digits.slice(-2) : raw;
      const match = /^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/.exec(compact);
      if (match && (duration || Number(match[1]) <= 23)) {
        const text = match[1].padStart(2,"0")+":"+match[2]+(match[3] && match[3] !== "00" ? ":"+match[3] : "");
        commit(event.currentTarget,text,text.length);
      } else if (/^\d$/.test(raw)) {
        event.currentTarget.setSelectionRange(0,display.length); insert(event.currentTarget,raw);
      } else {
        event.currentTarget.value = display;
      }
    }
  };
}
