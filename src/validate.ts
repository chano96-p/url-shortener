const MAX_URL_LENGTH = 2048;

export function isValidUrl(input: string): boolean {
  if (input.length > MAX_URL_LENGTH) return false;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}
