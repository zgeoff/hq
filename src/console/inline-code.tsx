interface InlineCodeProps {
  text: string;
}

// Backticks in any item text render as inline code (the Brief: "Code is code").
export function InlineCode(props: InlineCodeProps) {
  const parts = props.text.split('`');
  return (
    <>
      {parts.map((part, i) => {
        const key = `${i}:${part}`;
        if (i % 2 === 1 && i < parts.length - 1) {
          return <code key={key}>{part}</code>;
        }
        return <span key={key}>{i % 2 === 1 ? `\`${part}` : part}</span>;
      })}
    </>
  );
}
