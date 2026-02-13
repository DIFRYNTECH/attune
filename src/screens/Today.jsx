import { useEffect } from "react";
import { summarizeRecentThemes } from "../lib/noteMemory";

export default function Today({ state, actions }) {
	const { dailyMessage, myDay } = state;
	const aiNote = state.aiDailyNote;
	const canUseMemory = !!state?.entitlements?.noteMemory;
	const recentThemes = canUseMemory ? summarizeRecentThemes(state.noteMemory, 10) : [];

	useEffect(() => {
		actions.ensureAiDailyNote?.(state.checkin, state.level, state.today);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const noteTitle = aiNote?.status === "ready" ? aiNote.title : dailyMessage?.a;
	const noteBody = aiNote?.status === "ready" ? aiNote.body : dailyMessage?.b;
	const noteFocus = aiNote?.status === "ready" ? aiNote.focus : "";
	const noteSource = aiNote?.status === "ready" ? "AI" : "Local";

	return (
		<div className="card myDayCard">
			<h2>🧭 My Day</h2>
			<div className="sub">2-5 tasks is plenty. If you want, you can go up to 10.</div>

			<div className="result personalNote" style={{ marginBottom: 12 }}>
				<div className="personalNoteTop">
					<div className="resultTitle">Your personal note for today</div>
					<div className="personalNoteMeta" aria-label="Note source">
						{aiNote?.status === "loading" ? "Personalizing…" : noteSource}
					</div>
				</div>
				<p className="personalNoteTitle">{noteTitle}</p>
				<p className="personalNoteBody">{noteBody}</p>
				{recentThemes.length > 0 && (
					<div className="miniPills" aria-label="Recent themes">
						<div className="miniPill">🧠 Lately: {recentThemes.join(" + ")}</div>
					</div>
				)}
				{!!noteFocus && (
					<div className="miniPills" aria-label="Today focus">
						<div className="miniPill">🎯 {noteFocus}</div>
					</div>
				)}
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
