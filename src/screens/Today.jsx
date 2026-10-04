import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Plus, X } from "lucide-react";
import InfoTip from "../components/InfoTip";
import { latestTaskFeedback } from "../lib/activityLearning.js";
import "../components/ActivityBoard.css";

export default function Today({ state, actions }) {
	const { dailyMessage, myDay } = state;
	const aiNote = state.aiDailyNote;
	const isPlus = !!state?.entitlements?.isPlus;
	const [noteExpanded, setNoteExpanded] = useState(false);
	const [customInput, setCustomInput] = useState("");
	const [showCustomInput, setShowCustomInput] = useState(false);
	const customInputRef = useRef(null);
	const customTriggerRef = useRef(null);
	const customWasOpenRef = useRef(false);
	const completed = myDay.filter(task => task.done).length;

	useEffect(() => {
		if (!isPlus) return;
		actions.ensureAiDailyNote?.(state.checkin, state.level, state.today);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isPlus]);

	useEffect(() => {
		if (!showCustomInput) {
			if (customWasOpenRef.current) customTriggerRef.current?.focus();
			customWasOpenRef.current = false;
			return;
		}
		customWasOpenRef.current = true;
		const timer = setTimeout(() => customInputRef.current?.focus(), 50);
		return () => clearTimeout(timer);
	}, [showCustomInput]);

	const noteIsAi = isPlus && aiNote?.status === "ready";
	const noteIsLoading = isPlus && aiNote?.status === "loading";
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
			<h2 className="myDayHeading">My Day</h2>
			<div className="sub">A little space for what matters today.</div>
			{myDay.length > 0 && <div className="daySummary">
				<progress value={completed} max={myDay.length} aria-label="Activities completed" />
				<span>{completed} of {myDay.length} complete</span>
			</div>}

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
								<ChevronDown size={18} className={"disclosureIcon" + (noteExpanded ? " open" : "")} aria-hidden="true" />
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
				<div className="dayEmpty">
					<h3>Your day, at your pace.</h3>
					<p>One small activity is a good place to start.</p>
					<button
						type="button"
						className="btn primary"
						onClick={() => actions?.go?.("wheel")}
						aria-label="Open Pick (Activity Picker)"
					>
						Find an activity <ArrowRight size={17} aria-hidden="true" />
					</button>
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
										aria-label={`${t.done ? "Mark not done" : "Mark done"}: ${t.text}`}
									/>
									<span className="itemTextWrap">
										<span className="txt">{t.text}</span>
									</span>
								</label>
								{t.done && <label className="activityOutcome">How was it?
									<select aria-label={`Feedback for ${t.text}`} value={latestTaskFeedback(state.events, t) || ""}
										onChange={event => { if (event.target.value) actions.recordActivityFeedback(t, event.target.value); }}>
										<option value="">Optional</option><option value="helped">It helped</option><option value="too_much">Too much today</option><option value="not_for_me">Not for me</option>
									</select>
								</label>}
								<button
									type="button"
									className="pickIcon"
									onClick={() => actions.removeTask(t.id)}
									aria-label={`Remove ${t.text}`}
									title="Remove activity"
								>
									<X size={18} aria-hidden="true" />
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
								title="Add task"
							>
								<Plus size={18} aria-hidden="true" />
							</button>
							<button
								type="button"
								className="btn small quiet customTaskCancel"
								onClick={() => { setShowCustomInput(false); setCustomInput(""); }}
								aria-label="Cancel"
								title="Cancel"
							>
								<X size={18} aria-hidden="true" />
							</button>
						</div>
					) : (
						<button
							type="button"
							className="customTaskTrigger"
							ref={customTriggerRef}
							onClick={() => setShowCustomInput(true)}
							aria-label="Add your own task"
						>
							<Plus size={18} aria-hidden="true" />
							Add your own
						</button>
					)}
				</div>
			)}
		</div>
	);
}
