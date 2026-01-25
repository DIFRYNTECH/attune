import { TASKS } from "../data/tasks";
import { LEVELS } from "../data/levels";

export function prettyLevel(key){
  const lvl = LEVELS.find(l => l.key === key);
  return lvl ? `${lvl.emoji} ${lvl.name}` : key;
}

export function shuffle(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

export function suggestLevelFromCheckin({ mood, energy, body }){
  let suggested = "gentle";

  if(energy==="verylow" || mood==="low"){
    suggested = "rest";
    if(body==="manageable" && mood!=="low") suggested = "gentle";
  }else if(energy==="low"){
    suggested = (body==="tender" || mood==="low") ? "gentle" : "steady";
  }else if(energy==="okay"){
    suggested = (mood==="good" && body==="manageable") ? "capable" : "steady";
  }

  return suggested;
}

export function generateOptions(level){
  const pool = TASKS[level] || TASKS.gentle;
  return shuffle(pool).slice(0,10).map(t => ({ text: t, level }));
}

// Weekly archetype logic (same as your HTML, just as pure function)
export function weekArchetypeCopy(type){
  switch(type){
    case "Recovering Week":
      return "This week had stops and starts. What mattered most is that you returned. Coming back is a form of strength.";
    case "Resting Week":
      return "This week asked for rest. That’s not a step back — it’s care. Nothing needed fixing here.";
    case "Gentle Week":
      return "You chose small, supportive moments. Those choices matter more than they look. This was a kind way to move through the week.";
    case "Steady Week":
      return "You found a rhythm that worked. Not rushed. Not forced. Just enough, at the right pace.";
    case "Capable Week":
      return "You leaned into what you could handle. That confidence came from listening to yourself. It showed.";
    case "Brave Week":
      return "You chose to stretch, even gently. That takes courage. You showed trust in yourself this week.";
    default:
      return "We’ll meet you where you are again next week.";
  }
}

export function computeWeekArchetype(weekRecords){
  // weekRecords: array of 7 items {checkedIn, level, tasksAdded, tasksDone}

  // Rule 1: Recovering Week (gap >=2 then return)
  let gap = 0;
  let hadReturnAfterGap = false;

  for(const d of weekRecords){
    if(!d.checkedIn){
      gap++;
    }else{
      if(gap >= 2) hadReturnAfterGap = true;
      gap = 0;
    }
  }
  if(hadReturnAfterGap) return "Recovering Week";

  const presentDays = weekRecords.filter(d=>d.checkedIn).length;
  if(presentDays <= 1) return "Resting Week";

  const levelsChosen = weekRecords.filter(d=>d.checkedIn && d.level).map(d=>d.level);
  const counts = {rest:0,gentle:0,steady:0,capable:0,brave:0};
  for(const l of levelsChosen) if(counts[l] !== undefined) counts[l]++;

  const total = levelsChosen.length || 1;
  const restGentleRatio = (counts.rest + counts.gentle) / total;
  const steadyRatio = counts.steady / total;
  const capableRatio = counts.capable / total;
  const braveRatio = counts.brave / total;

  const taskDays = weekRecords.filter(d=>d.tasksAdded > 0).length;

  if(presentDays <= 2 && restGentleRatio >= 0.6) return "Resting Week";
  if(restGentleRatio >= 0.6 && capableRatio < 0.2 && braveRatio < 0.15) return "Gentle Week";
  if(presentDays >= 4 && (steadyRatio >= 0.35 || taskDays >= 3)) return "Steady Week";
  if(presentDays >= 5 && capableRatio >= 0.3 && taskDays >= 3) return "Capable Week";
  if(braveRatio >= 0.2 && presentDays >= 4) return "Brave Week";

  return "Gentle Week";
}
