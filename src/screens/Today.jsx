export default function Today({ state, actions }) {
	const { dailyMessage, myDay } = state;

	return (
		<div className="card">
			<h2>🧭 My Day</h2>
			<div className="sub">2–5 tiny things is plenty. Zero is allowed.</div>

			<div className="result" style={{ marginBottom: 12 }}>
				<div className="resultTitle">Today’s note</div>
				<p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>
					{dailyMessage?.a}
				</p>
				<p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>
					{dailyMessage?.b}
				</p>
			</div>

			{myDay.length === 0 ? (
				<div className="hint">
					No tasks yet. Use the <b>Activity Picker</b> tab to add one gentle option.
				</div>
			) : (
				<ul className="list" aria-label="My Day">
					{myDay.map((t) => (
						<li key={t.id} className={"item" + (t.done ? " done" : "") }>
							<div className="left">
								<input
									type="checkbox"
									checked={!!t.done}
									onChange={(e) => actions.toggleDone(t.id, e.target.checked)}
									aria-label={t.done ? "Mark not done" : "Mark done"}
								/>
								<div>
									<div className="txt">{t.text}</div>
									<div className="small">Small is enough.</div>
								</div>
							</div>
							<button
								type="button"
								className="btn small ghost"
								onClick={() => actions.removeTask(t.id)}
								aria-label="Remove"
							>
								Remove
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
