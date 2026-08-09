import type { SelectOption } from "@/components/ui/select-options";
import { DEFAULT_QUESTION_TIMER_SECONDS } from "../../../shared/domain";

export const DEFAULT_TIMER_SECONDS = DEFAULT_QUESTION_TIMER_SECONDS;
export const QUESTION_TIMER_OPTIONS: SelectOption[] = [
  { value: "60", label: "1 min" },
  { value: "120", label: "2 min" },
  { value: "300", label: "5 min" },
  { value: "600", label: "10 min" },
  { value: "900", label: "15 min" },
];

export const formatQuestionTimer = (seconds: number) => {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
};
