export function getEntitlements(inputPlan) {
  const plan = inputPlan === "plus" ? "plus" : "free";
  const isPlus = plan === "plus";

  return {
    plan,
    isPlus,
    darkMode: true,
    noteMemory: isPlus,
    smartPick: isPlus,
    momentumExact: isPlus,
    multiWeekHistory: isPlus,
    patternCallouts: isPlus,
    deepInsights: isPlus,
  };
}
