export function isPlusAiContext(aiContext) {
  return aiContext?.planId === "plus";
}

export function getAiBoardAccessError(aiContext) {
  return isPlusAiContext(aiContext) ? "" : "ai_board_plus_required";
}
