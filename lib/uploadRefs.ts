export type UploadRef = { fullMatch: string; userId: string; filename: string };

const UPLOAD_URL_RE =
  /\/api\/uploads\/([0-9a-fA-F-]{36})\/([0-9a-fA-F-]{36}\.(?:png|jpe?g|gif|webp|pdf|txt|csv|json|md|zip|docx?|xlsx?|pptx?))/g;

/** Finds every /api/uploads/<userId>/<filename> reference in a note's content. */
export function findUploadRefs(content: string): UploadRef[] {
  const refs: UploadRef[] = [];
  const re = new RegExp(UPLOAD_URL_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    refs.push({ fullMatch: m[0], userId: m[1], filename: m[2] });
  }
  return refs;
}
