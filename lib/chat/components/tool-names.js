/**
 * Auto-generates display names from snake_case tool names.
 * Splits on underscores and capitalizes the first letter of each word.
 */
export function getToolDisplayName(toolName) {
  return toolName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
