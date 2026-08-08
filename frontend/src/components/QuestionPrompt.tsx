export const QuestionPrompt = ({
  prompt,
  className = "",
  as = "h1",
}: {
  prompt: string;
  className?: string;
  as?: "h1" | "span";
}) => {
  const blocks = prompt.trim().split(/\n{2,}/);
  const PromptTag = as;
  return (
    <PromptTag className={`min-w-0 ${className}`}>
      {blocks.map((block, index) => (
        <span key={`${index}-${block.slice(0, 20)}`} className={`block whitespace-pre-wrap break-words ${index ? "mt-5" : ""}`}>
          {block}
        </span>
      ))}
    </PromptTag>
  );
};
