type BrainStage = {
  label: string;
  title: string;
  items: string[];
};

export function BrainModel({
  name,
  title,
  description,
  stages,
  speaks,
  quiet,
}: {
  name: "Regina" | "Wincent";
  title: string;
  description: string;
  stages: [BrainStage, BrainStage, BrainStage, BrainStage];
  speaks: string;
  quiet: string;
}) {
  return (
    <section className="brain-model" data-expert={name.toLowerCase()}>
      <div className="wrap">
        <header className="brain-model__header">
          <div>
            <p className="eyebrow text-[11px]">Inside {name}</p>
            <h2>{title}</h2>
          </div>
          <p>{description}</p>
        </header>

        <div className="brain-model__sequence">
          {stages.map((stage, index) => (
            <article key={stage.label} className="brain-model__stage">
              <p className="brain-model__step">0{index + 1} · {stage.label}</p>
              <h3>{stage.title}</h3>
              <ul>
                {stage.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
          <span className="brain-model__current" aria-hidden />
        </div>

        <div className="brain-model__contract">
          <div>
            <p>When {name} speaks</p>
            <strong>{speaks}</strong>
          </div>
          <div>
            <p>When {name} stays quiet</p>
            <strong>{quiet}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
