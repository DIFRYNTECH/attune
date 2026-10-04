import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Check, ChevronDown, Clock3, Plus, RotateCcw, Shuffle, SlidersHorizontal, X } from "lucide-react";
import ActivityDialog from "./Dialog.jsx";
import "./ActivityBoard.css";
import { activityDetails, activityKey, activityReason, isActivityEligible, sameActivity } from "../lib/activityPolicy.js";
import { learningPreferences, isActivitySuppressed } from "../lib/activityLearning.js";
import { currentActivityDefinition } from "../lib/activityState.js";

function ActivityOption({ activity, state, actions, preferences, featured, open, add }) {
  const ref = useRef(null);
  const details = activityDetails(activity);
  const taken = (state.myDay || []).some(task => sameActivity(task, activity));
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.6)) {
        actions.recordActivityViewed?.(activity);
        observer.disconnect();
      }
    }, { threshold: 0.6 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [activity, actions]);
  return (
    <article ref={ref} className={"pickOption" + (featured ? " featured" : "")}>
      <div className="pickOptionMeta"><span>{activity.domain || "Small step"}</span><span><Clock3 size={14} aria-hidden="true" />{details.timeLabel}</span></div>
      <button type="button" className="pickOptionTitle" onClick={() => open(activity)}>{activity.text}</button>
      {featured && <p className="pickReason">{activityReason(activity, { ...state.checkin, pace: state.level }, preferences)}</p>}
      <div className="pickOptionBottom">
        <span>{taken ? "In My Day" : details.setup}</span>
        <button type="button" className="pickIcon" title={taken ? "View activity" : "Add to My Day"}
          disabled={!taken && state.myDay?.length >= 10}
          aria-label={taken ? `View ${activity.text}` : `Add ${activity.text} to My Day`}
          onClick={() => taken ? open(activity) : add(activity)}>{taken ? <Check size={18} /> : <Plus size={18} />}</button>
      </div>
    </article>
  );
}

