import { useEffect, useState } from "react";
import InfoTip from "../components/InfoTip";
import { getTodayEmptyStateCopy } from "../lib/personalization";

export default function Today({ state, actions }) {
	const { dailyMessage, myDay } = state;
	const aiNote = state.aiDailyNote;
	const [noteExpanded, setNoteExpanded] = useState(false);
	const emptyStateCopy = getTodayEmptyStateCopy(state?.profile?.name);

	useEffect(() => {
		actions.ensureAiDailyNote?.(state.checkin, state.level, state.today);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const noteIsAi = aiNote?.status === "ready";
	const noteIsLoading = aiNote?.status === "loading";
	const noteTitle = noteIsAi ? aiNote.title : dailyMessage?.a;
	const noteBody = noteIsAi ? aiNote.body : dailyMessage?.b;
	const noteSource = noteIsLoading ? "Personalizing…" : noteIsAi ? "AI" : "On-device";
	const canToggleNote = (noteBody || "").length > 180;

	return (
		<div className="card myDayCard">
			<h2 className="myDayHeading">🧭 My Day</h2>
			<div className="sub">Aim for 2-5 tasks. You can add up to 10 if you’d like.</div>

			<div className="result personalNote" style={{ marginBottom: 12 }}>
				<div className="personalNoteTop">
					<div style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
						<div className="resultTitle" style={{ margin: 0 }}>
							Personal note
						</div>
						<InfoTip label="About Personal note">
							AI notes are generated from your check-in. On-device notes use built-in guidance based on your selected pace.
						</InfoTip>
					</div>
					<span
						className={
							"sourceChip" +
							(noteIsAi ? " ai" : "") +
							(noteIsLoading ? " loading" : "")
						}
						aria-label="Note source"
					>
						{noteSource}
					</span>
				</div>
				{!!noteTitle && <p className="personalNoteTitle">{noteTitle}</p>}
				{!!noteBody && (
					<p className={"personalNoteBody" + (!noteExpanded ? " clamp" : "")}>{noteBody}</p>
				)}
				{canToggleNote && (
					<div className="personalNoteActions">
						<button
							type="button"
							className="linkBtn"
							onClick={() => setNoteExpanded((v) => !v)}
							aria-expanded={noteExpanded}
						>
							{noteExpanded ? "Show less" : "Read more"}
						</button>
					</div>
				)}
				{aiNote?.status === "error" && !!aiNote?.error && (
					<div className="sub" style={{ marginTop: 8 }}>{aiNote.error}</div>
				)}
			</div>

			{myDay.length === 0 ? (
				<div className="hint">
					{emptyStateCopy.beforeCta}
					<button
						type="button"
						className="linkBtn"
						onClick={() => actions?.go?.("wheel")}
						aria-label="Open Pick (Activity Picker)"
					>
						Pick
					</button>
					{emptyStateCopy.afterCta}
				</div>
			) : (
				<div className="myDayScroll" aria-label="My Day tasks">
					<ul className="list" aria-label="My Day">
						{myDay.map((t) => (
							<li key={t.id} className={"item" + (t.done ? " done" : "") }>
								<label className="left itemMain">
									<input
										type="checkbox"
										checked={!!t.done}
										onChange={(e) => actions.toggleDone(t.id, e.target.checked)}
										aria-label={t.done ? "Mark not done" : "Mark done"}
									/>
									<span className="itemTextWrap">
										<span className="txt">{t.text}</span>
									</span>
								</label>
								<button
									type="button"
									className="btn small quiet"
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
