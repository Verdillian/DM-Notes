export type PendingNote = {
  localId: string;
  content: string;
  threadId: string;
  createdAt: number;
};

function storageKey(userId: string): string {
  return `dm-notes:pending-notes:${userId}`;
}

export function loadPendingQueue(userId: string): PendingNote[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PendingNote =>
        !!p &&
        typeof p.localId === "string" &&
        typeof p.content === "string" &&
        typeof p.threadId === "string" &&
        typeof p.createdAt === "number"
    );
  } catch {
    return [];
  }
}

export function savePendingQueue(userId: string, queue: PendingNote[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(queue));
  } catch {
    // localStorage unavailable (private browsing, full quota) — queue just won't survive a reload
  }
}
