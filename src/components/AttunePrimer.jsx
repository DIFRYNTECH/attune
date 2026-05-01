const PRIMER_STEPS = [
  {
    title: "Check in",
    body: "Tell Attune where you are today.",
  },
  {
    title: "Pick one step",
    body: "Get realistic options that match your energy.",
  },
  {
    title: "Build rhythm",
    body: "Notice what supports you across the week.",
  },
];

export default function AttunePrimer({ className = "", compact = false }) {
  return (
    <section className={"attunePrimer" + (compact ? " compact" : "") + (className ? ` ${className}` : "")} aria-label="How Attune works">
      {PRIMER_STEPS.map((step, index) => (
        <div className="attunePrimerStep" key={step.title}>
          <span className="attunePrimerIndex" aria-hidden="true">{index + 1}</span>
          <span className="attunePrimerCopy">
            <span className="attunePrimerTitle">{step.title}</span>
            <span className="attunePrimerBody">{step.body}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