export default function ActivityBoard({ state, actions, loading = false }) {
  const [selected, setSelected] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [feedback, setFeedback] = useState("not_today");
  const constraints = state.checkin?.activityConstraints || {};
  const preferences = useMemo(() => learningPreferences(state.events), [state.events]);
  const board = (state.boardAssigned || []).filter(activity =>
    isActivityEligible(activity, state.checkin, state.level) && !isActivitySuppressed(activity, preferences));
  const count = state.myDay?.length || 0;
  const cap = state.myDayCap === 10 ? 10 : 5;

  useEffect(() => { actions.preparePickBoard?.(); }, [state.options, actions]);

  function open(activity) {
    setFeedback("not_today");
    setSelected(currentActivityDefinition(activity));
  }
  function add(activity, confirmed = false) {
    if (count >= 10 || (state.myDay || []).some(task => sameActivity(task, activity))) return;
    if (!isActivityEligible(activity, state.checkin, state.level) || isActivitySuppressed(activity, preferences)) return;
    if (count >= cap && !confirmed) {
      setSelected(null);
      setPending(activity);
      return;
    }
    if (confirmed) actions.setMyDayCap?.(10);
    actions.addOption(activity);
    setSelected(null);
    setPending(null);
  }
  const selectedTaken = selected && (state.myDay || []).some(task => sameActivity(task, selected));
  const selectedSaved = selected && preferences.favorites.some(task => sameActivity(task, selected));
  const selectedEligible = selected && isActivityEligible(selected, state.checkin, state.level) && !isActivitySuppressed(selected, preferences);
  const details = selected ? activityDetails(selected) : null;

  return (
    <div className="pickExperience">
      <div className="pickToolbar">
        <span className="pickCount" aria-live="polite">{count} in My Day</span>
        <div className="pickTools">
          <button type="button" className="pickIcon" title="Activity preferences" aria-label="Activity preferences"
            aria-expanded={showFilters} onClick={() => setShowFilters(value => !value)}><SlidersHorizontal size={19} /></button>
          <button type="button" className="pickIcon" title="Saved and hidden activities" aria-label="Saved and hidden activities"
            onClick={() => setLibraryOpen(true)}><Bookmark size={19} /></button>
          <button type="button" className="pickIcon" title="Surprise me" aria-label="Surprise me" disabled={!board.length}
            onClick={() => open(board[Math.floor(Math.random() * board.length)])}><Shuffle size={19} /></button>
        </div>
      </div>
      {showFilters && <fieldset className="pickFilters">
        <legend>For today</legend>
        <label>Time available
          <select value={constraints.maxMinutes || 0} onChange={event => actions.setActivityConstraints({ maxMinutes: Number(event.target.value) })}>
            <option value={0}>Any duration</option><option value={5}>Up to 5 minutes</option><option value={10}>Up to 10 minutes</option><option value={20}>Up to 20 minutes</option>
          </select>
        </label>
        <label className="pickCheck"><input type="checkbox" checked={!!constraints.indoorsOnly} onChange={event => actions.setActivityConstraints({ indoorsOnly: event.target.checked })} />Indoors only</label>
        <label className="pickCheck"><input type="checkbox" checked={!!constraints.seatedOnly} onChange={event => actions.setActivityConstraints({ seatedOnly: event.target.checked })} />No standing or walking</label>
      </fieldset>}
      {loading && <p className="pickStatus" role="status">Personalizing your suggestions...</p>}
      <div className="pickSectionHeading"><h3>A place to start</h3><span>For today</span></div>
      <div className="pickFeatured">
        {board.slice(0, 3).map(activity => <ActivityOption key={activityKey(activity)} {...{ activity, state, actions, preferences }} featured open={open} add={add} />)}
      </div>
      {!board.length && <div className="pickEmpty" role="status">
        <p>No activities match these choices right now.</p>
        <button type="button" className="btn ghost" onClick={() => setShowFilters(true)}>Adjust today's preferences</button>
      </div>}
      {board.length > 3 && <>
        <button type="button" className="pickMore" aria-expanded={showMore} onClick={() => setShowMore(value => !value)}>
          {showMore ? "Fewer options" : "More options"}<ChevronDown size={18} className={showMore ? "open" : ""} />
        </button>
        {showMore && <div className="pickAlternatives">
          {board.slice(3).map(activity => <ActivityOption key={activityKey(activity)} {...{ activity, state, actions, preferences }} open={open} add={add} />)}
        </div>}
      </>}
      {selected && <ActivityDialog title="Activity details" onClose={() => setSelected(null)} footer={
        <button type="button" className="btn primary" disabled={selectedTaken || !selectedEligible || count >= 10} onClick={() => add(selected)}>
          {selectedTaken ? <Check size={17} /> : <Plus size={17} />}{selectedTaken ? "In My Day" : !selectedEligible ? "Not a fit for today" : count >= 10 ? "My Day is full" : "Add to My Day"}
        </button>
      }>
        <div className="pickDetailMeta"><span>{selected.domain || "Small step"}</span>
          <button type="button" className={"pickIcon" + (selectedSaved ? " selected" : "")} title={selectedSaved ? "Unsave activity" : "Save activity"}
            aria-label={selectedSaved ? "Unsave activity" : "Save activity"} aria-pressed={!!selectedSaved}
            onClick={() => actions.setActivityPreference(selected, "favorite", !selectedSaved)}><Bookmark size={20} fill={selectedSaved ? "currentColor" : "none"} /></button>
        </div>
        <h3 className="pickDetailTitle">{selected.text}</h3>
        <p className="pickReason">{activityReason(selected, { ...state.checkin, pace: state.level }, preferences)}</p>
        <dl className="pickDetails"><div><dt>Time</dt><dd>{details.timeLabel}</dd></div>{details.setup && <div><dt>What you need</dt><dd>{details.setup}</dd></div>}</dl>
        {selectedTaken ? <p className="pickStatus"><Check size={17} />Already in My Day</p> :
          <div className="pickFeedback"><label htmlFor="pickFeedbackReason">Another option?</label>
            <select id="pickFeedbackReason" value={feedback} onChange={event => setFeedback(event.target.value)}>
              <option value="not_today">Not today</option><option value="too_much">Too much today</option><option value="not_for_me">Not for me</option>
            </select>
            <button type="button" className="btn ghost" onClick={() => { actions.recordActivityFeedback(selected, feedback, true); setSelected(null); }}>
              <RotateCcw size={16} />Replace this activity
            </button>
          </div>}
      </ActivityDialog>}
      {pending && <ActivityDialog title="Make room for one more?" onClose={() => setPending(null)}>
        <p>You have five activities in My Day. There is room for up to ten, but no need to fill it.</p>
        <div className="pickDialogActions"><button className="btn ghost" type="button" onClick={() => setPending(null)}>Keep it at five</button>
          <button className="btn primary" type="button" onClick={() => add(pending, true)}>Add this activity</button></div>
      </ActivityDialog>}
      {libraryOpen && <ActivityDialog title="Your activities" onClose={() => setLibraryOpen(false)}>
        <h3>Saved</h3>
        {!preferences.favorites.length && <p className="pickReason">No saved activities yet.</p>}
        <ul className="pickLibrary">{preferences.favorites.map(activity => <li key={activityKey(activity)}>
          <button type="button" className="pickLibraryTitle" onClick={() => { setLibraryOpen(false); open(activity); }}>{activity.text}</button><button type="button" className="pickIcon" aria-label={`Unsave ${activity.text}`} title="Unsave activity" onClick={() => actions.setActivityPreference(activity, "favorite", false)}><X size={18} /></button>
        </li>)}</ul>
        <h3>Hidden</h3>
        {!preferences.hidden.length && <p className="pickReason">No hidden activities.</p>}
        <ul className="pickLibrary">{preferences.hidden.map(activity => <li key={activityKey(activity)}>
          <span>{activity.text}</span><button type="button" className="pickIcon" aria-label={`Restore ${activity.text}`} title="Restore activity" onClick={() => actions.setActivityPreference(activity, "hidden", false)}><RotateCcw size={18} /></button>
        </li>)}</ul>
      </ActivityDialog>}
    </div>
  );
}
