import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
};

export function TimeInput({ value, onChange, ...props }: Props) {
  return <input {...props} type="text" inputMode="numeric" placeholder="HH:mm"
    pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" title="Digite 4 números, por exemplo 0730 para 07:30"
    value={value.slice(0,5)}
    onFocus={event => { event.currentTarget.select(); props.onFocus?.(event); }}
    onChange={event => {
      const input = event.currentTarget;
      const position = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0,position).replace(/\D/g, "").length;
      const digits = input.value.replace(/\D/g, "").slice(0,4);
      const masked = digits.length > 2 ? digits.slice(0,2)+":"+digits.slice(2) : digits;
      onChange(digits.length === 4 ? masked+":00" : masked);
      const caret = Math.min(masked.length,before+(before > 2 ? 1 : 0));
      requestAnimationFrame(() => { if (document.activeElement === input) input.setSelectionRange(caret,caret); });
    }} />;
}
