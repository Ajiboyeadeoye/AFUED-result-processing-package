// utils/stringUtils.js
export function capitalizeFirstLetter(str) {
  if (!str) return ""; // handle empty or null strings
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
