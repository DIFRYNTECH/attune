export default function Today({ state, actions }) {
	const { dailyMessage, myDay } = state;

	return (
		<div className="card myDayCard">
			<h2>🧭 My Day</h2>
			<div className="sub">2-5 tasks is plenty. If you want, you can go up to 10.</div>

			<div className="result" style={{ marginBottom: 12 }}>
				<div className="resultTitle">Your personal note for today</div>
				<p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>
					{dailyMessage?.a}
				</p>
				<p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>
					{dailyMessage?.b}
				</p>
			</div>

			{myDay.length === 0 ? (
				<div className="hint">
					No tasks yet. Use the <b>Activity Picker</b> tab to add a few. You got this!
				</div>
			) : (
				<div className="myDayScroll" aria-label="My Day tasks">
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
				</div>
			)}
		</div>
	);
}
