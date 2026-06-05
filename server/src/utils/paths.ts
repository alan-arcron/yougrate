import path from "path";

/**
 * True if `p` is a safe relative path that cannot escape a base directory.
 * Rejects absolute paths, parent traversal (`..`), null bytes, and
 * Windows-style drive/absolute forms.
 */
export function isSafeRelativePath(p: string): boolean {
  if (!p || typeof p !== "string") return false;
  if (p.includes("\0")) return false;
  if (path.isAbsolute(p)) return false;
  // Reject Windows drive letters / UNC just in case.
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\")) return false;

  const segments = p.split(/[\\/]/);
  if (segments.some((seg) => seg === "..")) return false;

  const normalized = path.normalize(p);
  if (normalized.startsWith("..")) return false;

  return true;
}

/**
 * Join `relPath` onto `base`, returning the absolute path only if it stays
 * inside `base`. Returns null if the path would escape (traversal attempt).
 */
export function safeJoin(base: string, relPath: string): string | null {
  if (!isSafeRelativePath(relPath)) return null;
  const baseResolved = path.resolve(base);
  const full = path.resolve(baseResolved, relPath);
  if (full !== baseResolved && !full.startsWith(baseResolved + path.sep)) {
    return null;
  }
  return full;
}
