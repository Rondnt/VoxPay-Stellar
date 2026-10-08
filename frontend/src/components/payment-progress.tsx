import { Check } from "lucide-react";

export function PaymentProgress({ step }: { step: 0 | 1 | 2 }) {
  return (
    <ol className="steps" aria-label="Progreso del cobro">
      {["Instrucción", "Revisa", "Confirma"].map((label, index) => (
        <li
          key={label}
          className={index < step ? "done" : ""}
          aria-current={index === step ? "step" : undefined}
        >
          <span className="step-circle" aria-hidden="true">
            {index < step ? <Check size={16} /> : index + 1}
          </span>
          <span>
            {index + 1}. {label}
          </span>
        </li>
      ))}
    </ol>
  );
}
