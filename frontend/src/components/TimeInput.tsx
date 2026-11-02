import type { InputHTMLAttributes } from "react";
import { maskedTimeHandlers } from "../lib/timeEntry";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
};

export function TimeInput({ value, onChange, ...props }: Props) {
  return <input {...props} type="text" inputMode="numeric" placeholder="00:00"
    pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" title="Digite sobre os números da máscara. Use as setas para escolher a posição."
    {...maskedTimeHandlers(value,onChange,false,props)} />;
}
