export function shouldShowAttunePrimer(state) {
  const hasCheckedIn = state?.checkedInToday === true;
  const hasPickedStep = Array.isArray(state?.myDay) && state.myDay.length > 0;
  return !(hasCheckedIn && hasPickedStep);
}
