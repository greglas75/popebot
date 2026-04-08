import fs from 'fs';
import path from 'path';

/**
 * Create a directory symlink (Unix) or junction/copy fallback (Windows).
 */
export function createDirLink(target, linkPath) {
  if (process.platform !== 'win32') {
    fs.symlinkSync(target, linkPath);
    return;
  }
  // Junctions require absolute targets but don't require admin privileges
  const absoluteTarget = path.resolve(path.dirname(linkPath), target);
  try {
    fs.symlinkSync(absoluteTarget, linkPath, 'junction');
  } catch {
    fs.cpSync(absoluteTarget, linkPath, { recursive: true });
    console.log('    (copied — symlinks unavailable on this system)');
  }
}
