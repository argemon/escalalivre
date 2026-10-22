import type { InputHTMLAttributes } from "react";
import { formatDuration } from "../lib/duration";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
};

export function DurationInput({ value, onChange, ...props }: Props) {
  return <input {...props} type="text" placeholder="36:00"
    pattern="[0-9]{1,3}:[0-5][0-9](?::[0-5][0-9])?"
    title="Duração em horas e minutos, por exemplo 36:00. As horas podem passar de 23. Os segundos são opcionais."
    value={formatDuration(value)}
    onFocus={event => { event.currentTarget.select(); props.onFocus?.(event); }}
    onChange={event => {
      const input = event.currentTarget.value;
      const match = /^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/.exec(input);
      onChange(match ? `${match[1].padStart(2,"0")}:${match[2]}:${match[3] ?? "00"}` : input);
    }} />;
}
