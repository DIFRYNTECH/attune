import { useEffect, useRef, useState } from "react";
import AttunePrimer from "../components/AttunePrimer";
import InfoTip from "../components/InfoTip";
import { shouldShowAttunePrimer } from "../lib/attunePrimer";
import { getTodayEmptyStateCopy } from "../lib/personalization";

export default function Today({ state, actions }) {
	const { dailyMessage, myDay } = state;
	const aiNote = state.aiDailyNote;
	const [noteExpanded, setNoteExpanded] = useState(false);
	const [customInput, setCustomInput] = useState("");
	const [showCustomInput, setShowCustomInput] = useState(false);
	const customInputRef = useRef(null);
	const emptyStateCopy = getTodayEmptyStateCopy(state?.profile?.name);
	const showPrimer = shouldShowAttunePrimer(state);

	useEffect(() => {
		actions.ensureAiDailyNote?.(state.checkin, state.level, state.today);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (showCustomInput) {
			setTimeout(() => customInputRef.current?.focus(), 50);
		}
	}, [showCustomInput]);

	const noteIsAi = aiNote?.status === "ready";
	const noteIsLoading = aiNote?.status === "loading";
	const noteTitle = noteIsAi ? aiNote.title : dailyMessage?.a;
	const noteBody = noteIsAi ? aiNote.body : dailyMessage?.b;
	const noteSource = noteIsLoading ? "Personalizing…" : noteIsAi ? "AI" : "On-device";
	const canToggleNote = (noteBody || "").length > 180;
	const togglePersonalNote = () => {
		if (canToggleNote) setNoteExpanded((v) => !v);
	};

	const atCap = (myDay?.length || 0) >= 10;

	function submitCustomTask() {
		const text = customInput.trim();
		if (!text) return;
		actions.addCustomTask(text);
		setCustomInput("");
		setShowCustomInput(false);
	}

	return (
		<div className="card myDayCard">
			<h2 className="myDayHeading">🧭 My Day</h2>
			<div className="sub">Aim for 2-5 tasks. You can add up to 10 if you’d like.</div>

			{showPrimer ? <AttunePrimer compact /> : null}

			<div
				className={"result personalNote" + (canToggleNote ? " tappable" : "")}
				style={{ marginBottom: 12 }}
				onClick={(e) => {
					if (e.target instanceof Element && e.target.closest("button, a, input, select, textarea, label")) return;
					togglePersonalNote();
				}}
				onKeyDown={(e) => {
					if (!canToggleNote) return;
					if (e.target !== e.currentTarget) return;
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						togglePersonalNote();
					}
				}}
				role={canToggleNote ? "button" : undefined}
				tabIndex={canToggleNote ? 0 : undefined}
				aria-expanded={canToggleNote ? noteExpanded : undefined}
			>
				<div className="personalNoteTop">
					<div style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
						<div className="resultTitle" style={{ margin: 0 }}>
							Personal note
						</div>
						<InfoTip label="About Personal note">
							AI notes are generated from your check-in. On-device notes use built-in guidance based on your selected pace.
						</InfoTip>
					</div>
					<div>
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
						{canToggleNote ? (
							<span className={"personalNoteExpandCue" + (noteExpanded ? " open" : "")} aria-hidden="true">
								<span className={"checkinNoteChevron" + (noteExpanded ? " open" : "")} aria-hidden="true" />
							</span>
						) : null}
					</div>
				</div>
				{!!noteTitle && <p className="personalNoteTitle">{noteTitle}</p>}
				{!!noteBody && <p className={"personalNoteBody" + (!noteExpanded ? " clamp" : "")}>{noteBody}</p>}
				{aiNote?.status === "error" && !!aiNote?.error && (
					<div className="sub" style={{ marginTop: 8 }}>{aiNote.error}</div>
				)}
			</div>

			{myDay.length === 0 && (
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
			)}

			{myDay.length > 0 && (
				<div className="myDayScroll" aria-label="My Day tasks">
					<ul className="list" aria-label="My Day">
						{myDay.map((t) => (
							<li key={t.id} className={"item" + (t.done ? " done" : "")}>
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

			{!atCap && (
				<div className="customTaskRow">
					{showCustomInput ? (
						<div className="customTaskInputWrap">
							<input
								ref={customInputRef}
								className="customTaskInput"
								type="text"
								value={customInput}
								maxLength={120}
										placeholder="Type a task…"
								onChange={(e) => setCustomInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") { e.preventDefault(); submitCustomTask(); }
									if (e.key === "Escape") { setShowCustomInput(false); setCustomInput(""); }
								}}
								aria-label="Add your own task"
							/>
							<button
								type="button"
								className="btn small customTaskAdd"
								onClick={submitCustomTask}
								disabled={!customInput.trim()}
								aria-label="Add task"
							>
								Add
							</button>
							<button
								type="button"
								className="btn small quiet customTaskCancel"
								onClick={() => { setShowCustomInput(false); setCustomInput(""); }}
								aria-label="Cancel"
							>
								Cancel
							</button>
						</div>
					) : (
						<button
							type="button"
							className="customTaskTrigger"
							onClick={() => setShowCustomInput(true)}
							aria-label="Add your own task"
						>
							<span className="customTaskTriggerIcon" aria-hidden="true">+</span>
							Add your own
						</button>
					)}
				</div>
			)}
		</div>
	);
}
